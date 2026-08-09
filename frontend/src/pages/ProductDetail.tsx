import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { useAuthStore } from '../store/authStore'
import axios from '../config/axios'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import ImageGallery from 'react-image-gallery'
import Countdown from 'react-countdown'
import createSocket from '../config/socket'
import BiddingSection from '../components/BiddingSection'
import LiveAuctionRegistrationModal from '../components/LiveAuctionRegistrationModal'
import auctionRegistrationService from '../services/auctionRegistrationService'
import questionService from '../services/questionService'
import { getWatchlist, getUserProfile } from '../services/userService'
import { SUPPORTED_CITIES } from '../config/cities'
import { ChatBubbleLeftIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import {
  HeartIcon,
  ShareIcon,
  ShieldCheckIcon,
  TruckIcon,
  ArrowPathIcon,
  UserIcon,
  StarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  MapPinIcon
} from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid'
import 'react-image-gallery/styles/css/image-gallery.css'

interface BidForm {
  amount: number
}

// City restriction (temporary, until nationwide courier).
const normalizeCity = (c?: string) => String(c || '').toLowerCase().trim().replace(/\s+/g, ' ')

const ProductDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const [product, setProduct] = useState<any>(null)
  const [bids, setBids] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [activeTab, setActiveTab] = useState('description')
  const [socket, setSocket] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [reviewStats, setReviewStats] = useState<any>({ averageRating: 0, total: 0, distribution: {} })
  const [reviewsLoading, setReviewsLoading] = useState(false)

  // Questions state
  const [questions, setQuestions] = useState<any[]>([])
  const [newQuestion, setNewQuestion] = useState('')
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [submittingQuestion, setSubmittingQuestion] = useState(false)
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')

  // Live auction registration state
  const [showRegistrationModal, setShowRegistrationModal] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)

  // City restriction state (temporary, until nationwide courier)
  const [buyerCity, setBuyerCity] = useState<string>('')
  const [saleQty, setSaleQty] = useState(1)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm<BidForm>()

  // Fetch buyer's profile city for the city-restriction gate
  useEffect(() => {
    if (!isAuthenticated) {
      setBuyerCity('')
      return
    }
    getUserProfile()
      .then((res: any) => setBuyerCity(res?.data?.city || ''))
      .catch(() => setBuyerCity(''))
  }, [isAuthenticated])

  // Derived: is this buyer blocked from this product on city grounds?
  // City is stored as shipping.pickupCity (nested) or a "City, Province" location
  // string — not a top-level pickupCity. Resolve from any of those.
  const resolveProductCity = (p: any): string => {
    if (!p) return ''
    if (p.pickupCity) return p.pickupCity
    if (p.shipping?.pickupCity) return p.shipping.pickupCity
    if (p.location && normalizeCity(p.location) !== 'south africa') {
      return String(p.location).split(',')[0].trim()
    }
    return ''
  }
  const productCity = resolveProductCity(product)
  const cityBlocked = Boolean(
    productCity && buyerCity && normalizeCity(productCity) !== normalizeCity(buyerCity)
  )

  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 2;
    
    const fetchWithRetry = async () => {
      if (!mounted) return;
      
      try {
        await fetchProduct();
      } catch (error) {
        if (retryCount < maxRetries && mounted) {
          retryCount++;
          console.log(`Retrying product fetch (${retryCount}/${maxRetries})...`);
          setTimeout(() => fetchWithRetry(), 1000 * retryCount);
        }
      }
    };
    
    fetchWithRetry();
    
    // Connect to socket for real-time updates
    const newSocket = createSocket()
    setSocket(newSocket)
    
    if (id && id !== 'undefined' && id !== 'null') {
      newSocket.emit('join-auction', id)
      
      newSocket.on('new-bid', (bidData: any) => {
        if (mounted) {
          setProduct((prev: any) => ({
            ...prev,
            currentPrice: bidData.amount,
            totalBids: prev.totalBids + 1
          }))
          setBids((prev) => [bidData, ...prev])
          toast.success(`New bid placed: R${bidData.amount}`)
        }
      })
    }
    
    return () => {
      mounted = false;
      newSocket.close()
    }
  }, [id])

  const fetchProduct = async () => {
    // Validate product ID
    if (!id || id === 'undefined' || id === 'null') {
      console.error('Invalid product ID:', id)
      toast.error('Invalid product ID')
      navigate('/products')
      return
    }

    try {
      setLoading(true)
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await axios.get(`/api/products/${id}`, {
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      // Validate response
      if (!response.data || (!response.data.data && !response.data.product)) {
        throw new Error('Invalid response format')
      }
      
      const productData = response.data.data || response.data.product || response.data

      // Process Firebase timestamp format
      const processedProduct = {
        ...productData,
        id: productData.id || id, // Ensure ID is always set
        endDate: productData.endDate?._seconds 
          ? new Date(productData.endDate._seconds * 1000) 
          : new Date(productData.endDate),
        startDate: productData.startDate?._seconds 
          ? new Date(productData.startDate._seconds * 1000) 
          : new Date(productData.startDate),
        seller: productData.seller || {
          username: productData.sellerName || 'Unknown',
          verified: productData.verified || false,
          ratings: {
            average: productData.averageRating || 0,
            count: productData.reviewCount || 0
          }
        },
        images: Array.isArray(productData.images) 
          ? productData.images.map((img: any) => typeof img === 'string' ? img : img.url)
          : [productData.images].filter(Boolean),
        category: productData.category ? { name: productData.category } : null,
        totalBids: productData.totalBids || 0,
        uniqueBidders: productData.uniqueBidders || 0,
        views: productData.views || 0,
        incrementAmount: productData.incrementAmount || 100,
        shipping: productData.shipping || {
          cost: productData.shippingCost || productData.shipping?.cost || 0,
          location: productData.shipping?.location || productData.location || 'South Africa'
        },
        shippingCost: productData.shippingCost || productData.shipping?.cost || 0
      }

      setProduct(processedProduct)
      setBids(response.data.bids || [])
      setLoading(false)
    } catch (error: any) {
      console.error('Error fetching product:', error)
      setLoading(false)
      
      // Handle specific error cases
      if (error.name === 'AbortError') {
        toast.error('Request timed out. Please try again.')
        throw error; // Allow retry
      } else if (error.response?.status === 404) {
        toast.error('Product not found')
        setTimeout(() => navigate('/products'), 2000)
      } else if (error.response?.status === 400) {
        toast.error('Invalid product ID')
        setTimeout(() => navigate('/products'), 2000)
      } else if (error.code === 'ERR_NETWORK') {
        toast.error('Network error. Please check your connection.')
        throw error; // Allow retry
      } else {
        toast.error('Failed to load product. Please try again.')
        throw error; // Allow retry
      }
    }
  }

  const onSubmit = async (data: BidForm) => {
    if (!isAuthenticated) {
      toast.error('Please login to place a bid')
      navigate('/login')
      return
    }

    // City restriction (temporary): block bidding for out-of-city buyers
    if (cityBlocked) {
      toast.error(`You can only bid on products available in ${productCity}`)
      return
    }

    // Check if live auction registration is required
    if (product?.isLiveAuction && !isRegistered) {
      setShowRegistrationModal(true)
      return
    }

    try {
      await axios.post('/api/bids', {
        productId: id,
        amount: data.amount
      })

      toast.success('Bid placed successfully!')
      fetchProduct()
    } catch (error: any) {
      // Handle live auction registration requirement
      if (error.response?.data?.requiresRegistration) {
        setShowRegistrationModal(true)
      } else if (error.response?.data?.requiresCity) {
        toast.error('Set your city in your profile to bid on this product')
        navigate('/profile')
      } else {
        toast.error(error.response?.data?.error || 'Failed to place bid')
      }
    }
  }

  const handleRegistrationSuccess = () => {
    setIsRegistered(true)
    toast.success('You can now place bids on this auction!')
  }

  const handleBuyNow = () => {
    if (!isAuthenticated) {
      toast.error('Please login to buy now')
      navigate('/login')
      return
    }

    // City restriction (temporary): block buying for out-of-city buyers
    if (cityBlocked) {
      toast.error(`This product is only available for delivery in ${productCity}. Nationwide delivery is coming soon.`)
      return
    }

    // Check if this is a live auction and user is not registered
    if (product?.isLiveAuction && !isRegistered) {
      setShowRegistrationModal(true)
      return
    }

    const amount = product.buyNowPrice || product.currentPrice

    // Navigate to checkout page with product details
    const productId = product.id || id
    const shippingCost = product.shippingCost || product.shipping?.cost || 0
    navigate(`/checkout?productId=${productId}`, {
      state: {
        item: {
          productId: productId,
          title: product.title,
          image: product.images?.[0] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD4KPC9zdmc+',
          price: amount,
          sellerId: product.sellerId || product.seller?.id,
          type: 'buy_now',
          shippingCost: shippingCost
        }
      }
    })
  }

  const handleSaleBuy = () => {
    if (!isAuthenticated) {
      toast.error('Please login to buy')
      navigate('/login')
      return
    }
    if (cityBlocked) {
      toast.error(`This product is only available for delivery in ${productCity}. Nationwide delivery is coming soon.`)
      return
    }

    const unlimited = product.stockType === 'unlimited'
    const remaining = Math.max(0, Number(product.quantity || 0) - Number(product.soldQuantity || 0))
    const qty = unlimited ? Math.max(1, saleQty) : Math.max(1, Math.min(saleQty, remaining))
    if (unlimited ? product.status === 'sold' : remaining < 1) {
      toast.error('This product is out of stock')
      return
    }

    const unitPrice = Number(product.price || product.currentPrice || 0)
    const productId = product.id || id
    const shippingCost = product.shippingCost || product.shipping?.cost || 0
    navigate(`/checkout?productId=${productId}`, {
      state: {
        item: {
          productId: productId,
          title: product.title,
          image: product.images?.[0] || '',
          price: unitPrice * qty,
          quantity: qty,
          sellerId: product.sellerId || product.seller?.id,
          type: 'sale',
          shippingCost: shippingCost
        }
      }
    })
  }

  const handleWishlist = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to add to wishlist')
      return
    }

    try {
      const response = await axios.post(`/api/users/watchlist/${id}`)
      const added = response.data?.added ?? !isWishlisted
      setIsWishlisted(added)
      toast.success(added ? 'Added to wishlist' : 'Removed from wishlist')
    } catch (error) {
      toast.error('Failed to update wishlist')
    }
  }

  const fetchReviews = async () => {
    if (!id || id === 'undefined' || id === 'null') return

    try {
      setReviewsLoading(true)
      const response = await axios.get(`/api/reviews/product/${id}`)
      if (response.data.success) {
        setReviews(response.data.data.reviews || [])
        setReviewStats({
          averageRating: response.data.data.averageRating || 0,
          total: response.data.data.total || 0,
          distribution: response.data.data.distribution || {}
        })
      }
    } catch (error) {
      console.error('Error fetching reviews:', error)
    } finally {
      setReviewsLoading(false)
    }
  }

  const handleShare = async () => {
    const url = window.location.href
    const title = product?.title || 'Check out this product'
    const text = product?.description?.slice(0, 100) || 'Check out this product on QuickSell'

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied to clipboard!')
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url)
          toast.success('Link copied to clipboard!')
        } catch {
          toast.error('Failed to share')
        }
      }
    }
  }

  const fetchQuestions = async () => {
    if (!id || id === 'undefined' || id === 'null') return

    try {
      setLoadingQuestions(true)
      const data = await questionService.getProductQuestions(id)
      setQuestions(data)
    } catch (error) {
      console.error('Error fetching questions:', error)
    } finally {
      setLoadingQuestions(false)
    }
  }

  const handleAskQuestion = async () => {
    if (!newQuestion.trim()) {
      toast.error('Please enter a question')
      return
    }

    if (!isAuthenticated) {
      toast.error('Please login to ask a question')
      return
    }

    try {
      setSubmittingQuestion(true)
      await questionService.askQuestion(id!, newQuestion)
      toast.success('Question submitted successfully!')
      setNewQuestion('')
      fetchQuestions()
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit question')
    } finally {
      setSubmittingQuestion(false)
    }
  }

  const handleAnswerQuestion = async (questionId: string) => {
    if (!answerText.trim()) {
      toast.error('Please enter an answer')
      return
    }

    try {
      await questionService.answerQuestion(questionId, answerText)
      toast.success('Answer submitted successfully!')
      setAnsweringQuestionId(null)
      setAnswerText('')
      fetchQuestions()
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit answer')
    }
  }

  // Load wishlist state on mount
  useEffect(() => {
    const loadWishlistState = async () => {
      if (!isAuthenticated || !id) return
      try {
        const response = await getWatchlist()
        const watchlist = response.data || response.watchlist || response || []
        const items = Array.isArray(watchlist) ? watchlist : []
        const found = items.some((item: any) => item.productId === id || item.id === id)
        setIsWishlisted(found)
      } catch (error) {
        console.error('Error loading watchlist:', error)
      }
    }
    loadWishlistState()
  }, [isAuthenticated, id])

  // Fetch reviews when reviews tab is selected
  useEffect(() => {
    if (activeTab === 'reviews' && reviews.length === 0 && !reviewsLoading) {
      fetchReviews()
    }
  }, [activeTab])

  // Fetch questions when questions tab is selected
  useEffect(() => {
    if (activeTab === 'questions' && questions.length === 0 && !loadingQuestions) {
      fetchQuestions()
    }
  }, [activeTab])

  // Check registration status for live auctions
  useEffect(() => {
    const checkRegistration = async () => {
      if (product?.isLiveAuction && isAuthenticated && user?.uid) {
        try {
          const registeredUsers = product.registeredUsers || []
          if (registeredUsers.includes(user.uid)) {
            setIsRegistered(true)
          } else {
            const status = await auctionRegistrationService.checkRegistration(product.id)
            setIsRegistered(status.isRegistered)
          }
        } catch (error) {
          console.error('Error checking registration:', error)
          const registeredUsers = product?.registeredUsers || []
          setIsRegistered(registeredUsers.includes(user?.uid))
        }
      }
    }
    checkRegistration()
  }, [product?.isLiveAuction, product?.id, isAuthenticated, user?.uid])

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Product not found</h2>
      </div>
    )
  }

  const images = product.images?.map((img: string) => ({
    original: img,
    thumbnail: img,
    description: product.title
  })) || []

  const isScheduled = product.status === 'scheduled'
  const scheduledStartTime = product.scheduledStartTime
    ? new Date(product.scheduledStartTime?._seconds ? product.scheduledStartTime._seconds * 1000 : product.scheduledStartTime)
    : null
  const isAuctionEnded = !isScheduled && new Date(product.endDate) < new Date()
  const minimumBid = Number(product.currentPrice || 0) + Number(product.incrementAmount || 0)

  // Fixed-price ("for sale") product: no bidding, has stock.
  const isSale = product.listingType === 'sale'
  // "Always available" products have no quantity cap; they're out of stock only when
  // a seller/admin marks them out (status 'sold'). Limited products run out at 0.
  const isUnlimitedStock = isSale && product.stockType === 'unlimited'
  const salePrice = Number(product.price || product.currentPrice || 0)
  const stockRemaining = Math.max(0, Number(product.quantity || 0) - Number(product.soldQuantity || 0))
  const soldOut = isSale && (isUnlimitedStock ? product.status === 'sold' : stockRemaining <= 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="max-w-7xl mx-auto"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        {/* Image Gallery */}
        <div>
          {images.length > 0 ? (
            <ImageGallery 
              items={images}
              showPlayButton={false}
              showFullscreenButton={true}
            />
          ) : (
            <div className="aspect-square bg-gray-200 rounded-lg flex items-center justify-center">
              <span className="text-gray-400">No images available</span>
            </div>
          )}

          {/* Seller Info */}
          <div className="card mt-6">
            <h3 className="font-semibold text-gray-900 mb-4">Seller Information</h3>
            <Link
              to={`/seller/${product.seller?.slug || product.sellerId || product.seller?.id || product.seller?._id}`}
              className="flex items-center space-x-3 sm:space-x-4 group"
            >
              <div className="h-12 w-12 bg-primary-100 rounded-full flex items-center justify-center">
                {product.seller?.avatar ? (
                  <img src={product.seller.avatar} alt={product.seller.username} className="h-12 w-12 rounded-full" />
                ) : (
                  <UserIcon className="h-6 w-6 text-primary-600" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900 group-hover:text-primary-600">
                  {product.seller?.businessName || product.seller?.username}
                </p>
                <div className="flex items-center mt-1">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(product.seller?.ratings?.average || product.seller?.averageRating || 0)
                          ? 'text-yellow-400 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-sm text-gray-500">
                    ({product.seller?.ratings?.count || product.seller?.ratingCount || 0} reviews)
                  </span>
                </div>
                <p className="text-xs text-primary-600 mt-1 group-hover:underline">View Storefront →</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Product Info & Bidding */}
        <div className="space-y-6">
          {/* Title and Actions */}
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{product.title}</h1>
              <div className="flex space-x-2 w-full sm:w-auto">
                <button
                  onClick={handleWishlist}
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  {isWishlisted ? (
                    <HeartSolidIcon className="h-6 w-6 text-red-500" />
                  ) : (
                    <HeartIcon className="h-6 w-6 text-gray-400" />
                  )}
                </button>
                <button onClick={handleShare} className="p-2 rounded-full hover:bg-gray-100">
                  <ShareIcon className="h-6 w-6 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-gray-500">
              <span className="badge bg-gray-100 text-gray-700">
                {product.category?.name}
              </span>
              <span>Condition: {product.condition}</span>
              <span>{product.views} views</span>
            </div>
          </div>

          {/* Coming Soon - Scheduled Auction */}
          {isScheduled && scheduledStartTime && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-900">Coming Soon</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-sm text-blue-700">Goes live in:</span>
                  <Countdown
                    date={scheduledStartTime}
                    renderer={({ days, hours, minutes, seconds }) => (
                      <span className="text-2xl font-bold text-blue-600">
                        {days}d {hours}h {minutes}m {seconds}s
                      </span>
                    )}
                  />
                </div>
                <p className="text-sm text-blue-600">
                  This auction is scheduled to go live on{' '}
                  <strong>
                    {scheduledStartTime.toLocaleDateString('en-ZA', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}{' '}
                    at{' '}
                    {scheduledStartTime.toLocaleTimeString('en-ZA', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </strong>
                  . You will be notified when bidding opens.
                </p>
              </div>
            </div>
          )}

          {/* Auction Timer (auctions only) */}
          {!isSale && !isAuctionEnded && !isScheduled && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <ClockIcon className="h-5 w-5 text-red-600" />
                  <span className="font-semibold text-red-900">Time Remaining:</span>
                </div>
                <Countdown
                  date={new Date(product.endDate)}
                  renderer={({ days, hours, minutes, seconds }) => (
                    <span className="text-2xl font-bold text-red-600">
                      {days}d {hours}h {minutes}m {seconds}s
                    </span>
                  )}
                />
              </div>
            </div>
          )}

          {/* Bidding / Purchase Section */}
          <div className="card">
            <div className="space-y-4">
              {/* Fixed-price (For Sale) panel */}
              {isSale && (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-500">Price</div>
                    <div className="text-4xl font-bold text-primary-600">
                      R{salePrice.toLocaleString()}
                    </div>
                    <div className={`text-sm mt-1 font-medium ${soldOut ? 'text-red-600' : 'text-green-600'}`}>
                      {soldOut ? 'Out of stock' : (isUnlimitedStock ? 'In stock' : `In stock: ${stockRemaining}`)}
                    </div>
                  </div>

                  {!soldOut && user?.id !== product.seller?._id && (
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                        <input
                          type="number"
                          min={1}
                          max={isUnlimitedStock ? undefined : stockRemaining}
                          value={saleQty}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10) || 1
                            setSaleQty(isUnlimitedStock ? Math.max(1, v) : Math.max(1, Math.min(v, stockRemaining)))
                          }}
                          disabled={cityBlocked}
                          className="input-field w-24 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      <button
                        onClick={handleSaleBuy}
                        disabled={cityBlocked}
                        className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Buy Now — R{(salePrice * (isUnlimitedStock ? Math.max(1, saleQty) : Math.max(1, Math.min(saleQty, stockRemaining)))).toLocaleString()}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Current Price (auctions only) */}
              {!isSale && (
              <div>
                <div className="text-sm text-gray-500">{isScheduled ? 'Starting Price' : 'Current Bid'}</div>
                <div className="text-4xl font-bold text-primary-600">
                  R{(isScheduled ? product.startingPrice : product.currentPrice).toLocaleString()}
                </div>
                {!isScheduled && (
                  <div className="text-sm text-gray-500 mt-1">
                    {product.totalBids} bids • {product.uniqueBidders} bidders
                  </div>
                )}
              </div>
              )}

              {/* City restriction info — shown to everyone when product is city-locked */}
              {productCity && !isAuctionEnded && (
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <MapPinIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800">
                    Only buyers in <strong>{productCity}</strong> can bid on or buy this product. Nationwide delivery coming soon.
                  </p>
                </div>
              )}

              {/* Buy Now Price - only show if auction is still active and not scheduled */}
              {!isSale && product.buyNowPrice && !isAuctionEnded && !isScheduled && (
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="text-sm text-gray-500">Buy Now Price</div>
                    <div className="text-2xl font-semibold text-gray-900">
                      R{product.buyNowPrice.toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={handleBuyNow}
                    disabled={cityBlocked}
                    className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Buy Now
                  </button>
                </div>
              )}

              {/* Shipping Cost */}
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <TruckIcon className="h-5 w-5 text-blue-600" />
                  <span className="text-sm text-blue-700">Shipping</span>
                </div>
                <span className="font-semibold text-blue-900">
                  {(product.shippingCost || product.shipping?.cost || 0) > 0 ? `R${(product.shippingCost || product.shipping?.cost || 0).toLocaleString()}` : 'Free'}
                </span>
              </div>

              {/* City-restricted notice */}
              {!isAuctionEnded && !isScheduled && cityBlocked && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    This product is only delivered in <strong>{productCity}</strong>. You're in {buyerCity || 'another city'}. Nationwide delivery coming soon.
                  </p>
                </div>
              )}

              {/* Bid Form (auctions only) */}
              {!isSale && !isAuctionEnded && !isScheduled && user?.id !== product.seller?._id && (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Your Bid (minimum: R{minimumBid.toLocaleString()})
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        {...register('amount', {
                          required: 'Bid amount is required',
                          min: {
                            value: minimumBid,
                            message: `Minimum bid is R${minimumBid.toLocaleString()}`
                          }
                        })}
                        type="number"
                        step="0.01"
                        disabled={cityBlocked}
                        className="input-field flex-1 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder={`Enter bid amount`}
                      />
                      <button type="submit" disabled={cityBlocked} className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed">
                        Place Bid
                      </button>
                    </div>
                    {errors.amount && (
                      <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
                    )}
                  </div>
                </form>
              )}

              {!isSale && isAuctionEnded && (
                <>
                  {/* Current user is the winner */}
                  {isAuthenticated && user?.uid === product.winnerId ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                      <div className="text-center">
                        <p className="text-green-700 font-bold text-lg">
                          Congratulations! You won this auction!
                        </p>
                        <p className="text-green-600 text-sm mt-1">
                          Winning price: R{(product.finalPrice || product.currentPrice).toLocaleString()}
                        </p>
                        <p className="text-yellow-700 text-xs mt-2 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
                          Complete payment within 7 days or the item will be re-listed.
                        </p>
                      </div>
                      <button
                        onClick={() => navigate('/orders')}
                        className="btn-primary w-full"
                      >
                        Go to My Orders to Complete Payment
                      </button>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-center text-gray-600 font-semibold">
                        This auction has ended
                      </p>
                      {(product.winner || product.winnerName) && (
                        <p className="text-center text-sm text-gray-500 mt-2">
                          Won by: {product.winner?.username || product.winnerName}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="text-center">
              <ShieldCheckIcon className="h-8 w-8 text-primary-600 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Buyer Protection</p>
            </div>
            <div className="text-center">
              <TruckIcon className="h-8 w-8 text-primary-600 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Fast Shipping</p>
            </div>
            <div className="text-center">
              <ArrowPathIcon className="h-8 w-8 text-primary-600 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Easy Returns</p>
            </div>
          </div>

          {/* Tabs */}
          <div>
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto">
                {['description', 'shipping', ...(isSale ? [] : ['bids']), 'reviews', 'questions'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                      activeTab === tab
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </nav>
            </div>

            <div className="py-4">
              {activeTab === 'description' && (
                <div className="prose max-w-none">
                  <p className="text-gray-600">{product.description}</p>
                  {product.specifications && Object.keys(product.specifications).length > 0 && (
                    <div className="mt-6">
                      <h3 className="font-semibold text-gray-900 mb-4">Specifications</h3>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {Object.entries(product.specifications).map(([key, value]: [string, any]) => (
                            <div key={key}>
                              <dt className="font-medium text-gray-600 capitalize text-sm">{key.replace(/([A-Z])/g, ' $1').trim()}:</dt>
                              <dd className="text-gray-900 font-medium">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'shipping' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                      <TruckIcon className="h-5 w-5 mr-2" />
                      Shipping Information
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between gap-2">
                        <span className="text-blue-700">Shipping Cost:</span>
                        <span className="font-medium text-blue-900">
                          {(product.shippingCost || product.shipping?.cost || 0) > 0 ? `R${product.shippingCost || product.shipping?.cost || 0}` : 'Free'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-blue-700">Location:</span>
                        <span className="font-medium text-blue-900">{product.location || 'South Africa'}</span>
                      </div>
                      {productCity && (
                        <div className="mt-1 flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
                          <TruckIcon className="h-4 w-4 text-amber-600 flex-shrink-0" />
                          <span className="text-xs text-amber-800">
                            Delivery available in <strong>{productCity}</strong> only. Nationwide delivery coming soon.
                          </span>
                        </div>
                      )}
                      {product.shipping?.methods && (
                        <div>
                          <span className="text-blue-700">Available Methods:</span>
                          <div className="mt-1 flex flex-wrap gap-1 sm:gap-2">
                            {product.shipping.methods.map((method: string, index: number) => (
                              <span key={index} className="px-2 py-1 bg-blue-200 text-blue-800 rounded-full text-xs">
                                {method}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 mb-3 flex items-center">
                      <ShieldCheckIcon className="h-5 w-5 mr-2" />
                      Buyer Protection
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center text-green-700">
                        <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                        Money back guarantee if item not as described
                      </div>
                      <div className="flex items-center text-green-700">
                        <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                        Secure payment processing
                      </div>
                      <div className="flex items-center text-green-700">
                        <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                        Dispute resolution support
                      </div>
                    </div>
                  </div>

                  {product.returnPolicy?.accepted && (
                    <div className="bg-orange-50 rounded-lg p-4">
                      <h3 className="font-semibold text-orange-900 mb-2 flex items-center">
                        <ArrowPathIcon className="h-5 w-5 mr-2" />
                        Return Policy
                      </h3>
                      <p className="text-orange-700">
                        {product.returnPolicy.days} day returns accepted
                      </p>
                      <p className="text-orange-600 text-sm mt-1">
                        {product.returnPolicy.description}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'bids' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-gray-900">Bid History</h3>
                    <span className="text-sm text-gray-500">
                      {bids.length} bid{bids.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  {bids.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {bids.map((bid: any, index: number) => (
                        <motion.div 
                          key={bid._id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg border-2 ${
                            index === 0 
                              ? 'bg-primary-50 border-primary-200' 
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center space-x-2 sm:space-x-3">
                            {bid.bidder?.avatar ? (
                              <img 
                                src={bid.bidder.avatar} 
                                alt={bid.bidder.username}
                                className="h-10 w-10 rounded-full"
                              />
                            ) : (
                              <div className="h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                                <UserIcon className="h-5 w-5 text-primary-600" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center space-x-2">
                                <p className="font-medium text-gray-900">{bid.bidder?.username}</p>
                                {index === 0 && (
                                  <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                                    Leading
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {(() => {
                                  try {
                                    const date = bid.timestamp ? new Date(bid.timestamp) : new Date();
                                    if (isNaN(date.getTime())) {
                                      return 'Just now';
                                    }
                                    return format(date, 'MMM dd, yyyy • HH:mm');
                                  } catch (error) {
                                    return 'Just now';
                                  }
                                })()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-xl font-bold ${
                              index === 0 ? 'text-primary-600' : 'text-gray-900'
                            }`}>
                              R{bid.amount.toLocaleString()}
                            </div>
                            {index > 0 && (
                              <p className="text-sm text-gray-500">
                                +R{(Number(bids[index-1].amount) - Number(bid.amount)).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ExclamationTriangleIcon className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="text-gray-500">No bids placed yet</p>
                      <p className="text-sm text-gray-400 mt-1">Be the first to place a bid!</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'reviews' && (
                <div className="space-y-6">
                  {reviewsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="loading-spinner"></div>
                    </div>
                  ) : (
                    <>
                      {/* Rating Summary */}
                      <div className="bg-gray-50 rounded-lg p-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                          <div className="text-center">
                            <div className="text-5xl font-bold text-gray-900">
                              {reviewStats.averageRating.toFixed(1)}
                            </div>
                            <div className="flex items-center justify-center mt-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <StarIcon
                                  key={star}
                                  className={`h-5 w-5 ${
                                    star <= Math.round(reviewStats.averageRating)
                                      ? 'text-yellow-400 fill-current'
                                      : 'text-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              {reviewStats.total} review{reviewStats.total !== 1 ? 's' : ''}
                            </p>
                          </div>

                          {/* Rating Distribution */}
                          <div className="flex-1 w-full">
                            {[5, 4, 3, 2, 1].map((rating) => {
                              const count = reviewStats.distribution[rating] || 0
                              const percentage = reviewStats.total > 0
                                ? (count / reviewStats.total) * 100
                                : 0
                              return (
                                <div key={rating} className="flex items-center gap-2 mb-1">
                                  <span className="text-sm text-gray-600 w-12">{rating} star</span>
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-yellow-400 h-2 rounded-full transition-all"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                  <span className="text-sm text-gray-500 w-8">{count}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Review Info Banner */}
                      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <InformationCircleIcon className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-700">
                          You can leave a review after your order has been delivered. Reviews are only available for verified purchases.
                        </p>
                      </div>

                      {/* Reviews List */}
                      {reviews.length > 0 ? (
                        <div className="space-y-4">
                          {reviews.map((review: any) => (
                            <div key={review.id} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  {review.reviewer?.avatar ? (
                                    <img
                                      src={review.reviewer.avatar}
                                      alt={review.reviewer.username}
                                      className="h-10 w-10 rounded-full"
                                    />
                                  ) : (
                                    <div className="h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                                      <UserIcon className="h-5 w-5 text-primary-600" />
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-medium text-gray-900">
                                      {review.reviewer?.username || 'Anonymous'}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <div className="flex">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <StarIcon
                                            key={star}
                                            className={`h-4 w-4 ${
                                              star <= review.rating
                                                ? 'text-yellow-400 fill-current'
                                                : 'text-gray-300'
                                            }`}
                                          />
                                        ))}
                                      </div>
                                      {review.isVerifiedPurchase && (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                          Verified Purchase
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-sm text-gray-500">
                                  {review.createdAt
                                    ? (() => {
                                        try {
                                          const date = new Date(review.createdAt)
                                          if (isNaN(date.getTime())) return 'Recently'
                                          return format(date, 'MMM dd, yyyy')
                                        } catch {
                                          return 'Recently'
                                        }
                                      })()
                                    : 'Recently'}
                                </span>
                              </div>
                              {review.comment && (
                                <p className="text-gray-700">{review.comment}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <StarIcon className="h-8 w-8 text-gray-400" />
                          </div>
                          <p className="text-gray-500">No reviews yet</p>
                          <p className="text-sm text-gray-400 mt-1">
                            Be the first to review this product after purchase!
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'questions' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">Ask a Question</h3>
                    {isAuthenticated ? (
                      <div className="space-y-3">
                        <textarea
                          value={newQuestion}
                          onChange={(e) => setNewQuestion(e.target.value)}
                          placeholder="Ask the seller a question about this item..."
                          className="input-field h-24 resize-none"
                        />
                        <button
                          onClick={handleAskQuestion}
                          disabled={submittingQuestion || !newQuestion.trim()}
                          className="btn-primary"
                        >
                          {submittingQuestion ? 'Submitting...' : 'Ask Question'}
                        </button>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <p className="text-gray-600 mb-3">Sign in to ask questions</p>
                        <button
                          onClick={() => navigate('/login')}
                          className="btn-primary"
                        >
                          Sign In
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">
                      Questions & Answers ({questions.length})
                    </h3>

                    {loadingQuestions ? (
                      <div className="flex justify-center py-8">
                        <div className="loading-spinner"></div>
                      </div>
                    ) : questions.length > 0 ? (
                      <div className="space-y-4">
                        {questions.map((qa: any) => (
                          <div key={qa.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="mb-3">
                              <div className="flex items-center space-x-2 mb-2">
                                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <UserIcon className="h-4 w-4 text-blue-600" />
                                </div>
                                <span className="font-medium text-gray-900">{qa.userName}</span>
                                <span className="text-sm text-gray-500">
                                  {(() => {
                                    try {
                                      const date = qa.createdAt ? new Date(qa.createdAt) : new Date();
                                      if (isNaN(date.getTime())) return 'Recently';
                                      return format(date, 'MMM dd, yyyy');
                                    } catch {
                                      return 'Recently';
                                    }
                                  })()}
                                </span>
                              </div>
                              <p className="text-gray-800 pl-10">{qa.question}</p>
                            </div>

                            {qa.answer ? (
                              <div className="pl-10 pt-3 border-t border-gray-100">
                                <div className="flex items-center space-x-2 mb-2">
                                  <div className="h-6 w-6 bg-primary-100 rounded-full flex items-center justify-center">
                                    <span className="text-xs font-medium text-primary-600">S</span>
                                  </div>
                                  <span className="text-sm font-medium text-primary-600">
                                    {qa.answeredByName || 'Seller'}
                                  </span>
                                  {qa.answeredAt && (
                                    <span className="text-xs text-gray-400">
                                      {(() => {
                                        try {
                                          const date = new Date(qa.answeredAt);
                                          if (isNaN(date.getTime())) return '';
                                          return format(date, 'MMM dd, yyyy');
                                        } catch {
                                          return '';
                                        }
                                      })()}
                                    </span>
                                  )}
                                </div>
                                <p className="text-gray-700 pl-8">{qa.answer}</p>
                              </div>
                            ) : (
                              // Show answer input for seller
                              user?.uid === product?.sellerId && (
                                <div className="pl-10 pt-3 border-t border-gray-100">
                                  {answeringQuestionId === qa.id ? (
                                    <div className="space-y-2">
                                      <textarea
                                        value={answerText}
                                        onChange={(e) => setAnswerText(e.target.value)}
                                        placeholder="Type your answer..."
                                        className="input-field h-20 resize-none w-full"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handleAnswerQuestion(qa.id)}
                                          disabled={!answerText.trim()}
                                          className="btn-primary text-sm"
                                        >
                                          Submit Answer
                                        </button>
                                        <button
                                          onClick={() => { setAnsweringQuestionId(null); setAnswerText(''); }}
                                          className="btn-secondary text-sm"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setAnsweringQuestionId(qa.id)}
                                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                                    >
                                      Answer this question
                                    </button>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <ChatBubbleLeftIcon className="h-8 w-8 text-gray-400" />
                        </div>
                        <p className="text-gray-500">No questions asked yet</p>
                        <p className="text-sm text-gray-400 mt-1">Be the first to ask a question!</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Products</h2>
        <div className="text-center py-8 text-gray-500">
          <p>Related products will be displayed here</p>
        </div>
      </div>

      {/* Live Auction Registration Modal */}
      {product && (
        <LiveAuctionRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          onSuccess={handleRegistrationSuccess}
          product={product}
          userBalance={user?.balance || 0}
        />
      )}
    </motion.div>
  )
}

export default ProductDetail
