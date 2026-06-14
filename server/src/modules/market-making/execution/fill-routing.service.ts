import { Injectable } from '@nestjs/common';

import { parseClientOrderId } from '../../../common/helpers/client-order-id';
import { resolveLedgerOrderScope } from '../../../common/helpers/ledger-order-scope';
import { ExchangeOrderMappingService } from './exchange-order-mapping.service';

export type FillRouteResolution =
  | {
      ledgerOrderId: string;
      userOrderId: string;
      accountLabel: string;
      seq: number;
      source: 'clientOrderId';
    }
  | {
      ledgerOrderId: string;
      userOrderId: string;
      accountLabel: string;
      source: 'mapping';
    }
  | {
      ledgerOrderId: string;
      userOrderId: string;
      accountLabel: string;
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
      const scope = resolveLedgerOrderScope({ ledgerOrderId: parsed.orderId });

      return {
        ledgerOrderId: scope.ledgerOrderId,
        userOrderId: scope.userOrderId,
        accountLabel: scope.accountLabel,
        seq: parsed.seq,
        source: 'clientOrderId',
      };
    }

    const mapping = await this.exchangeOrderMappingService.findByClientOrderId(
      clientOrderId,
    );

    if (mapping) {
      const scope = resolveLedgerOrderScope({
        ledgerOrderId: mapping.orderId,
        userOrderId: mapping.userOrderId,
        accountLabel: mapping.accountLabel,
      });

      return {
        ledgerOrderId: scope.ledgerOrderId,
        userOrderId: scope.userOrderId,
        accountLabel: scope.accountLabel,
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

    const scope = resolveLedgerOrderScope({
      ledgerOrderId: mapping.orderId,
      userOrderId: mapping.userOrderId,
      accountLabel: mapping.accountLabel,
    });

    return {
      ledgerOrderId: scope.ledgerOrderId,
      userOrderId: scope.userOrderId,
      accountLabel: scope.accountLabel,
      source: 'exchangeOrderMapping',
    };
  }
}
