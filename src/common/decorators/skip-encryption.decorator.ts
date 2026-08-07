import { SetMetadata } from '@nestjs/common';

export const IS_SKIP_ENCRYPTION_KEY = 'isSkipEncryption';
export const SkipEncryption = () => SetMetadata(IS_SKIP_ENCRYPTION_KEY, true);
