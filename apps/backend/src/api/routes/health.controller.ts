import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from '@hookpost/nestjs-libraries/services/health.service';

/**
 * GET /health (https://hookpost.hookstep.in/api/health in production).
 * 200 while the database answers, 503 when it does not. The worker state is in
 * the body; see HealthService for what each field means.
 */
@ApiTags('Health')
@Controller('/health')
export class HealthController {
  constructor(private _healthService: HealthService) {}

  @Get('/')
  async health(@Res() res: Response) {
    const report = await this._healthService.check();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(report.db === 'ok' ? 200 : 503).json(report);
  }
}
