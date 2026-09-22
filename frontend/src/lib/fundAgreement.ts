// Fund Participation Agreement — EIP-712 typed-data signature for third-party LPs
// depositing into a PlacerFundVault. Deliberately separate from lib/legal.ts's
// "Liquidity Provision Agreement" (that one is the fund MANAGER's own consent to bring
// liquidity into the Escrow; this is the LP's own, legally-distinct consent to
// participate in someone else's fund). Domain/types/version MUST stay byte-identical
// to backend/src/services/fundAgreement.js (different runtimes, no shared import).
export const FUND_AGREEMENT_VERSION = 1

export const FUND_AGREEMENT_DOMAIN = {
  name: 'Bettazoo Fund Participation',
  version: '1',
  chainId: 421614, // Arbitrum Sepolia — testnet only
} as const

export const FUND_AGREEMENT_TYPES = {
  FundParticipationAgreement: [
    { name: 'fundVault', type: 'address' },
    { name: 'lp', type: 'address' },
    { name: 'version', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const

export function buildFundAgreementValue(fundVaultAddress: string, lpAddress: string, timestamp: number) {
  return {
    fundVault: fundVaultAddress.toLowerCase() as `0x${string}`,
    lp: lpAddress.toLowerCase() as `0x${string}`,
    version: BigInt(FUND_AGREEMENT_VERSION),
    timestamp: BigInt(timestamp),
  }
}

export const FUND_AGREEMENT_TEXT = `Bettazoo Fund Participation Agreement — Testnet Draft v${FUND_AGREEMENT_VERSION}

By signing, you acknowledge that USDT deposited into this Fund Vault is intended as
capital delegated to the fund manager, who will use it to place bets on your behalf in
exchange for a performance fee on any profit (shared between the manager and the
Bettazoo platform). You remain the owner of your position at all times — the vault's
withdraw/redeem functions always pay you directly, never the manager or anyone else —
but your capital may be temporarily illiquid while locked as collateral in open offers.

This signature is recorded for review purposes only. It is NOT a binding legal
agreement while Bettazoo runs on testnet with no licensed entity yet in place. A
fresh, binding signature will be required at mainnet launch under final terms.`
