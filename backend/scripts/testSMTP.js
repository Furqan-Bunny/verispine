#!/usr/bin/env node
require('dotenv').config();
const nodemailer = require('nodemailer').default || require('nodemailer');

const testSMTP = async () => {
  console.log('🚀 Testing Brevo SMTP Configuration...\n');

  // Check configuration
  if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_PASSWORD) {
    console.error('❌ Brevo SMTP credentials are not configured in .env file');
    console.log('Please add your Brevo SMTP credentials to the .env file:');
    console.log('BREVO_SMTP_LOGIN=your_login');
    console.log('BREVO_SMTP_PASSWORD=your_password\n');
    process.exit(1);
  }

  const testRecipient = process.argv[2] || process.env.TEST_EMAIL;
  
  if (!testRecipient) {
    console.error('❌ Please provide a test email address');
    console.log('Usage: node scripts/testSMTP.js your-email@example.com');
    console.log('Or set TEST_EMAIL in your .env file\n');
    process.exit(1);
  }

  console.log(`📧 Sending test email via SMTP to: ${testRecipient}\n`);
  
  console.log('Configuration:');
  console.log('- SMTP Host: smtp-relay.brevo.com');
  console.log('- SMTP Port: 587');
  console.log(`- SMTP Login: ${process.env.BREVO_SMTP_LOGIN}`);
  console.log(`- SMTP Password: ***${process.env.BREVO_SMTP_PASSWORD.slice(-4)}\n`);

  try {
    // Create transporter with Brevo SMTP
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_LOGIN,
        pass: process.env.BREVO_SMTP_PASSWORD
      }
    });

    // Verify connection
    console.log('Testing SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection successful\n');

    // Send test email
    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: `"${process.env.BREVO_SENDER_NAME || 'Quicksell'}" <${process.env.BREVO_SENDER_EMAIL || 'noreply@quicksell.co.za'}>`,
      to: testRecipient,
      subject: '🚀 Brevo SMTP Test - Quicksell',
      text: 'This is a test email sent via Brevo SMTP.',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: #ffffff;
              border: 1px solid #e5e7eb;
              border-radius: 10px;
              padding: 30px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 20px;
              text-align: center;
              border-radius: 10px;
              margin-bottom: 20px;
            }
            .success {
              color: #10b981;
              font-weight: bold;
              font-size: 18px;
              text-align: center;
              margin: 20px 0;
            }
            .details {
              background: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              color: #6b7280;
              font-size: 12px;
              margin-top: 30px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Brevo SMTP Test</h1>
            </div>
            
            <p class="success">✅ SMTP Configuration Working!</p>
            
            <p>This email confirms that your Brevo SMTP integration is working correctly.</p>
            
            <div class="details">
              <h3>Configuration Details:</h3>
              <ul>
                <li><strong>SMTP Server:</strong> smtp-relay.brevo.com</li>
                <li><strong>Port:</strong> 587</li>
                <li><strong>Authentication:</strong> Successful</li>
                <li><strong>Sender:</strong> ${process.env.BREVO_SENDER_EMAIL || 'noreply@quicksell.co.za'}</li>
              </ul>
            </div>
            
            <p>Your Quicksell email system is ready to send transactional emails!</p>
            
            <div class="footer">
              <p>This is a test email from Quicksell</p>
              <p>© 2024 Quicksell. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    
    console.log('\n🎉 SMTP test completed successfully!');
    console.log('Check your inbox to confirm the email was received.');
    
  } catch (error) {
    console.error('\n❌ SMTP test failed:', error.message);
    
    console.log('\n🔍 Troubleshooting tips:');
    console.log('1. Verify your BREVO_SMTP_LOGIN and BREVO_SMTP_PASSWORD are correct');
    console.log('2. Check that your Brevo account is active');
    console.log('3. Ensure the SMTP credentials are from the Brevo dashboard');
    console.log('4. The login should be in format: xxxxxx@smtp-brevo.com');
    console.log('5. Make sure you\'re using the Master Password from Brevo');
    
    process.exit(1);
  }
};

// Run test
console.log('═══════════════════════════════════════');
console.log('    Brevo SMTP Connection Test');
console.log('═══════════════════════════════════════\n');

testSMTP().then(() => {
  console.log('\n═══════════════════════════════════════\n');
  process.exit(0);
}).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});