'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchEvents } from './api'
import { MOCK_EVENTS, type MockEvent } from './abis'

// Real event catalog from the backend (live odds feed + curated fallback — see
// backend/src/services/eventsFeedService.js). Paints instantly from the bundled
// MOCK_EVENTS on first render (placeholderData), then swaps in the real list once
// the backend answers — and falls straight back to MOCK_EVENTS if the backend is
// unreachable or returns nothing, so every page that used to read the hardcoded
// array keeps working offline exactly as before.
//
// `open: true` → only events still open for betting (pickers, listings). No mock
// fallback in that mode: an empty answer means "nothing to bet on right now", and
// showing invented fixtures instead would be worse than an empty list.
export function useEvents(opts: { open?: boolean } = {}): { events: MockEvent[]; isLoading: boolean } {
  const open = Boolean(opts.open)
  const query = useQuery({
    queryKey: ['events', open ? 'open' : 'all'],
    queryFn: () => fetchEvents({ open }),
    placeholderData: open ? undefined : MOCK_EVENTS,
    staleTime: open ? 60_000 : 5 * 60_000,
  })

  if (open) return { events: query.data ?? [], isLoading: query.isLoading }
  const events = query.data && query.data.length > 0 ? query.data : MOCK_EVENTS
  return { events, isLoading: query.isLoading }
}
