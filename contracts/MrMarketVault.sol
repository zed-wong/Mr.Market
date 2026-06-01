// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 interface required by the vault.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title MrMarketVault
/// @notice Simple single-admin ERC-20 custody vault for future Mr.Market web3 funding.
/// @dev This contract intentionally keeps custody policy deployment-agnostic and off-chain.
contract MrMarketVault {
    address public immutable admin;

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event UserPayout(address indexed user, address indexed token, uint256 amount);
    event AdminWithdrawal(address indexed admin, address indexed token, uint256 amount);
    event AdminSweep(address indexed admin, address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();
    error TokenTransferFailed();

    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert Unauthorized();
        }
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Deposit ERC-20 tokens into the vault.
    /// @param token ERC-20 token contract address.
    /// @param amount Token amount to transfer from the sender.
    function deposit(address token, uint256 amount) external {
        _requireTokenAndAmount(token, amount);
        _safeTransferFrom(token, msg.sender, address(this), amount);

        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Pay a user from vault ERC-20 holdings. Callable only by the admin.
    /// @param user Recipient user address.
    /// @param token ERC-20 token contract address.
    /// @param amount Token amount to pay out.
    function userPayout(address user, address token, uint256 amount) external onlyAdmin {
        if (user == address(0)) {
            revert ZeroAddress();
        }
        _requireTokenAndAmount(token, amount);
        _safeTransfer(token, user, amount);

        emit UserPayout(user, token, amount);
    }

    /// @notice Withdraw vault ERC-20 holdings to the admin address.
    /// @param token ERC-20 token contract address.
    /// @param amount Token amount to withdraw.
    function adminWithdraw(address token, uint256 amount) external onlyAdmin {
        _requireTokenAndAmount(token, amount);
        _safeTransfer(token, admin, amount);

        emit AdminWithdrawal(msg.sender, token, amount);
    }

    /// @notice Sweep vault ERC-20 holdings to an admin-selected recipient.
    /// @param token ERC-20 token contract address.
    /// @param to Recipient address.
    /// @param amount Token amount to sweep.
    function adminSweep(address token, address to, uint256 amount) external onlyAdmin {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        _requireTokenAndAmount(token, amount);
        _safeTransfer(token, to, amount);

        emit AdminSweep(msg.sender, token, to, amount);
    }

    function _requireTokenAndAmount(address token, uint256 amount) private pure {
        if (token == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        _requireSuccessfulTokenCall(success, data);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        _requireSuccessfulTokenCall(success, data);
    }

    function _requireSuccessfulTokenCall(bool success, bytes memory data) private pure {
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
