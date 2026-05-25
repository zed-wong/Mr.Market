import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { SetupService } from './setup.service';

@Injectable()
export class SetupGuardMiddleware implements NestMiddleware {
  constructor(private readonly setupService: SetupService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const path = this.getPath(req);

    if (this.isAlwaysAllowed(path)) {
      next();

      return;
    }

    const status = await this.setupService.getStatus();

    if (status.initialized) {
      next();

      return;
    }

    res.status(503).json({
      statusCode: 503,
      message: 'Setup required',
      error: 'Service Unavailable',
    });
  }

  private isAlwaysAllowed(path: string): boolean {
    return (
      path.startsWith('/setup/') ||
      path === '/setup' ||
      path.startsWith('/auth/passkeys/login/') ||
      path.startsWith('/health/')
    );
  }

  private getPath(req: Request): string {
    const raw = req.originalUrl || req.url || '/';
    const [path] = raw.split(/[?#]/);

    return path || '/';
  }
}
