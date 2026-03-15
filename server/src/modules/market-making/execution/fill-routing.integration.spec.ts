import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  getSandboxIntegrationSkipReason,
  SandboxExchangeHelper,
} from '../../../../test/helpers/sandbox-exchange.helper';
import { ExchangeOrderMapping } from '../../../common/entities/market-making/exchange-order-mapping.entity';
import { buildClientOrderId } from '../../../common/helpers/client-order-id';
import { ExchangeOrderMappingService } from './exchange-order-mapping.service';
import { FillRoutingService } from './fill-routing.service';

const skipReason = getSandboxIntegrationSkipReason();

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(
    `[integration] Skipping FillRoutingService sandbox suite: ${skipReason}`,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('FillRoutingService (integration)', () => {
  jest.setTimeout(240000);

  let helper: SandboxExchangeHelper;
  let moduleRef: TestingModule;
  let fillRoutingService: FillRoutingService;
  let exchangeOrderMappingService: ExchangeOrderMappingService;

  beforeAll(async () => {
    helper = new SandboxExchangeHelper();
    await helper.init();

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
  });

  afterAll(async () => {
    await helper?.close();
    await moduleRef?.close();
  });

  it('resolves a parseable client order id directly', async () => {
    await expect(
      fillRoutingService.resolveOrderForFill({
        clientOrderId: 'order-123:0',
      }),
    ).resolves.toEqual({
      orderId: 'order-123',
      seq: 0,
      source: 'clientOrderId',
    });
  });

  it('falls back to repository-backed client order mappings', async () => {
    const legacyClientOrderId = `legacy-client-${Date.now()}`;

    await exchangeOrderMappingService.createMapping({
      orderId: 'legacy-order',
      exchangeOrderId: `legacy-exchange-${Date.now()}`,
      clientOrderId: legacyClientOrderId,
    });

    await expect(
      fillRoutingService.resolveOrderForFill({
        clientOrderId: legacyClientOrderId,
      }),
    ).resolves.toEqual({
      orderId: 'legacy-order',
      source: 'mapping',
    });
  });

  it('falls back to exchange order mappings backed by a real sandbox order id', async () => {
    const createdOrder = await helper.placeSafeCleanupAwareLimitOrder({
      side: 'sell',
      clientOrderId: buildClientOrderId(`fill-routing-${Date.now()}`, 0),
    });

    await exchangeOrderMappingService.createMapping({
      orderId: 'mapped-by-exchange-order',
      exchangeOrderId: String(createdOrder.id),
      clientOrderId: `exchange-fallback-${Date.now()}`,
    });

    await expect(
      fillRoutingService.resolveOrderForFill({
        exchangeOrderId: String(createdOrder.id),
      }),
    ).resolves.toEqual({
      orderId: 'mapped-by-exchange-order',
      source: 'exchangeOrderMapping',
    });
  });
});
