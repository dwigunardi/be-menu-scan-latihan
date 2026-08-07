import { Injectable, BadRequestException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';

export interface EncryptedEnvelope {
  encrypted: boolean;
  iv: string;
  tag: string;
  payload: string;
}

@Injectable()
export class CryptoService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12; // 96 bits for GCM

  /**
   * Derives a 32-byte Session Key using HKDF (HMAC-SHA256)
   */
  deriveSessionKey(sharedSecret: Buffer, nonce: string, appSecret: string): Buffer {
    const salt = Buffer.from(appSecret, 'utf-8');
    const info = Buffer.from(`menuscan-session-${nonce}`, 'utf-8');
    const derivedKey = hkdfSync('sha256', sharedSecret, salt, info, 32);
    return Buffer.from(derivedKey);
  }

  /**
   * Encrypts plaintext string using AES-256-GCM
   */
  encrypt(plaintext: string, sessionKey: Buffer): EncryptedEnvelope {
    const iv = randomBytes(this.IV_LENGTH);
    const cipher = createCipheriv(this.ALGORITHM, sessionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return {
      encrypted: true,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      payload: encrypted,
    };
  }

  /**
   * Decrypts AES-256-GCM encrypted envelope
   */
  decrypt(envelope: { iv: string; tag: string; payload: string }, sessionKey: Buffer): string {
    try {
      const iv = Buffer.from(envelope.iv, 'base64');
      const tag = Buffer.from(envelope.tag, 'base64');
      const decipher = createDecipheriv(this.ALGORITHM, sessionKey, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(envelope.payload, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      throw new BadRequestException('Payload decryption failed: invalid ciphertext or corrupted tag.');
    }
  }
}
