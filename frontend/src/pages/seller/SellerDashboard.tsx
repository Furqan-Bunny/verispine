import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  BuildingStorefrontIcon,
  CurrencyDollarIcon,
  ShoppingBagIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  PlusCircleIcon,
  ArrowRightIcon,
  CheckBadgeIcon,
  StarIcon,
  EyeIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import toast from 'react-hot-toast'
import { formatPrice } from '../../utils/formatters'
import {
  getSellerOverview,
  getSellerTimeseries,
  getSellerTopProducts,
  getSellerDashboardStats,
  type SellerOverview,
  type SellerTimeseriesPoint,
  type SellerTopProduct
} from '../../services/sellerService'

const PIE_COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6']

const SellerDashboard = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [overview, setOverview] = useState<SellerOverview | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [series, setSeries] = useState<SellerTimeseriesPoint[]>([])
  const [seriesTotals, setSeriesTotals] = useState({ revenue: 0, orders: 0, newBids: 0 })
  const [topProducts, setTopProducts] = useState<SellerTopProduct[]>([])
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && user.role !== 'seller' && user.role !== 'admin') {
      toast.error('Seller access required')
      navigate('/dashboard')
    }
  }, [user, navigate])

  useEffect(() => {
    loadAll()
  }, [period])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [overviewRes, statsRes, tsRes, topRes] = await Promise.all([
        getSellerOverview(),
        getSellerDashboardStats(),
        getSellerTimeseries(period),
        getSellerTopProducts(5)
      ])
      if (overviewRes.success) setOverview(overviewRes.data)
      if (statsRes.success) setStats(statsRes.data)
      if (tsRes.success) {
        setSeries(tsRes.data.series)
        setSeriesTotals(tsRes.data.totals)
      }
      if (topRes.success) setTopProducts(topRes.data)
    } catch (error) {
      console.error('Error loading seller dashboard:', error)
      toast.error('Failed to load seller dashboard')
    } finally {
      setLoading(false)
    }
  }

  const memberSince = overview?.memberSinceAsSeller
    ? (overview.memberSinceAsSeller._seconds
        ? new Date(overview.memberSinceAsSeller._seconds * 1000)
        : new Date(overview.memberSinceAsSeller))
    : null

  const statsObj = stats?.stats || {}

  // Sales status pie data
  const statusData = [
    { name: 'Active', value: statsObj.activeListings || 0 },
    { name: 'Sold', value: statsObj.soldItems || 0 },
    { name: 'Ended', value: statsObj.endedAuctions || 0 }
  ].filter(d => d.value > 0)

  if (loading && !overview) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {overview?.logoUrl ? (
              <img src={overview.logoUrl} alt={overview.businessName} className="w-16 h-16 rounded-lg object-cover bg-white" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-white/20 flex items-center justify-center">
                <BuildingStorefrontIcon className="h-9 w-9 text-white" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{overview?.businessName || 'Seller Dashboard'}</h1>
                {overview?.verifiedSeller && (
                  <CheckBadgeIcon className="h-6 w-6 text-blue-300" title="Verified Seller" />
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-primary-100 mt-1">
                {overview?.ratingCount && overview.ratingCount > 0 ? (
                  <span className="flex items-center gap-1">
                    <StarIcon className="h-4 w-4" /> {overview.averageRating.toFixed(1)} ({overview.ratingCount})
                  </span>
                ) : null}
                {memberSince && (
                  <span>Member since {memberSince.toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {overview?.slug && (
              <Link to={`/seller/${overview.slug}`} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
                <EyeIcon className="h-4 w-4" /> View Public Profile
              </Link>
            )}
            <Link to="/profile" className="bg-white text-primary-700 px-4 py-2 rounded-lg font-medium text-sm">
              Edit Business
            </Link>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Active Listings" value={statsObj.activeListings || 0} icon={ShoppingBagIcon} color="blue" />
        <KpiCard label="Pending Orders" value={statsObj.pendingPayments || 0} icon={ClipboardDocumentListIcon} color="amber" />
        <KpiCard label={`Sales (${period})`} value={seriesTotals.orders} icon={ChartBarIcon} color="green" />
        <KpiCard label={`Revenue (${period})`} value={formatPrice(seriesTotals.revenue)} icon={CurrencyDollarIcon} color="emerald" small />
        <KpiCard label="Available Balance" value={formatPrice(overview?.availableBalance || 0)} icon={BanknotesIcon} color="primary" small />
        <KpiCard label="Pending Balance" value={formatPrice(overview?.pendingBalance || 0)} icon={BanknotesIcon} color="gray" small />
      </div>

      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Performance</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['7d', '30d', '90d', '1y'] as const).map(p => (
            <button key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium ${
                period === p ? 'bg-white text-primary-700 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}>
              {p === '1y' ? '1y' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Revenue & Orders</h3>
          {series.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No data for this period yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#ea580c" strokeWidth={2} dot={false} name="Revenue (R)" />
                <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#0284c7" strokeWidth={2} dot={false} name="Orders" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Listing Status</h3>
          {statusData.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No listings yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value">
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top products */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Top Products</h3>
          <Link to="/seller/listings" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
            View all <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
        {topProducts.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">No products yet. Create your first auction!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Bids</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Views</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {topProducts.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/products/${p.id}`} className="flex items-center gap-3 text-gray-900 hover:text-primary-600">
                        {p.image && <img src={p.image} alt={p.title} className="h-10 w-10 rounded object-cover" />}
                        <span className="font-medium">{p.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{p.status}</span></td>
                    <td className="px-4 py-3 text-right">{p.totalBids}</td>
                    <td className="px-4 py-3 text-right">{p.views}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatPrice(p.currentPrice || p.startingPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ActionCard to="/create-auction" icon={PlusCircleIcon} label="Create Auction" color="primary" />
        <ActionCard to="/seller/listings" icon={ShoppingBagIcon} label="Manage Listings" color="blue" />
        <ActionCard to="/seller/sales" icon={ClipboardDocumentListIcon} label="View Sales" color="green" />
        <ActionCard to="/seller/payouts" icon={BanknotesIcon} label="Payouts" color="emerald" />
      </div>
    </motion.div>
  )
}

const KpiCard = ({ label, value, icon: Icon, color, small }: any) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    primary: 'bg-primary-50 text-primary-600',
    gray: 'bg-gray-50 text-gray-600'
  }
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
      <div className={`inline-flex p-2 rounded-lg mb-2 ${colors[color] || colors.blue}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className={`${small ? 'text-base' : 'text-2xl'} font-bold text-gray-900`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}

const ActionCard = ({ to, icon: Icon, label, color }: any) => {
  const colors: Record<string, string> = {
    primary: 'border-primary-200 hover:bg-primary-50 text-primary-700',
    blue: 'border-blue-200 hover:bg-blue-50 text-blue-700',
    green: 'border-green-200 hover:bg-green-50 text-green-700',
    emerald: 'border-emerald-200 hover:bg-emerald-50 text-emerald-700'
  }
  return (
    <Link to={to} className={`block bg-white rounded-lg p-4 border ${colors[color]} transition`}>
      <Icon className="h-6 w-6 mb-2" />
      <p className="font-medium">{label}</p>
    </Link>
  )
}

export default SellerDashboard
