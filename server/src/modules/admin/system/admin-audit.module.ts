import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLogEntity } from 'src/common/entities/admin/admin-audit-log.entity';

import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuditLogService } from './admin-audit-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLogEntity])],
  providers: [AdminAuditLogService, AdminAuditInterceptor],
  exports: [AdminAuditLogService, AdminAuditInterceptor],
})
export class AdminAuditModule {}
