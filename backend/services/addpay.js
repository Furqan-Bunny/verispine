const axios = require('axios');
const crypto = require('crypto');

class AddPayService {
  constructor() {
    this.clientId = process.env.ADDPAY_CLIENT_ID;
    this.clientSecret = process.env.ADDPAY_CLIENT_SECRET;
    this.testMode = process.env.ADDPAY_TEST_MODE === 'true';

    this.baseUrl = this.testMode
      ? 'https://secure-test.addpay.co.za/v2'
      : 'https://secure.addpay.co.za/v2';
  }

  // Generate Base64 auth token
  generateToken() {
    return Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
  }

  // Common headers for API calls
  getHeaders() {
    return {
      'Authorization': `Token :${this.generateToken()}`,
      'Content-Type': 'application/json'
    };
  }

  // Generate unique payment reference (max 24 chars)
  generateReference() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `QS-${timestamp}-${random}`.substring(0, 24);
  }

  // Initialize a payment via AddPay CNP API
  // Full flow: create transaction → create customer → associate customer → update URLs
  async initializePayment(data) {
    try {
      const reference = this.generateReference();
      const headers = this.getHeaders();

      const serverUrl = (process.env.SERVER_URL || 'https://www.verispinejointcenters.com').replace(/\/+$/, '');
      const frontendUrl = (process.env.FRONTEND_URL || 'https://www.verispinejointcenters.com').replace(/\/+$/, '');

      // Step 1: Create transaction
      const txPayload = {
        reference: reference,
        description: data.description || 'VeriSpine Purchase',
        amount: {
          value: parseFloat(data.amount),
          currency_code: data.currency || 'USD'
        }
      };

      console.log('AddPay Step 1 - Create transaction:', JSON.stringify(txPayload));

      const txResponse = await axios.post(
        `${this.baseUrl}/transactions/`,
        txPayload,
        { headers }
      );

      const txData = txResponse.data?.data || txResponse.data;
      const transactionId = txData.id;

      if (!transactionId) {
        console.error('AddPay: no transaction ID returned:', JSON.stringify(txResponse.data));
        return { success: false, error: 'Failed to create transaction' };
      }

      console.log('AddPay Step 1 done - Transaction ID:', transactionId);

      // Step 2: Create customer
      const customerPayload = {
        firstname: data.firstName || data.name?.split(' ')[0] || 'Customer',
        lastname: data.lastName || data.name?.split(' ').slice(1).join(' ') || 'User',
        email: data.email,
        mobile: data.phone || undefined
      };

      // Remove undefined fields
      Object.keys(customerPayload).forEach(k => customerPayload[k] === undefined && delete customerPayload[k]);

      console.log('AddPay Step 2 - Create customer:', JSON.stringify(customerPayload));

      const custResponse = await axios.post(
        `${this.baseUrl}/customers/`,
        customerPayload,
        { headers }
      );

      const custData = custResponse.data?.data || custResponse.data;
      const customerId = custData.id;

      if (!customerId) {
        console.error('AddPay: no customer ID returned:', JSON.stringify(custResponse.data));
        return { success: false, error: 'Failed to create customer' };
      }

      console.log('AddPay Step 2 done - Customer ID:', customerId);

      // Step 3: Associate customer with transaction
      console.log('AddPay Step 3 - Associate customer with transaction');

      await axios.put(
        `${this.baseUrl}/transactions/${transactionId}/customers/${customerId}`,
        {},
        { headers }
      );

      console.log('AddPay Step 3 done - Customer associated');

      // Step 4: Update transaction with return/cancel/notify URLs.
      // Callers (e.g. wallet top-up) may override return/cancel to land on a
      // different page than the order success/cancel flow.
      const returnUrl = data.returnUrl || (data.orderId
        ? `${frontendUrl}/payment/success?order_id=${data.orderId}&method=addpay&transactionId=${transactionId}`
        : `${frontendUrl}/payment/success?method=addpay&transactionId=${transactionId}`);

      const updatePayload = {
        return_url: returnUrl,
        cancel_url: data.cancelUrl || `${frontendUrl}/payment/cancel?order_id=${data.orderId || ''}`,
        notify_url: `${serverUrl}/api/payments/addpay/webhook`
      };

      console.log('AddPay Step 4 - Update transaction URLs:', JSON.stringify(updatePayload));

      try {
        await axios.put(
          `${this.baseUrl}/transactions/${transactionId}`,
          updatePayload,
          { headers }
        );
        console.log('AddPay Step 4 done - URLs updated');
      } catch (urlError) {
        // URL update may fail if not supported - payment can still work
        console.warn('AddPay Step 4 - URL update failed (non-critical):', urlError.response?.data?.meta?.message || urlError.message);
      }

      // Payment URL from original create response
      const paymentUrl = txData.direct;

      console.log('AddPay payment ready - URL:', paymentUrl);

      return {
        success: true,
        data: {
          transactionId: transactionId,
          paymentUrl: paymentUrl,
          reference: reference
        }
      };
    } catch (error) {
      console.error('AddPay initialization error:', JSON.stringify(error.response?.data || error.message));
      return {
        success: false,
        error: error.response?.data?.meta?.message || error.response?.data?.message || error.message || 'Payment initialization failed'
      };
    }
  }

  // Verify a transaction by ID
  async verifyTransaction(transactionId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transactions/${transactionId}`,
        { headers: this.getHeaders() }
      );

      const txData = response.data?.data || response.data;
      const status = txData.status || txData.state;

      return {
        success: true,
        data: {
          transactionId: txData.id || transactionId,
          reference: txData.reference,
          status: status, // READY, COMPLETE, FAILED, CANCELLED
          amount: txData.amount?.value || null,
          currency: txData.amount?.currency_code || 'USD',
          meta: txData.meta
        }
      };
    } catch (error) {
      console.error('AddPay verification error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Transaction verification failed'
      };
    }
  }

  // Check if AddPay is properly configured
  isConfigured() {
    const hasKeys = !!(this.clientId && this.clientSecret);
    if (!hasKeys) {
      console.error('AddPay API keys not configured');
    }
    return hasKeys;
  }
}

module.exports = new AddPayService();
