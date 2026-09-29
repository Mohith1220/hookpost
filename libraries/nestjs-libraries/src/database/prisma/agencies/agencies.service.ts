import { HttpException, Injectable } from '@nestjs/common';
import { AgenciesRepository } from '@hookpost/nestjs-libraries/database/prisma/agencies/agencies.repository';
import { User } from '@prisma/client';
import { CreateAgencyDto } from '@hookpost/nestjs-libraries/dtos/agencies/create.agency.dto';
import { NotificationService } from '@hookpost/nestjs-libraries/database/prisma/notifications/notification.service';
import { agencyListedEmail } from '@hookpost/nestjs-libraries/emails/templates/agency.emails';

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

  /**
   * Save the user's agency listing. There is no human review: a saved listing
   * is approved and live straight away. The automatic guards are the DTO
   * (required fields, URLs), an http(s) website that parses as a URL, one
   * listing per user (userId is unique, so a second save updates it), and the
   * same one-per-minute limit the contact form uses.
   */
  async createAgency(user: User, body: CreateAgencyDto) {
    if (!isHttpUrl(body.website)) {
      throw new HttpException('Enter your website as a full http(s) address.', 400);
    }
    for (const field of ['facebook', 'linkedIn', 'youtube'] as const) {
      if (body[field] && !isHttpUrl(body[field])) {
        throw new HttpException(`Enter ${field} as a full http(s) address.`, 400);
      }
    }
    if (!body.logo?.id) {
      throw new HttpException('Add a logo.', 400);
    }

    const existing = await this._agenciesRepository.getAgencyByUser(user);
    if (existing && Date.now() - new Date(existing.updatedAt).getTime() < 60_000) {
      throw new HttpException('Just saved - give it a minute.', 429);
    }

    const agency = await this._agenciesRepository.createAgency(user, body);

    // Only on the first save. Edits are live too, and need no email.
    if (!existing) {
      const listed = agencyListedEmail({ agencyName: body.name });
      await this._notificationService.sendEmail(user.email, listed.subject, listed.html);
    }
    return agency;
  }
}

function isHttpUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}
