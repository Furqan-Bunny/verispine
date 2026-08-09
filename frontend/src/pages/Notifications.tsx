import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BellIcon,
  CheckIcon,
  TrashIcon,
  FunnelIcon,
  TrophyIcon,
  ShoppingBagIcon,
  ClockIcon,
  HeartIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  GiftIcon,
  UserIcon,
  CogIcon,
  EllipsisVerticalIcon,
  TruckIcon,
  CreditCardIcon,
  BanknotesIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import {
  BellIcon as BellIconSolid
} from '@heroicons/react/24/solid'
import { formatPrice } from '../utils/formatters'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import notificationService, { type Notification } from '../services/notificationService'

const Notifications = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [showMenu, setShowMenu] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    // Subscribe to notification changes
    const unsubscribe = notificationService.subscribe((updatedNotifications) => {
      setNotifications(updatedNotifications)
      setLoading(false)
    })

    // Fetch notifications from server if user is logged in
    if (user?.id) {
      notificationService.setUser(user.id)
    }

    return () => unsubscribe()
  }, [user?.id])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await notificationService.refresh()
      toast.success('Notifications refreshed')
    } catch (error) {
      toast.error('Failed to refresh notifications')
    } finally {
      setRefreshing(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    await notificationService.markAsRead(notificationId)
  }

  const markAllAsRead = async () => {
    await notificationService.markAllAsRead()
    toast.success('All notifications marked as read')
  }

  const deleteNotification = async (notificationId: string) => {
    await notificationService.deleteNotification(notificationId)
    toast.success('Notification deleted')
  }

  const deleteAllRead = async () => {
    await notificationService.clearReadNotifications()
    toast.success('All read notifications cleared')
  }

  const clearAllNotifications = () => {
    if (window.confirm('Are you sure you want to clear all notifications? This action cannot be undone.')) {
      notificationService.clearAllNotifications()
      toast.success('All notifications cleared')
    }
  }

  const getNotificationIcon = (type: string, priority: string) => {
    const baseClasses = "h-5 w-5"
    const colorClasses = priority === 'urgent' ? 'text-red-500' :
                        priority === 'high' ? 'text-orange-500' :
                        priority === 'medium' ? 'text-blue-500' : 'text-gray-500'

    switch (type) {
      case 'bid': return <ShoppingBagIcon className={`${baseClasses} ${colorClasses}`} />
      case 'outbid': return <ExclamationTriangleIcon className={`${baseClasses} text-orange-500`} />
      case 'won': return <TrophyIcon className={`${baseClasses} text-yellow-500`} />
      case 'lost': return <ClockIcon className={`${baseClasses} text-gray-500`} />
      case 'price_alert': return <BellIconSolid className={`${baseClasses} text-green-500`} />
      case 'reminder': return <ClockIcon className={`${baseClasses} text-blue-500`} />
      case 'shipping': return <TruckIcon className={`${baseClasses} text-purple-500`} />
      case 'payment': return <CreditCardIcon className={`${baseClasses} text-green-500`} />
      case 'welcome': return <GiftIcon className={`${baseClasses} text-pink-500`} />
      case 'system': return <InformationCircleIcon className={`${baseClasses} text-blue-500`} />
      case 'withdrawal': return <BanknotesIcon className={`${baseClasses} text-green-500`} />
      default: return <BellIcon className={`${baseClasses} ${colorClasses}`} />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'border-l-red-500 bg-red-50'
      case 'high': return 'border-l-orange-500 bg-orange-50'
      case 'medium': return 'border-l-blue-500 bg-blue-50'
      case 'low': return 'border-l-gray-500 bg-gray-50'
      default: return 'border-l-gray-300 bg-white'
    }
  }

  const getNotificationUrl = (notification: Notification): string => {
    // If actionUrl exists and is not just '/' or '/dashboard', use it
    if (notification.actionUrl && notification.actionUrl !== '/' && notification.actionUrl !== '/dashboard') {
      return notification.actionUrl
    }
    // Derive URL from notification type and metadata
    switch (notification.type) {
      case 'bid':
      case 'outbid':
      case 'won':
      case 'lost':
      case 'price_alert':
        return notification.metadata?.productId ? `/products/${notification.metadata.productId}` : '/my-bids'
      case 'order_update':
        return notification.metadata?.orderId ? `/orders/${notification.metadata.orderId}` : '/orders'
      case 'payment':
        return notification.metadata?.orderId ? `/orders/${notification.metadata.orderId}` : '/orders'
      case 'shipping':
        return notification.metadata?.orderId ? `/orders/${notification.metadata.orderId}` : '/orders'
      case 'withdrawal':
        return '/withdrawals'
      case 'welcome':
        return '/dashboard'
      default:
        return '/dashboard'
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }
    const url = getNotificationUrl(notification)
    navigate(url)
  }

  const filteredNotifications = notifications.filter(notif => {
    if (activeTab === 'unread' && notif.read) return false
    if (activeTab === 'read' && !notif.read) return false
    if (filterType !== 'all' && notif.type !== filterType) return false
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length
  const tabs = [
    { id: 'all', label: 'All', count: notifications.length },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'read', label: 'Read', count: notifications.length - unreadCount }
  ]

  const notificationTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'bid', label: 'Bids' },
    { value: 'outbid', label: 'Outbid' },
    { value: 'won', label: 'Won Auctions' },
    { value: 'order_update', label: 'Order Updates' },
    { value: 'payment', label: 'Payments' },
    { value: 'shipping', label: 'Shipping' },
    { value: 'withdrawal', label: 'Withdrawals' },
    { value: 'info', label: 'Info' },
    { value: 'system', label: 'System' }
  ]

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date().getTime()
    const time = new Date(timestamp).getTime()
    const diff = now - time

    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <BellIconSolid className="h-8 w-8 text-blue-500 mr-3" />
              Notifications
            </h1>
            <p className="text-gray-600 mt-2">
              Stay updated with your auction activity and important updates
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn-outline text-sm"
            >
              <ArrowPathIcon className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="btn-outline text-sm"
              >
                <CheckIcon className="h-4 w-4 mr-1" />
                Mark All Read
              </button>
            )}
            {notifications.filter(n => n.read).length > 0 && (
              <button
                onClick={deleteAllRead}
                className="btn-outline text-sm text-orange-600 border-orange-300 hover:bg-orange-50"
              >
                <TrashIcon className="h-4 w-4 mr-1" />
                Clear Read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50"
              >
                <TrashIcon className="h-4 w-4 mr-1" />
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{notifications.length}</p>
            </div>
            <BellIcon className="h-6 w-6 text-gray-500" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Unread</p>
              <p className="text-2xl font-bold text-gray-900">{unreadCount}</p>
            </div>
            <div className="h-6 w-6 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-red-600">{unreadCount}</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Urgent</p>
              <p className="text-2xl font-bold text-gray-900">
                {notifications.filter(n => n.priority === 'urgent').length}
              </p>
            </div>
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Today</p>
              <p className="text-2xl font-bold text-gray-900">
                {notifications.filter(n => {
                  const today = new Date().toDateString()
                  return new Date(n.timestamp).toDateString() === today
                }).length}
              </p>
            </div>
            <ClockIcon className="h-6 w-6 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Tabs and Filters */}
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
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {notificationTypes.map(type => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading notifications...</p>
          </div>
        ) : filteredNotifications.length > 0 ? (
          filteredNotifications.map((notification) => (
            <motion.div
              key={notification.id}
              layout
              className={`border-l-4 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
                notification.read
                  ? `${getPriorityColor(notification.priority)} opacity-75`
                  : `${getPriorityColor(notification.priority)} shadow-sm`
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type, notification.priority)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className={`font-semibold ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <span className="h-2 w-2 bg-blue-500 rounded-full"></span>
                      )}
                      {notification.priority === 'urgent' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Urgent
                        </span>
                      )}
                    </div>

                    <p className={`mt-1 text-sm ${notification.read ? 'text-gray-600' : 'text-gray-700'}`}>
                      {notification.message}
                    </p>

                    {notification.metadata?.imageUrl && (
                      <div className="mt-3 flex items-center space-x-3">
                        <img
                          src={notification.metadata.imageUrl}
                          alt={notification.metadata.productTitle}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <div>
                          <p className="font-medium text-sm text-gray-900">
                            {notification.metadata.productTitle}
                          </p>
                          {notification.metadata.amount && (
                            <p className="text-sm text-primary-600 font-semibold">
                              {formatPrice(notification.metadata.amount)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-500">
                        {formatTimeAgo(notification.timestamp)}
                      </span>

                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-primary-600 hover:text-primary-700">
                          View Details
                        </span>

                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowMenu(showMenu === notification.id ? null : notification.id)
                            }}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                          >
                            <EllipsisVerticalIcon className="h-4 w-4 text-gray-500" />
                          </button>

                          {showMenu === notification.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                              {!notification.read && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    markAsRead(notification.id)
                                    setShowMenu(null)
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  Mark as read
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteNotification(notification.id)
                                  setShowMenu(null)
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-12">
            <BellIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {activeTab === 'all' ? 'No notifications' : `No ${activeTab} notifications`}
            </h3>
            <p className="text-gray-600 mb-4">
              {activeTab === 'all' 
                ? 'You\'re all caught up! New notifications will appear here.'
                : `You don't have any ${activeTab} notifications at the moment.`
              }
            </p>
            {activeTab === 'all' && (
              <Link to="/products" className="btn-primary">
                Browse Auctions
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Settings Link */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CogIcon className="h-5 w-5 text-gray-500" />
            <div>
              <h3 className="font-medium text-gray-900">Notification Preferences</h3>
              <p className="text-sm text-gray-600">Manage your notification settings and preferences</p>
            </div>
          </div>
          <Link
            to="/profile?tab=notifications"
            className="btn-outline text-sm"
          >
            Manage Settings
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

export default Notifications