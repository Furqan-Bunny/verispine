import { motion } from 'framer-motion'

interface LoadingSpinnerProps {
  message?: string
  fullScreen?: boolean
}

const LoadingSpinner = ({ message = 'Loading...', fullScreen = true }: LoadingSpinnerProps) => {
  const containerClass = fullScreen 
    ? 'min-h-screen flex items-center justify-center bg-gray-50'
    : 'flex items-center justify-center p-8'

  return (
    <div className={containerClass}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center"
      >
        <div className="relative">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
          
          {/* Spinning ring */}
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-600 border-t-transparent"></div>
        </div>
        
        {message && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-gray-600 font-medium"
          >
            {message}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}

export default LoadingSpinner