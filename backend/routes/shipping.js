const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const shipping = require('../services/shippingService'); // provider facade (USPS/UPS/Freight)
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
    const result = await shipping.generateTrackingNumber(orderId);

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

    // Attach the seller so the provider can build a ship-from address. Pass the
    // record through as-is rather than substituting placeholder values — a fake
    // origin address produces a label the carrier will reject at the counter.
    const orderWithSeller = { ...order, seller };

    // Create shipment
    const result = await shipping.createShipmentForOrder(orderWithSeller);

    // Update order status
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    await db.collection('orders').doc(orderId).update({
      trackingNumber: result.trackingNumber,
      // Record the courier that ACTUALLY created the shipment. USPS, UPS and freight
      // are separate carriers; each provider returns its own label on `result.carrier`.
      // Note the facade may override the admin's active provider and route an
      // oversized order to freight, so this must come from the result, not the toggle.
      shippingCarrier: result.carrier || 'USPS',
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

    // Facade routes to whichever carrier owns this tracking number
    const result = await shipping.trackItems(trackingNumber);

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

    const result = await shipping.trackItems(trackingNumbers);

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

    const shipmentQuery = await db.collection('shipments')
      .where('trackingNumber', '==', trackingNumber)
      .limit(1)
      .get();

    if (shipmentQuery.empty) {
      return res.status(404).json({ error: 'No shipment found for this tracking number' });
    }

    const carrier = String(shipmentQuery.docs[0].data().carrier || '').toLowerCase();

    // Freight is admin-driven: its provider IS the event store, so delegating is
    // the whole operation. Writing a second event here would duplicate it.
    if (carrier === 'freight') {
      const result = await shipping.updateMailItemEvent(trackingNumber, eventCode, additionalData);
      return res.json({ success: true, data: result });
    }

    // USPS/UPS events come from the carrier, not from us — an admin update here is
    // recorded as a manual note so the customer timeline stays complete.
    const freight = require('../services/freightQuoteService');
    const newEvent = {
      code: String(eventCode),
      status: freight.mapStatus(eventCode),
      description: (additionalData && additionalData.description) || String(eventCode),
      timestamp: new Date().toISOString(),
      office: (additionalData && additionalData.location) || '',
      officeName: 'Manual update',
    };

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const arrayUnion = admin ? admin.firestore.FieldValue.arrayUnion(newEvent) : [newEvent];
    await shipmentQuery.docs[0].ref.update({
      events: arrayUnion,
      currentStatus: newEvent.status,
      updatedAt: timestamp
    });

    res.json({
      success: true,
      data: { trackingNumber, status: newEvent.status, event: newEvent }
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

    // Cancel with the carrier that owns this shipment
    const result = await shipping.cancelShipment(trackingNumber, reason);

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

    // Mark delivered with the carrier that owns this shipment
    const result = await shipping.markAsDelivered(trackingNumber, signature);

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
 * Get a shipping rate for a raw weight/route, without a product.
 * POST /api/shipping/calculate-rate
 *
 * Request body:
 * {
 *   weight: number (lbs),
 *   origin: { postalCode, city, state },
 *   destination: { postalCode, city, state },
 *   dimensions?: { length, width, height }   // inches
 * }
 *
 * The product-aware quote used at checkout is POST /api/shipping/quote.
 */
router.post('/calculate-rate', async (req, res) => {
  try {
    const { weight, origin, destination, dimensions } = req.body;
    const { defaultsForWeight } = require('../utils/parcelDimensions');

    const lbs = Number(weight) || 1;
    const d = dimensions && dimensions.length ? dimensions : defaultsForWeight(lbs);
    const parcels = [{
      lengthIn: Number(d.length), widthIn: Number(d.width), heightIn: Number(d.height), weightLbs: lbs,
    }];

    const rate = await shipping.calculateShippingRate({
      parcels,
      from: origin || {},
      to: destination || {},
    });

    res.json({
      success: true,
      data: {
        provider: rate.provider,
        serviceLevel: rate.serviceLevel,
        breakdown: rate.breakdown,
        totalRate: rate.total,
        currency: rate.currency,
        estimatedDays: rate.estimatedDays,
        requiresQuote: !!rate.requiresQuote,
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
 * Public: which courier provider is currently active, so checkout knows whether to
 * request a live quote or present a freight estimate pending a firm quote.
 * GET /api/shipping/active-provider
 */
router.get('/active-provider', async (req, res) => {
  try {
    const { getActiveShippingProvider } = require('../utils/shippingSettings');
    const provider = await getActiveShippingProvider();
    res.json({ success: true, provider });
  } catch (error) {
    const { DEFAULT_PROVIDER } = require('../utils/shippingSettings');
    res.json({ success: true, provider: DEFAULT_PROVIDER });
  }
});

/**
 * Live shipping quote for a specific product and destination.
 * POST /api/shipping/quote  { productId, deliveryAddress, quantity? }
 *
 * The quote MUST come from the carrier that will actually ship the order, so it
 * runs the same freight-threshold check the shipment path runs: an item too heavy
 * or too large for parcel is quoted as freight even when the admin toggle says
 * USPS, otherwise the buyer is quoted one carrier's price and shipped by another.
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

    const record = require('../services/shipmentRecord');
    const { getActiveShippingProvider } = require('../utils/shippingSettings');
    const { providerByName } = require('../services/shippingService');

    const qty = Math.max(1, Number(quantity) || 1);
    const parcels = record.buildParcels({ quantity: qty, weight: product.weight, productTitle: product.title }, product);

    const pickup = {
      street: product.shipping?.pickupAddress || '',
      city: product.shipping?.pickupCity || '',
      state: product.shipping?.pickupProvince || product.shipping?.pickupState || '',
      postalCode: product.shipping?.pickupPostalCode || '',
      country: 'US',
    };
    const destination = {
      street: deliveryAddress.address || '',
      city: deliveryAddress.city || '',
      state: deliveryAddress.province || deliveryAddress.state || '',
      postalCode: deliveryAddress.postalCode || '',
      country: 'US',
    };

    const name = record.requiresFreight(parcels) ? 'freight' : await getActiveShippingProvider();
    const service = providerByName(name);

    let rate;
    try {
      rate = await service.calculateShippingRate({
        parcels, from: pickup, to: destination,
        declaredValue: Number(product.price || product.currentPrice || product.startingPrice || 0),
      });
    } catch (e) {
      // A carrier outage must not hard-fail checkout. Fall back to the freight
      // estimator, which needs no external call, and mark it as an estimate.
      console.error(`${name} rate error (falling back to freight estimate):`, e.message);
      rate = await require('../services/freightQuoteService').calculateShippingRate({ parcels, from: pickup, to: destination });
    }

    return res.json({ success: true, data: {
      provider: rate.provider,
      total: rate.total,
      currency: rate.currency,
      serviceLevel: rate.serviceLevel,
      rateId: rate.rateId || null,
      estimatedDays: rate.estimatedDays,
      requiresQuote: !!rate.requiresQuote,
    } });
  } catch (error) {
    console.error('Shipping quote error:', error.message || error);
    res.status(502).json({ error: 'Could not fetch a shipping quote', details: error.message });
  }
});

module.exports = router;
