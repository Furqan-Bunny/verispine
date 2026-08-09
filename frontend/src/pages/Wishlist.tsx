import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from '../config/axios'
import {
  HeartIcon as HeartIconOutline,
  ClockIcon,
  EyeIcon,
  ShoppingBagIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  ShareIcon,
  BellIcon
} from '@heroicons/react/24/outline'
import {
  HeartIcon as HeartIconSolid
} from '@heroicons/react/24/solid'
import { formatPrice, getTimeRemaining } from '../utils/formatters'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

interface WishlistItem {
  id: string
  product: {
    id: string
    title: string
    description: string
    images: string[]
    currentPrice: number
    startingPrice: number
    buyNowPrice?: number
    endDate: any
    status: string
    category: string
    categoryId: string
    totalBids: number
    views: number
    sellerId: string
    sellerName?: string
  }
  addedAt: any
  productId: string
}

const Wishlist = () => {
  const { user } = useAuthStore()
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState('recent')
  const [filterCategory, setFilterCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWishlist()
    loadCategories()
  }, [])

  const loadWishlist = async () => {
    setLoading(true)
    try {
      const response = await axios.get('/api/users/watchlist')
      if (response.data.success) {
        setWishlistItems(response.data.data || [])
      }
    } catch (error) {
      console.error('Error loading wishlist:', error)
      setWishlistItems([])
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const response = await axios.get('/api/categories')
      if (response.data.success) {
        setCategories(response.data.data || [])
      }
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  const toggleWishlist = async (productId: string) => {
    try {
      const response = await axios.post(`/api/users/watchlist/${productId}`)
      if (response.data.success) {
        if (!response.data.added) {
          // Item was removed
          setWishlistItems(prev => prev.filter(item => item.product.id !== productId))
          toast.success('Removed from wishlist')
        }
      }
    } catch (error) {
      console.error('Error toggling wishlist:', error)
      toast.error('Failed to update wishlist')
    }
  }

  const removeFromWishlist = async (productId: string) => {
    await toggleWishlist(productId)
  }

  const filteredItems = wishlistItems.filter(item => {
    if (!item.product) return false
    if (filterCategory !== 'all' && item.product.categoryId !== filterCategory) return false
    if (searchQuery && !item.product.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (priceRange.min && Number(item.product.currentPrice) < parseInt(priceRange.min)) return false
    if (priceRange.max && Number(item.product.currentPrice) > parseInt(priceRange.max)) return false
    return true
  })

  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'price-low': return (a.product?.currentPrice || 0) - (b.product?.currentPrice || 0)
      case 'price-high': return (b.product?.currentPrice || 0) - (a.product?.currentPrice || 0)
      case 'ending-soon': 
        const aDate = a.product?.endDate?._seconds ? new Date(a.product.endDate._seconds * 1000) : new Date()
        const bDate = b.product?.endDate?._seconds ? new Date(b.product.endDate._seconds * 1000) : new Date()
        return aDate.getTime() - bDate.getTime()
      case 'recent': 
        const aAdded = a.addedAt?._seconds ? new Date(a.addedAt._seconds * 1000) : new Date()
        const bAdded = b.addedAt?._seconds ? new Date(b.addedAt._seconds * 1000) : new Date()
        return bAdded.getTime() - aAdded.getTime()
      case 'oldest': 
        const aOld = a.addedAt?._seconds ? new Date(a.addedAt._seconds * 1000) : new Date()
        const bOld = b.addedAt?._seconds ? new Date(b.addedAt._seconds * 1000) : new Date()
        return aOld.getTime() - bOld.getTime()
      default: return 0
    }
  })

  const stats = [
    {
      title: 'Total Items',
      value: wishlistItems.length,
      icon: HeartIconOutline,
      color: 'bg-red-500'
    },
    {
      title: 'Active Auctions',
      value: wishlistItems.filter(item => item.product?.status === 'active').length,
      icon: BellIcon,
      color: 'bg-blue-500'
    },
    {
      title: 'Ending Soon',
      value: wishlistItems.filter(item => {
        if (!item.product?.endDate) return false
        const endTime = item.product.endDate._seconds ? 
          new Date(item.product.endDate._seconds * 1000) : 
          new Date(item.product.endDate)
        const timeLeft = endTime.getTime() - new Date().getTime()
        return timeLeft > 0 && timeLeft < 24 * 60 * 60 * 1000 // Less than 24 hours
      }).length,
      icon: ClockIcon,
      color: 'bg-orange-500'
    },
    {
      title: 'Avg. Price',
      value: wishlistItems.length > 0 
        ? formatPrice(wishlistItems.reduce((sum, item) => sum + (Number(item.product?.currentPrice) || 0), 0) / wishlistItems.length)
        : formatPrice(0),
      icon: ShoppingBagIcon,
      color: 'bg-green-500'
    }
  ]

  const WishlistCard = ({ item, isGrid = true }: { item: WishlistItem; isGrid?: boolean }) => {
    if (!item.product) return null
    
    const endDate = item.product.endDate?._seconds ? 
      new Date(item.product.endDate._seconds * 1000) : 
      new Date(item.product.endDate || new Date())
    const timeRemaining = getTimeRemaining(endDate.toISOString())
    const isEndingSoon = endDate.getTime() - new Date().getTime() < 24 * 60 * 60 * 1000

    if (isGrid) {
      return (
        <motion.div
          layout
          className="card hover:shadow-lg transition-all group"
        >
          <div className="relative">
            <img
              src={item.product.images?.[0] || 'https://via.placeholder.com/300'}
              alt={item.product.title}
              className="w-full h-48 object-cover rounded-t-lg group-hover:scale-105 transition-transform"
            />
            {isEndingSoon && item.product.status === 'active' && (
              <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                Ending Soon!
              </div>
            )}
            {item.product.status !== 'active' && (
              <div className="absolute top-2 left-2 bg-gray-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                {item.product.status === 'ended' ? 'Ended' : 'Sold'}
              </div>
            )}
            <div className="absolute top-2 right-2 flex space-x-1">
              <button
                onClick={() => removeFromWishlist(item.product.id)}
                className="p-1.5 bg-white/80 hover:bg-white rounded-full transition-colors"
                title="Remove from wishlist"
              >
                <TrashIcon className="h-4 w-4 text-red-500" />
              </button>
              <button className="p-1.5 bg-white/80 hover:bg-white rounded-full transition-colors">
                <ShareIcon className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>

          <div className="p-4">
            <Link to={`/products/${item.product.id}`} className="block group-hover:text-primary-600">
              <h3 className="font-semibold text-gray-900 line-clamp-2">{item.product.title}</h3>
            </Link>
            
            <div className="flex items-center justify-between mt-2">
              <div>
                <p className="text-lg font-bold text-primary-600">{formatPrice(item.product.currentPrice)}</p>
                {item.product.buyNowPrice && (
                  <p className="text-xs text-gray-500">Buy Now: {formatPrice(item.product.buyNowPrice)}</p>
                )}
              </div>
              <div className="text-right text-sm text-gray-600">
                {item.product.status === 'active' && (
                  <>
                    <ClockIcon className="inline h-3 w-3" />
                    <span className="ml-1">{timeRemaining}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
              <span>{item.product.totalBids || 0} bids</span>
              <span>{item.product.views || 0} views</span>
            </div>

            <div className="flex space-x-2 mt-4">
              <Link
                to={`/products/${item.product.id}`}
                className="flex-1 btn-primary text-center text-sm"
              >
                <EyeIcon className="inline h-4 w-4 mr-1" />
                View Auction
              </Link>
              {item.product.status === 'active' && (
                <Link
                  to={`/products/${item.product.id}`}
                  className="flex-1 btn-outline text-center text-sm"
                >
                  Place Bid
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      )
    }

    // List view
    return (
      <motion.div
        layout
        className="card hover:shadow-lg transition-all"
      >
        <div className="flex items-start space-x-4">
          <img
            src={item.product.images?.[0] || 'https://via.placeholder.com/96'}
            alt={item.product.title}
            className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
          />
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <Link to={`/products/${item.product.id}`} className="text-lg font-semibold text-gray-900 hover:text-primary-600">
                  {item.product.title}
                </Link>
                <p className="text-sm text-gray-600 mt-1">{item.product.category}</p>
                <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                  <span>{item.product.totalBids || 0} bids</span>
                  <span>{item.product.views || 0} views</span>
                  <span>Added {item.addedAt ? 
                    new Date(item.addedAt._seconds ? item.addedAt._seconds * 1000 : item.addedAt).toLocaleDateString() : 
                    'Unknown'}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-primary-600">{formatPrice(item.product.currentPrice)}</p>
                {item.product.status === 'active' ? (
                  <>
                    <p className="text-sm text-gray-600 mt-1">
                      <ClockIcon className="inline h-3 w-3" />
                      <span className="ml-1">{timeRemaining}</span>
                    </p>
                    {isEndingSoon && (
                      <span className="inline-block mt-1 bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                        Ending Soon!
                      </span>
                    )}
                  </>
                ) : (
                  <span className="inline-block mt-1 bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium">
                    {item.product.status === 'ended' ? 'Ended' : 'Sold'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="flex space-x-2">
                <Link
                  to={`/products/${item.product.id}`}
                  className="btn-primary text-sm"
                >
                  <EyeIcon className="inline h-4 w-4 mr-1" />
                  View
                </Link>
                {item.product.status === 'active' && (
                  <Link
                    to={`/products/${item.product.id}`}
                    className="btn-outline text-sm"
                  >
                    Bid Now
                  </Link>
                )}
              </div>
              <div className="flex space-x-1">
                <button className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                  <ShareIcon className="h-4 w-4 text-gray-500" />
                </button>
                <button
                  onClick={() => removeFromWishlist(item.product.id)}
                  className="p-1.5 hover:bg-red-100 rounded transition-colors"
                  title="Remove from wishlist"
                >
                  <TrashIcon className="h-4 w-4 text-red-500" />
                </button>
              </div>
            </div>
          </div>
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
      <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <HeartIconSolid className="h-8 w-8 text-red-500 mr-3" />
              My Wishlist
            </h1>
            <p className="text-gray-600 mt-2">
              Keep track of auctions you're interested in
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2v8h10V6H5z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h14a1 1 0 100-2H3z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
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

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search wishlist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>

          <div className="flex items-center space-x-2">
            <input
              type="number"
              placeholder="Min Price"
              value={priceRange.min}
              onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <span>-</span>
            <input
              type="number"
              placeholder="Max Price"
              value={priceRange.max}
              onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="recent">Recently Added</option>
            <option value="oldest">Oldest First</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="ending-soon">Ending Soon</option>
          </select>
        </div>
      </div>

      {/* Wishlist Items */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : sortedItems.length > 0 ? (
        <div className={viewMode === 'grid' 
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          : "space-y-4"
        }>
          {sortedItems.map((item) => (
            <WishlistCard key={item.id} item={item} isGrid={viewMode === 'grid'} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <HeartIconOutline className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {wishlistItems.length === 0 ? 'Your wishlist is empty' : 'No items match your filters'}
          </h3>
          <p className="text-gray-600 mb-4">
            {wishlistItems.length === 0 
              ? 'Start adding items you love to keep track of them'
              : 'Try adjusting your search or filter criteria'
            }
          </p>
          {wishlistItems.length === 0 && (
            <Link to="/products" className="btn-primary">
              Browse Auctions
            </Link>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default Wishlist