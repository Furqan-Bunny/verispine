import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  BanknotesIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import axios from '../../config/axios'
import { formatPrice, formatDate } from '../../utils/formatters'

const SellerPayouts = () => {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestForm, setRequestForm] = useState({ amount: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'seller' && user.role !== 'admin') {
      toast.error('Seller access required')
      navigate('/dashboard')
    }
  }, [user, navigate])

  useEffect(() => { loadWithdrawals() }, [])

  const loadWithdrawals = async () => {
    setLoading(true)
    try {
      const response = await axios.get('/api/withdrawals/my-withdrawals')
      if (response.data?.success) {
        setWithdrawals(response.data.data || [])
      }
    } catch (error) {
      console.error('Error loading withdrawals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(requestForm.amount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (amount > (user?.balance || 0)) {
      toast.error('Insufficient available balance')
      return
    }
    if (!user?.bankDetails?.accountNumber || !user?.bankDetails?.bankName) {
      toast.error('Please add your bank details first in the Business profile')
      navigate('/profile')
      return
    }

    setSubmitting(true)
    try {
      const response = await axios.post('/api/withdrawals/request', {
        amount,
        bankDetails: user.bankDetails,
        notes: requestForm.notes || ''
      })
      if (response.data?.success) {
        toast.success('Payout request submitted')
        setShowRequestModal(false)
        setRequestForm({ amount: '', notes: '' })
        loadWithdrawals()
        // Optimistically reduce balance until refresh
        updateUser({ ...(user as any), balance: (user.balance || 0) - amount })
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to submit payout request')
    } finally {
      setSubmitting(false)
    }
  }

  const cancelWithdrawal = async (id: string) => {
    if (!confirm('Cancel this pending payout request?')) return
    try {
      const response = await axios.delete(`/api/withdrawals/${id}`)
      if (response.data?.success) {
        toast.success('Payout request cancelled')
        loadWithdrawals()
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to cancel')
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; Icon: any }> = {
      pending: { cls: 'bg-amber-100 text-amber-800', Icon: ClockIcon },
      approved: { cls: 'bg-green-100 text-green-800', Icon: CheckCircleIcon },
      rejected: { cls: 'bg-red-100 text-red-800', Icon: XCircleIcon },
      cancelled: { cls: 'bg-gray-100 text-gray-800', Icon: XCircleIcon }
    }
    const m = map[status] || { cls: 'bg-gray-100 text-gray-800', Icon: ClockIcon }
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${m.cls}`}>
        <m.Icon className="h-3 w-3" /> {status}
      </span>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
        <p className="text-gray-600 text-sm mt-1">Request payouts and view payment history</p>
      </div>

      {/* Balance breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BalanceCard
          label="Available Balance"
          subtext="Ready to withdraw"
          value={user?.balance || 0}
          color="primary"
        />
        <BalanceCard
          label="Pending Balance"
          subtext="Unlocks on order delivery"
          value={(user as any)?.pendingBalance || 0}
          color="amber"
        />
        <BalanceCard
          label="Held Balance"
          subtext="Under withdrawal review"
          value={(user as any)?.heldBalance || 0}
          color="gray"
        />
      </div>

      {/* Request payout button */}
      <div className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Request a Payout</h2>
          <p className="text-sm text-gray-500 mt-1">
            Funds typically reflect in your bank within 1-2 business days after admin approval.
          </p>
        </div>
        <button onClick={() => setShowRequestModal(true)} className="btn-primary flex items-center gap-2">
          <ArrowDownTrayIcon className="h-5 w-5" /> Request Payout
        </button>
      </div>

      {/* Tax/fee transparency */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <InformationCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Fee Transparency</p>
            <ul className="space-y-1 text-blue-700">
              <li>• VeriSpine takes a <strong>10% platform fee</strong> on each completed sale (you receive 90%)</li>
              <li>• Funds become available after the buyer marks the order as delivered</li>
              <li>• You're responsible for any applicable taxes on your earnings</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Withdrawal history */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payout History</h2>
        {loading ? (
          <div className="py-8 text-center"><div className="loading-spinner mx-auto"></div></div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-8">
            <BanknotesIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No payouts yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bank</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {withdrawals.map(w => (
                  <tr key={w.id}>
                    <td className="px-4 py-3 text-gray-500">{formatDate(w.requestedAt || w.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatPrice(w.amount || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{w.bankDetails?.bankName || '—'}</td>
                    <td className="px-4 py-3">{statusBadge(w.status)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{w.transactionReference || '—'}</td>
                    <td className="px-4 py-3">
                      {w.status === 'pending' && (
                        <button onClick={() => cancelWithdrawal(w.id)}
                          className="text-xs text-red-600 hover:underline">Cancel</button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Request Payout</h2>
              <p className="text-sm text-gray-500 mb-6">Available balance: {formatPrice(user?.balance || 0)}</p>

              {!user?.bankDetails?.accountNumber ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-amber-800">
                    Add your bank details first.{' '}
                    <Link to="/profile" className="font-semibold underline">Go to Business profile</Link>
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRequestPayout} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount (R)</label>
                    <input type="number" min="0.01" step="0.01" max={user?.balance || 0} required
                      value={requestForm.amount}
                      onChange={(e) => setRequestForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
                    <textarea rows={3} value={requestForm.notes}
                      onChange={(e) => setRequestForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                    Payout to: <strong>{user.bankDetails.bankName}</strong> ***{user.bankDetails.accountNumber?.slice(-4)}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowRequestModal(false)} className="btn-outline">Cancel</button>
                    <button type="submit" disabled={submitting} className="btn-primary">
                      {submitting ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

const BalanceCard = ({ label, subtext, value, color }: any) => {
  const colors: Record<string, string> = {
    primary: 'from-primary-600 to-primary-700 text-white',
    amber: 'from-amber-500 to-amber-600 text-white',
    gray: 'from-gray-500 to-gray-600 text-white'
  }
  return (
    <div className={`rounded-xl p-5 bg-gradient-to-br ${colors[color]}`}>
      <BanknotesIcon className="h-6 w-6 mb-2 opacity-80" />
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{formatPrice(value || 0)}</p>
      <p className="text-xs opacity-75 mt-1">{subtext}</p>
    </div>
  )
}

export default SellerPayouts
