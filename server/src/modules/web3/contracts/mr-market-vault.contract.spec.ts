import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { MR_MARKET_VAULT_ABI } from './mr-market-vault.abi';

describe('MrMarketVault contract artifact wiring', () => {
  const sourcePath = resolve(
    __dirname,
    '../../../../../contracts/MrMarketVault.sol',
  );
  const source = readFileSync(sourcePath, 'utf8');

  it('defines the expected minimal ERC-20 vault source semantics', () => {
    expect(source).toContain('contract MrMarketVault');
    expect(source).toContain('address public immutable admin;');
    expect(source).toMatch(/modifier onlyAdmin\(\)[\s\S]*msg\.sender != admin/);

    expect(source).toMatch(
      /function deposit\(address token, uint256 amount\) external/,
    );
    expect(source).toContain(
      '_safeTransferFrom(token, msg.sender, address(this), amount);',
    );
    expect(source).toContain('emit Deposited(msg.sender, token, amount);');

    expect(source).toMatch(
      /function userPayout\(address user, address token, uint256 amount\) external onlyAdmin/,
    );
    expect(source).toContain('_safeTransfer(token, user, amount);');
    expect(source).toContain('emit UserPayout(user, token, amount);');

    expect(source).toMatch(
      /function adminWithdraw\(address token, uint256 amount\) external onlyAdmin/,
    );
    expect(source).toContain('_safeTransfer(token, admin, amount);');

    expect(source).toMatch(
      /function adminSweep\(address token, address to, uint256 amount\) external onlyAdmin/,
    );
    expect(source).toContain('_safeTransfer(token, to, amount);');

    expect(source).not.toMatch(
      /Pausable|Upgradeable|delegatecall|transferOwnership|whitelist|multisig/i,
    );
  });

  it('exports an ABI consumable by ethers without requiring deployment', () => {
    const iface = new ethers.utils.Interface([...MR_MARKET_VAULT_ABI]);

    expect(iface.getFunction('deposit').format()).toBe(
      'deposit(address,uint256)',
    );
    expect(iface.getFunction('userPayout').format()).toBe(
      'userPayout(address,address,uint256)',
    );
    expect(iface.getFunction('adminWithdraw').format()).toBe(
      'adminWithdraw(address,uint256)',
    );
    expect(iface.getFunction('adminSweep').format()).toBe(
      'adminSweep(address,address,uint256)',
    );
    expect(iface.getEvent('Deposited').format()).toBe(
      'Deposited(address,address,uint256)',
    );
    expect(iface.getEvent('UserPayout').format()).toBe(
      'UserPayout(address,address,uint256)',
    );
  });
});
