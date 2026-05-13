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
    const m = BigInt(120)
    const d = BigInt(100)
    const result: GasOverrides = {}
    if (fees.maxFeePerGas)         result.maxFeePerGas         = (fees.maxFeePerGas         * m) / d
    if (fees.maxPriorityFeePerGas) result.maxPriorityFeePerGas = (fees.maxPriorityFeePerGas * m) / d
    return result
  } catch {
    return {}
  }
}
