import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  IdentificationIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  EyeIcon,
  XMarkIcon,
  DocumentTextIcon,
  UserIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import {
  getPendingKYC,
  getKYCDocuments,
  reviewKYC,
  getKYCStats,
  type KYCSubmission,
  type KYCDocumentDetails
} from '../../services/adminKycService'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import { adminBulkDelete } from '../../services/adminDelete'
import { usePagination } from '../../hooks/usePagination'
import PaginationBar from '../../components/admin/PaginationBar'

const AdminKYC = () => {
  const { user } = useAuthStore()
  const [submissions, setSubmissions] = useState<KYCSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStatus, setSelectedStatus] = useState('PENDING')
  const [searchTerm, setSearchTerm] = useState('')
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, notSubmitted: 0 })

  // Modal state
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<KYCDocumentDetails | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  // Delete state
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('kyc', ids)
      setSubmissions(prev => prev.filter((s: any) => !ids.includes(s.id)))
      res.failed?.length
        ? toast.error(`${res.failed.length} failed: ${res.failed[0].reason}`)
        : toast.success(`Removed ${res.deleted} KYC submission${res.deleted > 1 ? 's' : ''}`)
      sel.clear()
      setRowToDelete(null)
      setBulkOpen(false)
      loadData()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (user?.role !== 'admin') return
    loadData()
  }, [user, selectedStatus])

  const loadData = async () => {
    setLoading(true)
    try {
      const [submissionsRes, statsRes] = await Promise.all([
        getPendingKYC(selectedStatus),
        getKYCStats()
      ])

      if (submissionsRes.success) {
        setSubmissions(submissionsRes.data)
      }
      if (statsRes.success) {
        setStats(statsRes.data)
      }
    } catch (error) {
      console.error('Error loading KYC data:', error)
      toast.error('Failed to load KYC submissions')
    } finally {
      setLoading(false)
    }
  }

  const openReviewModal = async (submission: KYCSubmission) => {
    try {
      const response = await getKYCDocuments(submission.id)
      if (response.success) {
        setSelectedSubmission(response.data)
        setShowReviewModal(true)
        setRejectionReason('')
      }
    } catch (error) {
      console.error('Error loading KYC documents:', error)
      toast.error('Failed to load KYC documents')
    }
  }

  const handleApprove = async () => {
    if (!selectedSubmission) return

    setReviewLoading(true)
    try {
      const response = await reviewKYC(selectedSubmission.userId, 'APPROVED')
      if (response.success) {
        toast.success('KYC approved successfully')
        setShowReviewModal(false)
        loadData()
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to approve KYC')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selectedSubmission) return

    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }

    setReviewLoading(true)
    try {
      const response = await reviewKYC(selectedSubmission.userId, 'REJECTED', rejectionReason)
      if (response.success) {
        toast.success('KYC rejected')
        setShowReviewModal(false)
        loadData()
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to reject KYC')
    } finally {
      setReviewLoading(false)
    }
  }

  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    const d = date._seconds ? new Date(date._seconds * 1000) : new Date(date)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Approved</span>
      case 'PENDING':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Pending</span>
      case 'REJECTED':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Rejected</span>
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">Not Submitted</span>
    }
  }

  const getIdTypeLabel = (idType: string) => {
    const labels: Record<string, string> = {
      id_card: 'SA ID Card',
      passport: 'Passport',
      drivers_license: "Driver's License"
    }
    return labels[idType] || idType
  }

  const filteredSubmissions = submissions.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const { paginatedItems, currentPage, totalPages, totalItems, startIndex, endIndex, setCurrentPage } = usePagination({
    data: filteredSubmissions,
    itemsPerPage: 20,
    resetPageOn: [selectedStatus, searchTerm]
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KYC Verification</h1>
          <p className="text-gray-600">Review and manage user KYC submissions</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <IdentificationIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Users</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ClockIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
              <p className="text-sm text-gray-500">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.approved}</p>
              <p className="text-sm text-gray-500">Approved</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircleIcon className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.rejected}</p>
              <p className="text-sm text-gray-500">Rejected</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <UserIcon className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.notSubmitted}</p>
              <p className="text-sm text-gray-500">Not Submitted</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="all">All Submissions</option>
          </select>
        </div>
      </div>

      {/* Submissions Table */}
      <BulkDeleteBar
        count={sel.selected.length}
        label="KYC submission"
        onClear={sel.clear}
        onDelete={() => setBulkOpen(true)}
      />
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="loading-spinner"></div>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="text-center py-12">
            <IdentificationIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No KYC submissions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={sel.allSelected(paginatedItems.map((s) => s.id))}
                      onChange={() => sel.toggleAll(paginatedItems.map((s) => s.id))}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedItems.map((submission) => (
                  <tr key={submission.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={sel.isSelected(submission.id)}
                        onChange={() => sel.toggle(submission.id)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{submission.name}</p>
                        <p className="text-sm text-gray-500">{submission.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(submission.kycStatus)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {submission.kycDocuments?.idType ? getIdTypeLabel(submission.kycDocuments.idType) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(submission.kycSubmittedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openReviewModal(submission)}
                          className="text-primary-600 hover:text-primary-800 font-medium text-sm flex items-center gap-1"
                        >
                          <EyeIcon className="h-4 w-4" />
                          Review
                        </button>
                        <button
                          onClick={() => setRowToDelete(submission.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Remove KYC submission"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationBar
        total={totalItems}
        start={startIndex}
        end={endIndex}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        label="submission"
      />

      {/* Review Modal */}
      {showReviewModal && selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">KYC Review</h2>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* User Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">User Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Name:</span>
                    <span className="ml-2 font-medium">{selectedSubmission.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Email:</span>
                    <span className="ml-2 font-medium">{selectedSubmission.email}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">ID Type:</span>
                    <span className="ml-2 font-medium">{getIdTypeLabel(selectedSubmission.kycDocuments.idType)}</span>
                  </div>
                  {selectedSubmission.kycDocuments.idNumber && (
                    <div>
                      <span className="text-gray-500">ID Number:</span>
                      <span className="ml-2 font-medium">{selectedSubmission.kycDocuments.idNumber}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Submitted:</span>
                    <span className="ml-2 font-medium">{formatDate(selectedSubmission.kycSubmittedAt)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <span className="ml-2">{getStatusBadge(selectedSubmission.kycStatus)}</span>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ID Document */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <DocumentTextIcon className="h-5 w-5" />
                    ID Document
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <img
                      src={selectedSubmission.kycDocuments.idDocument}
                      alt="ID Document"
                      className="w-full h-64 object-contain bg-gray-100"
                    />
                  </div>
                  <a
                    href={selectedSubmission.kycDocuments.idDocument}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline text-sm mt-2 inline-block"
                  >
                    Open in new tab
                  </a>
                </div>

                {/* Selfie */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <UserIcon className="h-5 w-5" />
                    Selfie Photo
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <img
                      src={selectedSubmission.kycDocuments.selfie}
                      alt="Selfie"
                      className="w-full h-64 object-contain bg-gray-100"
                    />
                  </div>
                  <a
                    href={selectedSubmission.kycDocuments.selfie}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline text-sm mt-2 inline-block"
                  >
                    Open in new tab
                  </a>
                </div>
              </div>

              {/* Rejection Reason Input (only for pending) */}
              {selectedSubmission.kycStatus === 'PENDING' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason (required if rejecting)
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 h-24 resize-none"
                  />
                </div>
              )}

              {/* Previous rejection reason */}
              {selectedSubmission.kycRejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 mb-1">Previous Rejection Reason:</h4>
                  <p className="text-red-700 text-sm">{selectedSubmission.kycRejectionReason}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
                disabled={reviewLoading}
              >
                Cancel
              </button>
              {selectedSubmission.kycStatus === 'PENDING' && (
                <>
                  <button
                    onClick={handleReject}
                    disabled={reviewLoading}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <XCircleIcon className="h-5 w-5" />
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={reviewLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <CheckCircleIcon className="h-5 w-5" />
                    Approve
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Single Remove KYC Confirmation */}
      <ConfirmDialog
        open={!!rowToDelete}
        title="Remove KYC submission"
        message="This clears the user's KYC submission and resets them to Not Submitted. The user account is not deleted."
        confirmLabel="Remove KYC submission"
        loading={deleting}
        onConfirm={() => doDelete([rowToDelete!])}
        onCancel={() => setRowToDelete(null)}
      />

      {/* Bulk Remove KYC Confirmation */}
      <ConfirmDialog
        open={bulkOpen}
        title={`Remove ${sel.selected.length} KYC submission${sel.selected.length > 1 ? 's' : ''}`}
        message="This clears the selected users' KYC submissions and resets them to Not Submitted. The user accounts are not deleted."
        confirmLabel="Remove submissions"
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />
    </motion.div>
  )
}

export default AdminKYC
