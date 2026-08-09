import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import axios from '../config/axios'
import {
  ClockIcon,
  TrophyIcon,
  ShieldCheckIcon,
  CurrencyDollarIcon,
  ArrowRightIcon,
  FireIcon,
  SparklesIcon,
  CalendarIcon,
  ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline'
import ProductCard from '../components/ProductCard'
import CategoryCard from '../components/CategoryCard'
import { formatPrice } from '../utils/formatters'

const Home = () => {
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([])
  const [endingSoonProducts, setEndingSoonProducts] = useState<any[]>([])
  const [upcomingProducts, setUpcomingProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch real products from Firebase API
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      const response = await axios.get('/api/products')
      const products = response.data.data || []

      // Process Firebase timestamp format
      const processedProducts = products.map((p: any) => ({
        ...p,
        endDate: p.endDate?._seconds ? new Date(p.endDate._seconds * 1000) : new Date(),
        startDate: p.startDate?._seconds ? new Date(p.startDate._seconds * 1000) : new Date(),
        scheduledStartTime: p.scheduledStartTime?._seconds
          ? new Date(p.scheduledStartTime._seconds * 1000)
          : (p.scheduledStartTime ? new Date(p.scheduledStartTime) : null),
        bids: p.totalBids || 0,
        seller: {
          name: p.sellerName || 'Unknown',
          verified: p.verified || false,
          rating: p.averageRating || 0
        }
      }))

      // Get featured products (active only)
      const featured = processedProducts.filter((p: any) => p.featured && p.status === 'active')
      setFeaturedProducts(featured.slice(0, 4))

      // Get products ending soon (within 3 days, active only)
      const threeDaysFromNow = new Date().getTime() + (3 * 24 * 60 * 60 * 1000)
      const endingSoon = processedProducts
        .filter((p: any) => p.endDate.getTime() < threeDaysFromNow && p.status === 'active')
        .sort((a: any, b: any) => a.endDate.getTime() - b.endDate.getTime())
        .slice(0, 4)
      setEndingSoonProducts(endingSoon)

      // Get upcoming (scheduled) products
      const upcoming = processedProducts
        .filter((p: any) => p.status === 'scheduled')
        .sort((a: any, b: any) => {
          const aTime = a.scheduledStartTime ? new Date(a.scheduledStartTime).getTime() : 0
          const bTime = b.scheduledStartTime ? new Date(b.scheduledStartTime).getTime() : 0
          return aTime - bTime
        })
        .slice(0, 4)
      setUpcomingProducts(upcoming)

      setLoading(false)
    } catch (error) {
      console.error('Error loading products:', error)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary-600 to-secondary-600 rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        <div className="relative px-8 py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto text-center text-white"
          >
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Welcome to Quicksell Auctions
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-white/90">
              South Africa's Premier Online Auction Platform
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
              <Link to="/products" className="btn-primary bg-white text-primary-600 hover:bg-gray-100 px-8 py-3 text-lg">
                Start Bidding
              </Link>
              <Link to="/register" className="btn-outline border-white text-white hover:bg-white/10 px-8 py-3 text-lg">
                Register Now
              </Link>
              <a
                href="https://quicksellsurvey.lovable.app"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary bg-white/15 backdrop-blur text-white border border-white/40 hover:bg-white/25 px-8 py-3 text-lg inline-flex items-center justify-center gap-2"
              >
                <ClipboardDocumentCheckIcon className="h-5 w-5" />
                Take Survey & Upload Documents
              </a>
            </div>
            <p className="text-white/80 mt-4 text-sm">
              ⚠️ Registration required to place bids
            </p>
          </motion.div>
        </div>

        {/* Animated background elements */}
        <div className="absolute top-10 left-10 w-20 h-20 bg-white/10 rounded-full animate-pulse"></div>
        <div className="absolute bottom-10 right-10 w-32 h-32 bg-white/10 rounded-full animate-pulse-slow"></div>
      </section>

      {/* Features Section */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card text-center"
          >
            <ShieldCheckIcon className="h-12 w-12 text-primary-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Secure Payments</h3>
            <p className="text-gray-600">AddPay & Traderoot integration</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card text-center"
          >
            <ClockIcon className="h-12 w-12 text-primary-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Real-time Bidding</h3>
            <p className="text-gray-600">Live updates on all auction activities</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card text-center"
          >
            <TrophyIcon className="h-12 w-12 text-primary-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Win Amazing Deals</h3>
            <p className="text-gray-600">Get the best prices on unique items</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="card text-center"
          >
            <CurrencyDollarIcon className="h-12 w-12 text-primary-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">ZAR Currency</h3>
            <p className="text-gray-600">All prices in South African Rand</p>
          </motion.div>
        </div>
      </section>

      {/* Featured Products */}
      <section>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <SparklesIcon className="h-8 w-8 text-primary-600" />
              Featured Auctions
            </h2>
            <p className="text-gray-600 mt-2">Premium items from verified sellers</p>
          </div>
          <Link to="/products" className="btn-outline hidden sm:block">
            View All
            <ArrowRightIcon className="inline h-4 w-4 ml-2" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="aspect-square bg-gray-200 rounded-lg mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((product) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No featured products available</p>
          </div>
        )}
      </section>

      {/* Upcoming Auctions */}
      {upcomingProducts.length > 0 && (
        <section>
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                <CalendarIcon className="h-8 w-8 text-blue-500" />
                Upcoming Auctions
              </h2>
              <p className="text-gray-600 mt-2">Coming soon — be ready to bid!</p>
            </div>
            <Link to="/products" className="btn-outline hidden sm:block">
              View All
              <ArrowRightIcon className="inline h-4 w-4 ml-2" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {upcomingProducts.map((product) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <ProductCard product={product} showTimer />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Ending Soon */}
      <section>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <FireIcon className="h-8 w-8 text-red-500" />
              Ending Soon
            </h2>
            <p className="text-gray-600 mt-2">Don't miss out on these deals</p>
          </div>
          <Link to="/products" className="btn-outline hidden sm:block">
            View All
            <ArrowRightIcon className="inline h-4 w-4 ml-2" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {endingSoonProducts.map((product) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <ProductCard product={product} showTimer />
            </motion.div>
          ))}
        </div>
      </section>


      {/* Registration CTA */}
      <section className="bg-gradient-to-r from-primary-50 to-secondary-50 rounded-3xl p-8 md:p-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Ready to Start Bidding?
          </h2>
          <p className="text-xl text-gray-700 mb-8">
            Join thousands of buyers and find amazing deals on Quicksell
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 max-w-2xl mx-auto">
            <p className="text-yellow-800 font-semibold">
              🔒 Registration Required to Place Bids
            </p>
            <p className="text-yellow-700 text-sm mt-1">
              Create a free account to start bidding on items
            </p>
            <p className="text-yellow-600 text-xs mt-2 italic">
              Note: Only admin can list items for sale
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="btn-primary px-8 py-3 text-lg">
              Register Now - It's Free!
            </Link>
            <Link to="/products" className="btn-outline px-8 py-3 text-lg">
              Browse Without Account
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-2xl sm:text-4xl font-bold text-primary-600">10K+</div>
            <div className="text-gray-600 mt-2">Active Users</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-4xl font-bold text-primary-600">50K+</div>
            <div className="text-gray-600 mt-2">Items Listed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-4xl font-bold text-primary-600">R5M+</div>
            <div className="text-gray-600 mt-2">Total Sales</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-4xl font-bold text-primary-600">98%</div>
            <div className="text-gray-600 mt-2">Satisfaction Rate</div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home