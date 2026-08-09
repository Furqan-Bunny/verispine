import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Generate a PDF receipt/details document for a single order.
 * Used by AdminOrders modal "Export Order" button.
 *
 * Tolerates both `shippingInfo` (canonical) and legacy `shippingAddress`
 * field-name conventions, plus structured `pickup` / legacy `pickupLocation`
 * for sender info.
 */
export function exportOrderPDF(order: any) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const left = 14
  let y = 20

  const formatRand = (amount: any): string => {
    const n = Number(amount || 0)
    return 'R ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatDate = (d: any): string => {
    if (!d) return ''
    if (d.toDate) return d.toDate().toLocaleString('en-ZA')
    if (d._seconds) return new Date(d._seconds * 1000).toLocaleString('en-ZA')
    if (typeof d === 'string') {
      const parsed = new Date(d)
      return isNaN(parsed.getTime()) ? d : parsed.toLocaleString('en-ZA')
    }
    if (d instanceof Date) return d.toLocaleString('en-ZA')
    return ''
  }

  const orderId = order.orderId || order.id || ''
  const ship = order.shippingInfo || order.shippingAddress || {}
  const pickup = order.pickup || {}
  const seller = order.seller || {}
  const recipientName = ship.fullName || ship.name || ''
  const recipientLine1 = ship.address || ship.addressLine1 || ''
  const recipientLine2 = ship.addressLine2 || ''
  const recipientCity = ship.city || ''
  const recipientRegion = ship.province || ship.state || ''
  const recipientPostcode = ship.postalCode || ship.zipCode || ''
  const recipientCountry = ship.country || 'South Africa'
  const recipientPhone = ship.phone || ship.phoneNumber || ''
  const recipientEmail = ship.email || order.buyerEmail || ''

  const senderName = seller.name || `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || order.sellerName || ''
  const senderLine1 = pickup.address || order.pickupLocation || ''
  const senderCity = pickup.city || ''
  const senderRegion = pickup.province || ''
  const senderPostcode = pickup.postalCode || ''
  const senderPhone = seller.phone || ''
  const senderEmail = seller.email || order.sellerEmail || ''

  // ─── Header ─────────────────────────────────────────────────────────────
  doc.setFontSize(20)
  doc.setTextColor(234, 88, 12) // primary-600 orange
  doc.text('Quicksell', left, y)

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Order Details', pageWidth - left, y, { align: 'right' })
  y += 8

  doc.setFontSize(14)
  doc.setTextColor(30, 30, 30)
  doc.text(`Order #${orderId.slice(-8) || orderId}`, left, y)
  y += 6

  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(`Order ID: ${orderId}`, left, y)
  doc.text(`Generated: ${new Date().toLocaleString('en-ZA')}`, pageWidth - left, y, { align: 'right' })
  y += 5

  // Divider
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.5)
  doc.line(left, y, pageWidth - left, y)
  y += 6

  // ─── Order Status ────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [['Status', 'Payment', 'Method']],
    body: [[
      String(order.status || '').toUpperCase(),
      String(order.paymentStatus || '').toUpperCase(),
      String(order.paymentMethod || '').toUpperCase()
    ]],
    theme: 'grid',
    headStyles: { fillColor: [234, 88, 12] },
    margin: { left, right: left }
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // ─── Product ─────────────────────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text('Product', left, y)
  y += 4

  autoTable(doc, {
    startY: y,
    body: [
      ['Title', String(order.productTitle || '')],
      ['Type', String(order.type || '')],
      ['Quantity', String(order.quantity ?? 1)],
      ['Item Price', formatRand(order.amount ?? order.productPrice)],
      ['Shipping Cost', formatRand(order.shippingCost)],
      ['Total Paid', formatRand(order.totalAmount ?? (Number(order.amount || 0) + Number(order.shippingCost || 0)))]
    ],
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, textColor: [80, 80, 80] },
      1: { textColor: [30, 30, 30] }
    },
    margin: { left, right: left }
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Buyer / Recipient ──────────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text('Ship To', left, y)
  y += 4

  const recipientLines: string[][] = []
  if (recipientName) recipientLines.push(['Name', recipientName])
  if (recipientLine1) recipientLines.push(['Address', recipientLine1])
  if (recipientLine2) recipientLines.push(['', recipientLine2])
  const cityLine = [recipientCity, recipientRegion, recipientPostcode].filter(Boolean).join(', ')
  if (cityLine) recipientLines.push(['', cityLine])
  if (recipientCountry) recipientLines.push(['', recipientCountry])
  if (recipientPhone) recipientLines.push(['Phone', recipientPhone])
  if (recipientEmail) recipientLines.push(['Email', recipientEmail])

  if (recipientLines.length === 0) {
    recipientLines.push(['', 'No shipping address on file'])
  }

  autoTable(doc, {
    startY: y,
    body: recipientLines,
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, textColor: [80, 80, 80] },
      1: { textColor: [30, 30, 30] }
    },
    margin: { left, right: left }
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Seller / Sender ────────────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text('Sender (Pickup)', left, y)
  y += 4

  const senderLines: string[][] = []
  if (senderName) senderLines.push(['Name', senderName])
  if (senderLine1) senderLines.push(['Address', senderLine1])
  const senderCityLine = [senderCity, senderRegion, senderPostcode].filter(Boolean).join(', ')
  if (senderCityLine) senderLines.push(['', senderCityLine])
  if (senderPhone) senderLines.push(['Phone', senderPhone])
  if (senderEmail) senderLines.push(['Email', senderEmail])
  if (senderLines.length === 0) senderLines.push(['', 'No sender info available'])

  autoTable(doc, {
    startY: y,
    body: senderLines,
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, textColor: [80, 80, 80] },
      1: { textColor: [30, 30, 30] }
    },
    margin: { left, right: left }
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Tracking ────────────────────────────────────────────────────────────
  if (order.trackingNumber) {
    doc.setFontSize(11)
    doc.setTextColor(30, 30, 30)
    doc.text('Shipping & Tracking', left, y)
    y += 4

    autoTable(doc, {
      startY: y,
      body: [
        ['Carrier', String(order.carrier || 'SAPO')],
        ['Tracking #', String(order.trackingNumber)],
        ['Track at', String(order.carrier) === 'ShipLogic'
          ? `Track via ${order.carrier} (ref ${order.trackingNumber})`
          : `https://tracking.postoffice.co.za/?id=${order.trackingNumber}`],
        ['Shipped At', formatDate(order.shippedAt)],
        ['Delivered At', formatDate(order.deliveredAt)]
      ],
      theme: 'plain',
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40, textColor: [80, 80, 80] },
        1: { textColor: [30, 30, 30] }
      },
      margin: { left, right: left }
    })
    y = (doc as any).lastAutoTable.finalY + 6
  } else if (order.shippingError) {
    doc.setFontSize(11)
    doc.setTextColor(220, 38, 38) // red-600
    doc.text('Shipping Error', left, y)
    y += 5
    doc.setFontSize(9)
    doc.setTextColor(30, 30, 30)
    const wrapped = doc.splitTextToSize(String(order.shippingError), pageWidth - left * 2)
    doc.text(wrapped, left, y)
    y += wrapped.length * 4 + 4
  }

  // ─── Timestamps ──────────────────────────────────────────────────────────
  const tsRows: string[][] = []
  if (order.createdAt) tsRows.push(['Created', formatDate(order.createdAt)])
  if (order.paidAt) tsRows.push(['Paid', formatDate(order.paidAt)])
  if (order.updatedAt) tsRows.push(['Last Updated', formatDate(order.updatedAt)])
  if (tsRows.length > 0) {
    doc.setFontSize(11)
    doc.setTextColor(30, 30, 30)
    doc.text('Timeline', left, y)
    y += 4
    autoTable(doc, {
      startY: y,
      body: tsRows,
      theme: 'plain',
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40, textColor: [80, 80, 80] },
        1: { textColor: [30, 30, 30] }
      },
      margin: { left, right: left }
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ─── Footer ──────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages?.() || 1
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const ph = doc.internal.pageSize.getHeight()
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('Quicksell — quicksell.co.za', left, ph - 10)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - left, ph - 10, { align: 'right' })
  }

  doc.save(`order-${orderId}.pdf`)
}
