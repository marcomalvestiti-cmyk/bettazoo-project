const { ethers } = require('ethers');

// Liquidity Provision Agreement — EIP-712 typed-data signature. This is a consent
// record, not a binding contract: no licensed OpCo exists yet, so there is nothing
// for this signature to bind the signer to on testnet. What it does prove out is the
// *mechanism* — domain/types/version here MUST stay byte-identical to
// frontend/src/lib/legal.ts (different runtimes, no shared import, same reasoning as
// buildSignMessage/buildVaultConfigMessage for the plain-message vault config PATCH).
//
// AGREEMENT_VERSION bump = old signatures stop satisfying the activation gate below.
// Bump it whenever the terms text in legal.ts changes.
const AGREEMENT_VERSION = 1;

const AGREEMENT_DOMAIN = {
  name: 'Bettazoo',
  version: '1',
  chainId: 421614, // Arbitrum Sepolia — testnet only; revisit at mainnet launch
};

const AGREEMENT_TYPES = {
  LiquidityProvisionAgreement: [
    { name: 'owner', type: 'address' },
    { name: 'version', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes — same window as vault config PATCH

function verifyAgreementSignature(ownerAddress, signature, timestamp) {
  if (typeof signature !== 'string' || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > SIGNATURE_MAX_AGE_MS) return false;
  try {
    const value = { owner: ownerAddress, version: AGREEMENT_VERSION, timestamp };
    const recovered = ethers.verifyTypedData(AGREEMENT_DOMAIN, AGREEMENT_TYPES, value, signature);
    return recovered.toLowerCase() === ownerAddress;
  } catch {
    return false;
  }
}

module.exports = { AGREEMENT_VERSION, AGREEMENT_DOMAIN, AGREEMENT_TYPES, verifyAgreementSignature };
