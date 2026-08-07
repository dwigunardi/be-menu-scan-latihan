import { Injectable, NestMiddleware, BadRequestException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { EcdhService } from '../crypto/ecdh.service';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class DecryptPayloadMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DecryptPayloadMiddleware.name);

  constructor(
    private readonly ecdhService: EcdhService,
    private readonly cryptoService: CryptoService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const handshakeToken = req.headers['x-handshake-token'] as string;

    // Log Inbound Request Step
    this.logger.log({
      step: 'HTTP_INBOUND',
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      msg: 'Incoming HTTP Request',
    });

    // Skip decryption if request has no body, GET/DELETE methods, or handshake endpoint
    if (!req.body || req.method === 'GET' || req.method === 'DELETE' || req.originalUrl.includes('/auth/handshake')) {
      return next();
    }

    // Check if body is encrypted envelope
    if (req.body && req.body.encrypted === true) {
      if (!handshakeToken) {
        throw new BadRequestException('Missing x-handshake-token header for encrypted payload.');
      }

      const sessionKey = this.ecdhService.getSessionKey(handshakeToken);

      try {
        const decryptedJsonString = this.cryptoService.decrypt(
          {
            iv: req.body.iv,
            tag: req.body.tag,
            payload: req.body.payload,
          },
          sessionKey,
        );

        req.body = JSON.parse(decryptedJsonString);

        this.logger.log({
          step: 'PAYLOAD_DECRYPT',
          handshakeToken,
          status: 'SUCCESS',
          msg: 'Request body decrypted successfully.',
        });
      } catch (err) {
        this.logger.error({
          step: 'PAYLOAD_DECRYPT',
          handshakeToken,
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
          msg: 'Failed to decrypt request body.',
        });
        throw new BadRequestException('Malformed or unreadable encrypted payload.');
      }
    }

    next();
  }
}
