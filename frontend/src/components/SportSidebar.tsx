'use client'

import { useState, useEffect, type MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Trophy, Gamepad2, CircleDot, Dumbbell,
  Crosshair, Sword, ShieldHalf, Target, Zap,
  ChevronDown, X, SlidersHorizontal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SPORTS_TREE, type SportNode } from '@/lib/sportsData'

const ICON_MAP: Record<string, LucideIcon> = {
  trophy:    Trophy,
  gamepad:   Gamepad2,
  circle:    CircleDot,
  dumbbell:  Dumbbell,
  crosshair: Crosshair,
  sword:     Sword,
  shield:    ShieldHalf,
  target:    Target,
  zap:       Zap,
}

export default function SportSidebar({ activeSlug }: { activeSlug: string[] }) {
  const pathname = usePathname()
  const activeStr = activeSlug.join('/')

  const [openNodes, setOpenNodes] = useState<Set<string>>(
    () => new Set(activeSlug)
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setOpenNodes(prev => {
      const next = new Set(prev)
      activeSlug.forEach(id => next.add(id))
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStr])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  function toggle(id: string, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setOpenNodes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function renderNode(node: SportNode, pathParts: string[], depth: number): React.ReactNode {
    const hasChildren = !!node.children?.length
    const fullParts   = [...pathParts, node.id]
    const href        = `/bet/${fullParts.join('/')}`
    const nodeStr     = fullParts.join('/')
    const isSelected  = activeStr === nodeStr
    const isInPath    = activeStr === nodeStr || activeStr.startsWith(`${nodeStr}/`)
    const isOpen      = openNodes.has(node.id)
    const Icon        = node.iconType ? (ICON_MAP[node.iconType] ?? Zap) : Zap
    const pl          = (depth + 1) * 12 + 8

    const linkCls = [
      'flex items-center gap-2 min-w-0 rounded-l-md text-sm transition-colors py-2.5 flex-1',
      isSelected
        ? 'text-white bg-slate-800 border-l-2 border-[#B31A1A]'
        : isInPath
        ? 'text-slate-200 hover:bg-slate-900'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900',
    ].join(' ')

    return (
      <div key={node.id}>

        {/* ── Row: navigate link + (optional) separate expand button ── */}
        <div className="flex items-stretch">

          <Link
            href={href}
            className={linkCls}
            style={{
              paddingLeft:  `${isSelected ? pl - 2 : pl}px`,
              paddingRight: hasChildren ? '4px' : '12px',
            }}
          >
            {depth <= 1 && (
              <Icon
                size={depth === 0 ? 15 : 13}
                className={`shrink-0 ${isSelected || isInPath ? 'text-[#B31A1A]' : ''}`}
              />
            )}
            <span className={`truncate ${depth === 0 ? 'font-semibold' : 'font-medium'}`}>
              {node.label}
            </span>
          </Link>

          {/* Expand/collapse — dedicated touch target (min 44 × 44 px) */}
          {hasChildren && (
            <button
              onClick={(e) => toggle(node.id, e)}
              aria-label={isOpen ? `Chiudi ${node.label}` : `Apri ${node.label}`}
              className={[
                'flex items-center justify-center w-11 self-stretch shrink-0 rounded-r-md',
                'transition-colors',
                isSelected || isInPath
                  ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/60',
              ].join(' ')}
            >
              <ChevronDown
                size={13}
                className={`transition-transform duration-300 ease-in-out ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>

        {/* ── Animated children container ── */}
        {hasChildren && (
          <div
            className={[
              'overflow-hidden transition-all duration-300 ease-in-out',
              isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
            ].join(' ')}
          >
            {node.children!.map(child => renderNode(child, fullParts, depth + 1))}
          </div>
        )}

      </div>
    )
  }

  const tree = (
    <nav className="space-y-0.5">
      <Link
        href="/bet"
        className={[
          'flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors',
          activeSlug.length === 0
            ? 'text-white bg-slate-800 border-l-2 border-[#B31A1A] pl-[10px]'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900',
        ].join(' ')}
      >
        <Zap
          size={14}
          className={`shrink-0 ${activeSlug.length === 0 ? 'text-[#B31A1A]' : ''}`}
        />
        Featured
      </Link>
      {SPORTS_TREE.map(node => renderNode(node, [], 0))}
    </nav>
  )

  return (
    <>
      {/* ── Mobile FAB ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-[#B31A1A] text-white text-sm font-semibold px-4 py-3 rounded-full shadow-xl active:scale-95 transition-transform"
      >
        <SlidersHorizontal size={15} />
        Events
      </button>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-slate-800 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto">
        <div className="px-3 pt-5 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 mb-3">
            Events
          </p>
          {tree}
        </div>
      </aside>

      {/* ── Mobile drawer (always in DOM for smooth enter/exit animation) ── */}
      <div
        className={[
          'md:hidden fixed inset-0 z-50 flex',
          'transition-opacity duration-300 ease-in-out',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />

        {/* Sliding panel */}
        <aside
          className={[
            'relative w-72 max-w-[85vw] bg-slate-950 border-r border-slate-800',
            'overflow-y-auto flex flex-col',
            'transition-transform duration-300 ease-in-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
            <span className="text-sm font-bold text-white">Events</span>
            <button
              onClick={() => setMobileOpen(false)}
              className="p-2 rounded hover:bg-slate-800 transition-colors"
              aria-label="Chiudi menu"
            >
              <X size={16} className="text-slate-400" />
            </button>
          </div>

          {/* Drawer content */}
          <div className="px-3 py-3 flex-1 overflow-y-auto">
            {tree}
          </div>
        </aside>
      </div>
    </>
  )
}
