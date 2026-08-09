import axios from '../config/axios'

export interface Notification {
  id: string
  type: 'bid' | 'outbid' | 'won' | 'lost' | 'price_alert' | 'system' | 'reminder' | 'welcome' | 'payment' | 'shipping' | 'withdrawal' | 'order_update' | 'info' | 'warning' | 'success' | 'error'
  title: string
  message: string
  timestamp: any
  createdAt?: any
  read: boolean
  priority: 'low' | 'medium' | 'high' | 'urgent'
  actionUrl?: string
  actionLabel?: string
  metadata?: {
    productId?: string
    productTitle?: string
    amount?: number
    orderId?: string
    imageUrl?: string
    withdrawalId?: string
  }
}

class NotificationService {
  private notifications: Notification[] = []
  private listeners: ((notifications: Notification[]) => void)[] = []
  private userId: string | null = null
  private isFetching: boolean = false
  private lastFetch: number = 0
  private fetchInterval: number = 120000 // 2 minutes (throttle — reduces background API load)

  constructor() {
    // Load cached notifications from localStorage on init
    const stored = localStorage.getItem('notifications')
    if (stored) {
      try {
        this.notifications = JSON.parse(stored)
      } catch (error) {
        console.error('Error loading notifications:', error)
        this.notifications = []
      }
    }
  }

  // Set current user ID and fetch their notifications
  async setUser(userId: string | null) {
    this.userId = userId
    if (userId) {
      await this.fetchNotifications()
    } else {
      // Clear notifications on logout
      this.notifications = []
      localStorage.removeItem('notifications')
      this.notifyListeners()
    }
  }

  // Subscribe to notification changes
  subscribe(listener: (notifications: Notification[]) => void) {
    this.listeners.push(listener)
    // Immediately call with current notifications
    listener(this.notifications)

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  // Notify all listeners of changes
  private notifyListeners() {
    localStorage.setItem('notifications', JSON.stringify(this.notifications))
    this.listeners.forEach(listener => listener(this.notifications))
  }

  // Get all notifications
  getNotifications(): Notification[] {
    return this.notifications
  }

  // Get unread count
  getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length
  }

  // Fetch notifications from API
  async fetchNotifications(force: boolean = false): Promise<void> {
    if (!this.userId) return
    // Don't poll before the auth token is available (avoids cold-start 401s).
    if (!localStorage.getItem('token')) return

    // Prevent duplicate fetches
    if (this.isFetching) return

    // Check if we should fetch (throttle requests)
    const now = Date.now()
    if (!force && (now - this.lastFetch) < this.fetchInterval) return

    try {
      this.isFetching = true
      const response = await axios.get(`/api/notifications/user/${this.userId}`)

      if (response.data.success) {
        // Map backend data to frontend format
        this.notifications = response.data.data.map((n: any) => ({
          id: n.id,
          type: n.type || 'system',
          title: n.title,
          message: n.message,
          timestamp: n.createdAt || n.timestamp,
          createdAt: n.createdAt || n.timestamp,
          read: n.read || false,
          priority: n.priority || 'medium',
          actionUrl: n.actionUrl,
          actionLabel: n.actionLabel,
          metadata: n.metadata
        }))

        this.lastFetch = now
        this.notifyListeners()
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
      // Keep using cached notifications if API fails
    } finally {
      this.isFetching = false
    }
  }

  // Refresh notifications (force fetch)
  async refresh(): Promise<void> {
    await this.fetchNotifications(true)
  }

  // Mark notification as read (both local and server)
  async markAsRead(notificationId: string): Promise<void> {
    // Optimistic update
    const notification = this.notifications.find(n => n.id === notificationId)
    if (notification && !notification.read) {
      notification.read = true
      this.notifyListeners()

      // Sync with server
      try {
        await axios.put(`/api/notifications/${notificationId}/read`)
      } catch (error) {
        console.error('Error marking notification as read:', error)
        // Revert on error
        notification.read = false
        this.notifyListeners()
      }
    }
  }

  // Mark all as read
  async markAllAsRead(): Promise<void> {
    if (!this.userId) return

    const unreadNotifications = this.notifications.filter(n => !n.read)
    if (unreadNotifications.length === 0) return

    // Optimistic update
    unreadNotifications.forEach(n => n.read = true)
    this.notifyListeners()

    // Sync with server
    try {
      await axios.put(`/api/notifications/user/${this.userId}/mark-all-read`)
    } catch (error) {
      console.error('Error marking all as read:', error)
      // Revert on error
      unreadNotifications.forEach(n => n.read = false)
      this.notifyListeners()
    }
  }

  // Delete notification
  async deleteNotification(notificationId: string): Promise<void> {
    const index = this.notifications.findIndex(n => n.id === notificationId)
    if (index === -1) return

    // Store for potential revert
    const deleted = this.notifications[index]

    // Optimistic update
    this.notifications.splice(index, 1)
    this.notifyListeners()

    // Sync with server
    try {
      await axios.delete(`/api/notifications/${notificationId}`)
    } catch (error) {
      console.error('Error deleting notification:', error)
      // Revert on error
      this.notifications.splice(index, 0, deleted)
      this.notifyListeners()
    }
  }

  // Clear all read notifications
  async clearReadNotifications(): Promise<void> {
    if (!this.userId) return

    const readNotifications = this.notifications.filter(n => n.read)
    if (readNotifications.length === 0) return

    // Store for potential revert
    const originalNotifications = [...this.notifications]

    // Optimistic update
    this.notifications = this.notifications.filter(n => !n.read)
    this.notifyListeners()

    // Sync with server
    try {
      await axios.delete(`/api/notifications/user/${this.userId}/clear-read`)
    } catch (error) {
      console.error('Error clearing read notifications:', error)
      // Revert on error
      this.notifications = originalNotifications
      this.notifyListeners()
    }
  }

  // Clear all notifications (local only - dangerous operation)
  clearAllNotifications() {
    this.notifications = []
    this.notifyListeners()
  }

  // Add a local notification (for immediate UI feedback)
  // This will be synced next time we fetch from server
  addLocalNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) {
    const newNotification: Notification = {
      ...notification,
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false
    }

    this.notifications.unshift(newNotification)
    this.notifyListeners()

    return newNotification
  }

  // Create notification on server
  async createNotification(notification: {
    type: string
    title: string
    message: string
    priority?: string
    actionUrl?: string
    actionLabel?: string
    metadata?: any
  }): Promise<Notification | null> {
    if (!this.userId) return null

    try {
      const response = await axios.post('/api/notifications', {
        userId: this.userId,
        ...notification
      })

      if (response.data.success) {
        const newNotif = response.data.data
        this.notifications.unshift({
          id: newNotif.id,
          type: newNotif.type || 'system',
          title: newNotif.title,
          message: newNotif.message,
          timestamp: newNotif.createdAt,
          createdAt: newNotif.createdAt,
          read: false,
          priority: newNotif.priority || 'medium',
          actionUrl: newNotif.actionUrl,
          actionLabel: newNotif.actionLabel,
          metadata: newNotif.metadata
        })
        this.notifyListeners()
        return this.notifications[0]
      }
    } catch (error) {
      console.error('Error creating notification:', error)
    }
    return null
  }

  // Helper methods for common notifications
  async createBidNotification(productTitle: string, amount: number, productId: string) {
    return this.createNotification({
      type: 'bid',
      title: 'Bid Placed Successfully',
      message: `Your bid of R${amount.toFixed(2)} has been placed on ${productTitle}`,
      priority: 'medium',
      actionUrl: `/products/${productId}`,
      actionLabel: 'View Auction',
      metadata: { productId, productTitle, amount }
    })
  }

  async createOutbidNotification(productTitle: string, newAmount: number, productId: string) {
    return this.createNotification({
      type: 'outbid',
      title: 'You have been outbid!',
      message: `Someone has placed a higher bid on ${productTitle}. Current price: R${newAmount.toFixed(2)}`,
      priority: 'high',
      actionUrl: `/products/${productId}`,
      actionLabel: 'Place New Bid',
      metadata: { productId, productTitle, amount: newAmount }
    })
  }

  async createWonNotification(productTitle: string, amount: number, orderId: string) {
    return this.createNotification({
      type: 'won',
      title: 'Congratulations! You won!',
      message: `You won the auction for ${productTitle} for R${amount.toFixed(2)}. Complete your payment to secure the item.`,
      priority: 'urgent',
      actionUrl: `/orders/${orderId}`,
      actionLabel: 'Complete Payment',
      metadata: { orderId, productTitle, amount }
    })
  }

  async createOrderNotification(orderId: string, status: string, productTitle: string) {
    const statusMessages: Record<string, string> = {
      pending: 'Your order is pending confirmation',
      processing: 'Your order is being processed',
      shipped: 'Your order has been shipped',
      delivered: 'Your order has been delivered',
      cancelled: 'Your order has been cancelled'
    }

    return this.createNotification({
      type: 'order_update',
      title: `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: statusMessages[status] || `Order status updated to ${status}`,
      priority: status === 'shipped' || status === 'delivered' ? 'high' : 'medium',
      actionUrl: `/orders`,
      actionLabel: 'View Order',
      metadata: { orderId, productTitle }
    })
  }

  async createWithdrawalNotification(type: 'requested' | 'approved' | 'rejected', amount: number, withdrawalId?: string) {
    const messages = {
      requested: {
        title: 'Withdrawal Request Submitted',
        message: `Your withdrawal request for R${amount.toFixed(2)} has been submitted and is pending approval.`,
        priority: 'medium' as const
      },
      approved: {
        title: 'Withdrawal Approved!',
        message: `Your withdrawal of R${amount.toFixed(2)} has been approved and will be processed within 1-2 business days.`,
        priority: 'high' as const
      },
      rejected: {
        title: 'Withdrawal Rejected',
        message: `Your withdrawal request for R${amount.toFixed(2)} has been rejected. Please check your email for details.`,
        priority: 'high' as const
      }
    }

    const notification = messages[type]

    return this.createNotification({
      type: 'withdrawal',
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      actionUrl: '/dashboard',
      actionLabel: 'View Details',
      metadata: { amount, withdrawalId }
    })
  }

  async createPaymentNotification(orderId: string, amount: number, status: 'success' | 'failed') {
    return this.createNotification({
      type: 'payment',
      title: status === 'success' ? 'Payment Successful' : 'Payment Failed',
      message: status === 'success'
        ? `Your payment of R${amount.toFixed(2)} was successful.`
        : `Your payment of R${amount.toFixed(2)} failed. Please try again.`,
      priority: status === 'success' ? 'medium' : 'high',
      actionUrl: `/orders`,
      actionLabel: 'View Order',
      metadata: { orderId, amount }
    })
  }
}

// Create singleton instance
const notificationService = new NotificationService()

export default notificationService
