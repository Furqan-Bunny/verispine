const axios = require('axios');
const { admin, db } = require('../config/firebase');
const { getParcelDimensions } = require('../utils/parcelDimensions');
const rttRate = require('./rttRateService');

/**
 * RTT courier provider — RTT Generic API v1.15 (booking + tracking).
 *
 * Implements the SAME public contract as sapoShippingService / shiplogicShippingService so the
 * shippingService facade can dispatch to it: createShipmentForOrder, calculateShippingRate,
 * trackItems, cancelShipment, markAsDelivered, updateMailItemEvent, generateTrackingNumber,
 * submitMailItem.
 *
 * API (JSON): AddInstructionV2 (create consignment -> waybill), GetBulkStatusDetail +
 * UpdateBulkStatusDetail (status pull + ack). Auth = strAccountCode + strPIN in the request body.
 * Test https://m.rtt.co.za/ , Live https://api.rtt.co.za/ .
 *
 * Set RTT_MOCK_MODE=true to exercise the whole flow without calling the live API. RTT stays OFF
 * as an active provider until real credentials + the open items in the plan are confirmed.
 *
 * Verified against RTT Generic API spec v1.15:
 *   - intStreetCode = postal code: CONFIRMED — the spec's own AddInstructionV2 examples use
 *     1459 (Boksburg) and 8000 (Cape Town), i.e. postal codes.
 *   - AddInstructionV2 payload, parcel decimals (dLength/dWidth/dHeight/dWeight in cm/kg),
 *     aryCustomerReferenceNo=ORDER_NUMBER, GetBulkStatusDetail + UpdateBulkStatusDetail ack: all match.
 * STILL BLOCKED ON RTT (cannot be derived from the spec — RTT must supply per account):
 *   - intServiceLevel: a required RTT-assigned integer (spec examples 404/815; R005=Invalid service
 *     level). RTT_SERVICE_LEVEL=0 is a placeholder and WILL be rejected until RTT gives the real code.
 *   - RTT_BARCODE_PREFIX: the client barcode prefix RTT allocates.
 */
class RTTShippingService {
  constructor() {
    this.mock = process.env.RTT_MOCK_MODE === 'true';
    this.baseUrl = (process.env.RTT_BASE_URL || 'https://m.rtt.co.za').replace(/\/+$/, '');
    this.accountCode = process.env.RTT_ACCOUNT_CODE || '';
    this.pin = process.env.RTT_PIN || '';
    this.apiKey = process.env.RTT_API_KEY || '';
    this.serviceLevel = Number(process.env.RTT_SERVICE_LEVEL || 0);
    this.barcodePrefix = process.env.RTT_BARCODE_PREFIX || 'QS';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  }

  headers() {
    // Some RTT deployments gate the endpoint with an API key header in addition to the
    // account/PIN in the body. Sent when provided; harmless otherwise.
    return this.apiKey ? { 'x-api-key': this.apiKey, ApiKey: this.apiKey } : {};
  }

  isConfigured() {
    return this.mock || (!!this.accountCode && !!this.pin);
  }

  nowIso() {
    return new Date().toISOString();
  }

  // ---- Order enrichment ------------------------------------------------------
  // The payment pipeline passes a bare order (no seller/pickup attached), so fetch the product
  // (pickup address, suburb, weight, dimensions) and seller (contact) ourselves — this keeps the
  // RTT payload complete and valid regardless of the call site.
  async loadContext(order) {
    let product = null;
    if (order.productId && db) {
      try {
        const pdoc = await db.collection('products').doc(order.productId).get();
        if (pdoc.exists) product = pdoc.data();
      } catch (e) { console.warn('RTT: product fetch failed:', e.message); }
    }
    let seller = order.seller || null;
    if (!seller && order.sellerId && db) {
      try {
        const sdoc = await db.collection('users').doc(order.sellerId).get();
        if (sdoc.exists) seller = sdoc.data();
      } catch (e) { console.warn('RTT: seller fetch failed:', e.message); }
    }
    return { product: product || {}, seller: seller || {} };
  }

  // Build an RTT address structure (objPickupAddress / objDeliveryAddress).
  buildAddress({ company, street, suburb, city, postalCode, contactName, phone, email }) {
    const cell = String(phone || '').replace(/\s+/g, '');
    return {
      strCompanyName: (company || contactName || 'Quicksell').slice(0, 100),
      strAddressNo: 0,
      intAddressNoType: 'Street',
      strComplexName: '',
      strStreetName1: (street || '').slice(0, 100),
      strStreetName2: '',
      strSuburb: (suburb || '').slice(0, 100),
      strCity: (city || '').slice(0, 100),
      intCountry: 'SouthAfrica',
      intStreetCode: Number(postalCode) || 0, // postal code (confirmed by RTT spec examples 1459/8000)
      strContactName: (contactName || 'Customer').slice(0, 50),
      strTelNo1: cell.slice(0, 10),
      strTelNo2: '',
      strCellNo: cell.slice(0, 10), // compulsory — RTT last-mile uses this
      bSuccess: false,
      strEMail: email || '',
    };
  }

  // RTT parcel barcode: client prefix first (spec §7.2), max length 25 (spec §7.2.8). Cap the
  // order-id portion so prefix + id + "-n" never exceeds 25 chars (else R010/R900).
  buildBarcode(orderId, index, count) {
    const suffix = count > 1 ? `-${index + 1}` : '';
    const room = 25 - this.barcodePrefix.length - suffix.length;
    const idPart = String(orderId).replace(/[^A-Za-z0-9]/g, '').slice(0, Math.max(1, room));
    return `${this.barcodePrefix}${idPart}${suffix}`;
  }

  buildParcels(order, product) {
    const dims = getParcelDimensions(product && (product.dimensions || product.weight) ? product : { weight: order.weight || order.productWeight });
    const qty = Math.max(1, Number(order.quantity) || 1);
    const weight = Number(order.weight || order.productWeight || (product && product.weight) || 1);
    return Array.from({ length: qty }, (_, i) => ({
      strParcelBarcode: this.buildBarcode(order.id, i, qty),
      dLength: Number(dims.length),
      dWidth: Number(dims.width),
      dHeight: Number(dims.height),
      dWeight: weight,
      objParcelProducts: [{
        strProductCode: (order.productId || 'ITEM').slice(0, 255),
        strProductDescription: (order.productTitle || product.title || 'Item').slice(0, 200),
        strProductSerialNo: '',
        intQty: 1,
        strLineNo: '',
        dLength: Number(dims.length),
        dWidth: Number(dims.width),
        dHeight: Number(dims.height),
        dWeight: weight,
      }],
    }));
  }

  // ---- Rates (delegate to the existing RTT rate calculator) ------------------
  async calculateShippingRate(params) {
    // Keep all RTT rate logic in rttRateService; adapt to the standard shape.
    let originPostalCode = params.originPostalCode;
    let destPostalCode = params.destPostalCode;
    let dims = params.dimensions;
    let weightKg = params.weightKg;
    if (originPostalCode == null || destPostalCode == null) {
      const pickup = params.pickup || (params.collection || {});
      const del = params.shippingInfo || params.delivery || {};
      originPostalCode = originPostalCode ?? pickup.postalCode ?? pickup.code;
      destPostalCode = destPostalCode ?? del.postalCode ?? del.code;
      weightKg = weightKg ?? Number(params.weight || 1);
    }
    const r = rttRate.calculateRate({ originPostalCode, destPostalCode, weightKg: weightKg || 1, dimensions: dims });
    if (!r.serviceable) {
      return { success: false, provider: 'rtt', reason: r.reason };
    }
    return {
      success: true,
      currency: r.currency || 'ZAR',
      provider: 'rtt',
      rateId: null,
      serviceLevel: r.service,
      breakdown: r.breakdown || {},
      total: r.cost,
      estimatedDays: '2-3',
      mock: false,
    };
  }

  // ---- Create shipment (AddInstructionV2) ------------------------------------
  async createShipmentForOrder(order) {
    const shipping = order.shippingInfo || order.shippingAddress || {};
    if (!shipping.fullName || !shipping.address || !shipping.city || !shipping.postalCode) {
      throw new Error('Incomplete shipping information. Required: fullName, address, city, postalCode');
    }

    const { product, seller } = await this.loadContext(order);
    const pk = (product.shipping) || order.pickup || {};
    const sellerName = seller.businessName || seller.sellerProfile?.businessName
      || `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || seller.username || 'Quicksell Seller';

    const objPickupAddress = this.buildAddress({
      company: sellerName,
      street: pk.pickupAddress || pk.address || '',
      suburb: pk.pickupSuburb || pk.suburb || '',
      city: pk.pickupCity || pk.city || '',
      postalCode: pk.pickupPostalCode || pk.postalCode || seller.postalCode || '',
      contactName: sellerName,
      phone: seller.phone || seller.phoneNumber || '',
      email: seller.email || '',
    });

    const objDeliveryAddress = this.buildAddress({
      company: shipping.fullName,
      street: shipping.address,
      suburb: shipping.suburb || '',
      city: shipping.city,
      postalCode: shipping.postalCode,
      contactName: shipping.fullName,
      phone: shipping.phone || order.buyerPhone || '',
      email: shipping.email || order.buyerEmail || '',
    });

    const declaredValue = Number(order.amount || order.totalAmount || 0);
    const references = [{ intReferenceType: 'ORDER_NUMBER', strReferenceNo: String(order.id).slice(0, 20) }];
    if (order.invoiceNumber) references.push({ intReferenceType: 'INVOICE_NUMBER', strReferenceNo: String(order.invoiceNumber).slice(0, 20) });

    const payload = {
      strAccountCode: this.accountCode,
      strPIN: this.pin,
      objPickupAddress,
      objDeliveryAddress,
      intServiceLevel: this.serviceLevel,
      aryCustomerReferenceNo: references,
      strSpecialInstructions: '',
      aryParcels: this.buildParcels(order, product),
      weekendDelivery: false,
      lngInsuranceValue: declaredValue,
      booInsured: declaredValue > 0,
      dispatchDate: this.nowIso(),
      strStoreCode: '',
      strBranchCode: '',
      booIsCollection: false,
      intCollectionParcelCount: 0,
    };

    let trackingNumber, consignmentNo, submitResponse;
    if (this.mock) {
      trackingNumber = `RTTMOCK${Date.now()}`;
      consignmentNo = trackingNumber;
      submitResponse = { mock: true, resultCode: 'R000' };
    } else {
      const res = await this.client.post('/AddInstructionV2', payload, { headers: this.headers() });
      const data = (res.data && (res.data.data || res.data)) || {};
      const rc = this.resultCode(data);
      if (rc && rc !== 'R000') {
        throw new Error(`RTT AddInstructionV2 failed (${rc}): ${this.resultMessage(data) || 'see RTT return codes'}`);
      }
      trackingNumber = this.extractWaybill(data);
      consignmentNo = this.extractRef(data, ['CONSIGNMENT NO', 'CONSIGNMENT_NO', 'consignmentNo']) || trackingNumber;
      submitResponse = data;
      if (!trackingNumber) throw new Error('RTT: no waybill/consignment number returned');
    }

    if (db) {
      const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
      await db.collection('shipments').doc(order.id).set({
        orderId: order.id,
        productId: order.productId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        trackingNumber,
        customerRef: order.id,
        carrier: 'RTT',
        rttConsignmentNo: consignmentNo,
        status: 'shipped',
        currentStatus: 'Order Shipped',
        weight: Number(order.weight || order.productWeight || product.weight || 1),
        value: declaredValue,
        shippingCost: Number(order.shippingCost || (order.shipmentRate && order.shipmentRate.total) || 0),
        express: false,
        senderCity: objPickupAddress.strCity,
        senderProvince: pk.pickupProvince || pk.province || '',
        recipientCity: objDeliveryAddress.strCity,
        recipientProvince: shipping.province || '',
        createdAt: ts,
        updatedAt: ts,
        shippedAt: ts,
        events: [{
          code: 'created',
          status: 'Order Shipped',
          description: 'Consignment created with RTT',
          timestamp: this.nowIso(),
          office: 'Quicksell',
          officeName: 'Quicksell',
        }],
        isMock: this.mock,
      });
    }

    return { success: true, trackingNumber, customerRef: order.id, carrier: 'RTT', submitResponse };
  }

  // ---- Result parsing helpers ------------------------------------------------
  resultCode(data) {
    return data.resultCode || data.ResultCode || data.code || (Array.isArray(data.data) && data.data[0] && (data.data[0].resultCode || data.data[0].code)) || null;
  }
  resultMessage(data) {
    return data.message || data.Message || data.description || (Array.isArray(data.data) && data.data[0] && (data.data[0].message || data.data[0].description)) || '';
  }
  // Waybill / consignment number can arrive under various keys or as a reference entry.
  extractWaybill(data) {
    return data.waybill || data.Waybill || data.consignmentNo || data.ConsignmentNo
      || this.extractRef(data, ['CIT WAYBILL NO', 'WAYBILL', 'CONSIGNMENT NO'])
      || (data.data && data.data.waybill) || '';
  }
  extractRef(data, names) {
    const refs = data.references || data.aryReferences || (data.data && data.data.references) || [];
    if (Array.isArray(refs)) {
      for (const r of refs) {
        const desc = String(r.type || r.description || r.strDescription || '').toUpperCase();
        if (names.some(n => desc.includes(n.toUpperCase()))) return r.value || r.strReferenceNo || r.reference;
      }
    }
    return null;
  }

  // ---- Tracking (GetBulkStatusDetail + ack) ----------------------------------
  async trackItems(trackingNumbers) {
    const arr = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const items = [];
    for (const tn of arr) {
      try { items.push(await this.trackOne(tn)); }
      catch (e) {
        console.warn('RTT track error for', tn, e.message);
        items.push({ trackingNumber: tn, currentStatus: 'Unknown', events: [], error: e.message });
      }
    }
    return { success: true, items };
  }

  async trackOne(trackingNumber) {
    if (this.mock) {
      return {
        trackingNumber, weight: 1,
        origin: { country: 'ZA', code: '' }, destination: { country: 'ZA', code: '' },
        characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'ZAR' } },
        events: [{ code: 'created', description: 'Consignment created', office: '', officeCode: '', timestamp: this.nowIso(), status: 'Order Shipped' }],
        currentStatus: 'Order Shipped', lastUpdate: this.nowIso(),
      };
    }
    const body = {
      Accounts: [{ AccountNumber: this.accountCode, Pin: this.pin }],
      StartDate: new Date(Date.now() - 30 * 86400000).toISOString(),
      EndDate: new Date().toISOString(),
    };
    const res = await this.client.post('/GetBulkStatusDetail', body, { headers: this.headers() });
    const rows = (res.data && res.data.data) || [];
    // Flatten all events for this consignment (matched by cons_no).
    const events = [];
    const uniqueIds = [];
    for (const row of rows) {
      if (row.UniqueID) uniqueIds.push(row.UniqueID);
      for (const ev of (row.Events || [])) {
        if (String(ev.cons_no || '') !== String(trackingNumber) && String(row.cons_no || '') !== String(trackingNumber)) continue;
        events.push({
          code: String(ev.status || ''),
          description: String(ev.status || ''),
          office: '',
          officeCode: '',
          timestamp: ev.eventtime || '',
          status: this.mapStatus(ev.status || ''),
        });
      }
    }
    // Ack retrieval (non-fatal) so RTT doesn't resend the same batch.
    if (uniqueIds.length) {
      try {
        for (const id of uniqueIds) {
          await this.client.post('/UpdateBulkStatusDetail', {
            Accounts: [{ AccountNumber: this.accountCode, Pin: this.pin }], UniqueID: id, Processed: true,
          }, { headers: this.headers() });
        }
      } catch (e) { console.warn('RTT UpdateBulkStatusDetail ack failed:', e.message); }
    }
    const last = events[events.length - 1];
    return {
      trackingNumber,
      weight: 1,
      origin: { country: 'ZA', code: '' },
      destination: { country: 'ZA', code: '' },
      characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'ZAR' } },
      events,
      currentStatus: last ? last.status : 'Order Shipped',
      lastUpdate: last ? last.timestamp : null,
    };
  }

  /**
   * Map RTT status text/IDs (spec §11 Status Messages) to the customer-facing statuses used across
   * the app. Order matters: "RETURNED"/"REJECT"/"CANCEL" are checked BEFORE "DELIVERED" because the
   * spec has composite statuses like "DELIVERED - RETURNED TO SENDER" (888/999) which must NOT count
   * as a delivery. POD statuses count as delivered: 8 DELIVERED, 63 DELIVERED NOT VERIFIED,
   * 98 ENDORSED DELIVERY (POD endorsed), 500 POD SCANNED.
   */
  mapStatus(code) {
    const c = String(code || '').toUpperCase();
    if (c.includes('RETURNED')) return 'Returned to Sender';
    if (c.includes('REJECT')) return 'Delivery Failed';
    if (c.includes('CANCEL')) return 'Cancelled';
    if (c.includes('DELIVERED') || c.includes('ENDORSED') || c.includes('POD')) return 'Delivered';
    if (c.includes('OUT FOR DELIVERY') || c.includes('ON ROUTE FOR DELIVERY')) return 'Out for Delivery';
    if (c.includes('IN TRIP') || c.includes('IN CONTAINER') || c.includes('ON ROUTE')) return 'In Transit';
    if (c.includes('ON FLOOR') || c.includes('SCANNED INTO CAGE') || c.includes('CAGE')) return 'At Sorting Facility';
    if (c.includes('COLLECTED') || c.includes('COLLECTION ALLOC')) return 'Collected';
    if (c.includes('CREATED')) return 'Order Shipped';
    return 'Order Shipped';
  }

  // ---- Cancel ----------------------------------------------------------------
  async cancelShipment(trackingNumber, reason = 'Customer request') {
    // No cancel endpoint in the Generic API spec; cancellation is handled operationally by RTT.
    return { success: true, data: { note: 'RTT cancellation is handled operationally; no API cancel in the Generic spec', trackingNumber, reason } };
  }

  // ---- Provider-difference no-ops (RTT is booking-at-create + webhook/pull driven) ----
  async markAsDelivered(trackingNumber, signature) {
    return { success: true, data: { note: 'RTT delivery status is courier/webhook driven; no-op' } };
  }

  async updateMailItemEvent(trackingNumber, eventCode, additionalData = {}) {
    return { success: true, data: { note: 'RTT does not accept merchant-pushed events; no-op' } };
  }

  async generateTrackingNumber(customerRef) {
    // RTT assigns the waybill when the consignment is created (AddInstructionV2).
    return { success: true, customerRef, trackingNumber: null, deferred: true };
  }

  async submitMailItem() {
    throw new Error('submitMailItem is SAPO-specific; RTT uses createShipmentForOrder');
  }
}

module.exports = new RTTShippingService();
