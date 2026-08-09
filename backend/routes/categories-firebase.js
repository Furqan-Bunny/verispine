const express = require('express');
const router = express.Router();
const { admin, db, auth, storage } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');

// Get all categories
router.get('/', async (req, res) => {
  try {
    // Don't use .orderBy('order') — Firestore excludes docs missing that field, which hid
    // categories created without an 'order'. Fetch all, then sort in memory.
    const categoriesSnapshot = await db.collection('categories').get();

    const categories = categoriesSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) =>
        (Number(a.order ?? 0) - Number(b.order ?? 0)) ||
        String(a.name || '').localeCompare(String(b.name || ''))
      );

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});

// Get single category with products
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get category
    const categoryDoc = await db.collection('categories').doc(id).get();
    
    if (!categoryDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }
    
    // Get products in this category
    const productsSnapshot = await db.collection('products')
      .where('categoryId', '==', id)
      .where('status', '==', 'active')
      .limit(20)
      .get();
    
    const products = [];
    productsSnapshot.forEach(doc => {
      products.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      success: true,
      data: {
        category: {
          id: categoryDoc.id,
          ...categoryDoc.data()
        },
        products
      }
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch category'
    });
  }
});

module.exports = router;