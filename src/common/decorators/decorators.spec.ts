import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Public, IS_PUBLIC_KEY } from './public.decorator';
import { SkipEncryption, IS_SKIP_ENCRYPTION_KEY } from './skip-encryption.decorator';
import { CurrentUser } from './current-user.decorator';

function getParamDecoratorFactory(decorator: Function) {
  class TestClass {
    public testMethod(@decorator() _param: any) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'testMethod');
  return args[Object.keys(args)[0]].factory;
}

describe('Common Decorators', () => {
  describe('Public Decorator', () => {
    it('should set metadata for IS_PUBLIC_KEY to true', () => {
      class TestController {
        @Public()
        testEndpoint() {}
      }

      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, TestController.prototype.testEndpoint);
      expect(isPublic).toBe(true);
    });
  });

  describe('SkipEncryption Decorator', () => {
    it('should set metadata for IS_SKIP_ENCRYPTION_KEY to true', () => {
      class TestController {
        @SkipEncryption()
        testEndpoint() {}
      }

      const isSkip = Reflect.getMetadata(IS_SKIP_ENCRYPTION_KEY, TestController.prototype.testEndpoint);
      expect(isSkip).toBe(true);
    });
  });

  describe('CurrentUser Decorator', () => {
    it('should extract user object from request', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const mockUser = { id: 'user-123', email: 'test@admin.com', name: 'Admin' };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: mockUser }),
        }),
      };

      const result = factory(undefined, mockContext);
      expect(result).toEqual(mockUser);
    });

    it('should extract specific property from user object', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const mockUser = { id: 'user-123', email: 'test@admin.com', name: 'Admin' };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: mockUser }),
        }),
      };

      const result = factory('id', mockContext);
      expect(result).toBe('user-123');
    });

    it('should return null if user is not in request', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      };

      const result = factory(undefined, mockContext);
      expect(result).toBeNull();
    });
  });
});
