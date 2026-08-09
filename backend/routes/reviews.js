const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');

// Recompute and store a seller's aggregate rating from all reviews where sellerId matches
async function recomputeSellerRating(sellerId) {
  if (!sellerId) return;
  try {
    const snap = await db.collection('reviews').where('sellerId', '==', sellerId).get();
    let total = 0;
    let count = 0;
    snap.forEach(doc => {
      const r = doc.data().rating;
      if (typeof r === 'number') {
        total += r;
        count++;
      }
    });
    const avg = count > 0 ? parseFloat((total / count).toFixed(2)) : 0;
    await db.collection('users').doc(sellerId).update({
      'sellerProfile.averageRating': avg,
      'sellerProfile.ratingCount': count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    // Seller doc may not have sellerProfile yet — fail soft
    console.error('recomputeSellerRating error:', err.message);
  }
}

// Get reviews for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    const reviewsSnapshot = await db.collection('reviews')
      .where('productId', '==', productId)
      .get();

    const allReviews = [];
    for (const doc of reviewsSnapshot.docs) {
      const reviewData = doc.data();

      // Fetch reviewer info
      let reviewer = { username: 'Anonymous' };
      if (reviewData.userId) {
        const userDoc = await db.collection('users').doc(reviewData.userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          reviewer = {
            id: userDoc.id,
            username: userData.username || userData.name || 'User',
            avatar: userData.avatar || userData.profileImage || null
          };
        }
      }

      allReviews.push({
        id: doc.id,
        ...reviewData,
        reviewer,
        createdAt: reviewData.createdAt?.toDate?.() || reviewData.createdAt
      });
    }

    // Sort by createdAt descending and paginate in-memory
    allReviews.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    const reviews = allReviews.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // Calculate stats from already-fetched data
    const total = allReviews.length;

    let totalRating = 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    allReviews.forEach(review => {
      totalRating += review.rating || 0;
      const rating = review.rating;
      if (rating >= 1 && rating <= 5) {
        distribution[rating]++;
      }
    });
    const averageRating = total > 0
      ? (totalRating / total).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        reviews,
        total,
        averageRating: parseFloat(averageRating),
        distribution
      }
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Submit a review (requires authentication and delivered order)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { orderId, productId, rating, comment } = req.body;
    const userId = req.user.id || req.user.uid;

    // Validate required fields
    if (!orderId || !productId || !rating) {
      return res.status(400).json({ error: 'Order ID, Product ID, and rating are required' });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Check if order exists and belongs to the user
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderData = orderDoc.data();

    // Check if user is the buyer
    if (orderData.buyerId !== userId) {
      return res.status(403).json({ error: 'You can only review orders you purchased' });
    }

    // Check if order is delivered
    if (orderData.status !== 'delivered') {
      return res.status(400).json({ error: 'You can only review delivered orders' });
    }

    // Check if review already exists for this order
    const existingReviewSnapshot = await db.collection('reviews')
      .where('orderId', '==', orderId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!existingReviewSnapshot.empty) {
      return res.status(400).json({ error: 'You have already reviewed this order' });
    }

    // Look up sellerId from order or product so we can aggregate seller ratings
    let sellerId = orderData.sellerId || null;
    let userName = req.user.firstName || req.user.username || req.user.displayName || 'User';
    if (!sellerId) {
      const productDoc = await db.collection('products').doc(productId).get();
      if (productDoc.exists) sellerId = productDoc.data().sellerId || null;
    }

    // Create the review
    const reviewData = {
      orderId,
      productId,
      sellerId: sellerId || null,
      userId,
      userName,
      rating: parseInt(rating),
      comment: comment || '',
      createdAt: new Date(),
      updatedAt: new Date(),
      isVerifiedPurchase: true
    };

    const reviewRef = await db.collection('reviews').add(reviewData);

    // Update order to mark as reviewed
    await db.collection('orders').doc(orderId).update({
      hasReview: true,
      reviewId: reviewRef.id,
      reviewedAt: new Date()
    });

    // Update product's average rating
    const productReviewsSnapshot = await db.collection('reviews')
      .where('productId', '==', productId)
      .get();

    let totalRating = 0;
    productReviewsSnapshot.docs.forEach(doc => {
      totalRating += doc.data().rating || 0;
    });
    const newAverageRating = totalRating / productReviewsSnapshot.size;

    await db.collection('products').doc(productId).update({
      averageRating: parseFloat(newAverageRating.toFixed(1)),
      reviewCount: productReviewsSnapshot.size
    });

    // Recompute seller aggregate
    if (sellerId) {
      await recomputeSellerRating(sellerId);
    }

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        id: reviewRef.id,
        ...reviewData
      }
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// Update a review (owner only)
router.put('/:reviewId', authMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id || req.user.uid;

    const reviewDoc = await db.collection('reviews').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const reviewData = reviewDoc.data();
    if (reviewData.userId !== userId) {
      return res.status(403).json({ error: 'You can only edit your own reviews' });
    }

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const updateData = {
      updatedAt: new Date()
    };
    if (rating) updateData.rating = parseInt(rating);
    if (comment !== undefined) updateData.comment = comment;

    await db.collection('reviews').doc(reviewId).update(updateData);

    // Update product's average rating if rating changed
    if (rating) {
      const productReviewsSnapshot = await db.collection('reviews')
        .where('productId', '==', reviewData.productId)
        .get();

      let totalRating = 0;
      productReviewsSnapshot.docs.forEach(doc => {
        totalRating += doc.data().rating || 0;
      });
      const newAverageRating = totalRating / productReviewsSnapshot.size;

      await db.collection('products').doc(reviewData.productId).update({
        averageRating: parseFloat(newAverageRating.toFixed(1))
      });

      if (reviewData.sellerId) {
        await recomputeSellerRating(reviewData.sellerId);
      }
    }

    res.json({
      success: true,
      message: 'Review updated successfully'
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Delete a review (owner or admin only)
router.delete('/:reviewId', authMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id || req.user.uid;
    const isAdmin = req.user.role === 'admin';

    const reviewDoc = await db.collection('reviews').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const reviewData = reviewDoc.data();
    if (reviewData.userId !== userId && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own reviews' });
    }

    const productId = reviewData.productId;
    const orderId = reviewData.orderId;
    const sellerId = reviewData.sellerId;

    // Delete the review
    await db.collection('reviews').doc(reviewId).delete();

    // Update order
    if (orderId) {
      await db.collection('orders').doc(orderId).update({
        hasReview: false,
        reviewId: null,
        reviewedAt: null
      });
    }

    // Update product's average rating
    const remainingReviewsSnapshot = await db.collection('reviews')
      .where('productId', '==', productId)
      .get();

    if (remainingReviewsSnapshot.size > 0) {
      let totalRating = 0;
      remainingReviewsSnapshot.docs.forEach(doc => {
        totalRating += doc.data().rating || 0;
      });
      const newAverageRating = totalRating / remainingReviewsSnapshot.size;

      await db.collection('products').doc(productId).update({
        averageRating: parseFloat(newAverageRating.toFixed(1)),
        reviewCount: remainingReviewsSnapshot.size
      });
    } else {
      await db.collection('products').doc(productId).update({
        averageRating: 0,
        reviewCount: 0
      });
    }

    // Recompute seller aggregate
    if (sellerId) {
      await recomputeSellerRating(sellerId);
    }

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Check if user can review an order
router.get('/can-review/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id || req.user.uid;

    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.json({ canReview: false, reason: 'Order not found' });
    }

    const orderData = orderDoc.data();

    if (orderData.buyerId !== userId) {
      return res.json({ canReview: false, reason: 'Not your order' });
    }

    if (orderData.status !== 'delivered') {
      return res.json({ canReview: false, reason: 'Order not delivered yet' });
    }

    if (orderData.hasReview) {
      return res.json({ canReview: false, reason: 'Already reviewed' });
    }

    res.json({ canReview: true });
  } catch (error) {
    console.error('Error checking review eligibility:', error);
    res.status(500).json({ error: 'Failed to check review eligibility' });
  }
});

module.exports = router;
