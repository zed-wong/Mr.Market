import { BadRequestException, HttpStatus } from '@nestjs/common';

import { SafeJsonExceptionFilter } from './safe-json-exception.filter';

function createHost(url = '/admin/system/logs') {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: jest.fn(() => ({
      getResponse: () => response,
      getRequest: () => ({ url }),
    })),
  };

  return { host: host as any, response };
}

describe('SafeJsonExceptionFilter', () => {
  it('returns bounded JSON for expected HTTP failures', () => {
    const filter = new SafeJsonExceptionFilter();
    const { host, response } = createHost('/admin/orders?limit=bad');

    filter.catch(new BadRequestException('limit must be a positive integer.'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'limit must be a positive integer.',
        error: 'Bad Request',
        path: '/admin/orders?limit=bad',
      }),
    );
    expect(response.json.mock.calls[0][0].timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T.*Z$/,
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'stack',
    );
  });

  it('masks unexpected implementation failures behind a generic JSON error', () => {
    const filter = new SafeJsonExceptionFilter();
    const { host, response } = createHost('/admin/system/config');

    filter.catch(new Error('/tmp/private/path failed with token=secret'), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
        path: '/admin/system/config',
      }),
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      '/tmp/private/path',
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'token=secret',
    );
  });
});
