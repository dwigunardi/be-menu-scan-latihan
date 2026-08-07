import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { EcdhService } from './ecdh.service';

@Global()
@Module({
  providers: [CryptoService, EcdhService],
  exports: [CryptoService, EcdhService],
})
export class CryptoModule {}
