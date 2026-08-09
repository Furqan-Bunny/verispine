const express = require('express');
const router = express.Router();
const { admin, db, auth, storage } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/resendEmailService');
const sapoShippingService = require('../services/shippingService'); // provider facade (SAPO/ShipLogic)
const { runAdminDelete } = require('../utils/adminDelete');

// Admin middleware - check if user is admin
const adminMiddleware = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    if (userData.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// ==================== PAYMENT MANAGEMENT APIs ====================

// Get all payment transactions (sourced from orders collection)
router.get('/payments/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, gateway, limit = 2000 } = req.query;

    let query = db.collection('orders');

    // Filter by payment status if provided
    if (status) {
      const mappedStatus = (status === 'completed') ? 'paid' : status;
      query = query.where('paymentStatus', '==', mappedStatus);
    }
    if (gateway) {
      query = query.where('paymentMethod', '==', gateway);
    }

    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const transactions = [];
    for (const doc of snapshot.docs) {
      const order = doc.data();

      // Skip orders with no payment activity
      if (!order.paymentStatus) continue;

      // Map order fields to transaction shape
      const transaction = {
        id: doc.id,
        orderId: doc.id,
        amount: parseFloat(order.amount) || parseFloat(order.totalAmount) || 0,
        fee: (parseFloat(order.amount) || parseFloat(order.totalAmount) || 0) * 0.10,
        gateway: order.paymentMethod || 'N/A',
        status: (order.paymentStatus === 'paid' || order.paymentStatus === 'completed') ? 'completed' : order.paymentStatus,
        reference: order.paymentReference || '',
        createdAt: order.createdAt,
        order: {
          id: doc.id,
          productTitle: order.productTitle || 'N/A',
          status: order.status
        }
      };

      // Get buyer details
      if (order.buyerId) {
        const userDoc = await db.collection('users').doc(order.buyerId).get();
        if (userDoc.exists) {
          transaction.user = {
            id: userDoc.id,
            name: `${userDoc.data().firstName} ${userDoc.data().lastName}`,
            email: userDoc.data().email
          };
        }
      }

      transactions.push(transaction);
    }

    // Calculate statistics using field names the frontend expects
    const completedTransactions = transactions.filter(t => t.status === 'completed');
    const totalAmount = completedTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalFees = completedTransactions.reduce((sum, t) => sum + (t.fee || 0), 0);
    const completedCount = completedTransactions.length;

    const stats = {
      totalRevenue: totalAmount,
      totalOrders: transactions.length,
      averageOrderValue: completedCount > 0 ? totalAmount / completedCount : 0,
      platformFees: totalFees,
      successRate: transactions.length > 0 ? (completedCount / transactions.length) * 100 : 0
    };

    res.json({
      success: true,
      data: transactions,
      stats
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get seller payouts
router.get('/payments/payouts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, sellerId, limit = 2000 } = req.query;
    
    let query = db.collection('payouts');
    
    if (status) {
      query = query.where('status', '==', status);
    }
    if (sellerId) {
      query = query.where('sellerId', '==', sellerId);
    }
    
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const payouts = [];
    for (const doc of snapshot.docs) {
      const payout = { id: doc.id, ...doc.data() };
      
      // Get seller details
      if (payout.sellerId) {
        const sellerDoc = await db.collection('users').doc(payout.sellerId).get();
        if (sellerDoc.exists) {
          payout.seller = {
            id: sellerDoc.id,
            name: `${sellerDoc.data().firstName} ${sellerDoc.data().lastName}`,
            email: sellerDoc.data().email,
            bankDetails: sellerDoc.data().bankDetails
          };
        }
      }
      
      payouts.push(payout);
    }
    
    const completedPayouts = payouts.filter(p => p.status === 'completed');
    const totalPayoutAmount = completedPayouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const completedCount = completedPayouts.length;

    const stats = {
      totalRevenue: totalPayoutAmount,
      totalOrders: payouts.length,
      averageOrderValue: payouts.length > 0 ? totalPayoutAmount / payouts.length : 0,
      platformFees: 0,
      successRate: payouts.length > 0 ? (completedCount / payouts.length) * 100 : 0
    };
    
    res.json({
      success: true,
      data: payouts,
      stats
    });
  } catch (error) {
    console.error('Error fetching payouts:', error);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// Process seller payout
router.post('/payments/process-payout', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { sellerId, amount, method, reference, notes } = req.body;
    
    if (!sellerId || !amount || !method) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get seller details
    const sellerDoc = await db.collection('users').doc(sellerId).get();
    if (!sellerDoc.exists) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    
    const seller = sellerDoc.data();
    
    // Create payout record
    const payoutData = {
      sellerId,
      sellerName: `${seller.firstName} ${seller.lastName}`,
      amount,
      method,
      reference: reference || '',
      notes: notes || '',
      status: 'processing',
      processedBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const payoutRef = await db.collection('payouts').add(payoutData);
    
    // Update seller balance
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(sellerId);
      const userDoc = await transaction.get(userRef);
      const currentBalance = userDoc.data().balance || 0;
      
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }
      
      const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
      const incrementFn = admin ? admin.firestore.FieldValue.increment : (val) => val;

      transaction.update(userRef, {
        balance: incrementFn(-amount),
        totalPayouts: incrementFn(amount),
        lastPayoutAt: timestamp
      });
      
      // Update payout status
      transaction.update(payoutRef, {
        status: 'completed',
        completedAt: timestamp
      });
    });
    
    res.json({
      success: true,
      message: 'Payout processed successfully',
      data: { id: payoutRef.id, ...payoutData }
    });
  } catch (error) {
    console.error('Error processing payout:', error);
    res.status(500).json({ error: error.message || 'Failed to process payout' });
  }
});

// Get payment analytics
router.get('/payments/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period = '30d', startDate: qStart, endDate: qEnd } = req.query;

    // Date range: a custom startDate/endDate (YYYY-MM-DD) wins over the period preset.
    let startDate = new Date();
    let endDate = null;
    if (qStart) {
      startDate = new Date(qStart);
      endDate = qEnd ? new Date(qEnd) : new Date();
      endDate.setHours(23, 59, 59, 999); // include the whole end day
    } else {
      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }
    }

    // Get orders within date range
    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const timestampFn = admin ? admin.firestore.Timestamp.fromDate : (date) => date;
    let ordersQuery = db.collection('orders').where('createdAt', '>=', timestampFn(startDate));
    if (endDate) ordersQuery = ordersQuery.where('createdAt', '<=', timestampFn(endDate));
    const ordersSnapshot = await ordersQuery.get();
    
    const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculate daily revenue
    const dailyRevenue = {};
    orders.forEach(order => {
      if ((order.paymentStatus === 'completed' || order.paymentStatus === 'paid') && order.createdAt) {
        const ts = order.createdAt._seconds || order.createdAt.seconds;
        if (ts) {
          const date = new Date(ts * 1000).toISOString().split('T')[0];
          dailyRevenue[date] = (dailyRevenue[date] || 0) + (parseFloat(order.amount) || 0);
        }
      }
    });

    // Get payment methods distribution
    const paymentMethods = {};
    orders.forEach(order => {
      if (order.paymentMethod) {
        paymentMethods[order.paymentMethod] = (paymentMethods[order.paymentMethod] || 0) + 1;
      }
    });

    // Calculate statistics
    const completedOrders = orders.filter(o => o.paymentStatus === 'completed' || o.paymentStatus === 'paid');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
    const completedCount = completedOrders.length;

    const stats = {
      totalRevenue,
      totalOrders: orders.length,
      averageOrderValue: completedCount > 0 ? totalRevenue / completedCount : 0,
      platformFees: totalRevenue * 0.10,
      successRate: orders.length > 0 ? (completedCount / orders.length) * 100 : 0
    };
    
    res.json({
      success: true,
      data: {
        dailyRevenue,
        paymentMethods,
        stats,
        period
      }
    });
  } catch (error) {
    console.error('Error fetching payment analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ==================== NOTIFICATION SYSTEM APIs ====================

// Send notification to users
router.post('/notifications/send', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, type = 'info', audience = 'all' } = req.body;
    // Accept both field name formats
    const message = req.body.message || req.body.content;
    const userIds = req.body.userIds || req.body.specificUserIds || [];

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    let targetUsers = [];

    // Determine target users based on audience
    if (audience === 'all') {
      const usersSnapshot = await db.collection('users').get();
      targetUsers = usersSnapshot.docs.map(doc => doc.id);
    } else if (audience === 'sellers') {
      const sellersSnapshot = await db.collection('users')
        .where('role', '==', 'seller')
        .get();
      targetUsers = sellersSnapshot.docs.map(doc => doc.id);
    } else if (audience === 'buyers') {
      const buyersSnapshot = await db.collection('users')
        .where('role', '==', 'user')
        .get();
      targetUsers = buyersSnapshot.docs.map(doc => doc.id);
    } else if (audience === 'specific' && userIds.length > 0) {
      targetUsers = userIds;
    }

    // Create notifications for each user
    const batch = db.batch();
    const notifications = [];

    for (const userId of targetUsers) {
      const notificationRef = db.collection('notifications').doc();
      const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
      const notificationData = {
        title,
        message,
        type,
        audience,
        userId,
        read: false,
        createdBy: req.user.uid,
        createdAt: timestamp
      };

      batch.set(notificationRef, notificationData);
      notifications.push({ id: notificationRef.id, ...notificationData });
    }

    await batch.commit();

    res.json({
      success: true,
      message: `Notification sent to ${targetUsers.length} users`,
      data: {
        totalSent: targetUsers.length,
        audience,
        title,
        message
      }
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

// Get notification history
router.get('/notifications/history', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit = 2000 } = req.query;
    
    const snapshot = await db.collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const notifications = [];
    const uniqueNotifications = new Map();
    
    // Group notifications by title and message
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const key = `${data.title}-${data.message}`;

      if (!uniqueNotifications.has(key)) {
        uniqueNotifications.set(key, {
          id: doc.id,
          title: data.title,
          message: data.message,
          content: data.message,
          type: data.type,
          audience: data.audience || 'all',
          status: 'sent',
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          sentAt: data.createdAt,
          recipientCount: 1,
          readCount: data.read ? 1 : 0
        });
      } else {
        const existing = uniqueNotifications.get(key);
        existing.recipientCount++;
        if (data.read) existing.readCount++;
      }
    }
    
    // Convert to array and add admin details + computed fields
    for (const [key, notification] of uniqueNotifications) {
      // Compute read rate
      notification.readRate = notification.recipientCount > 0
        ? (notification.readCount / notification.recipientCount) * 100
        : 0;
      notification.clickCount = 0;
      notification.clickRate = 0;

      if (notification.createdBy) {
        try {
          const adminDoc = await db.collection('users').doc(notification.createdBy).get();
          if (adminDoc.exists) {
            notification.admin = {
              id: adminDoc.id,
              name: `${adminDoc.data().firstName} ${adminDoc.data().lastName}`,
              email: adminDoc.data().email
            };
          }
        } catch (e) {
          // Skip if admin user not found
        }
      }
      notifications.push(notification);
    }
    
    res.json({
      success: true,
      data: notifications,
      stats: {
        totalSent: snapshot.size,
        uniqueMessages: notifications.length
      }
    });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({ error: 'Failed to fetch notification history' });
  }
});

// Get notification templates
router.get('/notifications/templates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const snapshot = await db.collection('notification_templates')
      .orderBy('createdAt', 'desc')
      .get();

    const templates = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Return both field name formats for frontend compat
        title: data.subject || data.title || '',
        content: data.body || data.content || '',
        subject: data.subject || data.title || '',
        body: data.body || data.content || ''
      };
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create notification template
router.post('/notifications/templates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, type, variables = [] } = req.body;
    // Accept both field name formats
    const subject = req.body.subject || req.body.title;
    const body = req.body.body || req.body.content;

    if (!name || !type || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const templateData = {
      name,
      type,
      subject,
      body,
      variables,
      createdBy: req.user.uid,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    const templateRef = await db.collection('notification_templates').add(templateData);
    
    res.json({
      success: true,
      message: 'Template created successfully',
      data: { id: templateRef.id, ...templateData }
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update notification template
router.put('/notifications/templates/:templateId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { name, type, variables } = req.body;
    // Accept both field name formats
    const subject = req.body.subject || req.body.title;
    const body = req.body.body || req.body.content;

    const templateRef = db.collection('notification_templates').doc(templateId);
    const templateDoc = await templateRef.get();

    if (!templateDoc.exists) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const updateData = {
      updatedAt: timestamp
    };

    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (subject !== undefined) updateData.subject = subject;
    if (body !== undefined) updateData.body = body;
    if (variables !== undefined) updateData.variables = variables;
    
    await templateRef.update(updateData);
    
    res.json({
      success: true,
      message: 'Template updated successfully'
    });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete notification template
router.delete('/notifications/templates/:templateId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { templateId } = req.params;
    
    await db.collection('notification_templates').doc(templateId).delete();
    
    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Get audience counts for delivery estimates
router.get('/notifications/audience-counts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();

    let all = 0;
    let sellers = 0;
    let buyers = 0;

    usersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      all++;
      if (data.role === 'seller') {
        sellers++;
      } else if (data.role === 'user' || data.role === 'buyer') {
        buyers++;
      }
    });

    res.json({
      success: true,
      data: { all, sellers, buyers }
    });
  } catch (error) {
    console.error('Error fetching audience counts:', error);
    res.status(500).json({ error: 'Failed to fetch audience counts' });
  }
});

// Get notification statistics
router.get('/notifications/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Get ALL notifications for overall stats
    const allSnapshot = await db.collection('notifications')
      .orderBy('createdAt', 'desc')
      .get();

    const allNotifications = allSnapshot.docs.map(doc => doc.data());

    // Calculate time boundaries
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const getTimestamp = (n) => {
      if (!n.createdAt) return null;
      const ts = n.createdAt._seconds || n.createdAt.seconds;
      return ts ? ts * 1000 : null;
    };

    // Count by time period
    let todaySent = 0;
    let weekSent = 0;
    let monthSent = 0;

    allNotifications.forEach(n => {
      const ts = getTimestamp(n);
      if (!ts) return;
      if (ts >= startOfToday.getTime()) todaySent++;
      if (ts >= startOfWeek.getTime()) weekSent++;
      if (ts >= startOfMonth.getTime()) monthSent++;
    });

    // Unique recipients
    const uniqueUserIds = new Set(allNotifications.map(n => n.userId).filter(Boolean));

    // Read stats
    const totalRead = allNotifications.filter(n => n.read).length;
    const readRate = allNotifications.length > 0 ? (totalRead / allNotifications.length) * 100 : 0;

    // By type
    const byType = {
      info: { total: 0, read: 0 },
      success: { total: 0, read: 0 },
      warning: { total: 0, read: 0 },
      error: { total: 0, read: 0 }
    };

    allNotifications.forEach(n => {
      const t = n.type || 'info';
      if (byType[t]) {
        byType[t].total++;
        if (n.read) byType[t].read++;
      }
    });

    // Top performing type (highest read rate with at least 1 notification)
    let topPerformingType = 'info';
    let topReadRate = -1;
    for (const [type, data] of Object.entries(byType)) {
      if (data.total > 0) {
        const rate = (data.read / data.total) * 100;
        if (rate > topReadRate) {
          topReadRate = rate;
          topPerformingType = type;
        }
      }
    }

    // Daily counts + daily reads for recentActivity (last 7 days)
    const dailyCount = {};
    const dailyRead = {};

    allNotifications.forEach(n => {
      const ts = getTimestamp(n);
      if (!ts) return;
      const date = new Date(ts).toISOString().split('T')[0];
      dailyCount[date] = (dailyCount[date] || 0) + 1;
      if (n.read) {
        dailyRead[date] = (dailyRead[date] || 0) + 1;
      }
    });

    // Build recentActivity array (last 7 days)
    const recentActivity = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      recentActivity.push({
        date: dateStr,
        sent: dailyCount[dateStr] || 0,
        opened: dailyRead[dateStr] || 0
      });
    }

    const stats = {
      totalSent: allNotifications.length,
      totalRead,
      readRate,
      avgReadRate: readRate,
      totalRecipients: uniqueUserIds.size,
      todaySent,
      weekSent,
      monthSent,
      topPerformingType,
      byType: {
        info: byType.info.total,
        success: byType.success.total,
        warning: byType.warning.total,
        error: byType.error.total
      },
      dailyCount,
      recentActivity
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ==================== ENHANCED ORDER MANAGEMENT ====================

// Update order status with validation
router.put('/orders/:orderId/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, trackingNumber: providedTrackingNumber, notes } = req.body;

    const validStatuses = ['pending_payment', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!db) {
      return res.status(500).json({ error: 'Database connection unavailable' });
    }

    const order = orderDoc.data();
    const serverTimestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
    const regularTimestamp = new Date(); // serverTimestamp not allowed inside arrays

    // ========= SAPO INTEGRATION FOR STATUS TRANSITIONS =========
    // shipped: if no tracking yet, register parcel with SAPO + create shipment doc.
    //          if tracking already exists, just flip the status field.
    // delivered: notify SAPO via event code 37 so SAPO's tracking system also reflects delivery.
    // cancelled: notify SAPO via event code 15 so SAPO cancels the parcel.
    let resolvedTrackingNumber = providedTrackingNumber || order.trackingNumber || null;
    let resolvedCarrier = order.carrier || null;
    let sapoActionPerformed = null;
    let sapoActionError = null;

    if (status === 'shipped' && !resolvedTrackingNumber) {
      // No tracking yet — admin is asking us to actually register the parcel.
      // Block the status flip if SAPO fails so we never sit in "shipped" without a TRN.
      try {
        const shipmentResult = await sapoShippingService.createShipmentForOrder({ id: orderId, ...order });
        resolvedTrackingNumber = shipmentResult.trackingNumber;
        resolvedCarrier = shipmentResult.carrier || 'SAPO';
        sapoActionPerformed = 'created';
      } catch (shippingError) {
        console.error('Admin Mark as Shipped: SAPO createShipmentForOrder failed:', shippingError.message);
        // Persist the error so it shows in the modal, but DO NOT flip status to shipped.
        try {
          await orderRef.update({
            shippingError: shippingError.message,
            shippingErrorAt: serverTimestamp,
            updatedAt: serverTimestamp,
            updatedBy: req.user.uid
          });
        } catch (e) { /* swallow */ }
        return res.status(502).json({
          error: 'Failed to register shipment with SAPO',
          details: shippingError.message,
          hint: 'Check the order has valid shippingInfo (4-digit postcode, address, city) and a valid pickup block on the product. Order status was not changed.'
        });
      }
    } else if (status === 'delivered' && resolvedTrackingNumber) {
      // Order has a SAPO tracking number — push the DELIVERED event so SAPO's
      // tracking system reflects it too. If this fails it is non-fatal; we still
      // mark the order as delivered locally and surface the error in shippingError.
      try {
        await sapoShippingService.markAsDelivered(resolvedTrackingNumber, order.buyerName || 'Recipient');
        sapoActionPerformed = 'delivered';
      } catch (shippingError) {
        console.error('Admin Mark as Delivered: SAPO markAsDelivered failed:', shippingError.message);
        sapoActionError = shippingError.message;
      }
    } else if (status === 'cancelled' && resolvedTrackingNumber) {
      try {
        await sapoShippingService.cancelShipment(resolvedTrackingNumber, notes || 'Cancelled by admin');
        sapoActionPerformed = 'cancelled';
      } catch (shippingError) {
        console.error('Admin Cancel: SAPO cancelShipment failed:', shippingError.message);
        sapoActionError = shippingError.message;
      }
    }

    // ========= APPLY ORDER UPDATE =========
    const updateData = {
      status,
      updatedAt: serverTimestamp,
      updatedBy: req.user.uid
    };

    if (resolvedTrackingNumber) updateData.trackingNumber = resolvedTrackingNumber;
    if (resolvedCarrier) updateData.carrier = resolvedCarrier;
    if (notes) updateData.adminNotes = notes;

    // Add status history (use regular Date, not serverTimestamp - Firebase doesn't allow serverTimestamp in arrays)
    const statusHistory = order.statusHistory || [];
    const historyEntry = {
      status,
      changedAt: regularTimestamp,
      changedBy: req.user.uid
    };
    if (notes) historyEntry.notes = notes;
    statusHistory.push(historyEntry);
    updateData.statusHistory = statusHistory;

    if (status === 'shipped') {
      updateData.shippingStatus = 'shipped';
      if (!order.shippedAt) updateData.shippedAt = serverTimestamp;
      // If we just successfully created a shipment, clear any stale error.
      if (sapoActionPerformed === 'created') {
        updateData.shippingError = admin.firestore.FieldValue.delete();
        updateData.shippingErrorAt = admin.firestore.FieldValue.delete();
      }
    }
    if (status === 'delivered') {
      updateData.deliveredAt = serverTimestamp;
      updateData.shippingStatus = 'delivered';
      if (sapoActionError) {
        updateData.shippingError = sapoActionError;
        updateData.shippingErrorAt = serverTimestamp;
      }
    }
    if (status === 'cancelled' && sapoActionError) {
      updateData.shippingError = sapoActionError;
      updateData.shippingErrorAt = serverTimestamp;
    }

    await orderRef.update(updateData);

    // ========= AFFILIATE COMMISSION: release on delivery, reverse on cancel/refund =========
    try {
      const { releaseAffiliateCommissionForOrder, reverseAffiliateCommissionForOrder } = require('../utils/affiliateCommission');
      if (status === 'delivered') await releaseAffiliateCommissionForOrder(orderId);
      else if (status === 'cancelled' || status === 'refunded') await reverseAffiliateCommissionForOrder(orderId);
    } catch (e) { console.error('Affiliate commission hook (admin status) error:', e.message); }

    // Release the seller's held funds (pendingBalance -> balance) on delivery (idempotent; non-fatal)
    if (status === 'delivered') {
      try {
        const { releaseSellerFundsOnDelivery } = require('../utils/sellerPayout');
        await releaseSellerFundsOnDelivery(orderId);
      } catch (e) { console.error('Seller payout release (admin status) error:', e.message); }
    }

    // ========= BUYER NOTIFICATION + EMAIL =========
    if (order.buyerId) {
      // In-app notification
      await db.collection('notifications').add({
        userId: order.buyerId,
        title: 'Order Update',
        message: `Your order #${orderId.slice(-6)} status changed to ${status}`,
        type: 'info',
        read: false,
        orderId,
        createdAt: serverTimestamp
      });

      // Email — pick the right template per status. Generic update for processing/refunded;
      // dedicated shipped/delivered templates which include the SAPO tracking link.
      try {
        const buyerDoc = await db.collection('users').doc(order.buyerId).get();
        if (buyerDoc.exists) {
          const buyer = buyerDoc.data();
          const enrichedOrder = { ...order, orderId, id: orderId, trackingNumber: resolvedTrackingNumber, carrier: resolvedCarrier };

          if (status === 'shipped' && resolvedTrackingNumber && typeof emailService.sendOrderShipped === 'function') {
            await emailService.sendOrderShipped(buyer, enrichedOrder, resolvedTrackingNumber);
          } else if (status === 'delivered' && typeof emailService.sendOrderDelivered === 'function') {
            await emailService.sendOrderDelivered(buyer, enrichedOrder);
          } else {
            await emailService.sendOrderStatusUpdate(buyer, enrichedOrder, status);
          }
          console.log(`Order status email sent to buyer (${status}):`, buyer.email);
        }
      } catch (emailError) {
        console.error('Failed to send order status email:', emailError);
        // Email failure is non-fatal.
      }
    }

    res.json({
      success: true,
      message: sapoActionPerformed === 'created'
        ? 'Order shipped and registered with SAPO'
        : 'Order status updated successfully',
      data: {
        orderId,
        status,
        trackingNumber: resolvedTrackingNumber,
        carrier: resolvedCarrier,
        sapoAction: sapoActionPerformed,
        sapoActionError
      }
    });
  } catch (error) {
    console.error('Error updating order status:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to update order status', details: error.message });
  }
});

// Get order analytics
router.get('/orders/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ordersSnapshot = await db.collection('orders').get();
    const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Count by status - include both pending and pending_payment as pending
    const pendingOrders = orders.filter(o => o.status === 'pending_payment' || o.status === 'pending').length;
    const processingOrders = orders.filter(o => o.status === 'processing').length;
    const shippedOrders = orders.filter(o => o.status === 'shipped').length;
    const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
    const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;

    // Calculate revenue from paid orders
    const paidOrders = orders.filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'completed');
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (parseFloat(o.amount) || parseFloat(o.totalAmount) || 0), 0);

    // Calculate average order value
    const averageOrderValue = paidOrders.length > 0 ?
      totalRevenue / paidOrders.length : 0;

    // Period-over-period growth: last 30 days vs the 30 days before that.
    const toMs = (v) => {
      if (!v) return 0;
      if (typeof v === 'object' && v._seconds) return v._seconds * 1000;
      if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
      const t = new Date(v).getTime();
      return isNaN(t) ? 0 : t;
    };
    const now = Date.now();
    const DAY = 86400000;
    const inWindow = (o, from, to) => { const t = toMs(o.createdAt); return t >= from && t < to; };
    const revenueOf = (arr) => arr
      .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'completed')
      .reduce((s, o) => s + (parseFloat(o.amount) || parseFloat(o.totalAmount) || 0), 0);
    const pct = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);
    const curOrders = orders.filter(o => inWindow(o, now - 30 * DAY, now));
    const prevOrders = orders.filter(o => inWindow(o, now - 60 * DAY, now - 30 * DAY));

    // Calculate statistics in the format frontend expects
    const stats = {
      totalOrders: orders.length,
      totalRevenue,
      pendingOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      averageOrderValue,
      revenueGrowth: pct(revenueOf(curOrders), revenueOf(prevOrders)),
      orderGrowth: pct(curOrders.length, prevOrders.length)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching order analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * Export orders as CSV.
 * Frontend (AdminOrders.tsx) calls POST /api/admin-ext/orders/export with
 *   { orderIds: string[], format: 'csv' }
 * and expects a CSV blob in response.
 */
router.post('/orders/export', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { orderIds, format = 'csv' } = req.body || {};

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds array is required' });
    }
    if (orderIds.length > 1000) {
      return res.status(400).json({ error: 'Cannot export more than 1000 orders at once' });
    }
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Only csv format is currently supported' });
    }

    // Fetch all requested orders. Firestore `in` query supports up to 30 items per chunk.
    const docs = [];
    for (let i = 0; i < orderIds.length; i += 30) {
      const chunk = orderIds.slice(i, i + 30);
      const snap = await db.collection('orders')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.forEach(d => docs.push(d));
    }

    // CSV columns — order is intentional (admin-friendly).
    const columns = [
      'orderId',
      'createdAt',
      'productTitle',
      'type',
      'status',
      'paymentStatus',
      'paymentMethod',
      'amount',
      'shippingCost',
      'totalAmount',
      'buyerName',
      'buyerEmail',
      'sellerName',
      'sellerEmail',
      'recipientFullName',
      'recipientAddress',
      'recipientCity',
      'recipientProvince',
      'recipientPostalCode',
      'recipientPhone',
      'recipientEmail',
      'pickupAddress',
      'pickupCity',
      'pickupProvince',
      'pickupPostalCode',
      'trackingNumber',
      'carrier',
      'shippingStatus',
      'shippingError',
      'shippedAt',
      'paidAt'
    ];

    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'string' ? v : String(v);
      // Wrap every field in quotes and escape embedded quotes so commas/newlines inside fields don't break CSV.
      return `"${s.replace(/"/g, '""')}"`;
    };

    const fmt = (t) => {
      if (!t) return '';
      if (t.toDate) return t.toDate().toISOString();
      if (t._seconds) return new Date(t._seconds * 1000).toISOString();
      return typeof t === 'string' ? t : '';
    };

    const rows = docs.map(doc => {
      const o = doc.data();
      const ship = o.shippingInfo || o.shippingAddress || {};
      const pickup = o.pickup || {};
      return [
        doc.id,
        fmt(o.createdAt),
        o.productTitle || '',
        o.type || '',
        o.status || '',
        o.paymentStatus || '',
        o.paymentMethod || '',
        o.amount ?? '',
        o.shippingCost ?? '',
        o.totalAmount ?? '',
        o.buyerName || '',
        o.buyerEmail || ship.email || '',
        o.sellerName || '',
        o.sellerEmail || (o.seller && o.seller.email) || '',
        ship.fullName || '',
        ship.address || ship.addressLine1 || '',
        ship.city || '',
        ship.province || ship.state || '',
        ship.postalCode || ship.zipCode || '',
        ship.phone || ship.phoneNumber || '',
        ship.email || '',
        pickup.address || o.pickupLocation || '',
        pickup.city || '',
        pickup.province || '',
        pickup.postalCode || '',
        o.trackingNumber || '',
        o.carrier || '',
        o.shippingStatus || '',
        o.shippingError || '',
        fmt(o.shippedAt),
        fmt(o.paidAt)
      ].map(escape).join(',');
    });

    const csv = [columns.join(','), ...rows].join('\n');
    const filename = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting orders:', error);
    res.status(500).json({ error: 'Failed to export orders' });
  }
});

// ==================== ADMIN HARD DELETE (single + bulk) ====================
// POST /api/admin-ext/bulk-delete  { entity, ids: string[] }
// Permanently deletes records for the given entity (with per-entity cascades). Single-item delete
// is just ids of length 1. Admin-only. See utils/adminDelete.js for the per-entity behaviour.
router.post('/bulk-delete', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!entity) return res.status(400).json({ error: 'entity is required' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });
    if (ids.length > 500) return res.status(400).json({ error: 'Too many ids (max 500 per request)' });

    const { deleted, failed } = await runAdminDelete(entity, ids);
    res.json({ success: failed.length === 0, entity, deleted, failed });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('bulk-delete error:', error);
    res.status(500).json({ error: 'Bulk delete failed' });
  }
});

module.exports = router;