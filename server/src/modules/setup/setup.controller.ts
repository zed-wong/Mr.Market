import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SetupService } from './setup.service';
import { SetupEnvBody, SetupPasswordBody } from './setup.types';

@ApiTags('Setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  async status() {
    return this.setupService.getStatus();
  }

  @Post('password')
  async password(@Body() body: SetupPasswordBody) {
    return this.setupService.setPassword(body?.password);
  }

  @Post('seed')
  @UseGuards(JwtAuthGuard)
  async seed() {
    return this.setupService.seedDatabase();
  }

  @Get('seed-status')
  @UseGuards(JwtAuthGuard)
  async seedStatus() {
    return this.setupService.getSeedStatus();
  }

  @Patch('steps/:step')
  @UseGuards(JwtAuthGuard)
  async completeStep(@Param('step') step: string) {
    return this.setupService.completeStep(step);
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard)
  async complete() {
    return this.setupService.completeSetup();
  }

  @Post('env')
  @UseGuards(JwtAuthGuard)
  async env(@Body() body: SetupEnvBody) {
    return this.setupService.writeEnvValues(body?.values);
  }

  @Get('env')
  @UseGuards(JwtAuthGuard)
  async envStatus() {
    return this.setupService.listConfigStatus();
  }
}
