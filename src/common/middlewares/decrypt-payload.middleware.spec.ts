import { BadRequestException } from '@nestjs/common';
import { DecryptPayloadMiddleware } from './decrypt-payload.middleware';
import { EcdhService } from '../crypto/ecdh.service';
import { CryptoService } from '../crypto/crypto.service';

describe('DecryptPayloadMiddleware', () => {
  let middleware: DecryptPayloadMiddleware;
  let ecdhService: jest.Mocked<EcdhService>;
  let cryptoService: jest.Mocked<CryptoService>;

  beforeEach(() => {
    ecdhService = {
      getSessionKey: jest.fn(),
    } as any;

    cryptoService = {
      decrypt: jest.fn(),
    } as any;

    middleware = new DecryptPayloadMiddleware(ecdhService, cryptoService);
  });

  it('should skip decryption for GET request', () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/public/menus',
      headers: {},
      body: {},
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(cryptoService.decrypt).not.toHaveBeenCalled();
  });

  it('should skip decryption for DELETE request', () => {
    const req = {
      method: 'DELETE',
      originalUrl: '/api/v1/admin/menus/123',
      headers: {},
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should skip decryption for handshake endpoint', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/auth/handshake',
      headers: {},
      body: { clientPublicKey: 'abc' },
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(cryptoService.decrypt).not.toHaveBeenCalled();
  });

  it('should skip decryption if body is not encrypted envelope', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/admin/menus',
      headers: {},
      body: { name: 'Latte', price: 20000 },
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(cryptoService.decrypt).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException if encrypted=true but x-handshake-token is missing', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/public/orders',
      headers: {},
      body: { encrypted: true, iv: 'iv', tag: 'tag', payload: 'payload' },
    } as any;
    const res = {} as any;
    const next = jest.fn();

    expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
  });

  it('should successfully decrypt and JSON parse encrypted envelope', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/public/orders',
      headers: { 'x-handshake-token': 'token-xyz' },
      body: {
        encrypted: true,
        iv: 'sample-iv',
        tag: 'sample-tag',
        payload: 'sample-payload',
      },
    } as any;
    const res = {} as any;
    const next = jest.fn();

    const mockSessionKey = Buffer.from('mock-session-key-32-bytes-length');
    ecdhService.getSessionKey.mockReturnValue(mockSessionKey);
    cryptoService.decrypt.mockReturnValue(JSON.stringify({ tableNumber: '01', customerName: 'Budi' }));

    middleware.use(req, res, next);

    expect(ecdhService.getSessionKey).toHaveBeenCalledWith('token-xyz');
    expect(cryptoService.decrypt).toHaveBeenCalledWith(
      {
        iv: 'sample-iv',
        tag: 'sample-tag',
        payload: 'sample-payload',
      },
      mockSessionKey,
    );
    expect(req.body).toEqual({ tableNumber: '01', customerName: 'Budi' });
    expect(next).toHaveBeenCalled();
  });

  it('should throw BadRequestException if decryption fails', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/public/orders',
      headers: { 'x-handshake-token': 'token-xyz' },
      body: {
        encrypted: true,
        iv: 'invalid-iv',
        tag: 'invalid-tag',
        payload: 'invalid-payload',
      },
    } as any;
    const res = {} as any;
    const next = jest.fn();

    ecdhService.getSessionKey.mockReturnValue(Buffer.from('key'));
    cryptoService.decrypt.mockImplementation(() => {
      throw new Error('Decryption failed');
    });

    expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
  });
});
