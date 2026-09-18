// Minimal shared-secret gate for admin-only mutation routes (/api/admin/*, and the
// one write route in oracle.js that isn't already behind an on-chain access check).
// Not real auth — no sessions, no per-admin identity — just enough that the link
// alone isn't enough to approve/reject KYC or rewrite an event's resolution in the
// DB. If ADMIN_SECRET isn't set, every request passes through unchanged (same
// "optional until configured" posture as ODDS_API_KEY/PROTOCOL_TREASURY_ADDRESS) —
// set it before sharing an admin page link beyond trusted testers.
function requireAdminSecret(req, res, next) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return next(); // not configured — admin routes stay open, as before

  const provided = req.header('x-admin-secret');
  if (provided !== expected) {
    return res.status(401).json({ error: 'Missing or invalid admin secret' });
  }
  next();
}

module.exports = { requireAdminSecret };
