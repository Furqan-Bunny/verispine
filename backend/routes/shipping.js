const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const sapoShipping = require('../services/shippingService'); // provider facade (SAPO/ShipLogic)
const sapoStatic = require('../services/sapoShippingService'); // province-based rate estimate util only
const { admin, db, auth, storage } = require('../config/firebase');
const emailService = require('../services/resendEmailService');

/**
 * Generate tracking number for an order
 * POST /api/shipping/generate-tracking
 */
router.post('/generate-tracking', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Get order details
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: orderDoc.id, ...orderDoc.data() };

    // Check if user is authorized (seller or admin)
    if (req.user.role !== 'admin' && order.sellerId !== req.user.uid) {
      return res.status(403).json({ error: 'Unauthorized to generate tracking for this order' });
    }

    // Generate tracking number
    const result = await sapoShipping.generateTrackingNumber(orderId);

    // Update order with tracking number
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    await db.collection('orders').doc(orderId).update({
      trackingNumber: result.trackingNumber,
      shippingStatus: 'tracking_generated',
      updatedAt: timestamp
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error generating tracking number:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create shipment for an order
 * POST /api/shipping/create-shipment
 */
router.post('/create-shipment', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Get order details
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = { id: orderDoc.id, ...orderDoc.data() };

    // Check if user is authorized (seller or admin)
    if (req.user.role !== 'admin' && order.sellerId !== req.user.uid) {
      return res.status(403).json({ error: 'Unauthorized to create shipment for this order' });
    }

    // Check if shipment already exists
    const existingShipment = await db.collection('shipments').doc(orderId).get();
    if (existingShipment.exists) {
      return res.status(400).json({ error: 'Shipment already exists for this order' });
    }

    // Get seller details
    let seller = {};
    if (order.sellerId) {
      const sellerDoc = await db.collection('users').doc(order.sellerId).get();
      if (sellerDoc.exists) {
        seller = sellerDoc.data();
      }
    }

    // Prepare order data with seller info
    const orderWithSeller = {
      ...order,
      seller: {
        name: seller.businessName || `${seller.firstName} ${seller.lastName}`,
        address: seller.address || '123 Seller Street',
        city: seller.city || 'Johannesburg',
        postalCode: seller.postalCode || '2000',
        phone: seller.phone || '0123456789',
        email: seller.email
      }
    };

    // Create shipment
    const result = await sapoShipping.createShipmentForOrder(orderWithSeller);

    // Update order status
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    await db.collection('orders').doc(orderId).update({
      trackingNumber: result.trackingNumber,
      // Record the courier that ACTUALLY created the shipment. SAPO, ShipLogic, RTT and Pargo
      // are separate companies; each provider returns its own carrier label on `result.carrier`.
      shippingCarrier: result.carrier || 'SAPO',
      shippingStatus: 'shipped',
      status: 'shipped',
      shippedAt: timestamp,
      updatedAt: timestamp
    });

    // Send email notification to buyer
    try {
      if (order.buyerId) {
        const buyerDoc = await db.collection('users').doc(order.buyerId).get();
        if (buyerDoc.exists) {
          const buyer = buyerDoc.data();
          await emailService.sendOrderShipped(buyer, order, result.trackingNumber);
          console.log('Shipped email sent to buyer:', buyer.email);
        }
      }
    } catch (emailError) {
      console.error('Failed to send shipped email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Track shipment(s)
 * GET /api/shipping/track/:trackingNumber
 */
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    
    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Track with SAPO
    const result = await sapoShipping.trackItems(trackingNumber);

    // Update local tracking cache
    if (result.items && result.items.length > 0) {
      const trackingData = result.items[0];
      
      // Find associated order
      const orderQuery = await db.collection('orders')
        .where('trackingNumber', '==', trackingNumber)
        .limit(1)
        .get();
      
      if (!orderQuery.empty) {
        const orderId = orderQuery.docs[0].id;
        
        // Update shipment tracking data
        const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
        await db.collection('shipments').doc(orderId).update({
          lastTracked: timestamp,
          currentStatus: trackingData.currentStatus,
          events: trackingData.events,
          lastUpdate: trackingData.lastUpdate
        });
      }
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error tracking shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Track multiple shipments
 * POST /api/shipping/track-multiple
 */
router.post('/track-multiple', async (req, res) => {
  try {
    const { trackingNumbers } = req.body;
    
    if (!trackingNumbers || !Array.isArray(trackingNumbers)) {
      return res.status(400).json({ error: 'Tracking numbers array is required' });
    }

    const result = await sapoShipping.trackItems(trackingNumbers);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error tracking shipments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update shipment event
 * POST /api/shipping/update-event
 */
router.post('/update-event', authMiddleware, async (req, res) => {
  try {
    const { trackingNumber, eventCode, additionalData } = req.body;
    
    if (!trackingNumber || !eventCode) {
      return res.status(400).json({ error: 'Tracking number and event code are required' });
    }

    // Check authorization
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update shipment events' });
    }

    const result = await sapoShipping.updateMailItemEvent(trackingNumber, eventCode, additionalData);

    // Update local shipment record
    const shipmentQuery = await db.collection('shipments')
      .where('trackingNumber', '==', trackingNumber)
      .limit(1)
      .get();
    
    if (!shipmentQuery.empty) {
      const shipmentId = shipmentQuery.docs[0].id;
      const shipmentDoc = shipmentQuery.docs[0].data();
      
      const newEvent = {
        code: eventCode,
        // These are SAPO IPS event codes (78/15/37…); mapEventCodeToStatus lives on the concrete
        // SAPO service, not the multi-carrier facade. This admin endpoint is SAPO-specific.
        status: sapoStatic.mapEventCodeToStatus(eventCode),
        timestamp: new Date().toISOString(),
        data: additionalData
      };
      
      const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
        const arrayUnion = admin ? admin.firestore.FieldValue.arrayUnion(newEvent) : [newEvent];
        await db.collection('shipments').doc(shipmentId).update({
          events: arrayUnion,
          currentStatus: newEvent.status,
          updatedAt: timestamp
        });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error updating shipment event:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancel shipment
 * POST /api/shipping/cancel
 */
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { trackingNumber, reason } = req.body;
    
    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Find associated order
    const orderQuery = await db.collection('orders')
      .where('trackingNumber', '==', trackingNumber)
      .limit(1)
      .get();
    
    if (orderQuery.empty) {
      return res.status(404).json({ error: 'Order not found for this tracking number' });
    }

    const order = orderQuery.docs[0].data();
    const orderId = orderQuery.docs[0].id;

    // Check authorization
    if (req.user.role !== 'admin' && order.sellerId !== req.user.uid && order.buyerId !== req.user.uid) {
      return res.status(403).json({ error: 'Unauthorized to cancel this shipment' });
    }

    // Cancel with SAPO
    const result = await sapoShipping.cancelShipment(trackingNumber, reason);

    // Update order and shipment status
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    await db.collection('orders').doc(orderId).update({
      shippingStatus: 'cancelled',
      shippingCancelledAt: timestamp,
      shippingCancelReason: reason,
      updatedAt: timestamp
    });

    await db.collection('shipments').doc(orderId).update({
      status: 'cancelled',
      cancelledAt: timestamp,
      cancelReason: reason,
      updatedAt: timestamp
    });

    res.json({
      success: true,
      message: 'Shipment cancelled successfully',
      data: result
    });
  } catch (error) {
    console.error('Error cancelling shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark shipment as delivered
 * POST /api/shipping/mark-delivered
 */
router.post('/mark-delivered', authMiddleware, async (req, res) => {
  try {
    const { trackingNumber, signature } = req.body;
    
    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Check authorization (admin only)
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can mark shipments as delivered' });
    }

    // Mark as delivered with SAPO
    const result = await sapoShipping.markAsDelivered(trackingNumber, signature);

    // Find and update associated order
    const orderQuery = await db.collection('orders')
      .where('trackingNumber', '==', trackingNumber)
      .limit(1)
      .get();
    
    if (!orderQuery.empty) {
      const orderId = orderQuery.docs[0].id;
      const order = orderQuery.docs[0].data();

      // Update order status
      const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
      await db.collection('orders').doc(orderId).update({
        status: 'delivered',
        shippingStatus: 'delivered',
        deliveredAt: timestamp,
        deliverySignature: signature,
        updatedAt: timestamp
      });

      // Update shipment status
      await db.collection('shipments').doc(orderId).update({
        status: 'delivered',
        deliveredAt: timestamp,
        signature: signature,
        updatedAt: timestamp
      });

      // Release any held affiliate commission for this delivered order (non-fatal)
      try {
        const { releaseAffiliateCommissionForOrder } = require('../utils/affiliateCommission');
        await releaseAffiliateCommissionForOrder(orderId);
      } catch (e) { console.error('Affiliate release (mark-delivered) error:', e.message); }

      // Release the seller's held funds (pendingBalance -> balance) (idempotent; non-fatal)
      try {
        const { releaseSellerFundsOnDelivery } = require('../utils/sellerPayout');
        await releaseSellerFundsOnDelivery(orderId);
      } catch (e) { console.error('Seller payout release (mark-delivered) error:', e.message); }

      // Send delivery email to buyer
      try {
        if (order.buyerId) {
          const buyerDoc = await db.collection('users').doc(order.buyerId).get();
          if (buyerDoc.exists) {
            const buyer = buyerDoc.data();
            await emailService.sendOrderDelivered(buyer, { ...order, orderId });
            console.log('Delivered email sent to buyer:', buyer.email);
          }
        }
      } catch (emailError) {
        console.error('Failed to send delivered email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Shipment marked as delivered',
      data: result
    });
  } catch (error) {
    console.error('Error marking shipment as delivered:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get shipping rates
 * POST /api/shipping/calculate-rate
 *
 * Request body:
 * {
 *   weight: number (kg),
 *   origin: { province: string },
 *   destination: { province: string },
 *   express: boolean
 * }
 *
 * Uses SAPO service's calculateShippingRate method
 */
router.post('/calculate-rate', async (req, res) => {
  try {
    const { weight, origin, destination, express } = req.body;

    // Province-based estimate utility (SAPO formula). The provider-aware live quote
    // used at checkout is POST /api/shipping/quote.
    const rateResult = sapoStatic.calculateShippingRate({
      weight: weight || 1,
      fromProvince: origin?.province || 'Gauteng',
      toProvince: destination?.province || 'Gauteng',
      express: express || false
    });

    res.json({
      success: true,
      data: {
        baseRate: rateResult.breakdown.baseRate,
        weightRate: rateResult.breakdown.weightCharge,
        distanceCharge: rateResult.breakdown.distanceCharge,
        expressCharge: rateResult.breakdown.expressCharge,
        totalRate: rateResult.total,
        currency: rateResult.currency,
        estimatedDays: rateResult.estimatedDays,
        express: rateResult.express
      }
    });
  } catch (error) {
    console.error('Error calculating shipping rate:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get user's shipments
 * GET /api/shipping/my-shipments
 */
router.get('/my-shipments', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { role } = req.query;
    
    let query;
    if (role === 'seller' || req.user.role === 'admin') {
      // Get shipments for orders where user is seller
      query = db.collection('orders')
        .where('sellerId', '==', userId)
        .where('trackingNumber', '!=', null);
    } else {
      // Get shipments for orders where user is buyer
      query = db.collection('orders')
        .where('buyerId', '==', userId)
        .where('trackingNumber', '!=', null);
    }
    
    const ordersSnapshot = await query.get();
    const shipments = [];
    
    for (const doc of ordersSnapshot.docs) {
      const order = doc.data();
      const shipmentDoc = await db.collection('shipments').doc(doc.id).get();
      
      if (shipmentDoc.exists) {
        shipments.push({
          orderId: doc.id,
          trackingNumber: order.trackingNumber,
          status: order.shippingStatus,
          createdAt: order.shippedAt,
          product: order.productTitle,
          buyer: order.buyerName,
          seller: order.sellerName,
          ...shipmentDoc.data()
        });
      }
    }
    
    res.json({
      success: true,
      data: shipments
    });
  } catch (error) {
    console.error('Error fetching user shipments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Public: which courier provider is currently active (so the frontend knows
 * whether to fetch a live ShipLogic quote or use the seller-entered cost).
 * GET /api/shipping/active-provider
 */
router.get('/active-provider', async (req, res) => {
  try {
    const { getActiveShippingProvider } = require('../utils/shippingSettings');
    const provider = await getActiveShippingProvider();
    res.json({ success: true, provider });
  } catch (error) {
    res.json({ success: true, provider: 'sapo' });
  }
});

/**
 * Live shipping quote for the active provider.
 * POST /api/shipping/quote  { productId, deliveryAddress, quantity? }
 * SAPO → province-based estimate; ShipLogic → live POST /rates.
 */
router.post('/quote', async (req, res) => {
  try {
    const { productId, deliveryAddress, quantity } = req.body;
    if (!productId || !deliveryAddress) {
      return res.status(400).json({ error: 'productId and deliveryAddress are required' });
    }

    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) return res.status(404).json({ error: 'Product not found' });
    const product = productDoc.data();

    const { getActiveShippingProvider } = require('../utils/shippingSettings');
    const provider = await getActiveShippingProvider();

    const pickup = {
      address: product.shipping?.pickupAddress || '',
      city: product.shipping?.pickupCity || '',
      province: product.shipping?.pickupProvince || 'Gauteng',
      postalCode: product.shipping?.pickupPostalCode || '',
    };

    // Quote from the courier that will ACTUALLY ship this order — i.e. the admin's active provider.
    // SAPO, ShipLogic, RTT and Pargo are separate companies with separate pricing, so the buyer
    // must never be quoted one courier's rate and shipped by another. A SAPO province estimate is
    // used only as a last-resort fallback so checkout never hard-fails.
    const { getParcelDimensions } = require('../utils/parcelDimensions');
    const dims = getParcelDimensions(product);
    const qty = Math.max(1, Number(quantity) || 1);
    const weight = Number(product.weight || 1);

    const sapoEstimate = () => {
      const rate = sapoStatic.calculateShippingRate({
        weight, fromProvince: pickup.province, toProvince: deliveryAddress.province || 'Gauteng', express: false,
      });
      return { provider: 'sapo', total: rate.total, currency: rate.currency, serviceLevel: 'Standard', rateId: null, estimatedDays: rate.estimatedDays };
    };

    if (provider === 'rtt') {
      try {
        const rtt = require('../services/rttRateService');
        const rttRate = rtt.calculateRate({
          originPostalCode: pickup.postalCode,
          destPostalCode: deliveryAddress.postalCode,
          weightKg: weight * qty,
          dimensions: [{ length: dims.length, width: dims.width, height: dims.height, quantity: qty }],
        });
        if (rttRate.serviceable) {
          return res.json({ success: true, data: {
            provider: 'rtt', total: rttRate.cost, currency: rttRate.currency,
            serviceLevel: rttRate.service, estimatedDays: '2-3', billedKg: rttRate.billedKg,
          } });
        }
        // RTT can't service this postal-code pair (out-of-table = manual quote per RTT). Use the
        // SAPO estimate so the buyer still sees a price rather than a broken checkout.
        console.warn(`RTT not serviceable (${pickup.postalCode} -> ${deliveryAddress.postalCode}: ${rttRate.reason}); using SAPO estimate as fallback`);
      } catch (e) { console.error('RTT rate error (falling back to SAPO estimate):', e.message); }
      return res.json({ success: true, data: sapoEstimate() });
    }

    if (provider === 'shiplogic') {
      const shiplogic = require('../services/shiplogicShippingService');
      const parcels = Array.from({ length: qty }, () => ({
        submitted_length_cm: dims.length,
        submitted_width_cm: dims.width,
        submitted_height_cm: dims.height,
        submitted_weight_kg: weight,
      }));
      const rate = await shiplogic.calculateShippingRate({
        collection: {
          type: 'business', company: 'Quicksell', street_address: pickup.address, local_area: '',
          city: pickup.city, zone: pickup.province, country: 'ZA', code: pickup.postalCode,
        },
        delivery: {
          type: 'residential', company: '', street_address: deliveryAddress.address || '', local_area: '',
          city: deliveryAddress.city || '', zone: deliveryAddress.province || 'Gauteng', country: 'ZA',
          code: deliveryAddress.postalCode || '',
        },
        parcels,
        declared_value: Number(product.price || product.currentPrice || product.startingPrice || 100),
      });
      return res.json({ success: true, data: {
        provider: 'shiplogic', total: rate.total, currency: rate.currency,
        serviceLevel: rate.serviceLevel, rateId: rate.rateId, estimatedDays: rate.estimatedDays,
      } });
    }

    if (provider === 'pargo') {
      const pargo = require('../services/pargoShippingService');
      const rate = await pargo.calculateShippingRate({
        weightKg: weight * qty,
        dimensions: [{ length: dims.length, width: dims.width, height: dims.height }],
        pickupPointCode: deliveryAddress.pargoPointCode || (req.body.pargoPoint && req.body.pargoPoint.code) || '',
        consignee: deliveryAddress,
      });
      return res.json({ success: true, data: {
        provider: 'pargo', total: rate.total, currency: rate.currency,
        serviceLevel: rate.serviceLevel, rateId: rate.rateId || null, estimatedDays: rate.estimatedDays,
      } });
    }

    // SAPO (default active provider): province-based estimate
    return res.json({ success: true, data: sapoEstimate() });
  } catch (error) {
    console.error('Shipping quote error:', error.message || error);
    res.status(502).json({ error: 'Could not fetch a shipping quote', details: error.message });
  }
});

/**
 * ShipLogic webhook — Tracking events (and notes). Pushes status to us so we don't poll.
 * POST /api/shipping/shiplogic/webhook?token=SECRET   (or header x-shiplogic-token)
 */
router.post('/shiplogic/webhook', async (req, res) => {
  try {
    const secret = process.env.SHIPLOGIC_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers['x-shiplogic-token'] || req.query.token;
      if (provided !== secret) {
        return res.status(401).json({ error: 'Invalid webhook token' });
      }
    }

    const data = req.body || {};
    const trackingRef = data.custom_tracking_reference || data.short_tracking_reference || data.tracking_reference;
    if (!trackingRef) {
      return res.status(200).json({ received: true }); // ack non-tracking payloads
    }

    // Derive a status: explicit field if present, else from collected/delivered dates.
    const shiplogic = require('../services/shiplogicShippingService');
    let statusCode = data.status || '';
    if (!statusCode) {
      if (data.shipment_delivered_date) statusCode = 'delivered';
      else if (data.shipment_collected_date) statusCode = 'in-transit';
      else statusCode = 'shipped';
    }
    const friendly = shiplogic.mapStatus(statusCode);
    const eventTime = data.event_time || data.time_modified || new Date().toISOString();

    // Find the shipment by tracking number (shipments doc id = orderId).
    const snap = await db.collection('shipments').where('trackingNumber', '==', trackingRef).limit(1).get();
    if (snap.empty) {
      console.warn('ShipLogic webhook: no shipment for', trackingRef);
      return res.status(200).json({ received: true });
    }
    const shipDoc = snap.docs[0];
    const ship = shipDoc.data();

    // Idempotent event append (dedupe by time+status).
    const existing = ship.events || [];
    const already = existing.some(e => e.timestamp === eventTime && e.status === friendly);
    const newEvent = { code: statusCode, status: friendly, description: friendly, timestamp: eventTime, office: data.delivery_hub || data.collection_hub || '', officeName: 'ShipLogic' };

    const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    if (!already) {
      await shipDoc.ref.update({
        events: admin.firestore.FieldValue.arrayUnion(newEvent),
        currentStatus: friendly,
        updatedAt: ts,
      });
    }

    // Reflect onto the order.
    const orderRef = db.collection('orders').doc(ship.orderId);
    const orderUpdate = { shippingStatus: friendly.toLowerCase().replace(/\s+/g, '_'), updatedAt: ts };
    const nowDelivered = statusCode.toLowerCase().includes('delivered') || !!data.shipment_delivered_date;
    if (nowDelivered) {
      orderUpdate.status = 'delivered';
      orderUpdate.deliveredAt = ts;
      orderUpdate.shippingStatus = 'delivered';
    }
    await orderRef.update(orderUpdate).catch(() => {});

    // Release held affiliate commission once the order is delivered (non-fatal)
    if (nowDelivered) {
      try {
        const { releaseAffiliateCommissionForOrder } = require('../utils/affiliateCommission');
        await releaseAffiliateCommissionForOrder(ship.orderId);
      } catch (e) { console.error('Affiliate release (shiplogic webhook) error:', e.message); }

      // Release the seller's held funds (pendingBalance -> balance) (idempotent; non-fatal)
      try {
        const { releaseSellerFundsOnDelivery } = require('../utils/sellerPayout');
        await releaseSellerFundsOnDelivery(ship.orderId);
      } catch (e) { console.error('Seller payout release (shiplogic webhook) error:', e.message); }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('ShipLogic webhook error:', error.message || error);
    res.status(200).json({ received: true }); // always 200 to avoid retries storm
  }
});

/**
 * RTT webhook — status push (RTT Generic API v1.15). RTT posts the same structure as the
 * GetBulkStatusDetail response: { data: [ { UniqueID, Events: [ { cons_no, status, eventtime } ] } ] }.
 * POST /api/shipping/rtt/webhook?token=SECRET   (or header x-rtt-token)
 */
router.post('/rtt/webhook', async (req, res) => {
  try {
    const secret = process.env.RTT_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers['x-rtt-token'] || req.query.token;
      if (provided !== secret) return res.status(401).json({ error: 'Invalid webhook token' });
    }

    const rtt = require('../services/rttShippingService');
    const body = req.body || {};
    const rows = Array.isArray(body.data) ? body.data : (body.Events ? [body] : []);
    const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();

    for (const row of rows) {
      const events = row.Events || row.events || [];
      for (const ev of events) {
        const consNo = String(ev.cons_no || row.cons_no || '');
        if (!consNo) continue;
        const friendly = rtt.mapStatus(ev.status || '');
        const eventTime = ev.eventtime || new Date().toISOString();

        const snap = await db.collection('shipments').where('trackingNumber', '==', consNo).limit(1).get();
        if (snap.empty) { console.warn('RTT webhook: no shipment for', consNo); continue; }
        const shipDoc = snap.docs[0];
        const ship = shipDoc.data();

        const already = (ship.events || []).some(e => e.timestamp === eventTime && e.status === friendly);
        if (!already) {
          const newEvent = { code: String(ev.status || ''), status: friendly, description: String(ev.status || ''), timestamp: eventTime, office: '', officeName: 'RTT' };
          await shipDoc.ref.update({
            events: admin.firestore.FieldValue.arrayUnion(newEvent),
            currentStatus: friendly,
            updatedAt: ts,
          });
        }

        // Use the mapped status (handles POD/ENDORSED = delivered, and excludes "DELIVERED - RETURNED
        // TO SENDER") rather than a bare "DELIVERED" substring.
        const nowDelivered = friendly === 'Delivered';
        const orderUpdate = { shippingStatus: friendly.toLowerCase().replace(/\s+/g, '_'), updatedAt: ts };
        if (nowDelivered) { orderUpdate.status = 'delivered'; orderUpdate.deliveredAt = ts; orderUpdate.shippingStatus = 'delivered'; }
        await db.collection('orders').doc(ship.orderId).update(orderUpdate).catch(() => {});

        if (nowDelivered) {
          try {
            const { releaseAffiliateCommissionForOrder } = require('../utils/affiliateCommission');
            await releaseAffiliateCommissionForOrder(ship.orderId);
          } catch (e) { console.error('Affiliate release (rtt webhook) error:', e.message); }
          try {
            const { releaseSellerFundsOnDelivery } = require('../utils/sellerPayout');
            await releaseSellerFundsOnDelivery(ship.orderId);
          } catch (e) { console.error('Seller payout release (rtt webhook) error:', e.message); }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('RTT webhook error:', error.message || error);
    res.status(200).json({ received: true }); // always 200 to avoid retries storm
  }
});

/**
 * Pargo map token — lets the checkout embed the Pargo pickup-point map iframe without hard-coding
 * the token in the frontend bundle. GET /api/shipping/pargo/map-token -> { token }.
 */
router.get('/pargo/map-token', async (req, res) => {
  // The map host MUST match the token's environment: a staging token only works on the staging map
  // (map.staging.pargo.co.za -> api.staging.pargo.co.za), a live token on the live map
  // (map.pargo.co.za -> api.live.pargo.co.za). Using the wrong host 404s the map config.
  const base = String(process.env.PARGO_BASE_URL || '').toLowerCase();
  const mapUrl = base.includes('staging') ? 'https://map.staging.pargo.co.za' : 'https://map.pargo.co.za';
  res.json({ success: true, token: process.env.PARGO_MAP_TOKEN || '', mapUrl });
});

/**
 * Pargo webhook — status push (parcel collected by customer / proof of delivery, etc).
 * POST /api/shipping/pargo/webhook?token=SECRET   (or header x-pargo-token)
 * Pargo event shape is confirmed with Pargo; we read a tracking code + a status/title and map it.
 */
router.post('/pargo/webhook', async (req, res) => {
  try {
    const secret = process.env.PARGO_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers['x-pargo-token'] || req.query.token;
      if (provided !== secret) return res.status(401).json({ error: 'Invalid webhook token' });
    }

    const pargo = require('../services/pargoShippingService');
    const b = req.body || {};
    const d = b.data || {};
    // Pargo's real Simba-API webhook payload is:
    //   { data: { event:"order.w2p.status.completed", eventCode:"1.20.4.500",
    //             description:"Parcel collected by customer", timestamp, reference1:<waybill>,
    //             reference2, reference3, payload } }
    // Tracking code = reference1 (waybill); status text = description/event; the eventCode
    // (…".500" = W2P collected-by-customer) is the most reliable delivered signal. Older fallbacks kept.
    const eventCode = String(d.eventCode || b.eventCode || '');
    const trackingRef = d.reference1 || d.reference3 || d.reference2
      || b.trackingCode || b.reference || (d.orderData && d.orderData.trackingCode) || d.trackingCode;
    const statusText = d.description || d.event || b.description || b.status || b.title
      || (b.event && (b.event.title || b.event.description)) || '';
    if (!trackingRef) return res.status(200).json({ received: true });

    const friendly = pargo.mapStatus(`${statusText} ${eventCode}`);
    const eventTime = d.timestamp || b.timestamp || b.date || new Date().toISOString();

    const snap = await db.collection('shipments').where('trackingNumber', '==', trackingRef).limit(1).get();
    if (snap.empty) { console.warn('Pargo webhook: no shipment for', trackingRef); return res.status(200).json({ received: true }); }
    const shipDoc = snap.docs[0];
    const ship = shipDoc.data();

    const ts = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const already = (ship.events || []).some(e => e.timestamp === eventTime && e.status === friendly);
    if (!already) {
      const newEvent = { code: String(statusText).slice(0, 40), status: friendly, description: String(statusText), timestamp: eventTime, office: '', officeName: 'Pargo' };
      await shipDoc.ref.update({ events: admin.firestore.FieldValue.arrayUnion(newEvent), currentStatus: friendly, updatedAt: ts });
    }

    // Delivered (W2P) = the BUYER collected the parcel: eventCode ".500" (order.w2p.status.completed
    // "collected by customer") or Pargo POD ".503". mapStatus already encodes this, so
    // friendly==='Delivered' is authoritative. IMPORTANT: do NOT treat a bare "proof of delivery"
    // as delivered — ".304" is the courier's proof-of-delivery to the pickup POINT, not the buyer
    // collecting, and would otherwise release seller funds too early.
    const s = String(statusText).toLowerCase();
    const nowDelivered = friendly === 'Delivered' || eventCode.endsWith('.500') || eventCode.endsWith('.503')
      || String(d.event || '').toLowerCase().includes('status.completed')
      || s.includes('collected by customer');
    const orderUpdate = { shippingStatus: friendly.toLowerCase().replace(/\s+/g, '_'), updatedAt: ts };
    if (nowDelivered) { orderUpdate.status = 'delivered'; orderUpdate.deliveredAt = ts; orderUpdate.shippingStatus = 'delivered'; }
    await db.collection('orders').doc(ship.orderId).update(orderUpdate).catch(() => {});

    if (nowDelivered) {
      try { const { releaseAffiliateCommissionForOrder } = require('../utils/affiliateCommission'); await releaseAffiliateCommissionForOrder(ship.orderId); }
      catch (e) { console.error('Affiliate release (pargo webhook) error:', e.message); }
      try { const { releaseSellerFundsOnDelivery } = require('../utils/sellerPayout'); await releaseSellerFundsOnDelivery(ship.orderId); }
      catch (e) { console.error('Seller payout release (pargo webhook) error:', e.message); }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Pargo webhook error:', error.message || error);
    res.status(200).json({ received: true });
  }
});

module.exports = router;