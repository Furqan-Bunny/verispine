import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  MagnifyingGlassIcon,
  GiftIcon,
  EyeIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import PaginationBar from '../../components/admin/PaginationBar'
import {
  listAdminAffiliates,
  AdminAffiliateRow,
  AdminAffiliateTotals,
  AdminListAffiliatesParams
} from '../../services/adminAffiliateService'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import { adminBulkDelete } from '../../services/adminDelete'

const formatCurrency = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const toDateStr = (v: any): string => {
  if (!v) return '—'
  if (v._seconds) return new Date(v._seconds * 1000).toLocaleDateString()
  if (typeof v === 'string') return new Date(v).toLocaleDateString()
  if (v instanceof Date) return v.toLocaleDateString()
  return '—'
}

const emptyTotals: AdminAffiliateTotals = {
  totalPaidOut: 0,
  totalPending: 0,
  totalReferralSales: 0,
  totalReferredUsers: 0,
  totalOwed: 0,
  affiliateCount: 0
}

const AdminAffiliates = () => {
  const [rows, setRows] = useState<AdminAffiliateRow[]>([])
  const [totals, setTotals] = useState<AdminAffiliateTotals>(emptyTotals)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<AdminListAffiliatesParams['sortBy']>('earnings')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Delete state
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('affiliates', ids)
      setRows(prev => prev.filter((r: any) => !ids.includes(r.id)))
      res.failed?.length
        ? toast.error(`${res.failed.length} failed: ${res.failed[0].reason}`)
        : toast.success(`Removed ${res.deleted} affiliate${res.deleted > 1 ? 's' : ''}`)
      sel.clear()
      setRowToDelete(null)
      setBulkOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await listAdminAffiliates({
        search: search || undefined,
        sortBy,
        page,
        limit: pageSize
      })
      setRows(res.data)
      setTotals(res.totals || emptyTotals)
      setTotal(res.pagination.total)
    } catch (err) {
      console.error('Failed to load affiliates', err)
      toast.error('Failed to load affiliates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [sortBy, page])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      load()
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <GiftIcon className="h-8 w-8 text-indigo-600 mr-3" />
          Affiliates
        </h1>
        <p className="text-gray-600 mt-2">
          Everyone enrolled in the affiliate program, their earnings and the users they referred
        </p>
      </div>

      {/* Platform-wide totals */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">Total Affiliates</div>
          <div className="text-2xl font-bold text-gray-900">{totals.affiliateCount}</div>
          <div className="text-xs text-gray-400 mt-1">{totals.totalReferredUsers} referred users</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">Commission Paid Out</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(totals.totalPaidOut)}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">Commission Pending</div>
          <div className="text-2xl font-bold text-amber-600">{formatCurrency(totals.totalPending)}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">Referral Sales</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(totals.totalReferralSales)}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="input-field pl-10"
          />
        </div>

        <select
          value={sortBy}
          onChange={e => {
            setSortBy(e.target.value as any)
            setPage(1)
          }}
          className="input-field md:w-56"
        >
          <option value="earnings">Sort: Commission earned</option>
          <option value="pending">Sort: Commission pending</option>
          <option value="referrals">Sort: Referred users</option>
          <option value="sales">Sort: Referral sales</option>
          <option value="activated">Sort: Recently activated</option>
        </select>
      </div>

      <BulkDeleteBar
        count={sel.selected.length}
        label="affiliate"
        onClear={sel.clear}
        onDelete={() => setBulkOpen(true)}
      />
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={sel.allSelected(rows.map((r) => r.id))}
                    onChange={() => sel.toggleAll(rows.map((r) => r.id))}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Affiliate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Affiliate Since</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Referred Users</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purchases</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Earned</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pending</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Loading affiliates…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No affiliates match your filters.</td></tr>
              ) : (
                rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={sel.isSelected(r.id)}
                        onChange={() => sel.toggle(r.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                          {(r.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <Link
                            to={`/admin/affiliates/${r.id}`}
                            className="font-medium text-gray-900 hover:text-indigo-600"
                          >
                            {r.name}
                          </Link>
                          <div className="text-xs text-gray-500">{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{toDateStr(r.affiliateActivatedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.referredUsersCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{r.referralPurchases}</div>
                      <div className="text-xs text-gray-400">{formatCurrency(r.grossReferralSales)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">{formatCurrency(r.totalEarned)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="text-amber-600">{formatCurrency(r.pendingCommission)}</div>
                      {r.owedFromReversals > 0 && (
                        <div className="text-xs text-red-500">−{formatCurrency(r.owedFromReversals)} owed</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          to={`/admin/affiliates/${r.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          <EyeIcon className="h-4 w-4" />
                          View
                        </Link>
                        <button
                          onClick={() => setRowToDelete(r.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-red-200 text-xs text-red-600 hover:bg-red-50"
                          title="Remove affiliate"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="border-t p-3">
            <PaginationBar
              total={total}
              start={(page - 1) * pageSize + 1}
              end={Math.min(page * pageSize, total)}
              currentPage={page}
              totalPages={Math.max(1, Math.ceil(total / pageSize))}
              onPageChange={setPage}
              label="affiliate"
            />
          </div>
        )}
      </div>

      {/* Single Remove Affiliate Confirmation */}
      <ConfirmDialog
        open={!!rowToDelete}
        title="Remove affiliate"
        message="This revokes the user's affiliate status and removes their affiliate data. The user account is kept."
        confirmLabel="Remove affiliate"
        loading={deleting}
        onConfirm={() => doDelete([rowToDelete!])}
        onCancel={() => setRowToDelete(null)}
      />

      {/* Bulk Remove Affiliate Confirmation */}
      <ConfirmDialog
        open={bulkOpen}
        title={`Remove ${sel.selected.length} affiliate${sel.selected.length > 1 ? 's' : ''}`}
        message="This revokes the selected users' affiliate status and removes their affiliate data. The user accounts are kept."
        confirmLabel="Remove affiliates"
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />
    </motion.div>
  )
}

export default AdminAffiliates
