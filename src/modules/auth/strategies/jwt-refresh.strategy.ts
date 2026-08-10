import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    const secret =
      configService.get<string>('app.JWT_REFRESH_SECRET') ||
      configService.get<string>('JWT_REFRESH_SECRET') ||
      'default_jwt_refresh_secret_16';

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return (
            request?.body?.refreshToken ||
            ExtractJwt.fromAuthHeaderAsBearerToken()(request)
          );
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload) {
    const refreshToken =
      req?.body?.refreshToken ||
      req.get('Authorization')?.replace('Bearer', '').trim();

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      refreshToken,
    };
  }
}
