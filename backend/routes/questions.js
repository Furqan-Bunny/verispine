const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');

// Get all questions for a product (public)
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const questionsSnapshot = await db.collection('questions')
      .where('productId', '==', productId)
      .get();

    const questions = questionsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        answeredAt: data.answeredAt?.toDate?.() || data.answeredAt
      };
    });

    // Sort by createdAt descending in-memory
    questions.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    res.json({
      success: true,
      data: questions
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Ask a question (auth required)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { productId, question } = req.body;
    const userId = req.user.uid || req.user.id;
    const userName = req.user.displayName || req.user.username || 'User';

    if (!productId || !question || !question.trim()) {
      return res.status(400).json({ error: 'Product ID and question are required' });
    }

    // Look up product to get title
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productData = productDoc.data();

    const questionData = {
      productId,
      productTitle: productData.title || '',
      userId,
      userName,
      question: question.trim(),
      answer: null,
      answeredBy: null,
      answeredByName: null,
      answeredAt: null,
      createdAt: new Date()
    };

    const questionRef = await db.collection('questions').add(questionData);

    res.status(201).json({
      success: true,
      message: 'Question submitted successfully',
      data: {
        id: questionRef.id,
        ...questionData
      }
    });
  } catch (error) {
    console.error('Error submitting question:', error);
    res.status(500).json({ error: 'Failed to submit question' });
  }
});

// Answer a question (seller only)
router.put('/:questionId/answer', authMiddleware, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { answer } = req.body;
    const userId = req.user.uid || req.user.id;
    const userName = req.user.displayName || req.user.username || 'Seller';

    if (!answer || !answer.trim()) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    const questionDoc = await db.collection('questions').doc(questionId).get();
    if (!questionDoc.exists) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const questionData = questionDoc.data();

    // Verify requesting user is the product seller
    const productDoc = await db.collection('products').doc(questionData.productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productData = productDoc.data();
    if (productData.sellerId !== userId) {
      return res.status(403).json({ error: 'Only the product seller can answer questions' });
    }

    await db.collection('questions').doc(questionId).update({
      answer: answer.trim(),
      answeredBy: userId,
      answeredByName: userName,
      answeredAt: new Date()
    });

    res.json({
      success: true,
      message: 'Answer submitted successfully'
    });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({ error: 'Failed to answer question' });
  }
});

// Delete a question (owner or admin only)
router.delete('/:questionId', authMiddleware, async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.user.uid || req.user.id;
    const isAdmin = req.user.role === 'admin';

    const questionDoc = await db.collection('questions').doc(questionId).get();
    if (!questionDoc.exists) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const questionData = questionDoc.data();
    if (questionData.userId !== userId && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own questions' });
    }

    await db.collection('questions').doc(questionId).delete();

    res.json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

module.exports = router;
