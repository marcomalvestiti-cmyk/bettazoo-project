const express = require('express')
const router = express.Router()
const { getGasFaucet } = require('../services/gasFaucet')

// Client IP behind the Railway proxy: first hop of X-Forwarded-For.
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress
}

// Tests inject a fake faucet with app.set('gasFaucet', ...).
function faucetFor(req) {
  return req.app.get('gasFaucet') ?? getGasFaucet()
}

// GET /api/faucet/gas/:address: can this wallet receive testnet ETH right now?
router.get('/gas/:address', async (req, res, next) => {
  try {
    const faucet = faucetFor(req)
    if (!faucet) return res.json({ eligible: false, reason: 'disabled' })
    res.json(await faucet.status(req.params.address, clientIp(req)))
  } catch (err) { next(err) }
})

// POST /api/faucet/gas { address }: send one drip of testnet ETH.
router.post('/gas', async (req, res, next) => {
  try {
    const faucet = faucetFor(req)
    if (!faucet) return res.status(503).json({ eligible: false, reason: 'disabled' })
    const result = await faucet.claim(String(req.body?.address ?? ''), clientIp(req))
    if (result.claimed) return res.json(result)
    const code = result.reason === 'invalid_address' ? 400
      : (result.reason === 'send_failed' || result.reason === 'faucet_empty') ? 503
      : 429
    res.status(code).json(result)
  } catch (err) { next(err) }
})

module.exports = router
