import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  buildSandboxClientOrderId,
  getSandboxIntegrationSkipReason,
  SandboxExchangeHelper,
} from '../../../../test/helpers/sandbox-exchange.helper';
import { ExchangeOrderMapping } from '../../../common/entities/market-making/exchange-order-mapping.entity';
import { ExchangeOrderMappingService } from './exchange-order-mapping.service';
import { FillRoutingService } from './fill-routing.service';

const skipReason = getSandboxIntegrationSkipReason();

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(
    `[system] Skipping sandbox fill resolution suite: ${skipReason}`,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

const LOG_PREFIX = '|';
// eslint-disable-next-line no-console
const log = (msg: string) => console.log(`  ${LOG_PREFIX} ${msg}`);

describeSandbox('Sandbox fill resolution (system)', () => {
  jest.setTimeout(240000);

  let helper: SandboxExchangeHelper;
  let moduleRef: TestingModule;
  let fillRoutingService: FillRoutingService;
  let exchangeOrderMappingService: ExchangeOrderMappingService;

  beforeAll(async () => {
    log('Initializing sandbox exchange...');
    helper = new SandboxExchangeHelper();
    await helper.init();
    const config = helper.getConfig();

    log(`${config.exchangeId} ready, symbol=${config.symbol}`);

    log('Setting up in-memory SQLite...');
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
    log('FillRoutingService ready');
  });

  afterAll(async () => {
    log('Cleaning up...');
    await helper?.close();
    await moduleRef?.close();
    log('Done\n');
  });

  it('resolves a parseable local client order id directly', async () => {
    log('Test 1: Direct clientOrderId parsing (no DB)');
    const clientOrderId = 'order-123:0';

    const result = await fillRoutingService.resolveOrderForFill({
      clientOrderId,
    });

    log(
      `   "${clientOrderId}" -> orderId="${result.orderId}", source=${result.source}`,
    );
    expect(result).toEqual({
      orderId: 'order-123',
      seq: 0,
      source: 'clientOrderId',
    });
  });

  it('falls back to repository-backed client order mappings', async () => {
    log('Test 2: DB-backed mapping fallback');
    const legacyClientOrderId = `legacy-client-${Date.now()}`;

    await exchangeOrderMappingService.createMapping({
      orderId: 'legacy-order',
      exchangeOrderId: `legacy-exchange-${Date.now()}`,
      clientOrderId: legacyClientOrderId,
    });
    log(`   Created mapping: "${legacyClientOrderId}" -> "legacy-order"`);

    const result = await fillRoutingService.resolveOrderForFill({
      clientOrderId: legacyClientOrderId,
    });

    log(`   Resolved -> orderId="${result.orderId}", source=${result.source}`);
    expect(result).toEqual({
      orderId: 'legacy-order',
      source: 'mapping',
    });
  });

  it('falls back to exchange order mappings backed by a real sandbox exchange order id', async () => {
    log('Test 3: Exchange order ID mapping (real sandbox order)');

    const clientOrderId = buildSandboxClientOrderId('fill-routing');

    log(`   Placing sell order: clientOrderId="${clientOrderId}"...`);
    const createdOrder = await helper.placeSafeCleanupAwareLimitOrder({
      side: 'sell',
      clientOrderId,
    });

    log(`   Order created: id=${createdOrder.id}, price=${createdOrder.price}`);

    const mappingClientOrderId = `exchange-fallback-${Date.now()}`;

    await exchangeOrderMappingService.createMapping({
      orderId: 'mapped-by-exchange-order',
      exchangeOrderId: String(createdOrder.id),
      clientOrderId: mappingClientOrderId,
    });
    log(
      `   Created mapping: exchangeId="${createdOrder.id}" -> "mapped-by-exchange-order"`,
    );

    const result = await fillRoutingService.resolveOrderForFill({
      exchangeOrderId: String(createdOrder.id),
    });

    log(`   Resolved -> orderId="${result.orderId}", source=${result.source}`);
    expect(result).toEqual({
      orderId: 'mapped-by-exchange-order',
      source: 'exchangeOrderMapping',
    });
  });
});
