const { ethers } = require('ethers')
const Vault = require('../models/Vault')
const FundVault = require('../models/FundVault')
const Order = require('../models/Order')
const BetMatch = require('../models/BetMatch')
const Event = require('../models/Event')
const { suggestOdds } = require('./aiService')

const VAULT_ABI = [
  'function placeOffer(string eventId, uint8 outcome, uint256 odds, uint256 liability) returns (uint256 offerId)',
  'function cancelOffer(uint256 offerId)',
  'function balance() view returns (uint256)',
]

// Fund vaults keep the exact same placeOffer/cancelOffer/balance() signatures as the
// single-owner PlacerVault (see contracts/PlacerFundVault.sol) — VAULT_ABI works
// unchanged for those calls. reportSettlement is the one addition, used only by
// reconcileFundVaultSettlements below.
const FUND_VAULT_ABI = [
  ...VAULT_ABI,
  'function reportSettlement(uint256 offerId, uint256 resolvedAmount)',
]

const OUTCOME_KEYS = ['home', 'draw', 'away']
const MARGIN_BY_STRATEGY = { volume: 0.015, balanced: 0.03, safe: 0.05 }

// How far a live offer's odds can drift from the freshly computed target before the
// keeper bothers requoting — without this, every tick would cancel+recreate every offer
// even when nothing meaningfully changed, burning gas for no reason.
const REQUOTE_TOLERANCE = 0.02 // 2%

function ts() { return new Date().toISOString() }
function usdtToRaw(n) { return BigInt(Math.round(n * 1_000_000)) }
function rawToUsdt(raw) { return Number(raw) / 1_000_000 }

function marginForVault(vault) {
  if (vault.strategy?.marginStrategyId === 'custom' && typeof vault.strategy.customMargin === 'number') {
    return vault.strategy.customMargin
  }
  return MARGIN_BY_STRATEGY[vault.strategy?.marginStrategyId] ?? MARGIN_BY_STRATEGY.balanced
}

// Sums a vault's current on-chain-mirrored exposure (remainingLiability of active
// orders), both globally and per eventId:outcome — used to enforce the vault's own
// maxExposureUsdt / perMarketExposureUsdt soft caps before quoting more.
async function computeExposure(vaultAddress) {
  const orders = await Order.find({ placer: vaultAddress, active: true }).lean()
  let totalUsdt = 0
  const byMarket = {}
  for (const o of orders) {
    const usdt = rawToUsdt(BigInt(o.remainingLiability))
    totalUsdt += usdt
    const key = `${o.eventId}:${o.outcome}`
    byMarket[key] = (byMarket[key] ?? 0) + usdt
  }
  return { totalUsdt, byMarket }
}

// Realized P&L approximation for stop-loss: money won on settled matches where the
// vault was the placer and the bettor lost, minus liability paid out on matches the
// bettor won. Ignores the platform fee split — a soft off-chain guard, not fund-moving
// logic, so exact-to-the-cent accuracy isn't required.
async function computeRealizedPnl(vaultAddress) {
  const matches = await BetMatch.find({ placer: vaultAddress, settled: true }).lean()
  let pnl = 0
  for (const m of matches) {
    const bettorWon = m.settledOutcome === m.outcome
    pnl += bettorWon
      ? -rawToUsdt(BigInt(m.placerLiability))
      : rawToUsdt(BigInt(m.bettorStake))
  }
  return pnl
}

/**
 * Evaluates and (if needed) acts on a single vault: requote drifted/missing offers
 * within scope, respecting exposure caps, stop-loss, and the on-chain pause flag.
 * Every decision is logged — this observability is itself a deliverable, not
 * incidental: the point of the testnet phase is to see *why* the keeper acted, not
 * just that an offer appeared on-chain.
 */
async function tickVault(vault, keeperWallet) {
  const log = (msg) => console.log(`[${ts()}] [Keeper] vault=${vault.vaultAddress} ${msg}`)

  if (vault.onChainPaused) {
    log('skip — paused on-chain')
    return
  }

  // Same protocol-vault exemption as the PATCH gate in routes/vaults.js — the
  // treasury's own "Final Boss" vault isn't a third-party Placer, the KYC gate was
  // built to onboard those.
  const treasuryAddress = (process.env.PROTOCOL_TREASURY_ADDRESS || '').toLowerCase()
  const isProtocolVault = !!treasuryAddress && vault.ownerAddress === treasuryAddress

  // Defense in depth: PATCH /config already refuses to set status='active' without
  // an approved KYC review, but if an admin revokes approval afterwards (kycStatus
  // flips to 'rejected'/'pending') the vault's status field stays 'active' in Mongo —
  // this stops the keeper from quoting on it regardless.
  if (!isProtocolVault && vault.kycStatus !== 'approved') {
    log(`skip — KYC status is '${vault.kycStatus ?? 'none'}', not 'approved'`)
    return
  }

  const realizedPnl = await computeRealizedPnl(vault.vaultAddress)
  if (vault.stopLossUsdt > 0 && realizedPnl <= -vault.stopLossUsdt) {
    if (vault.status !== 'stopped') {
      await Vault.findOneAndUpdate({ vaultAddress: vault.vaultAddress }, { status: 'stopped' })
      log(`STOP-LOSS triggered — realized P&L ${realizedPnl.toFixed(2)} USDT <= -${vault.stopLossUsdt}. Vault set to 'stopped'.`)
    }
    return
  }

  const vaultContract = new ethers.Contract(vault.vaultAddress, VAULT_ABI, keeperWallet)
  let balanceRaw
  try {
    balanceRaw = await vaultContract.balance()
  } catch (err) {
    log(`skip — could not read balance: ${err.message}`)
    return
  }
  const balanceUsdt = rawToUsdt(balanceRaw)
  if (balanceUsdt <= 0) {
    log('skip — zero balance, nothing to quote with')
    return
  }

  const exposure = await computeExposure(vault.vaultAddress)
  const margin = marginForVault(vault)

  for (const { eventId, outcomes } of vault.scope || []) {
    // Fetched once per event, not per outcome — referenceOdds (Tier 0's live feed,
    // see services/eventsFeedService.js) is what turns this from a fixed-margin mock
    // into a real pricing engine: suggestOdds shrinks *actual* market consensus by
    // the vault's margin instead of a hardcoded {home:2.0, draw:3.4, away:3.8}
    // default. Curated (non-football) events simply have no referenceOdds — same
    // fallback behavior as before, no regression there.
    const eventDoc = await Event.findOne({ eventId }).lean()

    for (const outcome of outcomes) {
      const marketKey = `${eventId}:${outcome}`
      const marketExposure = exposure.byMarket[marketKey] ?? 0

      if (vault.maxExposureUsdt > 0 && exposure.totalUsdt >= vault.maxExposureUsdt) {
        log(`skip ${marketKey} — global exposure cap reached (${exposure.totalUsdt.toFixed(2)}/${vault.maxExposureUsdt} USDT)`)
        continue
      }
      if (vault.perMarketExposureUsdt > 0 && marketExposure >= vault.perMarketExposureUsdt) {
        log(`skip ${marketKey} — per-market exposure cap reached (${marketExposure.toFixed(2)}/${vault.perMarketExposureUsdt} USDT)`)
        continue
      }

      let priced
      try {
        priced = await suggestOdds({
          eventId, outcome, margin,
          eventName: eventDoc?.name,
          sport: eventDoc?.sport,
          teams: eventDoc?.teams,
          currentMarketOdds: eventDoc?.referenceOdds,
        })
      } catch (err) {
        log(`skip ${marketKey} — pricing failed: ${err.message}`)
        continue
      }
      const key = OUTCOME_KEYS[outcome]
      let targetOdds = priced.suggestedOdds?.[key]
      if (typeof targetOdds !== 'number' || !(targetOdds > 1)) {
        log(`skip ${marketKey} — no valid price returned`)
        continue
      }
      targetOdds = Math.min(Math.max(targetOdds, vault.minOdds), vault.maxOdds)
      const priceSource = eventDoc?.referenceOdds ? 'live market feed' : 'default reference odds'

      const existing = await Order.findOne({ placer: vault.vaultAddress, eventId, outcome, active: true }).lean()

      if (existing) {
        const drift = Math.abs(existing.oddsDecimal - targetOdds) / existing.oddsDecimal
        if (drift < REQUOTE_TOLERANCE) {
          log(`hold ${marketKey} — offerId=${existing.offerId} odds=${existing.oddsDecimal} within tolerance of target=${targetOdds.toFixed(2)}`)
          continue
        }
        try {
          const tx = await vaultContract.cancelOffer(existing.offerId)
          await tx.wait()
          log(`requoting ${marketKey} — cancelled offerId=${existing.offerId} (odds ${existing.oddsDecimal} -> target ${targetOdds.toFixed(2)})`)
        } catch (err) {
          log(`skip ${marketKey} — cancel of offerId=${existing.offerId} failed: ${err.message}`)
          continue
        }
      }

      const liabilityUsdt = Math.min(vault.liabilityIncrementUsdt, balanceUsdt)
      if (liabilityUsdt <= 0) {
        log(`skip ${marketKey} — no balance left this tick`)
        continue
      }

      const oddsRaw = BigInt(Math.round(targetOdds * 10000))
      const liabilityRaw = usdtToRaw(liabilityUsdt)
      try {
        const tx = await vaultContract.placeOffer(eventId, outcome, oddsRaw, liabilityRaw)
        const receipt = await tx.wait()
        log(`quoted ${marketKey} — odds=${targetOdds.toFixed(2)} liability=${liabilityUsdt} USDT priced-from=${priceSource} tx=${receipt.hash}`)
      } catch (err) {
        log(`skip ${marketKey} — placeOffer failed: ${err.message}`)
      }
    }
  }
}

/**
 * Reports newly-settled liability for a fund vault's own offers so its on-chain NAV
 * (balance + lockedLiability) stops overstating locked capital once a bet has actually
 * resolved. Idempotent per offer: only ever reports the delta between what's been
 * matched-and-settled so far (BetMatch, already indexed by web3Listener) and what was
 * already reported (Order.reportedSettlementLiability) — see contracts/PlacerFundVault.sol
 * for why this can't be derived trustlessly on-chain instead.
 */
async function reconcileFundVaultSettlements(fundVault, keeperWallet) {
  const log = (msg) => console.log(`[${ts()}] [Keeper] fundVault=${fundVault.fundVaultAddress} ${msg}`)

  const orders = await Order.find({ placer: fundVault.fundVaultAddress }).lean()
  if (orders.length === 0) return

  const fundVaultContract = new ethers.Contract(fundVault.fundVaultAddress, FUND_VAULT_ABI, keeperWallet)

  for (const order of orders) {
    const settledMatches = await BetMatch.find({
      offerId: order.offerId, placer: fundVault.fundVaultAddress, settled: true,
    }).lean()
    if (settledMatches.length === 0) continue

    const totalSettledRaw = settledMatches.reduce((sum, m) => sum + BigInt(m.placerLiability), 0n)
    const alreadyReportedRaw = BigInt(order.reportedSettlementLiability ?? '0')
    const newlySettledRaw = totalSettledRaw - alreadyReportedRaw
    if (newlySettledRaw <= 0n) continue

    try {
      const tx = await fundVaultContract.reportSettlement(order.offerId, newlySettledRaw)
      await tx.wait()
      await Order.updateOne(
        { offerId: order.offerId, placer: fundVault.fundVaultAddress },
        { reportedSettlementLiability: totalSettledRaw.toString() }
      )
      log(`reportSettlement offerId=${order.offerId} amount=${rawToUsdt(newlySettledRaw)} USDT tx=${tx.hash}`)
    } catch (err) {
      log(`reportSettlement offerId=${order.offerId} failed: ${err.message}`)
    }
  }
}

/**
 * Same requoting logic as tickVault, against a FundVault instead — the two models
 * share every field the pricing/exposure/stop-loss logic reads (see models/FundVault.js),
 * only the Mongo collection and the extra settlement-reconciliation step differ.
 */
async function tickFundVault(fundVault, keeperWallet) {
  const log = (msg) => console.log(`[${ts()}] [Keeper] fundVault=${fundVault.fundVaultAddress} ${msg}`)

  if (fundVault.onChainPaused) {
    log('skip — paused on-chain')
    return
  }
  if (fundVault.kycStatus !== 'approved') {
    log(`skip — KYC status is '${fundVault.kycStatus ?? 'none'}', not 'approved'`)
    return
  }

  await reconcileFundVaultSettlements(fundVault, keeperWallet)

  const realizedPnl = await computeRealizedPnl(fundVault.fundVaultAddress)
  if (fundVault.stopLossUsdt > 0 && realizedPnl <= -fundVault.stopLossUsdt) {
    if (fundVault.status !== 'stopped') {
      await FundVault.findOneAndUpdate({ fundVaultAddress: fundVault.fundVaultAddress }, { status: 'stopped' })
      log(`STOP-LOSS triggered — realized P&L ${realizedPnl.toFixed(2)} USDT <= -${fundVault.stopLossUsdt}. Vault set to 'stopped'.`)
    }
    return
  }

  const vaultContract = new ethers.Contract(fundVault.fundVaultAddress, FUND_VAULT_ABI, keeperWallet)
  let balanceRaw
  try {
    balanceRaw = await vaultContract.balance()
  } catch (err) {
    log(`skip — could not read balance: ${err.message}`)
    return
  }
  const balanceUsdt = rawToUsdt(balanceRaw)
  if (balanceUsdt <= 0) {
    log('skip — zero liquid balance, nothing to quote with')
    return
  }

  const exposure = await computeExposure(fundVault.fundVaultAddress)
  const margin = marginForVault(fundVault)

  for (const { eventId, outcomes } of fundVault.scope || []) {
    const eventDoc = await Event.findOne({ eventId }).lean()

    for (const outcome of outcomes) {
      const marketKey = `${eventId}:${outcome}`
      const marketExposure = exposure.byMarket[marketKey] ?? 0

      if (fundVault.maxExposureUsdt > 0 && exposure.totalUsdt >= fundVault.maxExposureUsdt) {
        log(`skip ${marketKey} — global exposure cap reached (${exposure.totalUsdt.toFixed(2)}/${fundVault.maxExposureUsdt} USDT)`)
        continue
      }
      if (fundVault.perMarketExposureUsdt > 0 && marketExposure >= fundVault.perMarketExposureUsdt) {
        log(`skip ${marketKey} — per-market exposure cap reached (${marketExposure.toFixed(2)}/${fundVault.perMarketExposureUsdt} USDT)`)
        continue
      }

      let priced
      try {
        priced = await suggestOdds({
          eventId, outcome, margin,
          eventName: eventDoc?.name,
          sport: eventDoc?.sport,
          teams: eventDoc?.teams,
          currentMarketOdds: eventDoc?.referenceOdds,
        })
      } catch (err) {
        log(`skip ${marketKey} — pricing failed: ${err.message}`)
        continue
      }
      const key = OUTCOME_KEYS[outcome]
      let targetOdds = priced.suggestedOdds?.[key]
      if (typeof targetOdds !== 'number' || !(targetOdds > 1)) {
        log(`skip ${marketKey} — no valid price returned`)
        continue
      }
      targetOdds = Math.min(Math.max(targetOdds, fundVault.minOdds), fundVault.maxOdds)
      const priceSource = eventDoc?.referenceOdds ? 'live market feed' : 'default reference odds'

      const existing = await Order.findOne({ placer: fundVault.fundVaultAddress, eventId, outcome, active: true }).lean()

      if (existing) {
        const drift = Math.abs(existing.oddsDecimal - targetOdds) / existing.oddsDecimal
        if (drift < REQUOTE_TOLERANCE) {
          log(`hold ${marketKey} — offerId=${existing.offerId} odds=${existing.oddsDecimal} within tolerance of target=${targetOdds.toFixed(2)}`)
          continue
        }
        try {
          const tx = await vaultContract.cancelOffer(existing.offerId)
          await tx.wait()
          log(`requoting ${marketKey} — cancelled offerId=${existing.offerId} (odds ${existing.oddsDecimal} -> target ${targetOdds.toFixed(2)})`)
        } catch (err) {
          log(`skip ${marketKey} — cancel of offerId=${existing.offerId} failed: ${err.message}`)
          continue
        }
      }

      const liabilityUsdt = Math.min(fundVault.liabilityIncrementUsdt, balanceUsdt)
      if (liabilityUsdt <= 0) {
        log(`skip ${marketKey} — no balance left this tick`)
        continue
      }

      const oddsRaw = BigInt(Math.round(targetOdds * 10000))
      const liabilityRaw = usdtToRaw(liabilityUsdt)
      try {
        const tx = await vaultContract.placeOffer(eventId, outcome, oddsRaw, liabilityRaw)
        const receipt = await tx.wait()
        log(`quoted ${marketKey} — odds=${targetOdds.toFixed(2)} liability=${liabilityUsdt} USDT priced-from=${priceSource} tx=${receipt.hash}`)
      } catch (err) {
        log(`skip ${marketKey} — placeOffer failed: ${err.message}`)
      }
    }
  }
}

function startKeeper(provider) {
  const privateKey = process.env.KEEPER_PRIVATE_KEY
  if (!privateKey) {
    console.warn(`[${ts()}] [Keeper] KEEPER_PRIVATE_KEY not set — keeper disabled`)
    return
  }

  const keeperWallet = new ethers.Wallet(privateKey, provider)
  const tickMs = parseInt(process.env.KEEPER_TICK_MS ?? '45000')

  console.log(`[${ts()}] [Keeper] Starting — address=${keeperWallet.address} tickMs=${tickMs}`)

  let ticking = false
  const interval = setInterval(async () => {
    if (ticking) return // previous tick still running (e.g. slow RPC) — don't overlap
    ticking = true
    try {
      const balance = await provider.getBalance(keeperWallet.address)
      if (balance === 0n) {
        console.warn(`[${ts()}] [Keeper] Wallet has zero gas balance — all quoting is stalled until funded`)
      }

      const vaults = await Vault.find({ status: 'active' }).lean()
      for (const vault of vaults) {
        try {
          await tickVault(vault, keeperWallet)
        } catch (err) {
          console.error(`[${ts()}] [Keeper] vault=${vault.vaultAddress} tick error: ${err.message}`)
        }
      }

      const fundVaults = await FundVault.find({ status: 'active' }).lean()
      for (const fundVault of fundVaults) {
        try {
          await tickFundVault(fundVault, keeperWallet)
        } catch (err) {
          console.error(`[${ts()}] [Keeper] fundVault=${fundVault.fundVaultAddress} tick error: ${err.message}`)
        }
      }
    } catch (err) {
      console.error(`[${ts()}] [Keeper] tick error: ${err.message}`)
    } finally {
      ticking = false
    }
  }, tickMs)
  interval.unref() // don't block graceful shutdown

  return interval
}

module.exports = { startKeeper, tickVault, tickFundVault, reconcileFundVaultSettlements }
