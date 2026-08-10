import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('should transform plain response data into StandardResponse format', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of({ name: 'Espresso', price: 20000 }),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: (result) => {
        expect(result).toEqual({
          success: true,
          statusCode: 200,
          data: { name: 'Espresso', price: 20000 },
        });
        done();
      },
    });
  });

  it('should pass through encrypted envelope without modifying format', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    const encryptedEnvelope = {
      encrypted: true,
      iv: 'iv-xyz',
      tag: 'tag-xyz',
      payload: 'payload-xyz',
    };

    const mockCallHandler: CallHandler = {
      handle: () => of(encryptedEnvelope),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: (result) => {
        expect(result).toEqual(encryptedEnvelope);
        done();
      },
    });
  });

  it('should format null or undefined data properly', (done) => {
    const mockContext = {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode: 204 }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: (result) => {
        expect(result).toEqual({
          success: true,
          statusCode: 204,
          data: null,
        });
        done();
      },
    });
  });
});
