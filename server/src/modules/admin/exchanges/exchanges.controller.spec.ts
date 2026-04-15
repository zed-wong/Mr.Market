import { AdminExchangesController } from './exchanges.controller';

describe('AdminExchangesController', () => {
  it('passes add-api-key payloads through without exchange_index fallback', async () => {
    const exchangeService = {
      addApiKey: jest.fn().mockImplementation(async (payload) => payload),
    };
    const controller = new AdminExchangesController(exchangeService as any);

    const payload = {
      exchange: 'binance',
      name: 'desk-1',
      api_key: 'api-key',
      api_secret: 'api-secret',
    };

    await expect(controller.addAPIKey(payload as any)).resolves.toEqual(
      payload,
    );
    expect(exchangeService.addApiKey).toHaveBeenCalledWith(payload);
  });
});
