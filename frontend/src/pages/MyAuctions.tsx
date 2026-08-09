import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import axios from '../config/axios'
import {
  PlusCircleIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  ArrowRightIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ShoppingBagIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
import { formatPrice, getTimeRemaining } from '../utils/formatters'
import toast from 'react-hot-toast'

interface Product {
  id: string
  title: string
  description: string
  images: string[]
  currentPrice: number
  startingPrice: number
  buyNowPrice?: number
  listingType?: string
  stockType?: string
  quantity?: number
  soldQuantity?: number
  status: string
  endDate: any
  startDate: any
  categoryId: string
  category?: string
  totalBids: number
  views: number
  sellerId: string
  sellerName?: string
  createdAt: any
  updatedAt: any
  scheduledStartTime?: any
  isScheduled?: boolean
  durationDays?: number
}

const MyAuctions = () => {
  const { user } = useAuthStore()
  const [products, setProducts] = useState<Product[]>([])
  const [activeTab, setActiveTab] = useState('active')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (user) {
      loadMyAuctions()
      loadSellerStats()
    }
  }, [user, activeTab])

  const loadMyAuctions = async () => {
    setLoading(true)
    try {
      const endpoint = activeTab === 'all' 
        ? '/api/products/my-products' 
        : `/api/products/my-products?status=${activeTab}`
      
      const response = await axios.get(endpoint)
      if (response.data.success) {
        setProducts(response.data.data || [])
      }
    } catch (error) {
      console.error('Error loading auctions:', error)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const loadSellerStats = async () => {
    try {
      const response = await axios.get('/api/users/seller-dashboard')
      if (response.data.success) {
        setStats(response.data.data.stats)
      }
    } catch (error) {
      console.error('Error loading seller stats:', error)
    }
  }

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this auction?')) return
    
    try {
      const response = await axios.delete(`/api/products/${productId}`)
      if (response.data.success) {
        setProducts(prev => prev.filter(p => p.id !== productId))
        toast.success('Auction deleted successfully')
      }
    } catch (error) {
      console.error('Error deleting auction:', error)
      toast.error('Failed to delete auction')
    }
  }

  const handleEndAuction = async (productId: string) => {
    if (!confirm('Are you sure you want to end this auction early?')) return
    
    try {
      const response = await axios.put(`/api/products/${productId}/end`)
      if (response.data.success) {
        loadMyAuctions()
        toast.success('Auction ended successfully')
      }
    } catch (error) {
      console.error('Error ending auction:', error)
      toast.error('Failed to end auction')
    }
  }

  // Mark a fixed-price ("for sale") product out of stock ('sold') or back in stock ('active').
  const handleSetStock = async (productId: string, status: 'sold' | 'active') => {
    try {
      const response = await axios.put(`/api/products/${productId}`, { status })
      if (response.data.success) {
        loadMyAuctions()
        toast.success(status === 'sold' ? 'Marked out of stock' : 'Marked back in stock')
      }
    } catch (error) {
      console.error('Error updating stock status:', error)
      toast.error('Failed to update stock status')
    }
  }

  const handleCancelScheduled = async (productId: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled auction?')) return

    try {
      const response = await axios.delete(`/api/products/${productId}`)
      if (response.data.success) {
        setProducts(prev => prev.filter(p => p.id !== productId))
        toast.success('Scheduled auction cancelled')
      }
    } catch (error) {
      console.error('Error cancelling scheduled auction:', error)
      toast.error('Failed to cancel scheduled auction')
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      ended: 'bg-gray-100 text-gray-800',
      sold: 'bg-blue-100 text-blue-800',
      draft: 'bg-yellow-100 text-yellow-800',
      scheduled: 'bg-blue-100 text-blue-800'
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  const scheduledCount = products.filter(p => p.status === 'scheduled').length

  const tabs = [
    { id: 'all', label: 'All Listings', count: stats?.totalListings || 0 },
    { id: 'active', label: 'Active', count: stats?.activeListings || 0 },
    { id: 'scheduled', label: 'Scheduled', count: scheduledCount },
    { id: 'ended', label: 'Ended', count: stats?.endedAuctions || 0 },
    { id: 'sold', label: 'Sold', count: stats?.soldItems || 0 }
  ]

  const statsCards = [
    {
      title: 'Total Views',
      value: stats?.totalViews || 0,
      icon: EyeIcon,
      color: 'bg-blue-500'
    },
    {
      title: 'Total Bids',
      value: stats?.totalBids || 0,
      icon: ClockIcon,
      color: 'bg-green-500'
    },
    {
      title: 'Total Revenue',
      value: formatPrice(stats?.totalRevenue || 0),
      icon: CurrencyDollarIcon,
      color: 'bg-purple-500'
    },
    {
      title: 'Avg. Price',
      value: formatPrice(stats?.averagePrice || 0),
      icon: ChartBarIcon,
      color: 'bg-orange-500'
    }
  ]

  // Check if user has seller role or is admin
  const canSell = user?.role === 'admin' || (user?.role as any) === 'seller'

  if (!canSell) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center py-12"
      >
        <div className="card max-w-md mx-auto">
          <ShoppingBagIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Become a Seller
          </h2>
          <p className="text-gray-600 mb-4">
            You need seller privileges to list items for auction.
          </p>
          <Link to="/become-seller" className="btn-primary">
            Request Seller Access
          </Link>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-50 to-secondary-50 rounded-xl p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Auctions</h1>
            <p className="text-gray-600 mt-2">
              Manage your listings and track auction performance
            </p>
          </div>
          <Link to="/create-auction" className="btn-primary">
            <PlusCircleIcon className="h-5 w-5 mr-2" />
            Create New Auction
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg bg-opacity-10`}>
                <stat.icon className={`h-6 w-6 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Auctions List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : products.length > 0 ? (
        <div className="space-y-4">
          {products.map((product) => {
            const endDate = product.endDate?._seconds
              ? new Date(product.endDate._seconds * 1000)
              : new Date(product.endDate || new Date())
            const timeRemaining = product.status === 'active' ? getTimeRemaining(endDate.toISOString()) : null
            const scheduledTime = product.scheduledStartTime
              ? new Date(product.scheduledStartTime?._seconds ? product.scheduledStartTime._seconds * 1000 : product.scheduledStartTime)
              : null

            return (
              <div key={product.id} className="card hover:shadow-lg transition-shadow">
                <div className="flex items-start space-x-4">
                  <img
                    src={product.images?.[0] || 'https://via.placeholder.com/100'}
                    alt={product.title}
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <Link
                          to={`/products/${product.id}`}
                          className="text-lg font-semibold text-gray-900 hover:text-primary-600"
                        >
                          {product.title}
                        </Link>
                        <div className="flex items-center flex-wrap gap-2 mt-1 text-sm text-gray-600">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                            {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                          </span>
                          <span>{product.totalBids || 0} bids</span>
                          <span>{product.views || 0} views</span>
                          {timeRemaining && (
                            <span>
                              <ClockIcon className="inline h-3 w-3" />
                              {' '}{timeRemaining} left
                            </span>
                          )}
                          {product.status === 'scheduled' && scheduledTime && (
                            <span className="text-blue-600 font-medium">
                              <CalendarIcon className="inline h-3 w-3" />
                              {' '}Goes live {scheduledTime.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })} at{' '}
                              {scheduledTime.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary-600">
                          {formatPrice(product.currentPrice)}
                        </p>
                        <p className="text-sm text-gray-500">
                          Starting: {formatPrice(product.startingPrice)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex space-x-2">
                        <Link
                          to={`/products/${product.id}`}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <EyeIcon className="h-4 w-4 mr-1" />
                          View
                        </Link>
                        {product.status === 'active' && (
                          <>
                            <Link
                              to={`/products/edit/${product.id}`}
                              className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <PencilIcon className="h-4 w-4 mr-1" />
                              Edit
                            </Link>
                            {product.listingType === 'sale' ? (
                              <button
                                onClick={() => handleSetStock(product.id, 'sold')}
                                className="inline-flex items-center px-3 py-1 border border-amber-300 text-amber-600 rounded-md text-sm font-medium hover:bg-amber-50"
                              >
                                <XCircleIcon className="h-4 w-4 mr-1" />
                                Out of stock
                              </button>
                            ) : (
                              <button
                                onClick={() => handleEndAuction(product.id)}
                                className="inline-flex items-center px-3 py-1 border border-orange-300 text-orange-600 rounded-md text-sm font-medium hover:bg-orange-50"
                              >
                                <XCircleIcon className="h-4 w-4 mr-1" />
                                End Early
                              </button>
                            )}
                          </>
                        )}
                        {product.status === 'scheduled' && (
                          <button
                            onClick={() => handleCancelScheduled(product.id)}
                            className="inline-flex items-center px-3 py-1 border border-red-300 text-red-600 rounded-md text-sm font-medium hover:bg-red-50"
                          >
                            <XCircleIcon className="h-4 w-4 mr-1" />
                            Cancel
                          </button>
                        )}
                        {product.listingType === 'sale' && product.status === 'sold' && (
                          <button
                            onClick={() => handleSetStock(product.id, 'active')}
                            className="inline-flex items-center px-3 py-1 border border-green-300 text-green-700 rounded-md text-sm font-medium hover:bg-green-50"
                          >
                            <CheckCircleIcon className="h-4 w-4 mr-1" />
                            In stock
                          </button>
                        )}
                        {product.status !== 'active' && product.status !== 'scheduled' && (
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="inline-flex items-center px-3 py-1 border border-red-300 text-red-600 rounded-md text-sm font-medium hover:bg-red-50"
                          >
                            <TrashIcon className="h-4 w-4 mr-1" />
                            Delete
                          </button>
                        )}
                      </div>
                      
                      {product.status === 'sold' && (
                        <Link
                          to={`/orders?product=${product.id}`}
                          className="text-sm text-primary-600 hover:text-primary-700"
                        >
                          View Order <ArrowRightIcon className="inline h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <ShoppingBagIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {activeTab === 'all' 
              ? 'No auctions yet' 
              : `No ${activeTab} auctions`}
          </h3>
          <p className="text-gray-600 mb-4">
            {activeTab === 'all'
              ? 'Create your first auction to start selling'
              : `You don't have any ${activeTab} auctions`}
          </p>
          {activeTab === 'all' && (
            <Link to="/create-auction" className="btn-primary">
              <PlusCircleIcon className="h-5 w-5 mr-2" />
              Create Your First Auction
            </Link>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default MyAuctions