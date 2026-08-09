import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import axios from '../../config/axios'
import {
  UsersIcon,
  CubeIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ShoppingBagIcon,
  TagIcon,
  UserGroupIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

interface DashboardStats {
  users: {
    total: number
    active: number
    sellers: number
    new: number
    growth: number
  }
  products: {
    total: number
    active: number
    pending: number
    sold: number
    growth: number
  }
  revenue: {
    total: number
    monthly: number
    fees: number
    growth: number
  }
  activity: {
    totalBids: number
    totalOrders: number
    avgBidAmount: number
    conversionRate: number
  }
}

interface RecentActivity {
  type: string
  message?: string
  timestamp?: any
  icon?: any
  color?: string
}

// The dashboard endpoint sends Firestore timestamps ({_seconds}) and structured fields
// (userName/productTitle/...) rather than a ready-made message — handle both here.
function toActivityDate(ts: any): Date | null {
  if (!ts) return null
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts
  if (typeof ts === 'object' && (ts._seconds != null || ts.seconds != null)) {
    return new Date((ts._seconds ?? ts.seconds) * 1000)
  }
  const d = new Date(ts)
  return isNaN(d.getTime()) ? null : d
}

function activityText(a: any): string {
  if (a.message) return a.message
  switch (a.type) {
    case 'user_joined':
      return `${(a.userName || '').trim() || a.email || 'A user'} joined`
    case 'product_listed':
      return `New product listed: ${a.productTitle || 'Untitled'}`
    case 'order_placed':
      return `Order placed${a.productTitle ? ` for ${a.productTitle}` : ''}${a.buyerName ? ` by ${a.buyerName}` : ''}`
    default:
      return 'Activity'
  }
}

const AdminDashboard = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [pendingProducts, setPendingProducts] = useState<any[]>([])
  const [topSellers, setTopSellers] = useState<any[]>([])

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/')
      toast.error('Admin access required')
      return
    }
    loadDashboardData()
  }, [user])

  const loadDashboardData = async () => {
    setLoading(true)
    try {
      const response = await axios.get('/api/admin/dashboard')
      if (response.data.success) {
        const data = response.data.data
        
        // Map backend stats structure to frontend structure
        const mappedStats: DashboardStats = {
          users: {
            total: data.stats?.users?.total || 0,
            active: data.stats?.users?.activeToday || 0,
            sellers: data.stats?.users?.sellers || 0,
            new: data.stats?.users?.buyers || 0,
            growth: 0 // Calculate if needed
          },
          products: {
            total: data.stats?.products?.total || 0,
            active: data.stats?.products?.active || 0,
            pending: data.stats?.products?.ended || 0,
            sold: data.stats?.products?.sold || 0,
            growth: 0
          },
          revenue: {
            total: data.stats?.orders?.totalRevenue || 0,
            monthly: data.stats?.orders?.totalRevenue || 0, // Would need date filtering
            fees: data.stats?.orders?.platformFees || 0,
            growth: 0
          },
          activity: {
            totalBids: data.stats?.bids?.total || 0,
            totalOrders: data.stats?.orders?.total || 0,
            avgBidAmount: data.stats?.bids?.totalValue / (data.stats?.bids?.total || 1) || 0,
            conversionRate: data.stats?.orders?.total / (data.stats?.bids?.total || 1) * 100 || 0
          }
        }
        
        setStats(mappedStats)
        setRecentActivity(data.recentActivities || [])
        setPendingProducts(data.topProducts || []) // Using top products for now
        setTopSellers(data.topSellers || [])
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveProduct = async (productId: string) => {
    try {
      const response = await axios.put(`/api/admin/products/${productId}/status`, {
        status: 'approved'
      })
      if (response.data.success) {
        toast.success('Product approved')
        setPendingProducts(prev => prev.filter(p => p.id !== productId))
      }
    } catch (error) {
      console.error('Error approving product:', error)
      toast.error('Failed to approve product')
    }
  }

  const handleRejectProduct = async (productId: string) => {
    try {
      const response = await axios.put(`/api/admin/products/${productId}/status`, {
        status: 'rejected',
        reason: 'Rejected by admin'
      })
      if (response.data.success) {
        toast.success('Product rejected')
        setPendingProducts(prev => prev.filter(p => p.id !== productId))
      }
    } catch (error) {
      console.error('Error rejecting product:', error)
      toast.error('Failed to reject product')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  const getActivityIcon = (type: string) => {
    const icons: Record<string, any> = {
      // types actually sent by the dashboard endpoint
      user_joined: UsersIcon,
      product_listed: CubeIcon,
      order_placed: CurrencyDollarIcon,
      // other/legacy types
      user_signup: UsersIcon,
      bid_placed: ClockIcon,
      order_completed: CheckCircleIcon,
      product_sold: CurrencyDollarIcon
    }
    return icons[type] || InformationCircleIcon
  }

  const getActivityColor = (type: string) => {
    const colors: Record<string, string> = {
      user_joined: 'text-blue-600',
      product_listed: 'text-purple-600',
      order_placed: 'text-green-600',
      user_signup: 'text-blue-600',
      bid_placed: 'text-yellow-600',
      order_completed: 'text-green-600',
      product_sold: 'text-emerald-600'
    }
    return colors[type] || 'text-gray-600'
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.users.total || 0,
      change: stats?.users.growth || 0,
      icon: UsersIcon,
      color: 'bg-blue-500',
      subtext: `${stats?.users.active || 0} active`,
      link: '/admin/users'
    },
    {
      title: 'Total Products',
      value: stats?.products.total || 0,
      change: stats?.products.growth || 0,
      icon: CubeIcon,
      color: 'bg-purple-500',
      subtext: `${stats?.products.pending || 0} pending`,
      link: '/admin/products'
    },
    {
      title: 'Total Revenue',
      value: formatCurrency(stats?.revenue.total || 0),
      change: stats?.revenue.growth || 0,
      icon: CurrencyDollarIcon,
      color: 'bg-green-500',
      subtext: `${formatCurrency(stats?.revenue.monthly || 0)} this month`,
      link: '/admin/revenue'
    },
    {
      title: 'Total Orders',
      value: stats?.activity.totalOrders || 0,
      change: stats?.activity.conversionRate || 0,
      icon: ShoppingBagIcon,
      color: 'bg-orange-500',
      subtext: `${stats?.activity.totalBids || 0} total bids`,
      link: '/admin/orders'
    }
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl p-6 text-white">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-primary-100 mt-2">
          Monitor and manage your platform
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => navigate(stat.link)}
            className="card hover:shadow-lg cursor-pointer transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stat.value}
                </p>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-sm font-medium ${
                    stat.change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {stat.change >= 0 ? (
                      <ArrowUpIcon className="inline h-3 w-3" />
                    ) : (
                      <ArrowDownIcon className="inline h-3 w-3" />
                    )}
                    {formatPercentage(Math.abs(stat.change))}
                  </span>
                  <span className="text-xs text-gray-500">
                    {stat.subtext}
                  </span>
                </div>
              </div>
              <div className={`${stat.color} p-3 rounded-lg bg-opacity-10`}>
                <stat.icon className={`h-6 w-6 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Products */}
        <div className="lg:col-span-2 card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Pending Approval
            </h2>
            <button
              onClick={() => navigate('/admin/products?status=pending')}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              View All
            </button>
          </div>

          {pendingProducts.length > 0 ? (
            <div className="space-y-3">
              {pendingProducts.slice(0, 5).map((product) => (
                <div key={product.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <img
                        src={product.images?.[0] || 'https://via.placeholder.com/50'}
                        alt={product.title}
                        className="w-12 h-12 object-cover rounded"
                      />
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {product.title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          by {product.sellerName || 'Unknown'}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleApproveProduct(product.id)}
                        className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm hover:bg-green-200"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectProduct(product.id)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-md text-sm hover:bg-red-200"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              No pending products
            </p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Recent Activity
          </h2>
          
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.slice(0, 8).map((activity, index) => {
                const Icon = getActivityIcon(activity.type)
                const colorClass = getActivityColor(activity.type)
                const when = toActivityDate(activity.timestamp)

                return (
                  <div key={index} className="flex items-start space-x-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${colorClass}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        {activityText(activity)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {when ? when.toLocaleString() : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              No recent activity
            </p>
          )}
        </div>
      </div>

      {/* Top Sellers */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            Top Sellers
          </h2>
          <button
            onClick={() => navigate('/admin/users?role=seller')}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View All Sellers
          </button>
        </div>

        {topSellers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {topSellers.map((seller) => (
              <div key={seller.id} className="text-center">
                <img
                  src={seller.profileImage || `https://ui-avatars.com/api/?name=${seller.name}`}
                  alt={seller.name}
                  className="w-16 h-16 rounded-full mx-auto mb-2"
                />
                <h3 className="font-medium text-gray-900">{seller.name}</h3>
                <p className="text-sm text-gray-500">
                  {seller.totalSales} sales
                </p>
                <p className="text-sm font-semibold text-primary-600">
                  {formatCurrency(seller.revenue)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            No seller data available
          </p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <button
          onClick={() => navigate('/admin/users')}
          className="card hover:shadow-lg transition-all text-center py-4"
        >
          <UserGroupIcon className="h-8 w-8 mx-auto mb-2 text-primary-600" />
          <span className="text-sm font-medium">Manage Users</span>
        </button>
        <button
          onClick={() => navigate('/admin/products')}
          className="card hover:shadow-lg transition-all text-center py-4"
        >
          <CubeIcon className="h-8 w-8 mx-auto mb-2 text-primary-600" />
          <span className="text-sm font-medium">Manage Products</span>
        </button>
        <button
          onClick={() => navigate('/admin/add-products')}
          className="card hover:shadow-lg transition-all text-center py-4"
        >
          <ShoppingBagIcon className="h-8 w-8 mx-auto mb-2 text-green-600" />
          <span className="text-sm font-medium">Add Sample Products</span>
        </button>
        <button
          onClick={() => navigate('/admin/categories')}
          className="card hover:shadow-lg transition-all text-center py-4"
        >
          <TagIcon className="h-8 w-8 mx-auto mb-2 text-primary-600" />
          <span className="text-sm font-medium">Categories</span>
        </button>
        <button
          onClick={() => navigate('/admin/settings')}
          className="card hover:shadow-lg transition-all text-center py-4"
        >
          <ChartBarIcon className="h-8 w-8 mx-auto mb-2 text-primary-600" />
          <span className="text-sm font-medium">Analytics</span>
        </button>
      </div>
    </motion.div>
  )
}

export default AdminDashboard
