import { Injectable } from '@nestjs/common';

import { UserStreamEventNormalizer } from './user-stream-event-normalizer.interface';
import { BinanceUserStreamEventNormalizerService } from './normalizers/binance-user-stream-event-normalizer.service';
import { GenericCcxtUserStreamEventNormalizerService } from './normalizers/generic-ccxt-user-stream-event-normalizer.service';
import { MexcUserStreamEventNormalizerService } from './normalizers/mexc-user-stream-event-normalizer.service';

@Injectable()
export class UserStreamNormalizerRegistryService {
  constructor(
    private readonly genericNormalizer: GenericCcxtUserStreamEventNormalizerService,
    private readonly binanceNormalizer: BinanceUserStreamEventNormalizerService,
    private readonly mexcNormalizer: MexcUserStreamEventNormalizerService,
  ) {}

  getNormalizer(exchange: string): UserStreamEventNormalizer {
    const normalized = String(exchange || '').trim().toLowerCase();

    if (normalized === 'binance') {
      return this.binanceNormalizer;
    }

    if (normalized === 'mexc') {
      return this.mexcNormalizer;
    }

    return this.genericNormalizer;
  }
}
