import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

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

const dateRangeLabels: Record<string, string> = {
  week: 'Last Week',
  month: 'Last Month',
  quarter: 'Last Quarter',
  year: 'Last Year'
}

const reportTypeLabels: Record<string, string> = {
  sales: 'Sales',
  users: 'User',
  products: 'Product',
  revenue: 'Revenue'
}

function formatRand(amount: number): string {
  return 'R ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── PDF Export ──────────────────────────────────────────────────────────────

export function exportReportPDF(
  reportType: string,
  analytics: AnalyticsData | null,
  dashboard: DashboardData | null,
  dateRange: string
) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // Header
  doc.setFontSize(20)
  doc.setTextColor(249, 115, 22) // orange-500
  doc.text('VeriSpine', 14, y)
  y += 10

  doc.setFontSize(14)
  doc.setTextColor(30, 30, 30)
  doc.text(`${reportTypeLabels[reportType] || reportType} Report`, 14, y)
  y += 8

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Period: ${dateRangeLabels[dateRange] || dateRange}`, 14, y)
  doc.text(`Generated: ${todayStr()}`, pageWidth - 14, y, { align: 'right' })
  y += 4

  // Divider line
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.5)
  doc.line(14, y, pageWidth - 14, y)
  y += 8

  const stats = analytics?.stats
  const userStats = dashboard?.stats?.users
  const productStats = dashboard?.stats?.products

  switch (reportType) {
    case 'sales': {
      // Summary table
      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: [
          ['Total Revenue', formatRand(stats?.totalRevenue || 0)],
          ['Total Orders', String(stats?.totalOrders || 0)],
          ['Average Order Value', formatRand(stats?.averageOrderValue || 0)],
          ['Success Rate', `${(stats?.successRate || 0).toFixed(1)}%`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [249, 115, 22] },
        margin: { left: 14, right: 14 }
      })
      y = (doc as any).lastAutoTable.finalY + 10

      // Daily Revenue
      if (analytics?.dailyRevenue && Object.keys(analytics.dailyRevenue).length > 0) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Daily Revenue', 14, y)
        y += 4

        const dailyRows = Object.entries(analytics.dailyRevenue)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, revenue]) => [date, formatRand(revenue)])

        autoTable(doc, {
          startY: y,
          head: [['Date', 'Revenue']],
          body: dailyRows,
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] },
          margin: { left: 14, right: 14 }
        })
        y = (doc as any).lastAutoTable.finalY + 10
      }

      // Top Products
      if (dashboard?.topProducts && dashboard.topProducts.length > 0) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Top Products', 14, y)
        y += 4

        const productRows = dashboard.topProducts.slice(0, 10).map(p => [
          p.title,
          String(p.views || 0),
          p.status || 'unknown',
          formatRand(p.currentPrice || p.startingPrice || 0)
        ])

        autoTable(doc, {
          startY: y,
          head: [['Product', 'Views', 'Status', 'Price']],
          body: productRows,
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] },
          margin: { left: 14, right: 14 }
        })
      }
      break
    }

    case 'users': {
      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: [
          ['Total Users', String(userStats?.total || 0)],
          ['Sellers', String(userStats?.sellers || 0)],
          ['Buyers', String(userStats?.buyers || 0)],
          ['Admins', String(userStats?.admins || 0)],
          ['Active Today', String(userStats?.activeToday || 0)],
          ['Verified', String(userStats?.verified || 0)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [14, 165, 233] },
        margin: { left: 14, right: 14 }
      })
      break
    }

    case 'products': {
      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: [
          ['Total Products', String(productStats?.total || 0)],
          ['Active', String(productStats?.active || 0)],
          ['Ended', String(productStats?.ended || 0)],
          ['Sold', String(productStats?.sold || 0)],
          ['Average Price', formatRand(productStats?.avgPrice || 0)],
          ['Total Value', formatRand(productStats?.totalValue || 0)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [139, 92, 246] },
        margin: { left: 14, right: 14 }
      })
      y = (doc as any).lastAutoTable.finalY + 10

      // Top Products
      if (dashboard?.topProducts && dashboard.topProducts.length > 0) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Top Products by Views', 14, y)
        y += 4

        const productRows = dashboard.topProducts.slice(0, 10).map(p => [
          p.title,
          String(p.views || 0),
          p.category || 'Uncategorized',
          p.status || 'unknown',
          formatRand(p.currentPrice || p.startingPrice || 0)
        ])

        autoTable(doc, {
          startY: y,
          head: [['Product', 'Views', 'Category', 'Status', 'Price']],
          body: productRows,
          theme: 'striped',
          headStyles: { fillColor: [139, 92, 246] },
          margin: { left: 14, right: 14 }
        })
      }
      break
    }

    case 'revenue': {
      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: [
          ['Total Revenue', formatRand(stats?.totalRevenue || 0)],
          ['Platform Fees', formatRand(stats?.platformFees || 0)],
          ['Net Revenue', formatRand((stats?.totalRevenue || 0) - (stats?.platformFees || 0))],
          ['Average Order Value', formatRand(stats?.averageOrderValue || 0)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [249, 115, 22] },
        margin: { left: 14, right: 14 }
      })
      y = (doc as any).lastAutoTable.finalY + 10

      // Daily Revenue
      if (analytics?.dailyRevenue && Object.keys(analytics.dailyRevenue).length > 0) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Daily Revenue', 14, y)
        y += 4

        const dailyRows = Object.entries(analytics.dailyRevenue)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, revenue]) => [date, formatRand(revenue)])

        autoTable(doc, {
          startY: y,
          head: [['Date', 'Revenue']],
          body: dailyRows,
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] },
          margin: { left: 14, right: 14 }
        })
        y = (doc as any).lastAutoTable.finalY + 10
      }

      // Payment Methods
      if (analytics?.paymentMethods && Object.keys(analytics.paymentMethods).length > 0) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Payment Methods', 14, y)
        y += 4

        const methodRows = Object.entries(analytics.paymentMethods).map(([method, count]) => [
          method === 'ozow' ? 'Ozow' : method === 'card' ? 'Card' : method,
          String(count)
        ])

        autoTable(doc, {
          startY: y,
          head: [['Method', 'Count']],
          body: methodRows,
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] },
          margin: { left: 14, right: 14 }
        })
      }
      break
    }
  }

  doc.save(`verispine-${reportType}-report-${todayStr()}.pdf`)
}

// ─── Excel Export ────────────────────────────────────────────────────────────

export function exportReportExcel(
  reportType: string,
  analytics: AnalyticsData | null,
  dashboard: DashboardData | null,
  dateRange: string
) {
  const wb = XLSX.utils.book_new()
  const stats = analytics?.stats
  const userStats = dashboard?.stats?.users
  const productStats = dashboard?.stats?.products

  switch (reportType) {
    case 'sales': {
      // Summary sheet
      const summaryData = [
        ['Metric', 'Value'],
        ['Report Period', dateRangeLabels[dateRange] || dateRange],
        ['Generated', todayStr()],
        [''],
        ['Total Revenue', stats?.totalRevenue || 0],
        ['Total Orders', stats?.totalOrders || 0],
        ['Average Order Value', stats?.averageOrderValue || 0],
        ['Success Rate (%)', stats?.successRate || 0]
      ]
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

      // Daily Revenue sheet
      if (analytics?.dailyRevenue && Object.keys(analytics.dailyRevenue).length > 0) {
        const dailyData = [
          ['Date', 'Revenue'],
          ...Object.entries(analytics.dailyRevenue)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, revenue]) => [date, revenue])
        ]
        const dailyWs = XLSX.utils.aoa_to_sheet(dailyData)
        XLSX.utils.book_append_sheet(wb, dailyWs, 'Daily Revenue')
      }

      // Top Products sheet
      if (dashboard?.topProducts && dashboard.topProducts.length > 0) {
        const productData = [
          ['Product', 'Views', 'Status', 'Price'],
          ...dashboard.topProducts.slice(0, 10).map(p => [
            p.title,
            p.views || 0,
            p.status || 'unknown',
            p.currentPrice || p.startingPrice || 0
          ])
        ]
        const productWs = XLSX.utils.aoa_to_sheet(productData)
        XLSX.utils.book_append_sheet(wb, productWs, 'Top Products')
      }
      break
    }

    case 'users': {
      const userData = [
        ['Metric', 'Value'],
        ['Report Period', dateRangeLabels[dateRange] || dateRange],
        ['Generated', todayStr()],
        [''],
        ['Total Users', userStats?.total || 0],
        ['Sellers', userStats?.sellers || 0],
        ['Buyers', userStats?.buyers || 0],
        ['Admins', userStats?.admins || 0],
        ['Active Today', userStats?.activeToday || 0],
        ['Verified', userStats?.verified || 0]
      ]
      const userWs = XLSX.utils.aoa_to_sheet(userData)
      XLSX.utils.book_append_sheet(wb, userWs, 'User Stats')
      break
    }

    case 'products': {
      // Product stats sheet
      const prodStatsData = [
        ['Metric', 'Value'],
        ['Report Period', dateRangeLabels[dateRange] || dateRange],
        ['Generated', todayStr()],
        [''],
        ['Total Products', productStats?.total || 0],
        ['Active', productStats?.active || 0],
        ['Ended', productStats?.ended || 0],
        ['Sold', productStats?.sold || 0],
        ['Average Price', productStats?.avgPrice || 0],
        ['Total Value', productStats?.totalValue || 0]
      ]
      const prodStatsWs = XLSX.utils.aoa_to_sheet(prodStatsData)
      XLSX.utils.book_append_sheet(wb, prodStatsWs, 'Product Stats')

      // Top Products sheet
      if (dashboard?.topProducts && dashboard.topProducts.length > 0) {
        const productData = [
          ['Product', 'Views', 'Category', 'Status', 'Price'],
          ...dashboard.topProducts.slice(0, 10).map(p => [
            p.title,
            p.views || 0,
            p.category || 'Uncategorized',
            p.status || 'unknown',
            p.currentPrice || p.startingPrice || 0
          ])
        ]
        const productWs = XLSX.utils.aoa_to_sheet(productData)
        XLSX.utils.book_append_sheet(wb, productWs, 'Top Products')
      }
      break
    }

    case 'revenue': {
      // Revenue Summary sheet
      const revData = [
        ['Metric', 'Value'],
        ['Report Period', dateRangeLabels[dateRange] || dateRange],
        ['Generated', todayStr()],
        [''],
        ['Total Revenue', stats?.totalRevenue || 0],
        ['Platform Fees', stats?.platformFees || 0],
        ['Net Revenue', (stats?.totalRevenue || 0) - (stats?.platformFees || 0)],
        ['Average Order Value', stats?.averageOrderValue || 0]
      ]
      const revWs = XLSX.utils.aoa_to_sheet(revData)
      XLSX.utils.book_append_sheet(wb, revWs, 'Revenue Summary')

      // Daily Revenue sheet
      if (analytics?.dailyRevenue && Object.keys(analytics.dailyRevenue).length > 0) {
        const dailyData = [
          ['Date', 'Revenue'],
          ...Object.entries(analytics.dailyRevenue)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, revenue]) => [date, revenue])
        ]
        const dailyWs = XLSX.utils.aoa_to_sheet(dailyData)
        XLSX.utils.book_append_sheet(wb, dailyWs, 'Daily Revenue')
      }

      // Payment Methods sheet
      if (analytics?.paymentMethods && Object.keys(analytics.paymentMethods).length > 0) {
        const methodData = [
          ['Method', 'Count'],
          ...Object.entries(analytics.paymentMethods).map(([method, count]) => [
            method === 'ozow' ? 'Ozow' : method === 'card' ? 'Card' : method,
            count
          ])
        ]
        const methodWs = XLSX.utils.aoa_to_sheet(methodData)
        XLSX.utils.book_append_sheet(wb, methodWs, 'Payment Methods')
      }
      break
    }
  }

  XLSX.writeFile(wb, `verispine-${reportType}-report-${todayStr()}.xlsx`)
}
