const express = require('express');
const router = express.Router();
const { admin, db, storage } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');

// Valid ID types
const VALID_ID_TYPES = ['id_card', 'passport', 'drivers_license'];

// Valid KYC statuses
const KYC_STATUS = {
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

// Helper function to upload base64 image to Firebase Storage
const uploadToStorage = async (base64Data, folder, fileName) => {
  try {
    if (!storage) {
      throw new Error('Firebase Storage not initialized');
    }

    // Remove data URL prefix if present
    const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    // Determine content type from base64 header or default to jpeg
    let contentType = 'image/jpeg';
    if (base64Data.includes('data:application/pdf')) {
      contentType = 'application/pdf';
    } else if (base64Data.includes('data:image/png')) {
      contentType = 'image/png';
    } else if (base64Data.includes('data:image/gif')) {
      contentType = 'image/gif';
    }

    const bucket = admin.storage().bucket();
    const filePath = `${folder}/${fileName}`;
    const file = bucket.file(filePath);

    await file.save(buffer, {
      metadata: {
        contentType: contentType
      }
    });

    // Make file public
    await file.makePublic();

    // Return public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    return publicUrl;
  } catch (error) {
    console.error('Error uploading to storage:', error);
    throw error;
  }
};

// POST /api/kyc/submit - Submit KYC documents
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { idType, idNumber, idDocument, selfie } = req.body;

    // Validate required fields
    if (!idType || !idDocument || !selfie) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: idType, idDocument, and selfie are required'
      });
    }

    // Validate ID type
    if (!VALID_ID_TYPES.includes(idType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ID type. Must be one of: ${VALID_ID_TYPES.join(', ')}`
      });
    }

    // Check if user exists
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();

    // Check if KYC is already approved
    if (userData.kycStatus === KYC_STATUS.APPROVED) {
      return res.status(400).json({
        success: false,
        error: 'KYC is already approved'
      });
    }

    // Check if KYC is pending
    if (userData.kycStatus === KYC_STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        error: 'KYC is already pending review. Please wait for admin approval.'
      });
    }

    // Upload ID document to Firebase Storage
    const timestamp = Date.now();
    const idDocExt = idDocument.includes('data:application/pdf') ? 'pdf' : 'jpg';
    const idDocumentUrl = await uploadToStorage(
      idDocument,
      `kyc/${userId}`,
      `id_document_${timestamp}.${idDocExt}`
    );

    // Upload selfie to Firebase Storage
    const selfieUrl = await uploadToStorage(
      selfie,
      `kyc/${userId}`,
      `selfie_${timestamp}.jpg`
    );

    // Update user document with KYC data
    const kycData = {
      kycStatus: KYC_STATUS.PENDING,
      kycSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
      kycDocuments: {
        idType: idType,
        idNumber: idNumber || null,
        idDocument: idDocumentUrl,
        selfie: selfieUrl
      },
      // Clear any previous rejection data
      kycRejectionReason: null,
      kycReviewedAt: null,
      kycReviewedBy: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await userRef.update(kycData);

    console.log(`KYC submitted for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'KYC documents submitted successfully. Please wait for admin review.',
      data: {
        kycStatus: KYC_STATUS.PENDING,
        submittedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('KYC submit error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit KYC documents',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/kyc/status - Get current user's KYC status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Get user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();

    // Prepare response data
    const kycStatusData = {
      status: userData.kycStatus || KYC_STATUS.NOT_SUBMITTED,
      submittedAt: userData.kycSubmittedAt || null,
      reviewedAt: userData.kycReviewedAt || null,
      rejectionReason: userData.kycRejectionReason || null
    };

    // Include document info if submitted (but not the actual URLs for security)
    if (userData.kycDocuments) {
      kycStatusData.documents = {
        idType: userData.kycDocuments.idType,
        hasIdDocument: !!userData.kycDocuments.idDocument,
        hasSelfie: !!userData.kycDocuments.selfie
      };
    }

    res.status(200).json({
      success: true,
      data: kycStatusData
    });

  } catch (error) {
    console.error('KYC status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get KYC status'
    });
  }
});

// PUT /api/kyc/resubmit - Resubmit KYC after rejection
router.put('/resubmit', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { idType, idNumber, idDocument, selfie } = req.body;

    // Validate required fields
    if (!idType || !idDocument || !selfie) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: idType, idDocument, and selfie are required'
      });
    }

    // Validate ID type
    if (!VALID_ID_TYPES.includes(idType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ID type. Must be one of: ${VALID_ID_TYPES.join(', ')}`
      });
    }

    // Check if user exists
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();

    // Check if KYC was rejected (only rejected users can resubmit)
    if (userData.kycStatus === KYC_STATUS.APPROVED) {
      return res.status(400).json({
        success: false,
        error: 'KYC is already approved'
      });
    }

    if (userData.kycStatus === KYC_STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        error: 'KYC is already pending review'
      });
    }

    // Upload new ID document
    const timestamp = Date.now();
    const idDocExt = idDocument.includes('data:application/pdf') ? 'pdf' : 'jpg';
    const idDocumentUrl = await uploadToStorage(
      idDocument,
      `kyc/${userId}`,
      `id_document_${timestamp}.${idDocExt}`
    );

    // Upload new selfie
    const selfieUrl = await uploadToStorage(
      selfie,
      `kyc/${userId}`,
      `selfie_${timestamp}.jpg`
    );

    // Update user document with new KYC data
    const kycData = {
      kycStatus: KYC_STATUS.PENDING,
      kycSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
      kycDocuments: {
        idType: idType,
        idNumber: idNumber || null,
        idDocument: idDocumentUrl,
        selfie: selfieUrl
      },
      kycRejectionReason: null,
      kycReviewedAt: null,
      kycReviewedBy: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await userRef.update(kycData);

    console.log(`KYC resubmitted for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'KYC documents resubmitted successfully. Please wait for admin review.',
      data: {
        kycStatus: KYC_STATUS.PENDING,
        submittedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('KYC resubmit error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resubmit KYC documents',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
