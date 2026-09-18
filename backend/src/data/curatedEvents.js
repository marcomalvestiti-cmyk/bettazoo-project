// Curated fallback event catalog — the same 14 fixtures that used to live as
// MOCK_EVENTS in the frontend (frontend/src/lib/abis.ts), moved server-side so the
// backend is the single source of truth for the catalog (see eventsFeedService.js).
//
// These always cover basketball/tennis/esports (no live odds feed integrated for
// those yet — see LIVE_SOCCER_LEAGUES in eventsFeedService.js for why football is
// first). The football fixtures here are a fallback only: once ODDS_API_KEY is set
// and live fixtures exist for a league, GET /api/events hides the curated football
// entries in favor of real ones — basketball/tennis/esports are unaffected.

const HOUR = 3_600_000
const t = (h) => new Date(Date.now() + h * HOUR).toISOString()

const CURATED_EVENTS = [
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

module.exports = { CURATED_EVENTS }
