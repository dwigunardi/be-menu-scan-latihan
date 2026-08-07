import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  success: boolean;
  statusCode: number;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, StandardResponse<T> | any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data) => {
        // If data is already encrypted envelope or null/undefined, pass through
        if (data && typeof data === 'object' && data.encrypted === true) {
          return data;
        }

        return {
          success: true,
          statusCode: response.statusCode,
          data: data ?? null,
        };
      }),
    );
  }
}
