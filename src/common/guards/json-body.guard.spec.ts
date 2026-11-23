import { UnsupportedMediaTypeException } from '@nestjs/common';
import { JsonBodyGuard } from './json-body.guard';

describe('JsonBodyGuard', () => {
  const guard = new JsonBodyGuard();
  const contextFor = (contentType: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          is: (type: string) =>
            type === 'application/json' &&
            contentType.startsWith('application/json')
              ? type
              : false,
        }),
      }),
    }) as any;

  it('allows JSON bodies', () => {
    expect(
      guard.canActivate(contextFor('application/json; charset=utf-8')),
    ).toBe(true);
  });

  it.each([
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
  ])('rejects %s (what a cross-site HTML form can send) with 415', (type) => {
    expect(() => guard.canActivate(contextFor(type))).toThrow(
      UnsupportedMediaTypeException,
    );
  });
});
