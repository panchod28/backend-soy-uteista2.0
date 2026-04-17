import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';
import { AppConfigService } from './app-config.service';

@Controller('soyuteista')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get('enabled-modules')
  getEnabledModules() {
    return this.appConfigService.getEnabledModules();
  }

  @Post('get-app-basic-info')
  @HttpCode(200)
  getAppBasicInfo(@Body() body: { phone_version?: string }) {
    return this.appConfigService.getAppBasicInfo(body?.phone_version ?? '0.0.0');
  }
}
