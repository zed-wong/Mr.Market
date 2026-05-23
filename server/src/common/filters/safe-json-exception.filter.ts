import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { getRFC3339Timestamp } from '../helpers/utils';

type SafeErrorBody = {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path?: string;
};

@Catch()
export class SafeJsonExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.buildBody(
      exception,
      status,
      this.sanitizePath(request?.url),
    );

    response.status(status).json(body);
  }

  private buildBody(
    exception: unknown,
    statusCode: number,
    path?: string,
  ): SafeErrorBody {
    if (!(exception instanceof HttpException)) {
      return {
        statusCode,
        message: 'Internal server error',
        error: 'Internal Server Error',
        timestamp: getRFC3339Timestamp(),
        path,
      };
    }

    if (statusCode >= 500) {
      return {
        statusCode,
        message: 'Internal server error',
        error: 'Internal Server Error',
        timestamp: getRFC3339Timestamp(),
        path,
      };
    }

    const response = exception.getResponse();
    const source =
      typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>)
        : {};
    const rawMessage =
      source.message === undefined ? exception.message : source.message;

    return {
      statusCode,
      message: this.normalizeMessage(rawMessage, statusCode),
      error: this.normalizeError(source.error, statusCode),
      timestamp: getRFC3339Timestamp(),
      path,
    };
  }

  private normalizeMessage(
    value: unknown,
    statusCode: number,
  ): string | string[] {
    const fallback =
      statusCode >= 500 ? 'Internal server error' : 'Request failed';

    if (Array.isArray(value)) {
      const messages = value
        .map((entry) => this.safeString(entry))
        .filter((entry) => entry.length > 0);

      return messages.length > 0 ? messages : fallback;
    }

    const message = this.safeString(value);

    return message || fallback;
  }

  private normalizeError(value: unknown, statusCode: number): string {
    const fallback =
      statusCode >= 500 ? 'Internal Server Error' : 'Bad Request';
    const error = this.safeString(value);

    return error || fallback;
  }

  private safeString(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value.replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  private sanitizePath(path?: string): string | undefined {
    if (typeof path !== 'string' || path.length === 0) {
      return undefined;
    }

    const [safePath] = path.split(/[?#]/);

    return safePath || '/';
  }
}
