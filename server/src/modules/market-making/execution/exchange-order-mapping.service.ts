import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
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
    clientOrderId: string;
  }): Promise<ExchangeOrderMapping> {
    const existing = await this.exchangeOrderMappingRepository.findOneBy({
      clientOrderId: params.clientOrderId,
    });

    if (existing) {
      return existing;
    }

    return await this.exchangeOrderMappingRepository.save(
      this.exchangeOrderMappingRepository.create({
        orderId: params.orderId,
        exchangeOrderId: null,
        clientOrderId: params.clientOrderId,
      }),
    );
  }

  async createMapping(params: {
    orderId: string;
    exchangeOrderId: string;
    clientOrderId: string;
  }): Promise<ExchangeOrderMapping> {
    const existing = await this.exchangeOrderMappingRepository.findOneBy({
      clientOrderId: params.clientOrderId,
    });

    if (existing?.exchangeOrderId === params.exchangeOrderId) {
      return existing;
    }

    if (existing) {
      return await this.exchangeOrderMappingRepository.save(
        this.exchangeOrderMappingRepository.create({
          ...existing,
          orderId: params.orderId,
          exchangeOrderId: params.exchangeOrderId,
        }),
      );
    }

    return await this.exchangeOrderMappingRepository.save(
      this.exchangeOrderMappingRepository.create(params),
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
