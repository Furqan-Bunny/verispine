import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuthStore } from '../store/authStore'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import affiliateService from '../services/affiliateService'
import { toast } from 'react-hot-toast'

interface RegisterForm {
  username: string
  email: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  terms: boolean
  referralCode?: string
}

const Register = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { register: registerUser, isLoading } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [referralInfo, setReferralInfo] = useState<{
    inviterName?: string;
    inviterEmail?: string;
    inviteeEmail?: string;
    inviteeName?: string;
    type?: 'invitation' | 'direct';
  } | null>(null)
  const [isEmailLocked, setIsEmailLocked] = useState(false)
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<RegisterForm>()

  const password = watch('password')

  useEffect(() => {
    const refCode = searchParams.get('ref')
    if (refCode) {
      validateReferralCode(refCode)
      setValue('referralCode', refCode)
    }
  }, [searchParams, setValue])

  const validateReferralCode = async (code: string) => {
    console.log('=== VALIDATE REFERRAL DEBUG ===')
    console.log('Validating referral code:', code)

    try {
      const result = await affiliateService.validateReferralCode(code)
      console.log('Validation result:', result)

      if (result.valid) {
        console.log('Referral code is VALID, type:', result.type)
        setReferralInfo({
          inviterName: result.inviterName,
          inviterEmail: result.inviterEmail,
          inviteeEmail: result.inviteeEmail,
          inviteeName: result.inviteeName,
          type: result.type
        })

        // If it's an email invitation, pre-fill and lock the email field
        if (result.type === 'invitation' && result.inviteeEmail) {
          console.log('Locking email field with:', result.inviteeEmail)
          setValue('email', result.inviteeEmail)
          setIsEmailLocked(true)

          // Also pre-fill name if available
          if (result.inviteeName) {
            const nameParts = result.inviteeName.split(' ')
            if (nameParts[0]) setValue('firstName', nameParts[0])
            if (nameParts[1]) setValue('lastName', nameParts.slice(1).join(' '))
          }
        }

        toast.success(`You were invited by ${result.inviterName}!`)
      } else {
        console.log('Referral code is INVALID:', result.error)
        toast.error(result.error || 'Invalid referral code')
        // Clear the referral code if invalid
        setValue('referralCode', '')
      }
    } catch (error) {
      console.error('Error validating referral:', error)
    }
    console.log('=== VALIDATE REFERRAL DEBUG END ===')
  }

  const onSubmit = async (data: RegisterForm) => {
    console.log('=== REGISTRATION DEBUG START ===')
    console.log('1. Form data received:', { ...data, password: '***' })
    console.log('2. Referral code from form:', data.referralCode)
    console.log('3. Referral info state:', referralInfo)

    try {
      const { confirmPassword, terms, ...registerData } = data
      console.log('4. Calling registerUser with:', { ...registerData, password: '***' })

      // All users register as regular users, admin has selling privileges
      await registerUser({ ...registerData, role: 'user' })
      console.log('5. registerUser completed successfully')

      // Process referral if referral code exists
      console.log('6. Checking referral code:', data.referralCode ? 'EXISTS' : 'NOT EXISTS')

      if (data.referralCode) {
        try {
          // Get the newly created user from localStorage (set by authStore)
          const savedUser = localStorage.getItem('user')
          console.log('7. savedUser from localStorage:', savedUser ? 'EXISTS' : 'NOT FOUND')

          if (savedUser) {
            const newUser = JSON.parse(savedUser)
            console.log('8. Parsed newUser:', { uid: newUser.uid, id: newUser.id, email: newUser.email })
            console.log('9. Calling processReferral with:', {
              referralCode: data.referralCode,
              newUserId: newUser.uid || newUser.id,
              newUserEmail: data.email
            })

            const referralResult = await affiliateService.processReferral(data.referralCode, newUser.uid || newUser.id, data.email)
            console.log('10. processReferral result:', referralResult)

            if (referralInfo) {
              toast.success(`Successfully registered! ${referralInfo.inviterName} will earn 5% commission when you make purchases.`)
            }
          } else {
            console.log('7b. ERROR: No user found in localStorage after registration!')
          }
        } catch (referralError) {
          console.error('REFERRAL ERROR:', referralError)
          // Don't block registration if referral processing fails
        }
      }

      console.log('11. Navigating to verify-email...')
      console.log('=== REGISTRATION DEBUG END ===')
      // Use the same normalised email everywhere (matches backend customSanitizer
      // and Firestore-stored email). Avoids "User not found" on /verify-email.
      navigate('/verify-email', { state: { email: String(data.email).toLowerCase().trim() } })
    } catch (error) {
      console.error('REGISTRATION ERROR:', error)
      console.log('=== REGISTRATION DEBUG END (with error) ===')
      // Error is handled in the store
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <div className="card">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create an Account</h1>
            <p className="text-gray-600">Join Quicksell and start bidding today</p>
          </div>

          {referralInfo && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-indigo-800">
                🎉 You were invited by <strong>{referralInfo.inviterName}</strong>!
                They'll earn 5% commission on your purchases as a thank you.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <input
                  {...register('firstName', { required: 'First name is required' })}
                  type="text"
                  className="input-field"
                  placeholder="John"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name
                </label>
                <input
                  {...register('lastName', { required: 'Last name is required' })}
                  type="text"
                  className="input-field"
                  placeholder="Doe"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                {...register('username', {
                  required: 'Username is required',
                  minLength: {
                    value: 3,
                    message: 'Username must be at least 3 characters'
                  },
                  pattern: {
                    value: /^[a-zA-Z0-9_]+$/,
                    message: 'Username can only contain letters, numbers, and underscores'
                  }
                })}
                type="text"
                className="input-field"
                placeholder="johndoe"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
                {isEmailLocked && (
                  <span className="ml-2 text-xs text-indigo-600 font-normal">(from invitation)</span>
                )}
              </label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address'
                  }
                })}
                type="email"
                className={`input-field ${isEmailLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="john@example.com"
                disabled={isEmailLocked}
                readOnly={isEmailLocked}
              />
              {isEmailLocked && (
                <p className="mt-1 text-xs text-gray-500">
                  This email was specified in your invitation and cannot be changed.
                </p>
              )}
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    {...register('password', {
                      required: 'Password is required',
                      minLength: {
                        value: 6,
                        message: 'Password must be at least 6 characters'
                      },
                      pattern: {
                        value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{6,}$/,
                        message: 'Password must contain uppercase, lowercase, and number'
                      }
                    })}
                    type={showPassword ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    {...register('confirmPassword', {
                      required: 'Please confirm your password',
                      validate: value => value === password || 'Passwords do not match'
                    })}
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showConfirmPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>

            {/* Account Type Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-1">Account Information</h3>
              <p className="text-sm text-blue-700">
                You're creating a <span className="font-semibold">User Account</span>. 
                You'll be able to browse products, place bids, and purchase items.
              </p>
              <p className="text-xs text-blue-600 mt-2">
                Only admin accounts can list items for sale.
              </p>
            </div>

            <div>
              <label className="flex items-start">
                <input
                  {...register('terms', { required: 'You must accept the terms and conditions' })}
                  type="checkbox"
                  className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-600">
                  I agree to the{' '}
                  <Link to="/terms" className="text-primary-600 hover:text-primary-700">
                    Terms and Conditions
                  </Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-primary-600 hover:text-primary-700">
                    Privacy Policy
                  </Link>
                </span>
              </label>
              {errors.terms && (
                <p className="mt-1 text-sm text-red-600">{errors.terms.message}</p>
              )}
            </div>

            {/* Hidden referral code field */}
            <input type="hidden" {...register('referralCode')} />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary py-3 flex items-center justify-center"
            >
              {isLoading ? (
                <div className="loading-spinner"></div>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Register