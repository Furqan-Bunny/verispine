import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  BuildingStorefrontIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  EyeIcon,
  XMarkIcon,
  UserIcon,
  IdentificationIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import {
  getPendingSellerApplications,
  getSellerApplicationDetail,
  reviewSellerApplication,
  getSellerApplicationStats,
  type SellerApplicationListItem,
  type SellerApplicationDetail
} from '../../services/adminSellerApplicationService'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import { adminBulkDelete } from '../../services/adminDelete'
import { usePagination } from '../../hooks/usePagination'
import PaginationBar from '../../components/admin/PaginationBar'

const AdminSellerApplications = () => {
  const { user } = useAuthStore()
  const [apps, setApps] = useState<SellerApplicationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStatus, setSelectedStatus] = useState('PENDING')
  const [searchTerm, setSearchTerm] = useState('')
  const [stats, setStats] = useState({
    total: 0, pending: 0, approved: 0, rejected: 0, notSubmitted: 0, sellers: 0
  })

  // Modal state
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [selected, setSelected] = useState<SellerApplicationDetail | null>(null)
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
      const res = await adminBulkDelete('seller-applications', ids)
      setApps(prev => prev.filter((a: any) => !ids.includes(a.id)))
      res.failed?.length
        ? toast.error(`${res.failed.length} failed: ${res.failed[0].reason}`)
        : toast.success(`Deleted ${res.deleted} application${res.deleted > 1 ? 's' : ''}`)
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
      const [appsRes, statsRes] = await Promise.all([
        getPendingSellerApplications(selectedStatus),
        getSellerApplicationStats()
      ])
      if (appsRes.success) setApps(appsRes.data)
      if (statsRes.success) setStats(statsRes.data)
    } catch (error) {
      console.error('Error loading seller applications:', error)
      toast.error('Failed to load seller applications')
    } finally {
      setLoading(false)
    }
  }

  const openReviewModal = async (app: SellerApplicationListItem) => {
    try {
      const response = await getSellerApplicationDetail(app.id)
      if (response.success) {
        setSelected(response.data)
        setShowReviewModal(true)
        setRejectionReason('')
      }
    } catch (error) {
      console.error('Error loading application detail:', error)
      toast.error('Failed to load application detail')
    }
  }

  const handleApprove = async () => {
    if (!selected) return
    setReviewLoading(true)
    try {
      const response = await reviewSellerApplication(selected.userId, 'APPROVED')
      if (response.success) {
        toast.success('Seller application approved')
        setShowReviewModal(false)
        loadData()
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to approve application')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selected) return
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    setReviewLoading(true)
    try {
      const response = await reviewSellerApplication(selected.userId, 'REJECTED', rejectionReason)
      if (response.success) {
        toast.success('Seller application rejected')
        setShowReviewModal(false)
        loadData()
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to reject application')
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
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">{status}</span>
    }
  }

  const filtered = apps.filter(a =>
    a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.application?.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const { paginatedItems, currentPage, totalPages, totalItems, startIndex, endIndex, setCurrentPage } = usePagination({
    data: filtered,
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Seller Applications</h1>
        <p className="text-gray-600">Review and approve users applying to become sellers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BuildingStorefrontIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.sellers}</p>
              <p className="text-sm text-gray-500">Active Sellers</p>
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
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Users</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="all">All Applications</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <BulkDeleteBar
        count={sel.selected.length}
        label="application"
        onClear={sel.clear}
        onDelete={() => setBulkOpen(true)}
      />
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="loading-spinner"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <BuildingStorefrontIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No applications found</p>
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
                      checked={sel.allSelected(paginatedItems.map((a) => a.id))}
                      onChange={() => sel.toggleAll(paginatedItems.map((a) => a.id))}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KYC</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedItems.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={sel.isSelected(app.id)}
                        onChange={() => sel.toggle(app.id)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{app.name}</p>
                        <p className="text-sm text-gray-500">{app.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">{app.application?.companyName}</p>
                      <p className="text-xs text-gray-500">{app.application?.phoneNumber}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(app.application?.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(app.kycStatus)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(app.application?.submittedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openReviewModal(app)}
                          className="text-primary-600 hover:text-primary-800 font-medium text-sm flex items-center gap-1"
                        >
                          <EyeIcon className="h-4 w-4" />
                          Review
                        </button>
                        <button
                          onClick={() => setRowToDelete(app.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete application"
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
        label="application"
      />

      {/* Review Modal */}
      {showReviewModal && selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Seller Application Review</h2>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* User Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Account</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Name:</span> <span className="font-medium ml-1">{selected.name}</span></div>
                  <div><span className="text-gray-500">Email:</span> <span className="font-medium ml-1">{selected.email}</span></div>
                  <div><span className="text-gray-500">Current Role:</span> <span className="font-medium ml-1">{selected.role}</span></div>
                  <div><span className="text-gray-500">KYC:</span> <span className="ml-1">{getStatusBadge(selected.kycStatus)}</span></div>
                </div>
              </div>

              {/* Application Info */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <BuildingStorefrontIcon className="h-5 w-5" /> Business Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Full Name:</span> <span className="font-medium ml-1">{selected.application.fullName}</span></div>
                  <div><span className="text-gray-500">Company:</span> <span className="font-medium ml-1">{selected.application.companyName}</span></div>
                  <div><span className="text-gray-500">Phone:</span> <span className="font-medium ml-1">{selected.application.phoneNumber}</span></div>
                  <div><span className="text-gray-500">Status:</span> <span className="ml-1">{getStatusBadge(selected.application.status)}</span></div>
                  <div><span className="text-gray-500">Submitted:</span> <span className="font-medium ml-1">{formatDate(selected.application.submittedAt)}</span></div>
                  {selected.application.reviewedAt && (
                    <div><span className="text-gray-500">Reviewed:</span> <span className="font-medium ml-1">{formatDate(selected.application.reviewedAt)}</span></div>
                  )}
                </div>
              </div>

              {/* Address */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <IdentificationIcon className="h-5 w-5" /> Business Address
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
                  <div>{selected.application.address?.street}</div>
                  <div>{selected.application.address?.city}, {selected.application.address?.province}</div>
                  <div>{selected.application.address?.postalCode}</div>
                  <div>{selected.application.address?.country}</div>
                </div>
              </div>

              {/* Optional fields */}
              {(selected.application.businessRegNumber || selected.application.taxNumber) && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Registration</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {selected.application.businessRegNumber && (
                      <div><span className="text-gray-500">Business Reg. #:</span> <span className="font-medium ml-1">{selected.application.businessRegNumber}</span></div>
                    )}
                    {selected.application.taxNumber && (
                      <div><span className="text-gray-500">Tax / VAT #:</span> <span className="font-medium ml-1">{selected.application.taxNumber}</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Rejection Reason Input */}
              {selected.application.status === 'PENDING' && (
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

              {/* Previous rejection */}
              {selected.application.rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 mb-1">Previous Rejection Reason:</h4>
                  <p className="text-red-700 text-sm">{selected.application.rejectionReason}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
                disabled={reviewLoading}
              >
                Cancel
              </button>
              {selected.application.status === 'PENDING' && (
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
                    Approve & Promote to Seller
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Single Delete Application Confirmation */}
      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete application"
        message="This clears the user's seller application. The user account is not deleted."
        confirmLabel="Delete application"
        loading={deleting}
        onConfirm={() => doDelete([rowToDelete!])}
        onCancel={() => setRowToDelete(null)}
      />

      {/* Bulk Delete Applications Confirmation */}
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} application${sel.selected.length > 1 ? 's' : ''}`}
        message="This clears the selected users' seller applications. The user accounts are not deleted."
        confirmLabel="Delete applications"
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />
    </motion.div>
  )
}

export default AdminSellerApplications
