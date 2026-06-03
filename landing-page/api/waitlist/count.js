const PUBLIC_SLOTS = 300;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: 'DB not configured' });
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SCARD', 'bettazoo:waitlist']),
    });

    const data = await r.json();
    const signups = typeof data.result === 'number' ? data.result : 0;
    const publicRemaining = Math.max(0, PUBLIC_SLOTS - signups);

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json({ signups, publicRemaining });
  } catch (err) {
    console.error('[waitlist/count]', err);
    return res.status(500).json({ error: 'Failed to fetch count' });
  }
};
