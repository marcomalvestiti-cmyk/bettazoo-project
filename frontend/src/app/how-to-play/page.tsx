import type { Metadata } from 'next'
import Link from 'next/link'
import { Wallet, BookOpen, Lock, Trophy, Brain, Users, ShieldCheck, Video } from 'lucide-react'

export const metadata: Metadata = {
  title: 'How to Play — Bettazoo',
  description: 'Learn how to bet P2P on Bettazoo as a Bettor or become a Placer and set the market.',
}

const BETTOR_STEPS = [
  {
    step: 1,
    Icon: Wallet,
    title: 'Connect Your Wallet',
    desc: 'Link MetaMask (or any Web3 wallet) and make sure you hold USDT stablecoin. No account registration — your wallet is your identity on Bettazoo.',
  },
  {
    step: 2,
    Icon: BookOpen,
    title: 'Find the Best P2P Odds',
    desc: 'Browse Sports and E-Sports events. Compare real peer-to-peer odds set directly by Placers — no bookmaker margin, no hidden fees, full transparency.',
  },
  {
    step: 3,
    Icon: Lock,
    title: 'Bet & Get Paid Automatically',
    desc: 'Your stake is locked in the Smart Contract Escrow. When the match ends, a certified Oracle confirms the result and USDT is sent directly to your wallet — instant, trustless, and automated.',
  },
]

const PLACER_STEPS = [
  {
    step: 1,
    Icon: Trophy,
    title: 'Deploy Your Vault',
    desc: 'Connect your wallet and create your own isolated on-chain Vault from the Placer Dashboard. Deposit USDT — it stays withdrawable to you alone, always.',
  },
  {
    step: 2,
    Icon: Brain,
    title: 'Set a Strategy, Not a Bet Slip',
    desc: 'Pick a margin strategy, choose which events and outcomes to cover, and set risk limits (max exposure, stop-loss, a required cap per bet). The Bettazoo keeper quotes and requotes automatically within those rules — you never place a bet by hand.',
  },
  {
    step: 3,
    Icon: ShieldCheck,
    title: 'Complete Compliance',
    desc: 'Sign the Liquidity Provision Agreement (one wallet signature) and request a KYC review before your Vault can go active — a one-time step that protects both you and the House.',
  },
  {
    step: 4,
    Icon: Users,
    title: 'Attract Bettors & Earn the Edge',
    desc: 'Your offers appear live in the betting exchange. Share your Placer profile — or go live on stream with the OBS overlay and QR code — to build a following. Earn the margin between your quoted odds and the true probability.',
  },
]

function StepCard({
  step,
  total,
  Icon,
  title,
  desc,
  accent,
}: {
  step: number
  total: number
  Icon: React.ElementType
  title: string
  desc: string
  accent: 'red' | 'amber'
}) {
  const accentClass = accent === 'red'
    ? 'text-[#B31A1A] bg-[#B31A1A]/10 border-[#B31A1A]/20'
    : 'text-amber-500 bg-amber-500/10 border-amber-500/20'

  const iconClass = accent === 'red' ? 'text-[#B31A1A]' : 'text-amber-500'

  return (
    <div className="flex gap-4">
      <div className="shrink-0 flex flex-col items-center">
        <span className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${accentClass}`}>
          {step}
        </span>
        {step < total && <div className="w-px flex-1 mt-2 bg-slate-800" />}
      </div>
      <div className="pb-8 space-y-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconClass} />
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

export default function HowToPlayPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-14">

      {/* Header */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Guide</p>
        <h1 className="text-4xl font-bold text-white">How to Play</h1>
        <p className="text-slate-400 text-base max-w-xl">
          Bettazoo is a peer-to-peer betting exchange on Web3. No bookmaker. Every bet is matched directly between a Bettor and a Placer, secured on-chain.
        </p>
      </div>

      {/* Two-column role sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bettor column */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-widest text-[#B31A1A]">For Bettors</span>
            <h2 className="text-2xl font-bold text-white">Place a Bet</h2>
            <p className="text-sm text-slate-500">You back an outcome at the best available odds.</p>
          </div>
          <div>
            {BETTOR_STEPS.map(s => (
              <StepCard key={s.step} {...s} total={BETTOR_STEPS.length} accent="red" />
            ))}
          </div>
          <Link
            href="/bet"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#B31A1A] hover:bg-[#9a1515] text-white text-sm font-semibold transition-colors"
          >
            Browse Events →
          </Link>
        </div>

        {/* Placer column */}
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-6 space-y-6">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-500">For Placers</span>
            <h2 className="text-2xl font-bold text-white">Be the Market</h2>
            <p className="text-sm text-slate-500">You don&apos;t place bets by hand. You set your rules — which outcomes to back, your odds, your max exposure — and your on-chain book takes the action automatically.</p>
          </div>
          <div>
            {PLACER_STEPS.map(s => (
              <StepCard key={s.step} {...s} total={PLACER_STEPS.length} accent="amber" />
            ))}
          </div>
          <Link
            href="/placer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-amber-500 text-amber-500 hover:bg-amber-500/10 text-sm font-semibold transition-colors"
          >
            ✦ Open Placer Area →
          </Link>
        </div>
      </div>

      {/* FAQ note */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5 flex items-start gap-4">
        <span className="text-2xl select-none shrink-0">💡</span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">What is a Placer?</p>
          <p className="text-sm text-slate-400 leading-relaxed">
            A Placer runs their own book. You set the strategy and the risk limits; your vault takes the other side of bettors&apos; action on-chain, within the rules you set.
          </p>
        </div>
      </div>

      {/* Creator Suite */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5 flex items-start gap-4">
        <Video size={22} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">Streaming as a Placer</p>
          <p className="text-sm text-slate-400 leading-relaxed">
            Every Placer gets a public streaming page at <code className="text-sky-300 bg-slate-950 px-1.5 py-0.5 rounded text-xs">/placer/[address]</code> with live chat and your active offers — share it to build a following. Streaming on Twitch, Kick or YouTube from OBS? Add <code className="text-sky-300 bg-slate-950 px-1.5 py-0.5 rounded text-xs">/overlay/[address]</code> as a Browser Source for a transparent, always-current widget showing your live liquidity and a QR code viewers can scan to bet in seconds.
          </p>
        </div>
      </div>

    </div>
  )
}
