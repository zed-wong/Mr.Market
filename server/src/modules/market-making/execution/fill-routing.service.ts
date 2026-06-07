import { Injectable } from '@nestjs/common';

import { parseClientOrderId } from '../../../common/helpers/client-order-id';
import { ExchangeOrderMappingService } from './exchange-order-mapping.service';

export type FillRouteResolution =
  | {
      orderId: string;
      seq: number;
      source: 'clientOrderId';
    }
  | {
      orderId: string;
      source: 'mapping';
    }
  | {
      orderId: string;
      source: 'exchangeOrderMapping';
    };

@Injectable()
export class FillRoutingService {
  constructor(
    private readonly exchangeOrderMappingService: ExchangeOrderMappingService,
  ) {}

  async resolveOrderFromClientOrderId(
    clientOrderId?: string | null,
  ): Promise<FillRouteResolution | null> {
    return await this.resolveOrderForFill({ clientOrderId });
  }

  async resolveOrderForFill(params: {
    clientOrderId?: string | null;
    exchangeOrderId?: string | null;
  }): Promise<FillRouteResolution | null> {
    const clientOrderId = params.clientOrderId || undefined;

    if (!clientOrderId) {
      return await this.resolveOrderFromExchangeOrderId(params.exchangeOrderId);
    }

    const parsed = parseClientOrderId(clientOrderId);

    if (parsed) {
      return {
        orderId: parsed.orderId,
        seq: parsed.seq,
        source: 'clientOrderId',
      };
    }

    const mapping = await this.exchangeOrderMappingService.findByClientOrderId(
      clientOrderId,
    );

    if (mapping) {
      return {
        orderId: mapping.orderId,
        source: 'mapping',
      };
    }

    return await this.resolveOrderFromExchangeOrderId(params.exchangeOrderId);
  }

  private async resolveOrderFromExchangeOrderId(
    exchangeOrderId?: string | null,
  ): Promise<FillRouteResolution | null> {
    if (!exchangeOrderId) {
      return null;
    }

    const mapping =
      await this.exchangeOrderMappingService.findByExchangeOrderId(
        exchangeOrderId,
      );

    if (!mapping) {
      return null;
    }

    return {
      orderId: mapping.orderId,
      source: 'exchangeOrderMapping',
    };
  }
}
