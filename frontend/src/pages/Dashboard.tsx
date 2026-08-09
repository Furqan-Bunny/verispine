import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import axios from '../config/axios'
import {
  ShoppingBagIcon,
  HeartIcon,
  ClockIcon,
  TrophyIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ArrowRightIcon,
  BellIcon,
  ExclamationCircleIcon,
  BanknotesIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import { formatPrice, getTimeRemaining } from '../utils/formatters'
import ProductCard from '../components/ProductCard'

const Dashboard = () => {
  const { user } = useAuthStore()
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeBids, setActiveBids] = useState<any[]>([])
  const [bidsPage, setBidsPage] = useState(1)
  const [activityPage, setActivityPage] = useState(1)
  const bidsPerPage = 3
  const activitiesPerPage = 5

  useEffect(() => {
    loadDashboardData()
    loadActiveBids()
  }, [])

  const loadDashboardData = async () => {
    try {
      const response = await axios.get('/api/users/dashboard')
      if (response.data.success) {
        setDashboardData(response.data.data)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setLoading(false)
    }
  }

  const loadActiveBids = async () => {
    try {
      const response = await axios.get('/api/bids/my-bids')
      if (response.data.success) {
        setActiveBids(response.data.data.filter((bid: any) => bid.status === 'active'))
      }
    } catch (error) {
      console.error('Error loading bids:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const stats = dashboardData?.stats || {
    totalBids: 0,
    wonAuctions: 0,
    totalSpent: 0,
    watchlistCount: 0,
    balance: 0,
    pendingOrders: 0
  }

  const recentActivity = dashboardData?.recentActivity || []
  const recommendations = dashboardData?.recommendations || []

  // Pagination for active bids
  const totalBidsPages = Math.ceil(activeBids.length / bidsPerPage)
  const paginatedBids = activeBids.slice(
    (bidsPage - 1) * bidsPerPage,
    bidsPage * bidsPerPage
  )

  // Pagination for recent activity
  const totalActivityPages = Math.ceil(recentActivity.length / activitiesPerPage)
  const paginatedActivity = recentActivity.slice(
    (activityPage - 1) * activitiesPerPage,
    activityPage * activitiesPerPage
  )

  const statCards = [
    {
      title: 'Active Bids',
      value: stats.totalBids,
      icon: ClockIcon,
      color: 'bg-blue-500',
      link: '/my-bids'
    },
    {
      title: 'Won Auctions',
      value: stats.wonAuctions,
      icon: TrophyIcon,
      color: 'bg-green-500',
      link: '/orders'
    },
    {
      title: 'Watchlist',
      value: stats.watchlistCount,
      icon: HeartIcon,
      color: 'bg-red-500',
      link: '/wishlist'
    },
    {
      title: 'Account Balance',
      value: formatPrice(stats.balance),
      icon: CurrencyDollarIcon,
      color: 'bg-purple-500',
      link: '/profile'
    }
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-primary-50 to-secondary-50 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="w-full sm:w-auto">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {user?.firstName || 'User'}!
            </h1>
            <p className="text-gray-600 mt-2">
              Here's what's happening with your auctions today
            </p>
            {stats.pendingOrders > 0 && (
              <div className="mt-4 flex items-center text-orange-600">
                <ExclamationCircleIcon className="h-5 w-5 mr-2" />
                <span>You have {stats.pendingOrders} pending orders to complete</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <Link 
              to="/withdrawals"
              className="flex items-center justify-center sm:justify-start gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-primary-700 transition"
            >
              <BanknotesIcon className="h-5 w-5" />
              <span className="whitespace-nowrap">Withdraw Balance</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Link to={stat.link} className="block">
              <div className="card hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`${stat.color} p-3 rounded-lg`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Bids */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Your Active Bids</h2>
              <Link to="/my-bids" className="text-primary-600 hover:text-primary-700 text-sm">
                View all <ArrowRightIcon className="inline h-4 w-4" />
              </Link>
            </div>
            {activeBids.length > 0 ? (
              <div className="space-y-4">
                {paginatedBids.map((bid) => (
                  <div key={bid.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <img
                        src={bid.product?.images?.[0] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjZTVlN2ViIi8+CiAgPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4='}
                        alt={bid.product?.title}
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                      <div>
                        <Link 
                          to={`/products/${bid.productId}`}
                          className="font-medium text-gray-900 hover:text-primary-600"
                        >
                          {bid.product?.title || 'Product'}
                        </Link>
                        <p className="text-sm text-gray-600">
                          Your bid: {formatPrice(bid.amount)}
                        </p>
                        {bid.status === 'active' && (
                          <span className="text-xs text-green-600">Leading bid</span>
                        )}
                        {bid.status === 'outbid' && (
                          <span className="text-xs text-red-600">Outbid</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Current price</p>
                      <p className="font-bold text-gray-900">
                        {formatPrice(bid.product?.currentPrice || 0)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {getTimeRemaining(bid.product?.endDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ClockIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>No active bids yet</p>
                <Link to="/products" className="text-primary-600 hover:text-primary-700 text-sm mt-2 inline-block">
                  Browse auctions <ArrowRightIcon className="inline h-4 w-4" />
                </Link>
              </div>
            )}
            
            {/* Pagination for Active Bids */}
            {totalBidsPages > 1 && (
              <div className="mt-4 flex justify-center items-center space-x-2">
                <button
                  onClick={() => setBidsPage(bidsPage - 1)}
                  disabled={bidsPage === 1}
                  className="p-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="text-sm text-gray-600">
                  Page {bidsPage} of {totalBidsPages}
                </span>
                <button
                  onClick={() => setBidsPage(bidsPage + 1)}
                  disabled={bidsPage === totalBidsPages}
                  className="p-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {paginatedActivity.map((activity: any, index: number) => (
                  <div key={index} className="flex items-start space-x-3 py-2 border-b last:border-0">
                    <div className="flex-shrink-0">
                      {activity.type === 'bid' && <ClockIcon className="h-5 w-5 text-blue-500" />}
                      {activity.type === 'won' && <TrophyIcon className="h-5 w-5 text-green-500" />}
                      {activity.type === 'outbid' && <ExclamationCircleIcon className="h-5 w-5 text-red-500" />}
                      {activity.type === 'watching' && <HeartIcon className="h-5 w-5 text-purple-500" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      {activity.amount && (
                        <p className="text-xs text-gray-600 mt-1">
                          Amount: {formatPrice(activity.amount)}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(activity.timestamp?._seconds ? 
                          activity.timestamp._seconds * 1000 : 
                          activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No recent activity</p>
            )}
            
            {/* Pagination for Recent Activity */}
            {totalActivityPages > 1 && (
              <div className="mt-4 flex justify-center items-center space-x-2">
                <button
                  onClick={() => setActivityPage(activityPage - 1)}
                  disabled={activityPage === 1}
                  className="p-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="text-sm text-gray-600">
                  Page {activityPage} of {totalActivityPages}
                </span>
                <button
                  onClick={() => setActivityPage(activityPage + 1)}
                  disabled={activityPage === totalActivityPages}
                  className="p-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link to="/products" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                <span className="text-gray-700">Browse Auctions</span>
                <ArrowRightIcon className="h-4 w-4 text-gray-400" />
              </Link>
              {(user?.role === 'admin' || user?.role === 'seller') && (
                <Link to="/create-auction" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                  <span className="text-gray-700">Sell an Item</span>
                  <ArrowRightIcon className="h-4 w-4 text-gray-400" />
                </Link>
              )}
              {user?.isAffiliate ? (
                <Link to="/affiliate" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                  <span className="text-gray-700">Invite & Earn</span>
                  <ArrowRightIcon className="h-4 w-4 text-gray-400" />
                </Link>
              ) : user?.kycStatus === 'APPROVED' ? (
                <Link to="/affiliate" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                  <span className="text-gray-700">Become an Affiliate</span>
                  <ArrowRightIcon className="h-4 w-4 text-gray-400" />
                </Link>
              ) : null}
              {user?.role !== 'admin' && user?.role !== 'seller' && user?.kycStatus === 'APPROVED' && (
                <Link to="/become-seller" className="flex items-center justify-between p-3 hover:bg-primary-50 rounded-lg border border-primary-200">
                  <span className="text-primary-700 font-medium">Become a Seller</span>
                  <ArrowRightIcon className="h-4 w-4 text-primary-500" />
                </Link>
              )}
              <Link to="/profile" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                <span className="text-gray-700">Account Settings</span>
                <ArrowRightIcon className="h-4 w-4 text-gray-400" />
              </Link>
            </div>
          </div>

          {/* Notifications */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              <Link to="/notifications" className="text-primary-600 hover:text-primary-700 text-sm">
                View all
              </Link>
            </div>
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <BellIcon className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-700">Auction ending soon!</p>
                  <p className="text-xs text-gray-500">2 hours remaining</p>
                </div>
              </div>
            </div>
          </div>

          {/* Account Summary */}
          <div className="card bg-gradient-to-br from-primary-50 to-secondary-50">
            <h3 className="font-semibold text-gray-900 mb-4">Account Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Available Balance</span>
                <span className="font-bold text-gray-900">{formatPrice(stats.balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Spent</span>
                <span className="font-bold text-gray-900">{formatPrice(stats.totalSpent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Member Since</span>
                <span className="font-bold text-gray-900">
                  {dashboardData?.user?.memberSince ? 
                    new Date(dashboardData.user.memberSince._seconds * 1000).toLocaleDateString() : 
                    'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Products */}
      {recommendations.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Recommended for You</h2>
            <Link to="/products" className="text-primary-600 hover:text-primary-700 text-sm">
              View more <ArrowRightIcon className="inline h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recommendations.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default Dashboard