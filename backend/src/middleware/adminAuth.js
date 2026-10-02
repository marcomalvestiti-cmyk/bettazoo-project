// Minimal shared-secret gate for admin-only mutation routes (/api/admin/*, and the
// one write route in oracle.js that isn't already behind an on-chain access check).
// Not real auth — no sessions, no per-admin identity — just enough that the link
// alone isn't enough to approve/reject KYC or rewrite an event's resolution in the
// DB. If ADMIN_SECRET isn't set, every request passes through unchanged (same
// "optional until configured" posture as ODDS_API_KEY/PROTOCOL_TREASURY_ADDRESS) —
// set it before sharing an admin page link beyond trusted testers.
//
// Both sides are normalized (trim + one pair of wrapping quotes) because the value
// is copy-pasted by hand into the Railway dashboard and into the admin prompt, and
// an invisible trailing space/newline would otherwise lock the admin out.
function normalize(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const unquoted = trimmed.match(/^(['"])(.*)\1$/);
  return (unquoted ? unquoted[2] : trimmed).trim();
}

function requireAdminSecret(req, res, next) {
  const expected = normalize(process.env.ADMIN_SECRET);
  if (!expected) return next(); // not configured — admin routes stay open, as before

  const provided = normalize(req.header('x-admin-secret'));
  if (provided !== expected) {
    return res.status(401).json({ error: 'Missing or invalid admin secret' });
  }
  next();
}

module.exports = { requireAdminSecret };
