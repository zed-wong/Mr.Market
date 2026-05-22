import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { balances } from './balances';
import {
  completeMockDeposit,
  fundingActivityForAccount,
  resetFundingSession,
  sessionFundingActivity,
  submitMockWithdrawal,
  validateMockDeposit,
  validateMockWithdrawal,
} from './funding';
import { connectMockWallet, setWalletDisconnected } from './wallet';

describe('mock funding flows', () => {
  afterEach(() => {
    resetFundingSession();
    setWalletDisconnected();
  });

  it('validates EVM and Solana withdrawal destinations and amounts', async () => {
    await connectMockWallet('evm-primary', 0);
    const evmBalance = get(balances).find((balance) => balance.symbol === 'USDC');

    expect(
      validateMockWithdrawal({
        namespace: 'evm',
        balance: evmBalance,
        destination: 'So11111111111111111111111111111111111111112',
        amount: '25',
      }).destination
    ).toContain('valid EVM address');

    expect(
      validateMockWithdrawal({
        namespace: 'evm',
        balance: evmBalance,
        destination: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        amount: '0',
      }).amount
    ).toContain('greater than zero');

    expect(
      validateMockWithdrawal({
        namespace: 'evm',
        balance: evmBalance,
        destination: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        amount: '999999',
      }).amount
    ).toContain('exceeds available balance');

    await connectMockWallet('solana-primary', 0);
    const solBalance = get(balances).find((balance) => balance.symbol === 'SOL');

    expect(
      validateMockWithdrawal({
        namespace: 'solana',
        balance: solBalance,
        destination: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        amount: '1',
      }).destination
    ).toContain('valid Solana address');
  });

  it('credits mocked deposits into balances and newest funding activity', async () => {
    await connectMockWallet('evm-primary', 0);
    const ethBalance = get(balances).find((balance) => balance.symbol === 'ETH');
    expect(ethBalance?.amount).toBe('4.2500');

    const result = completeMockDeposit('evm-primary', ethBalance!, '0.25');
    const updatedEthBalance = get(balances).find((balance) => balance.symbol === 'ETH');
    const activity = fundingActivityForAccount('evm-primary', 'evm', get(sessionFundingActivity));

    expect(result.timeline.map((step) => step.label)).toEqual([
      'Address generated',
      'Deposit detected',
      'Pending confirmations',
      'Credited',
    ]);
    expect(updatedEthBalance?.amount).toBe('4.5000');
    expect(activity[0].detail).toContain('amount 0.25');
    expect(activity[0].label).toBe('Deposit');
  });

  it('validates mocked deposits before balance and activity mutation', async () => {
    await connectMockWallet('evm-primary', 0);
    const usdcBalance = get(balances).find((balance) => balance.symbol === 'USDC');

    expect(validateMockDeposit({ balance: usdcBalance, amount: 'abc' }).amount).toContain('numeric');
    expect(validateMockDeposit({ balance: usdcBalance, amount: '-1' }).amount).toContain('greater than zero');
    expect(validateMockDeposit({ balance: usdcBalance, amount: '0' }).amount).toContain('greater than zero');
    expect(validateMockDeposit({ balance: usdcBalance, amount: '1' }).amount).toContain('Minimum mocked deposit');
    expect(validateMockDeposit({ balance: usdcBalance, amount: '25.1234567' }).amount).toContain('decimal places');

    const beforeAmount = get(balances).find((balance) => balance.symbol === 'USDC')?.amount;
    expect(() => completeMockDeposit('evm-primary', usdcBalance!, '1')).toThrow('Minimum mocked deposit');
    expect(get(balances).find((balance) => balance.symbol === 'USDC')?.amount).toBe(beforeAmount);
    expect(get(sessionFundingActivity)).toEqual([]);
  });

  it('scopes session funding activity by account and namespace', async () => {
    await connectMockWallet('evm-primary', 0);
    const primaryEth = get(balances).find((balance) => balance.symbol === 'ETH');
    completeMockDeposit('evm-primary', primaryEth!, '0.25');

    await connectMockWallet('evm-secondary', 0);
    const secondaryEth = get(balances).find((balance) => balance.symbol === 'ETH');
    completeMockDeposit('evm-secondary', secondaryEth!, '0.25');

    const primaryActivity = fundingActivityForAccount('evm-primary', 'evm', get(sessionFundingActivity));
    const secondaryActivity = fundingActivityForAccount('evm-secondary', 'evm', get(sessionFundingActivity));

    expect(primaryActivity.map((entry) => entry.accountId)).toEqual(['evm-primary', 'evm-primary']);
    expect(secondaryActivity.map((entry) => entry.accountId)).toEqual(['evm-secondary']);
    expect(primaryActivity.some((entry) => entry.accountId === 'evm-secondary')).toBe(false);
  });

  it('submits mocked withdrawals as pending and separates available balance', async () => {
    await connectMockWallet('solana-primary', 0);
    const solBalance = get(balances).find((balance) => balance.symbol === 'SOL');

    const result = submitMockWithdrawal(
      'solana-primary',
      solBalance!,
      '1.5',
      'So11111111111111111111111111111111111111112'
    );
    const updatedSolBalance = get(balances).find((balance) => balance.symbol === 'SOL');
    const activity = fundingActivityForAccount('solana-primary', 'solana', get(sessionFundingActivity));

    expect(result.timeline.map((step) => step.label)).toEqual([
      'Submitted',
      'Reviewing',
      'Broadcast queued',
      'Pending final state',
    ]);
    expect(updatedSolBalance?.amount).toBe('57.0000');
    expect(updatedSolBalance?.pendingAmount).toBe('1.5000');
    expect(activity[0].label).toBe('Withdraw');
    expect(activity[0].detail).toContain('reviewing');
  });
});
