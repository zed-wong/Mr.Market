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
    exchangeName?: string | null;
    exchangeClientOrderId?: string | null;
  }): Promise<ExchangeOrderMapping> {
    const existing = await this.exchangeOrderMappingRepository.findOneBy({
      clientOrderId: params.clientOrderId,
    });

    if (existing) {
      return await this.saveWithUpdatedContext(existing, params);
    }

    return await this.exchangeOrderMappingRepository.save(
      this.exchangeOrderMappingRepository.create({
        orderId: params.orderId,
        exchangeOrderId: null,
        clientOrderId: params.clientOrderId,
        ...this.buildContext(params),
      }),
    );
  }

  async createMapping(params: {
    orderId: string;
    exchangeOrderId: string;
    clientOrderId: string;
    exchangeName?: string | null;
    exchangeClientOrderId?: string | null;
  }): Promise<ExchangeOrderMapping> {
    const existing = await this.exchangeOrderMappingRepository.findOneBy({
      clientOrderId: params.clientOrderId,
    });

    if (
      existing?.exchangeOrderId === params.exchangeOrderId &&
      !this.hasContextChange(existing, params)
    ) {
      return existing;
    }

    if (existing) {
      return await this.exchangeOrderMappingRepository.save(
        this.exchangeOrderMappingRepository.create({
          ...existing,
          orderId: params.orderId,
          exchangeOrderId: params.exchangeOrderId,
          ...this.buildContext(params),
        }),
      );
    }

    return await this.exchangeOrderMappingRepository.save(
      this.exchangeOrderMappingRepository.create({
        orderId: params.orderId,
        exchangeOrderId: params.exchangeOrderId,
        clientOrderId: params.clientOrderId,
        ...this.buildContext(params),
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

  async findByExchangeClientOrderId(
    exchangeClientOrderId: string,
  ): Promise<ExchangeOrderMapping | null> {
    return await this.exchangeOrderMappingRepository.findOneBy({
      exchangeClientOrderId,
    });
  }

  private async saveWithUpdatedContext(
    existing: ExchangeOrderMapping,
    params: {
      orderId: string;
      exchangeName?: string | null;
      exchangeClientOrderId?: string | null;
    },
  ): Promise<ExchangeOrderMapping> {
    if (!this.hasContextChange(existing, params)) {
      return existing;
    }

    return await this.exchangeOrderMappingRepository.save(
      this.exchangeOrderMappingRepository.create({
        ...existing,
        orderId: params.orderId,
        ...this.buildContext(params),
      }),
    );
  }

  private hasContextChange(
    existing: ExchangeOrderMapping,
    params: {
      exchangeName?: string | null;
      exchangeClientOrderId?: string | null;
    },
  ): boolean {
    const context = this.buildContext(params);

    return (
      ('exchangeName' in context &&
        existing.exchangeName !== context.exchangeName) ||
      ('exchangeClientOrderId' in context &&
        existing.exchangeClientOrderId !== context.exchangeClientOrderId)
    );
  }

  private buildContext(params: {
    exchangeName?: string | null;
    exchangeClientOrderId?: string | null;
  }): Partial<ExchangeOrderMapping> {
    const context: Partial<ExchangeOrderMapping> = {};
    const exchangeName = this.normalizeNullableString(params.exchangeName);
    const exchangeClientOrderId = this.normalizeNullableString(
      params.exchangeClientOrderId,
    );

    if (exchangeName !== undefined) {
      context.exchangeName = exchangeName;
    }
    if (exchangeClientOrderId !== undefined) {
      context.exchangeClientOrderId = exchangeClientOrderId;
    }

    return context;
  }

  private normalizeNullableString(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }
}
