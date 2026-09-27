import { Body, Controller, Get, HttpException, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@hookpost/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@hookpost/nestjs-libraries/user/user.from.request';
import { AffiliateService } from '@hookpost/nestjs-libraries/database/prisma/affiliates/affiliate.service';
import {
  AffiliateActiveDto,
  AffiliateMarkPaidDto,
  AffiliateNoteDto,
  AffiliatePayoutDto,
} from '@hookpost/nestjs-libraries/dtos/affiliates/affiliate.dto';

@ApiTags('Affiliates')
@Controller('/affiliates')
export class AffiliatesController {
  constructor(private _affiliateService: AffiliateService) {}

  private assertAdmin(user: User) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 403);
    }
  }

  @Get('/me')
  async me(@GetUserFromRequest() user: User) {
    return { affiliate: await this._affiliateService.getMine(user.id) };
  }

  @Post('/join')
  async join(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization,
    @Body() body: AffiliatePayoutDto
  ) {
    await this._affiliateService.join(user, org, body.payoutDetails);
    return { affiliate: await this._affiliateService.getMine(user.id) };
  }

  @Post('/me/payout')
  async payout(
    @GetUserFromRequest() user: User,
    @Body() body: AffiliatePayoutDto
  ) {
    await this._affiliateService.updatePayout(user.id, body.payoutDetails || '');
    return { affiliate: await this._affiliateService.getMine(user.id) };
  }

  @Get('/admin')
  async admin(@GetUserFromRequest() user: User) {
    this.assertAdmin(user);
    return this._affiliateService.adminOverview();
  }

  @Post('/admin/commissions/paid')
  async markPaid(
    @GetUserFromRequest() user: User,
    @Body() body: AffiliateMarkPaidDto
  ) {
    this.assertAdmin(user);
    return this._affiliateService.markPaid(body.ids, body.note);
  }

  @Post('/admin/commissions/:id/void')
  async voidCommission(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: AffiliateNoteDto
  ) {
    this.assertAdmin(user);
    return this._affiliateService.voidCommission(id, body.note);
  }

  @Post('/admin/:id/active')
  async setActive(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: AffiliateActiveDto
  ) {
    this.assertAdmin(user);
    return this._affiliateService.setActive(id, body.active);
  }
}
