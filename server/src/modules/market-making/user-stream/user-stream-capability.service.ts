import { Injectable } from '@nestjs/common';

import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';

export type UserStreamCapabilityTier = 'full' | 'partial' | 'rest_only';

@Injectable()
export class UserStreamCapabilityService {
  constructor(private readonly exchangeInitService: ExchangeInitService) {}

  getCapabilities(
    exchangeName: string,
    accountLabel?: string,
  ): {
    watchOrders: boolean;
    watchMyTrades: boolean;
    watchBalance: boolean;
    tier: UserStreamCapabilityTier;
  } {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    ) as unknown as Record<string, unknown>;
    const watchOrders = typeof exchange?.watchOrders === 'function';
    const watchMyTrades = typeof exchange?.watchMyTrades === 'function';
    const watchBalance = typeof exchange?.watchBalance === 'function';
    const tier: UserStreamCapabilityTier =
      watchOrders && watchMyTrades && watchBalance
        ? 'full'
        : watchOrders
        ? 'partial'
        : 'rest_only';

    return {
      watchOrders,
      watchMyTrades,
      watchBalance,
      tier,
    };
  }
}
