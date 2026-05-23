import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

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
    const { host, response } = createHost(
      '/admin/orders?limit=bad&password=secret-value',
    );

    filter.catch(new BadRequestException('limit must be a positive integer.'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'limit must be a positive integer.',
        error: 'Bad Request',
        path: '/admin/orders',
      }),
    );
    expect(response.json.mock.calls[0][0].timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T.*Z$/,
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'stack',
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'secret-value',
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

  it('masks 5xx HttpException messages behind a generic JSON error', () => {
    const filter = new SafeJsonExceptionFilter();
    const { host, response } = createHost('/admin/system/logs?query=token=secret');

    filter.catch(
      new HttpException(
        {
          message: 'SQLite failed at /tmp/private/path with token=secret',
          error: 'Database failure details',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Internal server error',
        error: 'Internal Server Error',
        path: '/admin/system/logs',
      }),
    );
    const body = JSON.stringify(response.json.mock.calls[0][0]);
    expect(body).not.toContain('/tmp/private/path');
    expect(body).not.toContain('token=secret');
    expect(body).not.toContain('Database failure details');
  });
});
