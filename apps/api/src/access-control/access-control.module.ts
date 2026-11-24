import { Global, Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { ArchitectureAccessGuard } from './guards/architecture-access.guard';
import { CompanyRoleGuard } from './guards/company-role.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TokenService } from './token.service';

@Global()
@Module({
  providers: [
    TokenService,
    AccessControlService,
    JwtAuthGuard,
    CompanyRoleGuard,
    ArchitectureAccessGuard,
  ],
  exports: [
    TokenService,
    AccessControlService,
    JwtAuthGuard,
    CompanyRoleGuard,
    ArchitectureAccessGuard,
  ],
})
export class AccessControlModule {}
