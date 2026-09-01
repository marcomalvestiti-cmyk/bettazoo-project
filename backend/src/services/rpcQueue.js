// ── throttleProvider ──────────────────────────────────────────────────────────
// Every RPC-facing piece of this backend (Escrow event polling, vault event
// polling, the keeper's balance reads and transactions) shares ONE provider
// instance, but each was firing its own requests independently — under load
// their combined rate regularly tripped the public RPC's rate limit, even
// after each individual sync loop was throttled on its own.
//
// ethers v6 routes every outbound JSON-RPC call (reads, polling, tx broadcast)
// through provider.send(method, params). Wrapping that one method serializes
// ALL calls from ALL consumers through a single FIFO queue with a minimum gap
// between requests — the one choke point that actually covers everything.
function throttleProvider(provider, { minIntervalMs = 250 } = {}) {
  const originalSend = provider.send.bind(provider)
  let queue = Promise.resolve()

  provider.send = (method, params) => {
    const scheduled = queue.then(
      () => new Promise((resolve) => setTimeout(resolve, minIntervalMs))
    )
    queue = scheduled // chain the NEXT call off this one regardless of outcome —
    // a failed request must not stall or break the queue for everyone after it.
    return scheduled.then(() => originalSend(method, params))
  }

  return provider
}

module.exports = { throttleProvider }
