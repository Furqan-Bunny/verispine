import { Link, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import axios from '../config/axios'
import {
  HomeIcon,
  UserGroupIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  TagIcon,
  ChartBarIcon,
  CogIcon,
  ArrowLeftIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  BellIcon,
  ShieldCheckIcon,
  Bars3Icon,
  XMarkIcon,
  BanknotesIcon,
  TruckIcon,
  IdentificationIcon,
  BuildingStorefrontIcon,
  GiftIcon
} from '@heroicons/react/24/outline'

interface PendingCounts {
  pendingOrders: number
  processingOrders: number
  pendingWithdrawals: number
  pendingKyc: number
  pendingSellerApplications: number
  activeBids: number
  totalPending: number
}

const AdminLayout = () => {
  const location = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isAuthenticated } = useAuthStore()
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({
    pendingOrders: 0,
    processingOrders: 0,
    pendingWithdrawals: 0,
    pendingKyc: 0,
    pendingSellerApplications: 0,
    activeBids: 0,
    totalPending: 0
  })

  // Fetch pending counts for badges
  useEffect(() => {
    const fetchPendingCounts = async () => {
      try {
        // Don't poll before the auth token is actually available (avoids cold-start 401s
        // that also burn the rate-limit budget).
        if (!localStorage.getItem('token')) return
        const response = await axios.get('/api/admin/pending-counts')
        if (response.data?.success) {
          setPendingCounts(response.data.data)
        }
      } catch (error) {
        console.error('Error fetching pending counts:', error)
      }
    }

    if (isAuthenticated) {
      fetchPendingCounts()
      // Refresh every 2 minutes
      const interval = setInterval(fetchPendingCounts, 120000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated])

  // Get badge count for a menu item
  const getBadgeCount = (badgeKey: string | undefined): number => {
    if (!badgeKey) return 0
    switch (badgeKey) {
      case 'orders':
        return pendingCounts.pendingOrders + pendingCounts.processingOrders
      case 'withdrawals':
        return pendingCounts.pendingWithdrawals
      case 'bids':
        return pendingCounts.activeBids
      case 'kyc':
        return pendingCounts.pendingKyc
      case 'sellerApplications':
        return pendingCounts.pendingSellerApplications
      default:
        return 0
    }
  }

  const menuItems = [
    {
      path: '/admin/dashboard',
      name: 'Dashboard',
      icon: HomeIcon,
      description: 'Overview & Analytics'
    },
    {
      path: '/admin/users',
      name: 'Manage Users',
      icon: UserGroupIcon,
      description: 'User Management'
    },
    {
      path: '/admin/products',
      name: 'Manage Products',
      icon: ShoppingBagIcon,
      description: 'Product Listings'
    },
    {
      path: '/admin/bids',
      name: 'Manage Bids',
      icon: ChartBarIcon,
      description: 'Accept & Review Bids',
      badgeKey: 'bids'
    },
    {
      path: '/admin/orders',
      name: 'All Orders',
      icon: ClipboardDocumentListIcon,
      description: 'Order Management',
      badgeKey: 'orders'
    },
    {
      path: '/admin/categories',
      name: 'Categories',
      icon: TagIcon,
      description: 'Category Management'
    },
    {
      path: '/admin/reports',
      name: 'Generate Reports',
      icon: DocumentTextIcon,
      description: 'Analytics & Reports'
    },
    {
      path: '/admin/payments',
      name: 'Payments',
      icon: CurrencyDollarIcon,
      description: 'Payment Management'
    },
    {
      path: '/admin/withdrawals',
      name: 'Withdrawals',
      icon: BanknotesIcon,
      description: 'Withdrawal Requests',
      badgeKey: 'withdrawals'
    },
    {
      path: '/admin/shipping',
      name: 'Shipping',
      icon: TruckIcon,
      description: 'Shipping Management'
    },
    {
      path: '/admin/kyc',
      name: 'KYC Verification',
      icon: IdentificationIcon,
      description: 'User Verification',
      badgeKey: 'kyc'
    },
    {
      path: '/admin/sellers',
      name: 'Sellers',
      icon: BuildingStorefrontIcon,
      description: 'Seller activity & KPIs'
    },
    {
      path: '/admin/seller-applications',
      name: 'Seller Applications',
      icon: BuildingStorefrontIcon,
      description: 'Approve sellers',
      badgeKey: 'sellerApplications'
    },
    {
      path: '/admin/affiliates',
      name: 'Affiliates',
      icon: GiftIcon,
      description: 'Affiliate earnings & referrals'
    },
    {
      path: '/admin/notifications',
      name: 'Notifications',
      icon: BellIcon,
      description: 'System Notifications'
    },
    {
      path: '/admin/settings',
      name: 'Settings',
      icon: CogIcon,
      description: 'System Settings'
    }
  ]

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          fixed w-72 bg-white shadow-xl border-r
          border-gray-200 flex flex-col h-full z-50 transition-transform duration-300
        `}
      >
        {/* Admin Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <ShieldCheckIcon className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Admin Panel</h2>
                <p className="text-primary-100 text-sm">VeriSpine Management</p>
              </div>
            </div>
            {/* Close button */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Main Site
          </Link>
        </div>

        {/* Navigation Menu - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <nav className="p-4">
            <div className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                const badgeCount = getBadgeCount(item.badgeKey)

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      group flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                      ${active
                        ? 'bg-primary-50 text-primary-700 shadow-sm'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-primary-600'
                      }
                    `}
                  >
                    <div className={`
                      p-2 rounded-lg transition-colors
                      ${active
                        ? 'bg-primary-100'
                        : 'bg-gray-100 group-hover:bg-primary-50'
                      }
                    `}>
                      <Icon className={`
                        h-5 w-5 transition-colors
                        ${active ? 'text-primary-700' : 'text-gray-600 group-hover:text-primary-600'}
                      `} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{item.name}</p>
                        {badgeCount > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            {badgeCount}
                          </span>
                        )}
                      </div>
                      <p className={`
                        text-xs transition-colors
                        ${active ? 'text-primary-600' : 'text-gray-500'}
                      `}>
                        {item.description}
                      </p>
                    </div>
                    {active && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="w-1 h-8 bg-primary-600 rounded-full"
                        initial={false}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          </nav>

          {/* Admin Stats Card */}
          <div className="p-4">
            <div className="bg-gradient-to-br from-primary-50 to-secondary-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Pending Actions</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pending Orders</span>
                  <span className={`font-semibold ${pendingCounts.pendingOrders + pendingCounts.processingOrders > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                    {pendingCounts.pendingOrders + pendingCounts.processingOrders}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pending Withdrawals</span>
                  <span className={`font-semibold ${pendingCounts.pendingWithdrawals > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                    {pendingCounts.pendingWithdrawals}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pending KYC</span>
                  <span className={`font-semibold ${pendingCounts.pendingKyc > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                    {pendingCounts.pendingKyc}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-200 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 font-medium">Total Pending</span>
                    <span className={`font-bold ${pendingCounts.totalPending > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {pendingCounts.totalPending}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Profile - Fixed at bottom */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
              <UserGroupIcon className="h-6 w-6 text-primary-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Administrator</p>
              <p className="text-xs text-gray-500">info@verispinejointcenters.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar - Fixed */}
        <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              {/* Menu button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-gray-600 hover:text-primary-600 transition-colors"
              >
                <Bars3Icon className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
                  {menuItems.find(item => item.path === location.pathname)?.name || 'Admin Panel'}
                </h1>
                <p className="text-xs lg:text-sm text-gray-600 mt-1">
                  {menuItems.find(item => item.path === location.pathname)?.description || 'Manage your platform'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Notification Bell */}
              <button className="relative p-2 text-gray-600 hover:text-primary-600 transition-colors">
                <BellIcon className="h-6 w-6" />
                <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
              </button>
              
              {/* Quick Actions */}
              <button className="btn-primary text-sm">
                Quick Action
              </button>
            </div>
          </div>
        </div>

        {/* Page Content - Scrollable */}
        <div ref={contentRef} className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-4 lg:p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminLayout