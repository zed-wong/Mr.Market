import { RebalanceService } from './rebalance.service';

jest.mock('src/modules/infrastructure/logger/logger.service');

describe('RebalanceService', () => {
  it('constructs with required dependencies', () => {
    const service = new RebalanceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(service).toBeInstanceOf(RebalanceService);
  });
});
