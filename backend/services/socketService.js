const socketIO = require('socket.io');
const { admin, db, auth, storage } = require('../config/firebase');
const { verifyTokenToUid } = require('../middleware/auth');
const { placeBid } = require('../utils/placeBid');
const emailService = require('./resendEmailService');

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
    
    // Same allowlist the REST API uses. Keeping these in sync matters: an origin
    // allowed for REST but not for websockets loses live bidding without any
    // visible error, which is exactly what happened in the codebase this came from.
    const { buildAllowedOrigins } = require('../config/corsOrigins');

    this.io = socketIO(server, {
      cors: {
        origin: buildAllowedOrigins(),
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    /**
     * Resolve the connection's identity once, at handshake.
     *
     * Connections are NOT rejected when the token is missing or invalid —
     * browsing an auction live is open to anonymous visitors. What an anonymous
     * socket cannot do is act: `place-bid` requires socket.data.userId, which
     * only a verified token sets. Doing this at the handshake rather than per
     * event means there is no code path where a handler reads an identity off
     * the wire.
     */
    this.io.use(async (socket, next) => {
      const token = socket.handshake.auth?.token
        || socket.handshake.headers?.authorization
        || socket.handshake.query?.token;

      socket.data.userId = await verifyTokenToUid(token);
      next();
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
              // `totalBids` is the canonical field. The socket path used to write
              // `bidsCount` while REST wrote `totalBids`, so the count shown
              // depended on which path placed the last bid.
              totalBids: productData.totalBids || 0,
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
      /**
       * Place a bid over the websocket.
       *
       * The identity comes from the socket's verified token (see the
       * authenticate handler above), NOT from the payload. Previously this
       * handler took `userId` and `userName` straight off the wire, so anyone
       * with a browser console could place bids as any user, and could bid on
       * their own listing by sending someone else's id.
       *
       * The bid itself goes through utils/placeBid so the websocket and REST
       * paths cannot drift apart again.
       */
      socket.on('place-bid', async (bidData = {}) => {
        try {
          const userId = socket.data.userId;
          if (!userId) {
            socket.emit('bid-error', {
              message: 'You must be signed in to bid.',
              requiresAuth: true,
            });
            return;
          }

          const { productId, amount } = bidData;
          const result = await placeBid({ productId, amount, userId });

          // Everyone in the room, including the bidder.
          this.io.to(`auction-${productId}`).emit('new-bid', {
            id: result.bidId,
            productId,
            userId: result.userId,
            userName: result.userName,
            amount: result.amount,
            currentPrice: result.currentPrice,
            totalBids: result.totalBids,
            timestamp: new Date(),
          });

          socket.emit('bid-success', {
            message: 'Bid placed successfully!',
            bidId: result.bidId,
            amount: result.amount,
            currentPrice: result.currentPrice,
            totalBids: result.totalBids,
          });

          console.log(`Bid ${result.amount} on product ${productId} by ${result.userName}`);

          // Emails are best-effort — a mail failure must not undo a placed bid.
          try {
            await emailService.sendBidConfirmation(result.bidder, result, result.product);
            if (result.previousBidderData) {
              const prev = await db.collection('users').doc(result.previousBidderData.userId).get();
              if (prev.exists) {
                await emailService.sendOutbidNotification(prev.data(), result.product, result.amount);
              }
            }
          } catch (emailError) {
            console.error('Bid email notification failed:', emailError.message);
          }
        } catch (error) {
          // Validation failures carry an httpStatus and a message meant for the
          // user; anything else is ours and gets a generic message.
          if (error && error.httpStatus) {
            socket.emit('bid-error', { message: error.message, ...(error.payload || {}) });
            return;
          }
          console.error('Error placing bid:', error);
          socket.emit('bid-error', { message: 'Failed to place bid. Please try again.' });
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