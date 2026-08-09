import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BanknotesIcon, ClockIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { useAuthStore } from '../store/authStore'
import axios from '../config/axios'
import toast from 'react-hot-toast'
import notificationService from '../services/notificationService'

interface BankDetails {
  accountNumber: string
  bankName: string
  accountHolder: string
  branchCode: string
  accountType: string
}

interface Withdrawal {
  id: string
  amount: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  bankDetails: BankDetails
  requestedAt: any
  approvedAt?: any
  rejectedAt?: any
  rejectionReason?: string
  transactionReference?: string
  notes?: string
}

const Withdrawals = () => {
  const { user } = useAuthStore()
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    bankDetails: {
      accountNumber: '',
      bankName: '',
      accountHolder: '',
      branchCode: '',
      accountType: 'Savings'
    },
    notes: ''
  })

  useEffect(() => {
    fetchWithdrawals()
  }, [])

  const fetchWithdrawals = async () => {
    try {
      const response = await axios.get('/api/withdrawals/my-withdrawals')
      setWithdrawals(response.data.data)
    } catch (error) {
      console.error('Error fetching withdrawals:', error)
      toast.error('Failed to fetch withdrawal history')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (submitting) return // Prevent double submission
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (!formData.bankDetails.accountNumber || !formData.bankDetails.bankName) {
      toast.error('Please provide bank details')
      return
    }

    if (user && parseFloat(formData.amount) > user.balance) {
      toast.error(`Insufficient balance. Available: $${user.balance}`)
      return
    }

    setSubmitting(true)
    console.log('Starting withdrawal request submission...')
    
    try {
      const response = await axios.post('/api/withdrawals/request', {
        amount: parseFloat(formData.amount),
        bankDetails: formData.bankDetails,
        notes: formData.notes
      })
      
      console.log('Withdrawal request successful:', response.data)

      // Close modal immediately after successful request
      setShowRequestModal(false)
      
      // Reset form data
      setFormData({
        amount: '',
        bankDetails: {
          accountNumber: '',
          bankName: '',
          accountHolder: '',
          branchCode: '',
          accountType: 'Savings'
        },
        notes: ''
      })
      
      // Reset submitting state
      setSubmitting(false)
      
      // Show success message
      toast.success('Withdrawal request submitted successfully')
      
      // Create notification
      try {
        notificationService.createWithdrawalNotification('requested', parseFloat(formData.amount))
      } catch (notifError) {
        console.error('Failed to create notification:', notifError)
      }
      
      // Refresh withdrawals list (don't await - do it in background)
      fetchWithdrawals()
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to submit withdrawal request'
      const pendingId = error.response?.data?.pendingWithdrawalId
      
      toast.error(errorMessage)
      
      // Reset submitting state on error
      setSubmitting(false)
      
      // If there's a pending withdrawal, refresh the list to show it
      if (pendingId) {
        console.log('Found pending withdrawal:', pendingId)
        fetchWithdrawals()
      }
    }
  }

  const cancelWithdrawal = async (withdrawalId: string) => {
    if (!confirm('Are you sure you want to cancel this withdrawal request?')) return

    try {
      await axios.delete(`/api/withdrawals/${withdrawalId}`)
      toast.success('Withdrawal cancelled successfully')
      fetchWithdrawals()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to cancel withdrawal')
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <ClockIcon className="w-5 h-5" />
      case 'approved': return <CheckCircleIcon className="w-5 h-5" />
      case 'rejected': return <XCircleIcon className="w-5 h-5" />
      default: return null
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Withdrawals</h1>
        <p className="mt-2 text-gray-600">Manage your balance withdrawals</p>
      </div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-100">Available Balance</p>
            <p className="text-3xl font-bold mt-2">${user?.balance || 0}</p>
          </div>
          <button
            onClick={() => setShowRequestModal(true)}
            disabled={!user || user.balance === 0}
            className="bg-white text-primary-600 px-6 py-3 rounded-lg font-semibold hover:bg-primary-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Request Withdrawal
          </button>
        </div>
      </motion.div>

      {/* Withdrawal History */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Withdrawal History</h2>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading withdrawals...</p>
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="p-8 text-center">
            <BanknotesIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No withdrawals</h3>
            <p className="mt-1 text-sm text-gray-500">You haven't made any withdrawal requests yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bank Details
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
                {withdrawals.map((withdrawal) => (
                  <tr key={withdrawal.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(withdrawal.requestedAt._seconds * 1000).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${withdrawal.amount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {withdrawal.bankDetails.bankName} - ***{withdrawal.bankDetails.accountNumber.slice(-4)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(withdrawal.status)}`}>
                        {getStatusIcon(withdrawal.status)}
                        {withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                      </span>
                      {withdrawal.rejectionReason && (
                        <p className="text-xs text-red-600 mt-1">{withdrawal.rejectionReason}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {withdrawal.status === 'pending' && (
                        <button
                          onClick={() => cancelWithdrawal(withdrawal.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Cancel
                        </button>
                      )}
                      {withdrawal.transactionReference && (
                        <span className="text-gray-500">Ref: {withdrawal.transactionReference}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-white/20 rounded-full p-2">
                    <BanknotesIcon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Request Withdrawal</h3>
                    <p className="text-primary-100 text-sm">Transfer funds to your bank account</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <XCircleIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmitRequest} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (R)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="pl-10 block w-full h-11 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 transition-colors"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <p className="mt-2 text-sm text-primary-600 font-medium">Available balance: ${user?.balance || 0}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={formData.bankDetails.bankName}
                      onChange={(e) => setFormData({
                        ...formData,
                        bankDetails: { ...formData.bankDetails, bankName: e.target.value }
                      })}
                      className="block w-full h-11 px-3 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 transition-colors"
                      placeholder="e.g. Standard Bank"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={formData.bankDetails.accountNumber}
                      onChange={(e) => setFormData({
                        ...formData,
                        bankDetails: { ...formData.bankDetails, accountNumber: e.target.value }
                      })}
                      className="block w-full h-11 px-3 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 transition-colors"
                      placeholder="1234567890"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name</label>
                  <input
                    type="text"
                    value={formData.bankDetails.accountHolder}
                    onChange={(e) => setFormData({
                      ...formData,
                      bankDetails: { ...formData.bankDetails, accountHolder: e.target.value }
                    })}
                    placeholder={`${user?.firstName} ${user?.lastName}`}
                    className="block w-full h-11 px-3 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch Code</label>
                    <input
                      type="text"
                      value={formData.bankDetails.branchCode}
                      onChange={(e) => setFormData({
                        ...formData,
                        bankDetails: { ...formData.bankDetails, branchCode: e.target.value }
                      })}
                      className="block w-full h-11 px-3 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 transition-colors"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                    <select
                      value={formData.bankDetails.accountType}
                      onChange={(e) => setFormData({
                        ...formData,
                        bankDetails: { ...formData.bankDetails, accountType: e.target.value }
                      })}
                      className="block w-full h-11 px-3 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 transition-colors"
                    >
                      <option value="Savings">Savings</option>
                      <option value="Current">Current</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="block w-full p-3 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 transition-colors resize-none"
                    placeholder="Any additional information..."
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 transition-all transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default Withdrawals