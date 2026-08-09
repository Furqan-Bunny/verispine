#!/usr/bin/env node
require('dotenv').config();

// Initialize Firebase Admin
const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const emailService = require('../services/resendEmailService');

const testEmail = async () => {
  console.log('🚀 Testing Email Service (Resend)...\n');

  // Check configuration
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ Email configuration missing in .env file');
    console.log('Please add the following to your .env file:');
    console.log('RESEND_API_KEY=your_resend_api_key');
    console.log('RESEND_FROM_EMAIL=noreply@yourdomain.com');
    console.log('RESEND_FROM_NAME=VeriSpine\n');
    process.exit(1);
  }

  const testRecipient = process.argv[2] || process.env.TEST_EMAIL;

  if (!testRecipient) {
    console.error('❌ Please provide a test email address');
    console.log('Usage: npm run test:email your-email@example.com');
    console.log('Or set TEST_EMAIL in your .env file\n');
    process.exit(1);
  }

  console.log(`📧 Sending test emails to: ${testRecipient}\n`);

  // Test user data
  const testUser = {
    email: testRecipient,
    firstName: 'Test',
    lastName: 'User',
    uid: 'test-user-123'
  };

  const testProduct = {
    id: 'test-product-123',
    title: 'Test Product - iPhone 13 Pro',
    description: 'Brand new iPhone 13 Pro in excellent condition',
    images: ['https://via.placeholder.com/300'],
    currentPrice: 5000,
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    startingPrice: 1000
  };

  const testBid = {
    amount: 5500,
    productId: testProduct.id
  };

  try {
    // Test 1: Welcome Email
    console.log('1. Testing Welcome Email...');
    const welcomeResult = await emailService.sendWelcomeEmail(testUser);
    console.log(welcomeResult ? '✅ Welcome email sent successfully' : '❌ Welcome email failed');
    console.log();

    // Test 2: Bid Confirmation
    console.log('2. Testing Bid Confirmation Email...');
    const bidResult = await emailService.sendBidConfirmation(testUser, testBid, testProduct);
    console.log(bidResult ? '✅ Bid confirmation sent successfully' : '❌ Bid confirmation failed');
    console.log();

    // Test 3: Outbid Notification
    console.log('3. Testing Outbid Notification...');
    const outbidResult = await emailService.sendOutbidNotification(testUser, testProduct, 6000);
    console.log(outbidResult ? '✅ Outbid notification sent successfully' : '❌ Outbid notification failed');
    console.log();

    // Test 4: Auction Won
    console.log('4. Testing Auction Won Email...');
    const wonResult = await emailService.sendAuctionWonNotification(testUser, testProduct, 5500);
    console.log(wonResult ? '✅ Auction won email sent successfully' : '❌ Auction won email failed');
    console.log();

    console.log('🎉 Email testing complete!');
    console.log('\n📊 Summary:');
    console.log('- Welcome email: ' + (welcomeResult ? '✅' : '❌'));
    console.log('- Bid confirmation: ' + (bidResult ? '✅' : '❌'));
    console.log('- Outbid notification: ' + (outbidResult ? '✅' : '❌'));
    console.log('- Auction won email: ' + (wonResult ? '✅' : '❌'));
    console.log('\n💡 Check your inbox to verify the emails were received correctly.');

    // Configuration info
    console.log('\n📋 Configuration:');
    console.log(`- Resend API Key: ${process.env.RESEND_API_KEY ? '***' + process.env.RESEND_API_KEY.slice(-4) : 'Not set'}`);
    console.log(`- From Email: ${process.env.RESEND_FROM_EMAIL || 'Using default'}`);
    console.log(`- From Name: ${process.env.RESEND_FROM_NAME || 'Using default'}`);

  } catch (error) {
    console.error('\n❌ Email test failed:', error.message);

    if (error.response) {
      console.error('API Response:', error.response.data);
    }

    console.log('\n🔍 Troubleshooting tips:');
    console.log('1. Check your RESEND_API_KEY in .env file');
    console.log('2. Verify your domain is configured in Resend dashboard');
    console.log('3. Make sure your Resend account is activated');
    console.log('4. Check the Resend dashboard for any account issues');
    console.log('5. Review the error message above for specific details');

    process.exit(1);
  }
};

// Run test
console.log('═══════════════════════════════════════');
console.log('  VeriSpine Email Service Test Suite');
console.log('        (Powered by Resend)');
console.log('═══════════════════════════════════════\n');

testEmail().then(() => {
  console.log('\n═══════════════════════════════════════\n');
  process.exit(0);
}).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
