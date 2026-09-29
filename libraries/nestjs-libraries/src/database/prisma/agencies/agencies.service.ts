import { Injectable } from '@nestjs/common';
import { AgenciesRepository } from '@hookpost/nestjs-libraries/database/prisma/agencies/agencies.repository';
import { User } from '@prisma/client';
import { CreateAgencyDto } from '@hookpost/nestjs-libraries/dtos/agencies/create.agency.dto';
import { NotificationService } from '@hookpost/nestjs-libraries/database/prisma/notifications/notification.service';
import {
  agencyApprovedEmail,
  agencyDeclinedEmail,
  newAgencyAdminEmail,
} from '@hookpost/nestjs-libraries/emails/templates/agency.emails';

@Injectable()
export class AgenciesService {
  constructor(
    private _agenciesRepository: AgenciesRepository,
    private _notificationService: NotificationService
  ) {}
  getAgencyByUser(user: User) {
    return this._agenciesRepository.getAgencyByUser(user);
  }

  getCount() {
    return this._agenciesRepository.getCount();
  }

  getAllAgencies() {
    return this._agenciesRepository.getAllAgencies();
  }

  getAllAgenciesSlug() {
    return this._agenciesRepository.getAllAgenciesSlug();
  }

  getAgencyInformation(agency: string) {
    return this._agenciesRepository.getAgencyInformation(agency);
  }

  async approveOrDecline(email: string, action: string, id: string) {
    await this._agenciesRepository.approveOrDecline(action, id);
    const agency = await this._agenciesRepository.getAgencyById(id);

    if (action === 'approve') {
      const approved = agencyApprovedEmail({
        agencyName: agency?.name,
        agencySlug: agency?.slug,
      });
      await this._notificationService.sendEmail(
        agency?.user?.email!,
        approved.subject,
        approved.html
      );

      return;
    }

    const declined = agencyDeclinedEmail({ agencyName: agency?.name });
    await this._notificationService.sendEmail(
      agency?.user?.email!,
      declined.subject,
      declined.html
    );

    return;
  }

  async createAgency(user: User, body: CreateAgencyDto) {
    const agency = await this._agenciesRepository.createAgency(user, body);
    // Upstream hard-coded its own founder's address here; the rebrand pointed it
    // at a domain this deployment does not own, so the notification would bounce
    // (or reach a stranger). Configure ADMIN_NOTIFICATION_EMAIL to receive it.
    const adminEmail = newAgencyAdminEmail({
      agencyId: agency.id,
      name: body.name,
      website: body.website,
      facebook: body.facebook,
      instagram: body.instagram,
      twitter: body.twitter,
      linkedIn: body.linkedIn,
      youtube: body.youtube,
      tiktok: body.tiktok,
      logoPath: body.logo?.path,
      shortDescription: body.shortDescription,
      description: body.description,
      niches: body.niches,
    });
    await this._notificationService.sendEmail(
      process.env.ADMIN_NOTIFICATION_EMAIL || '',
      adminEmail.subject,
      adminEmail.html
    );
    return agency;
  }
}
