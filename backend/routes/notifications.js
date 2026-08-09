const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');

// Get user notifications
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, unreadOnly = false } = req.query;

    // Verify user can only access their own notifications
    if (req.user.uid !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    let query = db.collection('notifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));

    if (unreadOnly === 'true') {
      query = query.where('read', '==', false);
    }

    const snapshot = await query.get();
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
      timestamp: doc.data().createdAt?.toDate?.() || doc.data().createdAt
    }));

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// Get unread count
router.get('/user/:userId/unread-count', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.uid !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const snapshot = await db.collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();

    res.json({
      success: true,
      data: { count: snapshot.size }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notifRef = db.collection('notifications').doc(notificationId);
    const notifDoc = await notifRef.get();

    if (!notifDoc.exists) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    // Verify ownership
    if (notifDoc.data().userId !== req.user.uid && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await notifRef.update({ read: true, readAt: new Date() });

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
});

// Mark all notifications as read for a user
router.put('/user/:userId/mark-all-read', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.uid !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const snapshot = await db.collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();

    if (snapshot.empty) {
      return res.json({ success: true, message: 'No unread notifications', updated: 0 });
    }

    const batch = db.batch();
    const now = new Date();

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { read: true, readAt: now });
    });

    await batch.commit();

    res.json({
      success: true,
      message: `${snapshot.size} notifications marked as read`,
      updated: snapshot.size
    });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
});

// Delete a notification
router.delete('/:notificationId', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notifRef = db.collection('notifications').doc(notificationId);
    const notifDoc = await notifRef.get();

    if (!notifDoc.exists) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    // Verify ownership
    if (notifDoc.data().userId !== req.user.uid && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await notifRef.delete();

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
});

// Delete all read notifications for a user
router.delete('/user/:userId/clear-read', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.uid !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const snapshot = await db.collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', true)
      .get();

    if (snapshot.empty) {
      return res.json({ success: true, message: 'No read notifications to clear', deleted: 0 });
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    res.json({
      success: true,
      message: `${snapshot.size} notifications deleted`,
      deleted: snapshot.size
    });
  } catch (error) {
    console.error('Error clearing read notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to clear notifications' });
  }
});

// Create a notification (internal use or for testing)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { userId, type, title, message, priority = 'medium', actionUrl, actionLabel, metadata } = req.body;

    // Only admin can create notifications for other users
    if (req.user.uid !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const notification = {
      userId,
      type: type || 'system',
      title,
      message,
      priority,
      read: false,
      createdAt: new Date(),
      ...(actionUrl && { actionUrl }),
      ...(actionLabel && { actionLabel }),
      ...(metadata && { metadata })
    };

    const docRef = await db.collection('notifications').add(notification);

    res.json({
      success: true,
      data: {
        id: docRef.id,
        ...notification
      }
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ success: false, error: 'Failed to create notification' });
  }
});

module.exports = router;
