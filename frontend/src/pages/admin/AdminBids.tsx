import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import axios from '../../config/axios'
import {
  ChartBarIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  TagIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { formatPrice } from '../../utils/formatters'
import {
  getProductBids,
  acceptBid,
  type BidDetail,
  type ProductWithBids
} from '../../services/adminBidService'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import { usePagination } from '../../hooks/usePagination'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import PaginationBar from '../../components/admin/PaginationBar'
import { adminBulkDelete } from '../../services/adminDelete'

const AdminBids = () => {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('default')

  // Bids modal state
  const [showBidsModal, setShowBidsModal] = useState(false)
  const [selectedProductBids, setSelectedProductBids] = useState<ProductWithBids | null>(null)
  const [bidsLoading, setBidsLoading] = useState(false)

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [selectedBid, setSelectedBid] = useState<BidDetail | null>(null)
  const [accepting, setAccepting] = useState(false)

  // Delete state — deleting a row here deletes the product (and cascades its bids).
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('products', ids)
      setProducts(prev => prev.filter((p: any) => !ids.includes(p.id)))
      if (res.failed?.length) toast.error(`${res.failed.length} could not be deleted: ${res.failed[0].reason}`)
      else toast.success(`Deleted ${res.deleted} product${res.deleted > 1 ? 's' : ''}`)
      sel.clear(); setRowToDelete(null); setBulkOpen(false)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally { setDeleting(false) }
  }

  useEffect(() => {
    if (user?.role !== 'admin') return
    loadProducts()
  }, [user])

  // Auto-open bids modal if product query param is present
  useEffect(() => {
    const productId = searchParams.get('product')
    if (productId && products.length > 0) {
      openBidsModal(productId)
    }
  }, [searchParams, products])

  const loadProducts = async () => {
    setLoading(true)
    try {
      const response = await axios.get('/api/admin/products-with-bids', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.data.success) {
        setProducts(response.data.data || [])
      }
    } catch (error) {
      console.error('Error loading products:', error)
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const openBidsModal = async (productId: string) => {
    setBidsLoading(true)
    setShowBidsModal(true)
    try {
      const response = await getProductBids(productId)
      if (response.success) {
        setSelectedProductBids(response.data)
      }
    } catch (error: any) {
      console.error('Error loading bids:', error)
      toast.error(error.error || 'Failed to load bids')
      setShowBidsModal(false)
    } finally {
      setBidsLoading(false)
    }
  }

  const handleAcceptClick = (bid: BidDetail) => {
    setSelectedBid(bid)
    setShowConfirmDialog(true)
  }

  const handleConfirmAccept = async () => {
    if (!selectedBid) return

    setAccepting(true)
    try {
      const response = await acceptBid(selectedBid.id)
      if (response.success) {
        toast.success(response.message || `Bid accepted! Order created for ${selectedBid.userName}`)
        setShowConfirmDialog(false)
        setSelectedBid(null)
        setShowBidsModal(false)
        setSelectedProductBids(null)
        loadProducts()
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to accept bid')
    } finally {
      setAccepting(false)
    }
  }

  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    const d = date._seconds ? new Date(date._seconds * 1000) : new Date(date)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
  }

  const getBidStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Active</span>
      case 'outbid':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Outbid</span>
      case 'won':
        return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">Won</span>
      case 'lost':
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">Lost</span>
      case 'cancelled':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Cancelled</span>
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{status}</span>
    }
  }

  const getProductStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'sold': return 'bg-blue-100 text-blue-800'
      case 'ended': return 'bg-gray-100 text-gray-800'
      default: return 'bg-yellow-100 text-yellow-800'
    }
  }

  // Filter + sort
  const filteredProducts = products
    .filter(p => {
      const matchesSearch = !searchTerm || p.title?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = filterStatus === 'all' || p.status === filterStatus
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest': {
          const aTime = a.endDate?._seconds || (a.endDate ? new Date(a.endDate).getTime() / 1000 : 0)
          const bTime = b.endDate?._seconds || (b.endDate ? new Date(b.endDate).getTime() / 1000 : 0)
          return bTime - aTime
        }
        case 'oldest': {
          const aTime = a.endDate?._seconds || (a.endDate ? new Date(a.endDate).getTime() / 1000 : 0)
          const bTime = b.endDate?._seconds || (b.endDate ? new Date(b.endDate).getTime() / 1000 : 0)
          return aTime - bTime
        }
        case 'bids_desc':
          return (b.totalBids || 0) - (a.totalBids || 0)
        case 'bids_asc':
          return (a.totalBids || 0) - (b.totalBids || 0)
        case 'price_desc':
          return (Number(b.highestBid || b.currentPrice) || 0) - (Number(a.highestBid || a.currentPrice) || 0)
        case 'price_asc':
          return (Number(a.highestBid || a.currentPrice) || 0) - (Number(b.highestBid || b.currentPrice) || 0)
        case 'ending_soon': {
          const aEnd = a.endDate?._seconds || a.endDate ? new Date(a.endDate._seconds ? a.endDate._seconds * 1000 : a.endDate).getTime() : Infinity
          const bEnd = b.endDate?._seconds || b.endDate ? new Date(b.endDate._seconds ? b.endDate._seconds * 1000 : b.endDate).getTime() : Infinity
          return aEnd - bEnd
        }
        default:
          // default: active first, then by totalBids desc
          if (a.status === 'active' && b.status !== 'active') return -1
          if (b.status === 'active' && a.status !== 'active') return 1
          return (b.totalBids || 0) - (a.totalBids || 0)
      }
    })

  const { paginatedItems, currentPage, totalPages, totalItems, startIndex, endIndex, setCurrentPage } = usePagination({
    data: filteredProducts,
    itemsPerPage: 20,
    resetPageOn: [searchTerm, filterStatus, sortBy]
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
          <h1 className="text-2xl font-bold text-gray-900">Manage Bids</h1>
          <p className="text-gray-600">Accept and review bids on auction products</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ChartBarIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{filteredProducts.length}</p>
              <p className="text-sm text-gray-500">Products with Bids</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {filteredProducts.filter(p => p.status === 'active').length}
              </p>
              <p className="text-sm text-gray-500">Active Auctions</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ClockIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {filteredProducts.filter(p => p.status === 'ended').length}
              </p>
              <p className="text-sm text-gray-500">Ended (Awaiting)</p>
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
              placeholder="Search products by title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="sold">Sold</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="default">Sort: Default</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="bids_desc">Most Bids</option>
            <option value="bids_asc">Least Bids</option>
            <option value="price_desc">Highest Price</option>
            <option value="price_asc">Lowest Price</option>
            <option value="ending_soon">Ending Soon</option>
          </select>
        </div>
      </div>

      <BulkDeleteBar count={sel.selected.length} label="product" onClear={sel.clear} onDelete={() => setBulkOpen(true)} />

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <ChartBarIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No products with bids found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={sel.allSelected(paginatedItems.map((p: any) => p.id))}
                      onChange={() => sel.toggleAll(paginatedItems.map((p: any) => p.id))}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Bids</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedItems.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={sel.isSelected(product.id)}
                        onChange={() => sel.toggle(product.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          {product.images?.[0] ? (
                            <img
                              className="h-10 w-10 rounded-lg object-cover"
                              src={product.images[0]}
                              alt={product.title}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center">
                              <TagIcon className="h-5 w-5 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-900">{product.title}</p>
                          <p className="text-xs text-gray-500">{product.sellerName || 'Unknown Seller'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatPrice(product.currentPrice || product.startingPrice)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {product.totalBids || product.bidsCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getProductStatusColor(product.status)}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(product.endDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openBidsModal(product.id)}
                          className="text-primary-600 hover:text-primary-800 font-medium text-sm flex items-center gap-1"
                        >
                          <EyeIcon className="h-4 w-4" />
                          View Bids
                        </button>
                        <button
                          onClick={() => setRowToDelete(product.id)}
                          title="Delete product"
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
            <div className="px-4 pb-4">
              <PaginationBar
                total={totalItems}
                start={startIndex}
                end={endIndex}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                label="product"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bids Modal */}
      {showBidsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedProductBids ? `Bids for "${selectedProductBids.product.title}"` : 'Loading...'}
                </h2>
                {selectedProductBids && (
                  <p className="text-sm text-gray-500 mt-1">
                    Status: {selectedProductBids.product.status} | Current Price: {formatPrice(selectedProductBids.product.currentPrice || selectedProductBids.product.startingPrice)}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowBidsModal(false)
                  setSelectedProductBids(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {bidsLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
              ) : selectedProductBids?.bids.length === 0 ? (
                <div className="text-center py-12">
                  <ChartBarIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No bids for this product</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bidder</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedProductBids?.bids.map((bid, index) => (
                        <tr
                          key={bid.id}
                          className={`hover:bg-gray-50 ${index === 0 && (bid.status === 'active' || bid.status === 'outbid') ? 'bg-green-50' : ''}`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{bid.userName}</p>
                              <p className="text-xs text-gray-500">{bid.bidderEmail}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className={`text-sm font-semibold ${index === 0 ? 'text-green-700' : 'text-gray-900'}`}>
                              {formatPrice(bid.amount)}
                            </p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getBidStatusBadge(bid.status)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(bid.createdAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {(bid.status === 'active' || bid.status === 'outbid') &&
                             (selectedProductBids?.product.status === 'active' || selectedProductBids?.product.status === 'ended') && (
                              <button
                                onClick={() => handleAcceptClick(bid)}
                                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium flex items-center gap-1"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                                Accept Bid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && selectedBid && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full"
          >
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-yellow-100 rounded-full">
              <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600" />
            </div>

            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              Accept Bid
            </h3>

            <p className="text-sm text-gray-600 text-center mb-6">
              Accept bid of <span className="font-bold text-gray-900">{formatPrice(selectedBid.amount)}</span> from{' '}
              <span className="font-bold text-gray-900">{selectedBid.userName}</span>?
              This will end the auction immediately and create an order. This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmDialog(false)
                  setSelectedBid(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={accepting}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAccept}
                disabled={accepting}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {accepting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Accepting...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-5 w-5" />
                    Confirm
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete confirmations — deleting a product also removes its bids */}
      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete product"
        message="This permanently deletes this product and all of its bids. This cannot be undone."
        loading={deleting}
        onCancel={() => setRowToDelete(null)}
        onConfirm={() => doDelete([rowToDelete!])}
      />
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} product${sel.selected.length > 1 ? 's' : ''}`}
        message="This permanently deletes the selected products and all of their bids. This cannot be undone."
        requireText="DELETE"
        loading={deleting}
        onCancel={() => setBulkOpen(false)}
        onConfirm={() => doDelete(sel.selected)}
      />
    </motion.div>
  )
}

export default AdminBids
