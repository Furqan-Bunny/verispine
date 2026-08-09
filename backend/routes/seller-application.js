const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const { POSTAL_CODE_RE } = require('../utils/locale');

const SELLER_APP_STATUS = {
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

const TERMS_VERSION = '1.0';

// Validate the application body — required fields + length limits
function validateApplication(body) {
  const { fullName, companyName, phoneNumber, address, termsAccepted } = body || {};

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return 'fullName is required (min 2 characters)';
  }
  if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
    return 'companyName is required (min 2 characters)';
  }
  if (companyName.trim().length > 60) {
    return 'companyName must be 60 characters or fewer';
  }
  if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length < 7) {
    return 'phoneNumber is required';
  }
  if (!address || typeof address !== 'object') {
    return 'address is required';
  }
  const { street, city, province, postalCode, country } = address;
  if (!street || !city || !province || !postalCode || !country) {
    return 'address must include street, city, province, postalCode, country';
  }
  // US ZIP, not the 4-digit South African postal code this was written against.
  // With the old rule no real US address could pass, so seller onboarding was
  // closed to everyone.
  if (!POSTAL_CODE_RE.test(String(postalCode).trim())) {
    return 'address.postalCode must be a 5-digit ZIP code (ZIP+4 accepted)';
  }
  if (termsAccepted !== true) {
    return 'You must accept the seller terms to submit';
  }
  return null;
}

// Build the application sub-document from request body
function buildApplicationData(body, status) {
  const { fullName, companyName, phoneNumber, address, businessRegNumber, taxNumber } = body;
  return {
    status,
    fullName: fullName.trim(),
    companyName: companyName.trim(),
    phoneNumber: phoneNumber.trim(),
    address: {
      street: address.street.trim(),
      city: address.city.trim(),
      province: address.province.trim(),
      postalCode: String(address.postalCode).trim(),
      country: address.country.trim()
    },
    businessRegNumber: businessRegNumber ? String(businessRegNumber).trim() : null,
    taxNumber: taxNumber ? String(taxNumber).trim() : null,
    termsAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    termsVersion: TERMS_VERSION,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null
  };
}

// POST /api/seller-application/submit — seller application submission (KYC-gated)
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    const validationError = validateApplication(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userData = userDoc.data();

    // KYC-gated: require approved KYC for self-service path
    if (userData.kycStatus !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        error: 'KYC must be approved before applying to be a seller',
        code: 'KYC_REQUIRED'
      });
    }

    // Already a seller — nothing to apply for
    if (userData.role === 'seller' || userData.role === 'admin') {
      return res.status(400).json({
        success: false,
        error: 'You already have seller privileges'
      });
    }

    const currentStatus = userData.sellerApplication?.status;
    if (currentStatus === SELLER_APP_STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        error: 'Your seller application is already pending review'
      });
    }
    if (currentStatus === SELLER_APP_STATUS.APPROVED) {
      return res.status(400).json({
        success: false,
        error: 'Your seller application is already approved'
      });
    }

    const applicationData = buildApplicationData(req.body, SELLER_APP_STATUS.PENDING);

    await userRef.update({
      sellerApplication: applicationData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Seller application submitted by user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Seller application submitted. Please wait for admin review.',
      data: {
        status: SELLER_APP_STATUS.PENDING,
        submittedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Seller application submit error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit seller application',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/seller-application/status — current user's application state
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userData = userDoc.data();
    const app = userData.sellerApplication;

    res.status(200).json({
      success: true,
      data: {
        status: app?.status || SELLER_APP_STATUS.NOT_SUBMITTED,
        submittedAt: app?.submittedAt || null,
        reviewedAt: app?.reviewedAt || null,
        rejectionReason: app?.rejectionReason || null,
        kycStatus: userData.kycStatus || 'NOT_SUBMITTED',
        role: userData.role || 'user',
        // echo back the form values so the UI can prefill on resubmit
        fullName: app?.fullName || null,
        companyName: app?.companyName || null,
        phoneNumber: app?.phoneNumber || null,
        address: app?.address || null,
        businessRegNumber: app?.businessRegNumber || null,
        taxNumber: app?.taxNumber || null
      }
    });
  } catch (error) {
    console.error('Seller application status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get seller application status' });
  }
});

// PUT /api/seller-application/resubmit — resubmit after rejection
router.put('/resubmit', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    const validationError = validateApplication(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userData = userDoc.data();

    if (userData.kycStatus !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        error: 'KYC must be approved to apply',
        code: 'KYC_REQUIRED'
      });
    }

    const currentStatus = userData.sellerApplication?.status;
    if (currentStatus !== SELLER_APP_STATUS.REJECTED) {
      return res.status(400).json({
        success: false,
        error: 'Only rejected applications can be resubmitted'
      });
    }

    const applicationData = buildApplicationData(req.body, SELLER_APP_STATUS.PENDING);

    await userRef.update({
      sellerApplication: applicationData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Seller application resubmitted by user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Seller application resubmitted. Please wait for admin review.',
      data: {
        status: SELLER_APP_STATUS.PENDING,
        submittedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Seller application resubmit error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resubmit seller application',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
