import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessControlModule } from './access-control/access-control.module';
import { Public } from './access-control/decorators';
import { JwtAuthGuard } from './access-control/guards/jwt-auth.guard';
import { ArchitecturesModule } from './architectures/architectures.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { DatabaseModule } from './database/database.module';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'atlas-api' };
  }
}

@Module({
  imports: [
    DatabaseModule,
    AccessControlModule,
    AuthModule,
    CompaniesModule,
    ArchitecturesModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
