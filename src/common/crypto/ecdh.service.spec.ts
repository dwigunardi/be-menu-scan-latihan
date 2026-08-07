import { Test, TestingModule } from '@nestjs/testing';
import { EcdhService } from './ecdh.service';
import { CryptoService } from './crypto.service';
import { UnauthorizedException } from '@nestjs/common';
import { createECDH } from 'node:crypto';

describe('EcdhService', () => {
  let ecdhService: EcdhService;
  let clientEcdh: ReturnType<typeof createECDH>;
  let clientPublicKeyHex: string;
  const mockAppSecret = 'super-secret-app-handshake-key-minimum-32-chars';
  const mockNonce = 'test-nonce-67890';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EcdhService, CryptoService],
    }).compile();

    ecdhService = module.get<EcdhService>(EcdhService);

    // Simulate Client ECDH Keypair
    clientEcdh = createECDH('prime256v1');
    clientEcdh.generateKeys();
    clientPublicKeyHex = clientEcdh.getPublicKey('hex');
  });

  it('should be defined', () => {
    expect(ecdhService).toBeDefined();
  });

  it('should generate a valid ECDH keypair', () => {
    const keyPair = ecdhService.generateKeyPair();
    expect(keyPair.publicKeyHex).toBeDefined();
    expect(keyPair.privateKeyHex).toBeDefined();
  });

  it('should perform handshake and return serverPublicKey and handshakeToken', () => {
    const result = ecdhService.performHandshake(clientPublicKeyHex, mockNonce, mockAppSecret, 3600);

    expect(result.serverPublicKeyHex).toBeDefined();
    expect(result.handshakeToken).toBeDefined();
    expect(result.expiresIn).toBe(3600);

    // Verify derived SessionKey is accessible
    const sessionKey = ecdhService.getSessionKey(result.handshakeToken);
    expect(sessionKey).toBeInstanceOf(Buffer);
    expect(sessionKey.length).toBe(32);
  });

  it('should throw UnauthorizedException if handshakeToken does not exist', () => {
    expect(() => ecdhService.getSessionKey('non-existent-token')).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if handshake session is expired', () => {
    // Perform handshake with negative TTL (-1 second) to simulate expiration
    const result = ecdhService.performHandshake(clientPublicKeyHex, mockNonce, mockAppSecret, -1);
    expect(() => ecdhService.getSessionKey(result.handshakeToken)).toThrow(UnauthorizedException);
  });
});
