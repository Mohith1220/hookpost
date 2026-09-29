export interface EmailInterface {
  name: string;
  validateEnvKeys: string[];
  sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string,
    /** Plain-text alternative. Every email should send one. */
    text?: string
  ): Promise<any>;
}
