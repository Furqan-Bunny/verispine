const socketIO = require('socket.io');
const { admin, db, auth, storage } = require('../config/firebase');

class SocketService {
  constructor() {
    this.io = null;
    this.activeAuctions = new Map(); // Track active auction rooms
  }

  initialize(server) {
    // Check if Socket.io is already initialized
    if (this.io) {
      console.log('Socket.io already initialized');
      return;
    }
    
    this.io = socketIO(server, {
      cors: {
        origin: [
          "http://localhost:3000",
          "http://localhost:3001",
          "http://localhost:3002",
          "http://localhost:3010",
          "http://localhost:5173",
          "https://quicksell-80aad.web.app",
          "https://quicksell-80aad--verispine-5ar9e0y8.web.app",
          "https://quicksell-80aad.firebaseapp.com"
        ],
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.setupEventHandlers();
    console.log('Socket.io initialized');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('New client connected:', socket.id);

      // Join auction room
      socket.on('join-auction', async (productId) => {
        socket.join(`auction-${productId}`);
        
        // Add to active auctions
        if (!this.activeAuctions.has(productId)) {
          this.activeAuctions.set(productId, new Set());
        }
        this.activeAuctions.get(productId).add(socket.id);
        
        console.log(`Socket ${socket.id} joined auction ${productId}`);
        
        // Send current bid info
        try {
          const product = await db.collection('products').doc(productId).get();
          if (product.exists) {
            const productData = product.data();
            
            // Get latest bids
            const bidsSnapshot = await db.collection('bids')
              .where('productId', '==', productId)
              .orderBy('amount', 'desc')
              .limit(5)
              .get();
            
            const bids = bidsSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            
            socket.emit('auction-info', {
              currentPrice: productData.currentPrice,
              bidsCount: productData.bidsCount || 0,
              topBids: bids,
              endDate: productData.endDate
            });
          }
        } catch (error) {
          console.error('Error fetching auction info:', error);
        }
      });

      // Leave auction room
      socket.on('leave-auction', (productId) => {
        socket.leave(`auction-${productId}`);
        
        // Remove from active auctions
        if (this.activeAuctions.has(productId)) {
          this.activeAuctions.get(productId).delete(socket.id);
          if (this.activeAuctions.get(productId).size === 0) {
            this.activeAuctions.delete(productId);
          }
        }
        
        console.log(`Socket ${socket.id} left auction ${productId}`);
      });

      // Handle new bid
      socket.on('place-bid', async (bidData) => {
        try {
          const { productId, userId, amount, userName } = bidData;

          // Validate bid
          const product = await db.collection('products').doc(productId).get();
          if (!product.exists) {
            socket.emit('bid-error', { message: 'Product not found' });
            return;
          }

          const productData = product.data();

          // Fixed-price products are not auctions — reject bids.
          if (productData.listingType === 'sale') {
            socket.emit('bid-error', { message: 'Bidding is not available for fixed-price products. Use Buy Now instead.' });
            return;
          }

          // Check if user is the seller
          if (productData.sellerId === userId) {
            socket.emit('bid-error', { message: 'You cannot bid on your own item' });
            return;
          }

          // Check if live auction registration is required
          if (productData.isLiveAuction) {
            const registeredUsers = productData.registeredUsers || [];
            if (!registeredUsers.includes(userId)) {
              socket.emit('bid-error', {
                message: 'You must register and pay the entry fee to bid in this live auction',
                requiresRegistration: true,
                registrationFee: productData.registrationFee || 5
              });
              return;
            }
          }

          // Check if auction is still active
          const now = new Date();
          const endDate = productData.endDate?._seconds
            ? new Date(productData.endDate._seconds * 1000)
            : new Date(productData.endDate);

          if (now > endDate) {
            socket.emit('bid-error', { message: 'Auction has ended' });
            return;
          }

          // Check minimum bid amount
          const minBid = productData.currentPrice + (productData.incrementAmount || 100);
          if (amount < minBid) {
            socket.emit('bid-error', {
              message: `Minimum bid is $${minBid}`
            });
            return;
          }
          
          // Create bid in Firestore
          if (!db) {
            socket.emit('bid-error', { message: 'Database connection unavailable' });
            return;
          }

          const timestamp = admin ? admin.firestore.FieldValue.serverTimestamp() : new Date();
          const incrementFn = admin ? admin.firestore.FieldValue.increment : (val) => val;

          const bid = {
            productId,
            userId,
            userName,
            amount,
            status: 'active',
            createdAt: timestamp
          };

          const bidRef = await db.collection('bids').add(bid);

          // Update product with new current price and bid count
          await db.collection('products').doc(productId).update({
            currentPrice: amount,
            bidsCount: incrementFn(1),
            lastBidAt: timestamp,
            highestBidderId: userId,
            highestBidderName: userName
          });
          
          // Notify all users in the auction room
          this.io.to(`auction-${productId}`).emit('new-bid', {
            id: bidRef.id,
            ...bid,
            timestamp: new Date()
          });
          
          // Send success to bidder
          socket.emit('bid-success', {
            message: 'Bid placed successfully!',
            bidId: bidRef.id,
            amount
          });
          
          console.log(`New bid placed: ${amount} on product ${productId} by ${userName}`);
          
        } catch (error) {
          console.error('Error placing bid:', error);
          socket.emit('bid-error', { 
            message: 'Failed to place bid. Please try again.' 
          });
        }
      });

      // Get bid history
      socket.on('get-bid-history', async (productId) => {
        try {
          const bidsSnapshot = await db.collection('bids')
            .where('productId', '==', productId)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
          
          const bids = bidsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          socket.emit('bid-history', bids);
        } catch (error) {
          console.error('Error fetching bid history:', error);
          socket.emit('bid-history', []);
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Remove from all auction rooms
        this.activeAuctions.forEach((sockets, productId) => {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            if (sockets.size === 0) {
              this.activeAuctions.delete(productId);
            }
          }
        });
      });
    });
  }

  // Emit event to specific auction room
  emitToAuction(productId, event, data) {
    if (this.io) {
      this.io.to(`auction-${productId}`).emit(event, data);
    }
  }

  // Get active users count for an auction
  getAuctionViewers(productId) {
    return this.activeAuctions.get(productId)?.size || 0;
  }
}

module.exports = new SocketService();