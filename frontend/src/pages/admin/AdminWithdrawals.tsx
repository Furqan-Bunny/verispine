import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BanknotesIcon, CheckIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline'
import axios from '../../config/axios'
import toast from 'react-hot-toast'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import { adminBulkDelete } from '../../services/adminDelete'
import { usePagination } from '../../hooks/usePagination'
import PaginationBar from '../../components/admin/PaginationBar'

interface BankDetails {
  accountNumber: string
  bankName: string
  accountHolder: string
  branchCode: string
  accountType: string
}

interface Withdrawal {
  id: string
  userId: string
  userName: string
  userEmail: string
  amount: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  bankDetails: BankDetails
  requestedAt: any
  approvedAt?: any
  rejectedAt?: any
  rejectionReason?: string
  transactionReference?: string
  notes?: string
  adminNotes?: string
  user?: any
}

const AdminWithdrawals = () => {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null)
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject', withdrawal: Withdrawal } | null>(null)
  const [actionData, setActionData] = useState({
    transactionReference: '',
    notes: '',
    rejectionReason: ''
  })
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { paginatedItems, currentPage, totalPages, totalItems, startIndex, endIndex, setCurrentPage } = usePagination({
    data: withdrawals,
    itemsPerPage: 20,
    resetPageOn: [filter]
  })

  useEffect(() => {
    fetchWithdrawals()
  }, [filter])

  const fetchWithdrawals = async () => {
    try {
      setLoading(true)
      const params = filter === 'all' ? {} : { status: filter }
      const response = await axios.get('/api/withdrawals/admin/all', { params })
      setWithdrawals(response.data.data)
    } catch (error) {
      console.error('Error fetching withdrawals:', error)
      toast.error('Failed to fetch withdrawals')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!actionModal || actionModal.type !== 'approve') return

    try {
      await axios.post(`/api/withdrawals/admin/approve/${actionModal.withdrawal.id}`, {
        transactionReference: actionData.transactionReference,
        notes: actionData.notes
      })
      
      toast.success('Withdrawal approved successfully')
      setActionModal(null)
      setActionData({ transactionReference: '', notes: '', rejectionReason: '' })
      fetchWithdrawals()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to approve withdrawal')
    }
  }

  const handleReject = async () => {
    if (!actionModal || actionModal.type !== 'reject') return

    if (!actionData.rejectionReason) {
      toast.error('Please provide a rejection reason')
      return
    }

    try {
      await axios.post(`/api/withdrawals/admin/reject/${actionModal.withdrawal.id}`, {
        reason: actionData.rejectionReason
      })
      
      toast.success('Withdrawal rejected successfully')
      setActionModal(null)
      setActionData({ transactionReference: '', notes: '', rejectionReason: '' })
      fetchWithdrawals()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reject withdrawal')
    }
  }

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('withdrawals', ids)
      setWithdrawals(prev => prev.filter(w => !ids.includes(w.id)))
      if (res.failed?.length) toast.error(`${res.failed.length} could not be deleted: ${res.failed[0].reason}`)
      else toast.success(`Deleted ${res.deleted}`)
      sel.clear(); setRowToDelete(null); setBulkOpen(false)
      fetchWithdrawals()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50'
      case 'approved': return 'text-green-600 bg-green-50'
      case 'rejected': return 'text-red-600 bg-red-50'
      case 'cancelled': return 'text-gray-600 bg-gray-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const stats = {
    total: withdrawals.length,
    pending: withdrawals.filter(w => w.status === 'pending').length,
    approved: withdrawals.filter(w => w.status === 'approved').length,
    rejected: withdrawals.filter(w => w.status === 'rejected').length,
    totalAmount: withdrawals.reduce((sum, w) => sum + Number(w.amount), 0),
    pendingAmount: withdrawals.filter(w => w.status === 'pending').reduce((sum, w) => sum + Number(w.amount), 0)
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Withdrawal Management</h1>
        <p className="mt-1 text-sm text-gray-500">Review and process withdrawal requests</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-blue-100 rounded-lg p-3">
              <BanknotesIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Requests</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-yellow-100 rounded-lg p-3">
              <BanknotesIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.pending}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-green-100 rounded-lg p-3">
              <CheckIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Approved</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.approved}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-purple-100 rounded-lg p-3">
              <BanknotesIcon className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pending Amount</p>
              <p className="text-2xl font-semibold text-gray-900">R{stats.pendingAmount}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-1 mb-6">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              filter === status
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Withdrawals Table */}
      <BulkDeleteBar
        count={sel.selected.length}
        label="withdrawal"
        onClear={sel.clear}
        onDelete={() => setBulkOpen(true)}
      />
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading withdrawals...</p>
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="p-8 text-center">
            <BanknotesIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No withdrawals found</h3>
            <p className="mt-1 text-sm text-gray-500">No withdrawal requests match your filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={sel.allSelected(paginatedItems.map(w => w.id))}
                      onChange={() => sel.toggleAll(paginatedItems.map(w => w.id))}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bank Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedItems.map((withdrawal) => (
                  <tr key={withdrawal.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={sel.isSelected(withdrawal.id)}
                        onChange={() => sel.toggle(withdrawal.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{withdrawal.userName}</div>
                        <div className="text-sm text-gray-500">{withdrawal.userEmail}</div>
                        {withdrawal.user && (
                          <div className="text-xs text-gray-400">Balance: R{withdrawal.user.balance}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">R{withdrawal.amount}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{withdrawal.bankDetails.bankName}</div>
                      <div className="text-sm text-gray-500">
                        {withdrawal.bankDetails.accountHolder || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-400">
                        ***{withdrawal.bankDetails.accountNumber.slice(-4)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(withdrawal.requestedAt._seconds * 1000).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(withdrawal.status)}`}>
                        {withdrawal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setSelectedWithdrawal(withdrawal)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          View
                        </button>
                        {withdrawal.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setActionModal({ type: 'approve', withdrawal })}
                              className="text-green-600 hover:text-green-900"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setActionModal({ type: 'reject', withdrawal })}
                              className="text-red-600 hover:text-red-900"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setRowToDelete(withdrawal.id)}
                          title="Delete"
                          className="text-red-600 hover:text-red-800"
                        >
                          <TrashIcon className="h-5 w-5" />
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
        label="withdrawal"
      />

      {/* View Details Modal */}
      {selectedWithdrawal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Withdrawal Details</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">User</p>
                  <p className="mt-1 text-sm text-gray-900">{selectedWithdrawal.userName}</p>
                  <p className="text-xs text-gray-500">{selectedWithdrawal.userEmail}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Amount</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">R{selectedWithdrawal.amount}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Bank Details</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-sm"><span className="font-medium">Bank:</span> {selectedWithdrawal.bankDetails.bankName}</p>
                  <p className="text-sm"><span className="font-medium">Account:</span> {selectedWithdrawal.bankDetails.accountNumber}</p>
                  <p className="text-sm"><span className="font-medium">Holder:</span> {selectedWithdrawal.bankDetails.accountHolder}</p>
                  <p className="text-sm"><span className="font-medium">Branch:</span> {selectedWithdrawal.bankDetails.branchCode || 'N/A'}</p>
                  <p className="text-sm"><span className="font-medium">Type:</span> {selectedWithdrawal.bankDetails.accountType}</p>
                </div>
              </div>

              {selectedWithdrawal.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-500">User Notes</p>
                  <p className="mt-1 text-sm text-gray-900">{selectedWithdrawal.notes}</p>
                </div>
              )}

              {selectedWithdrawal.adminNotes && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Admin Notes</p>
                  <p className="mt-1 text-sm text-gray-900">{selectedWithdrawal.adminNotes}</p>
                </div>
              )}

              {selectedWithdrawal.transactionReference && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Transaction Reference</p>
                  <p className="mt-1 text-sm text-gray-900">{selectedWithdrawal.transactionReference}</p>
                </div>
              )}

              {selectedWithdrawal.rejectionReason && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Rejection Reason</p>
                  <p className="mt-1 text-sm text-red-600">{selectedWithdrawal.rejectionReason}</p>
                </div>
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => setSelectedWithdrawal(null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg max-w-md w-full p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {actionModal.type === 'approve' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Amount</p>
                <p className="text-lg font-semibold">R{actionModal.withdrawal.amount}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">User</p>
                <p className="text-sm font-medium">{actionModal.withdrawal.userName}</p>
              </div>

              {actionModal.type === 'approve' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Transaction Reference</label>
                    <input
                      type="text"
                      value={actionData.transactionReference}
                      onChange={(e) => setActionData({ ...actionData, transactionReference: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                      placeholder="Bank transfer reference"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                    <textarea
                      value={actionData.notes}
                      onChange={(e) => setActionData({ ...actionData, notes: e.target.value })}
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rejection Reason</label>
                  <textarea
                    value={actionData.rejectionReason}
                    onChange={(e) => setActionData({ ...actionData, rejectionReason: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    placeholder="Please provide a reason for rejection"
                    required
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setActionModal(null)
                  setActionData({ transactionReference: '', notes: '', rejectionReason: '' })
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={actionModal.type === 'approve' ? handleApprove : handleReject}
                className={`flex-1 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  actionModal.type === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionModal.type === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete withdrawal request?"
        message="This permanently deletes the withdrawal request record. This action cannot be undone."
        loading={deleting}
        onConfirm={() => doDelete([rowToDelete!])}
        onCancel={() => setRowToDelete(null)}
      />
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} withdrawal${sel.selected.length > 1 ? 's' : ''}?`}
        message="This permanently deletes the selected withdrawal request records. This action cannot be undone."
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />
    </div>
  )
}

export default AdminWithdrawals