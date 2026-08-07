import { registerAs } from '@nestjs/config';
import { validateEnv } from './env.config';

export default registerAs('app', () => {
  return validateEnv(process.env);
});
