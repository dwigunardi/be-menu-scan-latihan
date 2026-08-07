import { Test, TestingModule } from '@nestjs/testing';
import { CryptoService } from './crypto.service';
import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

describe('CryptoService', () => {
  let service: CryptoService;
  const mockAppSecret = 'super-secret-app-handshake-key-minimum-32-chars';
  const mockNonce = 'test-random-nonce-12345';
  let mockSharedSecret: Buffer;
  let derivedSessionKey: Buffer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoService],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
    mockSharedSecret = randomBytes(32);
    derivedSessionKey = service.deriveSessionKey(mockSharedSecret, mockNonce, mockAppSecret);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should derive a 32-byte Session Key using HKDF', () => {
    expect(derivedSessionKey).toBeInstanceOf(Buffer);
    expect(derivedSessionKey.length).toBe(32);
  });

  it('should encrypt and decrypt plaintext payload correctly using AES-256-GCM', () => {
    const originalText = JSON.stringify({ email: 'admin@menuscan.com', role: 'ADMIN' });
    const envelope = service.encrypt(originalText, derivedSessionKey);

    expect(envelope.encrypted).toBe(true);
    expect(envelope.iv).toBeDefined();
    expect(envelope.tag).toBeDefined();
    expect(envelope.payload).toBeDefined();

    const decryptedText = service.decrypt(envelope, derivedSessionKey);
    expect(decryptedText).toBe(originalText);
  });

  it('should throw BadRequestException if decryption fails due to invalid tag/corrupted payload', () => {
    const originalText = 'Secret Message';
    const envelope = service.encrypt(originalText, derivedSessionKey);
    const corruptedEnvelope = { ...envelope, payload: 'corrupted-payload-string' };

    expect(() => service.decrypt(corruptedEnvelope, derivedSessionKey)).toThrow(BadRequestException);
  });
});
