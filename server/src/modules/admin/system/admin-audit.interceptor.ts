import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, map, mergeMap, Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AdminAuditLogService } from './admin-audit-log.service';

type AdminAuditRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  user?: {
    username?: string;
    userId?: string;
    authMethod?: string;
  };
};

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AdminAuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AdminAuditRequest>();

    if (!this.shouldAudit(request)) {
      return next.handle();
    }

    const startedAt = Date.now();

    return next.handle().pipe(
      mergeMap((value) =>
        from(this.record(request, 'success', startedAt)).pipe(map(() => value)),
      ),
      catchError((error) =>
        from(this.record(request, this.statusFromError(error), startedAt)).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }

  private shouldAudit(request: AdminAuditRequest): boolean {
    const method = (request.method || '').toUpperCase();

    return !['', 'GET', 'HEAD', 'OPTIONS'].includes(method);
  }

  private async record(
    request: AdminAuditRequest,
    status: 'success' | 'denied' | 'error',
    startedAt: number,
  ) {
    const method = (request.method || 'UNKNOWN').toUpperCase();
    const path = this.normalizePath(request);

    try {
      await this.auditLogService.record({
        actor: request.user?.username || request.user?.userId || 'admin',
        action: `admin.${method.toLowerCase()}`,
        resource: path,
        status,
        metadata: {
          params: request.params || {},
          query: request.query || {},
          body: request.body || null,
          durationMs: Math.max(0, Date.now() - startedAt),
        },
        requestContext: {
          method,
          path,
          ip: request.ip || null,
          userAgent: request.headers?.['user-agent'] || null,
          authMethod: request.user?.authMethod || null,
        },
      });
    } catch {
      return;
    }
  }

  private normalizePath(request: AdminAuditRequest): string {
    const rawPath = request.originalUrl || request.path || request.url || '/';

    return rawPath.split('?')[0].slice(0, 120);
  }

  private statusFromError(error: unknown): 'denied' | 'error' {
    if (
      typeof error === 'object' &&
      error !== null &&
      'getStatus' in error &&
      typeof (error as { getStatus?: unknown }).getStatus === 'function'
    ) {
      const statusCode = (error as { getStatus: () => number }).getStatus();

      return statusCode >= 500 ? 'error' : 'denied';
    }

    return 'error';
  }
}
