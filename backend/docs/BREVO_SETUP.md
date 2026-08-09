# Brevo Email Integration Setup Guide

## Overview
This guide will help you set up Brevo (formerly Sendinblue) for sending transactional emails in Quicksell.

## Why Brevo?
- **Free tier**: 300 emails/day free forever
- **High deliverability**: Industry-leading email delivery rates
- **Easy integration**: Simple API with good documentation
- **Email templates**: Beautiful HTML email templates
- **Analytics**: Track opens, clicks, and bounces
- **GDPR compliant**: Built-in compliance features

## Setup Steps

### 1. Create a Brevo Account
1. Go to [https://www.brevo.com](https://www.brevo.com)
2. Click "Sign up free"
3. Complete the registration process
4. Verify your email address

### 2. Get Your API Key
1. Log in to your Brevo dashboard
2. Navigate to **Settings** → **API Keys**
3. Click "Generate a new API key"
4. Name it (e.g., "Quicksell Production")
5. Copy the API key - you'll need it for the `.env` file

### 3. Configure Sender Identity
1. Go to **Senders & IP** → **Senders**
2. Click "Add a sender"
3. Fill in:
   - **From Name**: Quicksell
   - **From Email**: noreply@yourdomain.com
   - **Reply-to Email**: support@yourdomain.com
4. Verify the domain if required

### 4. Domain Authentication (Recommended)
For better deliverability:
1. Go to **Senders & IP** → **Domains**
2. Add your domain
3. Add the provided DNS records to your domain:
   - SPF record
   - DKIM records
   - DMARC record (optional but recommended)

### 5. Configure Environment Variables
Add to your `.env` file:
```env
# Brevo Configuration
BREVO_API_KEY=xkeysib-YOUR_API_KEY_HERE
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=Quicksell
```

### 6. Test Email Sending
Run the test script:
```bash
npm run test:email
```

## Email Templates

The application uses three main email templates:

### 1. Invitation Email
- Sent when users invite friends
- Contains referral link
- Shows R5 reward information

### 2. Referral Success Email
- Sent when referred user completes signup
- Confirms R5 reward credited
- Encourages more referrals

### 3. Email Verification
- Sent during user registration
- Contains verification link
- Expires in 24 hours

## Monitoring & Analytics

### Dashboard Metrics
- **Sent**: Total emails sent
- **Delivered**: Successfully delivered emails
- **Opens**: Email open rate
- **Clicks**: Link click rate
- **Bounces**: Failed deliveries
- **Spam Reports**: Emails marked as spam

### Best Practices
1. **Warm up your IP**: Start with low volume and gradually increase
2. **Clean your list**: Remove bounced and inactive emails
3. **Monitor reputation**: Check your sender score regularly
4. **Test templates**: Always test on multiple email clients
5. **Include unsubscribe**: Always include unsubscribe links

## Troubleshooting

### Common Issues

#### 1. Emails not sending
- Check API key is correct
- Verify sender email is configured
- Check Brevo account is activated
- Review error logs in console

#### 2. Emails going to spam
- Complete domain authentication
- Avoid spam trigger words
- Include text version of emails
- Maintain good sender reputation

#### 3. Rate limiting
- Free tier: 300 emails/day
- Implement queue for bulk sending
- Upgrade plan if needed

## API Limits

### Free Plan
- 300 emails per day
- 40,000 emails per month (with limits)
- No SMS credits
- Basic statistics

### Starter Plan ($25/month)
- 10,000 emails per month
- No daily sending limit
- Advanced statistics
- Email support

### Business Plan (Custom pricing)
- Unlimited emails
- Dedicated IP
- Advanced features
- Priority support

## Fallback Configuration

The system includes automatic fallback to SMTP if Brevo fails:

```env
# Fallback SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

## Security Notes

1. **Never commit API keys**: Keep them in `.env` only
2. **Use environment variables**: Don't hardcode credentials
3. **Rotate keys regularly**: Change API keys periodically
4. **Monitor usage**: Watch for unusual activity
5. **Enable 2FA**: On your Brevo account

## Support

- **Brevo Documentation**: [https://developers.brevo.com](https://developers.brevo.com)
- **API Reference**: [https://developers.brevo.com/reference](https://developers.brevo.com/reference)
- **Status Page**: [https://status.brevo.com](https://status.brevo.com)
- **Support**: support@brevo.com

## Testing Checklist

- [ ] API key configured in `.env`
- [ ] Sender email verified
- [ ] Domain authentication completed
- [ ] Test invitation email sent
- [ ] Test verification email sent
- [ ] Test referral success email sent
- [ ] Emails arriving in inbox (not spam)
- [ ] Links in emails working correctly
- [ ] Fallback SMTP configured (optional)