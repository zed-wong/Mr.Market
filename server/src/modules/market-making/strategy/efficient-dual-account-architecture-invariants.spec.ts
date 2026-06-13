import { readFileSync } from 'fs';
import { join } from 'path';

describe('Efficient Dual Account Volume architecture invariants', () => {
  const readSource = (relativePath: string): string =>
    readFileSync(join(process.cwd(), 'src', relativePath), 'utf8');

  const controllerPaths = [
    'modules/market-making/strategy/controllers/arbitrage-strategy.controller.ts',
    'modules/market-making/strategy/controllers/pure-market-making-strategy.controller.ts',
    'modules/market-making/strategy/controllers/volume-strategy.controller.ts',
    'modules/market-making/strategy/controllers/efficient-dual-account-volume-strategy.controller.ts',
    'modules/market-making/strategy/controllers/dual-account-volume-strategy.controller.ts',
    'modules/market-making/strategy/controllers/dual-account-best-capacity-volume-strategy.controller.ts',
    'modules/market-making/strategy/controllers/time-indicator-strategy.controller.ts',
  ];
  const forbiddenControllerIo = [
    'placeLimitOrder',
    'cancelOrder',
    'fetchBalance',
    'fetchOrderBook',
    'fetchOrder(',
    'fetchOrderByClientOrderId',
    'loadTradingRules',
  ];

  it('keeps strategy controllers free of balance and exchange mutations', () => {
    const controllerSources = controllerPaths.map(readSource);
    const forbiddenControllerCalls = [
      'creditDeposit',
      'lockFunds',
      'unlockFunds',
      'reserveForLimitOrder',
      'releaseLimitOrderReservation',
      'balanceLedgerService.adjust',
    ];

    for (const source of controllerSources) {
      expect(source).not.toContain('TrackedOrderShutdownService');
      expect(source).not.toContain('trackedOrderShutdownService');
      expect(source).not.toContain('stopStrategyForUser');

      for (const forbiddenCall of [
        ...forbiddenControllerIo,
        ...forbiddenControllerCalls,
      ]) {
        expect(source).not.toContain(forbiddenCall);
      }
    }

    expect(
      readSource(
        'modules/market-making/strategy/config/strategy-controller.types.ts',
      ),
    ).not.toContain('stopStrategyForUser');
  });

  it('keeps direct exchange reads out of dual-account tick planning', () => {
    const plannerSource = readSource(
      'modules/market-making/strategy/dual-account/dual-account-planner.service.ts',
    );
    const actionPlanningSource =
      plannerSource.split('async evaluateEfficientDualAccountReadiness')[0] +
      plannerSource.split('async buildDualAccountVolumeActions')[1];

    for (const forbiddenCall of forbiddenControllerIo) {
      expect(actionPlanningSource).not.toContain(forbiddenCall);
    }
  });

  it('keeps generic ledger adjustment confined to typed fill settlement', () => {
    const strategySources = [
      'modules/market-making/strategy/controllers/efficient-dual-account-volume-strategy.controller.ts',
      'modules/market-making/strategy/controllers/dual-account-volume-strategy.controller.ts',
      'modules/market-making/strategy/dual-account/dual-account-planner.service.ts',
      'modules/market-making/strategy/execution/strategy-intent-execution.service.ts',
      'modules/market-making/strategy/execution/strategy-intent-worker.service.ts',
    ].map(readSource);

    for (const source of strategySources) {
      expect(source).not.toContain('.adjust(');
      expect(source).not.toContain('balanceLedgerService.adjust');
    }

    expect(
      readSource(
        'modules/market-making/strategy/settlement/fill-settlement.service.ts',
      ),
    ).toContain('balanceLedgerService.adjust');
  });

  it('keeps risk checks, reservations, and exchange mutation in intent execution', () => {
    const workerSource = readSource(
      'modules/market-making/strategy/execution/strategy-intent-worker.service.ts',
    );
    const executionSource = readSource(
      'modules/market-making/strategy/execution/strategy-intent-execution.service.ts',
    );

    expect(workerSource).not.toContain('OrderReservationService');
    expect(workerSource).not.toContain('ExchangeConnectorAdapterService');
    expect(workerSource).not.toContain('reserveForLimitOrder');
    expect(workerSource).not.toContain('placeLimitOrder');

    const riskIndex = executionSource.indexOf(
      'await this.assertCreateLimitOrderRisk(intent, orderId)',
    );
    const reservationIndex = executionSource.indexOf(
      'this.orderReservationService.reserveForLimitOrder',
    );
    const exchangeMutationIndex = executionSource.indexOf(
      'this.exchangeConnectorAdapterService.placeLimitOrder',
    );

    expect(riskIndex).toBeGreaterThanOrEqual(0);
    expect(reservationIndex).toBeGreaterThan(riskIndex);
    expect(exchangeMutationIndex).toBeGreaterThan(reservationIndex);
  });
});
