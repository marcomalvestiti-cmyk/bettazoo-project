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
] as const

export const ERC20_ABI = [
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

export const MOCK_EVENTS = [
  {
    eventId: 'evt-001',
    name: 'Juventus vs Inter',
    sport: 'football',
    teams: ['Juventus', 'Inter'],
    startTime: new Date(Date.now() + 3600 * 1000).toISOString(),
  },
  {
    eventId: 'evt-002',
    name: 'Milan vs Roma',
    sport: 'football',
    teams: ['Milan', 'Roma'],
    startTime: new Date(Date.now() + 7200 * 1000).toISOString(),
  },
  {
    eventId: 'evt-003',
    name: 'Napoli vs Lazio',
    sport: 'football',
    teams: ['Napoli', 'Lazio'],
    startTime: new Date(Date.now() + 10800 * 1000).toISOString(),
  },
]

export const OUTCOMES: Record<number, string> = {
  0: 'Home Win',
  1: 'Draw',
  2: 'Away Win',
}
