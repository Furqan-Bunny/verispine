const { admin } = require('../config/firebase');

/**
 * Finalize a product's stock/status after a payment has been confirmed.
 *
 * Centralizes the "mark product after purchase" step that every payment handler
 * (wallet, verification, addpay, payfast, firebase, traderoot) performs, so the
 * two product types behave consistently:
 *
 *  - auction / buy_now / auction_win (single-item): product is marked 'sold'.
 *  - sale + stockType 'limited' (default): soldQuantity is incremented by the order
 *    quantity. The product stays 'active' while stock remains and flips to 'sold'
 *    only when the last unit is gone.
 *  - sale + stockType 'unlimited' ("always available"): soldQuantity is still
 *    incremented as a running sold-counter, but there is NO cap — it never throws
 *    OUT_OF_STOCK and never auto-flips to 'sold'. It stays available until a seller
 *    or admin manually marks it out of stock (status -> 'sold').
 *
 * MUST be called inside a Firestore transaction. `productData` MUST be the value
 * read with `transaction.get(productRef)` in the SAME transaction so the oversell
 * check sees committed state (the transaction retries on a conflicting commit).
 *
 * Throws an Error with code 'OUT_OF_STOCK' if a sale order would exceed remaining
 * stock — the caller should let the transaction abort so the buyer can be refunded
 * / informed rather than overselling.
 *
 * @param {FirebaseFirestore.Transaction} transaction
 * @param {FirebaseFirestore.DocumentReference} productRef
 * @param {object} productData  product doc data read in this transaction
 * @param {object} orderData    order doc data (type, quantity, buyerId, amount)
 */
function finalizeProductAfterPurchase(transaction, productRef, productData, orderData) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const listingType = (productData && productData.listingType) || 'auction';

  if (listingType === 'sale') {
    const qty = Math.max(1, Number(orderData.quantity) || 1);
    const sold = Number(productData.soldQuantity) || 0;
    const newSold = sold + qty;
    const isUnlimited = productData.stockType === 'unlimited';

    // Unlimited ("always available"): count the sale but never cap or auto-close.
    if (isUnlimited) {
      transaction.update(productRef, { soldQuantity: newSold, updatedAt: now });
      return { listingType, newSold, soldOut: false };
    }

    // Limited: enforce stock and auto-close when the last unit is gone.
    const total = Number(productData.quantity) || 0;
    if (sold + qty > total) {
      const err = new Error('OUT_OF_STOCK');
      err.code = 'OUT_OF_STOCK';
      err.remaining = total - sold;
      throw err;
    }

    const update = {
      soldQuantity: newSold,
      updatedAt: now,
    };
    if (newSold >= total) {
      update.status = 'sold';
      update.soldAt = now;
    }
    transaction.update(productRef, update);
    return { listingType, newSold, soldOut: newSold >= total };
  }

  // Auction / single-item buy_now: one item, one buyer.
  const auctionUpdate = {
    status: 'sold',
    soldTo: orderData.buyerId || orderData.userId || null,
    soldAt: now,
    updatedAt: now,
  };
  if (orderData.amount != null) {
    auctionUpdate.soldPrice = Number(orderData.amount);
  }
  transaction.update(productRef, auctionUpdate);
  return { listingType, soldOut: true };
}

module.exports = { finalizeProductAfterPurchase };
