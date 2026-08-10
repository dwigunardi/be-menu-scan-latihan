import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { QueryRevenueDto, QueryTopSellingDto } from './dto/report.dto';

@ApiTags('Reports')
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard-overview')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin single-call aggregated dashboard overview metrics' })
  @ApiResponse({ status: 200, description: 'Consolidated dashboard metrics (KPI, Recent Orders, Top Selling)' })
  async getDashboardOverview() {
    return this.reportsService.getDashboardOverview();
  }

  @Get('revenue')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin revenue, total orders, and average order value' })
  @ApiResponse({ status: 200, description: 'Revenue summary metrics' })
  async getRevenueReport(@Query() query: QueryRevenueDto) {
    return this.reportsService.getRevenueReport(query);
  }

  @Get('top-selling')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin top-selling menu items by quantity & revenue' })
  @ApiResponse({ status: 200, description: 'List of top selling items' })
  async getTopSelling(@Query() query: QueryTopSellingDto) {
    return this.reportsService.getTopSelling(query);
  }
}
