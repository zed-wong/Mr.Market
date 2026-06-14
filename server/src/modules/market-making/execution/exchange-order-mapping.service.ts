import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { resolveLedgerOrderScope } from 'src/common/helpers/ledger-order-scope';
import { Repository } from 'typeorm';

@Injectable()
export class ExchangeOrderMappingService {
  constructor(
    @InjectRepository(ExchangeOrderMapping)
    private readonly exchangeOrderMappingRepository: Repository<ExchangeOrderMapping>,
  ) {}

  async countMappingsForOrder(orderId: string): Promise<number> {
    return await this.exchangeOrderMappingRepository.countBy({ orderId });
  }

  async reserveMapping(params: {
    orderId: string;
    userOrderId?: string;
    accountLabel?: string;
    exchange?: string;
    clientOrderId: string;
  }): Promise<ExchangeOrderMapping> {
    const existing = await this.exchangeOrderMappingRepository.findOneBy({
      clientOrderId: params.clientOrderId,
    });

    if (existing) {
      return existing;
    }
    const scope = resolveLedgerOrderScope({
      ledgerOrderId: params.orderId,
      userOrderId: params.userOrderId,
      accountLabel: params.accountLabel,
    });

    return await this.exchangeOrderMappingRepository.save(
      this.exchangeOrderMappingRepository.create({
        orderId: scope.ledgerOrderId,
        userOrderId: scope.userOrderId,
        accountLabel: scope.accountLabel,
        exchange: params.exchange || '',
        exchangeOrderId: null,
        clientOrderId: params.clientOrderId,
      }),
    );
  }

  async createMapping(params: {
    orderId: string;
    userOrderId?: string;
    accountLabel?: string;
    exchange?: string;
    exchangeOrderId: string;
    clientOrderId: string;
  }): Promise<ExchangeOrderMapping> {
    const existing = await this.exchangeOrderMappingRepository.findOneBy({
      clientOrderId: params.clientOrderId,
    });

    if (existing?.exchangeOrderId === params.exchangeOrderId) {
      return existing;
    }
    const scope = resolveLedgerOrderScope({
      ledgerOrderId: params.orderId,
      userOrderId: params.userOrderId,
      accountLabel: params.accountLabel,
    });

    if (existing) {
      return await this.exchangeOrderMappingRepository.save(
        this.exchangeOrderMappingRepository.create({
          ...existing,
          orderId: scope.ledgerOrderId,
          userOrderId: scope.userOrderId,
          accountLabel: scope.accountLabel,
          exchange: params.exchange || existing.exchange || '',
          exchangeOrderId: params.exchangeOrderId,
        }),
      );
    }

    return await this.exchangeOrderMappingRepository.save(
      this.exchangeOrderMappingRepository.create({
        orderId: scope.ledgerOrderId,
        userOrderId: scope.userOrderId,
        accountLabel: scope.accountLabel,
        exchange: params.exchange || '',
        exchangeOrderId: params.exchangeOrderId,
        clientOrderId: params.clientOrderId,
      }),
    );
  }

  async findByClientOrderId(
    clientOrderId: string,
  ): Promise<ExchangeOrderMapping | null> {
    return await this.exchangeOrderMappingRepository.findOneBy({
      clientOrderId,
    });
  }

  async findByExchangeOrderId(
    exchangeOrderId: string,
  ): Promise<ExchangeOrderMapping | null> {
    return await this.exchangeOrderMappingRepository.findOneBy({
      exchangeOrderId,
    });
  }
}
