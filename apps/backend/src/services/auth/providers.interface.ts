import { Injectable } from '@nestjs/common';

export abstract class AuthProviderAbstract {
  abstract generateLink(query?: any): Promise<string> | string;
  abstract getToken(code: string, redirectUri?: string): Promise<string>;
  /**
   * emailVerified: the provider vouches that this person controls `email`.
   * Only then may a sign-in claim an existing account that has the same email
   * under another provider (one email, one account). Leave it unset when the
   * provider cannot say, and the sign-in will never link.
   */
  abstract getUser(
    providerToken: string
  ): Promise<{ email: string; id: string; emailVerified?: boolean }> | false;
  async postRegistration(
    providerToken: string,
    orgId: string
  ): Promise<void> {}
}

export interface AuthProviderParams {
  provider: string;
}

export function AuthProvider(params: AuthProviderParams) {
  return function (target: any) {
    Injectable()(target);

    const existingMetadata =
      Reflect.getMetadata('auth-provider', AuthProviderAbstract) || [];

    existingMetadata.push({ target, provider: params.provider });

    Reflect.defineMetadata(
      'auth-provider',
      existingMetadata,
      AuthProviderAbstract
    );
  };
}
