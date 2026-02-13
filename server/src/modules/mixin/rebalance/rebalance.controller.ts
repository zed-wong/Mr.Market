// rebalance.controller.ts
import { Controller, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { RebalanceService } from './rebalance.service';

@ApiTags('Mixin')
@Controller('mixin/rebalance')
@UseGuards(JwtAuthGuard)
export class RebalanceController {
  private readonly logger = new CustomLogger(RebalanceController.name);

  constructor(private readonly rebalanceService: RebalanceService) {}
}
