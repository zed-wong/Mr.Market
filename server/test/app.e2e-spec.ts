import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from '../src/app.controller';

describe('AppController (integration)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'mixin.app_id') {
                return 'test-mixin-app';
              }
              if (key === 'hufi.recording_oracle.api_url') {
                return 'https://oracle.test';
              }
              if (key === 'hufi.campaign_launcher.api_url') {
                return 'https://launcher.test';
              }

              return undefined;
            }),
          },
        },
      ],
    }).compile();

    controller = moduleFixture.get(AppController);
  });

  it('returns server information payload', () => {
    const result = controller.getAppInfo();

    expect(result).toEqual(
      expect.objectContaining({
        mixin_app_id: 'test-mixin-app',
        recording_oracle_url: 'https://oracle.test',
        campaign_launcher_url: 'https://launcher.test',
      }),
    );
    expect(typeof result.app_hash).toBe('string');
    expect(result.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,
    );
  });
});
