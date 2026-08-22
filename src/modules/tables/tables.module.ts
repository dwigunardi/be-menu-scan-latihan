import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { TableZonesController } from './table-zones.controller';
import { TableZonesService } from './table-zones.service';

@Module({
  controllers: [TablesController, TableZonesController],
  providers: [TablesService, TableZonesService],
  exports: [TablesService, TableZonesService],
})
export class TablesModule {}
