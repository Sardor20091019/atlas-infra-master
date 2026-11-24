import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GOOGLE_OAUTH_CLIENT, GoogleOAuthClient } from './google-oauth.client';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: GOOGLE_OAUTH_CLIENT,
      useClass: GoogleOAuthClient,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
