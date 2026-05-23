import { describe, expect, it } from 'vitest';
import {
  aggregateMockActivityEntries,
  campaignEligibility,
  campaignSupportsNamespace,
  deterministicAccountForWallet,
  filterMockCampaigns,
  isSupportedDemoWallet,
  mockAccountActivityForAccount,
  mockCampaigns,
} from './mock-web3';

describe('mock campaign discovery helpers', () => {
  it('filters campaign discovery by namespace, status, and current-wallet eligibility', () => {
    expect(filterMockCampaigns(mockCampaigns, 'all', null)).toHaveLength(3);
    expect(filterMockCampaigns(mockCampaigns, 'evm', null).map((campaign) => campaign.id)).toEqual([
      'eth-usdc-depth',
      'cross-chain-stable',
    ]);
    expect(filterMockCampaigns(mockCampaigns, 'solana', null).map((campaign) => campaign.id)).toEqual([
      'sol-usdc-growth',
      'cross-chain-stable',
    ]);
    expect(filterMockCampaigns(mockCampaigns, 'active', null).map((campaign) => campaign.id)).toEqual([
      'sol-usdc-growth',
    ]);
    expect(filterMockCampaigns(mockCampaigns, 'eligible', 'evm').map((campaign) => campaign.id)).toEqual([
      'eth-usdc-depth',
      'cross-chain-stable',
    ]);
    expect(filterMockCampaigns(mockCampaigns, 'eligible', 'evm', true, true)).toEqual([]);
    expect(filterMockCampaigns(mockCampaigns, 'eligible', 'evm', false, false)).toEqual([]);
    expect(filterMockCampaigns(mockCampaigns, 'eligible', null, false, false)).toEqual([]);
  });

  it('derives namespace-specific campaign eligibility and unsupported-chain guards', () => {
    const evmOnlyCampaign = mockCampaigns.find((campaign) => campaign.id === 'eth-usdc-depth');
    const solanaOnlyCampaign = mockCampaigns.find((campaign) => campaign.id === 'sol-usdc-growth');

    expect(evmOnlyCampaign).toBeDefined();
    expect(solanaOnlyCampaign).toBeDefined();
    if (!evmOnlyCampaign || !solanaOnlyCampaign) return;

    expect(campaignSupportsNamespace(evmOnlyCampaign, 'evm')).toBe(true);
    expect(campaignSupportsNamespace(evmOnlyCampaign, 'solana')).toBe(false);

    expect(campaignEligibility(evmOnlyCampaign, 'evm', true, false)).toMatchObject({
      state: 'namespace-supported',
      canParticipate: true,
      label: 'EVM eligible',
    });
    expect(campaignEligibility(solanaOnlyCampaign, 'evm', true, false)).toMatchObject({
      state: 'namespace-unsupported',
      canParticipate: false,
      label: 'EVM not supported',
    });
    expect(campaignEligibility(evmOnlyCampaign, 'evm', false, true)).toMatchObject({
      state: 'unsupported-chain',
      canParticipate: false,
      label: 'Unsupported chain',
    });
    expect(campaignEligibility(evmOnlyCampaign, null, false, false)).toMatchObject({
      state: 'connect-wallet',
      canParticipate: false,
      label: 'Connect wallet',
    });
  });

  it('aggregates account activity in deterministic newest-first timestamp order', () => {
    const activity = aggregateMockActivityEntries(
      mockAccountActivityForAccount('evm-primary', 'evm'),
      [
        {
          id: 'activity-test-deposit',
          accountId: 'evm-primary',
          namespace: 'evm',
          category: 'funding',
          label: 'Deposit',
          detail: 'USDC · EVM · credited · 2026-05-23 09:15',
          href: '/deposit',
          timestamp: '2026-05-23 09:15',
        },
      ]
    );

    expect(activity.map((entry) => entry.id)).toEqual([
      'activity-evm-order',
      'activity-test-deposit',
      'activity-evm-campaign',
      'activity-evm-funding',
    ]);
  });

  it('maps connected wallet namespaces and networks to deterministic demo accounts', () => {
    expect(deterministicAccountForWallet('evm', 1)?.id).toBe('evm-primary');
    expect(deterministicAccountForWallet('evm', '11155111')?.id).toBe('evm-secondary');
    expect(deterministicAccountForWallet('solana', null)?.id).toBe('solana-primary');
    expect(deterministicAccountForWallet('evm', 137)?.id).toBe('unsupported-polygon');
    expect(deterministicAccountForWallet(null, null)).toBeNull();

    expect(isSupportedDemoWallet('evm', 1)).toBe(true);
    expect(isSupportedDemoWallet('evm', 11155111)).toBe(true);
    expect(isSupportedDemoWallet('solana', null)).toBe(true);
    expect(isSupportedDemoWallet('evm', 137)).toBe(false);
  });
});
