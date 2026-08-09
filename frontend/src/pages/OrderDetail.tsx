import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import axios from '../config/axios'
import {
  ArrowLeftIcon,
  TruckIcon,
  CreditCardIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  StarIcon,
  DocumentTextIcon,
  PrinterIcon
} from '@heroicons/react/24/outline'
import { formatPrice, getPaymentTimeRemaining } from '../utils/formatters'
import { carrierLabel, carrierTrackingUrl } from '../utils/carriers'
import toast from 'react-hot-toast'

const OrderDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState<any>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [trackingInfo, setTrackingInfo] = useState<any>(null)
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)

  useEffect(() => {
    if (!user) {
      toast.error('Please login to view order details')
      navigate('/login')
      return
    }
    loadOrder()
  }, [id, user])

  const loadOrder = async () => {
    try {
      setLoading(true)
      // Fetch order from API
      const response = await axios.get(`/api/orders/${id}`)
      if (response.data.success) {
        const orderData = response.data.data
        setOrder(orderData)
        setHasReviewed(orderData.hasReview || false)

        // Fetch product details if available
        if (orderData.productId) {
          try {
            const productResponse = await axios.get(`/api/products/${orderData.productId}`)
            if (productResponse.data.success) {
              setProduct(productResponse.data.data)
            }
          } catch (error) {
            console.error('Error fetching product details:', error)
          }
        }
      } else {
        toast.error('Order not found')
        navigate('/orders')
      }
    } catch (error: any) {
      console.error('Error fetching order:', error)
      if (error.response?.status === 404) {
        toast.error('Order not found')
      } else if (error.response?.status === 403) {
        toast.error('You do not have permission to view this order')
      } else {
        toast.error('Failed to fetch order details')
      }
      navigate('/orders')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelOrder = async () => {
    if (confirm('Are you sure you want to cancel this order?')) {
      try {
        const response = await axios.put(`/api/orders/${id}/cancel`)
        if (response.data.success) {
          toast.success('Order cancelled successfully')
          navigate('/orders')
        }
      } catch (error: any) {
        console.error('Error cancelling order:', error)
        toast.error(error.response?.data?.error || 'Failed to cancel order')
      }
    }
  }

  const handleSubmitReview = async () => {
    if (!order || !order.productId) {
      toast.error('Product information not available')
      return
    }

    if (rating < 1 || rating > 5) {
      toast.error('Please select a rating')
      return
    }

    try {
      setReviewLoading(true)
      const response = await axios.post('/api/reviews', {
        orderId: id,
        productId: order.productId,
        rating,
        comment: reviewText
      })

      if (response.data.success) {
        toast.success('Review submitted successfully! Thank you for your feedback.')
        setShowReviewModal(false)
        setHasReviewed(true)
        setRating(5)
        setReviewText('')
      }
    } catch (error: any) {
      console.error('Error submitting review:', error)
      toast.error(error.response?.data?.error || 'Failed to submit review')
    } finally {
      setReviewLoading(false)
    }
  }

  // Open the carrier's public tracking page for this order
  const handleTrackPackage = () => {
    if (!order.trackingNumber) {
      toast.error('No tracking number available')
      return
    }

    const url = carrierTrackingUrl(order.shippingCarrier || order.carrier, order.trackingNumber)
    if (!url) {
      // Freight and manually-arranged shipments have no public portal — the
      // timeline on this page is the tracking.
      toast('Tracking updates for this shipment appear below', { icon: '📦' })
      return
    }
    window.open(url, '_blank')
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadInvoice = () => {
    // Create invoice content
    const invoiceWindow = window.open('', '_blank')
    if (!invoiceWindow) {
      toast.error('Please allow popups to download invoice')
      return
    }

    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${order.orderId}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 40px; }
          .header h1 { color: #e65100; margin-bottom: 5px; }
          .invoice-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .section { margin-bottom: 20px; }
          .section h3 { border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; }
          .total-row { font-weight: bold; font-size: 1.2em; }
          .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>VeriSpine</h1>
          <p>Invoice</p>
        </div>

        <div class="invoice-info">
          <div>
            <strong>Invoice Number:</strong> INV-${order.orderId}<br>
            <strong>Order ID:</strong> ${order.orderId}<br>
            <strong>Date:</strong> ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
          </div>
          <div style="text-align: right;">
            <strong>Payment Status:</strong> ${(order.paymentStatus || 'pending').toUpperCase()}<br>
            <strong>Payment Method:</strong> ${(order.paymentMethod || 'N/A').toUpperCase()}
          </div>
        </div>

        <div class="section">
          <h3>Bill To</h3>
          <p>
            ${order.buyerName || 'Customer'}<br>
            ${order.buyerEmail || ''}<br>
            ${order.shippingInfo?.address || order.shippingAddress?.addressLine1 || ''}<br>
            ${order.shippingInfo?.city || order.shippingAddress?.city || ''}, ${order.shippingInfo?.province || order.shippingAddress?.state || ''} ${order.shippingInfo?.postalCode || order.shippingAddress?.zipCode || ''}
          </p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${order.productTitle || 'Product'}</td>
              <td>${order.quantity || 1}</td>
              <td>$${(order.productPrice || order.amount || 0).toFixed(2)}</td>
              <td>$${(order.productPrice || order.amount || 0).toFixed(2)}</td>
            </tr>
            ${(order.shippingCost || order.shipping?.cost || 0) > 0 ? `
            <tr>
              <td colspan="3" style="text-align: right;">Shipping (${carrierLabel(order.shippingCarrier || order.carrier)})</td>
              <td>$${(order.shippingCost || order.shipping?.cost || 0).toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr class="total-row">
              <td colspan="3" style="text-align: right;">Total</td>
              <td>$${((order.productPrice || order.amount || 0) + (order.shippingCost || order.shipping?.cost || 0)).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <p>Thank you for shopping with VeriSpine!</p>
          <p>www.verispinejointcenters.com | info@verispinejointcenters.com</p>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `

    invoiceWindow.document.write(invoiceHTML)
    invoiceWindow.document.close()
  }

  const getStatusColor = (status: string) => {
    const colors: any = {
      pending: 'text-yellow-600 bg-yellow-100',
      pending_payment: 'text-orange-600 bg-orange-100',
      paid: 'text-blue-600 bg-blue-100',
      confirmed: 'text-blue-600 bg-blue-100',
      processing: 'text-indigo-600 bg-indigo-100',
      shipping: 'text-purple-600 bg-purple-100',
      shipped: 'text-purple-600 bg-purple-100',
      delivered: 'text-green-600 bg-green-100',
      completed: 'text-green-600 bg-green-100',
      cancelled: 'text-red-600 bg-red-100'
    }
    return colors[status] || 'text-gray-600 bg-gray-100'
  }

  const getPaymentStatusColor = (status: string) => {
    const colors: any = {
      pending: 'text-yellow-600',
      completed: 'text-green-600',
      failed: 'text-red-600'
    }
    return colors[status] || 'text-gray-600'
  }

  if (loading || !order) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Get the display status based on actual order state
  const getDisplayStatus = () => {
    // If delivered, show delivered
    if (order.status === 'delivered') return 'delivered'

    // If cancelled, show cancelled
    if (order.status === 'cancelled') return 'cancelled'

    // If has tracking number, it's shipping (in transit)
    if (order.trackingNumber || order.status === 'shipped' || order.shippingStatus === 'shipped') {
      return 'shipping'
    }

    // If payment is confirmed, show paid/processing
    const isPaymentConfirmed = order.paymentStatus === 'completed' ||
                               order.paymentStatus === 'paid' ||
                               order.paymentStatus === 'success'
    if (isPaymentConfirmed) return 'paid'

    // Default to the order status
    return order.status || 'pending'
  }

  // Build timeline based on order status
  const buildTimeline = () => {
    // Check if payment is confirmed (could be 'paid', 'completed', or 'success')
    const isPaymentConfirmed = order.paymentStatus === 'completed' ||
                               order.paymentStatus === 'paid' ||
                               order.paymentStatus === 'success'

    // Check if shipped (has tracking number OR status is shipped/delivered)
    const isShipped = !!order.trackingNumber ||
                      order.status === 'shipped' ||
                      order.status === 'delivered' ||
                      order.shippingStatus === 'shipped'

    // Check if processing (payment done OR shipped)
    const isProcessing = isPaymentConfirmed || isShipped

    const timeline = [
      {
        status: 'Order Placed',
        description: 'Order was successfully placed',
        timestamp: order.createdAt,
        icon: CheckCircleIcon,
        completed: true
      },
      {
        status: 'Payment Confirmed',
        description: 'Payment was successfully processed',
        timestamp: isPaymentConfirmed ? (order.paidAt || order.createdAt) : null,
        icon: CreditCardIcon,
        completed: isPaymentConfirmed
      }
    ]

    if (order.status !== 'cancelled') {
      timeline.push(
        {
          status: 'Order Processing',
          description: 'Order is being prepared',
          timestamp: isProcessing ? order.updatedAt : null,
          icon: ClockIcon,
          completed: isProcessing
        },
        {
          status: 'Shipping',
          description: order.trackingNumber ? `Tracking: ${order.trackingNumber}` : 'Package is being shipped',
          timestamp: isShipped ? (order.shippedAt || order.updatedAt) : null,
          icon: TruckIcon,
          completed: isShipped
        },
        {
          status: 'Delivered',
          description: 'Package delivered successfully',
          timestamp: order.status === 'delivered' ? order.deliveredAt : null,
          icon: CheckCircleIcon,
          completed: order.status === 'delivered'
        }
      )
    } else {
      timeline.push({
        status: 'Order Cancelled',
        description: order.cancellationReason || 'Order was cancelled',
        timestamp: order.cancelledAt || order.updatedAt,
        icon: XCircleIcon,
        completed: true
      })
    }

    return timeline
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <button
            onClick={() => navigate('/orders')}
            className="flex items-center gap-2 text-gray-600 hover:text-primary-600 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Orders
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Order #{order.orderId}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className={`badge ${getStatusColor(getDisplayStatus())}`}>
              {getDisplayStatus().toUpperCase()}
            </span>
            <span className="text-gray-600">
              Placed on {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="btn-outline flex items-center gap-2"
          >
            <PrinterIcon className="h-5 w-5" />
            Print
          </button>
          {(order.status === 'pending' || order.status === 'pending_payment' || order.status === 'processing') && (
            <button
              onClick={handleCancelOrder}
              className="btn-outline border-red-600 text-red-600 hover:bg-red-50"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* Payment Deadline Banner */}
      {order.status === 'pending_payment' && order.paymentDeadline && (() => {
        const deadline = getPaymentTimeRemaining(order.paymentDeadline)
        const bannerColors = {
          safe: 'bg-green-50 border-green-300 text-green-800',
          warning: 'bg-yellow-50 border-yellow-300 text-yellow-800',
          danger: 'bg-red-50 border-red-300 text-red-800',
          expired: 'bg-red-100 border-red-400 text-red-900'
        }
        const btnColors = {
          safe: 'bg-green-600 hover:bg-green-700',
          warning: 'bg-yellow-600 hover:bg-yellow-700',
          danger: 'bg-red-600 hover:bg-red-700',
          expired: 'bg-gray-400 cursor-not-allowed'
        }
        return (
          <div className={`border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 ${bannerColors[deadline.urgency]}`}>
            <div className="flex items-center gap-3">
              <ClockIcon className="h-6 w-6 flex-shrink-0" />
              <div>
                <p className="font-semibold">
                  {deadline.urgency === 'expired' ? 'Payment deadline has expired' : `Payment deadline: ${deadline.text}`}
                </p>
                <p className="text-sm opacity-80">
                  {deadline.urgency === 'expired'
                    ? 'This order will be cancelled soon.'
                    : `Pay by ${new Date(order.paymentDeadline).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
                  }
                </p>
              </div>
            </div>
            {deadline.urgency !== 'expired' && order.buyerId === user?.uid && (
              <button
                onClick={() => navigate('/checkout', {
                  state: {
                    item: {
                      productId: order.productId,
                      title: order.productTitle,
                      image: order.productImage || product?.images?.[0] || '',
                      price: Number(order.amount || order.productPrice || 0),
                      sellerId: order.sellerId,
                      type: 'auction_win',
                      shippingCost: Number(order.shippingCost || product?.shipping?.cost || 0),
                      orderId: order.orderId || id
                    }
                  }
                })}
                className={`text-white px-6 py-2 rounded-lg font-medium whitespace-nowrap ${btnColors[deadline.urgency]}`}
              >
                Pay Now
              </button>
            )}
          </div>
        )
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Timeline */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Order Timeline</h2>
            <div className="relative">
              {buildTimeline().map((event: any, index: number) => (
                <div key={index} className="flex gap-4 mb-6 last:mb-0">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        event.completed
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      <event.icon className="h-5 w-5" />
                    </div>
                    {index < buildTimeline().length - 1 && (
                      <div
                        className={`w-0.5 h-16 mt-2 ${
                          event.completed ? 'bg-primary-600' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                  <div className="flex-grow">
                    <h3 className={`font-medium ${event.completed ? 'text-gray-900' : 'text-gray-400'}`}>
                      {event.status}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                    {event.timestamp && (
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Product Details */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Details</h2>
            <div className="flex gap-4">
              {product?.images?.[0] ? (
                <img
                  src={product.images[0]}
                  alt={order.productTitle}
                  className="w-24 h-24 object-cover rounded-lg"
                />
              ) : order.productImage ? (
                <img
                  src={order.productImage}
                  alt={order.productTitle}
                  className="w-24 h-24 object-cover rounded-lg"
                />
              ) : (
                <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center">
                  <DocumentTextIcon className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div className="flex-grow">
                <h3 className="font-medium text-gray-900">{order.productTitle || 'Product'}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Quantity: {order.quantity || 1}<br />
                  Price: {formatPrice(order.productPrice || 0)}
                </p>
                {order.productId && (
                  <Link
                    to={`/products/${order.productId}`}
                    className="text-primary-600 hover:text-primary-700 text-sm mt-2 inline-block"
                  >
                    View Product →
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Shipping Information */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipping Information</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <MapPinIcon className="h-5 w-5 text-gray-400" />
                  Delivery Address
                </h3>
                {(order.shippingInfo || order.shippingAddress) ? (
                  <p className="text-gray-600">
                    {order.shippingInfo?.fullName || order.shippingAddress?.fullName || order.buyerName}<br />
                    {order.shippingInfo?.address || order.shippingAddress?.addressLine1}<br />
                    {(order.shippingInfo?.city || order.shippingAddress?.city) && (
                      <>{order.shippingInfo?.city || order.shippingAddress?.city}, </>
                    )}
                    {order.shippingInfo?.province || order.shippingAddress?.state || ''} {order.shippingInfo?.postalCode || order.shippingAddress?.zipCode || ''}<br />
                    {order.shippingInfo?.country || order.shippingAddress?.country || 'United States'}
                  </p>
                ) : (
                  <p className="text-gray-500">No shipping address provided</p>
                )}
              </div>
              
              {/* Sender / Pickup Location */}
              {(order.pickup || order.pickupLocation) && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <MapPinIcon className="h-5 w-5 text-gray-400" />
                    Sender / Pickup Location
                  </h3>
                  {order.pickup ? (
                    <p className="text-gray-600">
                      {order.pickup.address}<br />
                      {order.pickup.city}, {order.pickup.province} {order.pickup.postalCode}
                    </p>
                  ) : (
                    <p className="text-gray-600">{order.pickupLocation}</p>
                  )}
                </div>
              )}

              {order.trackingNumber && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <TruckIcon className="h-5 w-5 text-gray-400" />
                    Tracking Information
                  </h3>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-purple-600">Carrier</p>
                        <p className="font-medium text-purple-900">{carrierLabel(order.shippingCarrier || order.carrier)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-purple-600">Tracking Number</p>
                        <p className="font-mono font-medium text-purple-900">{order.trackingNumber}</p>
                      </div>
                    </div>
                    {order.estimatedDelivery && (
                      <div className="mt-3 pt-3 border-t border-purple-200">
                        <p className="text-sm text-purple-600">Estimated Delivery</p>
                        <p className="font-medium text-purple-900">{new Date(order.estimatedDelivery).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleTrackPackage}
                    className="btn-primary w-full mt-3 flex items-center justify-center gap-2"
                  >
                    <TruckIcon className="h-4 w-4" />
                    Track Package Live
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Seller Information.
              This panel used to be hardcoded to "VeriSpine Platform / all products
              are sold directly by VeriSpine", left over from a single-seller phase.
              On a marketplace that is simply false — it told every buyer the wrong
              seller and gave them no way to reach the actual one. */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Seller Information</h2>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-gray-900">
                  {order.sellerName || product?.sellerName || 'Seller'}
                </h3>
                {(order.sellerEmail || product?.sellerEmail) && (
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <EnvelopeIcon className="h-4 w-4" />
                      {order.sellerEmail || product?.sellerEmail}
                    </span>
                  </div>
                )}
                {order.sellerId && (
                  <Link
                    to={`/seller/${order.sellerId}`}
                    className="inline-block text-sm text-primary-600 hover:text-primary-700 mt-2"
                  >
                    View seller storefront →
                  </Link>
                )}
              </div>
              <Link to="/help" className="btn-outline flex items-center gap-2">
                <ChatBubbleLeftIcon className="h-4 w-4" />
                Contact Support
              </Link>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Product Price</span>
                <span className="font-medium">{formatPrice(order.productPrice || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Quantity</span>
                <span className="font-medium">{order.quantity || 1}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className="font-medium">
                  {(order.shippingCost || order.shipping?.cost || 0) > 0 ? formatPrice(order.shippingCost || order.shipping?.cost || 0) : 'Free'}
                </span>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-lg">{formatPrice((order.productPrice || order.amount || 0) + (order.shippingCost || order.shipping?.cost || 0))}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-6 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Payment Status</span>
                <span className={`text-sm font-medium ${getPaymentStatusColor(order.paymentStatus || 'pending')}`}>
                  {(order.paymentStatus || 'pending').toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Method: {(order.paymentMethod || 'N/A').toUpperCase()}<br />
                {order.transactionId && `Transaction ID: ${order.transactionId}`}
              </div>
            </div>

            {order.status === 'pending_payment' && order.paymentDeadline && (() => {
              const deadline = getPaymentTimeRemaining(order.paymentDeadline)
              const colors = {
                safe: 'bg-green-50 border-green-200 text-green-700',
                warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
                danger: 'bg-red-50 border-red-200 text-red-700',
                expired: 'bg-red-100 border-red-300 text-red-800'
              }
              return (
                <div className={`mt-3 p-3 rounded-lg border ${colors[deadline.urgency]}`}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ClockIcon className="h-4 w-4" />
                    {deadline.text}
                  </div>
                  <p className="text-xs mt-1 opacity-80">
                    Deadline: {new Date(order.paymentDeadline).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              )
            })()}
          </div>

          {/* Actions */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-3">
              {order.status === 'pending_payment' && order.buyerId === user?.uid && (
                <button
                  onClick={() => navigate('/checkout', {
                    state: {
                      item: {
                        productId: order.productId,
                        title: order.productTitle,
                        image: order.productImage || product?.images?.[0] || '',
                        price: Number(order.amount || order.productPrice || 0),
                        sellerId: order.sellerId,
                        type: 'auction_win',
                        shippingCost: Number(order.shippingCost || product?.shipping?.cost || 0),
                        orderId: order.orderId || id
                      }
                    }
                  })}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <CreditCardIcon className="h-5 w-5" />
                  Proceed to Payment
                </button>
              )}
              {order.status === 'delivered' && !hasReviewed && (
                <button
                  onClick={() => setShowReviewModal(true)}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <StarIcon className="h-5 w-5" />
                  Leave a Review
                </button>
              )}
              {order.status === 'delivered' && hasReviewed && (
                <div className="bg-green-50 text-green-700 p-3 rounded-lg text-center flex items-center justify-center gap-2">
                  <CheckCircleIcon className="h-5 w-5" />
                  Review Submitted
                </div>
              )}
              <button
                onClick={handleDownloadInvoice}
                className="btn-outline w-full flex items-center justify-center gap-2"
              >
                <DocumentTextIcon className="h-5 w-5" />
                Download Invoice
              </button>
              <button className="btn-outline w-full">
                Report an Issue
              </button>
            </div>
          </div>

          {/* Help */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Need Help?</h2>
            <p className="text-sm text-gray-600 mb-4">
              If you have any questions about your order, please don't hesitate to contact us.
            </p>
            <button className="btn-outline w-full">
              Contact Support
            </button>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4">Leave a Review</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="text-2xl"
                  >
                    <StarIcon
                      className={`h-8 w-8 ${
                        star <= rating
                          ? 'text-yellow-400 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Review
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                className="input-field h-32 resize-none"
                placeholder="Share your experience with this purchase..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSubmitReview}
                disabled={reviewLoading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {reviewLoading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Submitting...
                  </>
                ) : (
                  'Submit Review'
                )}
              </button>
              <button
                onClick={() => setShowReviewModal(false)}
                disabled={reviewLoading}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Live Tracking Modal */}
      {showTrackingModal && trackingInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-purple-100 rounded-full">
                <TruckIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Live Tracking</h3>
                <p className="text-sm text-gray-500">{carrierLabel(order.shippingCarrier || order.carrier)}</p>
              </div>
            </div>

            {/* Current Status */}
            <div className="bg-green-50 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-green-600">Current Status</p>
                  <p className="text-lg font-bold text-green-900">{trackingInfo.currentStatus || 'In Transit'}</p>
                </div>
              </div>
              {trackingInfo.lastUpdate && (
                <p className="text-sm text-green-700 mt-2">
                  Last updated: {new Date(trackingInfo.lastUpdate).toLocaleString()}
                </p>
              )}
            </div>

            {/* Tracking Details */}
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Tracking Number</p>
                  <p className="font-mono font-medium">{trackingInfo.trackingNumber}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Weight</p>
                  <p className="font-medium">{trackingInfo.weight || 'N/A'} kg</p>
                </div>
              </div>

              {trackingInfo.origin && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Origin</p>
                  <p className="font-medium">{trackingInfo.origin.country || 'United States'}</p>
                </div>
              )}
            </div>

            {/* Tracking Events Timeline */}
            {trackingInfo.events && trackingInfo.events.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-4">Tracking History</h4>
                <div className="space-y-4">
                  {trackingInfo.events.map((event: any, index: number) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {index < trackingInfo.events.length - 1 && (
                          <div className="w-0.5 h-full bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className={`font-medium ${index === 0 ? 'text-green-700' : 'text-gray-700'}`}>
                          {event.status || event.description || 'Update'}
                        </p>
                        {event.office && (
                          <p className="text-sm text-gray-500">{event.office}</p>
                        )}
                        {event.timestamp && (
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(event.timestamp).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowTrackingModal(false)}
              className="btn-outline w-full mt-6"
            >
              Close
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

export default OrderDetail