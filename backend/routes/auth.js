const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { userUtils } = require('../utils/firestore');
const { firebaseAuthMiddleware } = require('../middleware/firebaseAuth');
const crypto = require('crypto');
const emailService = require('../services/resendEmailService');

// Register
router.post('/register', [
  body('username').isLength({ min: 3 }).trim(),
  body('email').isEmail().customSanitizer(v => String(v).toLowerCase().trim()),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, firstName, lastName, referralCode } = req.body;

    console.log('========== REGISTER REQUEST ==========');
    console.log('Email:', email);
    console.log('Username:', username);
    console.log('ReferralCode received:', referralCode || 'NONE');

    // Check if user exists
    const existingUser = await userUtils.findByEmailOrUsername(email, username);
    console.log('Existing user found:', existingUser ? 'YES (id: ' + existingUser.id + ')' : 'NO');

    if (existingUser) {
      // If user exists but is unverified (Firebase creates user first, then calls backend)
      // Generate OTP and send it
      if (!existingUser.emailVerified) {
        console.log('Existing unverified user - generating OTP...');
        const otp = crypto.randomInt(100000, 999999).toString();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await userUtils.update(existingUser.id, {
          otp,
          otpExpiresAt,
          otpAttempts: 0,
          lastOtpSentAt: new Date()
        });

        // Send OTP email
        try {
          await emailService.sendOTPEmail({
            email,
            firstName: existingUser.firstName || firstName,
            otp
          });
          console.log('OTP email sent to existing unverified user:', email);
        } catch (emailError) {
          console.error('Error sending OTP email:', emailError);
        }

        // Process referral if code is provided
        if (referralCode) {
          try {
            const { processReferralReward } = require('./affiliate');
            await processReferralReward(referralCode, existingUser.id, email);
            console.log('Referral processed for existing Firebase user:', existingUser.id);
          } catch (referralError) {
            console.error('Error processing referral for existing user:', referralError);
          }
        }

        return res.status(200).json({
          message: 'Verification code sent to your email.',
          referralProcessed: !!referralCode
        });
      }
      return res.status(400).json({ error: 'User already exists' });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user - Always as buyer (user role), only admin can be seller
    const user = await userUtils.create({
      username,
      email,
      password,
      firstName,
      lastName,
      role: 'user', // All registrations are buyers
      otp,
      otpExpiresAt,
      otpAttempts: 0,
      lastOtpSentAt: new Date(),
      emailVerified: false,
      isActive: true,
      balance: 0,
      preferences: {
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        categories: []
      },
      wishlist: [],
      following: [],
      followers: [],
      ratings: {
        average: 0,
        count: 0
      }
    });

    // Send OTP email
    try {
      await emailService.sendOTPEmail({
        email,
        firstName,
        otp
      });
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      // Don't fail registration if email fails
    }

    // Process referral if code is provided
    if (referralCode) {
      try {
        // Import and call the referral processing function directly
        const { processReferralReward } = require('./affiliate');
        await processReferralReward(referralCode, user.id, email);
        console.log('Referral processed successfully for user:', user.id);
      } catch (error) {
        console.error('Error processing referral:', error);
        // Don't fail registration if referral processing fails
      }
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().customSanitizer(v => String(v).toLowerCase().trim()),
  body('password').notEmpty()
], async (req, res) => {
  try {
    console.log('Login attempt for:', req.body.email);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await userUtils.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    if (!user.password) {
      console.log('User has no password field, might be a social login user');
      return res.status(401).json({ error: 'Invalid credentials - please reset your password' });
    }
    
    const isMatch = await userUtils.comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    /**
     * Email verification gate.
     *
     * Registration sends an OTP but creates the account immediately, so without
     * this check anyone can sign up with an address they don't control and use
     * the platform — including receiving order and payout mail at it. The
     * response carries `requiresVerification` and the address so the client can
     * send the user to the OTP screen instead of showing a credentials error.
     */
    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email address before signing in.',
        requiresVerification: true,
        email: user.email
      });
    }

    // Update last login
    await userUtils.update(user.id, { lastLogin: new Date() });

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('Login successful for:', user.email);
    
    res.json({
      token,
      user: {
        id: user.id,
        uid: user.id, // Add uid for mobile app compatibility
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        balance: user.balance || 0,
        emailVerified: user.emailVerified || false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Verify email with OTP
router.post('/verify-email', [
  body('email').isEmail().customSanitizer(v => String(v).toLowerCase().trim()),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;

    // Find user by email
    const user = await userUtils.findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.json({ success: true, message: 'Email already verified' });
    }

    // Check attempts (max 5)
    if ((user.otpAttempts || 0) >= 5) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    // Check expiry (10 minutes)
    const otpExpiresAt = user.otpExpiresAt?.toDate ? user.otpExpiresAt.toDate() : new Date(user.otpExpiresAt);
    if (!user.otp || new Date() > otpExpiresAt) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    // Compare OTP
    if (user.otp !== otp) {
      // Increment attempts
      await userUtils.update(user.id, { otpAttempts: (user.otpAttempts || 0) + 1 });
      const remaining = 5 - ((user.otpAttempts || 0) + 1);
      return res.status(400).json({ error: `Incorrect verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
    }

    // OTP is correct - verify user
    await userUtils.update(user.id, {
      emailVerified: true,
      otp: null,
      otpExpiresAt: null,
      otpAttempts: null,
      lastOtpSentAt: null,
      verifiedAt: new Date()
    });

    // Send welcome email now that user is verified
    try {
      await emailService.sendWelcomeEmail({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        uid: user.id
      });
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
    }

    res.json({
      success: true,
      message: 'Email verified successfully!'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend OTP verification code
router.post('/resend-verification', [
  body('email').isEmail().customSanitizer(v => String(v).toLowerCase().trim())
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find user
    const user = await userUtils.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists or not
      return res.json({ success: true, message: 'If the email exists, a verification code has been sent.' });
    }

    if (user.emailVerified) {
      return res.json({ success: true, message: 'Email is already verified.' });
    }

    // Rate limit: 60 seconds between sends
    if (user.lastOtpSentAt) {
      const lastSent = user.lastOtpSentAt?.toDate ? user.lastOtpSentAt.toDate() : new Date(user.lastOtpSentAt);
      const secondsSince = (Date.now() - lastSent.getTime()) / 1000;
      if (secondsSince < 60) {
        const waitTime = Math.ceil(60 - secondsSince);
        return res.status(429).json({ error: `Please wait ${waitTime} seconds before requesting a new code.` });
      }
    }

    // Generate new OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await userUtils.update(user.id, {
      otp,
      otpExpiresAt,
      otpAttempts: 0,
      lastOtpSentAt: new Date()
    });

    // Send OTP email
    try {
      await emailService.sendOTPEmail({
        email: user.email,
        firstName: user.firstName,
        otp
      });
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
    }

    res.json({ success: true, message: 'A new verification code has been sent to your email.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Request password reset
router.post('/forgot-password', [
  body('email').isEmail().customSanitizer(v => String(v).toLowerCase().trim())
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find user
    const user = await userUtils.findByEmail(email);

    // Always return success message to prevent email enumeration
    const successMessage = 'If an account exists with this email, a password reset link has been sent.';

    if (!user) {
      return res.json({ message: successMessage });
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    await userUtils.update(user.id, {
      resetToken,
      resetTokenExpiry
    });

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail({
        email: user.email,
        firstName: user.firstName,
        uid: user.id,
        resetToken
      });
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError);
    }

    res.json({ message: successMessage });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    // Find user with this reset token
    const user = await userUtils.findByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token has expired
    if (user.resetTokenExpiry && new Date(user.resetTokenExpiry) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Hash new password and update user
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    await userUtils.update(user.id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
      passwordChangedAt: new Date()
    });

    // Keep the Firebase Auth password in sync with the Firestore hash so the two stores don't drift
    // (Firebase client login would otherwise keep using the old password). Best-effort: JWT-only
    // accounts have no Firebase Auth user, so user-not-found here is expected and non-fatal.
    try {
      const { admin } = require('../config/firebase');
      if (admin && admin.auth) {
        await admin.auth().updateUser(user.id, { password });
      }
    } catch (fbError) {
      if (fbError.code !== 'auth/user-not-found') {
        console.error('reset-password: Firebase Auth sync failed (Firestore already updated):', fbError.code || fbError.message);
      }
    }

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail({
        email: user.email,
        firstName: user.firstName
      });
    } catch (emailError) {
      console.error('Error sending password changed email:', emailError);
    }

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', firebaseAuthMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      avatar: req.user.avatar,
      balance: req.user.balance,
      emailVerified: req.user.emailVerified,
      address: req.user.address,
      phone: req.user.phone,
      preferences: req.user.preferences
    }
  });
});

// Logout (client-side token removal, but we can track it server-side if needed)
router.post('/logout', firebaseAuthMiddleware, async (req, res) => {
  try {
    // Here you could implement token blacklisting if needed
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;