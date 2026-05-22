import { describe, expect, it } from 'vitest';
import {
  campaignEligibility,
  campaignSupportsNamespace,
  filterMockCampaigns,
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
    expect(filterMockCampaigns(mockCampaigns, 'eligible', null)).toEqual([]);
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
});
