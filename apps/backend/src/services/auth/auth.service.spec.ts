import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { decode } from 'jsonwebtoken';
import { Provider, User } from '@prisma/client';
import { CreateOrgUserDto } from '@hookpost/nestjs-libraries/dtos/auth/create.org.user.dto';
import { AuthService } from '@hookpost/backend/services/auth/auth.service';

// AuthService only needs these as injection tokens; the real modules pull in
// Prisma, Redis and storage clients. Each test hands in its own fakes.
jest.mock('@hookpost/nestjs-libraries/database/prisma/users/users.service', () => ({
  UsersService: class {},
}));
jest.mock(
  '@hookpost/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock(
  '@hookpost/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock('@hookpost/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock('@hookpost/backend/services/auth/providers/providers.manager', () => ({
  AuthProviderManager: class {},
}));
jest.mock('@hookpost/nestjs-libraries/newsletter/newsletter.service', () => ({
  NewsletterService: { register: jest.fn().mockResolvedValue(undefined) },
}));

process.env.JWT_SECRET = 'test-secret';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.NOT_SECURED = 'true';

const makeUser = (over: Partial<User>): User =>
  ({
    id: 'user-1',
    email: 'jo@gmail.com',
    password: '',
    providerName: Provider.LOCAL,
    providerId: '',
    activated: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    ...over,
  } as User);

/**
 * An in-memory stand-in for UsersService that matches emails the way the
 * Prisma query does (mode: 'insensitive' on a trimmed value).
 */
const fakeUsers = (users: User[]) => {
  const same = (a: string, b: string) =>
    a.trim().toLowerCase() === b.trim().toLowerCase();
  return {
    users,
    getUserByEmail: jest.fn(async (email: string) =>
      users.find(
        (u) => u.providerName === Provider.LOCAL && same(u.email, email)
      ) || null
    ),
    getUserByEmailAnyProvider: jest.fn(async (email: string) =>
      users.find((u) => same(u.email, email)) || null
    ),
    getUserByProvider: jest.fn(async (providerId: string, provider: Provider) =>
      users.find(
        (u) => u.providerId === providerId && u.providerName === provider
      ) || null
    ),
    activateWithVerifiedEmail: jest.fn(async () => ({ count: 1 })),
  };
};

const setup = (
  users: User[],
  providerUser: { id: string; email: string; emailVerified?: boolean } | false
) => {
  const usersService = fakeUsers(users);
  const organizationService = {
    createOrgAndUser: jest.fn(async (body: any) => ({
      id: 'new-org',
      users: [
        {
          user: makeUser({
            id: 'new-user',
            email: body.email,
            providerName: body.provider,
            providerId: body.providerId,
          }),
        },
      ],
    })),
    addUserToOrg: jest.fn(),
    getCount: jest.fn(async () => 1),
  };
  const provider = {
    getUser: jest.fn(async () => providerUser),
    getToken: jest.fn(async () => 'access-token'),
    postRegistration: jest.fn(),
  };
  const providerManager = { getProvider: jest.fn(() => provider) };
  const emailService = { sendEmail: jest.fn() };
  const notificationService = { sendEmail: jest.fn() };

  const service = new AuthService(
    usersService as any,
    organizationService as any,
    notificationService as any,
    emailService as any,
    providerManager as any
  );
  return {
    service,
    usersService,
    organizationService,
    emailService,
    notificationService,
  };
};

const jwtUserId = (jwt: string) => (decode(jwt) as { id: string }).id;

const googleRegister = (): CreateOrgUserDto =>
  ({
    provider: Provider.GOOGLE,
    providerToken: 'google-access-token',
    company: 'Acme',
  } as CreateOrgUserDto);

const localRegister = (email: string) =>
  plainToInstance(CreateOrgUserDto, {
    provider: Provider.LOCAL,
    email,
    password: 'secret123',
    company: 'Acme',
  });

describe('AuthService: one account per email', () => {
  describe('OAuth sign-in with an email that already has an account', () => {
    it('Google sign-in with an existing LOCAL user logs in as that user and creates no org', async () => {
      const local = makeUser({ id: 'local-1', email: 'Jo@Gmail.com' });
      const { service, organizationService } = setup([local], {
        id: 'google-sub-1',
        email: 'jo@gmail.com',
        emailVerified: true,
      });

      const { jwt } = await service.routeAuth(
        Provider.GOOGLE,
        googleRegister(),
        '127.0.0.1',
        'jest'
      );

      expect(jwtUserId(jwt)).toBe('local-1');
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('the redirect flow signs straight in instead of showing the new-workspace form', async () => {
      const local = makeUser({ id: 'local-1' });
      const { service, organizationService } = setup([local], {
        id: 'google-sub-1',
        email: 'jo@gmail.com',
        emailVerified: true,
      });

      const result = await service.checkExists(
        'GOOGLE',
        'code',
        'hookpost://callback'
      );

      expect(result.token).toBeUndefined();
      expect(jwtUserId(result.jwt!)).toBe('local-1');
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('Google One Tap with an existing LOCAL user logs in as that user and creates no org', async () => {
      const local = makeUser({ id: 'local-1' });
      const { service, organizationService } = setup([local], {
        id: 'google-sub-1',
        email: 'JO@gmail.com',
        emailVerified: true,
      });

      const result = await service.googleOneTap('id-token', '127.0.0.1', 'jest');

      expect(result.registered).toBe(false);
      expect(jwtUserId(result.jwt)).toBe('local-1');
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('a GitHub sign-in with a verified email reaches an existing Google user', async () => {
      const google = makeUser({
        id: 'google-1',
        providerName: Provider.GOOGLE,
        providerId: 'google-sub-1',
      });
      const { service, organizationService } = setup([google], {
        id: 'gh-1',
        email: 'jo@gmail.com',
        emailVerified: true,
      });

      const { jwt } = await service.routeAuth(
        Provider.GITHUB,
        { ...googleRegister(), provider: Provider.GITHUB } as CreateOrgUserDto,
        '127.0.0.1',
        'jest'
      );

      expect(jwtUserId(jwt)).toBe('google-1');
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('activates an unconfirmed password account and drops its unconfirmed password', async () => {
      const local = makeUser({
        id: 'local-1',
        activated: false,
        password: 'hash-typed-by-someone',
      });
      const { service, usersService } = setup([local], {
        id: 'google-sub-1',
        email: 'jo@gmail.com',
        emailVerified: true,
      });

      const { jwt } = await service.routeAuth(
        Provider.GOOGLE,
        googleRegister(),
        '127.0.0.1',
        'jest'
      );

      expect(jwtUserId(jwt)).toBe('local-1');
      expect(usersService.activateWithVerifiedEmail).toHaveBeenCalledWith(
        'local-1'
      );
    });

    it('an unverified Google email does not link and creates nothing', async () => {
      const local = makeUser({ id: 'local-1' });
      const { service, organizationService, usersService } = setup([local], {
        id: 'google-sub-1',
        email: 'jo@gmail.com',
        emailVerified: false,
      });

      await expect(
        service.routeAuth(Provider.GOOGLE, googleRegister(), '127.0.0.1', 'jest')
      ).rejects.toThrow(
        'An account with this email already exists. Sign in with your email and password.'
      );
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
      expect(usersService.activateWithVerifiedEmail).not.toHaveBeenCalled();

      // and the redirect flow hands back the provider token, not a session
      const exists = await service.checkExists(
        'GOOGLE',
        'code',
        'hookpost://callback'
      );
      expect(exists.jwt).toBeUndefined();
      expect(exists.token).toBe('access-token');
    });

    it('a new Google email still registers with its own workspace', async () => {
      const { service, organizationService } = setup([], {
        id: 'google-sub-2',
        email: 'New@Example.com',
        emailVerified: true,
      });

      const { jwt } = await service.routeAuth(
        Provider.GOOGLE,
        googleRegister(),
        '127.0.0.1',
        'jest'
      );

      expect(jwtUserId(jwt)).toBe('new-user');
      expect(organizationService.createOrgAndUser).toHaveBeenCalledTimes(1);
      expect(organizationService.createOrgAndUser.mock.calls[0][0].email).toBe(
        'new@example.com'
      );
    });

    it('an existing Google user is still found by provider id first', async () => {
      const google = makeUser({
        id: 'google-1',
        providerName: Provider.GOOGLE,
        providerId: 'google-sub-1',
      });
      const { service, usersService } = setup([google], {
        id: 'google-sub-1',
        email: 'jo@gmail.com',
        emailVerified: true,
      });

      const { jwt } = await service.routeAuth(
        Provider.GOOGLE,
        googleRegister(),
        '127.0.0.1',
        'jest'
      );

      expect(jwtUserId(jwt)).toBe('google-1');
      expect(usersService.getUserByEmailAnyProvider).not.toHaveBeenCalled();
    });
  });

  describe('password registration', () => {
    it('is refused when the email belongs to a Google user, naming Google', async () => {
      const google = makeUser({
        id: 'google-1',
        providerName: Provider.GOOGLE,
        providerId: 'google-sub-1',
      });
      const { service, organizationService, emailService } = setup(
        [google],
        false
      );

      await expect(
        service.routeAuth(
          Provider.LOCAL,
          localRegister('jo@gmail.com'),
          '127.0.0.1',
          'jest'
        )
      ).rejects.toThrow(
        'An account with this email already exists. Sign in with Google.'
      );
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('refuses a case and space variant of an existing email', async () => {
      const google = makeUser({
        id: 'google-1',
        providerName: Provider.GOOGLE,
        providerId: 'google-sub-1',
      });
      const { service, organizationService, usersService } = setup(
        [google],
        false
      );

      await expect(
        service.routeAuth(
          Provider.LOCAL,
          localRegister('  JO@Gmail.COM '),
          '127.0.0.1',
          'jest'
        )
      ).rejects.toThrow('Sign in with Google');
      expect(usersService.getUserByEmailAnyProvider).toHaveBeenCalledWith(
        'jo@gmail.com'
      );
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('refuses an existing password account too', async () => {
      const { service, organizationService } = setup([makeUser({})], false);

      await expect(
        service.routeAuth(
          Provider.LOCAL,
          localRegister('Jo@gmail.com'),
          '127.0.0.1',
          'jest'
        )
      ).rejects.toThrow('Sign in with your email and password');
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('the DTO trims and lower-cases the email before it is validated', async () => {
      const dto = localRegister('  JO@Gmail.COM ');
      expect(dto.email).toBe('jo@gmail.com');
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('password reset', () => {
    it('sends a reset to the LOCAL user, found case-insensitively', async () => {
      const { service, notificationService } = setup(
        [makeUser({ id: 'local-1' })],
        false
      );

      await service.forgot(' Jo@Gmail.com ');

      expect(notificationService.sendEmail).toHaveBeenCalledTimes(1);
      expect(notificationService.sendEmail.mock.calls[0][0]).toBe(
        'jo@gmail.com'
      );
    });

    it('does nothing for an OAuth-only user and creates no account', async () => {
      const google = makeUser({
        id: 'google-1',
        providerName: Provider.GOOGLE,
        providerId: 'google-sub-1',
      });
      const { service, notificationService, organizationService } = setup(
        [google],
        false
      );

      expect(await service.forgot('jo@gmail.com')).toBe(false);
      expect(notificationService.sendEmail).not.toHaveBeenCalled();
      expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    });
  });
});
