const axios = require('axios');
const https = require('https');
const { admin, db, auth, storage } = require('../config/firebase');

// SAPO's production TLS certificate expired on 2021-05-29 and has not been renewed.
// We isolate the bypass to SAPO-only calls via a dedicated axios instance so that
// other outbound HTTPS traffic (Firebase, Resend, PayFast, etc.) still enforces cert validation.
const sapoClient = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

class SAPOShippingService {
  constructor() {
    // Environment configuration
    // Use production SAPO endpoints unless SAPO_MOCK_MODE is explicitly enabled,
    // because production credentials (tokens, OfficeCd) only work against prod.
    const useMock = process.env.SAPO_MOCK_MODE === 'true';
    this.isProduction = !useMock;

    // API URLs.
    // Production layout verified 2026-04-15 via live HTTP probes:
    //   TRN Manager only responds on :8080 (Node/Express).
    //   IPS Import + Track & Trace are served by IIS on the default HTTPS port
    //   (:443). Per Erwin's 2026-04-15 follow-up we keep those two port-less.
    this.baseUrls = {
      test: {
        tracking: 'http://apitst.postoffice.co.za:443',
        import: 'http://apitst.postoffice.co.za:8084',
        trace: 'http://apitst.postoffice.co.za:8084'
      },
      production: {
        tracking: 'https://apiprod.postoffice.co.za:8080',
        import: 'https://apiprod.postoffice.co.za',
        trace: 'https://apiprod.postoffice.co.za'
      }
    };

    // Get current environment URLs — always production unless mock mode
    const env = this.isProduction ? 'production' : 'test';
    this.urls = this.baseUrls[env];

    // IPS Import & Track and Trace token (query param auth)
    this.token = process.env.SAPO_API_TOKEN || '440ba5a2-8b80-4d4c-8903-eb60f3e170da';

    // TRN Manager token (Authorization header auth - different from IPS token)
    this.trnToken = process.env.SAPO_TRN_TOKEN || '5a9f970c-c5a4-4642-bd88-4d65216adb1b';

    // Client configuration (provided by SAPO - from email 28 Jan 2026)
    // OfficeCd: Originating office code assigned to client
    // UserFID: Unique user identifier for audit and tracking
    this.config = {
      officeCd: process.env.SAPO_OFFICE_CD || 'ZA60004',
      userFID: process.env.SAPO_USER_FID || '09690510',
      operatorCd: 'ZAA',        // South Africa operator code
      origCountryCd: 'ZA',      // Origin country - South Africa
      destCountryCd: 'ZA'       // Destination country - South Africa (domestic)
    };

    // Event codes mapping
    this.eventCodes = {
      RECEIVED: '78',          // Item received from customer (initial lodgement)
      POSTED: '1',             // Item posted / accepted
      ARRIVAL_SORT: '1254',    // Arrival at inward sorting center
      DEPARTURE_SORT: '1261',  // Departure from outward sorting center
      OUT_FOR_DELIVERY: '1259',// Item out for physical delivery
      DELIVERED: '37',         // Final delivery
      RETURN_TO_SENDER: '75',  // Return to sender
      CANCELLED: '15',         // Cancel item
      AT_DELIVERY: '32',       // Received at delivery office
      DELIVERY_FAILED: '36',   // Unsuccessful delivery attempt
      HANDOVER: '39',          // Handover to delivery
      AT_SORTING: '71',        // Received at sorting center
      ON_HOLD: '73'            // Hold item at delivery office
    };
  }

  /**
   * Generate SAPO tracking number
   * @param {string} customerRef - Customer reference number
   * @returns {Promise<Object>} Tracking number response
   */
  async generateTrackingNumber(customerRef) {
    const useMock = process.env.SAPO_MOCK_MODE === 'true';

    if (useMock) {
      console.log('SAPO: Using mock mode for tracking number generation');
      const mockTrackingNumber = `QS${Date.now().toString().slice(-10)}ZA`;
      return {
        success: true,
        customerRef: customerRef,
        trackingNumber: mockTrackingNumber,
        mock: true
      };
    }

    try {
      const url = `${this.urls.tracking}/api/trn-manager/gen`;

      const response = await sapoClient.post(url, {
        cust_ref: customerRef
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.trnToken
        }
      });

      return {
        success: true,
        customerRef: response.data.cust_ref_num || response.data['cust_ref_num '] || customerRef,
        trackingNumber: response.data.sapo_ref_num
      };
    } catch (error) {
      // Handle "Tracking Ref Already Allocated" — extract the existing tracking number
      const errMsg = error.response?.data?.error || '';
      const alreadyAllocated = errMsg.match(/Tracking Ref Already Allocated - (\w+)/);
      if (error.response?.status === 400 && alreadyAllocated) {
        console.log('SAPO TRN: Reusing already-allocated tracking number:', alreadyAllocated[1]);
        return {
          success: true,
          customerRef: customerRef,
          trackingNumber: alreadyAllocated[1]
        };
      }

      console.error('SAPO TRN Error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw new Error(`Failed to generate tracking number: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Submit mail item to SAPO
   * Follows IPS API Integration Specification V0.1
   * @param {Object} itemData - Complete item data including sender, recipient, and parcel info
   * @returns {Promise<Object>} Submission response
   */
  async submitMailItem(itemData) {
    const useMock = process.env.SAPO_MOCK_MODE === 'true';

    if (useMock) {
      console.log('SAPO: Using mock mode for mail item submission');
      console.log('SAPO Mock - Tracking:', itemData.trackingNumber);
      console.log('SAPO Mock - Recipient:', itemData.recipient?.name, itemData.recipient?.city);
      return {
        success: true,
        data: {
          MailItem: { Parcel: {} },
          status: 'submitted',
          trackingNumber: itemData.trackingNumber,
          message: 'Mock shipment created successfully'
        },
        mock: true
      };
    }

    try {
      const url = `${this.urls.import}/IPSAPIService/ImportService.svc/rest/Mailitem?token=${this.token}`;

      // Format weight to 3 decimal places as per SAPO spec (Decimal 5,3)
      const formattedWeight = parseFloat(itemData.weight || 1).toFixed(3);

      // Calculate dutiable value (15% of item value for customs)
      const itemValue = parseFloat(itemData.value) || 100;
      const dutiableValue = (itemValue * 0.15).toFixed(2);

      // Format date as ISO string (SAPO expects: "2020-08-11T22:05:00")
      const eventDate = new Date().toISOString().split('.')[0];

      // Minimal payload — verified working against SAPO production on 2026-04-21/22.
      // SAPO's Import Service returns 500 with extended fields (Parcel, Value, etc.),
      // so we send only the required minimum that returns 200 OK.
      const payload = {
        ItemId: itemData.trackingNumber,
        ItemWeight: formattedWeight,
        ClassCd: 'C',
        Content: 'M',
        OperatorCd: this.config.operatorCd,
        OrigCountryCd: this.config.origCountryCd,
        DestCountryCd: this.config.destCountryCd,
        PostalStatusFcd: 'MINL',

        Addressee: {
          Name: this.sanitizeString(itemData.recipient.name, 35),
          Address: this.sanitizeString(itemData.recipient.address, 105),
          City: this.sanitizeString(itemData.recipient.city, 35),
          Postcode: this.sanitizeString(itemData.recipient.postalCode, 8),
          Country: 'ZA'
        },

        Sender: {
          Name: this.sanitizeString(itemData.sender.name, 35),
          Address: this.sanitizeString(itemData.sender.address, 105),
          City: this.sanitizeString(itemData.sender.city, 35),
          Postcode: this.sanitizeString(itemData.sender.postalCode, 8),
          Country: 'ZA'
        },

        ItemEvents: [
          {
            TNCd: this.eventCodes.RECEIVED,
            Date: eventDate,
            OfficeCd: this.config.officeCd,
            UserFID: this.config.userFID,          // 09690510 - Our user ID
            ConditionCd: '30'                      // Condition code
          }
        ]
      };

      console.log('SAPO: Submitting mail item:', itemData.trackingNumber);

      const response = await sapoClient.post(url, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      console.log('SAPO: Mail item submitted successfully');

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('SAPO IPS Import Error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw new Error(`Failed to submit mail item: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Sanitize string to meet SAPO field length requirements
   * @param {string} str - Input string
   * @param {number} maxLength - Maximum allowed length
   * @returns {string} Sanitized string
   */
  sanitizeString(str, maxLength) {
    if (!str) return '';
    return String(str).trim().substring(0, maxLength);
  }

  /**
   * Sanitize phone number for SAPO format
   * @param {string} phone - Phone number
   * @returns {string} Formatted phone number
   */
  sanitizePhone(phone) {
    if (!phone) return '';
    // Remove all non-numeric characters except +
    let cleaned = String(phone).replace(/[^\d+]/g, '');
    // Ensure max 36 characters
    return cleaned.substring(0, 36);
  }

  /**
   * Update mail item with new event
   * @param {string} trackingNumber - SAPO tracking number
   * @param {string} eventCode - Event code to post
   * @param {Object} additionalData - Additional event data
   * @returns {Promise<Object>} Update response
   */
  async updateMailItemEvent(trackingNumber, eventCode, additionalData = {}) {
    try {
      const url = `${this.urls.import}/IPSAPIService/ImportService.svc/rest/Mailitem?token=${this.token}`;
      
      const payload = {
        ItemId: trackingNumber,
        ClassCd: 'C',
        Content: 'M',
        OperatorCd: this.config.operatorCd,
        OrigCountryCd: this.config.origCountryCd,
        DestCountryCd: this.config.destCountryCd,
        PostalStatusFcd: eventCode === this.eventCodes.CANCELLED ? 'MIRT' : 'MINL',
        ItemEvents: [
          {
            TNCd: eventCode,
            Date: new Date().toISOString(),
            OfficeCd: this.config.officeCd,
            UserFID: this.config.userFID,
            ConditionCd: '30',
            ...additionalData
          }
        ]
      };

      // Add non-delivery reason for cancellation
      if (eventCode === this.eventCodes.CANCELLED) {
        payload.ItemEvents[0].NonDeliveryReason = '58';
        payload.ItemEvents[0].NonDeliveryMeasure = 'E';
      }

      const response = await sapoClient.post(url, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error updating mail item:', error.response?.data || error.message);
      throw new Error('Failed to update mail item');
    }
  }

  /**
   * Track mail items
   * @param {string|Array} trackingNumbers - Single or multiple tracking numbers
   * @returns {Promise<Object>} Tracking information
   */
  async trackItems(trackingNumbers) {
    try {
      const ids = Array.isArray(trackingNumbers) ? trackingNumbers.join(',') : trackingNumbers;
      const url = `${this.urls.trace}/IPSAPIService/TrackAndTraceService.svc/rest/Mailitems`;
      
      const response = await sapoClient.get(url, {
        params: {
          ids: ids,
          lang: 'EN',
          token: this.token
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Check for errors in response
      if (response.data.Errors && response.data.Errors.length > 0) {
        throw new Error(response.data.Errors[0]);
      }

      // Process and format tracking results
      const results = response.data.Results || [];
      const formattedResults = results.map(result => this.formatTrackingResult(result));

      return {
        success: true,
        items: formattedResults
      };
    } catch (error) {
      console.error('Error tracking items:', error.response?.data || error.message);
      throw new Error('Failed to track items');
    }
  }

  /**
   * Format tracking result for easier consumption
   * @param {Object} result - Raw tracking result from SAPO
   * @returns {Object} Formatted tracking information
   */
  formatTrackingResult(result) {
    const operationalItems = result.OperationalMailitems || [];
    const firstItem = operationalItems[0] || {};
    
    const events = firstItem.Events || [];
    const formattedEvents = events.map(event => ({
      code: event.IPSEventType?.Code,
      description: event.IPSEventType?.Name,
      office: event.EventOffice?.Name,
      officeCode: event.EventOffice?.Code,
      timestamp: event.LocalDateTime,
      status: this.mapEventCodeToStatus(event.IPSEventType?.Code)
    }));

    return {
      trackingNumber: result.Fid,
      weight: firstItem.Weight,
      origin: {
        country: firstItem.OrigCountry?.Name,
        code: firstItem.OrigCountry?.Code
      },
      destination: {
        country: firstItem.DestCountry?.Name,
        code: firstItem.DestCountry?.Code
      },
      characteristics: {
        express: firstItem.Characteristics?.ExpressIndicator || false,
        exempt: firstItem.Characteristics?.ExemptIndicator || false,
        insured: {
          amount: firstItem.Characteristics?.InsuredMoney?.Amount || 0,
          currency: firstItem.Characteristics?.InsuredMoney?.Currency || 'USD'
        }
      },
      events: formattedEvents,
      currentStatus: this.determineCurrentStatus(formattedEvents),
      lastUpdate: formattedEvents[0]?.timestamp || null
    };
  }

  /**
   * Map event code to customer-friendly status
   * @param {string} eventCode - SAPO event code
   * @returns {string} Customer status
   */
  mapEventCodeToStatus(eventCode) {
    const statusMap = {
      '78': 'Order Shipped',
      '1':  'Accepted at Post Office',
      '1254': 'Arrived at Sorting Center',
      '1261': 'Departed Sorting Center',
      '1259': 'Out for Delivery',
      '15': 'Order Cancelled',
      '32': 'At Delivery Hub',
      '36': 'Delivery Attempted',
      '37': 'Delivered',
      '39': 'Out for Delivery',
      '71': 'In Transit',
      '73': 'On Hold',
      '75': 'Returned to Sender'
    };
    return statusMap[eventCode] || 'Processing';
  }

  /**
   * Determine current status from events history
   * @param {Array} events - Array of tracking events
   * @returns {string} Current status
   */
  determineCurrentStatus(events) {
    if (events.length === 0) return 'Pending';
    
    // Get the most recent event
    const latestEvent = events[0];
    return latestEvent.status;
  }

  /**
   * Cancel a shipment
   * @param {string} trackingNumber - SAPO tracking number
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} Cancellation response
   */
  async cancelShipment(trackingNumber, reason = 'Customer request') {
    return this.updateMailItemEvent(trackingNumber, this.eventCodes.CANCELLED, {
      NonDeliveryReason: '58',
      NonDeliveryMeasure: 'E',
      Note: reason
    });
  }

  /**
   * Mark item as delivered
   * @param {string} trackingNumber - SAPO tracking number
   * @param {string} signature - Recipient signature/name
   * @returns {Promise<Object>} Delivery confirmation response
   */
  async markAsDelivered(trackingNumber, signature) {
    return this.updateMailItemEvent(trackingNumber, this.eventCodes.DELIVERED, {
      SignatoryNm: signature,
      DelivLocation: this.config.officeCd
    });
  }

  /**
   * Create shipment for an order
   * Maps VeriSpine order data to SAPO API format
   *
   * Order Data Mapping:
   * - order.id → customerRef (for tracking generation)
   * - order.amount → value (item value in ZAR)
   * - order.shippingInfo → recipient (Addressee)
   * - order.seller → sender (Sender)
   * - order.productTitle → for reference
   *
   * @param {Object} order - Order data from database
   * @returns {Promise<Object>} Complete shipment creation response
   */
  async createShipmentForOrder(order) {
    try {
      console.log('=== SAPO: Creating shipment for order ===');
      console.log('Order ID:', order.id);
      console.log('Product:', order.productTitle);
      console.log('Amount:', order.amount);

      // Generate tracking number using order ID as customer reference
      const trackingResponse = await this.generateTrackingNumber(order.id);
      console.log('SAPO: Tracking number generated:', trackingResponse.trackingNumber);

      // Get shipping info from order (matches Checkout.tsx shippingInfo structure)
      const shipping = order.shippingInfo || order.shippingAddress || {};

      // Validate required shipping fields
      if (!shipping.fullName || !shipping.address || !shipping.city || !shipping.postalCode) {
        throw new Error('Incomplete shipping information. Required: fullName, address, city, postalCode');
      }

      // Extract first name from full name for SAPO Forename field
      const recipientFirstName = shipping.fullName.split(' ')[0] || '';
      const recipientLastName = shipping.fullName.split(' ').slice(1).join(' ') || '';

      // Get seller contact info from order
      const seller = order.seller || {};
      const sellerFirstName = seller.firstName || (seller.name ? seller.name.split(' ')[0] : 'VeriSpine');

      // Get structured pickup data (new orders have order.pickup object)
      const pickup = order.pickup || null;

      // Legacy fallback: parse from pickupLocation string for old orders
      let legacyCity = '';
      let legacyProvince = '';
      if (!pickup) {
        const pickupLocation = order.pickupLocation || order.productLocation || '';
        const locationParts = pickupLocation.split(',').map(p => p.trim());
        legacyCity = locationParts[0] || '';
        legacyProvince = locationParts.length >= 3 ? locationParts[locationParts.length - 2] : (locationParts[1] || '');
        console.log('SAPO: Legacy pickup location:', pickupLocation);
        console.log('SAPO: Legacy parsed - City:', legacyCity, 'Province:', legacyProvince);
      } else {
        console.log('SAPO: Structured pickup -', pickup.address, pickup.city, pickup.province, pickup.postalCode);
      }

      // Prepare shipment data mapping our fields to SAPO fields
      const shipmentData = {
        // Tracking info
        trackingNumber: trackingResponse.trackingNumber,
        orderNumber: `QS-${order.id}`,  // Prefix for easy identification

        // Item details
        weight: order.weight || order.productWeight || 1,  // Default 1kg if not specified
        value: order.amount || order.totalAmount || 100,   // Order amount in ZAR
        shippingCost: Number(order.shippingCost ?? order.shipping?.cost ?? 0), // Shipping cost paid (0 = free)
        insuredValue: order.insuredValue || 0,             // Insurance value
        express: order.express || order.expressShipping || false,

        // Sender (Seller) information
        // Pickup address = Product location (where the item is)
        // Seller contact info from seller profile
        sender: {
          name: seller.name || `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || 'VeriSpine Seller',
          firstName: sellerFirstName,
          address: pickup?.address || (order.pickupLocation || 'South Africa'),
          city: pickup?.city || legacyCity || 'Johannesburg',
          province: pickup?.province || legacyProvince || 'Gauteng',
          postalCode: pickup?.postalCode || seller.postalCode || '',
          phone: seller.phone || '0000000000',
          email: seller.email || 'seller@verispinejointcenters.com'
        },

        // Recipient (Buyer) information
        // Maps to: shippingInfo from Checkout.tsx
        // shippingInfo structure: { fullName, email, phone, address, city, province, postalCode, country }
        recipient: {
          name: shipping.fullName || order.buyerName || 'Customer',
          firstName: recipientFirstName,
          lastName: recipientLastName,
          address: shipping.address || '',
          city: shipping.city || '',
          province: shipping.province || 'Gauteng',
          postalCode: shipping.postalCode || '',
          phone: shipping.phone || order.buyerPhone || '',
          email: shipping.email || order.buyerEmail || ''
        }
      };

      console.log('SAPO: Shipment data prepared');
      console.log('SAPO: Sender -', shipmentData.sender.name, shipmentData.sender.city);
      console.log('SAPO: Recipient -', shipmentData.recipient.name, shipmentData.recipient.city);

      // Submit to SAPO
      const submitResponse = await this.submitMailItem(shipmentData);

      // Save tracking info to database
      if (db) {
        const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
        await db.collection('shipments').doc(order.id).set({
          // Reference IDs
          orderId: order.id,
          productId: order.productId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,

          // Tracking info
          trackingNumber: trackingResponse.trackingNumber,
          customerRef: trackingResponse.customerRef || order.id,
          carrier: 'SAPO',

          // Status
          status: 'shipped',
          currentStatus: 'Order Shipped',

          // Shipment details
          weight: shipmentData.weight,
          value: shipmentData.value,
          shippingCost: shipmentData.shippingCost,
          express: shipmentData.express,

          // Addresses (for reference)
          senderCity: shipmentData.sender.city,
          senderProvince: shipmentData.sender.province,
          recipientCity: shipmentData.recipient.city,
          recipientProvince: shipmentData.recipient.province,

          // Timestamps
          createdAt: timestamp,
          updatedAt: timestamp,
          shippedAt: timestamp,

          // Event history
          events: [{
            code: this.eventCodes.RECEIVED,
            status: 'Order Shipped',
            description: 'Item received from customer',
            timestamp: new Date().toISOString(),
            office: this.config.officeCd,
            officeName: 'VeriSpine'
          }],

          // Mock flag for testing
          isMock: submitResponse.mock || false
        });

        console.log('SAPO: Shipment saved to database');
      }

      console.log('=== SAPO: Shipment created successfully ===');

      return {
        success: true,
        trackingNumber: trackingResponse.trackingNumber,
        customerRef: trackingResponse.customerRef,
        carrier: 'SAPO',
        submitResponse: submitResponse
      };
    } catch (error) {
      console.error('SAPO Error creating shipment:', error);
      throw error;
    }
  }

  /**
   * Calculate shipping rate based on weight and destination
   * Note: SAPO doesn't provide a rate API, so we use calculated rates
   *
   * @param {Object} params - { weight, fromProvince, toProvince, express }
   * @returns {Object} Rate calculation result
   */
  calculateShippingRate({ weight = 1, fromProvince = 'Gauteng', toProvince = 'Gauteng', express = false }) {
    // Base rates in ZAR (South African Rand)
    const BASE_RATE = 50;           // Base rate for any parcel
    const RATE_PER_KG = 15;         // Rate per kg
    const EXPRESS_MULTIPLIER = 1.8; // Express shipping multiplier

    // Inter-provincial surcharges
    const SAME_PROVINCE = 0;
    const ADJACENT_PROVINCE = 20;
    const DISTANT_PROVINCE = 40;

    // Province adjacency map (simplified)
    const adjacentProvinces = {
      'Gauteng': ['North West', 'Limpopo', 'Mpumalanga', 'Free State'],
      'Western Cape': ['Northern Cape', 'Eastern Cape'],
      'Eastern Cape': ['Western Cape', 'Northern Cape', 'Free State', 'KwaZulu-Natal'],
      'KwaZulu-Natal': ['Eastern Cape', 'Free State', 'Mpumalanga'],
      'Free State': ['Gauteng', 'North West', 'Northern Cape', 'Eastern Cape', 'KwaZulu-Natal'],
      'Mpumalanga': ['Gauteng', 'Limpopo', 'KwaZulu-Natal'],
      'Limpopo': ['Gauteng', 'Mpumalanga', 'North West'],
      'North West': ['Gauteng', 'Limpopo', 'Free State', 'Northern Cape'],
      'Northern Cape': ['Western Cape', 'Eastern Cape', 'Free State', 'North West']
    };

    // Calculate weight charge
    const weightCharge = Math.ceil(weight) * RATE_PER_KG;

    // Calculate distance charge
    let distanceCharge = DISTANT_PROVINCE;
    if (fromProvince === toProvince) {
      distanceCharge = SAME_PROVINCE;
    } else if (adjacentProvinces[fromProvince]?.includes(toProvince)) {
      distanceCharge = ADJACENT_PROVINCE;
    }

    // Calculate total
    let subtotal = BASE_RATE + weightCharge + distanceCharge;

    // Apply express multiplier
    if (express) {
      subtotal = Math.round(subtotal * EXPRESS_MULTIPLIER);
    }

    // Estimated delivery days
    let estimatedDays = '3-5 business days';
    if (fromProvince === toProvince) {
      estimatedDays = express ? '1-2 business days' : '2-3 business days';
    } else if (adjacentProvinces[fromProvince]?.includes(toProvince)) {
      estimatedDays = express ? '2-3 business days' : '3-5 business days';
    } else {
      estimatedDays = express ? '3-4 business days' : '5-7 business days';
    }

    return {
      success: true,
      currency: 'USD',
      breakdown: {
        baseRate: BASE_RATE,
        weightCharge,
        distanceCharge,
        expressCharge: express ? Math.round((BASE_RATE + weightCharge + distanceCharge) * (EXPRESS_MULTIPLIER - 1)) : 0
      },
      total: subtotal,
      estimatedDays,
      express
    };
  }
}

module.exports = new SAPOShippingService();