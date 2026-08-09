import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import {
  BuildingStorefrontIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import {
  getSellerApplicationStatus,
  submitSellerApplication,
  resubmitSellerApplication,
  type SellerApplicationStatus
} from '../services/sellerApplicationService'

const SA_PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'
]

const BecomeSeller = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [appStatus, setAppStatus] = useState<SellerApplicationStatus>('NOT_SUBMITTED')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<any>(null)
  const [kycStatus, setKycStatus] = useState<string>('NOT_SUBMITTED')
  const [serverRole, setServerRole] = useState<string>('user')

  // Form state
  const [form, setForm] = useState({
    fullName: '',
    companyName: '',
    phoneNumber: '',
    street: '',
    city: '',
    province: 'Gauteng',
    postalCode: '',
    country: 'South Africa',
    businessRegNumber: '',
    taxNumber: '',
    termsAccepted: false
  })

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
    }
  }, [isAuthenticated, navigate])

  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true)
      try {
        const response = await getSellerApplicationStatus()
        if (response.success) {
          setAppStatus(response.data.status)
          setRejectionReason(response.data.rejectionReason)
          setSubmittedAt(response.data.submittedAt)
          setKycStatus(response.data.kycStatus)
          setServerRole(response.data.role)

          // Prefill form with previous submission for resubmit
          if (response.data.fullName) {
            setForm(f => ({
              ...f,
              fullName: response.data.fullName || '',
              companyName: response.data.companyName || '',
              phoneNumber: response.data.phoneNumber || '',
              street: response.data.address?.street || '',
              city: response.data.address?.city || '',
              province: response.data.address?.province || 'Gauteng',
              postalCode: response.data.address?.postalCode || '',
              country: response.data.address?.country || 'South Africa',
              businessRegNumber: response.data.businessRegNumber || '',
              taxNumber: response.data.taxNumber || ''
            }))
          } else {
            // Prefill from user account
            setForm(f => ({
              ...f,
              fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
              phoneNumber: user?.phone || ''
            }))
          }
        }
      } catch (error: any) {
        console.error('Error fetching seller application status:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (isAuthenticated) fetchStatus()
  }, [isAuthenticated, user])

  const handleChange = (field: keyof typeof form, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const validate = (): string | null => {
    if (form.fullName.trim().length < 2) return 'Full name is required'
    if (form.companyName.trim().length < 2) return 'Company name is required'
    if (form.companyName.trim().length > 60) return 'Company name must be 60 characters or fewer'
    if (form.phoneNumber.trim().length < 7) return 'Phone number is required'
    if (!form.street.trim()) return 'Street address is required'
    if (!form.city.trim()) return 'City is required'
    if (!form.province.trim()) return 'Province is required'
    if (!/^\d{4}$/.test(form.postalCode.trim())) return 'Postal code must be 4 digits'
    if (!form.country.trim()) return 'Country is required'
    if (!form.termsAccepted) return 'You must accept the seller terms'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    const payload = {
      fullName: form.fullName.trim(),
      companyName: form.companyName.trim(),
      phoneNumber: form.phoneNumber.trim(),
      address: {
        street: form.street.trim(),
        city: form.city.trim(),
        province: form.province.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country.trim()
      },
      businessRegNumber: form.businessRegNumber.trim() || undefined,
      taxNumber: form.taxNumber.trim() || undefined,
      termsAccepted: true as const
    }

    setIsSubmitting(true)
    try {
      const submitFn = appStatus === 'REJECTED' ? resubmitSellerApplication : submitSellerApplication
      const response = await submitFn(payload)
      if (response.success) {
        toast.success('Application submitted! We\'ll review it shortly.')
        setAppStatus('PENDING')
        setRejectionReason(null)
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to submit seller application')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  // Already a seller or admin — redirect/info
  if (serverRole === 'seller' || serverRole === 'admin') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        <div className="card bg-green-50 border-green-200 text-center py-12">
          <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-green-800 mb-2">You're already a seller</h1>
          <p className="text-green-700 mb-6">
            Head to your Seller Dashboard to manage listings, sales, and payouts.
          </p>
          <Link to="/seller/dashboard" className="btn-primary inline-flex items-center gap-2">
            Go to Seller Dashboard <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    )
  }

  // KYC blocker
  if (kycStatus !== 'APPROVED') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <BuildingStorefrontIcon className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Become a Seller</h1>
          <p className="text-gray-600 mt-2">Sell on Quicksell — list auctions, ship orders, get paid.</p>
        </div>

        <div className="card bg-amber-50 border-amber-200">
          <div className="flex items-start gap-4">
            <ShieldCheckIcon className="h-12 w-12 text-amber-500 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-amber-800 mb-1">Complete KYC first</h3>
              <p className="text-amber-700 mb-4">
                You need to verify your identity before applying to be a seller. KYC takes 1-2 business days to review.
              </p>
              <p className="text-sm text-amber-600 mb-4">
                Current KYC status: <strong>{kycStatus}</strong>
              </p>
              <Link to="/kyc" className="btn-primary inline-flex items-center gap-2">
                Complete KYC <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  const renderStatusBadge = () => {
    switch (appStatus) {
      case 'APPROVED':
        return (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full">
            <CheckCircleIcon className="h-5 w-5" />
            <span className="font-medium">Approved</span>
          </div>
        )
      case 'PENDING':
        return (
          <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 px-4 py-2 rounded-full">
            <ClockIcon className="h-5 w-5" />
            <span className="font-medium">Pending Review</span>
          </div>
        )
      case 'REJECTED':
        return (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-full">
            <XCircleIcon className="h-5 w-5" />
            <span className="font-medium">Rejected</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-2 text-gray-600 bg-gray-100 px-4 py-2 rounded-full">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <span className="font-medium">Not Submitted</span>
          </div>
        )
    }
  }

  const submittedDate = submittedAt
    ? (submittedAt._seconds
        ? new Date(submittedAt._seconds * 1000)
        : new Date(submittedAt))
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
          <BuildingStorefrontIcon className="h-8 w-8 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Become a Seller</h1>
        <p className="text-gray-600 mt-2">
          Apply once. Once approved, you can list auctions, manage orders, and get paid.
        </p>
      </div>

      {/* Status card */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Application Status</h2>
            <p className="text-sm text-gray-500 mt-1">
              {appStatus === 'NOT_SUBMITTED' && 'Submit your business details to apply.'}
              {appStatus === 'PENDING' && 'Our team is reviewing your application.'}
              {appStatus === 'APPROVED' && 'You\'re a seller! Visit your dashboard to start listing.'}
              {appStatus === 'REJECTED' && 'Your application was rejected. Please review and resubmit.'}
            </p>
          </div>
          {renderStatusBadge()}
        </div>

        {appStatus === 'REJECTED' && rejectionReason && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <XCircleIcon className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-800">Rejection Reason:</p>
                <p className="text-red-700 text-sm mt-1">{rejectionReason}</p>
              </div>
            </div>
          </div>
        )}

        {submittedDate && appStatus === 'PENDING' && (
          <p className="text-sm text-gray-500 mt-4">
            Submitted on: {submittedDate.toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Approved cta */}
      {appStatus === 'APPROVED' && (
        <div className="card bg-green-50 border-green-200 text-center py-8">
          <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-xl font-semibold text-green-800 mb-2">You're approved!</h3>
          <p className="text-green-700 mb-4">Welcome to Quicksell sellers.</p>
          <Link to="/seller/dashboard" className="btn-primary inline-flex items-center gap-2">
            Go to Seller Dashboard <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Pending illustration */}
      {appStatus === 'PENDING' && (
        <div className="card bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-4">
            <ClockIcon className="h-12 w-12 text-yellow-500 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-800">Under Review</h3>
              <p className="text-yellow-700 mt-1">
                We typically review applications within 1-2 business days. You'll receive an email when a decision is made.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Form (NOT_SUBMITTED or REJECTED) */}
      {(appStatus === 'NOT_SUBMITTED' || appStatus === 'REJECTED') && (
        <form onSubmit={handleSubmit} className="card space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {appStatus === 'REJECTED' ? 'Resubmit Application' : 'Seller Application'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                placeholder="Your legal name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company / Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => handleChange('companyName', e.target.value)}
                placeholder="As it should appear on your storefront"
                maxLength={60}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={form.phoneNumber}
                onChange={(e) => handleChange('phoneNumber', e.target.value)}
                placeholder="+27 XX XXX XXXX"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div>
            <h3 className="text-base font-medium text-gray-900 mb-3">Business Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.street}
                  onChange={(e) => handleChange('street', e.target.value)}
                  placeholder="123 Example Street"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Province <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.province}
                  onChange={(e) => handleChange('province', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {SA_PROVINCES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Postal Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  pattern="\d{4}"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-base font-medium text-gray-900 mb-3">
              Business Registration <span className="text-gray-400 text-sm font-normal">(Optional)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Reg. Number
                </label>
                <input
                  type="text"
                  value={form.businessRegNumber}
                  onChange={(e) => handleChange('businessRegNumber', e.target.value)}
                  placeholder="e.g. CIPC number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tax / VAT Number
                </label>
                <input
                  type="text"
                  value={form.taxNumber}
                  onChange={(e) => handleChange('taxNumber', e.target.value)}
                  placeholder="If registered for VAT"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Seller Terms Summary:</h4>
            <ul className="text-sm text-blue-700 space-y-1 mb-3">
              <li>• Quicksell takes a <strong>10% platform fee</strong> on each completed sale</li>
              <li>• You're responsible for product accuracy, shipping, and customer service</li>
              <li>• Funds become available once orders are marked delivered</li>
              <li>• Quicksell may suspend accounts that violate platform policies</li>
            </ul>
            <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">
              Read full terms
            </Link>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.termsAccepted}
              onChange={(e) => handleChange('termsAccepted', e.target.checked)}
              className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">
              I agree to the Quicksell <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">Seller Terms & Conditions</Link>.
            </span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting || !form.termsAccepted}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                {appStatus === 'REJECTED' ? 'Resubmit Application' : 'Submit Application'}
              </>
            )}
          </button>
        </form>
      )}
    </motion.div>
  )
}

export default BecomeSeller
