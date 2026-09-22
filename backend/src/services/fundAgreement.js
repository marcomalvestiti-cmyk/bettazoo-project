const { ethers } = require('ethers');

// Fund Participation Agreement — EIP-712 typed-data signature for third-party LPs
// depositing into a PlacerFundVault. Deliberately a SEPARATE domain/type from
// services/agreement.js's "Liquidity Provision Agreement": that one is the fund
// MANAGER bringing/managing liquidity into the Escrow (their own capital, or a fund
// they run); this one is the LP's own, legally-distinct consent to participate in
// someone else's fund. Not legally binding yet (no licensed OpCo exists on testnet) —
// same caveat as agreement.js, proving out the mechanism ahead of a real fund-raise.
//
// Domain/types/version here MUST stay byte-identical to frontend/src/lib/fundAgreement.ts
// (different runtimes, no shared import — same reasoning as agreement.js/legal.ts).
const FUND_AGREEMENT_VERSION = 1;

const FUND_AGREEMENT_DOMAIN = {
  name: 'Bettazoo Fund Participation',
  version: '1',
  chainId: 421614, // Arbitrum Sepolia — testnet only
};

const FUND_AGREEMENT_TYPES = {
  FundParticipationAgreement: [
    { name: 'fundVault', type: 'address' },
    { name: 'lp', type: 'address' },
    { name: 'version', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

function verifyFundAgreementSignature(fundVaultAddress, lpAddress, signature, timestamp) {
  if (typeof signature !== 'string' || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > SIGNATURE_MAX_AGE_MS) return false;
  try {
    const value = { fundVault: fundVaultAddress, lp: lpAddress, version: FUND_AGREEMENT_VERSION, timestamp };
    const recovered = ethers.verifyTypedData(FUND_AGREEMENT_DOMAIN, FUND_AGREEMENT_TYPES, value, signature);
    return recovered.toLowerCase() === lpAddress;
  } catch {
    return false;
  }
}

module.exports = {
  FUND_AGREEMENT_VERSION,
  FUND_AGREEMENT_DOMAIN,
  FUND_AGREEMENT_TYPES,
  verifyFundAgreementSignature,
};
