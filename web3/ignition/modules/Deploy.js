const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');

/**
 * Deployment order:
 *   1. MockUSDT   — testnet ERC20 with faucet
 *   2. BettazooEscrow — pass MockUSDT address + treasury + oracle to constructor
 *
 * Usage:
 *   npx hardhat ignition deploy ignition/modules/Deploy.js --network arbitrumSepolia \
 *     --parameters '{"treasury":"0x...","oracle":"0x..."}'
 */
module.exports = buildModule('BettazooModule', (m) => {
  const treasury = m.getParameter('treasury', '0x0000000000000000000000000000000000000000');
  const oracle   = m.getParameter('oracle',   '0x0000000000000000000000000000000000000000');

  const mockUSDT = m.contract('MockUSDT');

  const escrow = m.contract('BettazooEscrow', [mockUSDT, treasury, oracle]);

  return { mockUSDT, escrow };
});
