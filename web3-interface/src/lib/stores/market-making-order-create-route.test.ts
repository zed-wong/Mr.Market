import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createFlowSteps,
  getCreateStepPanelState,
  isCreateStepPanelHidden,
  type CreateFlowStep,
} from '../helpers/market-making/create-step-panels';

const routeSource = () =>
  readFileSync(
    fileURLToPath(new URL('../../routes/app/market-making/order/new/+page.svelte', import.meta.url)),
    'utf8'
  );

describe('/app/market-making/order/new pure market-making route', () => {
  it('exposes exactly the pair, funds, and review create steps', () => {
    const source = routeSource();

    expect(createFlowSteps.map((step) => step.key)).toEqual(['pair', 'funds', 'review']);
    expect(source).toContain("data-testid=\"order-create-step-{step.key}\"");
    expect(source).toContain("data-strategy=\"pure_market_making\"");
  });

  it('derives mutually exclusive panel visibility for pair to funds to review progression', () => {
    const progression: CreateFlowStep[] = ['pair', 'funds', 'review'];

    for (const activeStep of progression) {
      const panelState = getCreateStepPanelState(activeStep);
      const visiblePanels = Object.values(panelState)
        .filter((panel) => !panel.hidden)
        .map((panel) => panel.key);

      expect(visiblePanels).toEqual([activeStep]);
      expect(panelState[activeStep].panelTestId).toBe(`order-${activeStep}-panel`);
    }

    expect(isCreateStepPanelHidden('funds', 'pair')).toBe(true);
    expect(isCreateStepPanelHidden('funds', 'funds')).toBe(false);
    expect(isCreateStepPanelHidden('review', 'funds')).toBe(true);
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

  it('wires step progression buttons through Svelte event handlers', () => {
    const source = routeSource();

    expect(source).toContain('attachButtonClick');
    expect(source).toContain('data-testid="order-pair-next-button"');
    expect(source).toContain('bind:this={pairNextButton}');
    expect(source).toContain('$effect(() => attachButtonClick(pairNextButton, showFundsStep))');
    expect(source).toContain('hidden={isCreateStepPanelHidden(activeStep, \'pair\')}');
    expect(source).toContain('hidden={isCreateStepPanelHidden(activeStep, \'funds\')}');
    expect(source).toContain('hidden={isCreateStepPanelHidden(activeStep, \'review\')}');
    expect(source).not.toContain('class:hidden={activeStep');
    expect(source).toContain('data-testid="order-review-button"');
    expect(source).toContain('bind:this={reviewButton}');
    expect(source).toContain('$effect(() => attachButtonClick(reviewButton, () => void reviewOrder()))');
    expect(source).not.toContain('use:clickAction');
  });
});
