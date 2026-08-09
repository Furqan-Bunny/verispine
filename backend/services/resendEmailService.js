const { Resend } = require('resend');
const { admin, db } = require('../config/firebase');

/**
 * Build the "Track Your Order" link for the courier that actually shipped the parcel.
 * SAPO → Post Office tracking. ShipLogic → SHIPLOGIC_TRACKING_URL if configured, else the
 * in-app order page (always safe). No tracking number → the order page.
 */
function trackingUrlFor(trackingNumber, carrier, orderUrl) {
  if (!trackingNumber) return orderUrl;
  if (String(carrier || 'SAPO').toLowerCase() === 'shiplogic') {
    const base = process.env.SHIPLOGIC_TRACKING_URL;
    return base
      ? `${base}${base.includes('?') ? '&' : '?'}tracking_reference=${encodeURIComponent(trackingNumber)}`
      : orderUrl;
  }
  return `https://trackingnew.postoffice.co.za/?trackcode=${trackingNumber}`;
}

class ResendEmailService {
  constructor() {
    // Initialize Resend with API key
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    } else {
      this.resend = null;
      console.log('Resend service not initialized - missing RESEND_API_KEY');
    }

    this.senderEmail = process.env.RESEND_SENDER_EMAIL || 'noreply@verispinejointcenters.com';
    this.senderName = process.env.RESEND_SENDER_NAME || 'VeriSpine Joint Centers';
    this.frontendUrl = process.env.FRONTEND_URL || 'https://www.verispinejointcenters.com';
  }

  // Core send email function
  async sendEmail({ to, subject, html }) {
    try {
      // Development mode - just log the email
      if (!this.resend) {
        console.log('Email (dev mode):', { to, subject, preview: html.substring(0, 100) + '...' });
        return { success: true, messageId: 'dev-mode-' + Date.now() };
      }

      const { data, error } = await this.resend.emails.send({
        from: `${this.senderName} <${this.senderEmail}>`,
        to: [to],
        subject: subject,
        html: html
      });

      if (error) {
        console.error('Resend error:', error);
        throw error;
      }

      console.log('Email sent via Resend:', data.id);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error('Resend email error:', error);
      throw error;
    }
  }

  // Get email header HTML (mobile responsive)
  getHeader(title, bgColor = 'linear-gradient(135deg, #1A8C7A 0%, #0B2A45 100%)') {
    return `
      <div class="email-header" style="background: ${bgColor}; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px; word-break: break-word;">${title}</h1>
      </div>
    `;
  }

  // Get email footer HTML (mobile responsive)
  getFooter() {
    return `
      <div class="email-footer" style="padding: 20px; background: #333; color: #999; text-align: center; font-size: 12px; border-radius: 0 0 10px 10px;">
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} VeriSpine Joint Centers. All rights reserved.</p>
        <p style="margin: 5px 0 0;"><a href="${this.frontendUrl}" style="color: #999;">www.verispinejointcenters.com</a></p>
      </div>
    `;
  }

  // Get email wrapper (mobile responsive)
  wrapEmail(content) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <style>
          @media only screen and (max-width: 620px) {
            .email-container { width: 100% !important; margin: 0 !important; border-radius: 0 !important; }
            .email-body { padding: 20px 15px !important; }
            .email-header { padding: 20px 15px !important; }
            .email-footer { padding: 15px !important; }
            .email-btn { padding: 12px 25px !important; font-size: 14px !important; }
            table { width: 100% !important; }
            img { max-width: 100% !important; height: auto !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 20px; background: #f5f5f5; font-family: Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
        <div class="email-container" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          ${content}
        </div>
      </body>
      </html>
    `;
  }

  // ==================== AUTHENTICATION EMAILS ====================

  // Send OTP verification email
  async sendOTPEmail({ email, firstName, otp }) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('Verify Your Email')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Thank you for signing up for VeriSpine! Please use the following verification code to complete your registration.</p>

          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background: #f8f9fa; border: 2px dashed #1E4F7A; border-radius: 10px; padding: 20px 40px;">
              <p style="margin: 0 0 5px; font-size: 14px; color: #666;">Your verification code</p>
              <p style="margin: 0; font-size: 36px; font-family: 'Courier New', monospace; letter-spacing: 8px; color: #333; font-weight: bold;">${otp}</p>
            </div>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin-top: 20px;">
            <p style="margin: 0; font-size: 14px; color: #856404;">
              <strong>Note:</strong> This code will expire in 10 minutes. If you didn't create an account, please ignore this email.
            </p>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: email, subject: 'Your Verification Code - VeriSpine', html });
      await this.logEmailSent('otp_verification', email);
      return true;
    } catch (error) {
      console.error('Error sending OTP email:', error);
      return false;
    }
  }

  // Send welcome email
  async sendWelcomeEmail(user) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('Welcome to VeriSpine!')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Thank you for joining VeriSpine Joint Centers.</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Get Started:</h3>
            <ul style="list-style: none; padding: 0; margin: 0; color: #666;">
              <li style="padding: 8px 0;">✅ Browse our featured auctions</li>
              <li style="padding: 8px 0;">✅ Place your first bid</li>
              <li style="padding: 8px 0;">✅ Add items to your wishlist</li>
              <li style="padding: 8px 0;">✅ Set up bid alerts</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.frontendUrl}/products"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Start Bidding Now
            </a>
          </div>

          <p style="color: #666; font-size: 14px;">
            If you have any questions, feel free to contact our support team.
          </p>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: 'Welcome to VeriSpine Joint Centers!', html });
      await this.logEmailSent('welcome', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(user) {
    try {
      const resetUrl = `${this.frontendUrl}/reset-password?token=${user.resetToken}`;

      const html = this.wrapEmail(`
        ${this.getHeader('🔐 Password Reset Request', '#dc3545')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">We received a request to reset your password for your VeriSpine account.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
               style="display: inline-block; background: #dc3545; color: white; padding: 15px 40px;
                      text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
              Reset My Password
            </a>
          </div>

          <p style="color: #666; font-size: 14px;">
            Or copy and paste this link in your browser:<br>
            <a href="${resetUrl}" style="color: #dc3545; word-break: break-all;">${resetUrl}</a>
          </p>

          <div style="background: #f8d7da; padding: 15px; border-radius: 5px; border-left: 4px solid #dc3545; margin-top: 20px;">
            <p style="margin: 0; font-size: 14px; color: #721c24;">
              <strong>Important:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
            </p>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: 'Reset Your Password - VeriSpine', html });
      await this.logEmailSent('password_reset', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return false;
    }
  }

  // Send password changed confirmation
  async sendPasswordChangedEmail(user) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('✅ Password Changed Successfully', '#28a745')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Your password has been successfully changed.</p>

          <div style="background: #d4edda; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 16px; color: #155724;">
              You can now log in with your new password.
            </p>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin-top: 20px;">
            <p style="margin: 0; font-size: 14px; color: #856404;">
              <strong>Didn't make this change?</strong><br>
              If you didn't change your password, please contact our support team immediately.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${this.frontendUrl}/login"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px;">
              Login to Your Account
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: 'Your Password Has Been Changed - VeriSpine', html });
      await this.logEmailSent('password_changed', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending password changed email:', error);
      return false;
    }
  }

  // ==================== KYC EMAILS ====================

  // Send KYC approved email
  async sendKYCApprovedEmail({ email, firstName }) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('KYC Verified!', '#28a745')}
        <div class="email-body" style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Great news! Your KYC verification has been approved.</p>

          <div style="background: #d4edda; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 18px; color: #155724; font-weight: bold;">
              Your identity has been verified
            </p>
          </div>

          <p style="color: #666; line-height: 1.6;">You now have full access to all VeriSpine features, including:</p>
          <ul style="color: #666; line-height: 1.8;">
            <li>Higher transaction limits</li>
            <li>Affiliate program access</li>
            <li>Priority support</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.frontendUrl}/dashboard" class="email-btn"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Go to Dashboard
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: email, subject: 'KYC Verified - VeriSpine', html });
      await this.logEmailSent('kyc_approved', email);
      return true;
    } catch (error) {
      console.error('Error sending KYC approved email:', error);
      return false;
    }
  }

  // Send KYC rejected email
  async sendKYCRejectedEmail({ email, firstName, reason }) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('KYC Verification Update', '#dc3545')}
        <div class="email-body" style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${firstName || 'there'},</h2>
          <p style="color: #666; line-height: 1.6;">Unfortunately, your KYC verification could not be approved at this time.</p>

          <div style="background: #f8d7da; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <p style="margin: 0 0 5px; font-weight: bold; color: #721c24;">Reason:</p>
            <p style="margin: 0; color: #721c24;">${reason || 'Please contact support for more details.'}</p>
          </div>

          <p style="color: #666; line-height: 1.6;">You can resubmit your KYC documents at any time. Please ensure:</p>
          <ul style="color: #666; line-height: 1.8;">
            <li>Documents are clear and readable</li>
            <li>Information matches your account details</li>
            <li>All required documents are provided</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.frontendUrl}/profile" class="email-btn"
               style="display: inline-block; background: #dc3545; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Resubmit KYC
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: email, subject: 'KYC Verification Update - VeriSpine', html });
      await this.logEmailSent('kyc_rejected', email);
      return true;
    } catch (error) {
      console.error('Error sending KYC rejected email:', error);
      return false;
    }
  }

  // ==================== SELLER APPLICATION EMAILS ====================

  // Send seller application approved email
  async sendSellerApplicationApprovedEmail({ email, firstName, businessName }) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('You\'re a VeriSpine Seller!', '#28a745')}
        <div class="email-body" style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Welcome aboard, ${firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">
            Great news — your seller application for <strong>${businessName || 'your business'}</strong> has been approved.
            You can now list products and start earning on VeriSpine.
          </p>

          <div style="background: #d4edda; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 18px; color: #155724; font-weight: bold;">
              Your seller account is live
            </p>
          </div>

          <p style="color: #666; line-height: 1.6;">Here's what you can do next:</p>
          <ul style="color: #666; line-height: 1.8;">
            <li>Create your first auction or Buy-Now listing</li>
            <li>Customize your storefront in business settings</li>
            <li>Track sales, payouts and analytics in your seller dashboard</li>
            <li>Receive payments to your registered bank account</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.frontendUrl}/seller/dashboard" class="email-btn"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Go to Seller Dashboard
            </a>
          </div>

          <p style="color: #999; font-size: 13px; line-height: 1.6; margin-top: 24px;">
            VeriSpine takes a 10% platform fee on each sale. Funds become available once orders are marked delivered.
          </p>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: email, subject: 'You\'re a VeriSpine Seller! - Application Approved', html });
      await this.logEmailSent('seller_application_approved', email);
      return true;
    } catch (error) {
      console.error('Error sending seller application approved email:', error);
      return false;
    }
  }

  // Send seller application rejected email
  async sendSellerApplicationRejectedEmail({ email, firstName, reason }) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('Seller Application Update', '#dc3545')}
        <div class="email-body" style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${firstName || 'there'},</h2>
          <p style="color: #666; line-height: 1.6;">
            Thanks for applying to sell on VeriSpine. Unfortunately, your seller application could not be approved at this time.
          </p>

          <div style="background: #f8d7da; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <p style="margin: 0 0 5px; font-weight: bold; color: #721c24;">Reason:</p>
            <p style="margin: 0; color: #721c24;">${reason || 'Please contact support for more details.'}</p>
          </div>

          <p style="color: #666; line-height: 1.6;">You're welcome to update your details and resubmit. Please make sure:</p>
          <ul style="color: #666; line-height: 1.8;">
            <li>Your business information matches official records</li>
            <li>Address and contact details are accurate</li>
            <li>All required fields are completed</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.frontendUrl}/become-seller" class="email-btn"
               style="display: inline-block; background: #dc3545; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Update & Resubmit
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: email, subject: 'Seller Application Update - VeriSpine', html });
      await this.logEmailSent('seller_application_rejected', email);
      return true;
    } catch (error) {
      console.error('Error sending seller application rejected email:', error);
      return false;
    }
  }

  // ==================== BIDDING EMAILS ====================

  // Send bid confirmation
  async sendBidConfirmation(user, bid, product) {
    try {
      const productUrl = `${this.frontendUrl}/products/${product.id || bid.productId}`;
      const endDate = product.endDate?._seconds
        ? new Date(product.endDate._seconds * 1000).toLocaleString()
        : new Date(product.endDate).toLocaleString();

      const html = this.wrapEmail(`
        ${this.getHeader('Bid Confirmed! 🎉', '#28a745')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Your bid has been placed successfully!</h2>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">${product.title || product.name}</h3>
            ${product.images?.[0] ? `<img src="${product.images[0]}" alt="${product.title}" style="width: 100%; max-width: 300px; border-radius: 10px; margin: 10px 0;">` : ''}

            <table style="width: 100%; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Your Bid Amount:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                  <strong style="color: #28a745; font-size: 20px;">$${bid.amount}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Auction Ends:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${endDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px;">Current Status:</td>
                <td style="padding: 10px; text-align: right;">
                  <span style="background: #28a745; color: white; padding: 5px 10px; border-radius: 5px;">Highest Bidder</span>
                </td>
              </tr>
            </table>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 14px; color: #856404;">
              <strong>Important:</strong> Keep an eye on this auction! You'll be notified if someone outbids you.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${productUrl}"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px;">
              View Auction
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `Bid Confirmed: ${product.title || product.name}`, html });
      await this.logEmailSent('bid_confirmation', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending bid confirmation:', error);
      return false;
    }
  }

  // Send outbid notification
  async sendOutbidNotification(user, product, newBidAmount) {
    try {
      const productUrl = `${this.frontendUrl}/products/${product.id}`;

      const html = this.wrapEmail(`
        ${this.getHeader("You've Been Outbid! ⚡", '#dc3545')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Someone just placed a higher bid!</h2>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">${product.title || product.name}</h3>

            <table style="width: 100%; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">New Highest Bid:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                  <strong style="color: #dc3545; font-size: 20px;">$${newBidAmount}</strong>
                </td>
              </tr>
            </table>

            <p style="text-align: center; margin: 20px 0; color: #333;">
              <strong>Don't let this one get away!</strong>
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${productUrl}"
               style="display: inline-block; background: #dc3545; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px;">
              Place a Higher Bid Now
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `You've been outbid on: ${product.title || product.name}`, html });
      await this.logEmailSent('outbid_notification', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending outbid notification:', error);
      return false;
    }
  }

  // Send auction won notification
  async sendAuctionWonNotification(user, product, finalAmount, orderId) {
    try {
      const checkoutUrl = orderId
        ? `${this.frontendUrl}/orders/${orderId}`
        : `${this.frontendUrl}/products/${product.id}`;

      const html = this.wrapEmail(`
        ${this.getHeader('🎉 Congratulations! You Won! 🎉')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">You've won the auction!</h2>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">${product.title || product.name}</h3>
            ${product.images?.[0] ? `<img src="${product.images[0]}" alt="${product.title}" style="width: 100%; max-width: 300px; border-radius: 10px; margin: 10px 0;">` : ''}

            <table style="width: 100%; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Winning Bid:</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                  <strong style="color: #28a745; font-size: 24px;">$${finalAmount}</strong>
                </td>
              </tr>
            </table>

            <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #155724;">Next Steps:</h4>
              <ol style="margin: 0; padding-left: 20px; color: #155724;">
                <li>Complete payment within 7 days</li>
                <li>Arrange shipping or collection</li>
                <li>Leave feedback for the seller</li>
              </ol>
            </div>

            <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #856404;">
                <strong>Payment Deadline:</strong> You have 7 days from now to complete your payment. If payment is not received by then, the order will be automatically cancelled and the item will be re-listed.
              </p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${checkoutUrl}"
               style="display: inline-block; background: #28a745; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px; font-size: 16px;">
              Complete Purchase
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `Congratulations! You won: ${product.title || product.name}`, html });
      await this.logEmailSent('auction_won', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending auction won notification:', error);
      return false;
    }
  }

  // ==================== ORDER & PAYMENT EMAILS ====================

  // Send payment confirmation
  async sendPaymentConfirmation(user, order) {
    try {
      const orderUrl = `${this.frontendUrl}/orders/${order.id || order.orderId}`;

      const html = this.wrapEmail(`
        ${this.getHeader('Payment Successful!', '#28a745')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Your payment has been processed successfully.</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Order Details:</h3>
            <p><strong>Item:</strong> ${order.productTitle}</p>
            <p><strong>Amount:</strong> $${order.amount || order.totalAmount}</p>
            <p><strong>Order ID:</strong> ${order.id || order.orderId || 'N/A'}</p>
            <p><strong>Payment Method:</strong> ${order.paymentMethod || 'N/A'}</p>
          </div>

          <p style="color: #666;">The seller has been notified and will arrange shipping soon.</p>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${orderUrl}"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px;">
              View Order
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `Payment Confirmed - ${order.productTitle}`, html });
      await this.logEmailSent('payment_confirmation', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending payment confirmation:', error);
      return false;
    }
  }

  // Send sale notification to seller
  async sendSaleNotification(seller, order) {
    try {
      const orderUrl = `${this.frontendUrl}/orders/${order.id || order.orderId}`;
      const platformFee = Number(order.amount || order.totalAmount || 0) * 0.1;
      const sellerAmount = Number(order.amount || order.totalAmount || 0) - platformFee;

      const html = this.wrapEmail(`
        ${this.getHeader('🎉 Item Sold!', '#28a745')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${seller.firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Great news! Your item has been sold.</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Sale Details:</h3>
            <p><strong>Item:</strong> ${order.productTitle}</p>
            <p><strong>Sale Price:</strong> $${order.amount || order.totalAmount}</p>
            <p><strong>Platform Fee (10%):</strong> $${platformFee.toFixed(2)}</p>
            <p><strong>Your Earnings:</strong> <span style="color: #28a745; font-size: 18px; font-weight: bold;">$${sellerAmount.toFixed(2)}</span></p>
            <p><strong>Buyer:</strong> ${order.buyerName || 'Customer'}</p>
          </div>

          <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #1565c0;">Next Steps:</h4>
            <ol style="margin: 0; padding-left: 20px; color: #1565c0;">
              <li>Package the item securely</li>
              <li>Ship to the buyer within 2 business days</li>
              <li>Update the order with tracking information</li>
            </ol>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${orderUrl}"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px;">
              View Order Details
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: seller.email, subject: `Item Sold - ${order.productTitle}`, html });
      await this.logEmailSent('sale_notification', seller.email, seller.uid);
      return true;
    } catch (error) {
      console.error('Error sending sale notification:', error);
      return false;
    }
  }

  // Send comprehensive order confirmation with invoice and shipping details
  async sendOrderConfirmationWithInvoice(user, order, shippingInfo) {
    try {
      const orderUrl = `${this.frontendUrl}/orders/${order.id || order.orderId}`;
      const orderDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;

      // Calculate amounts
      const subtotal = Number(order.amount || order.totalAmount || 0);
      const shippingCost = Number(order.shippingCost || order.shipping?.cost || 0);
      const platformFee = subtotal * 0.15; // 15% VAT
      const total = subtotal + shippingCost;

      // Get shipping address
      const shipping = order.shippingInfo || order.shippingAddress || {};

      const html = this.wrapEmail(`
        ${this.getHeader('✅ Order Confirmed & Shipped!', '#28a745')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || user.name || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Thank you for your purchase! Your order has been confirmed and shipped.</p>

          <!-- Invoice Header -->
          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px solid #dee2e6;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <div>
                <h3 style="margin: 0; color: #333; font-size: 20px;">TAX INVOICE</h3>
                <p style="margin: 5px 0 0; color: #666; font-size: 14px;">Invoice #: ${invoiceNumber}</p>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0; color: #666; font-size: 14px;">Date: ${orderDate}</p>
                <p style="margin: 5px 0 0; color: #666; font-size: 14px;">Order ID: ${(order.id || order.orderId || '').slice(-8).toUpperCase()}</p>
              </div>
            </div>

            <hr style="border: none; border-top: 1px solid #dee2e6; margin: 15px 0;">

            <!-- Product Details -->
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #e9ecef;">
                  <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Item</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Qty</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Price</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 12px 10px; border-bottom: 1px solid #dee2e6;">
                    <strong>${order.productTitle || 'Product'}</strong>
                  </td>
                  <td style="padding: 12px 10px; text-align: center; border-bottom: 1px solid #dee2e6;">1</td>
                  <td style="padding: 12px 10px; text-align: right; border-bottom: 1px solid #dee2e6;">$${subtotal.toFixed(2)}</td>
                </tr>
                ${shippingCost > 0 ? `
                <tr>
                  <td style="padding: 12px 10px; border-bottom: 1px solid #dee2e6;">Shipping (SAPO)</td>
                  <td style="padding: 12px 10px; text-align: center; border-bottom: 1px solid #dee2e6;">-</td>
                  <td style="padding: 12px 10px; text-align: right; border-bottom: 1px solid #dee2e6;">$${shippingCost.toFixed(2)}</td>
                </tr>
                ` : ''}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="padding: 12px 10px; text-align: right;"><strong>Subtotal:</strong></td>
                  <td style="padding: 12px 10px; text-align: right;">$${subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding: 12px 10px; text-align: right;">VAT (15%):</td>
                  <td style="padding: 12px 10px; text-align: right;">$${platformFee.toFixed(2)}</td>
                </tr>
                <tr style="background: #e9ecef;">
                  <td colspan="2" style="padding: 12px 10px; text-align: right;"><strong style="font-size: 16px;">TOTAL:</strong></td>
                  <td style="padding: 12px 10px; text-align: right;"><strong style="font-size: 18px; color: #28a745;">$${total.toFixed(2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Shipping Details -->
          <div style="background: #e8f5e9; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="margin: 0 0 15px; color: #2e7d32;">📦 Shipping Details</h3>

            <div style="display: grid; gap: 15px;">
              <div>
                <p style="margin: 0; color: #666; font-size: 12px; text-transform: uppercase;">Carrier</p>
                <p style="margin: 5px 0 0; color: #333; font-weight: bold;">SAPO (South African Post Office)</p>
              </div>

              ${shippingInfo?.trackingNumber ? `
              <div style="background: #fff; padding: 15px; border-radius: 8px;">
                <p style="margin: 0; color: #666; font-size: 12px; text-transform: uppercase;">Tracking Number</p>
                <p style="margin: 5px 0 0; font-size: 20px; font-family: monospace; color: #1976d2; font-weight: bold;">
                  ${shippingInfo.trackingNumber}
                </p>
              </div>
              ` : ''}

              <div>
                <p style="margin: 0; color: #666; font-size: 12px; text-transform: uppercase;">Delivery Address</p>
                <p style="margin: 5px 0 0; color: #333;">
                  ${shipping.fullName || order.buyerName || 'Customer'}<br>
                  ${shipping.address || ''}<br>
                  ${shipping.city || ''}, ${shipping.province || ''} ${shipping.postalCode || ''}<br>
                  ${shipping.phone || ''}
                </p>
              </div>

              <div>
                <p style="margin: 0; color: #666; font-size: 12px; text-transform: uppercase;">Estimated Delivery</p>
                <p style="margin: 5px 0 0; color: #333; font-weight: bold;">3-5 Business Days</p>
              </div>
            </div>
          </div>

          <!-- Payment Info -->
          <div style="background: #e3f2fd; padding: 15px; border-radius: 10px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px; color: #1565c0;">💳 Payment Information</h4>
            <p style="margin: 0; color: #333;">
              <strong>Method:</strong> ${order.paymentMethod === 'balance' ? 'Wallet Balance' : order.paymentMethod?.toUpperCase() || 'N/A'}<br>
              <strong>Status:</strong> <span style="color: #28a745;">✓ Paid</span><br>
              <strong>Transaction Date:</strong> ${orderDate}
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${trackingUrlFor(shippingInfo?.trackingNumber, shippingInfo?.carrier || order.carrier, orderUrl)}"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 40px;
                      text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
              Track Your Order
            </a>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 14px; color: #856404;">
              <strong>Need Help?</strong> Contact our support team if you have any questions about your order.
            </p>
          </div>

          <!-- Company Details for Invoice -->
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 12px; color: #666;">
            <p style="margin: 0;"><strong>VeriSpine Joint Centers</strong></p>
            <p style="margin: 5px 0;"> United States | www.verispinejointcenters.com</p>
            <p style="margin: 5px 0;">This invoice serves as proof of purchase.</p>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({
        to: user.email,
        subject: `Order Confirmed & Shipped - Invoice #${invoiceNumber}`,
        html
      });
      await this.logEmailSent('order_confirmation_invoice', user.email, user.uid || user.id);
      return true;
    } catch (error) {
      console.error('Error sending order confirmation with invoice:', error);
      return false;
    }
  }

  // Send order shipped notification
  async sendOrderShipped(user, order, trackingNumber) {
    try {
      const orderUrl = `${this.frontendUrl}/orders/${order.orderId || order.id}`;

      const html = this.wrapEmail(`
        ${this.getHeader('📦 Your Order Has Shipped!')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || user.name || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Great news! Your order is on its way.</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">${order.productTitle}</h3>

            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p style="margin: 0; font-size: 14px; color: #2e7d32;">
                <strong>📍 Shipping via:</strong> SAPO (South African Post Office)
              </p>
              <p style="margin: 10px 0 0; font-size: 18px;">
                <strong>Tracking Number:</strong>
                <span style="font-family: monospace; background: #fff; padding: 5px 10px; border-radius: 4px;">
                  ${trackingNumber}
                </span>
              </p>
            </div>

            <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Order ID:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-family: monospace;">
                  ${order.orderId || order.id}
                </td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Order Amount:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                  <strong>$${order.amount || order.totalAmount}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px;">Estimated Delivery:</td>
                <td style="padding: 10px; text-align: right;">3-5 Business Days</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center;">
            <a href="${trackingUrlFor(trackingNumber, order.carrier, orderUrl)}"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px;">
              Track Your Order
            </a>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin-top: 20px;">
            <p style="margin: 0; font-size: 14px; color: #856404;">
              <strong>Tip:</strong> You can track your package in real-time on your order page. Keep your tracking number safe!
            </p>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `Your order has been shipped! - ${order.productTitle}`, html });
      await this.logEmailSent('order_shipped', user.email, user.uid || user.id);
      return true;
    } catch (error) {
      console.error('Error sending order shipped email:', error);
      return false;
    }
  }

  // Send order delivered notification
  async sendOrderDelivered(user, order) {
    try {
      const orderUrl = `${this.frontendUrl}/orders/${order.orderId || order.id}`;
      const deliveryDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      const html = this.wrapEmail(`
        ${this.getHeader('✅ Your Order Has Been Delivered!', '#28a745')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || user.name || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Your order has been successfully delivered. We hope you love your purchase!</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">${order.productTitle}</h3>

            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center;">
              <span style="font-size: 48px;">🎉</span>
              <p style="margin: 10px 0 0; font-size: 18px; color: #2e7d32; font-weight: bold;">
                Delivery Complete!
              </p>
            </div>

            <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Order ID:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-family: monospace;">
                  ${order.orderId || order.id}
                </td>
              </tr>
              <tr>
                <td style="padding: 10px;">Delivered On:</td>
                <td style="padding: 10px; text-align: right;">${deliveryDate}</td>
              </tr>
            </table>
          </div>

          <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; text-align: center;">
            <h4 style="margin-top: 0; color: #1976d2;">How was your experience?</h4>
            <p style="color: #666; font-size: 14px;">
              Your feedback helps us improve and helps other buyers make informed decisions.
            </p>
            <a href="${orderUrl}"
               style="display: inline-block; background: #1976d2; color: white; padding: 12px 25px;
                      text-decoration: none; border-radius: 5px; margin-top: 10px;">
              ⭐ Leave a Review
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `Your order has been delivered! - ${order.productTitle}`, html });
      await this.logEmailSent('order_delivered', user.email, user.uid || user.id);
      return true;
    } catch (error) {
      console.error('Error sending order delivered email:', error);
      return false;
    }
  }

  // Send order status update
  async sendOrderStatusUpdate(user, order, newStatus) {
    try {
      const statusMessages = {
        'processing': { title: 'Order Being Processed', emoji: '📦', color: '#3b82f6', message: 'Your order is now being processed and will be shipped soon.' },
        'shipped': { title: 'Order Shipped', emoji: '🚚', color: '#8b5cf6', message: 'Your order has been shipped and is on its way to you!' },
        'delivered': { title: 'Order Delivered', emoji: '✅', color: '#10b981', message: 'Your order has been delivered successfully. Enjoy your purchase!' },
        'cancelled': { title: 'Order Cancelled', emoji: '❌', color: '#ef4444', message: 'Your order has been cancelled. If you have any questions, please contact support.' },
        'refunded': { title: 'Order Refunded', emoji: '💰', color: '#f59e0b', message: 'Your order has been refunded. The amount will be credited to your original payment method.' }
      };

      const statusInfo = statusMessages[newStatus] || { title: 'Order Update', emoji: '📋', color: '#6b7280', message: `Your order status has been updated to: ${newStatus}` };
      const orderUrl = `${this.frontendUrl}/orders/${order.orderId || order.id}`;
      const orderId = order.orderId || order.id;

      const html = this.wrapEmail(`
        ${this.getHeader(`${statusInfo.emoji} ${statusInfo.title}`, statusInfo.color)}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || user.name || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">${statusInfo.message}</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${statusInfo.color};">
            <h3 style="margin-top: 0; color: #333;">Order Details</h3>
            <table style="width: 100%;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Order ID:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">#${orderId?.slice(-6) || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Product:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${order.productTitle || 'Product'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">$${order.totalAmount || order.amount || 0}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Status:</strong></td>
                <td style="padding: 8px 0; text-align: right;">
                  <span style="background: ${statusInfo.color}; color: white; padding: 5px 15px; border-radius: 20px; font-size: 14px;">
                    ${newStatus.toUpperCase()}
                  </span>
                </td>
              </tr>
              ${order.trackingNumber ? `
              <tr>
                <td style="padding: 8px 0; border-top: 1px solid #eee;"><strong>Tracking:</strong></td>
                <td style="padding: 8px 0; border-top: 1px solid #eee; text-align: right; font-family: monospace;">${order.trackingNumber}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${orderUrl}"
               style="display: inline-block; background: ${statusInfo.color}; color: white; padding: 15px 40px;
                      text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
              View Order Details
            </a>
          </div>

          <p style="color: #666; font-size: 14px;">
            If you have any questions about your order, please don't hesitate to contact our support team.
          </p>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `${statusInfo.emoji} ${statusInfo.title} - Order #${orderId?.slice(-6) || 'N/A'}`, html });
      await this.logEmailSent('order_status_update', user.email, user.uid || user.id);
      return true;
    } catch (error) {
      console.error('Error sending order status update email:', error);
      return false;
    }
  }

  // ==================== WITHDRAWAL EMAILS ====================

  // Send withdrawal request confirmation
  async sendWithdrawalRequest(user, withdrawal) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('Withdrawal Request Received')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName}!</h2>
          <p style="color: #666; line-height: 1.6;">Your withdrawal request has been submitted successfully and is pending admin approval.</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Withdrawal Details:</h3>
            <p><strong>Amount:</strong> $${withdrawal.amount}</p>
            <p><strong>Bank:</strong> ${withdrawal.bankDetails.bankName}</p>
            <p><strong>Account:</strong> ***${withdrawal.bankDetails.accountNumber.slice(-4)}</p>
            <p><strong>Status:</strong> <span style="background: #ffc107; color: #000; padding: 3px 10px; border-radius: 3px;">Pending Approval</span></p>
          </div>

          <p style="color: #666;">You will receive an email notification once your withdrawal is processed.</p>
          <p style="color: #666;">Processing typically takes 1-2 business days.</p>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: 'Withdrawal Request Submitted', html });
      await this.logEmailSent('withdrawal_request', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending withdrawal request email:', error);
      throw error;
    }
  }

  // Send withdrawal approved notification
  async sendWithdrawalApproved(user, withdrawal, transactionReference) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('✅ Withdrawal Approved!', '#28a745')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName}!</h2>
          <p style="color: #666; line-height: 1.6;">Great news! Your withdrawal request has been approved and processed.</p>

          <div style="background: #d4edda; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #155724;">Transaction Details:</h3>
            <p><strong>Amount:</strong> $${withdrawal.amount}</p>
            <p><strong>Bank:</strong> ${withdrawal.bankDetails.bankName}</p>
            <p><strong>Account:</strong> ***${withdrawal.bankDetails.accountNumber.slice(-4)}</p>
            ${transactionReference ? `<p><strong>Reference:</strong> ${transactionReference}</p>` : ''}
            <p><strong>Status:</strong> <span style="background: #28a745; color: white; padding: 3px 10px; border-radius: 3px;">✅ Completed</span></p>
          </div>

          <p style="color: #666;">The funds should reflect in your account within 1-2 business days.</p>
          <p style="color: #666;">If you have any questions, please contact support.</p>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: 'Withdrawal Approved - Funds Transferred', html });
      await this.logEmailSent('withdrawal_approved', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending withdrawal approval email:', error);
      throw error;
    }
  }

  // Send withdrawal rejected notification
  async sendWithdrawalRejected(user, withdrawal, reason) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('Withdrawal Request Update', '#dc3545')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName},</h2>
          <p style="color: #666; line-height: 1.6;">Your withdrawal request could not be processed at this time.</p>

          <div style="background: #f8d7da; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #721c24;">Request Details:</h3>
            <p><strong>Amount:</strong> $${withdrawal.amount}</p>
            <p><strong>Reason:</strong> ${reason}</p>
          </div>

          <p style="color: #666;">The amount has been refunded to your VeriSpine balance.</p>
          <p style="color: #666;">You may submit a new withdrawal request at any time.</p>
          <p style="color: #666;">If you have questions about this decision, please contact support.</p>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: 'Withdrawal Request Update', html });
      await this.logEmailSent('withdrawal_rejected', user.email, user.uid);
      return true;
    } catch (error) {
      console.error('Error sending withdrawal rejection email:', error);
      throw error;
    }
  }

  // ==================== AFFILIATE/INVITATION EMAILS ====================

  // Send invitation email
  async sendInvitationEmail(data) {
    try {
      const recipientEmail = data.to || data.email;
      const recipientName = data.inviteeName || data.name || 'there';

      const html = this.wrapEmail(`
        ${this.getHeader("🎉 You're Invited to VeriSpine!")}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${recipientName}!</h2>
          <p style="color: #666; line-height: 1.6;"><strong>${data.inviterName}</strong> has invited you to join VeriSpine.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.inviteLink}"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 40px;
                      text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
              Accept Invitation
            </a>
          </div>

          <h3 style="color: #333;">Why Join VeriSpine?</h3>
          <ul style="color: #666; line-height: 1.8;">
            <li>🏆 Bid on exclusive items and great deals</li>
            <li>💰 Sell your items to thousands of buyers</li>
            <li>🔒 Secure transactions and buyer protection</li>
            <li>📱 Easy to use on web and mobile</li>
            <li>🚚 Nationwide delivery options</li>
          </ul>

          <p style="color: #666;">This invitation expires in <strong>30 days</strong>, so don't wait!</p>

          <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 5px; font-size: 14px; color: #666;">
            If you didn't expect this email, you can safely ignore it.
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: recipientEmail, subject: `${data.inviterName} invited you to join VeriSpine`, html });
      return true;
    } catch (error) {
      console.error('Error sending invitation email:', error);
      throw error;
    }
  }

  // Send referral success email (deprecated - no signup bonus)
  async sendReferralSuccessEmail(data) {
    // No longer sending signup bonus emails - commission emails are sent separately
    console.log('sendReferralSuccessEmail called but signup bonus is disabled');
    return true;
  }

  // ==================== PAYMENT DEADLINE EMAILS ====================

  // Send payment reminder email
  async sendPaymentReminderEmail(user, order, hoursRemaining) {
    try {
      const orderUrl = `${this.frontendUrl}/orders/${order.id || order.orderId}`;
      const deadline = order.paymentDeadline?.toDate?.() || new Date(order.paymentDeadline);
      const deadlineStr = deadline.toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      // Urgency-based styling
      let urgencyColor, urgencyBg, urgencyBorder, urgencyText;
      if (hoursRemaining <= 4) {
        urgencyColor = '#dc3545'; urgencyBg = '#f8d7da'; urgencyBorder = '#dc3545';
        urgencyText = 'FINAL WARNING - Payment expires very soon!';
      } else if (hoursRemaining <= 24) {
        urgencyColor = '#fd7e14'; urgencyBg = '#fff3cd'; urgencyBorder = '#fd7e14';
        urgencyText = 'Less than 24 hours remaining!';
      } else {
        urgencyColor = '#ffc107'; urgencyBg = '#fff3cd'; urgencyBorder = '#ffc107';
        urgencyText = 'Payment deadline approaching';
      }

      const timeText = hoursRemaining < 1
        ? `${Math.round(hoursRemaining * 60)} minutes`
        : hoursRemaining < 24
          ? `${Math.round(hoursRemaining)} hours`
          : `${Math.round(hoursRemaining / 24)} day${Math.round(hoursRemaining / 24) !== 1 ? 's' : ''}`;

      const html = this.wrapEmail(`
        ${this.getHeader('Payment Reminder', urgencyColor)}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || 'there'}!</h2>

          <div style="background: ${urgencyBg}; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${urgencyBorder};">
            <p style="margin: 0; font-size: 16px; font-weight: bold; color: ${urgencyColor};">${urgencyText}</p>
            <p style="margin: 10px 0 0; color: #333;">
              You have <strong>${timeText}</strong> remaining to complete payment for your order.
            </p>
          </div>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Order Details:</h3>
            <p><strong>Item:</strong> ${order.productTitle}</p>
            <p><strong>Amount Due:</strong> <span style="color: ${urgencyColor}; font-size: 20px; font-weight: bold;">$${order.amount || order.totalAmount}</span></p>
            <p><strong>Deadline:</strong> ${deadlineStr}</p>
          </div>

          <p style="color: #666;">If payment is not completed by the deadline, the order will be automatically cancelled and the item will be re-listed for auction.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${orderUrl}"
               style="display: inline-block; background: ${urgencyColor}; color: white; padding: 15px 40px;
                      text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
              Complete Payment Now
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `Payment Reminder: ${order.productTitle} - ${timeText} remaining`, html });
      await this.logEmailSent('payment_reminder', user.email, user.uid || user.id);
      return true;
    } catch (error) {
      console.error('Error sending payment reminder email:', error);
      return false;
    }
  }

  // Send payment expired email to buyer
  async sendPaymentExpiredEmail(user, order) {
    try {
      const html = this.wrapEmail(`
        ${this.getHeader('Payment Deadline Expired', '#dc3545')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || 'there'},</h2>
          <p style="color: #666; line-height: 1.6;">Unfortunately, the payment deadline for your order has expired and the order has been cancelled.</p>

          <div style="background: #f8d7da; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <h3 style="margin-top: 0; color: #721c24;">Order Cancelled</h3>
            <p style="margin: 0; color: #721c24;"><strong>Item:</strong> ${order.productTitle}</p>
            <p style="margin: 5px 0 0; color: #721c24;"><strong>Amount:</strong> $${order.amount || order.totalAmount}</p>
            <p style="margin: 5px 0 0; color: #721c24;"><strong>Reason:</strong> Payment not received within 7 days</p>
          </div>

          <p style="color: #666; line-height: 1.6;">The item has been re-listed for auction. You can still bid on it or browse other available auctions.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.frontendUrl}/products"
               style="display: inline-block; background: #1E4F7A; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Browse Auctions
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: user.email, subject: `Order Cancelled - Payment Expired: ${order.productTitle}`, html });
      await this.logEmailSent('payment_expired', user.email, user.uid || user.id);
      return true;
    } catch (error) {
      console.error('Error sending payment expired email:', error);
      return false;
    }
  }

  // Send product re-listed email to seller
  async sendProductRelistedEmail(seller, product) {
    try {
      const productUrl = `${this.frontendUrl}/products/${product.id}`;
      const newEndDate = product.newEndDate
        ? new Date(product.newEndDate).toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : '7 days from now';

      const html = this.wrapEmail(`
        ${this.getHeader('Product Re-listed', '#1976d2')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${seller.firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">Your product has been automatically re-listed because the previous auction winner did not complete payment within the 7-day deadline.</p>

          <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #1976d2;">
            <h3 style="margin-top: 0; color: #1565c0;">Re-listing Details</h3>
            <p style="margin: 0; color: #333;"><strong>Product:</strong> ${product.title}</p>
            <p style="margin: 5px 0 0; color: #333;"><strong>New Auction Ends:</strong> ${newEndDate}</p>
          </div>

          <p style="color: #666; line-height: 1.6;">No action is required from you. The product is now live and accepting bids again.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${productUrl}"
               style="display: inline-block; background: #1976d2; color: white; padding: 15px 30px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              View Product
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({ to: seller.email, subject: `Product Re-listed: ${product.title}`, html });
      await this.logEmailSent('product_relisted', seller.email, seller.uid || seller.id);
      return true;
    } catch (error) {
      console.error('Error sending product re-listed email:', error);
      return false;
    }
  }

  // ==================== AUCTION GOING LIVE EMAILS ====================

  // Send auction going live email
  async sendAuctionGoingLiveEmail(user, product) {
    try {
      const productUrl = `${this.frontendUrl}/products/${product.id}`;

      const html = this.wrapEmail(`
        ${this.getHeader('New Auction is Live!', 'linear-gradient(135deg, #28a745 0%, #20c997 100%)')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">A new auction has just gone live on VeriSpine. Don't miss your chance to bid!</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            ${product.images?.[0] ? `<img src="${product.images[0]}" alt="${product.title}" style="width: 100%; max-width: 400px; border-radius: 10px; margin: 0 auto 15px; display: block;">` : ''}
            <h3 style="margin-top: 0; color: #333;">${product.title}</h3>

            <table style="width: 100%; margin: 15px 0;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Starting Price:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">
                  <strong style="color: #28a745; font-size: 20px;">$${product.startingPrice}</strong>
                </td>
              </tr>
              ${product.buyNowPrice ? `
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Buy Now Price:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">
                  <strong>$${product.buyNowPrice}</strong>
                </td>
              </tr>
              ` : ''}
              ${product.category ? `
              <tr>
                <td style="padding: 8px 0;">Category:</td>
                <td style="padding: 8px 0; text-align: right;">${product.category}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${productUrl}"
               style="display: inline-block; background: #28a745; color: white; padding: 15px 40px;
                      text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
              View Auction
            </a>
          </div>

          <p style="color: #666; font-size: 14px; text-align: center;">
            Be one of the first to place a bid!
          </p>
        </div>
        ${this.getFooter()}
      `);

      await this.sendEmail({
        to: user.email,
        subject: `New Auction Live: ${product.title} - Starting at $${product.startingPrice}`,
        html
      });
      await this.logEmailSent('auction_going_live', user.email, user.uid || user.id);
      return true;
    } catch (error) {
      console.error('Error sending auction going live email:', error);
      return false;
    }
  }

  // ==================== AUCTION SCHEDULED EMAILS ====================

  // Send auction scheduled (coming soon) email
  async sendAuctionScheduledEmail(user, product) {
    try {
      console.log(`[EMAIL] Preparing scheduled auction email for ${user.email}, product: ${product.id}`);

      const productUrl = `${this.frontendUrl}/products/${product.id}`;

      // Safely parse the scheduled date
      let dateStr = 'TBD';
      let timeStr = 'TBD';
      try {
        const scheduledDate = product.scheduledStartTime instanceof Date
          ? product.scheduledStartTime
          : new Date(product.scheduledStartTime?._seconds
              ? product.scheduledStartTime._seconds * 1000
              : product.scheduledStartTime);

        if (!isNaN(scheduledDate.getTime())) {
          dateStr = scheduledDate.toLocaleDateString('en-US', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          });
          timeStr = scheduledDate.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit'
          });
        } else {
          console.error(`[EMAIL] Invalid scheduledStartTime for product ${product.id}:`, product.scheduledStartTime);
        }
      } catch (dateError) {
        console.error(`[EMAIL] Date parsing error for product ${product.id}:`, dateError.message);
      }

      const html = this.wrapEmail(`
        ${this.getHeader('New Auction Coming Soon!', 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)')}
        <div style="padding: 30px;">
          <h2 style="color: #333; margin-top: 0;">Hi ${user.firstName || 'there'}!</h2>
          <p style="color: #666; line-height: 1.6;">A new auction has been scheduled on VeriSpine. Mark your calendar!</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            ${product.images?.[0] ? `<img src="${product.images[0]}" alt="${product.title || ''}" style="width: 100%; max-width: 400px; border-radius: 10px; margin: 0 auto 15px; display: block;">` : ''}
            <h3 style="margin-top: 0; color: #333;">${product.title || 'New Auction'}</h3>

            <table style="width: 100%; margin: 15px 0;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Starting Price:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">
                  <strong style="color: #3b82f6; font-size: 20px;">$${product.startingPrice || 0}</strong>
                </td>
              </tr>
              ${product.buyNowPrice ? `
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Buy Now Price:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">
                  <strong>$${product.buyNowPrice}</strong>
                </td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Goes Live:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">
                  <strong style="color: #3b82f6;">${dateStr} at ${timeStr}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0;">Duration:</td>
                <td style="padding: 8px 0; text-align: right;">${product.durationDays || 7} days</td>
              </tr>
            </table>
          </div>

          <div style="background: #eff6ff; padding: 15px; border-radius: 5px; border-left: 4px solid #3b82f6; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #1e40af;">
              You'll receive another notification when this auction goes live and bidding opens.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${productUrl}"
               style="display: inline-block; background: #3b82f6; color: white; padding: 15px 40px;
                      text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
              View Auction
            </a>
          </div>
        </div>
        ${this.getFooter()}
      `);

      console.log(`[EMAIL] Sending scheduled auction email to ${user.email}...`);
      await this.sendEmail({
        to: user.email,
        subject: `Coming Soon: ${product.title} - Starting at $${product.startingPrice} on ${dateStr}`,
        html
      });
      console.log(`[EMAIL] Successfully sent scheduled auction email to ${user.email}`);
      await this.logEmailSent('auction_scheduled', user.email, user.uid || user.id);
      return true;
    } catch (error) {
      console.error(`[EMAIL] FAILED sending scheduled auction email to ${user?.email}:`, error.message, error.stack);
      return false;
    }
  }

  // ==================== HELPER FUNCTIONS ====================

  // Helper function to calculate time remaining
  getTimeRemaining(endDate) {
    const end = new Date(endDate).getTime();
    const now = new Date().getTime();
    const diff = end - now;

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days} days, ${hours} hours`;
    return `${hours} hours`;
  }

  // Log email sent to database
  async logEmailSent(type, recipient, userId) {
    try {
      if (!db) return;

      const logData = {
        type,
        recipient,
        provider: 'resend',
        sentAt: admin?.firestore?.FieldValue?.serverTimestamp() || new Date(),
        status: 'sent'
      };
      if (userId) logData.userId = userId;

      await db.collection('email_logs').add(logData);
    } catch (error) {
      console.error('Error logging email:', error);
    }
  }
}

module.exports = new ResendEmailService();
