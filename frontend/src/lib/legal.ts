// Liquidity Provision Agreement — EIP-712 typed-data signature. This is a consent
// record, not a binding contract: no licensed OpCo exists yet on testnet, so there
// is nothing for this signature to bind the signer to. What it proves out is the
// *mechanism* ahead of mainnet — domain/types/version here MUST stay byte-identical
// to backend/src/services/agreement.js (different runtimes, no shared import, same
// reasoning as buildVaultConfigMessage/buildSignMessage for the plain-message PATCH).
//
// AGREEMENT_VERSION bump = every previously-signed vault needs re-signing before it
// can activate again. Bump it whenever AGREEMENT_TEXT changes.
export const AGREEMENT_VERSION = 1

export const AGREEMENT_DOMAIN = {
  name: 'Bettazoo',
  version: '1',
  chainId: 421614, // Arbitrum Sepolia — testnet only; revisit at mainnet launch
} as const

export const AGREEMENT_TYPES = {
  LiquidityProvisionAgreement: [
    { name: 'owner', type: 'address' },
    { name: 'version', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const

export function buildAgreementValue(ownerAddress: string, timestamp: number) {
  return {
    owner: ownerAddress.toLowerCase() as `0x${string}`,
    version: BigInt(AGREEMENT_VERSION),
    timestamp: BigInt(timestamp),
  }
}

export const AGREEMENT_TEXT = `Bettazoo Liquidity Provision Agreement — Testnet Draft v${AGREEMENT_VERSION}

By signing, you acknowledge that USDT deposited into your Vault is intended as
liquidity supplied to a licensed bookmaking entity ("the House") once that entity is
formally constituted, and that profits will be subject to identity verification
(KYC) before withdrawal once Bettazoo operates on mainnet.

This signature is recorded for review purposes only. It is NOT a binding legal
agreement while Bettazoo runs on testnet with no licensed entity yet in place. A
fresh, binding signature will be required at mainnet launch under final terms.`
