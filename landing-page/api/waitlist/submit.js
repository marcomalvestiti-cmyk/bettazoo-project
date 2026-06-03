const PUBLIC_SLOTS = 300;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: 'DB not configured' });
  }

  const body = req.body || {};
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  let email;
  try {
    email = (typeof body === 'object' ? body : JSON.parse(raw)).email;
  } catch (_) {}

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const normalized = email.trim().toLowerCase();

  try {
    // Check capacity before adding
    const countRes = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SCARD', 'bettazoo:waitlist']),
    });
    const countData = await countRes.json();
    const currentCount = typeof countData.result === 'number' ? countData.result : 0;

    if (currentCount >= PUBLIC_SLOTS) {
      return res.status(409).json({ error: 'No spots remaining', publicRemaining: 0 });
    }

    // SADD returns 1 if new member, 0 if already exists
    const addRes = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SADD', 'bettazoo:waitlist', normalized]),
    });
    const addData = await addRes.json();

    // Get updated count regardless (needed for the response)
    const newCountRes = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SCARD', 'bettazoo:waitlist']),
    });
    const newCountData = await newCountRes.json();
    const signups = typeof newCountData.result === 'number' ? newCountData.result : currentCount;
    const publicRemaining = Math.max(0, PUBLIC_SLOTS - signups);

    return res.status(200).json({ success: true, isNew: addData.result === 1, signups, publicRemaining });
  } catch (err) {
    console.error('[waitlist/submit]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
