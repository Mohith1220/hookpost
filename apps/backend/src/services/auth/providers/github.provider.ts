import {
  AuthProvider,
  AuthProviderAbstract,
} from '@hookpost/backend/services/auth/providers.interface';

@AuthProvider({ provider: 'GITHUB' })
export class GithubProvider extends AuthProviderAbstract {
  generateLink(query?: { state?: string }): string {
    return `https://github.com/login/oauth/authorize?client_id=${
      process.env.GITHUB_CLIENT_ID
    }&scope=user:email&state=${
      query?.state || 'login'
    }&redirect_uri=${encodeURIComponent(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/oauth/github/redirect`
    )}`;
  }

  async getToken(code: string, _redirectUri?: string): Promise<string> {
    const { access_token } = await (
      await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/oauth/github/redirect`,
        }),
      })
    ).json();

    return access_token;
  }

  async getUser(
    access_token: string
  ): Promise<{ email: string; id: string; emailVerified: boolean }> {
    const data = await (
      await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    const emails: { email: string; primary: boolean; verified: boolean }[] =
      await (
        await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `token ${access_token}`,
          },
        })
      ).json();

    // The list is not ordered: the account's email is the primary one, and
    // GitHub says per address whether it was verified.
    const { email, verified } =
      emails.find((e) => e.primary) || emails[0];

    return {
      email: email,
      id: String(data.id),
      emailVerified: verified === true,
    };
  }
}
