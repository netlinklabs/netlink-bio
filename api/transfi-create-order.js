// api/transfi-create-order.js
// Called from pay2.html (test page). Three steps:
//   1. Make sure this Netlink user has a TransFi userId (create one if not).
//   2. Look up the right paymentCode for the requested fiat currency --
//      never hardcoded, always fetched fresh from TransFi's own config.
//   3. Create the payin order and hand back payUrl for the iframe.
// Every TransFi call uses Basic Auth built server-side from env vars --
// the API secret never reaches the client.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TRANSFI_API_KEY = process.env.TRANSFI_API_KEY;
const TRANSFI_API_SECRET = process.env.TRANSFI_API_SECRET;
const TRANSFI_MID = process.env.TRANSFI_MID;
// Sandbox for now -- swap to https://api.transfi.com when we go live.
const TRANSFI_BASE = 'https://sandbox-api.transfi.com';

const SITE_URL = 'https://netlink-bio.vercel.app';

function transfiAuthHeaders() {
  const basic = Buffer.from(`${TRANSFI_API_KEY}:${TRANSFI_API_SECRET}`).toString('base64');
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Basic ${basic}`,
    mid: TRANSFI_MID,
  };
}

async function transfiRequest(path, options = {}) {
  const res = await fetch(`${TRANSFI_BASE}${path}`, {
    ...options,
    headers: { ...transfiAuthHeaders(), ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === 'error') {
    const err = new Error(body.message || body.error || `TransFi request failed (${res.status})`);
    err.code = body.code || body.errorCode;
    err.status = res.status;
    throw err;
  }
  return body;
}

async function getAuthedUser(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function getProfile(userId, accessToken) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=transfi_user_id,wallet_address,display_name`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error('Failed to load profile');
  const rows = await res.json();
  return rows[0] || null;
}

async function saveTransfiUserId(userId, transfiUserId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ transfi_user_id: transfiUserId }),
  });
  if (!res.ok) throw new Error('Failed to save transfi_user_id');
}

async function insertFiatOrder(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fiat_orders`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('Failed to insert fiat_orders row:', errText);
    // Don't block the payment over this -- the webhook can still upsert
    // later if it recognizes the order_id from a Get Order Status check.
  }
}

// DOB comes from the client as YYYY-MM-DD (native <input type="date">);
// TransFi's create-user API wants DD-MM-YYYY.
function toTransfiDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!SERVICE_ROLE_KEY || !TRANSFI_API_KEY || !TRANSFI_API_SECRET || !TRANSFI_MID) {
    console.error('Missing one of SUPABASE_SERVICE_ROLE_KEY / TRANSFI_API_KEY / TRANSFI_API_SECRET / TRANSFI_MID');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const authedUser = await getAuthedUser(accessToken);
  if (!authedUser) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const {
    amount,
    fiatTicker = 'IDR',
    cryptoTicker = 'USDC',
    walletAddress,
    personalDetails,
  } = req.body || {};

  if (!amount || Number(amount) <= 0) {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }
  if (!walletAddress) {
    res.status(400).json({ error: 'Missing walletAddress' });
    return;
  }

  try {
    const profile = await getProfile(authedUser.id, accessToken);
    let transfiUserId = profile?.transfi_user_id || null;

    // Step 1: create a TransFi user if this Netlink account doesn't have
    // one yet. Requires basic KYC-level-0 info from the client.
    if (!transfiUserId) {
      if (!personalDetails) {
        res.status(400).json({ error: 'NEEDS_PERSONAL_DETAILS', message: 'First-time setup: personal details required.' });
        return;
      }
      const { firstName, lastName, phone, phoneCode, country, dob, address } = personalDetails;
      if (!firstName || !lastName || !phone || !phoneCode || !country || !dob || !address?.street || !address?.city || !address?.state || !address?.postalCode) {
        res.status(400).json({ error: 'Incomplete personal details' });
        return;
      }
      const userResp = await transfiRequest('/v3/users/individual', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          email: authedUser.email,
          phone,
          phoneCode,
          country,
          date: toTransfiDate(dob),
          address,
        }),
      });
      transfiUserId = userResp.data.userId;
      await saveTransfiUserId(authedUser.id, transfiUserId);
    }

    // Step 2: look up the real paymentCode for this fiat currency instead
    // of guessing -- payment methods and their codes can change per MID.
    const methodsResp = await transfiRequest(
      `/v3/config/payment-methods?direction=deposit&limit=20&page=1&userType=individual&headlessMode=true&currency=${encodeURIComponent(fiatTicker)}`
    );
    const methods = methodsResp.data || [];
    const chosenMethod =
      methods.find((m) => m.paymentCode?.toLowerCase().includes('qris') || m.name?.toLowerCase().includes('qris')) ||
      methods[0];
    if (!chosenMethod) {
      res.status(400).json({ error: `No payment methods available for ${fiatTicker}` });
      return;
    }
    if (chosenMethod.minAmount && Number(amount) < chosenMethod.minAmount) {
      res.status(400).json({ error: `Minimum amount is ${chosenMethod.minAmount} ${fiatTicker}` });
      return;
    }
    if (chosenMethod.maxAmount && Number(amount) > chosenMethod.maxAmount) {
      res.status(400).json({ error: `Maximum amount is ${chosenMethod.maxAmount} ${fiatTicker}` });
      return;
    }

    // Step 3: create the order.
    const orderResp = await transfiRequest('/v3/orders', {
      method: 'POST',
      body: JSON.stringify({
        userId: transfiUserId,
        orderType: 'payin',
        purposeCode: 'investment',
        successRedirectUrl: `${SITE_URL}/pay2.html?tx=complete`,
        failureRedirectUrl: `${SITE_URL}/pay2.html?tx=failed`,
        customerMetaData: {
          customerId: authedUser.id,
          customerEmail: authedUser.email,
        },
        source: {
          currency: fiatTicker,
          amount: String(amount),
          paymentType: chosenMethod.paymentType,
          paymentCode: chosenMethod.paymentCode,
        },
        destination: {
          currency: cryptoTicker,
        },
      }),
    });

    const orderId = orderResp.data.orderId;
    await insertFiatOrder({
      order_id: orderId,
      user_id: authedUser.id,
      provider: 'transfi',
      order_type: 'payin',
      status: 'initiated',
      fiat_ticker: fiatTicker,
      fiat_amount: Number(amount),
      crypto_ticker: cryptoTicker,
      wallet_address: walletAddress,
      raw_payload: orderResp.data,
    });

    res.status(200).json({ payUrl: orderResp.data.payUrl, orderId });
  } catch (err) {
    console.error('transfi-create-order failed:', err);
    if (err.code === 'RESTRICTED_ACCESS') {
      res.status(403).json({ error: 'RESTRICTED_ACCESS', message: err.message });
      return;
    }
    res.status(502).json({ error: err.message || 'Failed to create TransFi order' });
  }
}
