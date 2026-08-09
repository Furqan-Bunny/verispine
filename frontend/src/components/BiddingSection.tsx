import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import createSocket from '../config/socket'
import LiveAuctionRegistrationModal from './LiveAuctionRegistrationModal'
import auctionRegistrationService from '../services/auctionRegistrationService'
import {
  CurrencyDollarIcon,
  ClockIcon,
  UserGroupIcon,
  ArrowUpIcon,
  ExclamationTriangleIcon,
  TicketIcon
} from '@heroicons/react/24/outline'

interface BiddingSectionProps {
  product: any
  onBidPlaced?: () => void
}

interface Bid {
  id: string
  userId: string
  userName: string
  amount: number
  timestamp: Date
}

const BiddingSection = ({ product, onBidPlaced }: BiddingSectionProps) => {
  const { user, isAuthenticated } = useAuthStore()
  const [socket, setSocket] = useState<any>(null)
  const [bidAmount, setBidAmount] = useState('')
  const [isPlacingBid, setIsPlacingBid] = useState(false)
  const [currentPrice, setCurrentPrice] = useState(product.currentPrice)
  const [bidsCount, setBidsCount] = useState(product.totalBids || 0)
  const [recentBids, setRecentBids] = useState<Bid[]>([])
  const [viewerCount, setViewerCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState('')

  // Live auction registration state
  const [showRegistrationModal, setShowRegistrationModal] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [checkingRegistration, setCheckingRegistration] = useState(false)

  const minimumBid = Number(currentPrice || 0) + Number(product.incrementAmount || 100)
  const isAuctionEnded = new Date(product.endDate) < new Date()
  const isLiveAuction = product.isLiveAuction === true

  // Check registration status for live auctions
  useEffect(() => {
    const checkRegistration = async () => {
      if (isLiveAuction && isAuthenticated && user?.uid) {
        setCheckingRegistration(true)
        try {
          // Check from product's registeredUsers array first (faster)
          const registeredUsers = product.registeredUsers || []
          if (registeredUsers.includes(user.uid)) {
            setIsRegistered(true)
          } else {
            // Double check with API
            const status = await auctionRegistrationService.checkRegistration(product.id)
            setIsRegistered(status.isRegistered)
          }
        } catch (error) {
          console.error('Error checking registration:', error)
          // Fallback to checking registeredUsers array
          const registeredUsers = product.registeredUsers || []
          setIsRegistered(registeredUsers.includes(user.uid))
        } finally {
          setCheckingRegistration(false)
        }
      }
    }

    checkRegistration()
  }, [isLiveAuction, isAuthenticated, user?.uid, product.id, product.registeredUsers])

  useEffect(() => {
    // Connect to socket
    const newSocket = createSocket()
    setSocket(newSocket)

    // Join auction room
    newSocket.emit('join-auction', product.id)

    // Listen for auction info
    newSocket.on('auction-info', (data: any) => {
      setCurrentPrice(data.currentPrice)
      setBidsCount(data.totalBids ?? bidsCount)
      if (data.topBids) {
        setRecentBids(data.topBids)
      }
    })

    // Listen for new bids
    newSocket.on('new-bid', (bid: any) => {
      setCurrentPrice(bid.currentPrice ?? bid.amount)
      // Prefer the server's count: incrementing locally drifts whenever an event
      // is missed during a reconnect.
      setBidsCount((prev: number) => bid.totalBids ?? prev + 1)
      setRecentBids((prev: Bid[]) => [bid, ...prev.slice(0, 4)])
      
      // Notify if someone else bid
      if (bid.userId !== user?.uid) {
        toast(`New bid: ${formatPrice(bid.amount)} by ${bid.userName}`, {
          icon: '🔔'
        })
      }
    })

    // Listen for bid errors
    newSocket.on('bid-error', (error: any) => {
      if (error.requiresAuth) {
        toast.error('Please sign in again to place a bid.')
      } else if (error.requiresRegistration) {
        // Show registration modal for live auctions
        setShowRegistrationModal(true)
      } else {
        toast.error(error.message)
      }
      setIsPlacingBid(false)
    })

    // Listen for bid success
    newSocket.on('bid-success', (data: any) => {
      toast.success(data.message)
      if (data.currentPrice != null) setCurrentPrice(data.currentPrice)
      if (data.totalBids != null) setBidsCount(data.totalBids)
      setBidAmount('')
      setIsPlacingBid(false)
      if (onBidPlaced) onBidPlaced()
    })

    // Get bid history
    newSocket.emit('get-bid-history', product.id)
    newSocket.on('bid-history', (bids: Bid[]) => {
      setRecentBids(bids)
    })

    return () => {
      newSocket.emit('leave-auction', product.id)
      newSocket.disconnect()
    }
  }, [product.id, user?.uid])

  // Update countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const end = new Date(product.endDate).getTime()
      const now = new Date().getTime()
      const diff = end - now

      if (diff <= 0) {
        setTimeLeft('Auction Ended')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [product.endDate])

  const handlePlaceBid = () => {
    if (!isAuthenticated) {
      toast.error('Please login to place a bid')
      return
    }

    // Check if live auction registration is required
    if (isLiveAuction && !isRegistered) {
      setShowRegistrationModal(true)
      return
    }

    const amount = parseFloat(bidAmount)
    if (isNaN(amount) || amount < minimumBid) {
      toast.error(`Minimum bid is ${formatPrice(minimumBid)}`)
      return
    }

    setIsPlacingBid(true)

    // The server identifies the bidder from the socket's verified token, so no
    // userId is sent — one that was sent would be ignored anyway.
    socket.emit('place-bid', {
      productId: product.id,
      amount
    })
  }

  const handleRegistrationSuccess = () => {
    setIsRegistered(true)
    toast.success('You can now place bids on this auction!')
  }

  const quickBidAmounts = [
    minimumBid,
    minimumBid + 500,
    minimumBid + 1000,
    minimumBid + 2000
  ]

  return (
    <div className="space-y-6">
      {/* Auction Status */}
      <div className="bg-gradient-to-r from-primary-50 to-secondary-50 rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <CurrencyDollarIcon className="h-5 w-5" />
              <span className="text-sm">Current Bid</span>
            </div>
            <div className="text-2xl font-bold text-primary-600">
              {formatPrice(currentPrice)}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <ClockIcon className="h-5 w-5" />
              <span className="text-sm">Time Left</span>
            </div>
            <div className={`text-2xl font-bold ${isAuctionEnded ? 'text-red-600' : 'text-gray-900'}`}>
              {timeLeft}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <ArrowUpIcon className="h-5 w-5" />
              <span className="text-sm">Total Bids</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {bidsCount}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <UserGroupIcon className="h-5 w-5" />
              <span className="text-sm">Watching</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {product.watchers || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Live Auction Badge & Registration Prompt */}
      {isLiveAuction && (
        <div className={`rounded-xl p-4 mb-4 ${isRegistered ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isRegistered ? 'bg-green-100' : 'bg-orange-100'}`}>
                <TicketIcon className={`h-6 w-6 ${isRegistered ? 'text-green-600' : 'text-orange-600'}`} />
              </div>
              <div>
                <p className={`font-semibold ${isRegistered ? 'text-green-800' : 'text-orange-800'}`}>
                  Live Auction
                </p>
                <p className={`text-sm ${isRegistered ? 'text-green-600' : 'text-orange-600'}`}>
                  {isRegistered
                    ? 'You are registered to bid'
                    : `Registration fee: ${formatPrice(product.registrationFee || 5)}`
                  }
                </p>
              </div>
            </div>
            {!isRegistered && isAuthenticated && (
              <button
                onClick={() => setShowRegistrationModal(true)}
                disabled={checkingRegistration}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium disabled:opacity-50"
              >
                {checkingRegistration ? 'Checking...' : 'Register Now'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bidding Form */}
      {!isAuctionEnded && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Place Your Bid</h3>

          {!isAuthenticated && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                <p className="text-yellow-800">Please login to place a bid</p>
              </div>
            </div>
          )}

          {isAuthenticated && isLiveAuction && !isRegistered && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2">
                <TicketIcon className="h-5 w-5 text-orange-600" />
                <p className="text-orange-800">
                  You must register and pay {formatPrice(product.registrationFee || 5)} to bid on this live auction
                </p>
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter your bid (Minimum: {formatPrice(minimumBid)})
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    R
                  </span>
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="input pl-8"
                    placeholder={minimumBid.toString()}
                    disabled={!isAuthenticated || isPlacingBid}
                  />
                </div>
                <button
                  onClick={handlePlaceBid}
                  disabled={!isAuthenticated || isPlacingBid || !bidAmount || (isLiveAuction && !isRegistered)}
                  className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPlacingBid ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Placing...
                    </span>
                  ) : (
                    'Place Bid'
                  )}
                </button>
              </div>
            </div>
            
            {/* Quick Bid Buttons */}
            <div>
              <p className="text-sm text-gray-600 mb-2">Quick bid amounts:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {quickBidAmounts.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setBidAmount(amount.toString())}
                    disabled={!isAuthenticated || (isLiveAuction && !isRegistered)}
                    className="btn-outline text-sm"
                  >
                    {formatPrice(amount)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Bids */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Recent Bids</h3>
        
        {recentBids.length > 0 ? (
          <div className="space-y-3">
            <AnimatePresence>
              {recentBids.map((bid, index) => (
                <motion.div
                  key={bid.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    index === 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      index === 0 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{bid.userName}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(bid.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${
                    index === 0 ? 'text-green-600' : 'text-gray-700'
                  }`}>
                    {formatPrice(bid.amount)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No bids yet. Be the first!</p>
        )}
      </div>

      {/* Live Auction Registration Modal */}
      <LiveAuctionRegistrationModal
        isOpen={showRegistrationModal}
        onClose={() => setShowRegistrationModal(false)}
        onSuccess={handleRegistrationSuccess}
        product={product}
        userBalance={user?.balance || 0}
      />
    </div>
  )
}

export default BiddingSection