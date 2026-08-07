import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { createECDH, randomUUID } from 'node:crypto';
import { CryptoService } from './crypto.service';

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

  constructor(private readonly cryptoService: CryptoService) {}

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
   * Performs Handshake: Computes Shared Secret, derives SessionKey, stores in Memory with TTL.
   */
  performHandshake(clientPublicKeyHex: string, nonce: string, appSecret: string, ttlSeconds = 7200): { serverPublicKeyHex: string; handshakeToken: string; expiresIn: number } {
    const serverKeyPair = this.generateKeyPair();
    
    // Compute ECDH Shared Secret
    const sharedSecret = serverKeyPair.ecdhInstance.computeSecret(clientPublicKeyHex, 'hex');
    
    // Derive SessionKey using HKDF
    const sessionKey = this.cryptoService.deriveSessionKey(sharedSecret, nonce, appSecret);

    const handshakeToken = randomUUID();
    const expiresAt = Date.now() + ttlSeconds * 1000;

    this.sessions.set(handshakeToken, {
      handshakeToken,
      sessionKey,
      expiresAt,
    });

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
        errorCode: 'HANDSHAKE_EXPIRED',
        message: 'Invalid or expired handshake token. Re-handshake required.',
      });
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(handshakeToken);
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'HANDSHAKE_EXPIRED',
        message: 'Handshake session expired. Re-handshake required.',
      });
    }

    return session.sessionKey;
  }
}
