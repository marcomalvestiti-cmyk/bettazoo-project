import { createConfig, createStorage, http, injected } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }),
})
