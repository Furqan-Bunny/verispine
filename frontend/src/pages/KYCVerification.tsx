import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import {
  IdentificationIcon,
  CameraIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import {
  submitKYC,
  resubmitKYC,
  getKYCStatus,
  ID_TYPE_LABELS,
  type KYCStatus,
  type IDType
} from '../services/kycService'

const KYCVerification = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const idDocumentInputRef = useRef<HTMLInputElement>(null)
  const selfieInputRef = useRef<HTMLInputElement>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [kycStatus, setKycStatus] = useState<KYCStatus>('NOT_SUBMITTED')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)

  // Form state
  const [idType, setIdType] = useState<IDType>('id_card')
  const [idNumber, setIdNumber] = useState('')
  const [idDocument, setIdDocument] = useState<string | null>(null)
  const [idDocumentPreview, setIdDocumentPreview] = useState<string | null>(null)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
    }
  }, [isAuthenticated, navigate])

  // Fetch KYC status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true)
      try {
        const response = await getKYCStatus()
        if (response.success) {
          setKycStatus(response.data.status)
          setRejectionReason(response.data.rejectionReason)
          setSubmittedAt(response.data.submittedAt)
        }
      } catch (error) {
        console.error('Error fetching KYC status:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (isAuthenticated) {
      fetchStatus()
    }
  }, [isAuthenticated])

  // Handle file selection for ID document
  const handleIdDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB')
      return
    }

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Please upload an image or PDF file')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      setIdDocument(base64)
      setIdDocumentPreview(file.type === 'application/pdf' ? `pdf:${file.name}` : base64)
    }
    reader.readAsDataURL(file)
  }

  // Handle file selection for selfie
  const handleSelfieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB')
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      setSelfie(base64)
      setSelfiePreview(base64)
    }
    reader.readAsDataURL(file)
  }

  // Submit KYC
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!idDocument) {
      toast.error('Please upload your ID document')
      return
    }

    if (!selfie) {
      toast.error('Please upload your selfie')
      return
    }

    setIsSubmitting(true)
    try {
      const submitFn = kycStatus === 'REJECTED' ? resubmitKYC : submitKYC

      const response = await submitFn({
        idType,
        idNumber: idNumber || undefined,
        idDocument,
        selfie
      })

      if (response.success) {
        toast.success('KYC documents submitted successfully!')
        setKycStatus('PENDING')
        // Clear form
        setIdDocument(null)
        setIdDocumentPreview(null)
        setSelfie(null)
        setSelfiePreview(null)
        setIdNumber('')
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to submit KYC documents')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Render status badge
  const renderStatusBadge = () => {
    switch (kycStatus) {
      case 'APPROVED':
        return (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full">
            <CheckCircleIcon className="h-5 w-5" />
            <span className="font-medium">Verified</span>
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
          <IdentificationIcon className="h-8 w-8 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">KYC Verification</h1>
        <p className="text-gray-600 mt-2">
          Verify your identity to unlock all features
        </p>
      </div>

      {/* Status Card */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Verification Status</h2>
            <p className="text-sm text-gray-500 mt-1">
              {kycStatus === 'APPROVED' && 'Your identity has been verified.'}
              {kycStatus === 'PENDING' && 'Your documents are being reviewed.'}
              {kycStatus === 'REJECTED' && 'Please resubmit your documents.'}
              {kycStatus === 'NOT_SUBMITTED' && 'Submit your documents to get verified.'}
            </p>
          </div>
          {renderStatusBadge()}
        </div>

        {/* Rejection reason */}
        {kycStatus === 'REJECTED' && rejectionReason && (
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

        {/* Submission date */}
        {submittedAt && kycStatus === 'PENDING' && (
          <p className="text-sm text-gray-500 mt-4">
            Submitted on: {new Date(submittedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Approved State */}
      {kycStatus === 'APPROVED' && (
        <div className="card bg-green-50 border-green-200">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-12 w-12 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-800">You're Verified!</h3>
              <p className="text-green-700 mt-1">
                Your identity has been verified. You now have full access to all platform features.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending State */}
      {kycStatus === 'PENDING' && (
        <div className="card bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <ClockIcon className="h-12 w-12 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-yellow-800">Under Review</h3>
              <p className="text-yellow-700 mt-1">
                Your documents are being reviewed by our team. This usually takes 1-2 business days.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Submission Form - Show for NOT_SUBMITTED or REJECTED */}
      {(kycStatus === 'NOT_SUBMITTED' || kycStatus === 'REJECTED') && (
        <form onSubmit={handleSubmit} className="card space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {kycStatus === 'REJECTED' ? 'Resubmit Documents' : 'Submit Documents'}
          </h2>

          {/* ID Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID Document Type <span className="text-red-500">*</span>
            </label>
            <select
              value={idType}
              onChange={(e) => setIdType(e.target.value as IDType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {Object.entries(ID_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* ID Number (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID Number <span className="text-gray-400">(Optional)</span>
            </label>
            <input
              type="text"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="Enter your ID number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* ID Document Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID Document Photo <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">
              Upload a clear photo of the front of your ID document
            </p>

            <input
              ref={idDocumentInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleIdDocumentChange}
              className="hidden"
            />

            {idDocumentPreview ? (
              <div className="relative">
                {idDocumentPreview.startsWith('pdf:') ? (
                  <div className="w-full h-48 flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                    <DocumentTextIcon className="h-16 w-16 text-red-500 mb-2" />
                    <span className="text-sm font-medium text-gray-700">{idDocumentPreview.replace('pdf:', '')}</span>
                    <span className="text-xs text-gray-500 mt-1">PDF Document</span>
                  </div>
                ) : (
                  <img
                    src={idDocumentPreview}
                    alt="ID Document Preview"
                    className="w-full h-48 object-cover rounded-lg border border-gray-200"
                  />
                )}
                <button
                  type="button"
                  onClick={() => idDocumentInputRef.current?.click()}
                  className="absolute bottom-2 right-2 bg-white px-3 py-1 rounded-lg shadow text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => idDocumentInputRef.current?.click()}
                className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-primary-400 hover:bg-primary-50 transition"
              >
                <DocumentTextIcon className="h-12 w-12 text-gray-400 mb-2" />
                <span className="text-sm font-medium text-gray-600">Click to upload ID document</span>
                <span className="text-xs text-gray-400 mt-1">JPG, PNG, PDF up to 5MB</span>
              </button>
            )}
          </div>

          {/* Selfie Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selfie Photo <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">
              Take a clear selfie photo of your face
            </p>

            <input
              ref={selfieInputRef}
              type="file"
              accept="image/*"
              onChange={handleSelfieChange}
              className="hidden"
            />

            {selfiePreview ? (
              <div className="relative">
                <img
                  src={selfiePreview}
                  alt="Selfie Preview"
                  className="w-full h-48 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => selfieInputRef.current?.click()}
                  className="absolute bottom-2 right-2 bg-white px-3 py-1 rounded-lg shadow text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => selfieInputRef.current?.click()}
                className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-primary-400 hover:bg-primary-50 transition"
              >
                <CameraIcon className="h-12 w-12 text-gray-400 mb-2" />
                <span className="text-sm font-medium text-gray-600">Click to upload selfie</span>
                <span className="text-xs text-gray-400 mt-1">JPG, PNG up to 5MB</span>
              </button>
            )}
          </div>

          {/* Guidelines */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Photo Guidelines:</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Ensure the document is clearly visible and not blurry</li>
              <li>• All four corners of the document should be visible</li>
              <li>• For selfie, ensure your face is clearly visible</li>
              <li>• Avoid glare or shadows on the documents</li>
            </ul>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !idDocument || !selfie}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <ArrowUpTrayIcon className="h-5 w-5" />
                {kycStatus === 'REJECTED' ? 'Resubmit Documents' : 'Submit for Verification'}
              </>
            )}
          </button>
        </form>
      )}
    </motion.div>
  )
}

export default KYCVerification
