import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isDev = configService.get<string>('app.NODE_ENV') === 'development';
        const logToFile = configService.get<boolean>('app.LOG_TO_FILE');
        const logFilePath = configService.get<string>('app.LOG_FILE_PATH');
        const logRetentionDays = configService.get<number>('app.LOG_RETENTION_DAYS');

        // Configure pino transports based on environment & LOG_TO_FILE flag
        const targets: any[] = [];

        if (isDev) {
          targets.push({
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: false,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          });
        }

        if (logToFile) {
          targets.push({
            target: 'pino-roll',
            options: {
              file: `${logFilePath}/app`,
              frequency: 'daily',
              mkdir: true,
              extension: '.log',
              maxFiles: logRetentionDays,
            },
          });
        }

        return {
          pinoHttp: {
            genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
            level: isDev ? 'debug' : 'info',
            redact: [
              'req.headers.authorization',
              'req.headers["x-handshake-token"]',
              'body.password',
              'body.refreshToken',
              'body.accessToken',
              'body.payload',
              'body.iv',
              'body.tag',
              'body.clientPublicKey',
            ],
            transport: targets.length > 0 ? { targets } : undefined,
            customProps: (req) => ({
              requestId: req.id,
            }),
          },
        };
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class AppLoggerModule {}
