import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import notificationService from '../services/notificationService'
import {
  HomeIcon,
  ShoppingBagIcon,
  UserIcon,
  HeartIcon,
  BellIcon,
  PlusCircleIcon,
  ChevronDownIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  ShoppingCartIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline'

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    // Subscribe to notification changes
    const unsubscribe = notificationService.subscribe((notifications) => {
      const count = notifications.filter(n => !n.read).length
      setUnreadCount(count)
    })

    return () => unsubscribe()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <nav className="bg-white shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <ShoppingBagIcon className="h-8 w-8 text-primary-600" />
            <span className="text-2xl font-bold text-gradient">Quicksell</span>
          </Link>

          {/* Spacer */}
          <div className="hidden md:flex flex-1"></div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <Link to="/products" className="text-gray-700 hover:text-primary-600 transition-colors">
              Browse
            </Link>

            {isAuthenticated ? (
              <>
                {/* Show Create Auction for sellers and admins */}
                {(user?.role === 'admin' || user?.role === 'seller') && (
                  <Link to="/create-auction" className="text-gray-700 hover:text-primary-600 transition-colors" title="Create Auction">
                    <PlusCircleIcon className="h-6 w-6" />
                  </Link>
                )}
                <Link to="/wishlist" className="text-gray-700 hover:text-primary-600 transition-colors" title="Wishlist">
                  <HeartIcon className="h-6 w-6" />
                </Link>
                <Link to="/notifications" className="text-gray-700 hover:text-primary-600 transition-colors relative">
                  <BellIcon className="h-6 w-6" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>

                {/* User Menu */}
                <Menu as="div" className="relative">
                  <Menu.Button className="flex items-center space-x-2 text-gray-700 hover:text-primary-600">
                    <div className="h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center">
                      {user?.avatar ? (
                        <img src={user.avatar} alt={user.username} className="h-8 w-8 rounded-full" />
                      ) : (
                        <UserIcon className="h-5 w-5 text-primary-600" />
                      )}
                    </div>
                    <span className="font-medium max-w-[100px] truncate">{user?.username}</span>
                    <ChevronDownIcon className="h-4 w-4" />
                  </Menu.Button>

                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-50">
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/dashboard"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Dashboard
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/profile"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Profile
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/my-bids"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            My Bids
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/orders"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Orders
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/wallet"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Wallet
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/affiliate"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Invite & Earn
                          </Link>
                        )}
                      </Menu.Item>
                      {user?.role !== 'admin' && user?.role !== 'seller' && (
                        <Menu.Item>
                          {({ active }) => (
                            <Link
                              to="/kyc"
                              className={`${
                                active ? 'bg-gray-100' : ''
                              } block px-4 py-2 text-sm text-gray-700`}
                            >
                              KYC Verification
                            </Link>
                          )}
                        </Menu.Item>
                      )}
                      {user?.role !== 'admin' && user?.role !== 'seller' && (
                        <Menu.Item>
                          {({ active }) => (
                            <Link
                              to="/become-seller"
                              className={`${
                                active ? 'bg-gray-100' : ''
                              } block px-4 py-2 text-sm text-primary-700 font-medium`}
                            >
                              Become a Seller
                            </Link>
                          )}
                        </Menu.Item>
                      )}
                      {(user?.role === 'seller' || user?.role === 'admin') && (
                        <>
                          <div className="border-t border-gray-200 my-2"></div>
                          {user?.role === 'seller' && (
                            <>
                              <Menu.Item>
                                {({ active }) => (
                                  <Link
                                    to="/seller/dashboard"
                                    className={`${
                                      active ? 'bg-gray-100' : ''
                                    } block px-4 py-2 text-sm text-primary-700 font-medium`}
                                  >
                                    Seller Dashboard
                                  </Link>
                                )}
                              </Menu.Item>
                              <Menu.Item>
                                {({ active }) => (
                                  <Link
                                    to="/my-auctions"
                                    className={`${
                                      active ? 'bg-gray-100' : ''
                                    } block px-4 py-2 text-sm text-gray-700`}
                                  >
                                    My Listings
                                  </Link>
                                )}
                              </Menu.Item>
                            </>
                          )}
                          {user?.role === 'admin' && (
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  to="/admin/dashboard"
                                  className={`${
                                    active ? 'bg-gray-100' : ''
                                  } block px-4 py-2 text-sm text-gray-700`}
                                >
                                  Admin Panel
                                </Link>
                              )}
                            </Menu.Item>
                          )}
                        </>
                      )}
                      <div className="border-t border-gray-200 my-2"></div>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={handleLogout}
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block w-full text-left px-4 py-2 text-sm text-gray-700`}
                          >
                            Logout
                          </button>
                        )}
                      </Menu.Item>
                    </Menu.Items>
                  </Transition>
                </Menu>

                {/* Balance */}
                <div className="bg-primary-50 px-3 py-1 rounded-lg">
                  <span className="text-sm font-medium text-primary-700">
                    R{user?.balance?.toFixed(2) || '0.00'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-700 hover:text-primary-600 transition-colors">
                  Login
                </Link>
                <Link to="/register" className="btn-primary">
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2"
          >
            {mobileMenuOpen ? (
              <XMarkIcon className="h-6 w-6 text-gray-700" />
            ) : (
              <Bars3Icon className="h-6 w-6 text-gray-700" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <div className="space-y-1">
              <Link to="/products" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                Browse Products
              </Link>
              {isAuthenticated ? (
                <>
                  <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                    Dashboard
                  </Link>
                  <Link to="/create-auction" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                    Create Auction
                  </Link>
                  <Link to="/my-bids" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                    My Bids
                  </Link>
                  <Link to="/wallet" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                    Wallet
                  </Link>
                  <Link to="/wishlist" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                    Wishlist
                  </Link>
                  <Link to="/notifications" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                    Notifications
                  </Link>
                  {user?.role !== 'admin' && (
                    <Link to="/kyc" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                      KYC Verification
                    </Link>
                  )}
                  <button
                    onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                    className="block w-full text-left py-3 text-gray-700"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                    Login
                  </Link>
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-gray-700">
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navbar