// Run: node api/_lib/signup-patterns.test.mjs
import assert from 'node:assert/strict';
import { isScriptEmail, unusualDomains, maxBurst, fastOrderUsers, domainOf } from './signup-patterns.js';

const now = Date.parse('2026-11-14T00:30:00Z');
const at = (min) => new Date(now - min * 60 * 1000).toISOString();

// 1. Script-like email names.
assert.equal(isScriptEmail('nl1794609893@fldubai.com'), true);
assert.equal(isScriptEmail('ab1234567890@example.org'), true);
assert.equal(isScriptEmail('ramlan.hadiansyah@gmail.com'), false);
assert.equal(isScriptEmail('john1990@gmail.com'), false, 'a birth year is not a script');
assert.equal(isScriptEmail('alex12345678@gmail.com'), false, '8 digits stays below the limit');
assert.equal(isScriptEmail('not-an-email'), false);
assert.equal(isScriptEmail(null), false);
assert.equal(domainOf('X@FlDubai.com'), 'fldubai.com');

// 2. Unusual new domain: 2 or more accounts today from a non-common domain, none before.
const bots = [
  { email: 'nl1@fldubai.com', created_at: at(20) },
  { email: 'nl2@fldubai.com', created_at: at(15) },
];
assert.deepEqual(unusualDomains(bots, now), [{ domain: 'fldubai.com', count: 2 }]);
assert.equal(unusualDomains([bots[0]], now).length, 0, 'one account is not enough');
assert.equal(unusualDomains([{ email: 'a@gmail.com', created_at: at(5) }, { email: 'b@gmail.com', created_at: at(6) }], now).length, 0, 'gmail is common');
// A company domain that already had an account days ago is not "new".
const company = [{ email: 'a@acme.io', created_at: at(60 * 24 * 3) }, { email: 'b@acme.io', created_at: at(10) }, { email: 'c@acme.io', created_at: at(12) }];
assert.equal(unusualDomains(company, now).length, 0);

// 3. Burst: most accounts inside one hour, last 24 hours only.
assert.equal(maxBurst([], now), 0);
assert.equal(maxBurst(bots, now), 2);
const four = [5, 20, 33, 50].map((m) => ({ created_at: at(m) }));
assert.equal(maxBurst(four, now), 4);
const spread = [10, 120, 240, 400].map((m) => ({ created_at: at(m) }));
assert.equal(maxBurst(spread, now), 1);
assert.equal(maxBurst([{ created_at: at(60 * 30) }, { created_at: at(60 * 30 + 5) }], now), 0, 'older than 24h is ignored');

// 4. Fast order: an order within 30 minutes of sign-up (the bot placed one after 8 minutes).
const created = new Map([['bot', at(8)], ['buyer', at(60 * 48)], ['late', at(120)]]);
const orders = [
  { user_id: 'bot', created_at: at(0) },
  { user_id: 'buyer', created_at: at(0) },
  { user_id: 'late', created_at: at(0) },
  { user_id: 'unknown', created_at: at(0) },
];
assert.equal(fastOrderUsers(created, orders), 1);
assert.equal(fastOrderUsers(created, [{ user_id: 'bot', created_at: at(8 + 5) }]), 0, 'an order before the signup time does not count');

console.log('signup-patterns: all checks passed');
