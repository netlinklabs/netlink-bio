// Run: node api/_lib/payment-claim.test.mjs
// Checks the rule in payment-claim.js. Plain node:assert, no test framework needed.
import assert from 'node:assert/strict';
import { claimVerdict } from './payment-claim.js';

const A = '0x' + 'a'.repeat(40); // attacker payer address
const V = '0x' + 'b'.repeat(40); // victim sender address
const H = '0x' + '1'.repeat(64); // hash of the victim's transfer

const attackerOrder = { payer_address: A, claimed_tx_hash: H };
const victimTransfer = { from_address: V, tx_hash: H };
const noOwners = { malformed: false, otherOpenOrder: false, otherUser: false };

// 1. Normal path: sent from the order's own payer address.
assert.deepEqual(claimVerdict({ payer_address: V, claimed_tx_hash: null }, victimTransfer, null), { allowed: true, via: 'address' });
assert.equal(claimVerdict({ payer_address: V.toUpperCase().replace('0X', '0x') }, victimTransfer, null).allowed, true, 'address compare ignores case');

// 2. The attack: attacker typed the victim's hash. The victim has an open order with that sender.
let v = claimVerdict(attackerOrder, victimTransfer, { ...noOwners, otherOpenOrder: true });
assert.equal(v.allowed, false);
assert.equal(v.reason, 'sender_has_open_order');

// 3. The sender is the saved wallet of another account (victim has no open order).
v = claimVerdict(attackerOrder, victimTransfer, { ...noOwners, otherUser: true });
assert.equal(v.allowed, false);
assert.equal(v.reason, 'sender_wallet_of_other_account');

// 4. Legitimate exchange withdrawal: unknown sender, hash typed by the buyer.
assert.deepEqual(claimVerdict(attackerOrder, victimTransfer, noOwners), { allowed: true, via: 'hash' });

// 5. Fail closed: missing or malformed owner data never allows a hash claim.
assert.equal(claimVerdict(attackerOrder, victimTransfer, undefined).reason, 'owners_unknown');
assert.equal(claimVerdict(attackerOrder, victimTransfer, null).reason, 'owners_unknown');
assert.equal(claimVerdict(attackerOrder, victimTransfer, { malformed: true }).reason, 'sender_malformed');

// 6. Defence in depth: a transfer that matches neither the payer nor the typed hash is refused.
assert.equal(claimVerdict(attackerOrder, { from_address: V, tx_hash: '0x' + '2'.repeat(64) }, noOwners).reason, 'no_match');
assert.equal(claimVerdict({ payer_address: A, claimed_tx_hash: null }, victimTransfer, noOwners).reason, 'no_match');

console.log('payment-claim: all checks passed');
