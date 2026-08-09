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

/**
 * Upload a base64 identity document to Storage and return its STORAGE PATH.
 *
 * Deliberately not a public URL. These are government ID scans and selfies; a
 * public object URL is unguessable but permanent and unauthenticated, so once it
 * leaks — a support ticket, a screenshot, a log line — it is exposed forever with
 * no way to revoke it. The path is stored instead, and readers ask for a
 * short-lived signed URL when they actually need to look (see signedUrlFor).
 */
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

    return filePath;
  } catch (error) {
    console.error('Error uploading to storage:', error);
    throw error;
  }
};

/**
 * Mint a short-lived read URL for a stored KYC object.
 *
 * Tolerates a legacy full URL in place of a path so that documents uploaded
 * before this change still render; those are already public and cannot be made
 * private retroactively, but new uploads are path-only.
 */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Emulator equivalent of a signed URL.
 *
 * Signing needs a service-account private key, which the emulator setup
 * deliberately does not have — so against the emulators signing always fails and
 * KYC review is untestable locally. That is how this path would reach production
 * unexercised. The Storage emulator serves objects directly, so point at that
 * instead; it is local-only and never reachable from a deployed environment.
 */
const emulatorUrlFor = async (objectPath) => {
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (!host) return null;

  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(objectPath);

    /**
     * A download token, not a plain ?alt=media link.
     *
     * storage.rules deny all client reads of kyc/** — correctly — and the
     * emulator enforces those rules on its REST endpoint, so a plain link 403s.
     * A download token bypasses rules the same way a signed URL does in
     * production, which is what makes this a faithful local stand-in.
     */
    const [meta] = await file.getMetadata();
    let token = meta.metadata && meta.metadata.firebaseStorageDownloadTokens;
    if (!token) {
      token = `local-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }

    return `http://${host}/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  } catch (e) {
    console.error('Emulator KYC URL failed:', e.message);
    return null;
  }
};

const signedUrlFor = async (pathOrUrl) => {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl; // legacy public URL

  try {
    const bucket = admin.storage().bucket();
    const [url] = await bucket.file(pathOrUrl).getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
    return url;
  } catch (error) {
    const local = await emulatorUrlFor(pathOrUrl);
    if (local) return local;

    /**
     * In production this means the service account cannot sign — usually a key
     * without a private key (ADC/Workload Identity) or a missing
     * iam.serviceAccounts.signBlob permission. Returning null silently would
     * show the reviewer an empty box and no reason, so the caller gets an
     * explicit marker it can render as an error instead.
     */
    console.error('Failed to sign KYC document URL:', error.message);
    return { error: 'unavailable', reason: error.message };
  }
};

/**
 * Replace stored document paths with signed URLs on a `kycDocuments` block before
 * it goes out over the API. Every response that carries KYC images must go
 * through this — returning the raw path leaks the object name and renders as a
 * broken image, while returning nothing leaves admins unable to review.
 */
const withSignedDocuments = async (kycDocuments) => {
  if (!kycDocuments) return kycDocuments;
  const [idDocument, selfie] = await Promise.all([
    signedUrlFor(kycDocuments.idDocument),
    signedUrlFor(kycDocuments.selfie),
  ]);
  return { ...kycDocuments, idDocument, selfie };
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
// Exported so the admin review endpoint signs the same way this route does —
// two implementations of "how do we expose an ID scan" is how one of them ends
// up leaking.
module.exports.withSignedDocuments = withSignedDocuments;
module.exports.signedUrlFor = signedUrlFor;
