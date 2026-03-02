import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import {
  MixinReleaseHistory,
  MixinReleaseToken,
} from 'src/common/entities/mixin/mixin-release.entity';
import { SpotOrder } from 'src/common/entities/orders/spot-order.entity';
import { SpotOrderStatus } from 'src/common/types/orders/states';
import { Repository } from 'typeorm';

@Injectable()
export class ExchangeApiKeyRepository {
  constructor(
    @InjectRepository(APIKeysConfig)
    private readonly apiKeysRepository: Repository<APIKeysConfig>,
    @InjectRepository(SpotOrder)
    private readonly spotOrderRepository: Repository<SpotOrder>,
    @InjectRepository(MixinReleaseToken)
    private readonly mixinReleaseRepository: Repository<MixinReleaseToken>,
    @InjectRepository(MixinReleaseHistory)
    private readonly mixinReleaseHistoryRepository: Repository<MixinReleaseHistory>,
  ) {}

  // API Key related methods
  async addAPIKey(apiKey: APIKeysConfig) {
    return this.apiKeysRepository.save(apiKey);
  }

  async readAPIKey(key_id: string) {
    return await this.apiKeysRepository.findOne({
      where: { key_id },
    });
  }

  async updateAPIKeyState(key_id: string, enabled: boolean) {
    return await this.apiKeysRepository.update({ key_id }, { enabled });
  }

  async removeAPIKey(key_id: string) {
    const apiKey = await this.apiKeysRepository.findOne({
      where: { key_id },
    });

    if (!apiKey) {
      // Handle key not found error
      return;
    }
    await this.apiKeysRepository.remove(apiKey);
  }

  async removeAPIKeysByExchange(exchange: string) {
    await this.apiKeysRepository.delete({ exchange });
  }

  async readAllAPIKeys(includeDisabled = true): Promise<APIKeysConfig[]> {
    if (includeDisabled) {
      return await this.apiKeysRepository.find();
    }

    return await this.apiKeysRepository.find({ where: { enabled: true } });
  }

  async readAllAPIKeysByExchange(
    exchange: string,
    includeDisabled = true,
  ): Promise<APIKeysConfig[]> {
    if (includeDisabled) {
      return await this.apiKeysRepository.find({ where: { exchange } });
    }

    return await this.apiKeysRepository.find({
      where: { exchange, enabled: true },
    });
  }

  async readSupportedExchanges(includeDisabled = true): Promise<string[]> {
    const query = this.apiKeysRepository
      .createQueryBuilder('api_key')
      .select('DISTINCT api_key.exchange', 'exchange');

    if (!includeDisabled) {
      query.where('api_key.enabled = :enabled', { enabled: true });
    }

    const rows = await query.getRawMany();

    return rows
      .map((row) => row.exchange)
      .filter(
        (exchange) => typeof exchange === 'string' && exchange.length > 0,
      );
  }

  async readOrderByUser(userId: string): Promise<SpotOrder[]> {
    let orders = await this.spotOrderRepository.find({ where: { userId } });

    orders = orders.map((order) => {
      delete order.apiKeyId;

      return order;
    });

    return orders;
  }

  async readOrderByID(orderId: string): Promise<SpotOrder | null> {
    const order = await this.spotOrderRepository.findOne({
      where: { orderId },
    });

    if (!order) {
      return null;
    }

    delete order.apiKeyId;

    return order;
  }

  async readOrdersByState(state: SpotOrderStatus): Promise<SpotOrder[]> {
    return await this.spotOrderRepository.find({ where: { state } });
  }

  async readAllSpotOrders(): Promise<SpotOrder[]> {
    return this.spotOrderRepository.find();
  }

  async createSpotOrder(
    transactionData: Partial<SpotOrder>,
  ): Promise<SpotOrder> {
    const transaction = this.spotOrderRepository.create(transactionData);

    return await this.spotOrderRepository.save(transaction);
  }

  async updateSpotOrderState(orderId: string, state: SpotOrderStatus) {
    return await this.spotOrderRepository.update({ orderId }, { state });
  }

  async updateSpotOrderUpdatedAt(orderId: string, updatedAt: string) {
    return await this.spotOrderRepository.update({ orderId }, { updatedAt });
  }

  async updateSpotOrderApiKeyId(orderId: string, apiKeyId: string) {
    return await this.spotOrderRepository.update({ orderId }, { apiKeyId });
  }

  async addMixinReleaseToken(transactionData: Partial<MixinReleaseToken>) {
    const transaction = this.mixinReleaseRepository.create(transactionData);

    return await this.mixinReleaseRepository.save(transaction);
  }

  async readMixinReleaseToken(orderId: string) {
    return await this.mixinReleaseRepository.findOne({ where: { orderId } });
  }

  async readMixinReleaseHistory(orderId: string) {
    return await this.mixinReleaseHistoryRepository.exists({
      where: { orderId },
    });
  }

  async addMixinReleaseHistory(transactionData: Partial<MixinReleaseHistory>) {
    const transaction =
      this.mixinReleaseHistoryRepository.create(transactionData);

    return await this.mixinReleaseHistoryRepository.save(transaction);
  }
}
