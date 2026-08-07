import { Test, TestingModule } from '@nestjs/testing';
import { DecryptPayloadMiddleware } from './decrypt-payload.middleware';
import { EcdhService } from '../crypto/ecdh.service';
import { CryptoService } from '../crypto/crypto.service';
import { BadRequestException } from '@nestjs/common';
import { createECDH } from 'node:crypto';

describe('DecryptPayloadMiddleware', () => {
  let middleware: DecryptPayloadMiddleware;
  let ecdhService: EcdhService;
  let cryptoService: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DecryptPayloadMiddleware, EcdhService, CryptoService],
    }).compile();

    middleware = module.get<DecryptPayloadMiddleware>(DecryptPayloadMiddleware);
    ecdhService = module.get<EcdhService>(EcdhService);
    cryptoService = module.get<CryptoService>(CryptoService);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should skip decryption for GET requests or handshake endpoint', () => {
    const req: any = { method: 'GET', originalUrl: '/api/v1/public/menus', headers: {} };
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should decrypt encrypted request body when x-handshake-token is present', () => {
    // Perform handshake to get a valid handshakeToken and sessionKey
    const clientEcdh = createECDH('prime256v1');
    clientEcdh.generateKeys();
    const handshake = ecdhService.performHandshake(
      clientEcdh.getPublicKey('hex'),
      'nonce-123',
      'super-secret-app-handshake-key-minimum-32-chars',
    );

    const sessionKey = ecdhService.getSessionKey(handshake.handshakeToken);
    const originalBody = { name: 'Kopi Susu', price: 15000 };
    const envelope = cryptoService.encrypt(JSON.stringify(originalBody), sessionKey);

    const req: any = {
      method: 'POST',
      originalUrl: '/api/v1/admin/menus',
      headers: { 'x-handshake-token': handshake.handshakeToken },
      body: envelope,
    };
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual(originalBody);
  });

  it('should throw BadRequestException if x-handshake-token is missing for encrypted body', () => {
    const req: any = {
      method: 'POST',
      originalUrl: '/api/v1/admin/menus',
      headers: {},
      body: { encrypted: true, iv: 'iv', tag: 'tag', payload: 'payload' },
    };
    const res: any = {};
    const next = jest.fn();

    expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
  });
});
