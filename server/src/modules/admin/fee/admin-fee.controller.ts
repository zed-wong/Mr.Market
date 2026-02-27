import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { UpdateGlobalFeeDto } from './admin-fee.dto';
import { AdminFeeService } from './admin-fee.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Admin')
export class AdminFeeController {
  constructor(private readonly adminFeeService: AdminFeeService) {}

  @Get('fee/global')
  @ApiOperation({ summary: 'Get global fee settings' })
  async getGlobalFees() {
    return this.adminFeeService.getGlobalFees();
  }

  @Post('fee/global')
  @ApiOperation({ summary: 'Update global fee settings' })
  async updateGlobalFees(@Body() updateDto: UpdateGlobalFeeDto) {
    return this.adminFeeService.updateGlobalFees(updateDto);
  }

  @Get('fee/overrides')
  @ApiOperation({ summary: 'Get all fee overrides' })
  async getFeeOverrides() {
    return this.adminFeeService.getFeeOverrides();
  }
}
