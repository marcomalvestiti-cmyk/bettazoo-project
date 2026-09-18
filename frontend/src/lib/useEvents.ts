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
export function useEvents(): { events: MockEvent[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: ['events'],
    queryFn: fetchEvents,
    placeholderData: MOCK_EVENTS,
    staleTime: 5 * 60_000,
  })

  const events = query.data && query.data.length > 0 ? query.data : MOCK_EVENTS
  return { events, isLoading: query.isLoading }
}
