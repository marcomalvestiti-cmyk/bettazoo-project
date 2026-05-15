import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, Zap, Percent, RotateCcw, Scale, AlertTriangle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Rules — Bettazoo',
  description: 'Platform rules, Smart Contract mechanics, and fee structure for Bettazoo P2P betting.',
}

const RULES = [
  {
    Icon: ShieldCheck,
    title: 'Non-Custodial & Secure',
    tag: 'Security',
    body: 'Funds are locked in a verified Smart Contract Escrow. We never hold your money — not for a single block. Only the smart contract controls fund movement, enforced entirely by on-chain code that anyone can audit.',
  },
  {
    Icon: Zap,
    title: 'Automated Settlement',
    tag: 'Payouts',
    body: 'Match results are delivered via certified Data Oracles (e.g., Betradar). As soon as the final result is confirmed on-chain, USDT payouts are distributed instantly to winners — no manual intervention, no delays.',
  },
  {
    Icon: Percent,
    title: 'Transparent Fees',
    tag: 'Fees',
    body: 'A flat 2% rake is applied only on the net winning pot. There are no deposit fees, no withdrawal fees, and no hidden charges. The fee is deducted automatically by the smart contract before distributing winnings.',
  },
  {
    Icon: RotateCcw,
    title: 'Unmatched Bets & Cancellations',
    tag: 'Cancellations',
    body: 'If your bet order or Placer offer is not matched before the event starts, you can cancel it at any time. Your full stake or liability is released immediately and directly back to your wallet — zero cost.',
  },
  {
    Icon: Scale,
    title: 'Fair Matching',
    tag: 'View Odds',
    body: 'Orders are matched in the smart contract using a greedy algorithm that prioritises the best available odds. Partial matching is supported — your bet can be split across multiple Placer offers to maximise fill.',
  },
  {
    Icon: AlertTriangle,
    title: 'Disputed & Void Events',
    tag: 'Edge Cases',
    body: 'In the event of a postponed, abandoned, or void match, the Oracle submits a void result. All locked funds — both bettor stakes and placer liabilities — are released in full to their original owners.',
  },
]

export default function RulesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">

      {/* Header */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Legal & Mechanics</p>
        <h1 className="text-4xl font-bold text-white">Platform Rules</h1>
        <p className="text-slate-400 text-base max-w-xl">
          All bets on Bettazoo are governed exclusively by the BettazooEscrow Smart Contract deployed on-chain. These rules reflect the contract&apos;s immutable logic.
        </p>
      </div>

      {/* Rules list */}
      <div className="space-y-4">
        {RULES.map(({ Icon, title, tag, body }) => (
          <div
            key={title}
            className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-5 flex gap-4 hover:border-slate-700 transition-colors"
          >
            <div className="shrink-0 w-10 h-10 rounded-lg bg-[#B31A1A]/10 border border-[#B31A1A]/20 flex items-center justify-center">
              <Icon size={18} className="text-[#B31A1A]" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                  {tag}
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Contract note */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5 space-y-3">
        <p className="text-sm font-semibold text-white">Smart Contract Address</p>
        <p className="text-xs text-slate-500 font-mono break-all">
          BettazooEscrow: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 (Hardhat localhost — update on mainnet deploy)
        </p>
        <p className="text-xs text-slate-600">
          The contract source code is open and verifiable. In case of any discrepancy between this page and the deployed contract, the contract code prevails.
        </p>
      </div>

      {/* CTA */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/how-to-play"
          className="px-5 py-2.5 rounded-md bg-[#B31A1A] hover:bg-[#9a1515] text-white text-sm font-semibold transition-colors"
        >
          How to Play →
        </Link>
        <Link
          href="/bet"
          className="px-5 py-2.5 rounded-md border border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white text-sm font-semibold transition-colors"
        >
          Browse Markets
        </Link>
      </div>

    </div>
  )
}
