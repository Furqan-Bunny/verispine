import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from '../../config/axios'
import { useAuthStore } from '../../store/authStore'
import { exportOrderPDF } from '../../utils/orderPdfExport'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  TruckIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  UserIcon,
  DocumentTextIcon,
  ChevronUpDownIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { formatPrice } from '../../utils/formatters'
import toast from 'react-hot-toast'
import { usePagination } from '../../hooks/usePagination'
import PaginationBar from '../../components/admin/PaginationBar'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { adminBulkDelete } from '../../services/adminDelete'

// Enhanced TypeScript interfaces
interface Order {
  id: string
  orderId: string
  productId: string
  productTitle: string
  productImage?: string
  buyerId: string
  buyerName?: string
  buyerEmail?: string
  sellerId?: string
  sellerName?: string
  type: 'buy_now' | 'auction_win'
  totalAmount: number
  quantity: number
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded'
  paymentMethod?: string
  shippingAddress?: {
    fullName?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    state?: string
    zipCode?: string
    country?: string
    phoneNumber?: string
  }
  trackingNumber?: string
  shippingCarrier?: string
  adminNotes?: string
  customerNotes?: string
  createdAt: string
  updatedAt?: string
  estimatedDelivery?: string
  deliveredAt?: string
}

interface OrderAnalytics {
  totalOrders: number
  totalRevenue: number
  pendingOrders: number
  processingOrders: number
  shippedOrders: number
  deliveredOrders: number
  cancelledOrders: number
  averageOrderValue: number
  revenueGrowth: number
  orderGrowth: number
}

interface DateRange {
  startDate: string
  endDate: string
}

const AdminOrders = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [updateLoading, setUpdateLoading] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSellerId, setFilterSellerId] = useState('all')
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [shippingCarrier, setShippingCarrier] = useState('SAPO')
  const [adminNotes, setAdminNotes] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: '',
    endDate: ''
  })
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [analytics, setAnalytics] = useState<OrderAnalytics>({
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    processingOrders: 0,
    shippedOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    averageOrderValue: 0,
    revenueGrowth: 0,
    orderGrowth: 0
  })

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error('Admin access required')
      navigate('/')
      return
    }
    fetchOrders()
    fetchAnalytics()
  }, [user])

  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchOrders()
      fetchAnalytics(dateRange.startDate, dateRange.endDate)
    }
  }, [dateRange])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (dateRange.startDate) params.append('startDate', dateRange.startDate)
      if (dateRange.endDate) params.append('endDate', dateRange.endDate)
      if (filterStatus !== 'all') params.append('status', filterStatus)
      
      const response = await axios.get(`/api/orders/admin/all?${params.toString()}`)
      if (response.data.success) {
        setOrders(response.data.data || [])
      }
    } catch (error: any) {
      console.error('Error fetching orders:', error)
      if (error.response?.status === 403) {
        toast.error('Admin access required')
        navigate('/')
      } else {
        toast.error('Failed to fetch orders')
      }
    } finally {
      setLoading(false)
    }
  }

  // Fetch analytics data from the new endpoint
  const fetchAnalytics = async (startDate?: string, endDate?: string) => {
    try {
      setAnalyticsLoading(true)
      const params = new URLSearchParams()
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      
      const response = await axios.get(`/api/admin-ext/orders/analytics?${params.toString()}`)
      if (response.data.success) {
        setAnalytics(response.data.data)
      }
    } catch (error: any) {
      console.error('Error fetching analytics:', error)
      toast.error('Failed to fetch order analytics')
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const sellerOrderOptions = Array.from(
    orders.reduce((map: Map<string, string>, o: any) => {
      if (o.sellerId) {
        map.set(o.sellerId, o.sellerName || o.sellerId.slice(0, 8))
      }
      return map
    }, new Map<string, string>())
  ).sort(([, a], [, b]) => a.localeCompare(b))

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.orderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.productTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.buyerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.buyerEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.sellerName?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = filterStatus === 'all' || order.status === filterStatus
    const matchesSeller = filterSellerId === 'all' || order.sellerId === filterSellerId

    return matchesSearch && matchesStatus && matchesSeller
  })

  // Pagination
  const {
    paginatedItems: paginatedOrders,
    currentPage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    setCurrentPage
  } = usePagination({
    data: filteredOrders,
    itemsPerPage: 20,
    resetPageOn: [searchQuery, filterStatus, filterSellerId, dateRange.startDate, dateRange.endDate]
  })

  const handleSelectAll = () => {
    if (paginatedOrders.every(o => selectedOrders.includes(o.orderId)) && paginatedOrders.length > 0) {
      setSelectedOrders(selectedOrders.filter(id => !paginatedOrders.some(o => o.orderId === id)))
    } else {
      setSelectedOrders(Array.from(new Set([...selectedOrders, ...paginatedOrders.map(o => o.orderId)])))
    }
  }

  // Hard-delete one or many orders via the admin bulk-delete endpoint.
  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('orders', ids)
      setOrders(prev => prev.filter((r: any) => !ids.includes(r.orderId)))
      res.failed?.length
        ? toast.error(`${res.failed.length} failed: ${res.failed[0].reason}`)
        : toast.success(`Deleted ${res.deleted}`)
      setSelectedOrders([])
      setRowToDelete(null)
      setBulkOpen(false)
      fetchAnalytics(dateRange.startDate, dateRange.endDate)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const handleSelectOrder = (orderId: string) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId))
    } else {
      setSelectedOrders([...selectedOrders, orderId])
    }
  }

  const handleViewOrder = (order: any) => {
    setSelectedOrder(order)
    setShowOrderModal(true)
  }

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      setUpdateLoading(orderId)
      const response = await axios.put(`/api/admin-ext/orders/${orderId}/status`, {
        status: newStatus
      })
      if (response.data.success) {
        // Backend returns extra fields (trackingNumber, carrier, sapoAction) on a successful
        // 'shipped' transition because the endpoint also calls SAPO and registers the parcel.
        const data = response.data.data || {}
        const trackingNumber = data.trackingNumber
        const carrier = data.carrier
        const sapoAction = data.sapoAction

        if (sapoAction === 'created' && trackingNumber) {
          toast.success(`Order shipped — SAPO tracking: ${trackingNumber}`)
        } else {
          toast.success(`Order status updated to ${newStatus}`)
        }

        // Update local state with new tracking info too
        setOrders(orders.map(o =>
          o.orderId === orderId
            ? {
                ...o,
                status: newStatus as Order['status'],
                ...(trackingNumber ? { trackingNumber } : {}),
                ...(carrier ? { shippingCarrier: carrier } : {})
              }
            : o
        ))

        // Refresh analytics
        fetchAnalytics(dateRange.startDate, dateRange.endDate)
      }
    } catch (error: any) {
      console.error('Error updating order status:', error)
      const errResp = error.response?.data
      const msg = errResp?.error || 'Failed to update order status'
      const hint = errResp?.hint
      toast.error(hint ? `${msg}\n${hint}` : msg, { duration: 6000 })
    } finally {
      setUpdateLoading(null)
    }
  }

  const handleAddTracking = async (orderId: string) => {
    try {
      setUpdateLoading(orderId)
      const response = await axios.put(`/api/admin-ext/orders/${orderId}/tracking`, {
        trackingNumber: trackingNumber,
        shippingCarrier: shippingCarrier
      })
      if (response.data.success) {
        toast.success('Tracking information added')
        setOrders(orders.map(o => 
          o.orderId === orderId ? { ...o, trackingNumber, shippingCarrier } : o
        ))
        setShowTrackingModal(false)
        setTrackingNumber('')
        setShippingCarrier('Standard Shipping')
      }
    } catch (error: any) {
      console.error('Error adding tracking:', error)
      toast.error(error.response?.data?.error || 'Failed to add tracking information')
    } finally {
      setUpdateLoading(null)
    }
  }

  const handleAddNotes = async (orderId: string) => {
    try {
      setUpdateLoading(orderId)
      const response = await axios.put(`/api/admin-ext/orders/${orderId}/notes`, {
        adminNotes: adminNotes
      })
      if (response.data.success) {
        toast.success('Admin notes updated')
        setOrders(orders.map(o =>
          o.orderId === orderId ? { ...o, adminNotes } : o
        ))
        setAdminNotes('')
      }
    } catch (error: any) {
      console.error('Error updating notes:', error)
      toast.error(error.response?.data?.error || 'Failed to update notes')
    } finally {
      setUpdateLoading(null)
    }
  }

  // Track shipment via SAPO
  const handleTrackShipment = async (trackingNumber: string) => {
    try {
      const response = await axios.get(`/api/shipping/track/${trackingNumber}`)
      if (response.data.success && response.data.data.items?.length > 0) {
        const trackingInfo = response.data.data.items[0]
        toast.success(`Status: ${trackingInfo.currentStatus || 'In Transit'}`)
      } else {
        toast.error('No tracking info found')
      }
    } catch (error: any) {
      console.error('Error tracking shipment:', error)
      toast.error('Failed to get tracking info')
    }
  }

  const handleBulkStatusUpdate = async (newStatus: Order['status']) => {
    if (selectedOrders.length === 0) {
      toast.error('Please select orders first')
      return
    }

    try {
      setUpdateLoading('bulk')
      const response = await axios.put('/api/admin-ext/orders/bulk/status', {
        orderIds: selectedOrders,
        status: newStatus
      })
      
      if (response.data.success) {
        toast.success(`${selectedOrders.length} orders updated to ${newStatus}`)
        // Update local state
        setOrders(orders.map(o => 
          selectedOrders.includes(o.orderId) ? { ...o, status: newStatus } : o
        ))
        setSelectedOrders([])
        fetchAnalytics(dateRange.startDate, dateRange.endDate)
      }
    } catch (error: any) {
      console.error('Error bulk updating orders:', error)
      toast.error(error.response?.data?.error || 'Failed to update orders')
    } finally {
      setUpdateLoading(null)
    }
  }

  const exportCurrentOrderPDF = () => {
    if (!selectedOrder) {
      toast.error('No order selected')
      return
    }
    try {
      exportOrderPDF(selectedOrder)
      toast.success('Order PDF downloaded')
    } catch (err: any) {
      console.error('PDF export error:', err)
      toast.error('Failed to generate PDF')
    }
  }

  const exportToCSV = async (exportType: 'selected' | 'filtered' | 'all' | 'current') => {
    try {
      const ordersToExport =
        exportType === 'current' ? (selectedOrder ? [selectedOrder.orderId] : []) :
        exportType === 'selected' ? selectedOrders :
        exportType === 'filtered' ? filteredOrders.map(o => o.orderId) :
        orders.map(o => o.orderId)

      if (ordersToExport.length === 0) {
        toast.error('No orders to export')
        return
      }

      const response = await axios.post('/api/admin-ext/orders/export', {
        orderIds: ordersToExport,
        format: 'csv'
      }, {
        responseType: 'blob'
      })

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      const baseName = exportType === 'current' && selectedOrder
        ? `order-${selectedOrder.orderId}`
        : `orders-export-${new Date().toISOString().split('T')[0]}`
      link.href = url
      link.setAttribute('download', `${baseName}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      const successMsg = exportType === 'current'
        ? 'Order exported successfully'
        : `${ordersToExport.length} orders exported successfully`
      toast.success(successMsg)
      if (exportType === 'selected') setSelectedOrders([])
    } catch (error: any) {
      console.error('Error exporting orders:', error)
      toast.error(error.response?.data?.error || 'Failed to export orders')
    }
  }

  const handleBulkAction = (action: string) => {
    if (selectedOrders.length === 0 && action !== 'export-all' && action !== 'export-filtered') {
      toast.error('Please select orders first')
      return
    }
    
    switch (action) {
      case 'export-selected':
        exportToCSV('selected')
        break
      case 'export-filtered':
        exportToCSV('filtered')
        break
      case 'export-all':
        exportToCSV('all')
        break
      case 'mark-processing':
        handleBulkStatusUpdate('processing')
        break
      case 'mark-shipped':
        handleBulkStatusUpdate('shipped')
        break
      case 'mark-delivered':
        handleBulkStatusUpdate('delivered')
        break
      case 'mark-cancelled':
        if (confirm(`Are you sure you want to cancel ${selectedOrders.length} orders?`)) {
          handleBulkStatusUpdate('cancelled')
        }
        break
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: any = {
      pending_payment: { bg: 'bg-orange-100', text: 'text-orange-700', icon: CurrencyDollarIcon },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: ClockIcon },
      processing: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircleIcon },
      shipped: { bg: 'bg-purple-100', text: 'text-purple-700', icon: TruckIcon },
      delivered: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircleIcon },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircleIcon }
    }
    return badges[status] || badges.pending
  }

  const getPaymentStatusBadge = (status: string) => {
    const badges: any = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
      paid: { bg: 'bg-green-100', text: 'text-green-700' },
      completed: { bg: 'bg-green-100', text: 'text-green-700' },
      refunded: { bg: 'bg-red-100', text: 'text-red-700' },
      failed: { bg: 'bg-red-100', text: 'text-red-700' }
    }
    return badges[status] || badges.pending
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-blue-600 font-medium">Total Orders</p>
              <p className="text-2xl font-bold text-blue-900 truncate">
                {analyticsLoading ? '...' : (analytics.totalOrders || 0).toLocaleString()}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {analytics.orderGrowth >= 0 ? '+' : ''}{analytics.orderGrowth || 0}% from last period
              </p>
            </div>
            <ShoppingCartIcon className="h-10 w-10 text-blue-500 flex-shrink-0" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-green-600 font-medium">Total Revenue</p>
              <p className="text-2xl font-bold text-green-900 truncate">
                {analyticsLoading ? '...' : formatPrice(analytics.totalRevenue || 0)}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {analytics.revenueGrowth >= 0 ? '+' : ''}{analytics.revenueGrowth || 0}% revenue growth
              </p>
            </div>
            <CurrencyDollarIcon className="h-10 w-10 text-green-500 flex-shrink-0" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-yellow-50 to-yellow-100 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-yellow-600 font-medium">Avg Order Value</p>
              <p className="text-2xl font-bold text-yellow-900 truncate">
                {analyticsLoading ? '...' : formatPrice(
                  analytics.averageOrderValue && analytics.averageOrderValue < 1000000
                    ? analytics.averageOrderValue
                    : (analytics.totalRevenue && analytics.totalOrders
                        ? analytics.totalRevenue / analytics.totalOrders
                        : 0)
                )}
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                {analytics.pendingOrders || 0} pending orders
              </p>
            </div>
            <CurrencyDollarIcon className="h-10 w-10 text-yellow-500 flex-shrink-0" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-purple-100 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-purple-600 font-medium">Delivered Orders</p>
              <p className="text-2xl font-bold text-purple-900 truncate">
                {analyticsLoading ? '...' : (analytics.deliveredOrders || 0).toLocaleString()}
              </p>
              <p className="text-xs text-purple-600 mt-1">
                {analytics.shippedOrders || 0} currently shipping
              </p>
            </div>
            <CheckCircleIcon className="h-10 w-10 text-purple-500 flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="card">
        <div className="flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orders..."
                className="input-field pl-10"
              />
            </div>
            
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={filterSellerId}
              onChange={(e) => setFilterSellerId(e.target.value)}
              className="input-field w-auto max-w-xs"
            >
              <option value="all">All Sellers</option>
              {sellerOrderOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <button 
                onClick={() => setShowDateFilter(!showDateFilter)}
                className="btn-outline flex items-center gap-2"
              >
                <CalendarIcon className="h-4 w-4" />
                Date Filter
                <ChevronUpDownIcon className="h-4 w-4" />
              </button>
              
              {showDateFilter && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border p-4 z-20 min-w-[300px]">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                      <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => {
                          setDateRange({ startDate: '', endDate: '' })
                          setShowDateFilter(false)
                        }}
                        className="flex-1 btn-outline text-sm py-2"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => setShowDateFilter(false)}
                        className="flex-1 btn-primary text-sm py-2"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="relative group">
              <button className="btn-outline flex items-center gap-2">
                <ArrowDownTrayIcon className="h-4 w-4" />
                Export
                <ChevronUpDownIcon className="h-4 w-4" />
              </button>
              
              <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border py-2 z-20 min-w-[160px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <button
                  onClick={() => handleBulkAction('export-all')}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export All Orders
                </button>
                <button
                  onClick={() => handleBulkAction('export-filtered')}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export Filtered
                </button>
                {selectedOrders.length > 0 && (
                  <button
                    onClick={() => handleBulkAction('export-selected')}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Export Selected ({selectedOrders.length})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedOrders.length > 0 && (
          <div className="mt-4 p-3 bg-primary-50 rounded-lg flex justify-between items-center">
            <span className="text-sm text-primary-700">
              {selectedOrders.length} order(s) selected
            </span>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleBulkAction('export-selected')}
                className="text-sm text-blue-600 hover:text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 disabled:opacity-50"
                disabled={updateLoading === 'bulk'}
              >
                {updateLoading === 'bulk' ? 'Exporting...' : 'Export'}
              </button>
              <button
                onClick={() => handleBulkAction('mark-processing')}
                className="text-sm text-blue-600 hover:text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 disabled:opacity-50"
                disabled={updateLoading === 'bulk'}
              >
                {updateLoading === 'bulk' ? 'Updating...' : 'Mark Processing'}
              </button>
              <button
                onClick={() => handleBulkAction('mark-shipped')}
                className="text-sm text-purple-600 hover:text-purple-700 px-2 py-1 rounded border border-purple-200 hover:bg-purple-50 disabled:opacity-50"
                disabled={updateLoading === 'bulk'}
              >
                {updateLoading === 'bulk' ? 'Updating...' : 'Mark Shipped'}
              </button>
              <button
                onClick={() => handleBulkAction('mark-delivered')}
                className="text-sm text-green-600 hover:text-green-700 px-2 py-1 rounded border border-green-200 hover:bg-green-50 disabled:opacity-50"
                disabled={updateLoading === 'bulk'}
              >
                {updateLoading === 'bulk' ? 'Updating...' : 'Mark Delivered'}
              </button>
              <button
                onClick={() => handleBulkAction('mark-cancelled')}
                className="text-sm text-red-600 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-50"
                disabled={updateLoading === 'bulk'}
              >
                {updateLoading === 'bulk' ? 'Updating...' : 'Cancel Orders'}
              </button>
              <button
                onClick={() => setBulkOpen(true)}
                className="text-sm text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded border border-red-600 flex items-center gap-1 disabled:opacity-50"
                disabled={deleting}
              >
                <TrashIcon className="h-4 w-4" /> Delete selected
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrders.includes(o.orderId))}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buyer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seller</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedOrders.map((order) => {
                const statusStyle = getStatusBadge(order.status)
                const paymentStyle = getPaymentStatusBadge(order.paymentStatus)
                const StatusIcon = statusStyle.icon
                
                return (
                  <tr key={order.orderId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.orderId)}
                        onChange={() => handleSelectOrder(order.orderId)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{order.orderId}</div>
                      <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${paymentStyle.bg} ${paymentStyle.text}`}>
                        {order.paymentStatus}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {order.productImage ? (
                          <img
                            src={order.productImage}
                            alt={order.productTitle}
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center">
                            <ShoppingCartIcon className="h-5 w-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 line-clamp-1">{order.productTitle}</p>
                          {order.trackingNumber && (
                            <p className="text-xs text-gray-500">Tracking: {order.trackingNumber}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">{order.buyerName || 'N/A'}</p>
                        <p className="text-gray-600">{order.buyerEmail || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {order.sellerId ? (
                        <Link
                          to={`/admin/sellers/${order.sellerId}`}
                          className="text-sm font-medium text-indigo-600 hover:underline"
                        >
                          {order.sellerName || order.sellerId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          order.type === 'auction_win'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {order.type === 'auction_win' ? 'Auction' : 'Buy Now'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">{formatPrice(order.totalAmount || 0)}</p>
                        <p className="text-xs text-gray-500">Qty: {order.quantity || 1}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        <StatusIcon className="h-3 w-3" />
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                        </div>
                        {order.estimatedDelivery && (
                          <p className="text-xs mt-1">Est: {new Date(order.estimatedDelivery).toLocaleDateString()}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewOrder(order)}
                          className="p-1 text-gray-600 hover:text-primary-600"
                          title="View Details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleUpdateStatus(order.orderId, 'processing')}
                            className="p-1 text-gray-600 hover:text-blue-600"
                            title="Mark Processing"
                            disabled={updateLoading === order.orderId}
                          >
                            {updateLoading === order.orderId ? (
                              <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <CheckCircleIcon className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        {order.status === 'shipped' && (
                          <button
                            onClick={() => handleUpdateStatus(order.orderId, 'delivered')}
                            className="p-1 text-gray-600 hover:text-green-600"
                            title="Mark Delivered"
                            disabled={updateLoading === order.orderId}
                          >
                            {updateLoading === order.orderId ? (
                              <div className="h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <CheckCircleIcon className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setRowToDelete(order.orderId)}
                          className="p-1 text-gray-600 hover:text-red-600"
                          title="Delete Order"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filteredOrders.length === 0 && (
            <div className="text-center py-12">
              <ShoppingCartIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || filterStatus !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No orders have been placed yet'}
              </p>
            </div>
          )}
        </div>
        
        {/* Pagination */}
        <PaginationBar
          total={totalItems}
          start={startIndex}
          end={endIndex}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          label="order"
        />
      </div>

      {/* Order Details Modal */}
      {showOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4">Order Details - {selectedOrder.orderId}</h3>
            
            <div className="space-y-6">
              {/* Product Info */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Product Information</h4>
                <div className="flex items-center gap-4">
                  {selectedOrder.productImage ? (
                    <img
                      src={selectedOrder.productImage}
                      alt={selectedOrder.productTitle}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-gray-200 flex items-center justify-center">
                      <ShoppingCartIcon className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{selectedOrder.productTitle}</p>
                    <p className="text-2xl font-bold text-primary-600">{formatPrice(selectedOrder.totalAmount || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Buyer Information</h4>
                  <div className="space-y-2">
                    <p><span className="text-gray-600">Name:</span> {selectedOrder.buyerName || 'N/A'}</p>
                    <p><span className="text-gray-600">Email:</span> {selectedOrder.buyerEmail || 'N/A'}</p>
                    <p><span className="text-gray-600">User ID:</span> {selectedOrder.buyerId || 'N/A'}</p>
                  </div>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Seller Information</h4>
                  <div className="space-y-2">
                    <p><span className="text-gray-600">Type:</span> Platform Direct Sale</p>
                    <p><span className="text-gray-600">Managed By:</span> Admin</p>
                    <p><span className="text-gray-600">Product ID:</span> {selectedOrder.productId}</p>
                  </div>
                </div>
              </div>

              {/* Order Status & Payment */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Order Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Current Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedOrder.status).bg} ${getStatusBadge(selectedOrder.status).text}`}>
                        {selectedOrder.status}
                      </span>
                    </div>
                    <p><span className="text-gray-600">Order Date:</span> {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleDateString() : 'N/A'}</p>
                    {selectedOrder.estimatedDelivery && (
                      <p><span className="text-gray-600">Expected Delivery:</span> {new Date(selectedOrder.estimatedDelivery).toLocaleDateString()}</p>
                    )}
                    {selectedOrder.trackingNumber && (
                      <p><span className="text-gray-600">Tracking:</span> {selectedOrder.trackingNumber}</p>
                    )}
                  </div>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Payment Details</h4>
                  <div className="space-y-2">
                    <p><span className="text-gray-600">Order Amount:</span> {formatPrice(selectedOrder.totalAmount || 0)}</p>
                    <p><span className="text-gray-600">Quantity:</span> {selectedOrder.quantity || 1}</p>
                    <p><span className="text-gray-600">Payment Method:</span> {selectedOrder.paymentMethod || 'N/A'}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Payment Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPaymentStatusBadge(selectedOrder.paymentStatus).bg} ${getPaymentStatusBadge(selectedOrder.paymentStatus).text}`}>
                        {selectedOrder.paymentStatus}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shipping Information */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Shipping Information</h4>
                {(() => {
                  // Canonical source: shippingInfo (set by Checkout.tsx). Fall back to legacy
                  // shippingAddress block (older orders) which used different field names.
                  const ship: any = (selectedOrder as any).shippingInfo || selectedOrder.shippingAddress
                  if (!ship || (!ship.fullName && !ship.address && !ship.addressLine1)) {
                    return <p className="text-gray-500">No shipping address provided</p>
                  }
                  const fullName = ship.fullName
                  const line1 = ship.address || ship.addressLine1
                  const line2 = ship.addressLine2
                  const city = ship.city
                  const region = ship.province || ship.state
                  const postcode = ship.postalCode || ship.zipCode
                  const country = ship.country || 'South Africa'
                  const phone = ship.phone || ship.phoneNumber
                  const email = ship.email
                  return (
                    <div className="space-y-2">
                      <p className="text-gray-700">
                        {fullName && <>{fullName}<br /></>}
                        {line1 && <>{line1}<br /></>}
                        {line2 && <>{line2}<br /></>}
                        {(city || region || postcode) && <>{[city, region, postcode].filter(Boolean).join(', ')}<br /></>}
                        {country}
                      </p>
                      {phone && <p className="text-sm text-gray-600">Phone: {phone}</p>}
                      {email && <p className="text-sm text-gray-600">Email: {email}</p>}
                    </div>
                  )
                })()}
              </div>

              {/* Admin Notes & Comments */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <DocumentTextIcon className="h-4 w-4" />
                  Admin Notes
                </h4>
                
                {/* Existing notes display */}
                {selectedOrder.adminNotes && (
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <UserIcon className="h-3 w-3" />
                      Admin • {selectedOrder.updatedAt ? new Date(selectedOrder.updatedAt).toLocaleString() : 'Previous'}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedOrder.adminNotes}</p>
                  </div>
                )}
                
                {/* Customer notes if any */}
                {selectedOrder.customerNotes && (
                  <div className="mb-3 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 text-xs text-blue-600 mb-1">
                      <UserIcon className="h-3 w-3" />
                      Customer Note
                    </div>
                    <p className="text-sm text-blue-700 whitespace-pre-wrap">{selectedOrder.customerNotes}</p>
                  </div>
                )}
                
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Add internal notes about this order..."
                />
                
                <div className="flex gap-2 mt-3">
                  {adminNotes && (
                    <>
                      <button
                        onClick={() => setAdminNotes('')}
                        className="btn-outline text-sm py-2 px-3"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => handleAddNotes(selectedOrder.orderId)}
                        className="btn-primary text-sm py-2 px-3"
                        disabled={updateLoading === selectedOrder.orderId}
                      >
                        {updateLoading === selectedOrder.orderId ? 'Saving...' : 'Save Notes'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Update Status */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Update Order Status</h4>
                <div className="flex gap-2 flex-wrap">
                  {selectedOrder.status === 'pending' && (
                    <button
                      onClick={() => {
                        handleUpdateStatus(selectedOrder.orderId, 'processing')
                        setShowOrderModal(false)
                      }}
                      className="btn-primary"
                      disabled={updateLoading === selectedOrder.orderId}
                    >
                      {updateLoading === selectedOrder.orderId ? 'Updating...' : 'Mark as Processing'}
                    </button>
                  )}
                  {selectedOrder.status === 'processing' && (
                    <>
                      <button
                        onClick={() => {
                          setShowTrackingModal(true)
                          setShowOrderModal(false)
                        }}
                        className="btn-outline flex items-center gap-2"
                        disabled={updateLoading === selectedOrder.orderId}
                      >
                        <TruckIcon className="h-4 w-4" />
                        Add Tracking
                      </button>
                      <button
                        onClick={() => {
                          handleUpdateStatus(selectedOrder.orderId, 'shipped')
                          setShowOrderModal(false)
                        }}
                        className="btn-primary"
                        disabled={updateLoading === selectedOrder.orderId}
                      >
                        {updateLoading === selectedOrder.orderId ? 'Updating...' : 'Mark as Shipped'}
                      </button>
                    </>
                  )}
                  {selectedOrder.status === 'shipped' && (
                    <button
                      onClick={() => {
                        handleUpdateStatus(selectedOrder.orderId, 'delivered')
                        setShowOrderModal(false)
                      }}
                      className="btn-primary"
                      disabled={updateLoading === selectedOrder.orderId}
                    >
                      {updateLoading === selectedOrder.orderId ? 'Updating...' : 'Mark as Delivered'}
                    </button>
                  )}
                  {(selectedOrder.status === 'pending' || selectedOrder.status === 'processing') && (
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to cancel order ${selectedOrder.orderId}? This action cannot be undone.`)) {
                          handleUpdateStatus(selectedOrder.orderId, 'cancelled')
                          setShowOrderModal(false)
                        }
                      }}
                      className="btn-outline text-red-600 border-red-600 hover:bg-red-50"
                      disabled={updateLoading === selectedOrder.orderId}
                    >
                      {updateLoading === selectedOrder.orderId ? 'Cancelling...' : 'Cancel Order'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowOrderModal(false)
                  setAdminNotes('')
                }}
                className="btn-outline flex-1"
              >
                Close
              </button>
              <button
                onClick={() => exportCurrentOrderPDF()}
                className="btn-primary flex items-center gap-2"
                disabled={!selectedOrder}
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Export Order
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Tracking Modal */}
      {showTrackingModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add Tracking Information</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tracking Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Enter tracking number"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipping Carrier
                </label>
                <select
                  value={shippingCarrier}
                  onChange={(e) => setShippingCarrier(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="Standard Shipping">Standard Shipping</option>
                  <option value="DHL">DHL</option>
                  <option value="FedEx">FedEx</option>
                  <option value="UPS">UPS</option>
                  <option value="PostNet">PostNet</option>
                  <option value="Aramex">Aramex</option>
                  <option value="Courier Guy">The Courier Guy</option>
                  <option value="Dawn Wing">Dawn Wing</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowTrackingModal(false)
                  setTrackingNumber('')
                  setShippingCarrier('SAPO')
                }}
                className="btn-outline flex-1"
                disabled={updateLoading === selectedOrder.orderId}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddTracking(selectedOrder.orderId)}
                className="btn-primary flex-1"
                disabled={!trackingNumber || updateLoading === selectedOrder.orderId}
              >
                {updateLoading === selectedOrder.orderId ? 'Adding...' : 'Add Tracking'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Single delete confirmation */}
      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete order?"
        message={<>This permanently deletes order <span className="font-medium">{rowToDelete}</span>. This action cannot be undone.</>}
        loading={deleting}
        onConfirm={() => rowToDelete && doDelete([rowToDelete])}
        onCancel={() => setRowToDelete(null)}
      />

      {/* Bulk delete confirmation */}
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${selectedOrders.length} order(s)?`}
        message="This permanently deletes the selected orders. This action cannot be undone."
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(selectedOrders)}
        onCancel={() => setBulkOpen(false)}
      />

    </motion.div>
  )
}

export default AdminOrders
