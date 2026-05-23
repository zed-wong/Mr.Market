// jwt-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AdminAuditLogService } from 'src/modules/admin/system/admin-audit-log.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Optional()
    private readonly auditLogService?: AdminAuditLogService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const result = (await super.canActivate(context)) as boolean;

      if (result) {
        return true;
      }
    } catch (error) {
      await this.auditSessionDenial(context);
      throw error;
    }

    await this.auditSessionDenial(context);
    throw new UnauthorizedException('Unauthorized');
  }

  private async auditSessionDenial(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = String(request?.method || '').toUpperCase();
    const path = this.getSafePath(request);

    if (method !== 'GET' || path !== '/auth/session') {
      return;
    }

    if (!this.auditLogService) {
      return;
    }

    try {
      await this.auditLogService.record({
        actor: 'anonymous',
        action: 'admin.session.denied',
        resource: 'auth',
        status: 'denied',
        metadata: {
          reason: 'guard_denied',
        },
        requestContext: {
          method,
          path,
          source: 'jwt-auth-guard',
        },
      });
    } catch {
      this.logger.warn('Failed to record denied admin session audit event');
    }
  }

  private getSafePath(request?: Request): string {
    if (typeof request?.path === 'string' && request.path.length > 0) {
      return request.path;
    }

    const rawPath =
      typeof request?.originalUrl === 'string'
        ? request.originalUrl
        : request?.url;

    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      return '';
    }

    const [safePath] = rawPath.split(/[?#]/);

    return safePath || '/';
  }
}
