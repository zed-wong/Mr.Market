import { Injectable } from '@nestjs/common';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { CustomConfigRepository } from 'src/modules/infrastructure/custom-config/custom-config.repository';

@Injectable()
export class CustomConfigService {
  constructor(private configRepository: CustomConfigRepository) {}
  async readPrimaryConfig() {
    return await this.configRepository.readPrimaryConfig();
  }
  createConfig(input: Partial<CustomConfigEntity>) {
    return this.configRepository.createConfig(input);
  }
  async saveConfig(config: CustomConfigEntity) {
    return await this.configRepository.saveConfig(config);
  }
  async readSpotFee() {
    return await this.configRepository.readSpotFee();
  }
  async modifySpotFee(newSpotFee: string) {
    return await this.configRepository.modifySpotFee(newSpotFee);
  }
  async readFundingAccountStatus() {
    return await this.configRepository.readFundingAccountStatus();
  }
  async readMarketMakingFee() {
    return await this.configRepository.readMarketMakingFee();
  }
}
