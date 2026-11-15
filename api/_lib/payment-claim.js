// api/_lib/payment-claim.js
// Pure decision rule for "may this order take this incoming transfer?".
// Used by claimTransfersForOrder in api/orders.js. No database or network access here,
// so the rule can be tested on its own (see payment-claim.test.mjs).
//
// Why it exists: a user may type a transaction hash on the checkout page (meant for exchange
// withdrawals, where the sender address is not known in advance). Before this rule, a transfer
// that matched an order's hash was assigned to that order even when it was sent by someone else.
// Transfers to the finance wallet are public, so any account could type another buyer's hash
// and take the payment. The owner of the sending address now has priority:
//
//  - Sent from the order's own payer address: always allowed (the normal path).
//  - Matched only by the typed hash: allowed only when the sender is NOT
//      * the payer address of another open order, and
//      * the saved wallet of another account.
//    Otherwise the transfer stays 'unmatched' and an admin links it (Finance, Payments).
//  - If the owner lookups are missing, a hash claim is refused (fail closed).

export function claimVerdict(order, transfer, owners) {
  const from = String(transfer?.from_address || '').toLowerCase();
  const payer = String(order?.payer_address || '').toLowerCase();
  if (from && from === payer) return { allowed: true, via: 'address' };

  const claimed = String(order?.claimed_tx_hash || '').toLowerCase();
  const hash = String(transfer?.tx_hash || '').toLowerCase();
  if (!claimed || claimed !== hash) return { allowed: false, via: null, reason: 'no_match' };

  if (!owners) return { allowed: false, via: 'hash', reason: 'owners_unknown' };
  if (owners.malformed) return { allowed: false, via: 'hash', reason: 'sender_malformed' };
  if (owners.otherOpenOrder) return { allowed: false, via: 'hash', reason: 'sender_has_open_order' };
  if (owners.otherUser) return { allowed: false, via: 'hash', reason: 'sender_wallet_of_other_account' };
  return { allowed: true, via: 'hash' };
}
