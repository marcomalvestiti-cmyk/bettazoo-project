import { createConfig, createStorage, http, injected } from 'wagmi'
import { hardhat } from 'wagmi/chains'

export const wagmiConfig = createConfig({
  chains: [hardhat],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(),
  },
  // Persiste la connessione in localStorage tra una sessione e l'altra
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }),
})
