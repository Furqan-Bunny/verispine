const express = require('express');
const router = express.Router();
const { admin, db, auth, storage } = require('../config/firebase');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { validateBuyerShippingInfo, validatePickupPointOrder } = require('../utils/sapoValidation');
const { checkCityRestriction } = require('../utils/cityRestriction');
const { isNationwideCourierActive } = require('../utils/shippingSettings');

// Create order after auction win or buy now
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { productId, type, amount, shippingCost, totalAmount, shippingInfo, paymentMethod, quantity, shipmentRate, pargoPoint, deliveryMethod } = req.body;
    const buyerId = req.user.uid;

    // Validate input
    if (!productId || !type || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate the buyer's delivery details before creating the order (reject upfront so a bad
    // order never reaches the courier call where it would be silently swallowed). Pargo orders go
    // to a pickup point, so they validate contact + point instead of a full home address.
    if (!shippingInfo) {
      return res.status(400).json({ error: 'Shipping information is required' });
    }
    const isPickupPoint = deliveryMethod === 'pickup-point';
    const shippingCheck = isPickupPoint
      ? validatePickupPointOrder(shippingInfo, pargoPoint)
      : validateBuyerShippingInfo(shippingInfo);
    if (!shippingCheck.valid) {
      return res.status(400).json({
        error: isPickupPoint ? 'Invalid pickup / contact information' : 'Invalid shipping information',
        fieldErrors: shippingCheck.errors
      });
    }

    // Get product details
    const productDoc = await db.collection('products').doc(productId).get();
    
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const product = productDoc.data();

    // City restriction (temporary, until nationwide courier). Only same-city buyers may purchase.
    // Automatically bypassed when a nationwide courier (ShipLogic / RTT / Pargo) is active.
    if (!(await isNationwideCourierActive())) {
      const cityCheck = checkCityRestriction(product, shippingInfo.city);
      if (!cityCheck.allowed) {
        return res.status(403).json({
          error: `This product is only available for delivery in ${cityCheck.productCity}. Nationwide delivery is coming soon.`,
          cityRestricted: true,
          productCity: cityCheck.productCity
        });
      }
    }

    // Log product details for debugging
    console.log('Product details:', {
      id: productId,
      status: product.status,
      buyNowPrice: product.buyNowPrice,
      currentPrice: product.currentPrice,
      title: product.title
    });
    
    // For fixed-price ('sale') orders we capture the unit price and quantity here so the
    // order record and totals are computed from server-trusted product data, not the client.
    let saleQuantity = 1;
    let saleUnitPrice = null;

    // Verify product is available for purchase
    if (type === 'sale') {
      const blockedStatuses = ['sold', 'ended', 'cancelled', 'deleted'];
      if (product.status && blockedStatuses.includes(product.status)) {
        return res.status(400).json({ error: 'Product is no longer available' });
      }
      if (product.listingType !== 'sale') {
        return res.status(400).json({ error: 'This product is not available for direct purchase' });
      }
      saleQuantity = Math.max(1, parseInt(quantity, 10) || 1);
      // Unlimited ("always available") products have no quantity cap — they're
      // available until a seller/admin marks them out of stock (status checked above).
      // Limited products enforce remaining stock.
      if (product.stockType !== 'unlimited') {
        const remaining = (product.quantity || 0) - (product.soldQuantity || 0);
        if (remaining < saleQuantity) {
          return res.status(400).json({ error: `Only ${remaining} unit(s) left in stock`, remaining });
        }
      }
      saleUnitPrice = Number(product.price || product.currentPrice);
      if (!saleUnitPrice) {
        return res.status(400).json({ error: 'Product price is not set' });
      }
      const expectedTotal = saleUnitPrice * saleQuantity;
      if (Math.abs(Number(amount) - expectedTotal) > 0.01) {
        return res.status(400).json({ error: `Invalid purchase amount. Expected: ${expectedTotal}, Got: ${amount}` });
      }
      // SAPO ships one parcel per order; cap total weight at the 30kg SAPO maximum.
      const totalWeight = Number(product.weight || 1) * saleQuantity;
      if (totalWeight > 30) {
        return res.status(400).json({ error: 'This quantity exceeds the 30kg shipping limit for a single parcel. Please order fewer units.' });
      }
    } else if (type === 'buy_now') {
      // Only block if product is explicitly sold or ended
      const blockedStatuses = ['sold', 'ended', 'cancelled', 'deleted'];
      if (product.status && blockedStatuses.includes(product.status)) {
        console.log('Product status check failed:', product.status);
        return res.status(400).json({ 
          error: 'Product is no longer available',
          debug: `Product status: ${product.status}, Cannot purchase if: ${blockedStatuses.join(', ')}`
        });
      }
      if (!product.buyNowPrice && !product.currentPrice) {
        return res.status(400).json({ error: 'Buy Now not available for this product' });
      }
      // Check amount matches either buyNowPrice or currentPrice
      const expectedPrice = Number(product.buyNowPrice || product.currentPrice);
      if (Math.abs(Number(amount) - expectedPrice) > 0.01) {
        return res.status(400).json({ error: `Invalid purchase amount. Expected: ${expectedPrice}, Got: ${amount}` });
      }

      // Check if live auction registration is required for Buy Now
      if (product.isLiveAuction) {
        const registeredUsers = product.registeredUsers || [];
        if (!registeredUsers.includes(buyerId)) {
          return res.status(403).json({
            error: 'You must register and pay the entry fee to purchase in this live auction',
            requiresRegistration: true,
            registrationFee: product.registrationFee || 5
          });
        }
      }
    } else if (type === 'auction_win') {
      if (product.status !== 'ended') {
        return res.status(400).json({ error: 'Auction has not ended yet' });
      }
      if (product.winnerId !== buyerId) {
        return res.status(403).json({ error: 'You are not the auction winner' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid order type' });
    }
    
    // Get buyer details
    const buyerDoc = await db.collection('users').doc(buyerId).get();
    const buyer = buyerDoc.data();
    
    // Get seller details
    const sellerDoc = await db.collection('users').doc(product.sellerId).get();
    const seller = sellerDoc.data();
    
    // Create order.
    // Honor an explicit client shippingCost (including 0 for free shipping) — only
    // fall back to the product's own shipping fields when the client sent nothing.
    const hasClientShipping = shippingCost !== undefined && shippingCost !== null;
    const productShippingCost = Math.max(0, hasClientShipping
      ? (Number(shippingCost) || 0)
      : Number(product.shippingCost || product.shipping?.cost || 0));
    // Total is server-authoritative (item price + shipping), not the client's totalAmount.
    const orderTotalAmount = Number(amount) + productShippingCost;

    const orderData = {
      productId,
      productTitle: product.title,
      productImage: product.images?.[0] || '',
      productPrice: Number(amount),
      buyerId,
      buyerName: shippingInfo?.fullName || `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || buyer.name || 'Unknown',
      buyerEmail: shippingInfo?.email || buyer.email,
      sellerId: product.sellerId,
      sellerName: seller ? (`${seller.firstName || ''} ${seller.lastName || ''}`.trim() || seller.name || 'Unknown') : 'Unknown',
      sellerEmail: seller?.email || '',
      sellerPhone: seller?.phone || seller?.phoneNumber || '',
      // Product location for SAPO pickup (seller enters this when creating product)
      pickupLocation: product.shipping?.location || product.location || '',
      // Structured pickup address for SAPO sender
      pickup: product.shipping?.pickupAddress ? {
        address: product.shipping.pickupAddress,
        city: product.shipping.pickupCity,
        province: product.shipping.pickupProvince,
        postalCode: product.shipping.pickupPostalCode
      } : null,
      // Seller contact info for SAPO sender
      seller: seller ? {
        name: seller.businessName || seller.name || `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || 'Quicksell Seller',
        firstName: seller.firstName || '',
        lastName: seller.lastName || '',
        email: seller.email || '',
        phone: seller.phone || seller.phoneNumber || '',
      } : null,
      type, // 'buy_now', 'auction_win', or 'sale'
      // Fixed-price sale fields (units bought + unit price); ignored for auction orders
      ...(type === 'sale' ? { quantity: saleQuantity, unitPrice: saleUnitPrice } : {}),
      // Live courier rate selected at checkout (ShipLogic), reused at shipment creation
      ...(shipmentRate && shipmentRate.provider ? { shipmentRate } : {}),
      // Pargo Click & Collect: the buyer-selected pickup point + delivery method
      ...(isPickupPoint ? { deliveryMethod: 'pickup-point' } : {}),
      ...(pargoPoint && pargoPoint.code ? { pargoPoint } : {}),
      amount: Number(amount),
      shippingCost: productShippingCost,
      totalAmount: Number(orderTotalAmount),
      status: 'pending_payment',
      paymentStatus: 'pending',
      paymentMethod: paymentMethod || 'pending',
      shippingInfo: shippingInfo || {
        fullName: buyer.name || `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim(),
        email: buyer.email,
        phone: buyer.phone || '',
        address: buyer.address || '',
        city: buyer.city || '',
        province: buyer.province || '',
        postalCode: buyer.postalCode || '',
        country: buyer.country || 'South Africa'
      },
      shippingAddress: buyer.address || {}, // Keep for backward compatibility
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Use transaction to ensure consistency
    const result = await db.runTransaction(async (transaction) => {
      const orderRef = db.collection('orders').doc();
      
      // Create order
      transaction.set(orderRef, orderData);
      
      // Don't update product status to 'sold' immediately - wait for payment confirmation
      // This prevents blocking subsequent purchase attempts if payment fails
      if (type === 'buy_now' && false) { // Disabled for now
        transaction.update(productDoc.ref, {
          status: 'sold',
          soldTo: buyerId,
          soldAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      // NOTE: do NOT credit the seller here — the order is not paid yet. Seller funds are
      // credited to pendingBalance at payment settlement and released on delivery.
      if (seller) {
        transaction.update(sellerDoc.ref, {
          totalSales: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      return { id: orderRef.id, orderId: orderRef.id, ...orderData };
    });
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        id: result.id,
        orderId: result.orderId,
        ...result
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get user's orders
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { status, type } = req.query;
    
    let query = db.collection('orders')
      .where('buyerId', '==', userId);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (type) {
      query = query.where('type', '==', type);
    }
    
    const ordersSnapshot = await query
      .orderBy('createdAt', 'desc')
      .get();

    const orders = ordersSnapshot.docs.map(doc => {
      const data = doc.data();
      // Convert Firestore timestamps to ISO strings
      const createdAt = data.createdAt?.toDate?.() || data.createdAt;
      const updatedAt = data.updatedAt?.toDate?.() || data.updatedAt;
      const paidAt = data.paidAt?.toDate?.() || data.paidAt;
      const paymentDeadline = data.paymentDeadline?.toDate?.() || data.paymentDeadline;

      const productAmount = Number(data.amount || data.paidAmount || 0);
      const shippingCost = Number(data.shippingCost || data.shipping?.cost || 0);
      return {
        id: doc.id,
        orderId: doc.id,
        ...data,
        amount: productAmount,
        shippingCost: shippingCost,
        totalAmount: Number(data.totalAmount) || (productAmount + shippingCost),
        quantity: data.quantity || 1,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
        updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
        paidAt: paidAt instanceof Date ? paidAt.toISOString() : paidAt,
        paymentDeadline: paymentDeadline instanceof Date ? paymentDeadline.toISOString() : paymentDeadline
      };
    });

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get seller's orders
router.get('/my-sales', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { status } = req.query;
    
    let query = db.collection('orders')
      .where('sellerId', '==', userId);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const ordersSnapshot = await query
      .orderBy('createdAt', 'desc')
      .get();
    
    const orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// Get single order details
router.get('/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.uid;

    const orderDoc = await db.collection('orders').doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderDoc.data();

    // Check if user is buyer or seller
    if (order.buyerId !== userId && order.sellerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Convert Firestore timestamps to ISO strings
    const createdAt = order.createdAt?.toDate?.() || order.createdAt;
    const updatedAt = order.updatedAt?.toDate?.() || order.updatedAt;
    const paidAt = order.paidAt?.toDate?.() || order.paidAt;
    const paymentDeadline = order.paymentDeadline?.toDate?.() || order.paymentDeadline;

    // Format order data with proper field mappings
    const productAmount = Number(order.amount || order.paidAmount || 0);
    const shippingCost = Number(order.shippingCost || order.shipping?.cost || 0);
    const orderTotalAmount = Number(order.totalAmount) || (productAmount + shippingCost);
    const formattedOrder = {
      id: orderDoc.id,
      orderId: orderDoc.id,
      ...order,
      amount: productAmount,
      shippingCost: shippingCost,
      totalAmount: orderTotalAmount,
      productPrice: productAmount, // Frontend expects productPrice
      quantity: order.quantity || 1,
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
      updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
      paidAt: paidAt instanceof Date ? paidAt.toISOString() : paidAt,
      paymentDeadline: paymentDeadline instanceof Date ? paymentDeadline.toISOString() : paymentDeadline
    };

    res.json({
      success: true,
      data: formattedOrder
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Update pending order with shipping info (for buyers paying for accepted bids)
router.put('/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.uid;
    // SECURITY: never accept totalAmount/shippingCost from the client — those are set
    // server-side at order creation and are the authoritative charge amount. Accepting
    // them here let a buyer lower their own total and underpay.
    const { shippingInfo, paymentMethod } = req.body;

    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderDoc.data();
    if (order.buyerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (order.status !== 'pending_payment') {
      return res.status(400).json({ error: 'Order is not pending payment' });
    }

    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (shippingInfo) updates.shippingInfo = shippingInfo;
    if (paymentMethod) updates.paymentMethod = paymentMethod;

    await db.collection('orders').doc(orderId).update(updates);

    res.json({ success: true, message: 'Order updated' });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Update order status (for sellers)
router.put('/:orderId/status', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const userId = req.user.uid;

    // Sellers may only advance fulfilment — NOT 'delivered'. Marking an order delivered
    // (and releasing the seller's held funds) is done only by the system/admin via the
    // shipping flow, so a seller cannot pay themselves out without an actual delivery.
    const validStatuses = ['processing', 'shipped', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const orderDoc = await db.collection('orders').doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderDoc.data();

    // Check if user is the seller
    if (order.sellerId !== userId) {
      return res.status(403).json({ error: 'Only seller can update order status' });
    }

    await orderDoc.ref.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Process payment for order
router.post('/:orderId/pay', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.uid;
    
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderDoc.data();
    
    // Check if user is buyer
    if (order.buyerId !== userId) {
      return res.status(403).json({ error: 'Only buyer can pay for order' });
    }
    
    // Check if already paid
    if (order.paymentStatus === 'completed') {
      return res.status(400).json({ error: 'Order already paid' });
    }
    
    // Get user details
    const userDoc = await db.collection('users').doc(userId).get();
    const user = userDoc.data();
    
    // Initialize payment with AddPay
    const addpayService = require('../services/addpay');
    const result = await addpayService.initializePayment({
      amount: order.amount,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      description: `Payment for order #${orderId}`,
      orderId,
      productId: order.productId,
      userId
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to initialize payment' });
    }

    // Update order with payment reference
    await orderDoc.ref.update({
      paymentReference: result.data.reference,
      addpayTransactionId: result.data.transactionId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      data: {
        paymentUrl: result.data.paymentUrl,
        reference: result.data.reference
      }
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// Verify payment and update order
router.post('/:orderId/verify-payment', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reference } = req.body;
    
    if (!reference) {
      return res.status(400).json({ error: 'Payment reference required' });
    }
    
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderDoc.data();

    // Verify user is the buyer
    if (order.buyerId !== req.user.uid) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify payment with AddPay
    const addpayService = require('../services/addpay');
    const paymentStatus = await addpayService.verifyTransaction(reference);

    if (paymentStatus.success && (paymentStatus.data.status === 'COMPLETE' || paymentStatus.data.status === 'COMPLETED')) {
      // Update order
      await orderDoc.ref.update({
        paymentStatus: 'completed',
        status: 'processing',
        paymentCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update buyer's total spent
      const buyerDoc = await db.collection('users').doc(order.buyerId).get();
      await buyerDoc.ref.update({
        totalSpent: admin.firestore.FieldValue.increment(order.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({
        success: true,
        message: 'Payment verified successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Payment verification failed'
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Get all orders (admin only)
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, paymentStatus, limit = 2000, startAfter } = req.query;

    let query = db.collection('orders');
    
    // Apply filters
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }
    
    if (paymentStatus && paymentStatus !== 'all') {
      query = query.where('paymentStatus', '==', paymentStatus);
    }
    
    // Order by creation date
    query = query.orderBy('createdAt', 'desc').limit(parseInt(limit));
    
    // Pagination
    if (startAfter) {
      const startDoc = await db.collection('orders').doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }
    
    const ordersSnapshot = await query.get();

    const orders = ordersSnapshot.docs.map(doc => {
      const data = doc.data();
      // Convert Firestore timestamp to ISO string
      const createdAt = data.createdAt?.toDate?.() || data.createdAt;
      const updatedAt = data.updatedAt?.toDate?.() || data.updatedAt;
      const paymentDeadline = data.paymentDeadline?.toDate?.() || data.paymentDeadline;

      const productAmount = Number(data.amount || data.paidAmount || 0);
      const shippingCost = Number(data.shippingCost || data.shipping?.cost || 0);
      return {
        id: doc.id,
        orderId: doc.id, // Frontend expects orderId
        ...data,
        amount: productAmount,
        shippingCost: shippingCost,
        totalAmount: Number(data.totalAmount) || (productAmount + shippingCost),
        quantity: data.quantity || 1,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
        updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
        paymentDeadline: paymentDeadline instanceof Date ? paymentDeadline.toISOString() : paymentDeadline
      };
    });

    // Get order statistics
    const statsSnapshot = await db.collection('orders').get();
    const allOrders = statsSnapshot.docs.map(doc => doc.data());
    
    const stats = {
      total: allOrders.length,
      pending: allOrders.filter(o => o.status === 'pending_payment').length,
      processing: allOrders.filter(o => o.status === 'processing').length,
      shipped: allOrders.filter(o => o.status === 'shipped').length,
      delivered: allOrders.filter(o => o.status === 'delivered').length,
      cancelled: allOrders.filter(o => o.status === 'cancelled').length,
      totalRevenue: allOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0),
      totalCommission: allOrders.reduce((sum, o) => sum + (Number(o.amount || 0) * 0.05), 0) // 5% commission
    };
    
    res.json({
      success: true,
      data: orders,
      stats,
      hasMore: orders.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch orders' 
    });
  }
});

// Update order details (admin only)
router.put('/admin/:orderId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.uid;
    const {
      status,
      trackingNumber,
      shippingCarrier,
      notes,
      expectedDelivery
    } = req.body;

    // Get the order
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    const order = orderDoc.data();
    
    // Build update object
    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: userId
    };
    
    if (status !== undefined) {
      updateData.status = status;
      
      // Send notification to buyer
      const notificationRef = db.collection('notifications').doc();
      await notificationRef.set({
        id: notificationRef.id,
        userId: order.buyerId,
        type: 'order_update',
        title: 'Order Status Updated',
        message: `Your order #${orderId.slice(-8)} status changed to ${status}`,
        orderId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
    if (shippingCarrier !== undefined) updateData.shippingCarrier = shippingCarrier;
    if (notes !== undefined) updateData.notes = notes;
    if (expectedDelivery !== undefined) {
      updateData.expectedDelivery = admin.firestore.Timestamp.fromDate(new Date(expectedDelivery));
    }
    
    // Update the order
    await db.collection('orders').doc(orderId).update(updateData);
    
    res.json({
      success: true,
      message: 'Order updated successfully',
      data: {
        id: orderId,
        ...updateData
      }
    });
    
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order'
    });
  }
});

// Cancel order (PUT endpoint for frontend compatibility)
router.put('/:orderId/cancel', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.uid;
    
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderDoc.data();
    
    // Check if user is buyer or admin
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (order.buyerId !== userId && userData?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if order can be cancelled
    if (order.status === 'shipped' || order.status === 'delivered' || order.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot cancel this order' });
    }
    
    // Update order status
    await orderDoc.ref.update({
      status: 'cancelled',
      cancelledBy: userId,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      cancellationReason: req.body.reason || 'Cancelled by user',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Reverse any affiliate commission held/credited for this order (non-fatal no-op if none)
    try {
      const { reverseAffiliateCommissionForOrder } = require('../utils/affiliateCommission');
      await reverseAffiliateCommissionForOrder(req.params.orderId);
    } catch (e) { console.error('Affiliate reverse (cancel) error:', e.message); }

    // If product was marked as sold, revert it
    if (order.type === 'buy_now') {
      const productDoc = await db.collection('products').doc(order.productId).get();
      if (productDoc.exists && productDoc.data().status === 'sold') {
        await productDoc.ref.update({
          status: 'active',
          soldTo: null,
          soldAt: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      error: 'Failed to cancel order'
    });
  }
});

// Cancel order (DELETE endpoint - kept for backward compatibility)
router.delete('/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.uid;
    
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderDoc.data();
    
    // Check if user is buyer or seller
    if (order.buyerId !== userId && order.sellerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if order can be cancelled
    if (order.status === 'shipped' || order.status === 'delivered') {
      return res.status(400).json({ error: 'Cannot cancel shipped or delivered orders' });
    }
    
    if (order.paymentStatus === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel paid orders. Please request a refund.' });
    }
    
    // Update order status
    await orderDoc.ref.update({
      status: 'cancelled',
      cancelledBy: userId,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // If product was marked as sold, revert it
    if (order.type === 'buy_now') {
      const productDoc = await db.collection('products').doc(order.productId).get();
      if (productDoc.exists && productDoc.data().status === 'sold') {
        await productDoc.ref.update({
          status: 'active',
          soldTo: null,
          soldAt: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

module.exports = router;