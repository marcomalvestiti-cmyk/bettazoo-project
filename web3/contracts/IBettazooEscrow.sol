// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface for the BettazooEscrow functions PlacerVault calls.
interface IBettazooEscrow {
    function createOffer(
        string calldata eventId,
        uint8 outcome,
        uint256 odds,
        uint256 liability
    ) external returns (uint256 offerId);

    function cancelOffer(uint256 offerId) external;
}
