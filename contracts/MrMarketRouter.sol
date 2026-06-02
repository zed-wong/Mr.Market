// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 interface required by the router.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title MrMarketRouter
/// @notice Stateless ERC-20 funding router for Mr.Market order funding requests.
/// @dev The contract forwards funds to the server receiver and emits request events. It does not custody balances or create orders.
contract MrMarketRouter {
    address public owner;
    address public receiver;
    mapping(address => bool) public supportedTokens;

    event FundsRouted(
        bytes32 indexed requestId,
        address indexed user,
        address indexed token,
        uint256 amount,
        bytes32 payloadHash,
        address receiver
    );
    event WithdrawalRequested(
        bytes32 indexed requestId,
        address indexed user,
        address indexed token,
        uint256 amount,
        address recipient,
        bytes32 payloadHash
    );
    event ReceiverUpdated(address oldReceiver, address newReceiver);
    event TokenSupportUpdated(address token, bool supported);

    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();
    error TokenUnsupported();
    error TokenTransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    constructor(address initialReceiver) {
        if (initialReceiver == address(0)) {
            revert ZeroAddress();
        }
        owner = msg.sender;
        receiver = initialReceiver;
    }

    /// @notice Forward ERC-20 tokens to the current server receiver and emit a funding request event.
    function routeFunds(
        bytes32 requestId,
        address token,
        uint256 amount,
        bytes32 payloadHash
    ) external {
        _requireTokenAndAmount(token, amount);
        _safeTransferFrom(token, msg.sender, receiver, amount);

        emit FundsRouted(requestId, msg.sender, token, amount, payloadHash, receiver);
    }

    /// @notice Emit a withdrawal request for the server to validate and pay from off-chain/server-held funds.
    function requestWithdrawal(
        bytes32 requestId,
        address token,
        uint256 amount,
        address recipient,
        bytes32 payloadHash
    ) external {
        _requireTokenAndAmount(token, amount);
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        emit WithdrawalRequested(requestId, msg.sender, token, amount, recipient, payloadHash);
    }

    function setReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) {
            revert ZeroAddress();
        }
        address oldReceiver = receiver;

        receiver = newReceiver;
        emit ReceiverUpdated(oldReceiver, newReceiver);
    }

    function setSupportedToken(address token, bool supported) external onlyOwner {
        if (token == address(0)) {
            revert ZeroAddress();
        }
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    function _requireTokenAndAmount(address token, uint256 amount) private view {
        if (token == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }
        if (!supportedTokens[token]) {
            revert TokenUnsupported();
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
