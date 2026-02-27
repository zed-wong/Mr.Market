import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import { SpotdataTradingPairDto } from 'src/modules/admin/admin-spot-management/admin-spot-management.dto';
import { SpotdataRepository } from 'src/modules/data/spot-data/spot-data.repository';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

@Injectable()
export class AdminSpotService {
  private readonly logger = new CustomLogger(AdminSpotService.name);
  private readonly cacheKey = 'supported-spotdata-pairs';

  constructor(
    private readonly spotdataRepository: SpotdataRepository,
    @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  private async invalidateCache() {
    await this.cacheService.del(this.cacheKey);
    this.logger.log(`Invalidated cache: ${this.cacheKey}`);
  }

  // Trading Pair
  async addTradingPair(pairDto: SpotdataTradingPairDto) {
    this.logger.log(`Adding trading pair: ${JSON.stringify(pairDto)}`);
    try {
      const existingPair =
        await this.spotdataRepository.findTradingPairByExchangeAndSymbol(
          pairDto.exchange_id,
          pairDto.symbol,
        );

      if (existingPair) {
        throw new BadRequestException(
          `Trading pair ${pairDto.symbol} already exists on ${pairDto.exchange_id}`,
        );
      }

      const pair: SpotdataTradingPair = {
        ...pairDto,
      };
      const result = await this.spotdataRepository.addTradingPair(pair);

      await this.invalidateCache();

      return result;
    } catch (error) {
      this.logger.error(`Failed to add trading pair: ${error.message}`, error);
      throw error;
    }
  }

  async removeTradingPair(id: string) {
    const result = await this.spotdataRepository.removeTradingPair(id);

    await this.invalidateCache();

    return result;
  }

  async removeAllTradingPairs() {
    const pairs = await this.spotdataRepository.findAllTradingPairs();

    for (const pair of pairs) {
      await this.spotdataRepository.removeTradingPair(pair.id);
    }
    await this.invalidateCache();
  }

  async updateTradingPair(
    id: string,
    modifications: Partial<SpotdataTradingPair>,
  ) {
    try {
      const result = await this.spotdataRepository.updateTradingPair(
        id,
        modifications,
      );

      await this.invalidateCache();

      return result;
    } catch (error) {
      this.logger.error(`Failed to modify trading pair with ID ${id}`, error);
    }
  }
}
