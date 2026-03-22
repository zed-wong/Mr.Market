import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ExchangeOrderMapping } from '../../../../src/common/entities/market-making/exchange-order-mapping.entity';
import { ExchangeOrderMappingService } from '../../../../src/modules/market-making/execution/exchange-order-mapping.service';
import { FillRoutingService } from '../../../../src/modules/market-making/execution/fill-routing.service';
import {
  buildSandboxClientOrderId,
  SandboxExchangeHelper,
} from '../../helpers/sandbox-exchange.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../helpers/system-test-log.helper';
import { getSystemSandboxSkipReason } from '../../helpers/sandbox-system.helper';

const skipReason = getSystemSandboxSkipReason();
const log = createSystemTestLogger('sandbox-fill-resolution');

if (skipReason) {
  logSystemSkip('sandbox fill resolution suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Sandbox fill resolution (system)', () => {
  jest.setTimeout(240000);

  let helper: SandboxExchangeHelper;
  let moduleRef: TestingModule;
  let fillRoutingService: FillRoutingService;
  let exchangeOrderMappingService: ExchangeOrderMappingService;

  beforeAll(async () => {
    log.suite('initializing sandbox exchange');
    helper = new SandboxExchangeHelper();
    await helper.init();
    const config = helper.getConfig();

    log.result('sandbox exchange ready', {
      exchangeId: config.exchangeId,
      symbol: config.symbol,
    });

    log.suite('setting up in-memory sqlite');
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [ExchangeOrderMapping],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([ExchangeOrderMapping]),
      ],
      providers: [ExchangeOrderMappingService, FillRoutingService],
    }).compile();

    fillRoutingService = moduleRef.get(FillRoutingService);
    exchangeOrderMappingService = moduleRef.get(ExchangeOrderMappingService);
    log.suite('fill routing service ready');
  });

  afterAll(async () => {
    log.suite('cleaning up');
    await helper?.close();
    await moduleRef?.close();
    log.suite('done');
  });

  it('resolves a parseable local client order id directly', async () => {
    log.step('resolving parseable clientOrderId directly');
    const clientOrderId = 'order-123:0';

    const result = await fillRoutingService.resolveOrderForFill({
      clientOrderId,
    });

    log.result('direct resolution result', {
      clientOrderId,
      orderId: result.orderId,
      source: result.source,
    });
    expect(result).toEqual({
      orderId: 'order-123',
      seq: 0,
      source: 'clientOrderId',
    });
  });

  it('falls back to repository-backed client order mappings', async () => {
    log.step('creating repository-backed client order mapping');
    const legacyClientOrderId = `legacy-client-${Date.now()}`;

    await exchangeOrderMappingService.createMapping({
      orderId: 'legacy-order',
      exchangeOrderId: `legacy-exchange-${Date.now()}`,
      clientOrderId: legacyClientOrderId,
    });
    log.check('mapping stored', {
      clientOrderId: legacyClientOrderId,
      orderId: 'legacy-order',
    });

    const result = await fillRoutingService.resolveOrderForFill({
      clientOrderId: legacyClientOrderId,
    });

    log.result('mapping fallback result', {
      clientOrderId: legacyClientOrderId,
      orderId: result.orderId,
      source: result.source,
    });
    expect(result).toEqual({
      orderId: 'legacy-order',
      source: 'mapping',
    });
  });

  it('falls back to exchange order mappings backed by a real sandbox exchange order id', async () => {
    log.step('placing real sandbox order for exchange-order fallback');

    const clientOrderId = buildSandboxClientOrderId('fill-routing');

    const createdOrder = await helper.placeSafeCleanupAwareLimitOrder({
      side: 'sell',
      clientOrderId,
    });

    log.result('sandbox order created', {
      clientOrderId,
      exchangeOrderId: createdOrder.id,
      price: createdOrder.price,
    });

    const mappingClientOrderId = `exchange-fallback-${Date.now()}`;

    await exchangeOrderMappingService.createMapping({
      orderId: 'mapped-by-exchange-order',
      exchangeOrderId: String(createdOrder.id),
      clientOrderId: mappingClientOrderId,
    });
    log.check('exchange-order mapping stored', {
      exchangeOrderId: createdOrder.id,
      orderId: 'mapped-by-exchange-order',
    });

    const result = await fillRoutingService.resolveOrderForFill({
      exchangeOrderId: String(createdOrder.id),
    });

    log.result('exchange-order fallback result', {
      exchangeOrderId: createdOrder.id,
      orderId: result.orderId,
      source: result.source,
    });
    expect(result).toEqual({
      orderId: 'mapped-by-exchange-order',
      source: 'exchangeOrderMapping',
    });
  });
});
