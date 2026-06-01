import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/app/market-making/order/new/+page.svelte', import.meta.url)),
    'utf8'
  );

describe('/app/market-making/order/new pure market-making route', () => {
  it('exposes exactly the pair, funds, and review create steps', () => {
    const source = routeSource();

    expect(source).toContain("type CreateFlowStep = 'pair' | 'funds' | 'review'");
    expect(source).toContain("data-testid=\"order-create-step-{step.key}\"");
    expect(source).toContain("data-strategy=\"pure_market_making\"");
  });

  it('hides normal-user strategy choice and filters to pure market making', () => {
    const source = routeSource();

    expect(source).toContain('isPureMarketMakingStrategy');
    expect(source).toContain("const PURE_MARKET_MAKING_KEY = 'pure_market_making'");
    expect(source).not.toContain('data-testid=\"order-strategy-select\"');
    expect(source).not.toContain('Wallet interaction preview');
    expect(source).not.toContain('Choose a strategy');
  });

  it('requires SIWE scope and wallet approval before the create API call', () => {
    const source = routeSource();
    const approvalIndex = source.indexOf('signWalletMessage(approvalMessage)');
    const createIndex = source.indexOf('createMarketMakingOrder({');

    expect(source).toContain('signInWithEthereum');
    expect(source).toContain('hasAuthenticatedOrderScope');
    expect(approvalIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(approvalIndex);
    expect(source).toContain('strategyDefinitionId: selectedPureStrategy.id');
  });
});
