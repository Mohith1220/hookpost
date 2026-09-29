import { PrismaRepository } from '@hookpost/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { CreateAgencyDto } from '@hookpost/nestjs-libraries/dtos/agencies/create.agency.dto';

@Injectable()
export class AgenciesRepository {
  constructor(
    private _socialMediaAgencies: PrismaRepository<'socialMediaAgency'>,
    private _socialMediaAgenciesNiche: PrismaRepository<'socialMediaAgencyNiche'>
  ) {}

  getAllAgencies() {
    return this._socialMediaAgencies.model.socialMediaAgency.findMany({
      where: {
        deletedAt: null,
        approved: true,
      },
      include: {
        logo: true,
        niches: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  getCount() {
    return this._socialMediaAgencies.model.socialMediaAgency.count({
      where: {
        deletedAt: null,
        approved: true,
      },
    });
  }

  getAllAgenciesSlug() {
    return this._socialMediaAgencies.model.socialMediaAgency.findMany({
      where: {
        deletedAt: null,
        approved: true,
      },
      select: {
        slug: true,
      },
    });
  }

  getAgencyInformation(agency: string) {
    return this._socialMediaAgencies.model.socialMediaAgency.findFirst({
      where: {
        slug: agency,
        deletedAt: null,
        approved: true,
      },
      include: {
        logo: true,
        niches: true,
      },
    });
  }

  getAgencyByUser(user: User) {
    return this._socialMediaAgencies.model.socialMediaAgency.findFirst({
      where: {
        userId: user.id,
        deletedAt: null,
      },
      include: {
        logo: true,
        niches: true,
      },
    });
  }

  async createAgency(user: User, body: CreateAgencyDto) {
    const insertAgency =
      await this._socialMediaAgencies.model.socialMediaAgency.upsert({
        where: {
          userId: user.id,
        },
        update: {
          userId: user.id,
          name: body.name,
          website: body.website,
          facebook: body.facebook,
          instagram: body.instagram,
          twitter: body.twitter,
          linkedIn: body.linkedIn,
          youtube: body.youtube,
          tiktok: body.tiktok,
          logoId: body.logo.id,
          shortDescription: body.shortDescription,
          description: body.description,
          // No review step: a saved listing is live.
          approved: true,
        },
        create: {
          userId: user.id,
          name: body.name,
          website: body.website,
          facebook: body.facebook,
          instagram: body.instagram,
          twitter: body.twitter,
          linkedIn: body.linkedIn,
          youtube: body.youtube,
          tiktok: body.tiktok,
          logoId: body.logo.id,
          shortDescription: body.shortDescription,
          description: body.description,
          slug: body.name.toLowerCase().replace(/ /g, '-'),
          approved: true,
        },
        select: {
          id: true,
        },
      });

    await this._socialMediaAgenciesNiche.model.socialMediaAgencyNiche.deleteMany(
      {
        where: {
          agencyId: insertAgency.id,
          niche: {
            notIn: body.niches,
          },
        },
      }
    );

    const currentNiche =
      await this._socialMediaAgenciesNiche.model.socialMediaAgencyNiche.findMany(
        {
          where: {
            agencyId: insertAgency.id,
          },
          select: {
            niche: true,
          },
        }
      );

    const addNewNiche = body.niches.filter(
      (n) => !currentNiche.some((c) => c.niche === n)
    );

    await this._socialMediaAgenciesNiche.model.socialMediaAgencyNiche.createMany(
      {
        data: addNewNiche.map((n) => ({
          agencyId: insertAgency.id,
          niche: n,
        })),
      }
    );

    return insertAgency;
  }
}
