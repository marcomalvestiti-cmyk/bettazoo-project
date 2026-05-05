import { createConfig, http, injected } from 'wagmi'
import { hardhat } from 'wagmi/chains'

export const wagmiConfig = createConfig({
  chains: [hardhat],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(),
  },
})
