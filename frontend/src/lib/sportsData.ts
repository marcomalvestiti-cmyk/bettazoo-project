export type SportNode = {
  id: string
  label: string
  iconType?: string
  children?: SportNode[]
}

export const SPORTS_TREE: SportNode[] = [
  {
    id: 'sports',
    label: 'Sports',
    iconType: 'trophy',
    children: [
      {
        id: 'football',
        label: 'Football',
        iconType: 'circle',
        children: [
          { id: 'serie-a',          label: 'Serie A' },
          { id: 'premier-league',   label: 'Premier League' },
          { id: 'champions-league', label: 'Champions League' },
          { id: 'la-liga',          label: 'La Liga' },
          { id: 'bundesliga',       label: 'Bundesliga' },
        ],
      },
      {
        id: 'basketball',
        label: 'Basketball',
        iconType: 'dumbbell',
        children: [
          { id: 'nba',        label: 'NBA' },
          { id: 'euroleague', label: 'EuroLeague' },
          { id: 'ncaa',       label: 'NCAA' },
        ],
      },
      {
        id: 'tennis',
        label: 'Tennis',
        iconType: 'target',
        children: [
          { id: 'grand-slam',  label: 'Grand Slam' },
          { id: 'atp-masters', label: 'ATP Masters 1000' },
          { id: 'wta',         label: 'WTA Tour' },
        ],
      },
      {
        id: 'mma',
        label: 'MMA',
        iconType: 'shield',
        children: [
          { id: 'ufc',      label: 'UFC' },
          { id: 'bellator', label: 'Bellator' },
        ],
      },
    ],
  },
  {
    id: 'esports',
    label: 'E-Sports',
    iconType: 'gamepad',
    children: [
      {
        id: 'cs2',
        label: 'CS2',
        iconType: 'crosshair',
        children: [
          { id: 'esl-pro-league', label: 'ESL Pro League' },
          { id: 'pgl-major',      label: 'PGL Major' },
          { id: 'blast-premier',  label: 'BLAST Premier' },
        ],
      },
      {
        id: 'league-of-legends',
        label: 'League of Legends',
        iconType: 'sword',
        children: [
          { id: 'lec',    label: 'LEC' },
          { id: 'lck',    label: 'LCK' },
          { id: 'lcs',    label: 'LCS' },
          { id: 'worlds', label: 'Worlds' },
        ],
      },
      {
        id: 'dota2',
        label: 'Dota 2',
        iconType: 'shield',
        children: [
          { id: 'the-international', label: 'The International' },
          { id: 'dpc',               label: 'DPC' },
        ],
      },
      {
        id: 'valorant',
        label: 'Valorant',
        iconType: 'target',
        children: [
          { id: 'vct',           label: 'VCT' },
          { id: 'vct-champions', label: 'VCT Champions' },
        ],
      },
    ],
  },
]

export function filterEventsBySlug<T extends { category: string; sport: string; league: string }>(
  events: T[],
  slug: string[]
): T[] {
  if (slug.length === 0) return events
  if (slug.length === 1) return events.filter(e => e.category === slug[0])
  if (slug.length === 2) return events.filter(e => e.category === slug[0] && e.sport === slug[1])
  return events.filter(e => e.category === slug[0] && e.sport === slug[1] && e.league === slug[2])
}
