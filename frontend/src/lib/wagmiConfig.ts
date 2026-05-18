import { createConfig, createStorage, http, injected } from 'wagmi'
import { walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { arbitrumSepolia } from 'wagmi/chains'

const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ??
  'https://sepolia-rollup.arbitrum.io/rpc'

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

// Metadata required by WalletConnect v2 for proper mobile deep-link behaviour.
// Without these the WC modal may silently fail to load wallets on mobile.
const dappMetadata = {
  name: 'Bettazoo',
  description: 'P2P betting exchange on Arbitrum Sepolia',
  url: 'https://bettazoo-project.vercel.app',
  icons: ['https://bettazoo-project.vercel.app/Logo-Bettazoo.png'],
}

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(wcProjectId
      ? [
          walletConnect({
            projectId: wcProjectId,
            showQrModal: true,
            metadata: dappMetadata,
            // Do NOT set termsOfServiceUrl / privacyPolicyUrl — those add a
            // blocking ToS acceptance step inside the WC modal on mobile.
            qrModalOptions: {
              themeMode: 'dark',
            },
          }),
        ]
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
