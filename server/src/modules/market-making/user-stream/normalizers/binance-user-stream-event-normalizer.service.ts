import { Injectable } from '@nestjs/common';

import { GenericCcxtUserStreamEventNormalizerService } from './generic-ccxt-user-stream-event-normalizer.service';

@Injectable()
export class BinanceUserStreamEventNormalizerService extends GenericCcxtUserStreamEventNormalizerService {}
