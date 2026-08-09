import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import axios from '../../config/axios'
import { useAuthStore } from '../../store/authStore'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusCircleIcon,
  EyeIcon,
  ClockIcon,
  TagIcon,
  ExclamationTriangleIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { formatPrice } from '../../utils/formatters'
import toast from 'react-hot-toast'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import { usePagination } from '../../hooks/usePagination'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import PaginationBar from '../../components/admin/PaginationBar'
import { adminBulkDelete } from '../../services/adminDelete'

const AdminProducts = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSellerId, setFilterSellerId] = useState('all')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState<any>(null)
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState('')
  const [deletingAll, setDeletingAll] = useState(false)
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('products', ids)
      setProducts(prev => prev.filter((p: any) => !ids.includes(p.id)))
      res.failed?.length
        ? toast.error(`${res.failed.length} failed: ${res.failed[0].reason}`)
        : toast.success(`Deleted ${res.deleted}`)
      sel.clear()
      setBulkOpen(false)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error('Admin access required')
      navigate('/')
      return
    }
    fetchProducts()
  }, [user])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/products/my-products')
      if (response.data.success) {
        setProducts(response.data.data)
      }
    } catch (error: any) {
      console.error('Error fetching products:', error)
      if (error.response?.status === 403) {
        toast.error('Admin access required')
        navigate('/')
      } else {
        toast.error('Failed to fetch products')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (productId: string) => {
    navigate(`/admin/products/edit/${productId}`)
  }

  const handleDelete = async () => {
    if (!deletingProduct) return

    try {
      const response = await axios.delete(`/api/products/${deletingProduct.id}`)
      if (response.data.success) {
        toast.success('Product deleted successfully')
        setProducts(products.filter(p => p.id !== deletingProduct.id))
        setShowDeleteModal(false)
        setDeletingProduct(null)
      }
    } catch (error: any) {
      console.error('Error deleting product:', error)
      toast.error(error.response?.data?.error || 'Failed to delete product')
    }
  }


  const handleDeleteAll = async () => {
    if (deleteAllConfirmation !== 'DELETE ALL') {
      toast.error('Please type "DELETE ALL" to confirm')
      return
    }

    try {
      setDeletingAll(true)
      const response = await axios.delete('/api/products/all/delete-all-products', {
        data: { confirmation: 'DELETE_ALL_PRODUCTS' }
      })

      if (response.data.success) {
        toast.success('All products deleted')
        setProducts([])
        setShowDeleteAllModal(false)
        setDeleteAllConfirmation('')
      }
    } catch (error: any) {
      console.error('Error deleting all products:', error)
      toast.error(error.response?.data?.error || 'Failed to delete all products')
    } finally {
      setDeletingAll(false)
    }
  }

  const confirmDelete = (product: any) => {
    setDeletingProduct(product)
    setShowDeleteModal(true)
  }

  const handleStatusChange = async (productId: string, newStatus: string) => {
    try {
      const response = await axios.put(`/api/products/${productId}`, { status: newStatus })
      if (response.data.success) {
        toast.success('Product status updated')
        setProducts(products.map(p => 
          p.id === productId ? { ...p, status: newStatus } : p
        ))
      }
    } catch (error) {
      console.error('Error updating product:', error)
      toast.error('Failed to update product status')
    }
  }

  // Distinct seller options for the filter dropdown (derived from loaded products)
  const sellerOptions = Array.from(
    products.reduce((map: Map<string, string>, p: any) => {
      if (p.sellerId) {
        map.set(p.sellerId, p.sellerName || p.sellerId.slice(0, 8))
      }
      return map
    }, new Map<string, string>())
  ).sort(([, a], [, b]) => a.localeCompare(b))

  // Filter products based on search, status, and seller
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          product.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          product.sellerName?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = filterStatus === 'all' || product.status === filterStatus
    const matchesSeller = filterSellerId === 'all' || product.sellerId === filterSellerId
    return matchesSearch && matchesStatus && matchesSeller
  })

  const { paginatedItems, currentPage, totalPages, totalItems, startIndex, endIndex, setCurrentPage } = usePagination({
    data: filteredProducts,
    itemsPerPage: 20,
    resetPageOn: [searchQuery, filterStatus, filterSellerId]
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'sold':
        return 'bg-blue-100 text-blue-800'
      case 'ended':
        return 'bg-gray-100 text-gray-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  const stats = {
    total: products.length,
    active: products.filter(p => p.status === 'active').length,
    sold: products.filter(p => p.status === 'sold').length,
    ended: products.filter(p => p.status === 'ended').length
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Management</h1>
          <p className="text-gray-600 mt-1">Manage your products and listings</p>
        </div>
        <div className="flex gap-3">
          {products.length > 0 && (
            <button
              onClick={() => setShowDeleteAllModal(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center"
            >
              <TrashIcon className="h-5 w-5 mr-2" />
              Delete All
            </button>
          )}
          <Link
            to="/admin/products/create"
            className="btn-primary flex items-center"
          >
            <PlusCircleIcon className="h-5 w-5 mr-2" />
            Add Product
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Products</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <TagIcon className="h-8 w-8 text-gray-400" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </div>
            <CheckCircleIcon className="h-8 w-8 text-green-400" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sold</p>
              <p className="text-2xl font-bold text-blue-600">{stats.sold}</p>
            </div>
            <TagIcon className="h-8 w-8 text-blue-400" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ended</p>
              <p className="text-2xl font-bold text-gray-600">{stats.ended}</p>
            </div>
            <ClockIcon className="h-8 w-8 text-gray-400" />
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="sold">Sold</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={filterSellerId}
            onChange={(e) => setFilterSellerId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 md:max-w-xs"
          >
            <option value="all">All Sellers</option>
            {sellerOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <BulkDeleteBar
        count={sel.selected.length}
        label="product"
        onClear={sel.clear}
        onDelete={() => setBulkOpen(true)}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={sel.allSelected(paginatedItems.map((p: any) => p.id))}
                    onChange={() => sel.toggleAll(paginatedItems.map((p: any) => p.id))}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Seller
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bids
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Views
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedItems.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={sel.isSelected(product.id)}
                      onChange={() => sel.toggle(product.id)}
                    />
                  </td>
                  <td className="px-6 py-4">
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
                      {/* min-w-0 lets the text truncate inside the flex row; the max-w bounds the
                          PRODUCT column so long titles don't push the ACTION column off-screen. */}
                      <div className="ml-4 min-w-0 max-w-xs sm:max-w-sm lg:max-w-md">
                        <div className="text-sm font-medium text-gray-900 truncate" title={product.title}>
                          {product.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                          {product.categoryId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {product.sellerId ? (
                      <Link
                        to={`/admin/sellers/${product.sellerId}`}
                        className="text-sm font-medium text-indigo-600 hover:underline"
                      >
                        {product.sellerName || product.sellerId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {product.listingType === 'sale' ? (
                      <>
                        <div className="text-sm text-gray-900">
                          {formatPrice(product.price || product.currentPrice)}
                        </div>
                        <div className="text-xs text-green-700 font-medium">For Sale</div>
                        <div className="text-xs text-gray-500">
                          {product.stockType === 'unlimited'
                            ? `Always available · Sold ${Number(product.soldQuantity || 0)}`
                            : `Stock: ${Math.max(0, Number(product.quantity || 0) - Number(product.soldQuantity || 0))}${product.quantity ? ` / ${product.quantity}` : ''}`}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-gray-900">
                          {formatPrice(product.currentPrice || product.startingPrice)}
                        </div>
                        {product.buyNowPrice && (
                          <div className="text-xs text-gray-500">
                            Buy Now: {formatPrice(product.buyNowPrice)}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(product.status)}`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {product.totalBids || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {product.views || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {(product.totalBids || product.bidsCount || 0) > 0 && (
                        <button
                          onClick={() => navigate(`/admin/bids?product=${product.id}`)}
                          className="text-primary-600 hover:text-primary-800"
                          title="View Bids"
                        >
                          <ChartBarIcon className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/products/${product.id}`)}
                        className="text-gray-600 hover:text-gray-900"
                        title="View"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleEdit(product.id)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                      {product.listingType === 'sale' && (
                        product.status === 'sold' ? (
                          <button
                            onClick={() => handleStatusChange(product.id, 'active')}
                            className="text-xs font-medium text-green-700 hover:text-green-900 whitespace-nowrap"
                            title="Mark back in stock"
                          >
                            In stock
                          </button>
                        ) : product.status === 'active' ? (
                          <button
                            onClick={() => handleStatusChange(product.id, 'sold')}
                            className="text-xs font-medium text-amber-700 hover:text-amber-900 whitespace-nowrap"
                            title="Mark out of stock"
                          >
                            Out of stock
                          </button>
                        ) : null
                      )}
                      <button
                        onClick={() => confirmDelete(product)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                        disabled={product.totalBids > 0 || product.status === 'sold'}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <TagIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No products</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || filterStatus !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Get started by creating a new product'}
              </p>
              {!searchQuery && filterStatus === 'all' && (
                <div className="mt-6">
                  <Link
                    to="/admin/products/create"
                    className="btn-primary inline-flex items-center"
                  >
                    <PlusCircleIcon className="h-5 w-5 mr-2" />
                    Add Product
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 pb-4">
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          >
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
              <XCircleIcon className="h-6 w-6 text-red-600" />
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              Delete Product
            </h3>
            
            <p className="text-sm text-gray-600 text-center mb-6">
              Are you sure you want to delete "{deletingProduct.title}"? This action cannot be undone.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeletingProduct(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          >
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
            </div>

            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              Delete All Products
            </h3>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-medium">
                WARNING: This will permanently delete ALL {products.length} products and their associated bids.
              </p>
            </div>

            <p className="text-sm text-gray-600 text-center mb-4">
              This action cannot be undone. To confirm, type <span className="font-bold">DELETE ALL</span> below:
            </p>

            <input
              type="text"
              value={deleteAllConfirmation}
              onChange={(e) => setDeleteAllConfirmation(e.target.value)}
              placeholder="Type DELETE ALL to confirm"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteAllModal(false)
                  setDeleteAllConfirmation('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={deletingAll}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deleteAllConfirmation !== 'DELETE ALL' || deletingAll}
                className={`flex-1 px-4 py-2 rounded-lg text-white ${
                  deleteAllConfirmation === 'DELETE ALL' && !deletingAll
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {deletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} product${sel.selected.length > 1 ? 's' : ''}`}
        message="This permanently deletes the selected products and their associated bids. This action cannot be undone."
        confirmLabel="Delete selected"
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />

    </div>
  )
}

export default AdminProducts