export const ESCROW_ABI = [
  {
    inputs: [
      { internalType: 'uint256[]', name: 'offerIds', type: 'uint256[]' },
      { internalType: 'uint256', name: 'totalBettorStake', type: 'uint256' },
    ],
    name: 'acceptOffers',
    outputs: [{ internalType: 'uint256[]', name: 'matchIds', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'eventId', type: 'string' },
      { internalType: 'uint8', name: 'outcome', type: 'uint8' },
      { internalType: 'uint256', name: 'odds', type: 'uint256' },
      { internalType: 'uint256', name: 'liability', type: 'uint256' },
    ],
    name: 'createOffer',
    outputs: [{ internalType: 'uint256', name: 'offerId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'offerId', type: 'uint256' }],
    name: 'cancelOffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'eventId',        type: 'string' },
      { internalType: 'uint8',  name: 'winningOutcome', type: 'uint8'  },
    ],
    name: 'resolveEvent',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'platformFeePercentage',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'owner',   type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const MOCK_USDT_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'faucet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'canClaim',
    outputs: [
      { internalType: 'bool',    name: 'claimable',   type: 'bool'    },
      { internalType: 'uint256', name: 'waitSeconds',  type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export type MockEvent = {
  eventId: string
  name: string
  category: 'sports' | 'esports'
  sport: string
  league: string
  sportLabel: string
  leagueLabel: string
  icon: string
  teams: string[]
  startTime: string
}

const t = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

export const MOCK_EVENTS: MockEvent[] = [
  // Sports > Football > Serie A
  { eventId: 'evt-001', name: 'Juventus vs Inter',    category: 'sports',  sport: 'football',          league: 'serie-a',           sportLabel: 'Football',          leagueLabel: 'Serie A',           icon: '⚽', teams: ['Juventus', 'Inter'],                  startTime: t(1)   },
  { eventId: 'evt-002', name: 'Milan vs Roma',         category: 'sports',  sport: 'football',          league: 'serie-a',           sportLabel: 'Football',          leagueLabel: 'Serie A',           icon: '⚽', teams: ['Milan', 'Roma'],                      startTime: t(2)   },
  { eventId: 'evt-003', name: 'Napoli vs Lazio',       category: 'sports',  sport: 'football',          league: 'serie-a',           sportLabel: 'Football',          leagueLabel: 'Serie A',           icon: '⚽', teams: ['Napoli', 'Lazio'],                    startTime: t(3)   },
  // Sports > Football > Premier League
  { eventId: 'evt-004', name: 'Arsenal vs Chelsea',    category: 'sports',  sport: 'football',          league: 'premier-league',    sportLabel: 'Football',          leagueLabel: 'Premier League',    icon: '⚽', teams: ['Arsenal', 'Chelsea'],                 startTime: t(5)   },
  { eventId: 'evt-005', name: 'Man City vs Liverpool', category: 'sports',  sport: 'football',          league: 'premier-league',    sportLabel: 'Football',          leagueLabel: 'Premier League',    icon: '⚽', teams: ['Man City', 'Liverpool'],              startTime: t(6)   },
  // Sports > Football > Champions League
  { eventId: 'evt-006', name: 'Real Madrid vs PSG',    category: 'sports',  sport: 'football',          league: 'champions-league',  sportLabel: 'Football',          leagueLabel: 'Champions League',  icon: '⚽', teams: ['Real Madrid', 'PSG'],                 startTime: t(8)   },
  // Sports > Basketball > NBA
  { eventId: 'evt-007', name: 'Lakers vs Warriors',    category: 'sports',  sport: 'basketball',        league: 'nba',               sportLabel: 'Basketball',        leagueLabel: 'NBA',               icon: '🏀', teams: ['LA Lakers', 'Golden State Warriors'], startTime: t(2)   },
  { eventId: 'evt-008', name: 'Celtics vs Heat',       category: 'sports',  sport: 'basketball',        league: 'nba',               sportLabel: 'Basketball',        leagueLabel: 'NBA',               icon: '🏀', teams: ['Boston Celtics', 'Miami Heat'],       startTime: t(4)   },
  // Sports > Tennis > Grand Slam
  { eventId: 'evt-009', name: 'Djokovic vs Alcaraz',   category: 'sports',  sport: 'tennis',            league: 'grand-slam',        sportLabel: 'Tennis',            leagueLabel: 'Grand Slam',        icon: '🎾', teams: ['N. Djokovic', 'C. Alcaraz'],          startTime: t(10)  },
  // E-Sports > CS2
  { eventId: 'evt-010', name: 'NAVI vs FaZe Clan',     category: 'esports', sport: 'cs2',               league: 'esl-pro-league',    sportLabel: 'CS2',               leagueLabel: 'ESL Pro League',    icon: '🎮', teams: ['NAVI', 'FaZe Clan'],                  startTime: t(1.5) },
  { eventId: 'evt-011', name: 'Vitality vs G2',        category: 'esports', sport: 'cs2',               league: 'pgl-major',         sportLabel: 'CS2',               leagueLabel: 'PGL Major',         icon: '🎮', teams: ['Team Vitality', 'G2 Esports'],        startTime: t(3)   },
  // E-Sports > League of Legends > LEC
  { eventId: 'evt-012', name: 'G2 vs Fnatic',          category: 'esports', sport: 'league-of-legends', league: 'lec',               sportLabel: 'League of Legends', leagueLabel: 'LEC',               icon: '⚔️', teams: ['G2 Esports', 'Fnatic'],             startTime: t(4)   },
  // E-Sports > Valorant > VCT
  { eventId: 'evt-013', name: 'Sentinels vs NRG',      category: 'esports', sport: 'valorant',          league: 'vct',               sportLabel: 'Valorant',          leagueLabel: 'VCT',               icon: '🎯', teams: ['Sentinels', 'NRG Esports'],           startTime: t(6)   },
  // E-Sports > Dota 2 > The International
  { eventId: 'evt-014', name: 'Team Liquid vs EG',     category: 'esports', sport: 'dota2',             league: 'the-international', sportLabel: 'Dota 2',            leagueLabel: 'The International', icon: '🛡️', teams: ['Team Liquid', 'Evil Geniuses'],      startTime: t(8)   },
]

export const OUTCOMES: Record<number, string> = {
  0: 'Home Win',
  1: 'Draw',
  2: 'Away Win',
}
