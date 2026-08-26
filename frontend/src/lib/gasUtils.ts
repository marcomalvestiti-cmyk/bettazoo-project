type GasOverrides = {
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
}

interface PublicClientLike {
  estimateFeesPerGas(): Promise<{ maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }>
}

// Fetches current EIP-1559 fees and adds a +20 % safety buffer.
// Prevents "max fee per gas less than block base fee" errors caused by
// micro-spikes in baseFee on Arbitrum Sepolia (and other L2s).
// Returns {} on error so callers can spread it safely as a no-op fallback.
export async function withGasBuffer(publicClient: PublicClientLike | undefined): Promise<GasOverrides> {
  if (!publicClient) return {}
  try {
    const fees = await publicClient.estimateFeesPerGas()
    // Only override if BOTH fields came back — a partial override (e.g. we set
    // maxFeePerGas but omit maxPriorityFeePerGas because it estimated to a falsy
    // 0n) lets the wallet fill the missing field with its own independent
    // default, which can violate maxFeePerGas >= maxPriorityFeePerGas.
    if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined) return {}
    const m = BigInt(120)
    const d = BigInt(100)
    const maxPriorityFeePerGas = (fees.maxPriorityFeePerGas * m) / d
    // Arbitrum Sepolia's base fee can be near-zero, which makes the raw
    // estimate put maxFeePerGas below maxPriorityFeePerGas — every EIP-1559
    // tx reverts unless maxFeePerGas >= maxPriorityFeePerGas.
    let maxFeePerGas = (fees.maxFeePerGas * m) / d
    if (maxFeePerGas < maxPriorityFeePerGas) maxFeePerGas = maxPriorityFeePerGas
    return { maxFeePerGas, maxPriorityFeePerGas }
  } catch {
    return {}
  }
}
