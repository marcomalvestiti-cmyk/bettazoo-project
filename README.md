# Bettazoo

**Peer-to-peer sports betting exchange on Arbitrum — no bookmaker, no native token, stablecoin only.**

Bettazoo lets anyone act as the bank. *Placers* lock collateral on-chain and publish odds; *bettors* see every offer in a public order book and take the best prices, matched across many offers in a single transaction. Funds sit in an escrow contract, never with the platform, and winners are paid automatically in the same transaction that settles the event.

On top of the exchange, Bettazoo adds infrastructure for **autonomous banks and creators**: non-custodial on-chain vaults run by a keeper that quotes markets automatically, an ERC-4626 fund vault that lets third-party LPs back a placer, and a streaming/OBS overlay toolkit for creators who run a book live.

> **Status: public testnet on Arbitrum Sepolia.** All balances are MockUSDT with no real value. Contracts have not been externally audited yet.

| | |
|---|---|
| **App** | https://bettazoo-project.vercel.app |
| **Website** | https://bettazoo.com |
| **Network** | Arbitrum Sepolia (chain id `421614`) |

---

## How it works

```
 Placer / Vault                        Bettor
      │ createOffer(event, outcome,        │ acceptOffers([ids], stake)
      │   odds, liability)                 │   multi-match across offers
      ▼                                    ▼
 ┌──────────────────────────────────────────────┐
 │            BettazooEscrow (Arbitrum)          │
 │  collateral locked · matched · settled        │
 └──────────────────────────────────────────────┘
      ▲ resolveEvent(event, winner)        │ payout + platform fee
      │                                    ▼ in the same tx
   Oracle                            Winners / Treasury
```

1. **Offer.** A placer (a wallet, or a vault operated by the keeper) locks liability in the escrow at chosen decimal odds.
2. **Match.** A bettor's stake is filled greedily across the best available offers in one signature; partial fills are supported.
3. **Settle.** The oracle resolves the event; the escrow pays winners directly and sends the platform fee to the treasury. No claim step, no custody by the platform.

## Features

**Exchange**
- On-chain escrow with multi-offer matching and partial fills
- Public order book per event and outcome, synced from chain events
- Real football fixtures and reference odds (The Odds API) with a curated multi-sport fallback catalog
- Bettor dashboard rebuilt from on-chain matches, consistent across devices

**Placer Vaults (autonomous banks)**
- `PlacerVault`: one EIP-1167 clone per owner. Only the owner can withdraw, and `withdraw` takes no recipient argument, so the keeper can never move funds out
- Keeper service that re-quotes markets every tick within owner-defined limits: market scope, exposure caps, per-market caps, stop-loss, odds range, on-chain max size per bet
- Pricing engine that shades live market odds by the vault's chosen margin
- On-chain kill switch (`pause`) and per-vault platform fee override

**Fund Vaults (third-party capital)**
- `PlacerFundVault`: ERC-4626 vault where approved LPs deposit alongside a placer
- On-chain LP allowlist for deposits; withdrawals and redemptions are never gated
- Performance fee with a vault-level high-water mark, split between placer and platform
- NAV reported by the keeper but capped by locked liability, so it can be delayed but never inflated

**Compliance & creator tooling**
- EIP-712 signed participation agreements (manager and LP) and a KYC gate on keeper activation
- Creator streaming page with live chat and the creator's own book
- Transparent OBS browser-source overlay with live liquidity, offers and a QR code to bet
- Interface in English, Italian, Spanish and French

## Architecture

| Layer | Path | Stack |
|---|---|---|
| Smart contracts | [`web3/`](web3) | Solidity 0.8.24, Hardhat, OpenZeppelin v5 (incl. upgradeable ERC-4626), EVM `cancun` |
| Backend | [`backend/`](backend) | Node.js, Express, MongoDB/Mongoose, ethers v6, Socket.io |
| Frontend | [`frontend/`](frontend) | Next.js 16 (App Router), React 19, Tailwind v4, wagmi + viem, next-intl |

The backend indexes contract events into MongoDB (order book, matches, vault state), runs the keeper and the odds feed, and pushes realtime updates over Socket.io. The chain is always the source of truth: balances, pause state and caps are read on-chain by the frontend.

### Contracts

| Contract | Purpose |
|---|---|
| [`BettazooEscrow.sol`](web3/contracts/BettazooEscrow.sol) | Offers, multi-matching, settlement, platform fee with per-placer override |
| [`PlacerVault.sol`](web3/contracts/PlacerVault.sol) / [`PlacerVaultFactory.sol`](web3/contracts/PlacerVaultFactory.sol) | Single-owner, keeper-operated, non-custodial vaults |
| [`PlacerFundVault.sol`](web3/contracts/PlacerFundVault.sol) / [`PlacerFundVaultFactory.sol`](web3/contracts/PlacerFundVaultFactory.sol) | ERC-4626 vaults for third-party LP capital |
| [`MockUSDT.sol`](web3/contracts/MockUSDT.sol) | 6-decimal test stablecoin |

### Deployments (Arbitrum Sepolia)

| Contract | Address |
|---|---|
| BettazooEscrow | [`0xD01D7Af6eB42968DdE249cD56ab382F2eF7fF04D`](https://sepolia.arbiscan.io/address/0xD01D7Af6eB42968DdE249cD56ab382F2eF7fF04D) |
| PlacerVaultFactory | [`0xEB8FD349f3C6377a367151cD9624a5802949623e`](https://sepolia.arbiscan.io/address/0xEB8FD349f3C6377a367151cD9624a5802949623e) |
| PlacerFundVaultFactory | [`0x62a26E2A3FbeFE8714e9492ce084dA6e79632d65`](https://sepolia.arbiscan.io/address/0x62a26E2A3FbeFE8714e9492ce084dA6e79632d65) |
| MockUSDT | [`0x29fA91A7288A2b3De899F4ed1679e288018f69a0`](https://sepolia.arbiscan.io/address/0x29fA91A7288A2b3De899F4ed1679e288018f69a0) |

Full deployment records are in [`web3/deployments/`](web3/deployments).

## Running locally

Requirements: Node.js 20+ and a MongoDB instance (local or Atlas).

```bash
# 1. Contracts — compile and test
cd web3
npm install
npx hardhat test

# 2. Backend — copy backend/.env.example to backend/.env and fill it in
cd ../backend
npm install
npm test
npm run dev

# 3. Frontend — set NEXT_PUBLIC_API_URL and contract addresses in frontend/.env.local
cd ../frontend
npm install
npm run dev
```

All supported environment variables are documented in [`backend/.env.example`](backend/.env.example) and [`web3/.env.example`](web3/.env.example). Optional integrations (odds feed, Sentry, admin gate) stay disabled when their variables are unset.

## Tests

- **Contracts:** 109 Hardhat tests covering escrow matching and settlement, vault access control, ERC-4626 accounting, performance fees and an end-to-end escrow → fund vault settlement
- **Backend:** 86 Jest tests (with an in-memory MongoDB) covering order book, indexers, keeper pricing, signed vault config, agreements/KYC gate and admin auth

## Roadmap

- [x] P2P escrow with multi-matching and automatic payout
- [x] Keeper-operated placer vaults with on-chain risk limits
- [x] Real odds feed and pricing engine
- [x] Signed agreements, KYC gate, creator overlay
- [x] Per-vault fees and ERC-4626 fund vaults for third-party LPs
- [ ] Decentralized result resolution (today the oracle is a single admin key)
- [ ] External security audit
- [ ] Fiat on-ramp and embedded wallets for a wallet-free bettor experience
- [ ] Arbitrum One mainnet launch (subject to licensing)
