import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  ArrowLeftIcon,
  EnvelopeIcon,
  UsersIcon,
  ShoppingBagIcon,
  BanknotesIcon,
  WalletIcon,
  ClockIcon,
  GiftIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import {
  getAdminAffiliateDetail,
  getAdminAffiliateTimeseries,
  getAdminAffiliateReferrals,
  getAdminAffiliateCommissions,
  getAdminAffiliateActivity,
  AdminAffiliateDetail,
  AdminAffiliateReferral,
  AdminAffiliateCommission,
  AdminAffiliateTimeseriesPoint,
  AdminAffiliateTimeseriesTotals,
  AdminAffiliateActivityEvent
} from '../../services/adminAffiliateService'

const emptyTotals: AdminAffiliateTimeseriesTotals = {
  commission: 0, released: 0, earned: 0, pending: 0,
  referredUsers: 0, referralPurchases: 0, grossReferralSales: 0
}

// Format an ISO yyyy-mm-dd as "12 May" (month by name, not number)
const fmtTick = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' })

const RANGE_LABELS: Record<string, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
  '1y': 'last year',
  custom: 'selected range'
}

type TabId = 'referrals' | 'commissions' | 'activity'
type Period = '7d' | '30d' | '90d' | '1y' | 'custom'

// yyyy-mm-dd for <input type="date">
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

const formatCurrency = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
  if (v instanceof Date) return v.toLocaleString()
  return '—'
}

const Kpi = ({ label, value, icon: Icon, tone = 'gray' }: { label: string; value: string; icon: any; tone?: string }) => {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    red: 'bg-red-100 text-red-600'
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
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    indigo: 'bg-indigo-100 text-indigo-700'
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone] || tones.gray}`}>{text}</span>
}

const commissionTone = (s: string): string => {
  const map: Record<string, string> = { pending: 'amber', credited: 'green', reversed: 'red' }
  return map[s] || 'gray'
}

const EmptyState = ({ icon: Icon, text }: { icon: any; text: string }) => (
  <div className="py-10 flex flex-col items-center text-gray-400">
    <Icon className="h-10 w-10 mb-2" />
    <div className="text-sm">{text}</div>
  </div>
)

const AdminAffiliateDetailPage = () => {
  const { affiliateId } = useParams<{ affiliateId: string }>()
  const navigate = useNavigate()

  const [affiliate, setAffiliate] = useState<AdminAffiliateDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState<Period>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [series, setSeries] = useState<AdminAffiliateTimeseriesPoint[]>([])
  const [timeseriesTotals, setTimeseriesTotals] = useState<AdminAffiliateTimeseriesTotals>(emptyTotals)

  const [tab, setTab] = useState<TabId>('referrals')
  const [referrals, setReferrals] = useState<AdminAffiliateReferral[]>([])
  const [commissions, setCommissions] = useState<AdminAffiliateCommission[]>([])
  const [activity, setActivity] = useState<AdminAffiliateActivityEvent[]>([])

  useEffect(() => {
    if (!affiliateId) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await getAdminAffiliateDetail(affiliateId)
        setAffiliate(res.data)
      } catch (err) {
        console.error(err)
        toast.error('Failed to load affiliate')
        navigate('/admin/affiliates')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [affiliateId, navigate])

  useEffect(() => {
    if (!affiliateId) return
    const isCustom = period === 'custom'
    // Wait until both custom dates are chosen before fetching.
    if (isCustom && (!customFrom || !customTo)) return
    getAdminAffiliateTimeseries(
      affiliateId,
      isCustom ? '30d' : period,
      isCustom ? customFrom : undefined,
      isCustom ? customTo : undefined
    )
      .then(r => {
        setSeries(r.data.series)
        setTimeseriesTotals(r.data.totals)
      })
      .catch(() => toast.error('Failed to load timeseries'))
  }, [affiliateId, period, customFrom, customTo])

  // When switching to Custom, seed sensible defaults (last 30 days) so inputs aren't empty.
  const selectCustom = () => {
    if (!customFrom || !customTo) {
      const today = new Date()
      const monthAgo = new Date(today.getTime() - 30 * 86400000)
      setCustomFrom(isoDay(monthAgo))
      setCustomTo(isoDay(today))
    }
    setPeriod('custom')
  }

  useEffect(() => {
    if (!affiliateId) return
    if (tab === 'referrals' && referrals.length === 0) {
      getAdminAffiliateReferrals(affiliateId).then(r => setReferrals(r.data || [])).catch(() => {})
    } else if (tab === 'commissions' && commissions.length === 0) {
      getAdminAffiliateCommissions(affiliateId).then(r => setCommissions(r.data || [])).catch(() => {})
    } else if (tab === 'activity' && activity.length === 0) {
      getAdminAffiliateActivity(affiliateId, 100).then(r => setActivity(r.data || [])).catch(() => {})
    }
  }, [tab, affiliateId])

  if (loading || !affiliate) {
    return <div className="p-10 text-center text-gray-500">Loading affiliate…</div>
  }

  const chartData = series.map(s => ({
    date: fmtTick(s.date),
    Commission: Number(s.commission.toFixed(2)),
    Released: Number(s.released.toFixed(2))
  }))

  const rangeLabel = RANGE_LABELS[period] || 'selected range'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <button
        onClick={() => navigate('/admin/affiliates')}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to Affiliates
      </button>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-indigo-100 flex items-center justify-center text-3xl font-bold text-indigo-600">
            {(affiliate.name || '?').slice(0, 1).toUpperCase()}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{affiliate.name}</h1>
              <StatusPill text={`KYC: ${affiliate.kycStatus}`} tone={affiliate.kycStatus === 'APPROVED' ? 'green' : 'gray'} />
              {affiliate.owedFromReversals > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  Owes {formatCurrency(affiliate.owedFromReversals)}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 mt-1">{affiliate.email || '—'}</div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 flex-wrap">
              <div className="flex items-center">
                <GiftIcon className="h-4 w-4 text-indigo-500 mr-1" />
                Affiliate since {toDateStr(affiliate.affiliateActivatedAt)}
              </div>
              <div>Last login: {toDateTimeStr(affiliate.lastLoginAt)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {affiliate.email && (
              <a
                href={`mailto:${affiliate.email}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <EnvelopeIcon className="h-4 w-4" />
                Email
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Time-range control — drives the cards below AND the chart */}
      <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-medium text-gray-700">
            Showing <span className="text-indigo-600 font-semibold">{rangeLabel}</span>
          </div>
          <div className="text-xs text-gray-400">Commission, referred users & purchases below are for this range. Balance & debt are live wallet values.</div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
            <button
              onClick={selectCustom}
              className={`px-3 py-1 text-xs rounded ${
                period === 'custom' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Custom
            </button>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={e => setCustomFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1 text-xs"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={e => setCustomTo(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi label="Commission Earned" value={formatCurrency(timeseriesTotals.earned)} icon={BanknotesIcon} tone="green" />
        <Kpi label="Pending" value={formatCurrency(timeseriesTotals.pending)} icon={ClockIcon} tone="amber" />
        <Kpi label="Referred Users" value={String(timeseriesTotals.referredUsers)} icon={UsersIcon} tone="indigo" />
        <Kpi label="Referral Purchases" value={String(timeseriesTotals.referralPurchases)} icon={ShoppingBagIcon} tone="purple" />
        <Kpi label="Available Balance (now)" value={formatCurrency(affiliate.balance)} icon={WalletIcon} tone="blue" />
        <Kpi label="Owed (now)" value={formatCurrency(affiliate.owedFromReversals)} icon={ExclamationTriangleIcon} tone={affiliate.owedFromReversals > 0 ? 'red' : 'gray'} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold">Commission Over Time</h2>
          <span className="text-xs text-gray-400 capitalize">{rangeLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div><span className="text-gray-500">Total commission: </span><span className="font-semibold">{formatCurrency(timeseriesTotals.commission)}</span></div>
          <div><span className="text-gray-500">Released: </span><span className="font-semibold text-green-600">{formatCurrency(timeseriesTotals.released)}</span></div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Commission" stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Released" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="border-b overflow-x-auto">
          <div className="flex gap-1 p-2 min-w-max">
            {([
              { id: 'referrals', label: 'Referred Users', icon: UsersIcon },
              { id: 'commissions', label: 'Commissions', icon: BanknotesIcon },
              { id: 'activity', label: 'Activity', icon: ClockIcon }
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
          {tab === 'referrals' && (
            referrals.length === 0 ? (
              <EmptyState icon={UsersIcon} text="No one has signed up under this affiliate yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">User</th>
                      <th className="px-4 py-2 text-left">Signed Up</th>
                      <th className="px-4 py-2 text-left">Via</th>
                      <th className="px-4 py-2 text-left">Purchases</th>
                      <th className="px-4 py-2 text-left">Total Spent</th>
                      <th className="px-4 py-2 text-left">Commission Generated</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {referrals.map(r => (
                      <tr key={r.userId} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900">{r.name}</div>
                          <div className="text-xs text-gray-500">{r.email}</div>
                        </td>
                        <td className="px-4 py-2">{toDateStr(r.signupDate)}</td>
                        <td className="px-4 py-2">
                          <StatusPill text={r.type === 'invite' ? 'Invitation' : 'Referral link'} tone={r.type === 'invite' ? 'indigo' : 'gray'} />
                        </td>
                        <td className="px-4 py-2">{r.purchaseCount}</td>
                        <td className="px-4 py-2">{formatCurrency(r.totalSpent)}</td>
                        <td className="px-4 py-2 font-medium text-green-600">{formatCurrency(r.commissionGenerated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'commissions' && (
            commissions.length === 0 ? (
              <EmptyState icon={BanknotesIcon} text="No commissions recorded yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Order</th>
                      <th className="px-4 py-2 text-left">Purchase</th>
                      <th className="px-4 py-2 text-left">Commission</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Earned</th>
                      <th className="px-4 py-2 text-left">Released / Reversed</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {commissions.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs">{c.orderId ? `#${c.orderId.slice(0, 8)}` : '—'}</td>
                        <td className="px-4 py-2">{formatCurrency(c.purchaseAmount)}</td>
                        <td className="px-4 py-2 font-medium">{formatCurrency(c.commissionAmount)}</td>
                        <td className="px-4 py-2"><StatusPill text={c.status} tone={commissionTone(c.status)} /></td>
                        <td className="px-4 py-2">{toDateStr(c.createdAt)}</td>
                        <td className="px-4 py-2">{toDateStr(c.releasedAt || c.reversedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
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
        </div>
      </div>
    </motion.div>
  )
}

export default AdminAffiliateDetailPage
