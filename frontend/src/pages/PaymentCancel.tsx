import { useNavigate } from 'react-router-dom'
import { XCircleIcon } from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'

const PaymentCancel = () => {
  const navigate = useNavigate()
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="mx-auto flex items-center justify-center h-24 w-24 rounded-full bg-red-100"
          >
            <XCircleIcon className="h-16 w-16 text-red-600" />
          </motion.div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Payment Cancelled
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Your payment was cancelled and no charges were made.
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-6">
            <p className="text-sm text-gray-700">
              Your items are still available. You can return to complete your purchase anytime.
            </p>
          </div>
          
          <div className="flex flex-col space-y-2">
            <button
              onClick={() => navigate(-1)}
              className="btn-primary"
            >
              Return to Product
            </button>
            <button
              onClick={() => navigate('/products')}
              className="btn-outline"
            >
              Browse Products
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default PaymentCancel