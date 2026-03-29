import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from '../../../src/app.controller';
import { createSystemTestLogger } from '../helpers/system-test-log.helper';

const log = createSystemTestLogger('app-info');

describe('AppController system info contract', () => {
  let controller: AppController;

  beforeEach(async () => {
    log.suite('building testing module');
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
    log.suite('controller ready');
  });

  it('returns server information payload', () => {
    log.step('calling getAppInfo');
    const result = controller.getAppInfo();

    log.result('received app info payload', {
      mixin_app_id: result.mixin_app_id,
      recording_oracle_url: result.recording_oracle_url,
      campaign_launcher_url: result.campaign_launcher_url,
      hasAppHash: typeof result.app_hash === 'string',
    });

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
