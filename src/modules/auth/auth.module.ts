import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshCookieService } from './refresh-cookie.service';
import { CookieCsrfGuard } from '../../common/guards/cookie-csrf.guard';
import { PinVerificationService } from '../../common/security/pin-verification.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PinVerificationService,
    RefreshCookieService,
    CookieCsrfGuard,
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
