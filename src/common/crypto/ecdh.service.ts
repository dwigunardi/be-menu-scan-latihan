import { Injectable, UnauthorizedException, Logger, Optional } from '@nestjs/common';
import { createECDH, randomUUID } from 'node:crypto';
import { CryptoService } from './crypto.service';
import { RedisService } from '../redis/redis.service';

export interface HandshakeSession {
  handshakeToken: string;
  sessionKey: Buffer;
  expiresAt: number;
}

@Injectable()
export class EcdhService {
  private readonly logger = new Logger(EcdhService.name);
  private readonly CURVE = 'prime256v1'; // secp256r1
  private readonly sessions = new Map<string, HandshakeSession>();

  constructor(
    private readonly cryptoService: CryptoService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * Generates a fresh ECDH keypair
   */
  generateKeyPair() {
    const ecdh = createECDH(this.CURVE);
    ecdh.generateKeys();
    return {
      publicKeyHex: ecdh.getPublicKey('hex'),
      privateKeyHex: ecdh.getPrivateKey('hex'),
      ecdhInstance: ecdh,
    };
  }

  /**
   * Performs Handshake: Computes Shared Secret, derives SessionKey, stores in Memory & Redis with TTL.
   */
  performHandshake(
    clientPublicKeyHex: string,
    nonce: string,
    appSecret: string,
    ttlSeconds = 7200,
  ): { serverPublicKeyHex: string; handshakeToken: string; expiresIn: number } {
    const serverKeyPair = this.generateKeyPair();

    // Compute ECDH Shared Secret
    const sharedSecret = serverKeyPair.ecdhInstance.computeSecret(
      clientPublicKeyHex,
      'hex',
    );

    // Derive SessionKey using HKDF
    const sessionKey = this.cryptoService.deriveSessionKey(
      sharedSecret,
      nonce,
      appSecret,
    );

    const handshakeToken = randomUUID();
    const expiresAt = Date.now() + ttlSeconds * 1000;

    // 1. Store in memory map
    this.sessions.set(handshakeToken, {
      handshakeToken,
      sessionKey,
      expiresAt,
    });

    // 2. Persist to Redis (Distributed Session)
    if (this.redisService) {
      this.redisService.set(
        `menuscan:ecdh:${handshakeToken}`,
        {
          handshakeToken,
          sessionKeyHex: sessionKey.toString('hex'),
          expiresAt,
        },
        ttlSeconds,
      );
    }

    this.logger.log({
      step: 'SECURITY_AUTH',
      handshakeToken,
      expiresIn: ttlSeconds,
      msg: 'ECDH Handshake completed successfully. SessionKey registered.',
    });

    return {
      serverPublicKeyHex: serverKeyPair.publicKeyHex,
      handshakeToken,
      expiresIn: ttlSeconds,
    };
  }

  /**
   * Retrieves active SessionKey by handshakeToken
   */
  getSessionKey(handshakeToken: string): Buffer {
    const session = this.sessions.get(handshakeToken);

    if (!session) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid or expired handshake token.',
        error: 'Unauthorized',
      });
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(handshakeToken);
      if (this.redisService) {
        this.redisService.del(`menuscan:ecdh:${handshakeToken}`);
      }
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Handshake token has expired. Please perform handshake again.',
        error: 'Unauthorized',
      });
    }

    return session.sessionKey;
  }
}
