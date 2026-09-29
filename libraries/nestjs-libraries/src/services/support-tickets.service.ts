import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Resend } from 'resend';
import { PrismaRepository } from '@hookpost/nestjs-libraries/database/prisma/prisma.service';
import { appUrl } from '@hookpost/nestjs-libraries/emails/layout/email.layout';
import {
  supportAutoReplyEmail,
  supportInternalEmail,
  supportReplyEmail,
  supportTicketRef,
} from '@hookpost/nestjs-libraries/emails/templates/support.emails';

/** Topics the contact form offers. Anything else is shown to admins only. */
export const SUPPORT_TOPICS = ['Support', 'Billing', 'Self-hosting', 'API & partnerships'];

const SUPPORT_ADDRESS = 'support@hookstep.in';
// A double click or a retry within this window returns the first ticket.
const DEDUPE_MS = 60_000;
// The auto-reply goes to whatever address was typed, so cap how many one
// address can receive: the form must not become a way to mail strangers.
const AUTO_REPLY_MAX_PER_DAY = 3;

export type SubmitResult = { ok: true; ref: string } | { ok: false; error: string };

type SendResult = { sent: boolean; error?: string };

/**
 * Contact-form submissions are support tickets: ContactMessage is the ticket,
 * ContactReply holds what admins sent back. Every email here is best effort;
 * the row is the record and a failed send never fails the request.
 */
@Injectable()
export class SupportTicketsService {
  private readonly _logger = new Logger(SupportTicketsService.name);

  constructor(
    private _contactMessage: PrismaRepository<'contactMessage'>,
    private _contactReply: PrismaRepository<'contactReply'>
  ) {}

  /** The stored ref, or the derived one for rows from before tickets. */
  static refOf(row: { id: string; ref?: string | null }) {
    return row.ref || supportTicketRef(row.id);
  }

  async submit(input: {
    name: string;
    email: string;
    topic: string;
    message: string;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<SubmitResult> {
    const { name, email, topic, message, ip, userAgent } = input;

    // Rate limit off the database, keyed on IP *and* email so two people
    // behind one office NAT do not block each other. The same address sending
    // the same text again inside the window is a double submit: answer with
    // the first ticket instead of an error, and send nothing twice.
    const since = new Date(Date.now() - DEDUPE_MS);
    const recent = await this._contactMessage.model.contactMessage.findMany({
      where: {
        createdAt: { gte: since },
        OR: [...(ip ? [{ ip }] : []), { email }],
      },
      select: { id: true, ref: true, email: true, message: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const duplicate = recent.find(
      (r) => r.email.toLowerCase() === email.toLowerCase() && r.message === message
    );
    if (duplicate) {
      return { ok: true, ref: SupportTicketsService.refOf(duplicate) };
    }
    if (recent.length) {
      return { ok: false, error: 'Just sent one - give it a minute.' };
    }

    const saved = await this.createWithRef({
      name: name || null,
      email,
      topic,
      message,
      ip: ip || null,
      userAgent: userAgent || null,
    });

    const internal = supportInternalEmail({
      ref: saved.ref,
      name,
      email,
      topic,
      message,
      adminUrl: `${appUrl()}/admin/contact?ticket=${saved.id}`,
    });
    const notified = await this.send({
      from: `Hookpost Contact <${process.env.EMAIL_FROM_ADDRESS || SUPPORT_ADDRESS}>`,
      to: process.env.EMAIL_FROM_ADDRESS || SUPPORT_ADDRESS,
      // A reply from the support inbox goes straight to the customer.
      replyTo: email,
      subject: internal.subject,
      text: internal.text,
    });
    await this._contactMessage.model.contactMessage.update({
      where: { id: saved.id },
      data: { emailSent: notified.sent, emailError: notified.error?.slice(0, 500) || null },
    });

    await this.autoReply(saved.ref, { name, email, topic, message });

    return { ok: true, ref: saved.ref };
  }

  async get(id: string) {
    const row = await this._contactMessage.model.contactMessage.findUnique({
      where: { id },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) return null;
    return { ...row, ref: SupportTicketsService.refOf(row) };
  }

  /** Email an admin's reply to the customer and mark the ticket answered. */
  async reply(id: string, body: string, admin: { id: string; email: string }) {
    const ticket = await this._contactMessage.model.contactMessage.findUnique({ where: { id } });
    if (!ticket) return { ok: false as const, error: 'Ticket not found' };

    const ref = SupportTicketsService.refOf(ticket);
    const email = supportReplyEmail({
      ref,
      topic: ticket.topic,
      name: ticket.name,
      reply: body,
      originalMessage: ticket.message,
    });
    const result = await this.send({
      from: `Hookpost Support <${SUPPORT_ADDRESS}>`,
      to: ticket.email,
      replyTo: SUPPORT_ADDRESS,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    const saved = await this._contactReply.model.contactReply.create({
      data: {
        contactMessageId: ticket.id,
        body,
        adminUserId: admin.id,
        adminEmail: admin.email,
        emailSent: result.sent,
        emailError: result.error?.slice(0, 500) || null,
      },
    });
    if (result.sent) {
      await this._contactMessage.model.contactMessage.update({
        where: { id: ticket.id },
        data: {
          answeredAt: saved.createdAt,
          // Answered is still open until someone closes it.
          ...(ticket.state === 'NEW' ? { state: 'READ' as const } : {}),
          ...(ticket.ref ? {} : { ref }),
        },
      });
    }
    return { ok: result.sent, error: result.error, reply: saved };
  }

  // -------------------------------------------------------------------------

  private async createWithRef(data: {
    name: string | null;
    email: string;
    topic: string;
    message: string;
    ip: string | null;
    userAgent: string | null;
  }) {
    const id = randomUUID();
    for (let salt = 0; ; salt++) {
      const ref = supportTicketRef(id, salt);
      try {
        return await this._contactMessage.model.contactMessage.create({
          data: { ...data, id, ref },
          select: { id: true, ref: true },
        }) as { id: string; ref: string };
      } catch (e: any) {
        // P2002 on ref: another ticket already has this 4-character ref.
        if (e?.code !== 'P2002' || salt >= 8) throw e;
      }
    }
  }

  private async autoReply(
    ref: string,
    p: { name: string; email: string; topic: string; message: string }
  ) {
    try {
      const today = await this._contactMessage.model.contactMessage.count({
        where: {
          email: { equals: p.email, mode: 'insensitive' },
          createdAt: { gte: new Date(Date.now() - 86_400_000) },
        },
      });
      if (today > AUTO_REPLY_MAX_PER_DAY) {
        this._logger.warn(`No auto-reply for ${ref}: ${today} messages from this address today`);
        return;
      }
      // Only text we control goes to an address nobody has verified: a
      // first name that is just letters, a known topic, and no copy of the
      // message itself, so the form cannot relay someone else's content.
      const first = (p.name || '').trim().split(/\s+/)[0] || '';
      const email = supportAutoReplyEmail({
        ref,
        name: /^[\p{L}'-]{1,30}$/u.test(first) ? first : null,
        topic: SUPPORT_TOPICS.includes(p.topic) ? p.topic : null,
      });
      const r = await this.send({
        from: `Hookpost Support <${SUPPORT_ADDRESS}>`,
        to: p.email,
        replyTo: SUPPORT_ADDRESS,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (!r.sent) this._logger.error(`Auto-reply for ${ref} failed: ${r.error}`);
    } catch (e) {
      this._logger.error(`Auto-reply for ${ref} failed: ${e}`);
    }
  }

  private async send(m: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    html?: string;
    text: string;
  }): Promise<SendResult> {
    const apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey) {
      this._logger.error(`Not sent (RESEND_API_KEY is unset): ${m.subject}`);
      return { sent: false, error: 'RESEND_API_KEY is unset' };
    }
    try {
      // Resend 3.x resolves with { data, error } instead of throwing on an API
      // error, so the error field has to be checked.
      const { error } = await new Resend(apiKey).emails.send({
        from: m.from,
        to: m.to,
        // Resend 3.5.0 takes snake_case here.
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        subject: m.subject,
        text: m.text,
        ...(m.html ? { html: m.html } : {}),
      });
      if (error) return { sent: false, error: `${error.name}: ${error.message}` };
      return { sent: true };
    } catch (e) {
      return { sent: false, error: String(e) };
    }
  }
}
