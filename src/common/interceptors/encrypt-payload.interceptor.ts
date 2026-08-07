import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { IS_SKIP_ENCRYPTION_KEY } from '../decorators/skip-encryption.decorator';
import { EcdhService } from '../crypto/ecdh.service';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class EncryptPayloadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(EncryptPayloadInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly ecdhService: EcdhService,
    private readonly cryptoService: CryptoService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isSkipEncryption = this.reflector.getAllAndOverride<boolean>(IS_SKIP_ENCRYPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest();
    const handshakeToken = req.headers['x-handshake-token'] as string;

    return next.handle().pipe(
      map((data) => {
        // Skip encryption if @SkipEncryption() is present or data is empty/falsy
        if (isSkipEncryption || !data) {
          return data;
        }

        // Encrypt response if handshake token is provided
        if (handshakeToken) {
          try {
            const sessionKey = this.ecdhService.getSessionKey(handshakeToken);
            const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
            const encryptedEnvelope = this.cryptoService.encrypt(jsonString, sessionKey);

            this.logger.log({
              step: 'RESPONSE_ENCRYPT',
              handshakeToken,
              status: 'ENCRYPTED',
              msg: 'Response payload encrypted successfully.',
            });

            return encryptedEnvelope;
          } catch (err) {
            this.logger.warn({
              step: 'RESPONSE_ENCRYPT',
              handshakeToken,
              status: 'BYPASSED',
              error: err instanceof Error ? err.message : String(err),
              msg: 'Failed to encrypt response. Returning unencrypted data.',
            });
            return data;
          }
        }

        return data;
      }),
    );
  }
}
