const axios = require('axios');
const record = require('./shipmentRecord');

/**
 * UPS provider (UPS APIs — OAuth2 + Rating + Shipping + Tracking).
 *
 * Same 8-method contract as the other providers. Set UPS_MOCK_MODE=true
 * (the default until credentials exist) to run the flow without calling UPS.
 */
class UPSShippingService {
  constructor() {
    this.mock = process.env.UPS_MOCK_MODE !== 'false';
    this.baseUrl = (process.env.UPS_BASE_URL || 'https://onlinetools.ups.com').replace(/\/+$/, '');
    this.clientId = process.env.UPS_CLIENT_ID || '';
    this.clientSecret = process.env.UPS_CLIENT_SECRET || '';
    this.accountNumber = process.env.UPS_ACCOUNT_NUMBER || '';
    this.serviceCode = process.env.UPS_SERVICE_CODE || '03'; // 03 = UPS Ground
    this.client = axios.create({ baseURL: this.baseUrl, timeout: 30000 });
    this._token = null;
  }

  isConfigured() {
    return this.mock || (!!this.clientId && !!this.clientSecret);
  }

  async token() {
    if (this.mock) return 'mock-token';
    if (this._token && this._token.exp - 60000 > Date.now()) return this._token.access;

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await this.client.post('/security/v1/oauth/token',
      'grant_type=client_credentials',
      { headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
    this._token = {
      access: res.data.access_token,
      exp: Date.now() + Number(res.data.expires_in || 3600) * 1000,
    };
    return this._token.access;
  }

  async headers() {
    return { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' };
  }

  /** UPS wants addresses in its own nested shape. */
  upsAddress(a) {
    return {
      Name: (a.name || '').slice(0, 35),
      AttentionName: (a.name || '').slice(0, 35),
      Phone: { Number: a.phone || '' },
      Address: {
        AddressLine: [a.street, a.street2].filter(Boolean),
        City: a.city,
        StateProvinceCode: this.stateCode(a.state),
        PostalCode: String(a.postalCode || '').slice(0, 5),
        CountryCode: 'US',
      },
    };
  }

  /** UPS needs the 2-letter code; our forms store full state names. */
  stateCode(state) {
    const s = String(state || '').trim();
    if (s.length === 2) return s.toUpperCase();
    const map = {
      'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO',
      'Connecticut':'CT','Delaware':'DE','District of Columbia':'DC','Florida':'FL','Georgia':'GA',
      'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY',
      'Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN',
      'Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
      'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',
      'Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI',
      'South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
      'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
    };
    return map[s] || s.slice(0, 2).toUpperCase();
  }

  upsPackages(parcels) {
    return parcels.map(p => ({
      PackagingType: { Code: '02' }, // customer-supplied packaging
      Dimensions: {
        UnitOfMeasurement: { Code: 'IN' },
        Length: String(p.lengthIn), Width: String(p.widthIn), Height: String(p.heightIn),
      },
      PackageWeight: {
        UnitOfMeasurement: { Code: 'LBS' },
        Weight: String(p.weightLbs),
      },
    }));
  }

  // ---- Rates ---------------------------------------------------------------

  async calculateShippingRate(params = {}) {
    const parcels = params.parcels || record.buildParcels(params, params.product || {});
    const weight = record.totalWeight(parcels) || Number(params.weight || 1);
    const from = params.collection || params.from || {};
    const to = params.delivery || params.to || {};

    if (this.mock) {
      const total = Math.round((11.25 + weight * 1.4) * 100) / 100;
      return {
        success: true, currency: 'USD', provider: 'ups', rateId: null,
        serviceLevel: 'UPS Ground', breakdown: { base: 11.25, perLb: 1.4, weight },
        total, estimatedDays: '1-5', mock: true,
      };
    }

    const body = {
      RateRequest: {
        Shipment: {
          Shipper: { ...this.upsAddress(from), ShipperNumber: this.accountNumber },
          ShipFrom: this.upsAddress(from),
          ShipTo: this.upsAddress(to),
          Service: { Code: this.serviceCode },
          Package: this.upsPackages(parcels),
        },
      },
    };

    const res = await this.client.post('/api/rating/v2409/Rate', body, { headers: await this.headers() });
    const charge = res.data?.RateResponse?.RatedShipment?.[0]?.TotalCharges?.MonetaryValue
      ?? res.data?.RateResponse?.RatedShipment?.TotalCharges?.MonetaryValue;
    if (charge == null) throw new Error('UPS returned no rate for this route');

    return {
      success: true, currency: 'USD', provider: 'ups', rateId: null,
      serviceLevel: 'UPS Ground', breakdown: res.data?.RateResponse,
      total: Number(charge), estimatedDays: '1-5', mock: false,
    };
  }

  // ---- Create shipment -----------------------------------------------------

  async createShipmentForOrder(order) {
    const shipping = order.shippingInfo || order.shippingAddress || {};
    if (!shipping.fullName || !shipping.address || !shipping.city || !shipping.postalCode) {
      throw new Error('Incomplete shipping information. Required: fullName, address, city, postalCode');
    }

    const { product, seller } = await record.loadContext(order);
    const from = record.collectionAddress(order, product, seller);
    const to = record.deliveryAddress(order);
    const parcels = record.buildParcels(order, product);

    let trackingNumber, labelUrl = null, cost = null;

    if (this.mock) {
      trackingNumber = `1Z${Date.now().toString(36).toUpperCase()}`.slice(0, 18);
    } else {
      const body = {
        ShipmentRequest: {
          Shipment: {
            Description: (order.productTitle || 'Item').slice(0, 50),
            Shipper: { ...this.upsAddress(from), ShipperNumber: this.accountNumber },
            ShipFrom: this.upsAddress(from),
            ShipTo: this.upsAddress(to),
            PaymentInformation: {
              ShipmentCharge: { Type: '01', BillShipper: { AccountNumber: this.accountNumber } },
            },
            Service: { Code: this.serviceCode },
            Package: this.upsPackages(parcels),
          },
          LabelSpecification: {
            LabelImageFormat: { Code: 'GIF' },
            HTTPUserAgent: 'VeriSpine',
          },
        },
      };
      const res = await this.client.post('/api/shipments/v2409/ship', body, { headers: await this.headers() });
      const results = res.data?.ShipmentResponse?.ShipmentResults;
      trackingNumber = results?.ShipmentIdentificationNumber
        || results?.PackageResults?.[0]?.TrackingNumber
        || results?.PackageResults?.TrackingNumber;
      cost = results?.ShipmentCharges?.TotalCharges?.MonetaryValue ?? null;
      labelUrl = null; // UPS returns base64 label data, not a URL
      if (!trackingNumber) throw new Error('UPS: no tracking number returned');
    }

    await record.saveShipment(order, {
      trackingNumber, carrier: 'UPS', service: 'UPS Ground',
      cost, labelUrl, eventDescription: 'Shipping label created with UPS',
      isMock: this.mock,
    });

    return { success: true, trackingNumber, customerRef: order.id, carrier: 'UPS', labelUrl };
  }

  // ---- Tracking ------------------------------------------------------------

  async trackItems(trackingNumbers) {
    const arr = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const items = [];
    for (const tn of arr) {
      try { items.push(await this.trackOne(tn)); }
      catch (e) {
        console.warn('UPS track error for', tn, e.message);
        items.push({ trackingNumber: tn, currentStatus: 'Unknown', events: [], error: e.message });
      }
    }
    return { success: true, items };
  }

  async trackOne(trackingNumber) {
    if (this.mock) {
      return {
        trackingNumber, weight: 1,
        origin: { country: 'US', code: '' }, destination: { country: 'US', code: '' },
        characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'USD' } },
        events: [{ code: 'created', description: 'Shipping label created', office: '', officeCode: '', timestamp: new Date().toISOString(), status: 'Order Shipped' }],
        currentStatus: 'Order Shipped', lastUpdate: new Date().toISOString(),
      };
    }

    const res = await this.client.get(`/api/track/v1/details/${encodeURIComponent(trackingNumber)}`, {
      headers: { ...(await this.headers()), transId: String(Date.now()), transactionSrc: 'VeriSpine' },
    });
    const pkg = res.data?.trackResponse?.shipment?.[0]?.package?.[0];
    const raw = pkg?.activity || [];
    const events = raw.map(ev => ({
      code: ev.status?.type || '',
      description: ev.status?.description || '',
      office: [ev.location?.address?.city, ev.location?.address?.stateProvince].filter(Boolean).join(', '),
      officeCode: ev.location?.address?.postalCode || '',
      timestamp: `${ev.date || ''} ${ev.time || ''}`.trim(),
      status: this.mapStatus(ev.status?.description || ev.status?.type || ''),
    }));
    const last = events[0];
    return {
      trackingNumber, weight: Number(pkg?.weight?.weight) || 1,
      origin: { country: 'US', code: '' }, destination: { country: 'US', code: '' },
      characteristics: { express: false, exempt: false, insured: { amount: 0, currency: 'USD' } },
      events,
      currentStatus: last ? last.status : 'Order Shipped',
      lastUpdate: last ? last.timestamp : null,
    };
  }

  /** Map UPS activity text to app statuses. Return/exception checked first. */
  mapStatus(code) {
    const c = String(code || '').toLowerCase();
    if (c.includes('return')) return 'Returned to Sender';
    if (c.includes('exception') || c.includes('undeliverable')) return 'Delivery Failed';
    if (c.includes('delivered')) return 'Delivered';
    if (c.includes('out for delivery')) return 'Out for Delivery';
    if (c.includes('ready for pickup') || c.includes('held for pickup')) return 'Ready for Collection';
    if (c.includes('in transit') || c.includes('departed') || c.includes('arrived')) return 'In Transit';
    if (c.includes('origin scan') || c.includes('picked up') || c.includes('pickup')) return 'Collected';
    if (c.includes('label') || c.includes('order processed')) return 'Order Shipped';
    return 'Order Shipped';
  }

  // ---- Provider-difference no-ops -------------------------------------------
  async cancelShipment(trackingNumber, reason = 'Customer request') {
    if (this.mock) return { success: true, data: { mock: true } };
    try {
      await this.client.delete(`/api/shipments/v2409/void/cancel/${encodeURIComponent(trackingNumber)}`,
        { headers: await this.headers() });
      return { success: true, data: { voided: true, trackingNumber, reason } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  async markAsDelivered() {
    return { success: true, data: { note: 'UPS delivery status is carrier/webhook driven; no-op' } };
  }
  async updateMailItemEvent() {
    return { success: true, data: { note: 'UPS does not accept merchant-pushed events; no-op' } };
  }
  async generateTrackingNumber(customerRef) {
    return { success: true, customerRef, trackingNumber: null, deferred: true };
  }
  async submitMailItem() {
    throw new Error('submitMailItem is not used by UPS; use createShipmentForOrder');
  }
}

module.exports = new UPSShippingService();
