import { Injectable, Logger } from '@nestjs/common';
import { Provider, User } from '@prisma/client';
import { CreateOrgUserDto } from '@hookpost/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@hookpost/nestjs-libraries/dtos/auth/login.user.dto';
import { UsersService } from '@hookpost/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@hookpost/nestjs-libraries/database/prisma/organizations/organization.service';
import { AuthService as AuthChecker } from '@hookpost/helpers/auth/auth.service';
import { AuthProviderManager } from '@hookpost/backend/services/auth/providers/providers.manager';
import dayjs from 'dayjs';
import { NotificationService } from '@hookpost/nestjs-libraries/database/prisma/notifications/notification.service';
import { ForgotReturnPasswordDto } from '@hookpost/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { EmailService } from '@hookpost/nestjs-libraries/services/email.service';
import { NewsletterService } from '@hookpost/nestjs-libraries/newsletter/newsletter.service';
import {
  activationEmail,
  passwordResetEmail,
} from '@hookpost/nestjs-libraries/emails/templates/auth.emails';

// Emails are compared case-insensitively and without surrounding spaces, so
// " Jo@Gmail.com" and "jo@gmail.com" are the same person.
const normaliseEmail = (email?: string | null) =>
  (email || '').trim().toLowerCase();

const PROVIDER_SIGN_IN: Record<Provider, string> = {
  LOCAL: 'your email and password',
  GOOGLE: 'Google',
  GITHUB: 'GitHub',
  APPLE: 'Apple',
  FARCASTER: 'Farcaster',
  WALLET: 'your wallet',
  GENERIC: 'single sign-on',
};

// Registration already answers "Email already exists", so naming the way in
// tells a stranger nothing the sign-up form did not, and saves the owner a
// second account.
export const existingAccountMessage = (provider: Provider) =>
  `An account with this email already exists. Sign in with ${
    PROVIDER_SIGN_IN[provider] || 'the method you used before'
  }.`;

@Injectable()
export class AuthService {
  private readonly _logger = new Logger(AuthService.name);

  constructor(
    private _userService: UsersService,
    private _organizationService: OrganizationService,
    private _notificationService: NotificationService,
    private _emailService: EmailService,
    private _providerManager: AuthProviderManager
  ) {}
  async canRegister(provider: string) {
    if (
      process.env.DISABLE_REGISTRATION !== 'true' ||
      provider === Provider.GENERIC
    ) {
      return true;
    }

    return (await this._organizationService.getCount()) === 0;
  }

  async routeAuth(
    provider: Provider,
    body: CreateOrgUserDto | LoginUserDto,
    ip: string,
    userAgent: string,
    addToOrg?: boolean | { orgId: string; role: 'USER' | 'ADMIN'; id: string }
  ) {
    if (provider === Provider.LOCAL) {
      body.email = normaliseEmail(body.email);
      if (process.env.DISALLOW_PLUS && body.email.includes('+')) {
        throw new Error('Email with plus sign is not allowed');
      }
      if (body instanceof CreateOrgUserDto) {
        // Any provider, not just LOCAL: a Google user registering a password
        // would otherwise get a second account and a second workspace.
        const existing = await this._userService.getUserByEmailAnyProvider(
          body.email
        );
        if (existing) {
          throw new Error(existingAccountMessage(existing.providerName));
        }

        if (!(await this.canRegister(provider))) {
          throw new Error('Registration is disabled');
        }

        const create = await this._organizationService.createOrgAndUser(
          body,
          ip,
          userAgent
        );

        const addedOrg =
          addToOrg && typeof addToOrg !== 'boolean'
            ? await this._organizationService.addUserToOrg(
                create.users[0].user.id,
                addToOrg.id,
                addToOrg.orgId,
                addToOrg.role
              )
            : false;

        const obj = { addedOrg, jwt: await this.jwt(create.users[0].user) };
        const activation = activationEmail({
          activationUrl: `${process.env.FRONTEND_URL}/auth/activate/${obj.jwt}`,
        });
        await this._emailService.sendEmail(
          body.email,
          activation.subject,
          activation.html,
          'top'
        );
        return obj;
      }

      const user = await this._userService.getUserByEmail(body.email);
      if (
        !user ||
        !user.password ||
        !AuthChecker.comparePassword(body.password, user.password)
      ) {
        throw new Error('Invalid user name or password');
      }

      if (!user.activated) {
        throw new Error('User is not activated');
      }

      return { addedOrg: false, jwt: await this.jwt(user) };
    }

    const user = await this.loginOrRegisterProvider(
      provider,
      body as CreateOrgUserDto,
      ip,
      userAgent
    );

    const addedOrg =
      addToOrg && typeof addToOrg !== 'boolean'
        ? await this._organizationService.addUserToOrg(
            user.id,
            addToOrg.id,
            addToOrg.orgId,
            addToOrg.role
          )
        : false;
    return { addedOrg, jwt: await this.jwt(user) };
  }

  public getOrgFromCookie(cookie?: string) {
    if (!cookie) {
      return false;
    }

    try {
      const getOrg: any = AuthChecker.verifyJWT(cookie);
      if (dayjs(getOrg.timeLimit).isBefore(dayjs())) {
        return false;
      }

      return getOrg as {
        email: string;
        role: 'USER' | 'ADMIN';
        orgId: string;
        id: string;
      };
    } catch (err) {
      return false;
    }
  }

  private async loginOrRegisterProvider(
    provider: Provider,
    body: CreateOrgUserDto,
    ip: string,
    userAgent: string
  ) {
    const providerInstance = this._providerManager.getProvider(provider);
    const providerUser = await providerInstance.getUser(body.providerToken);

    if (!providerUser) {
      throw new Error('Invalid provider token');
    }

    const user = await this._userService.getUserByProvider(
      providerUser.id,
      provider
    );
    if (user) {
      return user;
    }

    const existing = await this.existingUserForEmail(provider, providerUser);
    if (existing) {
      return existing;
    }

    if (!(await this.canRegister(provider))) {
      throw new Error('Registration is disabled');
    }

    const create = await this._organizationService.createOrgAndUser(
      {
        company: body.company,
        // Wallet and Farcaster "emails" are ids, and are left as they are
        email: providerUser.email?.includes('@')
          ? normaliseEmail(providerUser.email)
          : providerUser.email,
        password: '',
        provider,
        providerId: providerUser.id,
        datafast_visitor_id: body.datafast_visitor_id,
      },
      ip,
      userAgent
    );

    this._track('register', providerUser.email, body.datafast_visitor_id).catch(
      (err) => {}
    );

    await NewsletterService.register(providerUser.email);

    try {
      if (providerInstance?.postRegistration) {
        await providerInstance.postRegistration(body.providerToken, create.id);
      }
    } catch (err) {
      // Don't fail registration if postRegistration fails
    }

    return create.users[0].user;
  }

  /**
   * One email, one account. A sign-in whose email already belongs to a user
   * under another provider (a password account, or Google when this is
   * GitHub) signs in as that user instead of creating a second one with its
   * own workspace. Only a provider-verified email may claim an account:
   * otherwise anyone could make an OAuth identity carrying someone else's
   * address. Nothing is stored about the link; the next sign-in finds the
   * same user the same way.
   *
   * Returns null when nobody holds the email. Throws when someone does but
   * the provider could not vouch for the address.
   */
  private async existingUserForEmail(
    provider: Provider,
    providerUser: { id: string; email: string; emailVerified?: boolean }
  ) {
    const email = normaliseEmail(providerUser.email);
    if (!email.includes('@')) {
      return null;
    }

    const existing = await this._userService.getUserByEmailAnyProvider(email);
    if (!existing) {
      return null;
    }

    if (!providerUser.emailVerified) {
      throw new Error(existingAccountMessage(existing.providerName));
    }

    if (existing.providerName === Provider.LOCAL && !existing.activated) {
      await this._userService.activateWithVerifiedEmail(existing.id);
      existing.activated = true;
      existing.password = '';
    }

    this._logger.log(
      `${provider} sign-in ${providerUser.id} matched existing ${existing.providerName} user ${existing.id} by verified email`
    );
    return existing;
  }

  private async _track(
    name: string,
    email: string,
    datafast_visitor_id: string
  ) {
    if (email && datafast_visitor_id && process.env.DATAFAST_API_KEY) {
      try {
        await fetch('https://datafa.st/api/v1/goals', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.DATAFAST_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            datafast_visitor_id: datafast_visitor_id,
            name: name,
            metadata: {
              email,
            },
          }),
        });
      } catch (err) {}
    }
  }

  async forgot(email: string) {
    // LOCAL only: an OAuth-only user has no password to reset, and must not
    // get a password account created alongside the one they have.
    const user = await this._userService.getUserByEmail(normaliseEmail(email));
    if (!user || user.providerName !== Provider.LOCAL) {
      return false;
    }

    const resetValues = AuthChecker.signJWT({
      id: user.id,
      expires: dayjs().add(20, 'minutes').format('YYYY-MM-DD HH:mm:ss'),
    });

    const reset = passwordResetEmail({
      resetUrl: `${process.env.FRONTEND_URL}/auth/forgot/${resetValues}`,
      expiresInMinutes: 20,
    });
    await this._notificationService.sendEmail(
      user.email,
      reset.subject,
      reset.html
    );
  }

  forgotReturn(body: ForgotReturnPasswordDto) {
    const user = AuthChecker.verifyJWT(body.token) as {
      id: string;
      expires: string;
    };
    if (dayjs(user.expires).isBefore(dayjs())) {
      return false;
    }

    return this._userService.updatePassword(user.id, body.password);
  }

  async activate(code: string, tracking: string) {
    const user = AuthChecker.verifyJWT(code) as {
      id: string;
      activated: boolean;
      email: string;
    };
    if (user.id && !user.activated) {
      const getUserAgain = await this._userService.getUserByEmail(user.email);
      if (getUserAgain.activated) {
        return false;
      }
      await this._userService.activateUser(user.id);
      user.activated = true;
      this._track('register', user.email, tracking).catch((err) => {});
      await NewsletterService.register(user.email);
      return this.jwt(user as any);
    }

    return false;
  }

  async resendActivationEmail(email: string) {
    const user = await this._userService.getUserByEmail(email);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.activated) {
      throw new Error('Account is already activated');
    }

    const jwt = await this.jwt(user);

    const activation = activationEmail({
      activationUrl: `${process.env.FRONTEND_URL}/auth/activate/${jwt}`,
    });
    await this._emailService.sendEmail(
      user.email,
      activation.subject,
      activation.html,
      'top'
    );

    return true;
  }

  oauthLink(provider: string, query?: any) {
    const providerInstance = this._providerManager.getProvider(provider);
    return providerInstance.generateLink(query);
  }

  async checkExists(
    provider: string,
    code: string,
    redirectUri?: string,
    state?: string,
    stateCookie?: string
  ) {
    // the mobile app passes redirect_uri and keeps no cookies, the web flow
    // never passes it, so the state nonce is only enforced for the web flow
    if (
      !process.env.NOT_SECURED &&
      !redirectUri &&
      (!state || state !== stateCookie)
    ) {
      throw new Error('Invalid state');
    }

    const providerInstance = this._providerManager.getProvider(provider);
    const token = await providerInstance.getToken(code, redirectUri);
    const user = await providerInstance.getUser(token);
    if (!user) {
      throw new Error('Invalid user');
    }
    const checkExists = await this._userService.getUserByProvider(
      user.id,
      provider as Provider
    );
    if (checkExists) {
      return { jwt: await this.jwt(checkExists) };
    }

    // Same email, other provider: sign straight in rather than showing the
    // new-workspace form. An unverified email falls through to that form,
    // whose submit (loginOrRegisterProvider) refuses it with the reason.
    if (user.emailVerified) {
      const existing = await this.existingUserForEmail(
        provider as Provider,
        user
      );
      if (existing) {
        return { jwt: await this.jwt(existing) };
      }
    }

    return { token };
  }

  /**
   * Google One Tap: the browser posts the ID token Google gave it. An existing
   * Google user is logged in; a new one is registered in the same step with a
   * default workspace name they can rename later, because One Tap has no form
   * to collect one. Same user record as the redirect flow (providerId = sub).
   */
  async googleOneTap(credential: string, ip: string, userAgent: string) {
    const providerInstance = this._providerManager.getProvider(Provider.GOOGLE);
    const googleUser = (await providerInstance.getUser(credential)) as
      | { id: string; email: string; name?: string; emailVerified?: boolean }
      | false;
    if (!googleUser) {
      throw new Error('Invalid Google credential');
    }

    const existing = await this._userService.getUserByProvider(
      googleUser.id,
      Provider.GOOGLE
    );
    if (existing) {
      return { jwt: await this.jwt(existing), registered: false };
    }

    const sameEmail = await this.existingUserForEmail(
      Provider.GOOGLE,
      googleUser
    );
    if (sameEmail) {
      return { jwt: await this.jwt(sameEmail), registered: false };
    }

    const name = (googleUser.name || googleUser.email.split('@')[0]).trim();
    const company = `${name}'s workspace`.slice(0, 128);
    const { jwt } = await this.routeAuth(
      Provider.GOOGLE,
      {
        provider: Provider.GOOGLE,
        providerToken: credential,
        company: company.length >= 3 ? company : 'My workspace',
      } as CreateOrgUserDto,
      ip,
      userAgent
    );
    return { jwt, registered: true };
  }

  private async jwt(user: User) {
    if (user.password) {
      delete user.password;
    }
    return AuthChecker.signJWT(user);
  }
}
