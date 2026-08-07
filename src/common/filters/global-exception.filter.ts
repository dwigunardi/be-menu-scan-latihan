import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorTitle = 'Internal Server Error';
    let message = 'An unexpected error occurred on the server.';
    let details: any = undefined;

    // 1. Handle Zod Validation Errors
    if (exception instanceof ZodValidationException) {
      statusCode = HttpStatus.BAD_REQUEST;
      errorTitle = 'Bad Request';
      message = 'Input validation failed.';
      const zodError = (exception as any).getZodError ? (exception as any).getZodError() : (exception as any).zodError;
      if (zodError && Array.isArray(zodError.issues)) {
        details = zodError.issues.map((issue: any) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
      }
    } else if (exception instanceof ZodError) {
      statusCode = HttpStatus.BAD_REQUEST;
      errorTitle = 'Bad Request';
      message = 'Input validation failed.';
      details = exception.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
    }
    // 2. Handle Prisma Database Exceptions
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        errorTitle = 'Conflict';
        const target = (exception.meta?.target as string[]) || [];
        message = `Unique constraint failed on field(s): ${target.join(', ')}`;
      } else if (exception.code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        errorTitle = 'Not Found';
        message = 'The requested database record was not found.';
      } else {
        statusCode = HttpStatus.BAD_REQUEST;
        errorTitle = 'Database Error';
        message = `Database query error (Code: ${exception.code}).`;
      }
    }
    // 3. Handle Standard NestJS HTTP Exceptions
    else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        errorTitle = (res as any).error || exception.name;
        message = (res as any).message || exception.message;
        details = (res as any).details;
      } else {
        errorTitle = exception.name;
        message = res as string;
      }
    }
    // 4. Handle Standard JS Error
    else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log the Exception with Step Tag
    this.logger.error({
      step: 'EXCEPTION_CATCH',
      requestId: (request as any).id,
      statusCode,
      errorTitle,
      message,
      path: request.originalUrl,
      method: request.method,
      stack: exception instanceof Error ? exception.stack : undefined,
      msg: `Exception caught: ${message}`,
    });

    response.status(statusCode).json({
      statusCode,
      error: errorTitle,
      message,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
