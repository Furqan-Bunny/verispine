import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  ClipboardDocumentListIcon,
  TruckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import axios from '../../config/axios'
import { formatPrice, formatDate } from '../../utils/formatters'

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending_payment', label: 'Pending Payment' },
  { id: 'processing', label: 'Processing' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' }
]

const SellerSales = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'seller' && user.role !== 'admin') {
      toast.error('Seller access required')
      navigate('/dashboard')
    }
  }, [user, navigate])

  useEffect(() => {
    loadSales()
    setSelectedIds(new Set())
  }, [activeTab])

  const loadSales = async () => {
    setLoading(true)
    try {
      const url = activeTab === 'all' ? '/api/orders/my-sales' : `/api/orders/my-sales?status=${activeTab}`
      const response = await axios.get(url)
      if (response.data?.success) {
        setOrders(response.data.data || [])
      }
    } catch (error) {
      console.error('Error loading sales:', error)
      toast.error('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (orderId: string, status: string) => {
    try {
      const response = await axios.put(`/api/orders/${orderId}/status`, { status })
      if (response.data?.success) {
        toast.success(`Order marked as ${status}`)
        loadSales()
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to update status')
    }
  }

  const generateShipment = async (orderId: string) => {
    try {
      const response = await axios.post('/api/shipping/create-shipment', { orderId })
      if (response.data?.success) {
        toast.success('Shipment created')
        loadSales()
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to create shipment')
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredOrders.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredOrders.map(o => o.id)))
  }

  const handleBulkProcess = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    let succeeded = 0
    let failed = 0
    for (const id of Array.from(selectedIds)) {
      try {
        await axios.put(`/api/orders/${id}/status`, { status: 'processing' })
        succeeded++
      } catch {
        failed++
      }
    }
    toast.success(`Bulk update: ${succeeded} succeeded, ${failed} failed`)
    setBulkLoading(false)
    setSelectedIds(new Set())
    loadSales()
  }

  const filteredOrders = orders.filter(o => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (
      o.id?.toLowerCase().includes(q) ||
      o.productTitle?.toLowerCase().includes(q) ||
      o.buyerEmail?.toLowerCase().includes(q) ||
      o.buyerName?.toLowerCase().includes(q)
    )
  })

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending_payment: 'bg-amber-100 text-amber-800',
      processing: 'bg-blue-100 text-blue-800',
      shipped: 'bg-purple-100 text-purple-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      paid: 'bg-blue-100 text-blue-800'
    }
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${map[status] || 'bg-gray-100 text-gray-800'}`}>{status}</span>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Sales</h1>
          <p className="text-gray-600 text-sm mt-1">Manage orders for products you've sold</p>
        </div>
        <button onClick={loadSales} className="btn-outline text-sm flex items-center gap-2">
          <ArrowPathIcon className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total Sales" value={orders.length} color="blue" Icon={ClipboardDocumentListIcon} />
        <Stat label="Pending" value={orders.filter(o => o.status === 'pending_payment').length} color="amber" Icon={ClockIcon} />
        <Stat label="Processing" value={orders.filter(o => o.status === 'processing').length} color="blue" Icon={ClipboardDocumentListIcon} />
        <Stat label="Shipped" value={orders.filter(o => o.status === 'shipped').length} color="purple" Icon={TruckIcon} />
        <Stat label="Delivered" value={orders.filter(o => o.status === 'delivered').length} color="green" Icon={CheckCircleIcon} />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex gap-2">
          {STATUS_TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
                activeTab === tab.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Search + bulk actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search by order ID, product, buyer..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        {selectedIds.size > 0 && (
          <button onClick={handleBulkProcess} disabled={bulkLoading}
            className="btn-primary text-sm whitespace-nowrap">
            {bulkLoading ? 'Processing...' : `Mark ${selectedIds.size} as Processing`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12"><div className="loading-spinner"></div></div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardDocumentListIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No sales found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2">
                    <input type="checkbox"
                      checked={selectedIds.size === filteredOrders.length && filteredOrders.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded" />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Buyer</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/orders/${o.id}`} className="text-primary-600 hover:underline font-medium">
                        #{o.id?.slice(-8)}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">{o.productTitle}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{o.buyerName || '—'}</p>
                      <p className="text-xs text-gray-500">{o.buyerEmail}</p>
                    </td>
                    <td className="px-4 py-3">{statusBadge(o.status)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatPrice(o.totalAmount || o.amount || 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {o.status === 'pending_payment' && (
                          <span className="text-xs text-amber-600">awaiting payment</span>
                        )}
                        {(o.status === 'paid' || o.status === 'processing') && !o.trackingNumber && (
                          <button onClick={() => generateShipment(o.id)}
                            className="text-xs text-primary-600 hover:underline">
                            Generate Tracking
                          </button>
                        )}
                        {o.status === 'processing' && o.trackingNumber && (
                          <button onClick={() => updateStatus(o.id, 'shipped')}
                            className="text-xs text-blue-600 hover:underline">
                            Mark Shipped
                          </button>
                        )}
                        {o.status === 'shipped' && (
                          <button onClick={() => updateStatus(o.id, 'delivered')}
                            className="text-xs text-green-600 hover:underline">
                            Mark Delivered
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  )
}

const Stat = ({ label, value, Icon, color }: any) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
    green: 'bg-green-100 text-green-600'
  }
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

export default SellerSales
