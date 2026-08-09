import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import axios from '../config/axios'
import toast from 'react-hot-toast'
import {
  validateBuyerShippingInfo,
  SAPO_MAX_NAME,
  SAPO_MAX_ADDRESS,
  SAPO_MAX_CITY
} from '../utils/sapoValidation'
import CitySelect from '../components/CitySelect'
import PargoPointPicker from '../components/PargoPointPicker'
import {
  CreditCardIcon,
  WalletIcon,
  TruckIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  UserIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  InformationCircleIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline'

interface ShippingInfo {
  fullName: string
  email: string
  phone: string
  address: string
  suburb: string
  city: string
  province: string
  postalCode: string
  country: string
}

interface CheckoutItem {
  productId: string
  title: string
  image: string
  price: number
  quantity?: number
  sellerId: string
  type: 'auction_win' | 'buy_now' | 'sale'
  shippingCost?: number
  orderId?: string
}

const Checkout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated } = useAuthStore()
  
  const [loading, setLoading] = useState(false)
  const [processingPayment, setProcessingPayment] = useState(false)
  const [checkoutItem, setCheckoutItem] = useState<CheckoutItem | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'addpay' | 'wallet' | 'traderoot'>('wallet')
  const [userBalance, setUserBalance] = useState(0)
  const [activeProvider, setActiveProvider] = useState<'sapo' | 'shiplogic' | 'rtt' | 'pargo'>('sapo')
  const [shipmentRate, setShipmentRate] = useState<{ provider: string; rateId: any; total: number; serviceLevel?: string } | null>(null)
  // Pargo (Click & Collect): the buyer-selected pickup point, when Pargo is the active courier.
  const [pargoPoint, setPargoPoint] = useState<{ code: string; name?: string; address?: string; city?: string; postalCode?: string; province?: string; lat?: number; lng?: number } | null>(null)
  const [quoting, setQuoting] = useState(false)
  // Captured once when the item loads, so a later live-quote override can't flip it.
  // A product the seller offers free (shippingCost 0) stays free even under ShipLogic.
  const [freeShipping, setFreeShipping] = useState(false)
  const [shippingInfo, setShippingInfo] = useState<ShippingInfo>({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    suburb: '',
    city: '',
    province: 'Gauteng',
    postalCode: '',
    country: 'South Africa'
  })

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error('Please login to continue')
      navigate('/login', { state: { from: '/checkout' } })
      return
    }

    // Get checkout data from location state
    if (!location.state?.item) {
      // Try to get product ID from URL params if available
      const urlParams = new URLSearchParams(window.location.search)
      const productId = urlParams.get('productId')
      
      if (productId) {
        // Redirect to product page to restart checkout process
        toast.error('Session expired. Please try again.')
        navigate(`/products/${productId}`)
      } else {
        toast.error('No item to checkout. Please select a product.')
        navigate('/products')
      }
      return
    }

    setCheckoutItem(location.state.item)
    // Seller offers free shipping when the item carries no shipping cost.
    setFreeShipping(!Number(location.state.item?.shippingCost))
    loadUserData()
    // Find out which courier is active so we know whether to fetch a live quote.
    axios.get('/api/shipping/active-provider')
      .then(r => {
        const p = r.data?.provider
        setActiveProvider((p === 'shiplogic' || p === 'rtt' || p === 'pargo') ? p : 'sapo')
      })
      .catch(() => setActiveProvider('sapo'))
  }, [isAuthenticated, location.state])

  // ShipLogic: fetch a live delivery quote once the shipping address is complete,
  // and use it as the shipping cost. SAPO keeps the seller-entered cost.
  // Free-shipping products are never live-quoted — they stay R0 (seller/platform
  // absorbs the courier fee, which is still charged when the shipment is created).
  useEffect(() => {
    if (activeProvider !== 'shiplogic' || !checkoutItem || freeShipping) return
    const { address, city, postalCode, province } = shippingInfo
    if (!address || !city || !postalCode) return
    let cancelled = false
    setQuoting(true)
    axios.post('/api/shipping/quote', {
      productId: checkoutItem.productId,
      quantity: checkoutItem.quantity || 1,
      deliveryAddress: { address, city, province, postalCode },
    })
      .then(r => {
        if (cancelled || !r.data?.success) return
        const d = r.data.data
        setShipmentRate({ provider: d.provider, rateId: d.rateId, total: d.total, serviceLevel: d.serviceLevel })
        setCheckoutItem(prev => prev ? { ...prev, shippingCost: Number(d.total) } : prev)
      })
      .catch(() => { /* keep existing cost on failure */ })
      .finally(() => { if (!cancelled) setQuoting(false) })
    return () => { cancelled = true }
  }, [activeProvider, freeShipping, checkoutItem?.productId, shippingInfo.address, shippingInfo.city, shippingInfo.postalCode, shippingInfo.province])

  const loadUserData = async () => {
    try {
      const response = await axios.get('/api/users/profile')
      if (response.data.success) {
        const userData = response.data.data
        
        // Pre-fill shipping info from user profile
        setShippingInfo(prev => ({
          ...prev,
          fullName: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
          email: userData.email || '',
          phone: userData.phone || '',
          address: userData.address || '',
          suburb: userData.suburb || '',
          city: userData.city || '',
          province: userData.province || 'Gauteng',
          postalCode: userData.postalCode || '',
          country: userData.country || 'South Africa'
        }))
        
        // Set user balance
        setUserBalance(userData.balance || 0)
      }
    } catch (error) {
      console.error('Error loading user data:', error)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setShippingInfo(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const validateShippingInfo = () => {
    // Email validation (all providers)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(shippingInfo.email)) {
      toast.error('Please enter a valid email address')
      return false
    }

    // Pargo (Click & Collect): only contact fields + a chosen pickup point are needed.
    if (activeProvider === 'pargo') {
      if (!shippingInfo.fullName || !shippingInfo.phone) {
        toast.error('Please fill in your name and phone number')
        return false
      }
      if (!pargoPoint || !pargoPoint.code) {
        toast.error('Please choose a Pargo pickup point')
        return false
      }
      return true
    }

    const required = ['fullName', 'email', 'phone', 'address', 'suburb', 'city', 'province', 'postalCode']
    for (const field of required) {
      if (!shippingInfo[field as keyof ShippingInfo]) {
        toast.error(`Please fill in ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
        return false
      }
    }

    // SAPO field validation (mirrors backend/utils/sapoValidation.js)
    const sapoCheck = validateBuyerShippingInfo(shippingInfo)
    if (!sapoCheck.valid && sapoCheck.errors) {
      const firstError = Object.values(sapoCheck.errors)[0]
      toast.error(firstError)
      return false
    }

    return true
  }

  const processPayment = async () => {
    if (!checkoutItem) return
    
    if (!validateShippingInfo()) {
      return
    }

    setProcessingPayment(true)

    // Calculate total with shipping
    const shippingCost = Number(checkoutItem.shippingCost || 0)
    const totalAmount = Number(checkoutItem.price) + shippingCost

    try {
      let orderId: string

      if (checkoutItem.orderId) {
        // Order already exists (e.g. from accepted bid) — update shipping info
        orderId = checkoutItem.orderId
        await axios.put(`/api/orders/${orderId}`, {
          shippingInfo,
          shippingCost: shippingCost,
          totalAmount: totalAmount,
          paymentMethod
        })
      } else {
        // Create a new order
        const orderResponse = await axios.post('/api/orders', {
          productId: checkoutItem.productId,
          type: checkoutItem.type,
          amount: checkoutItem.price,
          // Units for fixed-price 'sale' orders (defaults to 1 server-side otherwise)
          ...(checkoutItem.type === 'sale' ? { quantity: checkoutItem.quantity || 1 } : {}),
          // Carry the live ShipLogic rate so the shipment reuses it
          ...(shipmentRate ? { shipmentRate } : {}),
          shippingCost: shippingCost,
          totalAmount: totalAmount,
          shippingInfo,
          // Pargo Click & Collect: the selected pickup point + delivery method
          ...(activeProvider === 'pargo' && pargoPoint ? { deliveryMethod: 'pickup-point', pargoPoint } : {}),
          paymentMethod
        })

        if (!orderResponse.data.success) {
          throw new Error('Failed to create order')
        }

        orderId = orderResponse.data.data.id
      }

      // Process payment based on selected method
      if (paymentMethod === 'wallet') {
        // Check wallet balance (including shipping)
        if (userBalance < totalAmount) {
          toast.error('Insufficient wallet balance')
          return
        }

        // Process wallet payment
        const walletResponse = await axios.post('/api/payments/wallet', {
          orderId,
          amount: totalAmount
        })

        if (walletResponse.data.success) {
          toast.success('Payment successful!')
          navigate('/payment/success', { 
            state: { 
              orderId, 
              paymentMethod: 'wallet' 
            } 
          })
        } else {
          throw new Error('Wallet payment failed')
        }

      } else if (paymentMethod === 'addpay') {
        // Initialize AddPay payment
        const response = await axios.post('/api/payments/addpay/initialize', {
          amount: totalAmount,
          currency: 'ZAR',
          customerDetails: {
            email: shippingInfo.email,
            name: shippingInfo.fullName,
            phoneNumber: shippingInfo.phone
          },
          metadata: {
            orderId,
            productId: checkoutItem.productId,
            productTitle: checkoutItem.title
          }
        })

        if (response.data.success && response.data.data?.paymentUrl) {
          window.location.href = response.data.data.paymentUrl
        } else {
          toast.error('Failed to initialize AddPay payment')
        }

      } else if (paymentMethod === 'traderoot') {
        // Traderoot card payment — single hosted page does card entry + 3-D Secure + settlement.
        const { initializeTraderoot } = await import('../services/traderootService')
        const initResult = await initializeTraderoot(orderId)
        if (initResult.success && initResult.paymentUrl) {
          window.location.href = initResult.paymentUrl
        } else {
          toast.error(initResult.error || 'Failed to start card payment')
        }
      }

    } catch (error: any) {
      console.error('Payment error:', error)
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Payment processing failed')
    } finally {
      setProcessingPayment(false)
    }
  }

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR'
    }).format(amount)
  }

  if (!checkoutItem) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const provinces = [
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <button
            onClick={() => {
              if (checkoutItem?.productId) {
                navigate(`/products/${checkoutItem.productId}`)
              } else {
                navigate('/products')
              }
            }}
            className="mr-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Checkout</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
        {/* Left Column - Shipping & Payment */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Shipping Information */}
          <div className="card">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6 flex items-center">
              <TruckIcon className="h-6 w-6 mr-2 text-primary-600" />
              Shipping Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <UserIcon className="inline h-4 w-4 mr-1" />
                  Full Name *
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={shippingInfo.fullName}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="John Doe"
                  required
                  maxLength={SAPO_MAX_NAME}
                />
                <p className="mt-1 text-xs text-gray-500">{shippingInfo.fullName.length}/{SAPO_MAX_NAME} characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <EnvelopeIcon className="inline h-4 w-4 mr-1" />
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={shippingInfo.email}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="john@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <PhoneIcon className="inline h-4 w-4 mr-1" />
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={shippingInfo.phone}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="+27 82 123 4567"
                  required
                />
              </div>

              {activeProvider === 'pargo' && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <MapPinIcon className="inline h-4 w-4 mr-1" />
                    Pargo pickup point *
                  </label>
                  <PargoPointPicker
                    selected={pargoPoint}
                    onSelect={setPargoPoint}
                    address={[shippingInfo.city, shippingInfo.province].filter(Boolean).join(', ')}
                  />
                  <p className="mt-1 text-xs text-gray-500">Your parcel will be delivered to this Pargo point for you to collect.</p>
                </div>
              )}

              {activeProvider !== 'pargo' && (<>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <MapPinIcon className="inline h-4 w-4 mr-1" />
                  Postal Code *
                </label>
                <input
                  type="text"
                  name="postalCode"
                  value={shippingInfo.postalCode}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="2000"
                  required
                  maxLength={4}
                  pattern="\d{4}"
                  inputMode="numeric"
                />
                <p className="mt-1 text-xs text-gray-500">4 digits</p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address *
                </label>
                <input
                  type="text"
                  name="address"
                  value={shippingInfo.address}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="123 Main Street, Apartment 4B"
                  required
                  maxLength={SAPO_MAX_ADDRESS}
                />
                <p className="mt-1 text-xs text-gray-500">{shippingInfo.address.length}/{SAPO_MAX_ADDRESS} characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Suburb *
                </label>
                <input
                  type="text"
                  name="suburb"
                  value={shippingInfo.suburb}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="e.g. Rondebosch"
                  required
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City *
                </label>
                <CitySelect
                  value={shippingInfo.city}
                  onChange={(city) => setShippingInfo(prev => ({ ...prev, city }))}
                />
                <p className="mt-1 text-xs text-gray-500">Type to search. We currently deliver in these cities only.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Province *
                </label>
                <select
                  name="province"
                  value={shippingInfo.province}
                  onChange={handleInputChange}
                  className="input"
                  required
                >
                  {provinces.map(province => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  name="country"
                  value={shippingInfo.country}
                  className="input bg-gray-100"
                  disabled
                />
              </div>
              </>)}
            </div>
          </div>

          {/* Payment Method */}
          <div className="card">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6 flex items-center">
              <CreditCardIcon className="h-6 w-6 mr-2 text-primary-600" />
              Payment Method
            </h2>

            <div className="space-y-3">
              {/* Wallet Option */}
              <label className="relative flex flex-col sm:flex-row items-start p-3 sm:p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="wallet"
                  checked={paymentMethod === 'wallet'}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="mt-1"
                />
                <div className="ml-0 sm:ml-3 mt-2 sm:mt-0 flex-1 w-full">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        <WalletIcon className="h-5 w-5 mr-2 text-green-600" />
                        Wallet Balance
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Pay instantly from your account balance
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Available:</p>
                      <p className={`font-semibold ${userBalance >= (Number(checkoutItem?.price || 0) + Number(checkoutItem?.shippingCost || 0)) ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPrice(userBalance)}
                      </p>
                    </div>
                  </div>
                  {paymentMethod === 'wallet' && userBalance < (Number(checkoutItem?.price || 0) + Number(checkoutItem?.shippingCost || 0)) && (
                    <div className="mt-2 p-2 bg-red-50 text-red-700 text-xs sm:text-sm rounded-md flex items-center">
                      <InformationCircleIcon className="h-4 w-4 mr-1" />
                      Insufficient balance. Please choose another payment method.
                    </div>
                  )}
                </div>
              </label>

              {/* AddPay Option */}
              <label className="relative flex flex-col sm:flex-row items-start p-3 sm:p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="addpay"
                  checked={paymentMethod === 'addpay'}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="mt-1"
                />
                <div className="ml-0 sm:ml-3 mt-2 sm:mt-0 flex-1 w-full">
                  <div className="font-medium text-gray-900">
                    <CreditCardIcon className="inline h-5 w-5 mr-2 text-blue-600" />
                    AddPay
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Visa, Mastercard, 3D Secure (South Africa)
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">Visa</span>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">Mastercard</span>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">3D Secure</span>
                  </div>
                </div>
              </label>

              {/* Traderoot Card Payment Option */}
              <label className="relative flex flex-col sm:flex-row items-start p-3 sm:p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="traderoot"
                  checked={paymentMethod === 'traderoot'}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="mt-1"
                />
                <div className="ml-0 sm:ml-3 mt-2 sm:mt-0 flex-1 w-full">
                  <div className="font-medium text-gray-900">
                    <CreditCardIcon className="inline h-5 w-5 mr-2 text-indigo-600" />
                    Traderoot
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Enter your card on Traderoot's secure 3D Secure page
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">Visa</span>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">Mastercard</span>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">3D Secure</span>
                  </div>

                  {paymentMethod === 'traderoot' && (
                    <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded-md mt-3">
                      You'll be securely redirected to Traderoot to enter your card and complete 3D Secure.
                    </p>
                  )}
                </div>
              </label>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-start">
              <ShieldCheckIcon className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold">Secure Payment</p>
                <p>Your payment information is encrypted and secure. We never store your card details.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Order Summary */}
        <div>
          <div className="card sticky top-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Order Summary
            </h2>

            {/* Item */}
            <div className="flex space-x-2 sm:space-x-4 pb-4 border-b">
              <img
                src={checkoutItem.image}
                alt={checkoutItem.title}
                className="w-20 h-20 object-cover rounded-lg"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900">{checkoutItem.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {checkoutItem.type === 'auction_win' ? 'Auction Win' : 'Buy Now'}
                </p>
                <p className="text-sm font-semibold text-primary-600 mt-2">
                  {formatPrice(checkoutItem.price)}
                </p>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="space-y-3 py-4 border-b">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatPrice(checkoutItem.price)}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className="font-medium">
                  {(checkoutItem.shippingCost || 0) > 0 ? formatPrice(checkoutItem.shippingCost || 0) : 'Free'}
                </span>
              </div>
            </div>

            {/* Total */}
            <div className="py-4">
              <div className="flex justify-between text-base sm:text-lg font-semibold">
                <span>Total</span>
                <span className="text-primary-600">
                  {formatPrice(Number(checkoutItem.price) + Number(checkoutItem.shippingCost || 0))}
                </span>
              </div>
            </div>

            {/* Checkout Button */}
            <button
              onClick={processPayment}
              disabled={processingPayment || (paymentMethod === 'wallet' && userBalance < (Number(checkoutItem.price) + Number(checkoutItem.shippingCost || 0)))}
              className={`w-full btn-primary flex items-center justify-center ${
                processingPayment || (paymentMethod === 'wallet' && userBalance < (Number(checkoutItem.price) + Number(checkoutItem.shippingCost || 0)))
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
            >
              {processingPayment ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  Complete Purchase
                </>
              )}
            </button>

            {/* Security Badge */}
            <div className="mt-4 text-center">
              <div className="flex items-center justify-center text-xs text-gray-500">
                <ShieldCheckIcon className="h-4 w-4 mr-1" />
                Secured by SSL Encryption
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default Checkout