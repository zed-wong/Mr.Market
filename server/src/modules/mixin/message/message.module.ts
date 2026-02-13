import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MixinMessage } from 'src/common/entities/mixin/mixin-message.entity';
import { MessageController } from 'src/modules/mixin/message/message.controller';
import { MessageRepository } from 'src/modules/mixin/message/message.repository';
import { MessageService } from 'src/modules/mixin/message/message.service';
import { UserModule } from 'src/modules/mixin/user/user.module';
import { UserService } from 'src/modules/mixin/user/user.service';

import { MixinClientModule } from '../client/mixin-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MixinMessage]),
    UserModule,
    MixinClientModule,
  ],
  controllers: [MessageController],
  providers: [MessageService, UserService, MessageRepository],
})
export class MessageModule {}
