import { GlobalExceptionFilter } from './global-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockRequest = {
      id: 'req-123',
      originalUrl: '/test',
      method: 'POST',
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle HttpException correctly', () => {
    const exception = new HttpException('Forbidden Resource', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'HttpException',
        message: 'Forbidden Resource',
      }),
    );
  });

  it('should handle ZodError correctly', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number',
      },
    ]);

    filter.catch(zodError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Input validation failed.',
        details: [{ field: 'name', message: 'Expected string, received number' }],
      }),
    );
  });

  it('should handle Prisma P2002 Unique Constraint Exception', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '7.9.1', meta: { target: ['email'] } },
    );

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'Unique constraint failed on field(s): email',
      }),
    );
  });
});
