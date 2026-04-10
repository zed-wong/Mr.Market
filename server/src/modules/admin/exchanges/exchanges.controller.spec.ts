import { AdminExchangesController } from './exchanges.controller';

describe('AdminExchangesController', () => {
  it('passes exchange_index through without fallback', async () => {
    const exchangeService = {
      addApiKey: jest.fn().mockImplementation(async (payload) => payload),
    };
    const controller = new AdminExchangesController(exchangeService as any);

    const payload = {
      exchange: 'binance',
      exchange_index: 'desk-1',
      name: 'default',
      api_key: 'api-key',
      api_secret: 'api-secret',
    };

    await expect(controller.addAPIKey(payload as any)).resolves.toEqual(payload);
    expect(exchangeService.addApiKey).toHaveBeenCalledWith(payload);
  });
});
