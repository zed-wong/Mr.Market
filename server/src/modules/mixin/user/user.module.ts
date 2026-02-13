import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { UserService } from 'src/modules/mixin/user/user.service';

import { MixinClientModule } from '../client/mixin-client.module';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';

@Module({
  imports: [TypeOrmModule.forFeature([MixinUser]), MixinClientModule],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
  controllers: [UserController],
})
export class UserModule {}
