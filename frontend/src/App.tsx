import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './store/authStore'
import { useAuthPersistence } from './hooks/useAuthPersistence'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import LoadingSpinner from './components/LoadingSpinner'
import './config/axios' // Initialize axios configuration
import './styles/responsive.css' // Responsive utilities

// Pages
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import CreateAuction from './pages/CreateAuction'
import EditProduct from './pages/EditProduct'
import MyBids from './pages/MyBids'
import MyAuctions from './pages/MyAuctions'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Wishlist from './pages/Wishlist'
import Notifications from './pages/Notifications'
import Affiliate from './pages/Affiliate'
import Checkout from './pages/Checkout'
import Withdrawals from './pages/Withdrawals'
import Wallet from './pages/Wallet'
import PaymentSuccess from './pages/PaymentSuccess'
import PaymentCancel from './pages/PaymentCancel'
import AddProducts from './pages/AddProducts'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminProducts from './pages/admin/AdminProducts'
import AdminOrders from './pages/admin/AdminOrders'
import AdminCategories from './pages/admin/AdminCategories'
import AdminReports from './pages/admin/AdminReports'
import AdminPayments from './pages/admin/AdminPayments'
import AdminNotifications from './pages/admin/AdminNotifications'
import AdminSettings from './pages/admin/AdminSettings'
import AdminWithdrawals from './pages/admin/AdminWithdrawals'
import AdminShipping from './pages/admin/AdminShipping'
import AdminKYC from './pages/admin/AdminKYC'
import AdminBids from './pages/admin/AdminBids'
import AcceptInvite from './pages/AcceptInvite'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import KYCVerification from './pages/KYCVerification'
import Terms from './pages/Terms'
import FAQ from './pages/FAQ'
import Privacy from './pages/Privacy'
import Help from './pages/Help'
import NotFound from './pages/NotFound'
import BecomeSeller from './pages/BecomeSeller'
import AdminSellerApplications from './pages/admin/AdminSellerApplications'
import AdminSellers from './pages/admin/AdminSellers'
import AdminSellerDetail from './pages/admin/AdminSellerDetail'
import AdminAffiliates from './pages/admin/AdminAffiliates'
import AdminAffiliateDetail from './pages/admin/AdminAffiliateDetail'
import SellerDashboard from './pages/seller/SellerDashboard'
import SellerSales from './pages/seller/SellerSales'
import SellerPayouts from './pages/seller/SellerPayouts'
import SellerStorefront from './pages/SellerStorefront'
import TraderootCallback from './pages/TraderootCallback'

function App() {
  const { initAuth, isLoading, isAuthenticated } = useAuthStore()
  const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(false)
  
  // Use auth persistence hook
  useAuthPersistence()

  useEffect(() => {
    // Initialize Firebase auth listener
    initAuth()
    // Mark as initialized after a short delay to ensure Firebase is ready
    setTimeout(() => setIsFirebaseInitialized(true), 100)
  }, [])

  // Only show loading spinner if we don't have auth from localStorage
  // and Firebase hasn't initialized yet
  if (!isFirebaseInitialized && isLoading && !isAuthenticated) {
    return <LoadingSpinner message="Initializing Quicksell..." />
  }

  return (
    <Routes>
      {/* Admin Routes - Separate from main layout */}
      <Route path="/admin/*" element={<AdminRoute />}>
        <Route index element={<Navigate to="dashboard" />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="products/create" element={<CreateAuction />} />
        <Route path="products/edit/:productId" element={<EditProduct />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="withdrawals" element={<AdminWithdrawals />} />
        <Route path="shipping" element={<AdminShipping />} />
        <Route path="bids" element={<AdminBids />} />
        <Route path="kyc" element={<AdminKYC />} />
        <Route path="seller-applications" element={<AdminSellerApplications />} />
        <Route path="sellers" element={<AdminSellers />} />
        <Route path="sellers/:sellerId" element={<AdminSellerDetail />} />
        <Route path="affiliates" element={<AdminAffiliates />} />
        <Route path="affiliates/:affiliateId" element={<AdminAffiliateDetail />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="add-products" element={<AddProducts />} />
      </Route>

      {/* Main App Routes with Layout */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="accept-invite" element={<AcceptInvite />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="terms" element={<Terms />} />
        <Route path="faq" element={<FAQ />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="help" element={<Help />} />
        <Route path="payment/success" element={<PaymentSuccess />} />
        <Route path="payment/cancel" element={<PaymentCancel />} />
        <Route path="payment/traderoot-callback" element={<TraderootCallback />} />
        <Route path="seller/:slugOrUserId" element={<SellerStorefront />} />
        
        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/:userId" element={<Profile />} />
          <Route path="create-auction" element={<CreateAuction />} />
          <Route path="products/edit/:productId" element={<EditProduct />} />
          <Route path="my-bids" element={<MyBids />} />
          <Route path="my-auctions" element={<MyAuctions />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="affiliate" element={<Affiliate />} />
          <Route path="withdrawals" element={<Withdrawals />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="kyc" element={<KYCVerification />} />
          <Route path="become-seller" element={<BecomeSeller />} />
          <Route path="seller/dashboard" element={<SellerDashboard />} />
          <Route path="seller/listings" element={<MyAuctions />} />
          <Route path="seller/sales" element={<SellerSales />} />
          <Route path="seller/payouts" element={<SellerPayouts />} />
        </Route>

        {/* 404 — any unknown path under the main layout shows a friendly page, not a blank screen */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default App