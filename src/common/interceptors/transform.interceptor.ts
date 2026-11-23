import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { z } from 'zod';
import { ZOD_RESPONSE_KEY } from '../decorators/zod-response.decorator';
import { applyResponseSchema } from './response-schema.util';

export interface StandardResponse<T> {
  success: boolean;
  statusCode: number;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T> | any>
{
  private readonly logger = new Logger(TransformInterceptor.name);

  constructor(@Optional() private readonly reflector?: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    const responseSchema = this.reflector?.get<z.ZodTypeAny>(
      ZOD_RESPONSE_KEY,
      context.getHandler(),
    );

    return next.handle().pipe(
      map((rawData) => {
        // If data is already encrypted envelope or null/undefined, pass through
        if (rawData && typeof rawData === 'object' && rawData.encrypted === true) {
          return rawData;
        }

        let processedData = rawData;

        // Apply Backend Response Hardening & Field Stripping if schema is attached
        if (responseSchema && rawData !== null && rawData !== undefined) {
          processedData = applyResponseSchema(
            responseSchema,
            rawData,
            this.logger,
            context.getHandler().name,
          );
        }

        return {
          success: true,
          statusCode: response.statusCode,
          data: processedData ?? null,
        };
      }),
    );
  }
}
