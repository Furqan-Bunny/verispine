import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import {
  BuildingStorefrontIcon,
  StarIcon,
  CheckBadgeIcon,
  EnvelopeIcon,
  ShoppingBagIcon,
  ChatBubbleLeftEllipsisIcon
} from '@heroicons/react/24/outline'
import {
  getPublicSeller,
  getPublicSellerProducts,
  getPublicSellerReviews,
  type PublicSeller
} from '../services/sellerService'
import ProductCard from '../components/ProductCard'
import { formatPrice } from '../utils/formatters'

const SellerStorefront = () => {
  const { slugOrUserId } = useParams<{ slugOrUserId: string }>()
  const [seller, setSeller] = useState<PublicSeller | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [reviewStats, setReviewStats] = useState({ averageRating: 0, ratingCount: 0 })
  const [activeTab, setActiveTab] = useState<'listings' | 'reviews' | 'about' | 'contact'>('listings')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slugOrUserId) return
    loadAll(slugOrUserId)
  }, [slugOrUserId])

  const loadAll = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const [sellerRes, productsRes, reviewsRes] = await Promise.all([
        getPublicSeller(id),
        getPublicSellerProducts(id, 'active'),
        getPublicSellerReviews(id, 20)
      ])
      if (sellerRes.success) setSeller(sellerRes.data)
      if (productsRes.success) setProducts(productsRes.data || [])
      if (reviewsRes.success) {
        setReviews(reviewsRes.data?.reviews || [])
        setReviewStats({
          averageRating: reviewsRes.data?.averageRating || 0,
          ratingCount: reviewsRes.data?.ratingCount || 0
        })
      }
    } catch (err: any) {
      console.error('Failed to load seller storefront:', err)
      setError(err?.response?.data?.error || 'Seller not found')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  if (error || !seller) {
    return (
      <div className="text-center py-20">
        <BuildingStorefrontIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Seller Not Found</h1>
        <p className="text-gray-600 mb-6">{error || 'This storefront does not exist.'}</p>
        <Link to="/products" className="btn-primary inline-flex items-center gap-2">
          Browse Products
        </Link>
      </div>
    )
  }

  const memberSince = seller.memberSinceAsSeller
    ? (seller.memberSinceAsSeller._seconds
        ? new Date(seller.memberSinceAsSeller._seconds * 1000)
        : new Date(seller.memberSinceAsSeller))
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Banner */}
      <div className="relative rounded-xl overflow-hidden bg-gradient-to-r from-primary-600 to-primary-700 h-40 sm:h-56">
        {seller.bannerUrl && (
          <img src={seller.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />
        )}
      </div>

      {/* Header */}
      <div className="card -mt-16 sm:-mt-20 relative z-10 mx-2 sm:mx-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="w-24 h-24 rounded-xl border-4 border-white shadow-lg overflow-hidden bg-gray-100 -mt-12 flex-shrink-0">
            {seller.logoUrl ? (
              <img src={seller.logoUrl} alt={seller.businessName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary-50">
                <BuildingStorefrontIcon className="h-12 w-12 text-primary-300" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{seller.businessName}</h1>
              {seller.verifiedSeller && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                  <CheckBadgeIcon className="h-4 w-4" /> Verified
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600 mt-1 flex-wrap">
              {seller.ratingCount > 0 ? (
                <span className="flex items-center gap-1">
                  <StarIcon className="h-4 w-4 text-amber-500" />
                  <strong className="text-gray-900">{seller.averageRating.toFixed(1)}</strong>
                  ({seller.ratingCount} review{seller.ratingCount === 1 ? '' : 's'})
                </span>
              ) : (
                <span className="text-gray-400 italic">No reviews yet</span>
              )}
              {memberSince && <span>• Member since {memberSince.toLocaleDateString()}</span>}
              {products.length > 0 && <span>• {products.length} active listing{products.length === 1 ? '' : 's'}</span>}
            </div>
          </div>

          {seller.contactEmail && (
            <a href={`mailto:${seller.contactEmail}`}
              className="btn-outline text-sm flex items-center gap-2 whitespace-nowrap">
              <EnvelopeIcon className="h-4 w-4" /> Contact Seller
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex gap-4">
          {([
            { id: 'listings', label: `Listings (${products.length})` },
            { id: 'reviews', label: `Reviews (${reviewStats.ratingCount})` },
            { id: 'about', label: 'About' },
            { id: 'contact', label: 'Contact' }
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
                activeTab === tab.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Listings */}
      {activeTab === 'listings' && (
        <div>
          {products.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBagIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No active listings right now</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map(p => (
                <ProductCard key={p.id} product={p} showTimer />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reviews */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="text-center py-12 card">
              <ChatBubbleLeftEllipsisIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No reviews yet</p>
            </div>
          ) : (
            <>
              <div className="card flex items-center gap-4">
                <div className="text-5xl font-bold text-gray-900">{reviewStats.averageRating.toFixed(1)}</div>
                <div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <StarIcon key={i} className={`h-5 w-5 ${i <= Math.round(reviewStats.averageRating) ? 'text-amber-500' : 'text-gray-300'}`} />
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{reviewStats.ratingCount} review{reviewStats.ratingCount === 1 ? '' : 's'}</p>
                </div>
              </div>
              {reviews.map(r => (
                <div key={r.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{r.userName || 'Anonymous'}</p>
                      <p className="text-xs text-gray-500">
                        {r.createdAt?._seconds
                          ? new Date(r.createdAt._seconds * 1000).toLocaleDateString()
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <StarIcon key={i} className={`h-4 w-4 ${i <= r.rating ? 'text-amber-500' : 'text-gray-300'}`} />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="text-sm text-gray-700">{r.comment}</p>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* About */}
      {activeTab === 'about' && (
        <div className="card space-y-6">
          {seller.description ? (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">About {seller.businessName}</h3>
              <p className="text-gray-700 whitespace-pre-line">{seller.description}</p>
            </div>
          ) : (
            <p className="text-gray-500 italic">This seller hasn't added a description yet.</p>
          )}
          {seller.shippingPolicy && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Shipping Policy</h3>
              <p className="text-gray-700 whitespace-pre-line text-sm">{seller.shippingPolicy}</p>
            </div>
          )}
          {seller.returnPolicy && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Return Policy</h3>
              <p className="text-gray-700 whitespace-pre-line text-sm">{seller.returnPolicy}</p>
            </div>
          )}
        </div>
      )}

      {/* Contact */}
      {activeTab === 'contact' && (
        <div className="card text-center py-12">
          {seller.contactEmail ? (
            <>
              <EnvelopeIcon className="h-12 w-12 text-primary-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact this seller</h3>
              <p className="text-gray-600 mb-4">Send them an email directly:</p>
              <a href={`mailto:${seller.contactEmail}`} className="btn-primary inline-flex items-center gap-2">
                <EnvelopeIcon className="h-5 w-5" /> {seller.contactEmail}
              </a>
            </>
          ) : (
            <p className="text-gray-500">This seller hasn't added a contact email yet.</p>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default SellerStorefront
