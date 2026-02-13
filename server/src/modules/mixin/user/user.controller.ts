import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

import { UserService } from './user.service';

@ApiTags('Mixin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mixin/users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  async getAllUsers(): Promise<MixinUser[]> {
    return this.userService.getAllUsers();
  }
}
