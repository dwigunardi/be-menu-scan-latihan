import { Test, TestingModule } from '@nestjs/testing';
import { EncryptPayloadInterceptor } from './encrypt-payload.interceptor';
import { EcdhService } from '../crypto/ecdh.service';
import { CryptoService } from '../crypto/crypto.service';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { createECDH } from 'node:crypto';

describe('EncryptPayloadInterceptor', () => {
  let interceptor: EncryptPayloadInterceptor;
  let ecdhService: EcdhService;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptPayloadInterceptor,
        EcdhService,
        CryptoService,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn().mockReturnValue(false),
          },
        },
      ],
    }).compile();

    interceptor = module.get<EncryptPayloadInterceptor>(EncryptPayloadInterceptor);
    ecdhService = module.get<EcdhService>(EcdhService);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should encrypt response payload when x-handshake-token is present', (done) => {
    const clientEcdh = createECDH('prime256v1');
    clientEcdh.generateKeys();
    const handshake = ecdhService.performHandshake(
      clientEcdh.getPublicKey('hex'),
      'nonce-123',
      'super-secret-app-handshake-key-minimum-32-chars',
    );

    const mockExecutionContext: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-handshake-token': handshake.handshakeToken },
        }),
      }),
    };

    const rawResponse = { id: '1', name: 'Nasi Goreng', price: 25000 };
    const callHandler: any = {
      handle: () => of(rawResponse),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe((result) => {
      expect(result.encrypted).toBe(true);
      expect(result.iv).toBeDefined();
      expect(result.tag).toBeDefined();
      expect(result.payload).toBeDefined();
      done();
    });
  });

  it('should return unencrypted data when @SkipEncryption() is present', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const mockExecutionContext: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-handshake-token': 'token' },
        }),
      }),
    };

    const rawResponse = { status: 'OK' };
    const callHandler: any = {
      handle: () => of(rawResponse),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe((result) => {
      expect(result).toEqual(rawResponse);
      done();
    });
  });
});
