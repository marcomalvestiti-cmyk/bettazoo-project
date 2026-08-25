const ODDS_PRECISION = 10000n;

// maxBettorStake = remainingLiability * ODDS_PRECISION / (odds - ODDS_PRECISION)
function computeMaxBettorStake(remainingLiability, odds) {
  const rem = BigInt(remainingLiability);
  const o   = BigInt(odds);
  if (o <= ODDS_PRECISION) return '0.000000';
  const maxStakeRaw = rem * ODDS_PRECISION / (o - ODDS_PRECISION);
  return (Number(maxStakeRaw) / 1_000_000).toFixed(6);
}

module.exports = { ODDS_PRECISION, computeMaxBettorStake };
