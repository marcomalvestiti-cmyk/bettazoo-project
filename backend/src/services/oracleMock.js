const { ethers } = require('ethers');

const ESCROW_ABI = [
  'function resolveEvent(string calldata eventId, uint8 winningOutcome) external',
];

async function resolveEventOnChain({ rpcUrl, contractAddress, privateKey, eventId, winningOutcome }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, ESCROW_ABI, wallet);

  const tx = await contract.resolveEvent(eventId, winningOutcome);
  const receipt = await tx.wait();

  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

// Simulates a Betradar-style random result for demo purposes
function simulateResult(eventId) {
  const outcomes = [0, 1, 2]; // home, draw, away
  const weights  = [0.45, 0.25, 0.30]; // rough football priors
  const rand = Math.random();
  let cumulative = 0;
  for (let i = 0; i < outcomes.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) return { eventId, winningOutcome: outcomes[i] };
  }
  return { eventId, winningOutcome: 0 };
}

module.exports = { resolveEventOnChain, simulateResult };
