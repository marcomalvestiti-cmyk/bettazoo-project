import { createConfig, createStorage, http, injected } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'

// Use a dedicated RPC when available (NEXT_PUBLIC_RPC_URL env var),
// falling back to the public Arbitrum Sepolia endpoint.
// The public endpoint can return 429 rate-limit errors under load.
const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ??
  'https://sepolia-rollup.arbitrum.io/rpc'

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [arbitrumSepolia.id]: http(rpcUrl, { retryCount: 3, retryDelay: 1_000 }),
  },
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }),
})
