import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  WalletIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../store/authStore'
import { Link, useSearchParams } from 'react-router-dom'
import axios from '../config/axios'
import toast from 'react-hot-toast'

interface WalletTransaction {
  id: string
  type: 'credit' | 'debit'
  amount: number
  balanceBefore: number
  balanceAfter: number
  description: string
  status: string
  createdAt: any
  relatedOrderId?: string
  relatedTopupId?: string
}

const AMOUNT_PRESETS = [100, 250, 500, 1000]

const Wallet = () => {
  const { user, updateUser } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddFundsModal, setShowAddFundsModal] = useState(false)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchTransactions()
  }, [])

  useEffect(() => {
    const topupStatus = searchParams.get('topup')
    const topupId = searchParams.get('topup_id')
    if (topupStatus === 'verify' && topupId) {
      // Returned from the provider — confirm and credit the wallet.
      verifyTopup(topupId)
    } else if (topupStatus === 'success') {
      toast.success('Wallet top-up successful! Your balance will update shortly.')
      refreshBalance()
      fetchTransactions()
    } else if (topupStatus === 'cancelled') {
      toast.error('Top-up was cancelled.')
    }
  }, [searchParams])

  const refreshBalance = async () => {
    try {
      const res = await axios.get('/api/payments/wallet/balance')
      const balance = res.data?.data?.balance ?? res.data?.balance
      if (typeof balance === 'number' && user) {
        updateUser({ ...user, balance })
      }
    } catch (e) {
      // non-fatal — balance will refresh on next navigation
    }
  }

  const verifyTopup = async (topupId: string) => {
    try {
      const res = (await axios.post('/api/payments/wallet/verify-topup', { topupId })).data
      if (res.success && res.status === 'completed') {
        toast.success('Wallet top-up successful!')
        await refreshBalance()
        fetchTransactions()
      } else {
        toast('Top-up is still processing. Your balance will update once confirmed.')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not confirm top-up')
    }
  }

  const fetchTransactions = async () => {
    try {
      const response = await axios.get('/api/payments/wallet/transactions')
      setTransactions(response.data.data || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
      toast.error('Failed to load transaction history')
    } finally {
      setLoading(false)
    }
  }

  const handleAddFunds = async () => {
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount < 10) {
      toast.error('Minimum top-up amount is $10')
      return
    }

    setSubmitting(true)
    try {
      // Create the pending top-up, then hand off to Stripe Checkout. The wallet
      // is credited by the Stripe webhook, not by this call.
      const created = (await axios.post('/api/payments/wallet/add-funds', { amount: parsedAmount })).data
      if (!created?.success || !created.topupId) {
        toast.error(created?.message || 'Failed to start top-up')
        setSubmitting(false)
        return
      }

      const session = (await axios.post('/api/payments/stripe/topup/create-session', { topupId: created.topupId })).data
      if (session?.success && session.paymentUrl) {
        window.location.href = session.paymentUrl
        return
      }
      toast.error(session?.error || 'Failed to start payment')
      setSubmitting(false)
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to add funds')
      setSubmitting(false)
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-'
    const date = timestamp._seconds
      ? new Date(timestamp._seconds * 1000)
      : new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Wallet</h1>
        <p className="mt-2 text-gray-600">Manage your wallet balance and transactions</p>
      </div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white mb-8"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-primary-100">Available Balance</p>
            <p className="text-3xl font-bold mt-2">${(user?.balance || 0).toFixed(2)}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddFundsModal(true)}
              className="bg-white text-primary-600 px-6 py-3 rounded-lg font-semibold hover:bg-primary-50 transition flex items-center gap-2"
            >
              <PlusIcon className="w-5 h-5" />
              Add Funds
            </button>
            <Link
              to="/withdrawals"
              className="bg-white/20 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/30 transition flex items-center gap-2"
            >
              <BanknotesIcon className="w-5 h-5" />
              Withdraw
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Transaction History */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center">
            <WalletIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No transactions</h3>
            <p className="mt-1 text-sm text-gray-500">Your transaction history will appear here.</p>
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
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(tx.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {tx.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          tx.type === 'credit'
                            ? 'text-green-700 bg-green-50'
                            : 'text-red-700 bg-red-50'
                        }`}
                      >
                        {tx.type === 'credit' ? (
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                        )}
                        {tx.type === 'credit' ? 'Credit' : 'Debit'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                      tx.type === 'credit' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      ${tx.balanceAfter.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Funds Modal */}
      {showAddFundsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-white/20 rounded-full p-2">
                    <PlusIcon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Add Funds</h3>
                    <p className="text-primary-100 text-sm">Top up your wallet with a card</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowAddFundsModal(false); setAmount(''); }}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <XCircleIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Amount presets */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Quick select</label>
                <div className="grid grid-cols-4 gap-2">
                  {AMOUNT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setAmount(String(preset))}
                      className={`py-2 px-3 rounded-lg border text-sm font-semibold transition ${
                        amount === String(preset)
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-300 text-gray-700 hover:border-primary-300'
                      }`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom amount */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (R)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R</span>
                  <input
                    type="number"
                    min="10"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-10 block w-full h-11 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 transition-colors"
                    placeholder="Enter amount (min $10)"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => { setShowAddFundsModal(false); setAmount(''); }}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddFunds}
                  disabled={submitting || !amount || parseFloat(amount) < 10}
                  className="flex-1 px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 transition-all transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {submitting ? 'Processing...' : 'Continue to payment'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default Wallet
