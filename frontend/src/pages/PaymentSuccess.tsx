import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import axios from '../config/axios'
import toast from 'react-hot-toast'

const PaymentSuccess = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [verifying, setVerifying] = useState(true)
  const [verified, setVerified] = useState(false)
  
  useEffect(() => {
    const verifyPayment = async () => {
      // Get payment details from URL params or location state
      const orderId = searchParams.get('order_id') || location.state?.orderId
      const transactionId = searchParams.get('transaction_id')
      const txRef = searchParams.get('tx_ref')
      const paymentMethod = searchParams.get('method') || location.state?.paymentMethod
      const paymentId = searchParams.get('payment_id')
      
      if (!orderId) {
        toast.error('Order ID not found')
        setVerifying(false)
        return
      }
      
      try {
        // Wallet payments settle inline; card payments settle via the Stripe
        // webhook. Either way the server is the source of truth — we only ask
        // it to confirm, and never trust anything in the query string.
        const verificationData: any = { paymentMethod: paymentMethod || 'stripe' }

        if (paymentMethod === 'stripe') {
          // Nudge the server to re-check Stripe in case the webhook is still in
          // flight; it is idempotent, so a duplicate call is harmless.
          try {
            await axios.post('/api/payments/stripe/verify', { orderId })
          } catch (err) {
            console.error('Stripe verify error:', err)
          }
        }

        const response = await axios.post(`/api/payments/verification/verify/${orderId}`, verificationData)
        
        if (response.data.success) {
          toast.success('Payment successful! Your order has been confirmed.')
          setVerified(true)
        } else {
          toast.error('Payment verification failed. Please contact support.')
        }
      } catch (error: any) {
        console.error('Payment verification error:', error)
        toast.error(error.response?.data?.error || 'Failed to verify payment. Please contact support.')
      } finally {
        setVerifying(false)
      }
    }
    
    verifyPayment()
  }, [searchParams, location.state])
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-md w-full space-y-8 text-center">
        {verifying ? (
          <div>
            <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-primary mx-auto" />
            <h2 className="mt-6 text-2xl font-bold text-gray-900">
              Verifying Payment...
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Please wait while we confirm your payment.
            </p>
          </div>
        ) : (
          <div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className={`mx-auto flex items-center justify-center h-24 w-24 rounded-full ${
                verified ? 'bg-green-100' : 'bg-red-100'
              }`}
            >
              {verified ? (
                <CheckCircleIcon className="h-16 w-16 text-green-600" />
              ) : (
                <XCircleIcon className="h-16 w-16 text-red-600" />
              )}
            </motion.div>
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              {verified ? 'Payment Successful!' : 'Payment Failed'}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {verified 
                ? 'Your payment has been processed successfully.'
                : 'There was an issue with your payment. Please try again or contact support.'}
            </p>
          </div>
        )}
        
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-6">
            <p className="text-sm text-gray-700">
              You will receive a confirmation email shortly with your order details.
            </p>
          </div>
          
          <div className="flex flex-col space-y-2">
            <button
              onClick={() => navigate('/orders')}
              className="btn-primary"
            >
              View Orders
            </button>
            <button
              onClick={() => navigate('/products')}
              className="btn-outline"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default PaymentSuccess