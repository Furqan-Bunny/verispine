import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  BuildingStorefrontIcon,
  StarIcon,
  EyeIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import PaginationBar from '../../components/admin/PaginationBar'
import {
  listAdminSellers,
  toggleSellerVerified,
  AdminSellerRow,
  AdminListSellersParams
} from '../../services/adminSellerService'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import { adminBulkDelete } from '../../services/adminDelete'

const formatCurrency = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatRelativeMs = (ms: number | null) => {
  if (!ms) return 'Never'
  const diff = Date.now() - ms
  const min = 60_000
  const hr = 60 * min
  const day = 24 * hr
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m ago`
  if (diff < day) return `${Math.round(diff / hr)}h ago`
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`
  return new Date(ms).toLocaleDateString()
}

const Stars = ({ rating, count }: { rating: number; count: number }) => (
  <div className="flex items-center text-xs text-gray-700">
    <StarIcon className="h-4 w-4 text-yellow-500 mr-0.5" />
    <span className="font-medium">{(rating || 0).toFixed(1)}</span>
    <span className="text-gray-400 ml-1">({count || 0})</span>
  </div>
)

const AdminSellers = () => {
  const [rows, setRows] = useState<AdminSellerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [verified, setVerified] = useState<'all' | 'verified' | 'unverified'>('all')
  const [sortBy, setSortBy] = useState<AdminListSellersParams['sortBy']>('revenue')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const pageSize = 20
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await listAdminSellers({
        search: search || undefined,
        verified,
        sortBy,
        page,
        limit: pageSize
      })
      setRows(res.data)
      setTotal(res.pagination.total)
    } catch (err) {
      console.error('Failed to load sellers', err)
      toast.error('Failed to load sellers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [verified, sortBy, page])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      load()
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const handleToggleVerified = async (row: AdminSellerRow) => {
    setTogglingId(row.id)
    try {
      await toggleSellerVerified(row.id, !row.verifiedSeller)
      toast.success(row.verifiedSeller ? 'Unverified' : 'Verified')
      setRows(prev =>
        prev.map(r => (r.id === row.id ? { ...r, verifiedSeller: !r.verifiedSeller } : r))
      )
    } catch {
      toast.error('Failed to toggle verification')
    } finally {
      setTogglingId(null)
    }
  }

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('sellers', ids)
      setRows(prev => prev.filter(r => !ids.includes(r.id)))
      if (res.failed?.length) toast.error(`${res.failed.length} could not be deleted: ${res.failed[0].reason}`)
      else toast.success(`Deleted ${res.deleted}`)
      sel.clear(); setRowToDelete(null); setBulkOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const stats = useMemo(() => {
    const totalRevenue = rows.reduce((s, r) => s + r.netRevenue, 0)
    const verifiedCount = rows.filter(r => r.verifiedSeller).length
    const totalProducts = rows.reduce((s, r) => s + r.productCount, 0)
    return { totalRevenue, verifiedCount, totalProducts }
  }, [rows])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <BuildingStorefrontIcon className="h-8 w-8 text-indigo-600 mr-3" />
          Sellers
        </h1>
        <p className="text-gray-600 mt-2">
          All sellers on the platform with their performance KPIs
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">Total Sellers</div>
          <div className="text-2xl font-bold text-gray-900">{total}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">Verified (this page)</div>
          <div className="text-2xl font-bold text-blue-600">{stats.verifiedCount}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">Products (this page)</div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalProducts}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">Net Revenue (this page)</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalRevenue)}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or slug"
            className="input-field pl-10"
          />
        </div>

        <select
          value={verified}
          onChange={e => {
            setVerified(e.target.value as any)
            setPage(1)
          }}
          className="input-field md:w-44"
        >
          <option value="all">All sellers</option>
          <option value="verified">Verified only</option>
          <option value="unverified">Unverified only</option>
        </select>

        <select
          value={sortBy}
          onChange={e => {
            setSortBy(e.target.value as any)
            setPage(1)
          }}
          className="input-field md:w-48"
        >
          <option value="revenue">Sort: Net revenue</option>
          <option value="sales">Sort: Total orders</option>
          <option value="products">Sort: Products</option>
          <option value="rating">Sort: Rating</option>
          <option value="joined">Sort: Member since</option>
        </select>
      </div>

      <BulkDeleteBar
        count={sel.selected.length}
        label="seller"
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
                    checked={sel.allSelected(rows.map(r => r.id))}
                    onChange={() => sel.toggleAll(rows.map(r => r.id))}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seller</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orders</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Revenue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Active</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">Loading sellers…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No sellers match your filters.</td></tr>
              ) : (
                rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={sel.isSelected(r.id)}
                        onChange={() => sel.toggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {r.logoUrl ? (
                          <img src={r.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover bg-gray-100" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                            {r.businessName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <Link
                            to={`/admin/sellers/${r.id}`}
                            className="font-medium text-gray-900 hover:text-indigo-600 flex items-center gap-1"
                          >
                            {r.businessName}
                            {r.verifiedSeller && (
                              <ShieldCheckIcon className="h-4 w-4 text-blue-500" title="Verified seller" />
                            )}
                          </Link>
                          <div className="text-xs text-gray-500">
                            {r.slug ? `@${r.slug}` : r.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Stars rating={r.averageRating} count={r.ratingCount} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{r.productCount}</div>
                      <div className="text-xs text-gray-400">{r.activeListings} active</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.totalOrders}</td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">{formatCurrency(r.netRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{formatCurrency(r.balance)}</div>
                      {r.pendingBalance > 0 && (
                        <div className="text-xs text-amber-600">+{formatCurrency(r.pendingBalance)} pending</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatRelativeMs(r.lastActiveAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleToggleVerified(r)}
                          disabled={togglingId === r.id}
                          className={`p-1.5 rounded-md border text-xs ${
                            r.verifiedSeller
                              ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          } disabled:opacity-50`}
                          title={r.verifiedSeller ? 'Unverify seller' : 'Verify seller'}
                        >
                          <ShieldCheckIcon className="h-4 w-4" />
                        </button>
                        <Link
                          to={`/admin/sellers/${r.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          <EyeIcon className="h-4 w-4" />
                          View
                        </Link>
                        <button
                          onClick={() => setRowToDelete(r.id)}
                          title="Delete"
                          className="text-red-600 hover:text-red-800"
                        >
                          <TrashIcon className="h-5 w-5" />
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
              label="seller"
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete seller?"
        message="This permanently deletes the seller's underlying user account. This action cannot be undone."
        loading={deleting}
        onConfirm={() => doDelete([rowToDelete!])}
        onCancel={() => setRowToDelete(null)}
      />
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} seller${sel.selected.length > 1 ? 's' : ''}?`}
        message="This permanently deletes the selected sellers' underlying user accounts. This action cannot be undone."
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />
    </motion.div>
  )
}

export default AdminSellers
