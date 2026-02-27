// message.service.spec.ts
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MixinMessage } from 'src/common/entities/mixin/mixin-message.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { UserService } from 'src/modules/mixin/user/user.service';

import { getRFC3339Timestamp } from '../../../common/helpers/utils';
import { MixinClientService } from '../client/mixin-client.service';
import { MessageRepository } from './message.repository';
import { MessageService } from './message.service';

jest.mock('src/modules/mixin/user/user.service');
jest.mock('./message.repository');
jest.mock('@mixin.dev/mixin-node-sdk');

describe('MessageService', () => {
  let service: MessageService;
  // let userService: UserService;
  let messageRepository: MessageRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        UserService,
        MessageRepository,
        CustomLogger,
        ConfigService,
        {
          provide: MixinClientService,
          useValue: {
            client: {
              blaze: {
                loop: jest.fn(),
              },
              user: {
                fetch: jest.fn(),
              },
              message: {
                sendText: jest.fn(),
              },
              conversation: {
                fetch: jest.fn(),
              },
            },
          },
        },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
    // userService = module.get<UserService>(UserService);
    messageRepository = module.get<MessageRepository>(MessageRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addMessageHistory', () => {
    it('should successfully add a message history', async () => {
      const mockMessage: MixinMessage = {
        message_id: '1',
        type: 'text',
        representative_id: 'rep-id',
        quote_message_id: 'quote-id',
        conversation_id: 'conv-id',
        user_id: 'user-id',
        session_id: 'session-id',
        category: 'PLAIN_TEXT',
        data: 'Hello, World!',
        data_base64: 'SGVsbG8sIFdvcmxkIQ==',
        status: 'SENT',
        source: 'source',
        created_at: getRFC3339Timestamp(),
        updated_at: getRFC3339Timestamp(),
      };
      const savedMessage = { ...mockMessage };

      jest
        .spyOn(messageRepository, 'addMessageHistory')
        .mockResolvedValue(savedMessage);

      await expect(service.addMessageHistory(mockMessage)).resolves.toEqual(
        savedMessage,
      );
    });
  });

  describe('removeMessageById', () => {
    it('should call the repository method to remove a message by id', async () => {
      const messageId = 'test-message-id';

      jest
        .spyOn(messageRepository, 'removeMessageById')
        .mockResolvedValue(undefined);

      await service.removeMessageById(messageId);

      expect(messageRepository.removeMessageById).toHaveBeenCalledWith(
        messageId,
      );
    });
  });
});
