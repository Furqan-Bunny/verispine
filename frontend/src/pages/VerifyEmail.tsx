import { motion } from 'framer-motion'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CheckCircleIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import axios from '../config/axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

const VerifyEmail = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const email = location.state?.email
  const { user, updateUser } = useAuthStore()

  const [otp, setOtp] = useState<string[]>(Array(6).fill(''))
  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Redirect if no email, auto-send OTP on first load for users who don't have one yet
  useEffect(() => {
    if (!email) {
      navigate('/register', { replace: true })
      return
    }

    // Auto-send OTP when page loads (for old users redirected here without an OTP)
    const autoSendOtp = async () => {
      try {
        await axios.post('/api/auth/resend-verification', { email })
        setResendCooldown(60)
      } catch {
        // Ignore errors (rate limit, already verified, etc.)
      }
    }
    autoSendOtp()
  }, [email, navigate])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Auto-redirect after verification
  useEffect(() => {
    if (!verified) return
    const timer = setTimeout(() => {
      navigate('/dashboard', { replace: true })
    }, 2000)
    return () => clearTimeout(timer)
  }, [verified, navigate])

  const focusInput = useCallback((index: number) => {
    inputRefs.current[index]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1)
    const newOtp = [...otp]
    newOtp[index] = digit
    setOtp(newOtp)

    // Auto-focus next input
    if (digit && index < 5) {
      focusInput(index + 1)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      focusInput(index - 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return

    const newOtp = [...otp]
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || ''
    }
    setOtp(newOtp)

    // Focus the last filled input or the next empty one
    const focusIndex = Math.min(pasted.length, 5)
    focusInput(focusIndex)
  }

  const clearInputs = () => {
    setOtp(Array(6).fill(''))
    focusInput(0)
  }

  const handleVerify = async () => {
    const code = otp.join('')
    if (code.length !== 6) {
      toast.error('Please enter the complete 6-digit code.')
      return
    }

    setLoading(true)
    try {
      await axios.post('/api/auth/verify-email', { email, otp: code })
      setVerified(true)
      toast.success('Email verified successfully!')

      // Update auth store
      if (user) {
        updateUser({ ...user, emailVerified: true })
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Verification failed. Please try again.'
      toast.error(errorMsg)
      clearInputs()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return

    try {
      await axios.post('/api/auth/resend-verification', { email })
      toast.success('A new verification code has been sent to your email.')
      setResendCooldown(60)
      clearInputs()
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to resend code. Please try again.'
      toast.error(errorMsg)
    }
  }

  if (!email) return null

  if (verified) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h2>
          <p className="text-gray-600">
            Redirecting to your dashboard...
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card max-w-md w-full text-center"
      >
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <EnvelopeIcon className="h-8 w-8 text-primary-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify Your Email</h2>
        <p className="text-gray-600 mb-6">
          We sent a 6-digit code to <strong>{email}</strong>. Enter it below to verify your account.
        </p>

        {/* OTP Inputs */}
        <div className="flex justify-center gap-2 sm:gap-3 mb-6" onPaste={handlePaste}>
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={el => { inputRefs.current[index] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(index, e.target.value)}
              onKeyDown={e => handleKeyDown(index, e)}
              className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-colors"
              disabled={loading}
              autoFocus={index === 0}
            />
          ))}
        </div>

        {/* Verify Button */}
        <button
          onClick={handleVerify}
          disabled={loading || otp.join('').length !== 6}
          className="w-full btn-primary py-3 flex items-center justify-center mb-4"
        >
          {loading ? (
            <div className="loading-spinner"></div>
          ) : (
            'Verify Email'
          )}
        </button>

        {/* Resend */}
        <p className="text-sm text-gray-600">
          Didn't receive the code?{' '}
          {resendCooldown > 0 ? (
            <span className="text-gray-400">
              Resend in {resendCooldown}s
            </span>
          ) : (
            <button
              onClick={handleResend}
              className="font-medium text-primary-600 hover:text-primary-700"
            >
              Resend Code
            </button>
          )}
        </p>
      </motion.div>
    </div>
  )
}

export default VerifyEmail
