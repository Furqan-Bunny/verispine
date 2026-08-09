const { admin, db } = require('../config/firebase');
const emailService = require('./resendEmailService');

class AuctionScheduler {
  constructor() {
    this.checkInterval = null;
    this.paymentCheckInterval = null;
  }

  // Start the scheduler
  start() {
    // Check for expired auctions and scheduled auctions every minute
    this.checkInterval = setInterval(() => {
      this.checkExpiredAuctions();
      this.checkScheduledAuctions();
    }, 60000); // 1 minute

    // Check for expired payments and send reminders every 30 minutes
    this.paymentCheckInterval = setInterval(() => {
      this.checkExpiredPayments();
      this.sendPaymentReminders();
    }, 30 * 60 * 1000); // 30 minutes

    // Initial checks on startup
    this.checkExpiredAuctions();
    this.checkScheduledAuctions();
    this.checkExpiredPayments();
    this.sendPaymentReminders();

    console.log('Auction scheduler started (with payment deadline + scheduled auction checks)');
  }

  // Stop the scheduler
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.paymentCheckInterval) {
      clearInterval(this.paymentCheckInterval);
      this.paymentCheckInterval = null;
    }
    console.log('Auction scheduler stopped');
  }

  // Check for expired auctions and process them
  async checkExpiredAuctions() {
    if (!db) {
      console.log('Skipping auction check - Firebase not available');
      return;
    }
    
    try {
      const now = new Date();
      
      // Find all active auctions that have ended
      let expiredProductsSnapshot;
      try {
        expiredProductsSnapshot = await db.collection('products')
          .where('status', '==', 'active')
          .where('endDate', '<=', now)
          .get();
      } catch (indexError) {
        // Fallback: Get all active products and filter manually
        console.log('Index not ready, using fallback query');
        const activeProducts = await db.collection('products')
          .where('status', '==', 'active')
          .get();
        
        const expiredDocs = [];
        activeProducts.forEach(doc => {
          const data = doc.data();
          const endDate = data.endDate?._seconds ? 
            new Date(data.endDate._seconds * 1000) : 
            new Date(data.endDate);
          
          if (endDate <= now) {
            expiredDocs.push(doc);
          }
        });
        
        expiredProductsSnapshot = { 
          empty: expiredDocs.length === 0, 
          size: expiredDocs.length,
          docs: expiredDocs 
        };
      }

      if (expiredProductsSnapshot.empty) {
        return;
      }

      console.log(`Found ${expiredProductsSnapshot.size} expired auctions to process`);

      // Process each expired auction
      for (const doc of expiredProductsSnapshot.docs) {
        await this.processExpiredAuction(doc.id, doc.data());
      }
    } catch (error) {
      console.error('Error checking expired auctions:', error);
    }
  }

  // Process a single expired auction
  async processExpiredAuction(productId, product) {
    try {
      // Fixed-price products never expire into an auction win — skip defensively.
      // (They have no endDate so the query shouldn't return them, but guard anyway.)
      if (product.listingType === 'sale') return;

      console.log(`Processing expired auction: ${product.title} (${productId})`);

      // Get the highest bid
      const highestBidSnapshot = await db.collection('bids')
        .where('productId', '==', productId)
        .where('status', '==', 'active')
        .orderBy('amount', 'desc')
        .limit(1)
        .get();

      let updates = {
        status: 'ended',
        endedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (!highestBidSnapshot.empty) {
        const highestBid = highestBidSnapshot.docs[0].data();
        
        // Set winner information
        updates.winnerId = highestBid.userId;
        updates.winnerName = highestBid.userName;
        updates.finalPrice = highestBid.amount;
        updates.status = 'sold';

        // Update product
        await db.collection('products').doc(productId).update(updates);

        // Create order for the winner
        const orderData = {
          productId,
          productTitle: product.title,
          productImage: product.images?.[0] || '',
          sellerId: product.sellerId,
          sellerName: product.sellerName,
          buyerId: highestBid.userId,
          buyerName: highestBid.userName,
          amount: highestBid.amount,
          status: 'pending_payment',
          paymentMethod: null,
          shippingAddress: null,
          paymentDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          remindersSent: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const orderRef = await db.collection('orders').add(orderData);
        console.log(`Created order ${orderRef.id} for auction ${productId}`);

        // Send winner notification email
        try {
          const winnerDoc = await db.collection('users').doc(highestBid.userId).get();
          if (winnerDoc.exists) {
            const winner = winnerDoc.data();
            await emailService.sendAuctionWonNotification(
              winner,
              product,
              highestBid.amount,
              orderRef.id
            );
            console.log(`Sent winner notification to ${winner.email}`);
          }
        } catch (emailError) {
          console.error('Error sending winner notification:', emailError);
        }

        // Create in-app notification for the winner
        try {
          await db.collection('notifications').add({
            userId: highestBid.userId,
            type: 'won',
            title: 'You won an auction!',
            message: `Congratulations! You won "${product.title}" for $${highestBid.amount}. Complete payment within 7 days.`,
            priority: 'urgent',
            actionUrl: `/orders/${orderRef.id}`,
            actionLabel: 'Complete Payment',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (notifError) {
          console.error('Error creating winner notification:', notifError);
        }

        // Update all other bids to 'lost' status
        const losingBidsSnapshot = await db.collection('bids')
          .where('productId', '==', productId)
          .where('status', 'in', ['active', 'outbid'])
          .get();

        const batch = db.batch();
        losingBidsSnapshot.forEach(doc => {
          if (doc.id !== highestBidSnapshot.docs[0].id) {
            batch.update(doc.ref, {
              status: 'lost',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        });
        
        // Update winning bid status
        batch.update(highestBidSnapshot.docs[0].ref, {
          status: 'won',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
        console.log(`Updated bid statuses for auction ${productId}`);
      } else {
        /**
         * No bids — the auction still ENDED.
         *
         * This used to set status to 'ended_no_bids', a value nothing in the
         * frontend recognises: the seller's "Ended" tab filters on 'ended', the
         * status badge map has no entry for it, and the admin ended-count
         * ignores it. The effect was that an auction nobody bid on vanished from
         * every view the seller had. The status stays canonical and the fact
         * that it drew no bids is recorded alongside it.
         */
        updates.status = 'ended';
        updates.endedWithoutBids = true;
        await db.collection('products').doc(productId).update(updates);
        console.log(`Auction ${productId} ended with no bids`);
      }
    } catch (error) {
      console.error(`Error processing expired auction ${productId}:`, error);
    }
  }

  // Check for scheduled auctions that should go live
  async checkScheduledAuctions() {
    if (!db) {
      console.log('Skipping scheduled auction check - Firebase not available');
      return;
    }

    try {
      const now = new Date();

      let scheduledSnapshot;
      try {
        scheduledSnapshot = await db.collection('products')
          .where('status', '==', 'scheduled')
          .where('scheduledStartTime', '<=', now)
          .get();
      } catch (indexError) {
        // Fallback: query all scheduled and filter in code
        console.log('Scheduled auction index not ready, using fallback query');
        const allScheduled = await db.collection('products')
          .where('status', '==', 'scheduled')
          .get();

        const readyDocs = [];
        allScheduled.forEach(doc => {
          const data = doc.data();
          const startTime = data.scheduledStartTime?.toDate?.()
            || (data.scheduledStartTime?._seconds ? new Date(data.scheduledStartTime._seconds * 1000) : new Date(data.scheduledStartTime));
          if (startTime <= now) {
            readyDocs.push(doc);
          }
        });

        scheduledSnapshot = {
          empty: readyDocs.length === 0,
          size: readyDocs.length,
          docs: readyDocs
        };
      }

      if (scheduledSnapshot.empty) {
        return;
      }

      console.log(`Found ${scheduledSnapshot.size} scheduled auctions to activate`);

      for (const doc of scheduledSnapshot.docs) {
        await this.activateScheduledAuction(doc.id, doc.data());
      }
    } catch (error) {
      console.error('Error checking scheduled auctions:', error);
    }
  }

  // Activate a single scheduled auction
  async activateScheduledAuction(productId, product) {
    try {
      // Fixed-price products aren't scheduled auctions — skip defensively.
      if (product.listingType === 'sale') return;

      const now = new Date();
      const durationDays = product.durationDays || 7;
      const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      console.log(`Activating scheduled auction: ${product.title} (${productId})`);

      await db.collection('products').doc(productId).update({
        status: 'active',
        isScheduled: false,
        endDate: endDate,
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Auction ${productId} activated, ends at ${endDate.toISOString()}`);

      // Broadcast notifications and emails (fire-and-forget)
      this.broadcastAuctionLive(productId, product).catch(err => {
        console.error('Error broadcasting auction live:', err);
      });
    } catch (error) {
      console.error(`Error activating scheduled auction ${productId}:`, error);
    }
  }

  // Broadcast notifications and emails when an auction goes live
  async broadcastAuctionLive(productId, product) {
    try {
      // Get all users
      const usersSnapshot = await db.collection('users').get();
      if (usersSnapshot.empty) return;

      const users = [];
      usersSnapshot.forEach(doc => {
        users.push({ id: doc.id, ...doc.data() });
      });

      console.log(`Broadcasting auction live to ${users.length} users for "${product.title}"`);

      // In-app notifications — batched in 500s (Firestore limit)
      for (let i = 0; i < users.length; i += 500) {
        const batch = db.batch();
        const chunk = users.slice(i, i + 500);

        for (const u of chunk) {
          const notifRef = db.collection('notifications').doc();
          batch.set(notifRef, {
            userId: u.id,
            type: 'auction_live',
            title: 'New Auction is Live!',
            message: `"${product.title}" is now live! Starting at $${product.startingPrice}.`,
            actionUrl: `/products/${productId}`,
            actionLabel: 'View Auction',
            priority: 'medium',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        await batch.commit();
      }

      console.log(`Sent ${users.length} in-app notifications for auction ${productId}`);

      // Build a clean email product object (avoid Firestore sentinel/Timestamp values)
      const emailProduct = {
        id: productId,
        title: product.title || 'Untitled',
        startingPrice: product.startingPrice || 0,
        buyNowPrice: product.buyNowPrice || null,
        images: product.images || [],
        category: product.category || '',
        durationDays: product.durationDays || 7
      };

      // Emails — rate limited to 1 per 600ms (Resend allows max 2/sec)
      const emailUsers = users.filter(u => u.email && u.emailNotifications !== false);
      console.log(`[LIVE] Sending emails to ${emailUsers.length} eligible users (out of ${users.length} total)`);

      let emailsSent = 0;
      let emailsFailed = 0;

      for (const u of emailUsers) {
        try {
          const result = await emailService.sendAuctionGoingLiveEmail(u, emailProduct);
          if (result) {
            emailsSent++;
          } else {
            emailsFailed++;
            console.error(`[LIVE] Email returned false for ${u.email}`);
          }
        } catch (emailError) {
          emailsFailed++;
          console.error(`[LIVE] Email exception for ${u.email}:`, emailError.message);
        }
        // Respect Resend rate limit: max 2 requests/second
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      console.log(`[LIVE] Email results for ${productId}: ${emailsSent} sent, ${emailsFailed} failed`);
    } catch (error) {
      console.error(`Error broadcasting auction live for ${productId}:`, error);
    }
  }

  // Broadcast notifications and emails when an auction is SCHEDULED (immediately on creation)
  async broadcastAuctionScheduled(productId, product) {
    try {
      const usersSnapshot = await db.collection('users').get();
      if (usersSnapshot.empty) {
        console.log(`[SCHEDULED] No users found, skipping broadcast for ${productId}`);
        return;
      }

      const users = [];
      usersSnapshot.forEach(doc => {
        users.push({ id: doc.id, ...doc.data() });
      });

      // Format the scheduled date for display
      const scheduledDate = new Date(product.scheduledStartTime);
      const dateStr = scheduledDate.toLocaleDateString('en-US', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      const timeStr = scheduledDate.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });

      console.log(`[SCHEDULED] Broadcasting to ${users.length} users for "${product.title}" (${productId})`);

      // In-app notifications — batched in 500s
      for (let i = 0; i < users.length; i += 500) {
        const batch = db.batch();
        const chunk = users.slice(i, i + 500);

        for (const u of chunk) {
          const notifRef = db.collection('notifications').doc();
          batch.set(notifRef, {
            userId: u.id,
            type: 'auction_scheduled',
            title: 'New Auction Coming Soon!',
            message: `"${product.title}" is coming soon! Starting at $${product.startingPrice}. Goes live on ${dateStr} at ${timeStr}.`,
            actionUrl: `/products/${productId}`,
            actionLabel: 'View Auction',
            priority: 'medium',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        await batch.commit();
      }

      console.log(`[SCHEDULED] Sent ${users.length} notifications for ${productId}`);

      // Build a clean email product object (avoid Firestore sentinel values)
      const emailProduct = {
        id: productId,
        title: product.title || 'Untitled',
        startingPrice: product.startingPrice || 0,
        buyNowPrice: product.buyNowPrice || null,
        images: product.images || [],
        scheduledStartTime: product.scheduledStartTime,
        durationDays: product.durationDays || 7,
        category: product.category || ''
      };

      // Emails — rate limited to 1 per 600ms (Resend allows max 2/sec)
      const emailUsers = users.filter(u => u.email && u.emailNotifications !== false);
      console.log(`[SCHEDULED] Sending emails to ${emailUsers.length} eligible users (out of ${users.length} total)`);

      if (emailUsers.length === 0) {
        console.log(`[SCHEDULED] No eligible email users found. Check emailNotifications field.`);
        return;
      }

      let emailsSent = 0;
      let emailsFailed = 0;

      for (const u of emailUsers) {
        try {
          const result = await emailService.sendAuctionScheduledEmail(u, emailProduct);
          if (result) {
            emailsSent++;
          } else {
            emailsFailed++;
            console.error(`[SCHEDULED] Email returned false for ${u.email}`);
          }
        } catch (emailError) {
          emailsFailed++;
          console.error(`[SCHEDULED] Email exception for ${u.email}:`, emailError.message, emailError.stack);
        }
        // Respect Resend rate limit: max 2 requests/second
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      console.log(`[SCHEDULED] Email results for ${productId}: ${emailsSent} sent, ${emailsFailed} failed`);
    } catch (error) {
      console.error(`[SCHEDULED] FATAL error broadcasting for ${productId}:`, error.message, error.stack);
    }
  }

  // Accept a specific bid (called from admin endpoint)
  async acceptBid(productId, bidId, adminUserId) {
    // Validate product
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      throw new Error('Product not found');
    }
    const product = productDoc.data();
    if (product.status !== 'active' && product.status !== 'ended') {
      throw new Error(`Cannot accept bid: product status is "${product.status}"`);
    }

    // Validate bid
    const bidDoc = await db.collection('bids').doc(bidId).get();
    if (!bidDoc.exists) {
      throw new Error('Bid not found');
    }
    const bid = bidDoc.data();
    if (bid.productId !== productId) {
      throw new Error('Bid does not belong to this product');
    }
    if (bid.status !== 'active' && bid.status !== 'outbid') {
      throw new Error(`Cannot accept bid: bid status is "${bid.status}"`);
    }

    // Update product to sold
    await db.collection('products').doc(productId).update({
      status: 'sold',
      winnerId: bid.userId,
      winnerName: bid.userName,
      finalPrice: bid.amount,
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
      acceptedBy: adminUserId
    });

    // Create order
    const orderData = {
      productId,
      productTitle: product.title,
      productImage: product.images?.[0] || '',
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      buyerId: bid.userId,
      buyerName: bid.userName,
      amount: bid.amount,
      productPrice: bid.amount,
      totalAmount: bid.amount,
      status: 'pending_payment',
      type: 'auction_win',
      acceptedByAdmin: adminUserId,
      paymentMethod: null,
      shippingAddress: null,
      paymentDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      remindersSent: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const orderRef = await db.collection('orders').add(orderData);
    console.log(`Created order ${orderRef.id} for accepted bid on auction ${productId}`);

    // Batch update bids: winning bid → 'won', all others → 'lost'
    const allBidsSnapshot = await db.collection('bids')
      .where('productId', '==', productId)
      .where('status', 'in', ['active', 'outbid'])
      .get();

    const batch = db.batch();
    allBidsSnapshot.forEach(doc => {
      if (doc.id === bidId) {
        batch.update(doc.ref, {
          status: 'won',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        batch.update(doc.ref, {
          status: 'lost',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });
    await batch.commit();

    // Send winner email
    try {
      const winnerDoc = await db.collection('users').doc(bid.userId).get();
      if (winnerDoc.exists) {
        const winner = winnerDoc.data();
        await emailService.sendAuctionWonNotification(winner, product, bid.amount, orderRef.id);
        console.log(`Sent winner notification to ${winner.email}`);
      }
    } catch (emailError) {
      console.error('Error sending winner notification:', emailError);
    }

    // Create in-app notification
    try {
      await db.collection('notifications').add({
        userId: bid.userId,
        type: 'won',
        title: 'You won an auction!',
        message: `Congratulations! Your bid of $${bid.amount} on "${product.title}" was accepted. Proceed to payment.`,
        priority: 'urgent',
        actionUrl: `/orders/${orderRef.id}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
    }

    return {
      orderId: orderRef.id,
      winnerId: bid.userId,
      winnerName: bid.userName,
      amount: bid.amount
    };
  }

  // Check for orders with expired payment deadlines
  async checkExpiredPayments() {
    if (!db) return;

    try {
      const now = new Date();
      let expiredOrders;

      try {
        // Try composite index query first
        const snapshot = await db.collection('orders')
          .where('status', '==', 'pending_payment')
          .where('paymentDeadline', '<=', now)
          .get();
        expiredOrders = snapshot.docs;
      } catch (indexError) {
        // Fallback: query by status and filter manually
        console.log('Payment deadline index not ready, using fallback query');
        const snapshot = await db.collection('orders')
          .where('status', '==', 'pending_payment')
          .get();

        expiredOrders = snapshot.docs.filter(doc => {
          const data = doc.data();
          if (!data.paymentDeadline) return false;
          const deadline = data.paymentDeadline?.toDate?.() || new Date(data.paymentDeadline);
          return deadline <= now;
        });
      }

      if (expiredOrders.length === 0) return;

      console.log(`Found ${expiredOrders.length} orders with expired payment deadlines`);

      for (const doc of expiredOrders) {
        await this.processExpiredPayment(doc.id, doc.data());
      }
    } catch (error) {
      console.error('Error checking expired payments:', error);
    }
  }

  // Process a single expired payment order
  async processExpiredPayment(orderId, order) {
    try {
      // Re-read order to confirm still pending_payment (race condition guard)
      const orderDoc = await db.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) return;
      const currentOrder = orderDoc.data();
      if (currentOrder.status !== 'pending_payment') return;

      console.log(`Processing expired payment for order ${orderId} (product: ${currentOrder.productTitle})`);

      // 1. Cancel the order
      await db.collection('orders').doc(orderId).update({
        status: 'cancelled',
        cancelledBy: 'system',
        cancellationReason: 'Payment deadline expired (7 days)',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. Re-list the product
      const productDoc = await db.collection('products').doc(currentOrder.productId).get();
      if (productDoc.exists) {
        const product = productDoc.data();
        await db.collection('products').doc(currentOrder.productId).update({
          status: 'active',
          winnerId: admin.firestore.FieldValue.delete(),
          winnerName: admin.firestore.FieldValue.delete(),
          finalPrice: admin.firestore.FieldValue.delete(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          currentPrice: product.startingPrice || product.currentPrice,
          totalBids: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 3. Mark all existing bids for this product as expired
        const bidsSnapshot = await db.collection('bids')
          .where('productId', '==', currentOrder.productId)
          .get();

        if (!bidsSnapshot.empty) {
          const batch = db.batch();
          bidsSnapshot.forEach(doc => {
            batch.update(doc.ref, {
              status: 'expired',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          });
          await batch.commit();
        }

        // 4. Send email + notification to buyer (payment expired)
        try {
          const buyerDoc = await db.collection('users').doc(currentOrder.buyerId).get();
          if (buyerDoc.exists) {
            const buyer = buyerDoc.data();
            await emailService.sendPaymentExpiredEmail(buyer, { ...currentOrder, id: orderId });
          }
        } catch (emailError) {
          console.error('Error sending payment expired email to buyer:', emailError);
        }

        try {
          await db.collection('notifications').add({
            userId: currentOrder.buyerId,
            type: 'payment_expired',
            title: 'Payment Deadline Expired',
            message: `Your payment deadline for "${currentOrder.productTitle}" has expired. The order has been cancelled and the item has been re-listed.`,
            priority: 'high',
            actionUrl: '/products',
            actionLabel: 'Browse Auctions',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (notifError) {
          console.error('Error creating buyer notification:', notifError);
        }

        // 5. Send email + notification to seller (product re-listed)
        try {
          const sellerDoc = await db.collection('users').doc(currentOrder.sellerId).get();
          if (sellerDoc.exists) {
            const seller = sellerDoc.data();
            await emailService.sendProductRelistedEmail(seller, {
              ...product,
              id: currentOrder.productId,
              newEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
          }
        } catch (emailError) {
          console.error('Error sending re-listed email to seller:', emailError);
        }

        try {
          await db.collection('notifications').add({
            userId: currentOrder.sellerId,
            type: 'product_relisted',
            title: 'Product Re-listed',
            message: `"${currentOrder.productTitle}" has been re-listed because the buyer did not complete payment within 7 days.`,
            priority: 'medium',
            actionUrl: `/products/${currentOrder.productId}`,
            actionLabel: 'View Product',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (notifError) {
          console.error('Error creating seller notification:', notifError);
        }
      }

      console.log(`Expired payment processed for order ${orderId} - order cancelled, product re-listed`);
    } catch (error) {
      console.error(`Error processing expired payment for order ${orderId}:`, error);
    }
  }

  // Send payment reminders for pending orders approaching deadline
  async sendPaymentReminders() {
    if (!db) return;

    try {
      const snapshot = await db.collection('orders')
        .where('status', '==', 'pending_payment')
        .get();

      if (snapshot.empty) return;

      const now = Date.now();

      for (const doc of snapshot.docs) {
        const order = doc.data();
        if (!order.paymentDeadline) continue;

        const deadline = order.paymentDeadline?.toDate?.() || new Date(order.paymentDeadline);
        const hoursRemaining = (deadline.getTime() - now) / (1000 * 60 * 60);
        const remindersSent = order.remindersSent || [];

        // Skip if deadline already passed (handled by checkExpiredPayments)
        if (hoursRemaining <= 0) continue;

        let reminderType = null;
        let priority = 'medium';

        if (hoursRemaining <= 4 && !remindersSent.includes('4hours')) {
          reminderType = '4hours';
          priority = 'urgent';
        } else if (hoursRemaining <= 24 && !remindersSent.includes('1day')) {
          reminderType = '1day';
          priority = 'high';
        } else if (hoursRemaining <= 48 && !remindersSent.includes('2days')) {
          reminderType = '2days';
          priority = 'medium';
        }

        if (!reminderType) continue;

        console.log(`Sending ${reminderType} payment reminder for order ${doc.id}`);

        // Send email reminder
        try {
          const buyerDoc = await db.collection('users').doc(order.buyerId).get();
          if (buyerDoc.exists) {
            const buyer = buyerDoc.data();
            await emailService.sendPaymentReminderEmail(buyer, { ...order, id: doc.id }, hoursRemaining);
          }
        } catch (emailError) {
          console.error('Error sending payment reminder email:', emailError);
        }

        // Create in-app notification
        const reminderMessages = {
          '2days': `You have 2 days left to complete payment for "${order.productTitle}".`,
          '1day': `Only 24 hours left to pay for "${order.productTitle}"! Don't miss out.`,
          '4hours': `FINAL WARNING: Only ${Math.round(hoursRemaining)} hours left to pay for "${order.productTitle}"!`
        };

        try {
          await db.collection('notifications').add({
            userId: order.buyerId,
            type: 'payment_reminder',
            title: reminderType === '4hours' ? 'Final Payment Warning!' : 'Payment Reminder',
            message: reminderMessages[reminderType],
            priority,
            actionUrl: `/orders/${doc.id}`,
            actionLabel: 'Pay Now',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (notifError) {
          console.error('Error creating reminder notification:', notifError);
        }

        // Update remindersSent array
        await db.collection('orders').doc(doc.id).update({
          remindersSent: admin.firestore.FieldValue.arrayUnion(reminderType),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error sending payment reminders:', error);
    }
  }

  // Manually end an auction (called from admin endpoint)
  async endAuctionManually(productId) {
    try {
      const productDoc = await db.collection('products').doc(productId).get();
      
      if (!productDoc.exists) {
        throw new Error('Product not found');
      }

      const product = productDoc.data();
      
      if (product.status !== 'active') {
        throw new Error('Auction is not active');
      }

      await this.processExpiredAuction(productId, product);
      return { success: true, message: 'Auction ended successfully' };
    } catch (error) {
      console.error('Error manually ending auction:', error);
      throw error;
    }
  }
}

module.exports = new AuctionScheduler();