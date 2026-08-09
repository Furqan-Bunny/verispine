const { admin, db } = require('../config/firebase');

/**
 * Idempotently credit a wallet top-up to the user's balance.
 *
 * Used by both top-up providers (AddPay verify, Traderoot charge) so crediting
 * logic lives in one place. Runs in a transaction and is safe to call more than
 * once — a top-up already marked 'completed' is a no-op.
 *
 * @param {string} topupId  id of a doc in the walletTopups collection
 * @returns {Promise<{alreadyCredited:boolean, amount:number, userId:string, balanceAfter?:number}>}
 */
async function creditWalletTopup(topupId) {
  return db.runTransaction(async (tx) => {
    const topupRef = db.collection('walletTopups').doc(topupId);
    const topupSnap = await tx.get(topupRef);
    if (!topupSnap.exists) throw new Error('Top-up not found');
    const topup = topupSnap.data();

    if (topup.status === 'completed') {
      return { alreadyCredited: true, amount: Number(topup.amount), userId: topup.userId };
    }

    const userRef = db.collection('users').doc(topup.userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error('User not found');

    const amount = Number(topup.amount);
    const balanceBefore = Number(userSnap.data().balance || 0);
    const balanceAfter = balanceBefore + amount;
    const now = admin.firestore.FieldValue.serverTimestamp();

    tx.update(userRef, { balance: balanceAfter, updatedAt: now });

    const walletTxRef = db.collection('walletTransactions').doc();
    tx.set(walletTxRef, {
      id: walletTxRef.id,
      userId: topup.userId,
      type: 'credit',
      amount,
      balanceBefore,
      balanceAfter,
      description: `Wallet top-up via ${topup.provider || 'card'}`,
      relatedTopupId: topupId,
      status: 'completed',
      createdAt: now,
    });

    tx.update(topupRef, { status: 'completed', completedAt: now, updatedAt: now });

    return { alreadyCredited: false, amount, userId: topup.userId, balanceAfter };
  });
}

module.exports = { creditWalletTopup };
