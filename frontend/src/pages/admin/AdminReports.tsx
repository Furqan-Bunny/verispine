import { motion } from 'framer-motion'
import { useState, useEffect, useCallback } from 'react'
import {
  DocumentArrowDownIcon,
  CalendarIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ShoppingBagIcon,
  ArrowTrendingUpIcon,
  PrinterIcon
} from '@heroicons/react/24/outline'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatPrice } from '../../utils/formatters'
import { exportReportPDF, exportReportExcel } from '../../utils/reportExport'
import axios from '../../config/axios'

const CHART_COLORS = ['#f97316', '#0ea5e9', '#10b981', '#8b5cf6', '#6b7280', '#ef4444', '#14b8a6', '#f59e0b']

interface AnalyticsData {
  dailyRevenue: Record<string, number>
  paymentMethods: Record<string, number>
  stats: {
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    platformFees: number
    successRate: number
  }
}

interface DashboardData {
  stats: {
    users: { total: number; sellers: number; buyers: number; admins: number; activeToday: number; verified: number }
    products: { total: number; active: number; ended: number; sold: number; avgPrice: number; totalValue: number }
    orders: { total: number; totalRevenue: number; platformFees: number }
  }
  topProducts: Array<{ id: string; title: string; currentPrice?: number; startingPrice?: number; views?: number; category?: string; status?: string }>
}

const AdminReports = () => {
  const [dateRange, setDateRange] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [reportType, setReportType] = useState('sales')
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)

  const periodMap: Record<string, string> = {
    week: '7d',
    month: '30d',
    quarter: '90d',
    year: '1y'
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Custom from–to range wins over the preset; wait for at least a "from" date.
      const params: Record<string, string> = dateRange === 'custom' && customFrom
        ? { startDate: customFrom, endDate: customTo || customFrom }
        : { period: periodMap[dateRange] || '30d' }
      const [analyticsRes, dashboardRes] = await Promise.all([
        axios.get('/api/admin-ext/payments/analytics', { params }),
        axios.get('/api/admin/dashboard')
      ])

      if (analyticsRes.data.success) {
        setAnalytics(analyticsRes.data.data)
      }
      if (dashboardRes.data.success) {
        setDashboard(dashboardRes.data.data)
      }
    } catch (error) {
      console.error('Error fetching report data:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRange, customFrom, customTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Transform dailyRevenue object into sorted chart array
  const revenueChartData = analytics?.dailyRevenue
    ? Object.entries(analytics.dailyRevenue)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, revenue]) => ({
          date: new Date(date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }),
          revenue
        }))
    : []

  // Payment methods pie chart data
  const paymentMethodsData = analytics?.paymentMethods
    ? Object.entries(analytics.paymentMethods).map(([name, value], i) => ({
        name: name === 'ozow' ? 'Ozow' : name === 'card' ? 'Card' : name,
        value,
        color: CHART_COLORS[i % CHART_COLORS.length]
      }))
    : []

  // Category distribution from products
  const categoryData = dashboard?.topProducts
    ? (() => {
        const cats: Record<string, number> = {}
        dashboard.topProducts.forEach(p => {
          const cat = p.category || 'Uncategorized'
          cats[cat] = (cats[cat] || 0) + 1
        })
        return Object.entries(cats).map(([name, value], i) => ({
          name,
          value,
          color: CHART_COLORS[i % CHART_COLORS.length]
        }))
      })()
    : []

  // User distribution for pie chart
  const userDistribution = dashboard?.stats?.users
    ? [
        { name: 'Buyers', value: dashboard.stats.users.buyers, color: '#0ea5e9' },
        { name: 'Sellers', value: dashboard.stats.users.sellers, color: '#f97316' },
        { name: 'Admins', value: dashboard.stats.users.admins, color: '#8b5cf6' }
      ].filter(d => d.value > 0)
    : []

  const reports = [
    { title: 'Sales Report', type: 'sales', icon: CurrencyDollarIcon, color: 'text-green-600', bgColor: 'bg-green-100' },
    { title: 'User Report', type: 'users', icon: UserGroupIcon, color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { title: 'Product Report', type: 'products', icon: ShoppingBagIcon, color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { title: 'Revenue Report', type: 'revenue', icon: ArrowTrendingUpIcon, color: 'text-orange-600', bgColor: 'bg-orange-100' }
  ]

  const handleExport = (format: string) => {
    // For a custom range, show the actual dates in the exported report's period label.
    const rangeLabel = dateRange === 'custom' && customFrom
      ? `${customFrom} to ${customTo || customFrom}`
      : dateRange
    if (format === 'print') {
      window.print()
    } else if (format === 'pdf') {
      exportReportPDF(reportType, analytics, dashboard, rangeLabel)
    } else if (format === 'excel') {
      exportReportExcel(reportType, analytics, dashboard, rangeLabel)
    }
  }

  const stats = analytics?.stats
  const userStats = dashboard?.stats?.users
  const productStats = dashboard?.stats?.products

  // Render charts based on selected report type
  const renderCharts = () => {
    if (loading) {
      return (
        <div className="col-span-2 flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      )
    }

    switch (reportType) {
      case 'sales':
        return (
          <>
            {/* Revenue Trend */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
              {revenueChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value) => formatPrice(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} name="Revenue" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-10">No revenue data for this period</p>
              )}
            </div>

            {/* Category Distribution */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Sales by Category</h3>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={100} dataKey="value">
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-10">No category data available</p>
              )}
            </div>

            {/* Top Products */}
            <div className="card lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Products</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-sm font-medium text-gray-700">Product</th>
                      <th className="text-center py-2 text-sm font-medium text-gray-700">Views</th>
                      <th className="text-center py-2 text-sm font-medium text-gray-700">Status</th>
                      <th className="text-right py-2 text-sm font-medium text-gray-700">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(dashboard?.topProducts || []).slice(0, 10).map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="py-3 text-sm text-gray-900">{product.title}</td>
                        <td className="py-3 text-sm text-gray-600 text-center">{product.views || 0}</td>
                        <td className="py-3 text-sm text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {product.status || 'unknown'}
                          </span>
                        </td>
                        <td className="py-3 text-sm font-medium text-gray-900 text-right">
                          {formatPrice(product.currentPrice || product.startingPrice || 0)}
                        </td>
                      </tr>
                    ))}
                    {(!dashboard?.topProducts || dashboard.topProducts.length === 0) && (
                      <tr><td colSpan={4} className="py-6 text-center text-gray-500">No products found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'users':
        return (
          <>
            {/* User Distribution */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">User Distribution</h3>
              {userDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={userDistribution} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={100} dataKey="value">
                      {userDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-10">No user data available</p>
              )}
            </div>

            {/* User Stats Summary */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">User Overview</h3>
              <div className="space-y-4">
                {[
                  { label: 'Total Users', value: userStats?.total || 0, color: 'bg-blue-500' },
                  { label: 'Sellers', value: userStats?.sellers || 0, color: 'bg-orange-500' },
                  { label: 'Buyers', value: userStats?.buyers || 0, color: 'bg-green-500' },
                  { label: 'Active Today', value: userStats?.activeToday || 0, color: 'bg-purple-500' },
                  { label: 'Verified', value: userStats?.verified || 0, color: 'bg-teal-500' }
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${item.color}`} />
                      <span className="text-sm text-gray-700">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )

      case 'products':
        return (
          <>
            {/* Product Status Distribution */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Status</h3>
              {productStats ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={[
                    { status: 'Active', count: productStats.active },
                    { status: 'Ended', count: productStats.ended },
                    { status: 'Sold', count: productStats.sold }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" name="Products" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-10">No product data available</p>
              )}
            </div>

            {/* Category Distribution */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Distribution</h3>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={100} dataKey="value">
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-10">No category data available</p>
              )}
            </div>

            {/* Top Products Table */}
            <div className="card lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Products by Views</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-sm font-medium text-gray-700">Product</th>
                      <th className="text-center py-2 text-sm font-medium text-gray-700">Views</th>
                      <th className="text-center py-2 text-sm font-medium text-gray-700">Status</th>
                      <th className="text-right py-2 text-sm font-medium text-gray-700">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(dashboard?.topProducts || []).slice(0, 10).map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="py-3 text-sm text-gray-900">{product.title}</td>
                        <td className="py-3 text-sm text-gray-600 text-center">{product.views || 0}</td>
                        <td className="py-3 text-sm text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {product.status || 'unknown'}
                          </span>
                        </td>
                        <td className="py-3 text-sm font-medium text-gray-900 text-right">
                          {formatPrice(product.currentPrice || product.startingPrice || 0)}
                        </td>
                      </tr>
                    ))}
                    {(!dashboard?.topProducts || dashboard.topProducts.length === 0) && (
                      <tr><td colSpan={4} className="py-6 text-center text-gray-500">No products found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'revenue':
        return (
          <>
            {/* Revenue Trend */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
              {revenueChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value) => formatPrice(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} name="Revenue" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-10">No revenue data for this period</p>
              )}
            </div>

            {/* Payment Methods */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
              {paymentMethodsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={paymentMethodsData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={100} dataKey="value">
                      {paymentMethodsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-10">No payment method data available</p>
              )}
            </div>
          </>
        )

      default:
        return null
    }
  }

  // Render summary stats based on report type
  const renderSummary = () => {
    if (loading) return null

    switch (reportType) {
      case 'sales':
        return (
          <>
            <SummaryCard label="Total Revenue" value={formatPrice(stats?.totalRevenue || 0)} gradient="from-green-50 to-green-100" textColor="text-green-600" boldColor="text-green-900" icon={<ChartBarIcon className="h-10 w-10 text-green-500" />} />
            <SummaryCard label="Total Orders" value={(stats?.totalOrders || 0).toLocaleString()} gradient="from-blue-50 to-blue-100" textColor="text-blue-600" boldColor="text-blue-900" icon={<ShoppingBagIcon className="h-10 w-10 text-blue-500" />} />
            <SummaryCard label="Avg Order Value" value={formatPrice(stats?.averageOrderValue || 0)} gradient="from-orange-50 to-orange-100" textColor="text-orange-600" boldColor="text-orange-900" icon={<CurrencyDollarIcon className="h-10 w-10 text-orange-500" />} />
            <SummaryCard label="Success Rate" value={`${(stats?.successRate || 0).toFixed(1)}%`} gradient="from-purple-50 to-purple-100" textColor="text-purple-600" boldColor="text-purple-900" icon={<ArrowTrendingUpIcon className="h-10 w-10 text-purple-500" />} />
          </>
        )

      case 'users':
        return (
          <>
            <SummaryCard label="Total Users" value={(userStats?.total || 0).toLocaleString()} gradient="from-blue-50 to-blue-100" textColor="text-blue-600" boldColor="text-blue-900" icon={<UserGroupIcon className="h-10 w-10 text-blue-500" />} />
            <SummaryCard label="Sellers" value={(userStats?.sellers || 0).toLocaleString()} gradient="from-orange-50 to-orange-100" textColor="text-orange-600" boldColor="text-orange-900" icon={<ShoppingBagIcon className="h-10 w-10 text-orange-500" />} />
            <SummaryCard label="Buyers" value={(userStats?.buyers || 0).toLocaleString()} gradient="from-green-50 to-green-100" textColor="text-green-600" boldColor="text-green-900" icon={<CurrencyDollarIcon className="h-10 w-10 text-green-500" />} />
            <SummaryCard label="Active Today" value={(userStats?.activeToday || 0).toLocaleString()} gradient="from-purple-50 to-purple-100" textColor="text-purple-600" boldColor="text-purple-900" icon={<ArrowTrendingUpIcon className="h-10 w-10 text-purple-500" />} />
          </>
        )

      case 'products':
        return (
          <>
            <SummaryCard label="Total Products" value={(productStats?.total || 0).toLocaleString()} gradient="from-purple-50 to-purple-100" textColor="text-purple-600" boldColor="text-purple-900" icon={<ShoppingBagIcon className="h-10 w-10 text-purple-500" />} />
            <SummaryCard label="Active" value={(productStats?.active || 0).toLocaleString()} gradient="from-green-50 to-green-100" textColor="text-green-600" boldColor="text-green-900" icon={<ChartBarIcon className="h-10 w-10 text-green-500" />} />
            <SummaryCard label="Sold" value={(productStats?.sold || 0).toLocaleString()} gradient="from-blue-50 to-blue-100" textColor="text-blue-600" boldColor="text-blue-900" icon={<CurrencyDollarIcon className="h-10 w-10 text-blue-500" />} />
            <SummaryCard label="Avg Price" value={formatPrice(productStats?.avgPrice || 0)} gradient="from-orange-50 to-orange-100" textColor="text-orange-600" boldColor="text-orange-900" icon={<ArrowTrendingUpIcon className="h-10 w-10 text-orange-500" />} />
          </>
        )

      case 'revenue':
        return (
          <>
            <SummaryCard label="Total Revenue" value={formatPrice(stats?.totalRevenue || 0)} gradient="from-green-50 to-green-100" textColor="text-green-600" boldColor="text-green-900" icon={<ChartBarIcon className="h-10 w-10 text-green-500" />} />
            <SummaryCard label="Platform Fees" value={formatPrice(stats?.platformFees || 0)} gradient="from-blue-50 to-blue-100" textColor="text-blue-600" boldColor="text-blue-900" icon={<CurrencyDollarIcon className="h-10 w-10 text-blue-500" />} />
            <SummaryCard label="Net Revenue" value={formatPrice((stats?.totalRevenue || 0) - (stats?.platformFees || 0))} gradient="from-purple-50 to-purple-100" textColor="text-purple-600" boldColor="text-purple-900" icon={<ArrowTrendingUpIcon className="h-10 w-10 text-purple-500" />} />
            <SummaryCard label="Avg Order Value" value={formatPrice(stats?.averageOrderValue || 0)} gradient="from-orange-50 to-orange-100" textColor="text-orange-600" boldColor="text-orange-900" icon={<ShoppingBagIcon className="h-10 w-10 text-orange-500" />} />
          </>
        )

      default:
        return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Report Type Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {reports.map((report) => {
          const Icon = report.icon
          return (
            <motion.button
              key={report.type}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setReportType(report.type)}
              className={`
                card text-left transition-all
                ${reportType === report.type
                  ? 'ring-2 ring-primary-500 shadow-lg'
                  : 'hover:shadow-md'
                }
              `}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-3 rounded-lg ${report.bgColor}`}>
                  <Icon className={`h-6 w-6 ${report.color}`} />
                </div>
                {reportType === report.type && (
                  <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full">
                    Selected
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-gray-900">{report.title}</h3>
              <p className="text-sm text-gray-600 mt-1">
                Generate {report.type} analytics
              </p>
            </motion.button>
          )
        })}
      </div>

      {/* Date Range and Actions */}
      <div className="card">
        <div className="flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-gray-500" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="input-field w-auto"
              >
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="quarter">Last Quarter</option>
                <option value="year">Last Year</option>
                <option value="custom">Custom range…</option>
              </select>
            </div>
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="input-field w-auto"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="input-field w-auto"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleExport('print')}
              className="btn-outline flex items-center gap-2"
            >
              <PrinterIcon className="h-4 w-4" />
              Print
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="btn-outline flex items-center gap-2"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              Export PDF
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="btn-primary flex items-center gap-2"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderCharts()}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {renderSummary()}
      </div>
    </motion.div>
  )
}

function SummaryCard({ label, value, gradient, textColor, boldColor, icon }: {
  label: string; value: string; gradient: string; textColor: string; boldColor: string; icon: React.ReactNode
}) {
  return (
    <div className={`card bg-gradient-to-br ${gradient}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm ${textColor} font-medium`}>{label}</p>
          <p className={`text-2xl font-bold ${boldColor}`}>{value}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}

export default AdminReports
