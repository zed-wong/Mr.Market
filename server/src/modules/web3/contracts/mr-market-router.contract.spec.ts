import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { MR_MARKET_ROUTER_ABI } from './mr-market-router.abi';

describe('MrMarketRouter contract artifact wiring', () => {
  const sourcePath = resolve(
    __dirname,
    '../../../../../contracts/MrMarketRouter.sol',
  );
  const source = readFileSync(sourcePath, 'utf8');

  it('defines stateless router source semantics', () => {
    expect(source).toContain('contract MrMarketRouter');
    expect(source).toContain('address public receiver;');
    expect(source).toContain(
      'mapping(address => bool) public supportedTokens;',
    );
    expect(source).toMatch(/modifier onlyOwner\(\)[\s\S]*msg\.sender != owner/);

    expect(source).toMatch(
      /function routeFunds\([\s\S]*bytes32 requestId[\s\S]*address token[\s\S]*uint256 amount[\s\S]*bytes32 payloadHash[\s\S]*\) external/,
    );
    expect(source).toContain(
      '_safeTransferFrom(token, msg.sender, receiver, amount);',
    );
    expect(source).toContain(
      'emit FundsRouted(requestId, msg.sender, token, amount, payloadHash, receiver);',
    );

    expect(source).toMatch(
      /function requestWithdrawal\([\s\S]*bytes32 requestId[\s\S]*address token[\s\S]*uint256 amount[\s\S]*address recipient[\s\S]*bytes32 payloadHash[\s\S]*\) external/,
    );
    expect(source).toContain(
      'emit WithdrawalRequested(requestId, msg.sender, token, amount, recipient, payloadHash);',
    );

    expect(source).not.toMatch(
      /userPayout|adminWithdraw|adminSweep|mapping\(address => uint256\)/i,
    );
  });

  it('exports an ABI consumable by ethers without requiring deployment', () => {
    const iface = new ethers.utils.Interface([...MR_MARKET_ROUTER_ABI]);

    expect(iface.getFunction('routeFunds').format()).toBe(
      'routeFunds(bytes32,address,uint256,bytes32)',
    );
    expect(iface.getFunction('requestWithdrawal').format()).toBe(
      'requestWithdrawal(bytes32,address,uint256,address,bytes32)',
    );
    expect(iface.getFunction('setReceiver').format()).toBe(
      'setReceiver(address)',
    );
    expect(iface.getEvent('FundsRouted').format()).toBe(
      'FundsRouted(bytes32,address,address,uint256,bytes32,address)',
    );
    expect(iface.getEvent('WithdrawalRequested').format()).toBe(
      'WithdrawalRequested(bytes32,address,address,uint256,address,bytes32)',
    );
  });
});
