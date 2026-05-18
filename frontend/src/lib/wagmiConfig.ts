import { createConfig, createStorage, http, injected } from 'wagmi'
import { walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { arbitrumSepolia } from 'wagmi/chains'

const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ??
  'https://sepolia-rollup.arbitrum.io/rpc'

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(wcProjectId
      ? [walletConnect({ projectId: wcProjectId, showQrModal: true })]
      : []),
    coinbaseWallet({ appName: 'Bettazoo' }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(rpcUrl, { retryCount: 3, retryDelay: 1_000 }),
  },
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }),
})
