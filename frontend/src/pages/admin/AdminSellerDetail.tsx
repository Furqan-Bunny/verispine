import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  ArrowLeftIcon,
  ShieldCheckIcon,
  StarIcon,
  EnvelopeIcon,
  ArrowTopRightOnSquareIcon,
  CubeIcon,
  ShoppingBagIcon,
  BanknotesIcon,
  WalletIcon,
  IdentificationIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import {
  getAdminSellerDetail,
  getAdminSellerTimeseries,
  getAdminSellerProducts,
  getAdminSellerOrders,
  getAdminSellerPayouts,
  getAdminSellerActivity,
  toggleSellerVerified,
  AdminSellerDetail,
  AdminSellerTimeseriesPoint,
  AdminSellerActivityEvent
} from '../../services/adminSellerService'

type TabId = 'products' | 'orders' | 'payouts' | 'reviews' | 'activity' | 'profile'
type Period = '7d' | '30d' | '90d' | '1y'

const formatCurrency = (n: number) =>
  `R${(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const toDateStr = (v: any): string => {
  if (!v) return '—'
  if (v._seconds) return new Date(v._seconds * 1000).toLocaleDateString()
  if (typeof v === 'string') return new Date(v).toLocaleDateString()
  if (v instanceof Date) return v.toLocaleDateString()
  return '—'
}

const toDateTimeStr = (v: any): string => {
  if (!v) return '—'
  if (typeof v === 'string') return new Date(v).toLocaleString()
  if (v._seconds) return new Date(v._seconds * 1000).toLocaleString()
  return '—'
}

const Kpi = ({ label, value, icon: Icon, tone = 'gray' }: { label: string; value: string; icon: any; tone?: string }) => {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
    indigo: 'bg-indigo-100 text-indigo-600'
  }
  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between">
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
      </div>
      <div className={`rounded-lg p-2 ${tones[tone] || tones.gray}`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  )
}

const StatusPill = ({ text, tone = 'gray' }: { text: string; tone?: string }) => {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    indigo: 'bg-indigo-100 text-indigo-700'
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone] || tones.gray}`}>{text}</span>
}

const statusTone = (s: string): string => {
  const map: Record<string, string> = {
    active: 'green', scheduled: 'blue', sold: 'indigo', ended: 'gray',
    pending: 'amber', pending_payment: 'amber', processing: 'blue',
    shipped: 'indigo', delivered: 'green', cancelled: 'red',
    paid: 'green', completed: 'green', approved: 'green', rejected: 'red'
  }
  return map[s] || 'gray'
}

const AdminSellerDetailPage = () => {
  const { sellerId } = useParams<{ sellerId: string }>()
  const navigate = useNavigate()

  const [seller, setSeller] = useState<AdminSellerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const [period, setPeriod] = useState<Period>('30d')
  const [series, setSeries] = useState<AdminSellerTimeseriesPoint[]>([])
  const [timeseriesTotals, setTimeseriesTotals] = useState({ grossRevenue: 0, netRevenue: 0, orders: 0, newBids: 0 })

  const [tab, setTab] = useState<TabId>('products')
  const [products, setProducts] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [activity, setActivity] = useState<AdminSellerActivityEvent[]>([])

  useEffect(() => {
    if (!sellerId) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await getAdminSellerDetail(sellerId)
        setSeller(res.data)
      } catch (err) {
        console.error(err)
        toast.error('Failed to load seller')
        navigate('/admin/sellers')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sellerId, navigate])

  useEffect(() => {
    if (!sellerId) return
    getAdminSellerTimeseries(sellerId, period)
      .then(r => {
        setSeries(r.data.series)
        setTimeseriesTotals(r.data.totals)
      })
      .catch(() => toast.error('Failed to load timeseries'))
  }, [sellerId, period])

  useEffect(() => {
    if (!sellerId) return
    if (tab === 'products' && products.length === 0) {
      getAdminSellerProducts(sellerId).then(r => setProducts(r.data || [])).catch(() => {})
    } else if (tab === 'orders' && orders.length === 0) {
      getAdminSellerOrders(sellerId).then(r => setOrders(r.data || [])).catch(() => {})
    } else if (tab === 'payouts' && payouts.length === 0) {
      getAdminSellerPayouts(sellerId).then(r => setPayouts(r.data || [])).catch(() => {})
    } else if (tab === 'activity' && activity.length === 0) {
      getAdminSellerActivity(sellerId, 100).then(r => setActivity(r.data || [])).catch(() => {})
    }
  }, [tab, sellerId])

  const handleToggleVerified = async () => {
    if (!seller) return
    setToggling(true)
    try {
      await toggleSellerVerified(seller.id, !seller.verifiedSeller)
      setSeller({
        ...seller,
        verifiedSeller: !seller.verifiedSeller,
        sellerProfile: { ...(seller.sellerProfile || {}), verifiedSeller: !seller.verifiedSeller }
      })
      toast.success(seller.verifiedSeller ? 'Unverified' : 'Verified')
    } catch {
      toast.error('Failed to toggle verification')
    } finally {
      setToggling(false)
    }
  }

  const reviewsFromProfile = useMemo(() => {
    return {
      count: seller?.ratingCount || 0,
      avg: seller?.averageRating || 0
    }
  }, [seller])

  if (loading || !seller) {
    return <div className="p-10 text-center text-gray-500">Loading seller…</div>
  }

  const chartData = series.map(s => ({
    date: s.date.slice(5),
    'Net revenue': Number(s.netRevenue.toFixed(2)),
    'Gross revenue': Number(s.grossRevenue.toFixed(2)),
    Orders: s.orders
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <button
        onClick={() => navigate('/admin/sellers')}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to Sellers
      </button>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          {seller.logoUrl ? (
            <img src={seller.logoUrl} alt="" className="h-20 w-20 rounded-full object-cover bg-gray-100" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-indigo-100 flex items-center justify-center text-3xl font-bold text-indigo-600">
              {seller.businessName.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{seller.businessName}</h1>
              {seller.verifiedSeller && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                  <ShieldCheckIcon className="h-4 w-4" />
                  Verified
                </span>
              )}
              <StatusPill text={`KYC: ${seller.kycStatus}`} tone={seller.kycStatus === 'APPROVED' ? 'green' : 'gray'} />
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {seller.slug ? `@${seller.slug} · ` : ''}{seller.email || '—'}
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <div className="flex items-center">
                <StarIcon className="h-4 w-4 text-yellow-500 mr-1" />
                {reviewsFromProfile.avg.toFixed(1)} ({reviewsFromProfile.count})
              </div>
              <div>Member since {toDateStr(seller.memberSinceAsSeller || seller.createdAt)}</div>
              <div>Last login: {toDateTimeStr(seller.lastLoginAt)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToggleVerified}
              disabled={toggling}
              className={`inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium border ${
                seller.verifiedSeller
                  ? 'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <ShieldCheckIcon className="h-4 w-4" />
              {seller.verifiedSeller ? 'Unverify' : 'Verify'}
            </button>
            {seller.email && (
              <a
                href={`mailto:${seller.email}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <EnvelopeIcon className="h-4 w-4" />
                Email
              </a>
            )}
            <Link
              to={`/seller/${seller.slug || seller.id}`}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              target="_blank"
              rel="noreferrer"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Storefront
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi label="Total Products" value={String(seller.productCount)} icon={CubeIcon} tone="indigo" />
        <Kpi label="Active Listings" value={String(seller.activeListings)} icon={CubeIcon} tone="blue" />
        <Kpi label="Total Orders" value={String(seller.totalOrders)} icon={ShoppingBagIcon} tone="purple" />
        <Kpi label="Net Revenue" value={formatCurrency(seller.netRevenue)} icon={BanknotesIcon} tone="green" />
        <Kpi label="Available Balance" value={formatCurrency(seller.balance)} icon={WalletIcon} tone="green" />
        <Kpi label="Pending Balance" value={formatCurrency(seller.pendingBalance)} icon={WalletIcon} tone="amber" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Revenue & Orders</h2>
          <div className="flex gap-1 rounded-md bg-gray-100 p-1">
            {(['7d', '30d', '90d', '1y'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded ${
                  period === p ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
          <div><span className="text-gray-500">Gross: </span><span className="font-semibold">{formatCurrency(timeseriesTotals.grossRevenue)}</span></div>
          <div><span className="text-gray-500">Net: </span><span className="font-semibold text-green-600">{formatCurrency(timeseriesTotals.netRevenue)}</span></div>
          <div><span className="text-gray-500">Orders: </span><span className="font-semibold">{timeseriesTotals.orders}</span></div>
          <div><span className="text-gray-500">New bids: </span><span className="font-semibold">{timeseriesTotals.newBids}</span></div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Gross revenue" stroke="#9ca3af" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Net revenue" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Orders" stroke="#6366f1" strokeWidth={2} dot={false} yAxisId={0} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="border-b overflow-x-auto">
          <div className="flex gap-1 p-2 min-w-max">
            {([
              { id: 'products', label: 'Products', icon: CubeIcon },
              { id: 'orders', label: 'Orders', icon: ShoppingBagIcon },
              { id: 'payouts', label: 'Payouts', icon: BanknotesIcon },
              { id: 'reviews', label: 'Reviews', icon: StarIcon },
              { id: 'activity', label: 'Activity', icon: ClockIcon },
              { id: 'profile', label: 'Business Profile', icon: IdentificationIcon }
            ] as { id: TabId; label: string; icon: any }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm ${
                  tab === t.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {tab === 'products' && (
            products.length === 0 ? (
              <EmptyState icon={CubeIcon} text="No products for this seller." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Current Price</th>
                      <th className="px-4 py-2 text-left">Bids</th>
                      <th className="px-4 py-2 text-left">Views</th>
                      <th className="px-4 py-2 text-left">Created</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {products.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{p.title}</td>
                        <td className="px-4 py-2"><StatusPill text={p.status || '—'} tone={statusTone(p.status)} /></td>
                        <td className="px-4 py-2">{formatCurrency(p.currentPrice || p.startingPrice)}</td>
                        <td className="px-4 py-2">{p.bidsCount || p.totalBids || 0}</td>
                        <td className="px-4 py-2">{p.views || 0}</td>
                        <td className="px-4 py-2">{toDateStr(p.createdAt)}</td>
                        <td className="px-4 py-2 text-right">
                          <Link to={`/admin/products/edit/${p.id}`} className="text-indigo-600 hover:underline">Open</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'orders' && (
            orders.length === 0 ? (
              <EmptyState icon={ShoppingBagIcon} text="No orders for this seller." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Order</th>
                      <th className="px-4 py-2 text-left">Amount</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Payment</th>
                      <th className="px-4 py-2 text-left">Buyer</th>
                      <th className="px-4 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs">#{o.id.slice(0, 8)}</td>
                        <td className="px-4 py-2">{formatCurrency(parseFloat(o.amount || 0))}</td>
                        <td className="px-4 py-2"><StatusPill text={o.status || '—'} tone={statusTone(o.status)} /></td>
                        <td className="px-4 py-2"><StatusPill text={o.paymentStatus || '—'} tone={statusTone(o.paymentStatus)} /></td>
                        <td className="px-4 py-2">{o.buyerName || o.buyer || o.buyerId || '—'}</td>
                        <td className="px-4 py-2">{toDateStr(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'payouts' && (
            payouts.length === 0 ? (
              <EmptyState icon={BanknotesIcon} text="No payout requests." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Amount</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Bank</th>
                      <th className="px-4 py-2 text-left">Requested</th>
                      <th className="px-4 py-2 text-left">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {payouts.map(w => (
                      <tr key={w.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{formatCurrency(parseFloat(w.amount || 0))}</td>
                        <td className="px-4 py-2"><StatusPill text={w.status || 'pending'} tone={statusTone(w.status)} /></td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {w.bankDetails?.bankName || '—'} ····{String(w.bankDetails?.accountNumber || '').slice(-4)}
                        </td>
                        <td className="px-4 py-2">{toDateTimeStr(w.requestedAt || w.createdAt)}</td>
                        <td className="px-4 py-2">{toDateTimeStr(w.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'reviews' && (
            <div className="text-sm text-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <StarIcon className="h-5 w-5 text-yellow-500" />
                <span className="font-semibold">{reviewsFromProfile.avg.toFixed(1)}</span>
                <span className="text-gray-500">· {reviewsFromProfile.count} reviews</span>
              </div>
              <p className="text-gray-500 text-sm">
                Detailed reviews are viewable on the public storefront.{' '}
                <Link to={`/seller/${seller.slug || seller.id}`} className="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">
                  Open storefront →
                </Link>
              </p>
            </div>
          )}

          {tab === 'activity' && (
            activity.length === 0 ? (
              <EmptyState icon={ClockIcon} text="No recent activity." />
            ) : (
              <ol className="relative border-l border-gray-200 pl-4 space-y-4">
                {activity.map((e, i) => (
                  <li key={`${e.type}-${e.timestamp}-${i}`} className="ml-2">
                    <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-indigo-500 border-2 border-white" />
                    <div className="text-sm font-medium text-gray-900">{e.title}</div>
                    {e.detail && <div className="text-xs text-gray-500">{e.detail}</div>}
                    <div className="text-xs text-gray-400">{toDateTimeStr(e.timestamp)}</div>
                  </li>
                ))}
              </ol>
            )
          )}

          {tab === 'profile' && (
            <div className="space-y-4 text-sm">
              <Section title="Business identity">
                <KV label="Business name" value={seller.sellerProfile?.businessName || '—'} />
                <KV label="Slug" value={seller.sellerProfile?.slug || '—'} />
                <KV label="Verified" value={seller.verifiedSeller ? 'Yes' : 'No'} />
                <KV label="Member since" value={toDateStr(seller.memberSinceAsSeller)} />
                <KV label="Description" value={seller.sellerProfile?.description || '—'} />
              </Section>

              <Section title="Contact">
                <KV label="Email" value={seller.email || '—'} />
                <KV label="Phone" value={seller.phone || '—'} />
                <KV label="Contact email (public)" value={seller.sellerProfile?.contactEmail || '—'} />
              </Section>

              <Section title="Policies">
                <KV label="Return policy" value={seller.sellerProfile?.returnPolicy || '—'} />
                <KV label="Shipping policy" value={seller.sellerProfile?.shippingPolicy || '—'} />
              </Section>

              <Section title="Application">
                <KV label="Status" value={seller.sellerApplication?.status || '—'} />
                <KV label="Reviewed at" value={toDateTimeStr(seller.sellerApplication?.reviewedAt)} />
                <KV label="Reviewer" value={seller.sellerApplication?.reviewedBy || '—'} />
                <KV label="Rejection reason" value={seller.sellerApplication?.rejectionReason || '—'} />
              </Section>

              <Section title="Wallet">
                <KV label="Available balance" value={formatCurrency(seller.balance)} />
                <KV label="Pending balance" value={formatCurrency(seller.pendingBalance)} />
                <KV label="Held balance" value={formatCurrency(seller.heldBalance)} />
              </Section>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

const EmptyState = ({ icon: Icon, text }: { icon: any; text: string }) => (
  <div className="py-10 flex flex-col items-center text-gray-400">
    <Icon className="h-10 w-10 mb-2" />
    <div className="text-sm">{text}</div>
  </div>
)

const Section = ({ title, children }: { title: string; children: any }) => (
  <div>
    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">{children}</div>
  </div>
)

const KV = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2 border-b border-gray-100 py-1">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-900 text-right break-words">{value}</span>
  </div>
)

export default AdminSellerDetailPage
