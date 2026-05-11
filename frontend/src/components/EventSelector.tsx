'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { SPORTS_TREE, type SportNode } from '@/lib/sportsData'
import { MOCK_EVENTS } from '@/lib/abis'

interface Props {
  value: string
  onSelect: (eventId: string) => void
}

export default function EventSelector({ value, onSelect }: Props) {
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setOpenNodes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedEvent = MOCK_EVENTS.find(e => e.eventId === value)

  function renderLeafEvents(leagueId: string) {
    const events = MOCK_EVENTS.filter(e => e.league === leagueId)
    if (!events.length) return null
    return (
      <div className="ml-3 border-l border-slate-800 space-y-0.5 pl-3 py-1">
        {events.map(ev => {
          const isSelected = ev.eventId === value
          return (
            <button
              key={ev.eventId}
              onClick={() => onSelect(ev.eventId)}
              className={`w-full text-left flex items-center gap-2 px-2 py-2 rounded-md text-xs transition-colors ${
                isSelected
                  ? 'bg-[#FFB01F]/15 text-[#FFB01F] border border-[#FFB01F]/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="text-sm">{ev.icon}</span>
              <span className="truncate font-medium">{ev.name}</span>
              {isSelected && <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-[#FFB01F]" />}
            </button>
          )
        })}
      </div>
    )
  }

  function renderNode(node: SportNode, depth: number): React.ReactNode {
    const isOpen = openNodes.has(node.id)
    const pl = depth * 10 + 8

    if (!node.children?.length) {
      return (
        <div key={node.id}>
          <button
            onClick={() => toggle(node.id)}
            className={`w-full flex items-center justify-between py-1.5 pr-2 rounded-md text-xs font-medium transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800`}
            style={{ paddingLeft: `${pl}px` }}
          >
            <span className="truncate">{node.label}</span>
          </button>
          {renderLeafEvents(node.id)}
        </div>
      )
    }

    return (
      <div key={node.id}>
        <button
          onClick={() => toggle(node.id)}
          className={`w-full flex items-center justify-between py-1.5 pr-2 rounded-md text-xs transition-colors ${
            depth === 0
              ? 'font-bold text-slate-300 hover:text-white hover:bg-slate-800'
              : 'font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          style={{ paddingLeft: `${pl}px` }}
        >
          <span className="truncate">{node.label}</span>
          <ChevronRight
            size={11}
            className={`shrink-0 ml-1 transition-transform duration-150 text-slate-600 ${isOpen ? 'rotate-90' : ''}`}
          />
        </button>

        {isOpen && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
      <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">Select Event</p>

      {selectedEvent && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#FFB01F]/10 border border-[#FFB01F]/25">
          <span>{selectedEvent.icon}</span>
          <span className="text-xs font-semibold text-[#FFB01F] truncate">{selectedEvent.name}</span>
        </div>
      )}

      <div className="space-y-0.5 max-h-64 overflow-y-auto">
        {SPORTS_TREE.map(node => renderNode(node, 0))}
      </div>
    </div>
  )
}
