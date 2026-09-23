'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import QRCode from 'qrcode'
import { io, type Socket } from 'socket.io-client'
import { ERC20_ABI, OUTCOMES } from '@/lib/abis'
import { useEvents } from '@/lib/useEvents'
import { fetchVault, fetchVaultOffers, SOCKET_URL, type VaultOffer } from '@/lib/api'
import { displayMakerName, isKnownMaker } from '@/lib/formatAddress'

const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x0') as `0x${string}`
const MAX_ROWS = 4

// OBS Browser Source widget — live vault liquidity/odds + a QR to the placer's public
// streaming page (/placer/[address]), meant to sit on top of stream footage. No site
// chrome (see components/SiteChrome.tsx), transparent background (the <style> tag
// below), and no wallet required — every read here is either a public on-chain call
// (works with no wallet extension installed, see lib/wagmiConfig.ts's http transport)
// or a plain backend fetch.
export default function OverlayPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const { events } = useEvents()

  const [vaultAddress, setVaultAddress] = useState<string | null>(null)
  const [vaultChecked, setVaultChecked] = useState(false)
  const [offers, setOffers] = useState<VaultOffer[]>([])
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchVault(address)
      .then(d => { if (!cancelled) setVaultAddress(d.exists ? (d.vaultAddress ?? null) : null) })
      .catch(() => { if (!cancelled) setVaultAddress(null) })
      .finally(() => { if (!cancelled) setVaultChecked(true) })
    return () => { cancelled = true }
  }, [address])

  const loadOffers = useCallback(async () => {
    if (!vaultAddress) { setOffers([]); return }
    try {
      // fetchVaultOffers takes the OWNER's wallet address (the route param the
      // backend resolves to a vault, see routes/vaults.js), not the vault contract's
      // own address — `address` here is the page's own [address] param, which IS the
      // owner (this route is /overlay/[address] for a Placer, not a vault contract).
      const data = await fetchVaultOffers(address, true)
      setOffers(data.orders)
    } catch {
      setOffers([])
    }
  }, [vaultAddress, address])

  useEffect(() => { loadOffers() }, [loadOffers])

  useEffect(() => {
    if (!vaultAddress) return
    const socket: Socket = io(SOCKET_URL)
    const onCreated = (payload: { placer?: string }) => {
      if (payload.placer?.toLowerCase() === vaultAddress.toLowerCase()) loadOffers()
    }
    const onMatched = () => loadOffers()
    socket.on('offer:created', onCreated)
    socket.on('offer:matched', onMatched)
    return () => { socket.disconnect() }
  }, [vaultAddress, loadOffers])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/placer/${address}`
    QRCode.toDataURL(url, { width: 160, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } })
      .then(setQrDataUrl)
      .catch(() => {})
  }, [address])

  const { data: balanceRaw } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: vaultAddress ? [vaultAddress as `0x${string}`] : undefined,
    query: { enabled: !!vaultAddress, refetchInterval: 15_000 },
  })
  const balanceStr = balanceRaw !== undefined ? formatUnits(balanceRaw as bigint, 6) : null

  const rows = offers.slice(0, MAX_ROWS)

  return (
    <>
      {/* OBS Browser Source needs a truly transparent page, not just a dark card on
          top of the site's own bg-slate-950 body — !important wins over that utility
          class regardless of stylesheet order. */}
      <style>{`html, body { background: transparent !important; }`}</style>

      <div className="w-[420px] p-3 font-sans">
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/90 backdrop-blur-sm shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-900/80 border-b border-slate-800">
            <span className="w-2 h-2 rounded-full bg-[#B31A1A] animate-pulse shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Live</span>
            <span className={`text-sm font-semibold truncate ${isKnownMaker(address) ? 'text-sky-300' : 'text-white'}`}>
              {displayMakerName(address)}
            </span>
            {balanceStr !== null && (
              <span className="ml-auto shrink-0 text-xs font-mono font-bold text-emerald-400">
                ${parseFloat(balanceStr).toFixed(0)} liquidity
              </span>
            )}
          </div>

          <div className="flex">
            {/* Live offers */}
            <div className="flex-1 min-w-0 divide-y divide-slate-800/60">
              {!vaultChecked ? (
                <p className="px-4 py-4 text-xs text-slate-500">Loading…</p>
              ) : !vaultAddress ? (
                <p className="px-4 py-4 text-xs text-slate-500">No active vault yet.</p>
              ) : rows.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-500">No live offers right now.</p>
              ) : (
                rows.map(o => {
                  const ev = events.find(e => e.eventId === o.eventId)
                  return (
                    <div key={o.offerId} className="flex items-center gap-2 px-4 py-2">
                      <span className="text-sm shrink-0">{ev?.icon ?? '🎲'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-200 truncate">{ev?.name ?? o.eventId}</p>
                        <p className="text-[10px] text-slate-500">{OUTCOMES[o.outcome] ?? `Outcome ${o.outcome}`}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold font-mono text-[#FFB01F]">
                        {o.oddsDecimal.toFixed(2)}<span className="text-[10px] text-[#FFB01F]/60">x</span>
                      </span>
                    </div>
                  )
                })
              )}
            </div>

            {/* QR */}
            <div className="shrink-0 w-[104px] flex flex-col items-center justify-center gap-1 px-2 py-3 border-l border-slate-800 bg-slate-900/60">
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- data URL, no Image optimization needed for a generated QR
                <img src={qrDataUrl} alt="Scan to bet" width={72} height={72} className="rounded bg-white p-1" />
              )}
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide text-center leading-tight">Scan to Bet</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
