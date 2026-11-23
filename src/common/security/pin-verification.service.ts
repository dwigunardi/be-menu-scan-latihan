import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 5;

/** Where the PIN was entered; only used for logs. */
export type PinContext = 'KIOSK_EXIT' | 'CLOCK_IN' | 'CLOCK_OUT';

export interface PinHolder {
  id: string;
  pinCode: string;
  pinFailedAttempts: number;
  pinLockedUntil: Date | null;
}

/**
 * Single place a staff PIN is checked (kiosk exit, clock-in, clock-out), sharing one lockout counter.
 * Without a shared counter, the lockout on one endpoint could be bypassed by guessing through another.
 *
 * After PIN_MAX_ATTEMPTS consecutive wrong PINs the user is locked for PIN_LOCK_MINUTES (429), and the
 * PIN is not evaluated at all while locked. A correct PIN resets the counter.
 */
@Injectable()
export class PinVerificationService {
  private readonly logger = new Logger(PinVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async verify(
    user: PinHolder,
    pinCode: string,
    context: PinContext,
  ): Promise<boolean> {
    const now = new Date();
    if (user.pinLockedUntil && user.pinLockedUntil > now) {
      throw this.lockedException(user.pinLockedUntil, now);
    }

    if (await bcrypt.compare(pinCode, user.pinCode)) {
      if (user.pinFailedAttempts > 0 || user.pinLockedUntil) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { pinFailedAttempts: 0, pinLockedUntil: null },
        });
      }
      this.logger.log({
        step: 'PIN_VERIFY_SUCCESS',
        userId: user.id,
        context,
        msg: 'Staff PIN verified',
      });
      return true;
    }

    // Atomic increment so concurrent wrong attempts are all counted
    const { pinFailedAttempts } = await this.prisma.user.update({
      where: { id: user.id },
      data: { pinFailedAttempts: { increment: 1 } },
      select: { pinFailedAttempts: true },
    });

    if (pinFailedAttempts >= PIN_MAX_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { pinFailedAttempts: 0, pinLockedUntil: lockedUntil },
      });
      this.logger.warn({
        step: 'PIN_VERIFY_LOCKED',
        userId: user.id,
        context,
        lockedUntil: lockedUntil.toISOString(),
        msg: `PIN verification locked after ${PIN_MAX_ATTEMPTS} consecutive failures`,
      });
      throw this.lockedException(lockedUntil, now);
    }

    this.logger.warn({
      step: 'PIN_VERIFY_FAILED',
      userId: user.id,
      context,
      failedAttempts: pinFailedAttempts,
      msg: 'Wrong staff PIN',
    });
    return false;
  }

  private lockedException(lockedUntil: Date, now: Date): HttpException {
    const minutes = Math.max(
      1,
      Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000),
    );
    return new HttpException(
      `Terlalu banyak percobaan PIN. Coba lagi dalam ${minutes} menit.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
