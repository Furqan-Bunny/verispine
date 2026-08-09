import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from '../config/axios'
import {
  ClockIcon,
  TrophyIcon,
  XCircleIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline'
import { formatPrice, getTimeRemaining, getPaymentTimeRemaining } from '../utils/formatters'
import Pagination from '../components/Pagination'

const MyBids = () => {
  const [activeTab, setActiveTab] = useState('active')
  const [bids, setBids] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('ending-soon')
  const [currentPage, setCurrentPage] = useState(1)
  const bidsPerPage = 10

  useEffect(() => {
    loadBidData()
    setCurrentPage(1) // Reset page when tab changes
  }, [activeTab])

  const loadBidData = async () => {
    setLoading(true)
    try {
      let endpoint = '/api/bids/my-bids'
      if (activeTab === 'won') {
        endpoint = '/api/orders/my-orders?type=auction_win'
      } else if (activeTab === 'lost') {
        endpoint = '/api/bids/my-bids?status=outbid'
      } else {
        endpoint = '/api/bids/my-bids?status=active'
      }
      
      const response = await axios.get(endpoint)
      if (response.data.success) {
        let data = response.data.data || []
        
        // Sort data based on sortBy value
        switch (sortBy) {
          case 'ending-soon':
            data.sort((a: any, b: any) => {
              const aDate = a.product?.endDate?._seconds ? new Date(a.product.endDate._seconds * 1000) : new Date()
              const bDate = b.product?.endDate?._seconds ? new Date(b.product.endDate._seconds * 1000) : new Date()
              return aDate.getTime() - bDate.getTime()
            })
            break
          case 'price-high':
            data.sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
            break
          case 'price-low':
            data.sort((a: any, b: any) => Number(a.amount) - Number(b.amount))
            break
          case 'recent':
            data.sort((a: any, b: any) => {
              const aDate = a.createdAt?._seconds ? new Date(a.createdAt._seconds * 1000) : new Date()
              const bDate = b.createdAt?._seconds ? new Date(b.createdAt._seconds * 1000) : new Date()
              return bDate.getTime() - aDate.getTime()
            })
            break
        }
        
        setBids(data)
      }
    } catch (error) {
      console.error('Error loading bids:', error)
      setBids([])
    } finally {
      setLoading(false)
    }
  }

  // Calculate counts based on status
  const tabs = [
    { id: 'active', label: 'Active Bids', count: activeTab === 'active' ? bids.length : 0 },
    { id: 'won', label: 'Won', count: activeTab === 'won' ? bids.length : 0 },
    { id: 'lost', label: 'Lost', count: activeTab === 'lost' ? bids.length : 0 }
  ]

  const sortOptions = [
    { value: 'ending-soon', label: 'Ending Soon' },
    { value: 'price-high', label: 'Price: High to Low' },
    { value: 'price-low', label: 'Price: Low to High' },
    { value: 'recent', label: 'Most Recent' }
  ]

  const handleSort = (value: string) => {
    setSortBy(value)
  }
  
  useEffect(() => {
    if (!loading) {
      loadBidData()
      setCurrentPage(1) // Reset page when sort changes
    }
  }, [sortBy])

  // Pagination
  const totalPages = Math.ceil(bids.length / bidsPerPage)
  const paginatedBids = bids.slice(
    (currentPage - 1) * bidsPerPage,
    currentPage * bidsPerPage
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-50 to-secondary-50 rounded-xl p-6">
        <h1 className="text-3xl font-bold text-gray-900">My Bids</h1>
        <p className="text-gray-600 mt-2">
          Track all your bidding activity in one place
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Active</p>
              <p className="text-2xl font-bold text-gray-900">{activeTab === 'active' ? bids.length : 0}</p>
            </div>
            <ClockIcon className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Winning</p>
              <p className="text-2xl font-bold text-gray-900">
                {activeTab === 'active' ? bids.filter(b => b.status === 'active').length : 0}
              </p>
            </div>
            <TrophyIcon className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Outbid</p>
              <p className="text-2xl font-bold text-gray-900">
                {activeTab === 'lost' ? bids.length : 0}
              </p>
            </div>
            <XCircleIcon className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Won This Month</p>
              <p className="text-2xl font-bold text-gray-900">{activeTab === 'won' ? bids.length : 0}</p>
            </div>
            <TrophyIcon className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Tabs and Sort */}
      <div className="flex justify-between items-center">
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
        
        <select
          value={sortBy}
          onChange={(e) => handleSort(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {sortOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div>
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : activeTab === 'active' && (
          <div className="space-y-4">
            {bids.length > 0 ? (
              <>
                {paginatedBids.map((bid) => (
                <div key={bid.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start space-x-4">
                    <img
                      src={bid.product?.images?.[0] || 'https://via.placeholder.com/96'}
                      alt={bid.product?.title || 'Product'}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <Link
                            to={`/products/${bid.productId}`}
                            className="text-lg font-semibold text-gray-900 hover:text-primary-600"
                          >
                            {bid.product?.title || 'Product'}
                          </Link>
                          <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                            <span>Your bid: {formatPrice(bid.amount)}</span>
                            <span>Current: {formatPrice(bid.product?.currentPrice || 0)}</span>
                            <span>{bid.product?.totalBids || 0} bids</span>
                          </div>
                          <div className="flex items-center mt-2">
                            {bid.status === 'active' && Number(bid.amount) >= Number(bid.product?.currentPrice || 0) ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <TrophyIcon className="h-3 w-3 mr-1" />
                                Winning
                              </span>
                            ) : bid.status === 'outbid' ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                <XCircleIcon className="h-3 w-3 mr-1" />
                                Outbid
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <ExclamationCircleIcon className="h-3 w-3 mr-1" />
                                Review
                              </span>
                            )}
                            {bid.product?.endDate && (
                              <span className="ml-3 text-sm text-gray-500">
                                <ClockIcon className="inline h-3 w-3" />
                                {getTimeRemaining(bid.product.endDate._seconds ? 
                                  new Date(bid.product.endDate._seconds * 1000) : 
                                  bid.product.endDate)} remaining
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Link
                            to={`/products/${bid.productId}`}
                            className="btn-primary text-sm"
                          >
                            {bid.status === 'active' && Number(bid.amount) >= Number(bid.product?.currentPrice || 0) ? 'View' : 'Increase Bid'}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                ))}
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  className="mt-6"
                />
              </>
            ) : (
              <div className="text-center py-12">
                <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No active bids</h3>
                <p className="text-gray-600 mb-4">
                  Start bidding on items to see them here
                </p>
                <Link to="/products" className="btn-primary">
                  Browse Auctions
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'won' && !loading && (
          <div className="space-y-4">
            {bids.length > 0 ? (
              <>
                {paginatedBids.map((order) => (
                <div key={order.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start space-x-4">
                    <img
                      src={order.productImage || 'https://via.placeholder.com/96'}
                      alt={order.productTitle || 'Product'}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {order.productTitle || 'Product'}
                          </h3>
                          <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                            <span>Won for: {formatPrice(order.amount)}</span>
                            <span>Won on: {order.createdAt ? 
                              new Date(order.createdAt._seconds ? order.createdAt._seconds * 1000 : order.createdAt).toLocaleDateString() : 
                              'Unknown'}</span>
                          </div>
                          <div className="mt-2">
                            {order.paymentStatus === 'completed' ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Payment Complete
                              </span>
                            ) : order.paymentDeadline ? (() => {
                              const deadline = getPaymentTimeRemaining(order.paymentDeadline)
                              const colors = {
                                safe: 'bg-green-100 text-green-800',
                                warning: 'bg-yellow-100 text-yellow-800',
                                danger: 'bg-red-100 text-red-800',
                                expired: 'bg-red-200 text-red-900'
                              }
                              return (
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors[deadline.urgency]}`}>
                                  {deadline.text}
                                </span>
                              )
                            })() : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Payment Pending
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          {order.paymentStatus === 'pending' && (
                            <Link
                              to={`/orders/${order.id}/pay`}
                              className="btn-primary text-sm block"
                            >
                              Pay Now
                            </Link>
                          )}
                          <Link
                            to={`/orders/${order.id}`}
                            className="btn-outline text-sm block"
                          >
                            View Order
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                ))}
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  className="mt-6"
                />
              </>
            ) : (
              <div className="text-center py-12">
                <TrophyIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No won auctions</h3>
                <p className="text-gray-600">
                  Auctions you win will appear here
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lost' && !loading && (
          <div className="space-y-4">
            {bids.length > 0 ? (
              <>
                {paginatedBids.map((bid) => (
                <div key={bid.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start space-x-4">
                    <img
                      src={bid.product?.images?.[0] || 'https://via.placeholder.com/96'}
                      alt={bid.product?.title || 'Product'}
                      className="w-24 h-24 object-cover rounded-lg grayscale opacity-75"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {bid.product?.title || 'Product'}
                          </h3>
                          <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                            <span>Your bid: {formatPrice(bid.amount)}</span>
                            <span>Winning bid: {formatPrice(bid.product?.currentPrice || 0)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {bid.product?.status === 'ended' || bid.product?.status === 'sold' ? 
                              `Ended: ${bid.product?.endDate ? 
                                new Date(bid.product.endDate._seconds ? bid.product.endDate._seconds * 1000 : bid.product.endDate).toLocaleDateString() : 
                                'Unknown'}` : 
                              'Auction still active'}
                          </p>
                        </div>
                        <Link
                          to="/products"
                          className="btn-outline text-sm"
                        >
                          Find Similar
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
                ))}
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  className="mt-6"
                />
              </>
            ) : (
              <div className="text-center py-12">
                <XCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No lost auctions</h3>
                <p className="text-gray-600">
                  Auctions you didn't win will appear here
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default MyBids