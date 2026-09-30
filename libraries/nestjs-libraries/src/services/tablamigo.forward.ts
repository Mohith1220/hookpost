import { createHmac } from 'crypto';

/**
 * Hand Tablamigo's Razorpay events to Tablamigo.
 *
 * One Razorpay account serves Hookpost, Tablamigo and VetNow, and only
 * Hookpost has a webhook for it, so every Tablamigo event lands here first.
 * Tablamigo stamps notes.service = 'tablamigo' on everything it creates. A
 * refund entity carries no notes of its own, so for a refund the payment's
 * notes decide (fetched when the event does not include the payment).
 *
 * The raw Razorpay body is forwarded byte for byte and signed with an HMAC of
 * TABLAMIGO_FORWARD_SECRET, a secret only the two servers hold. Tablamigo
 * re-reads every object from Razorpay before acting, so the signature only has
 * to prove the request came from us.
 *
 * Fire and forget: nothing here may delay or fail Hookpost's own webhook
 * response, so the POST has a short timeout and every error is logged only.
 */
export const TABLAMIGO_SERVICE = 'tablamigo';
export const TABLAMIGO_FORWARD_HEADER = 'x-tablamigo-signature';
export const TABLAMIGO_FORWARD_URL_DEFAULT =
  'https://tablamigo-api.hookstep.in/billing/razorpay/webhook';
const TIMEOUT_MS = 5000;

/** The first notes.service found on the event's entities, if any. */
export function eventService(event: any): string | undefined {
  const p = event?.payload || {};
  for (const key of ['subscription', 'payment', 'refund', 'order', 'invoice']) {
    const service = p?.[key]?.entity?.notes?.service;
    if (typeof service === 'string' && service) return service;
  }
  return undefined;
}

export function signForward(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

type FetchPayment = (paymentId: string) => Promise<any>;

/** Is this a Tablamigo event? Only a refund without a payment needs a lookup. */
export async function isTablamigoEvent(
  event: any,
  fetchPayment: FetchPayment
): Promise<boolean> {
  const direct = eventService(event);
  if (direct) return direct === TABLAMIGO_SERVICE;
  const refund = event?.payload?.refund?.entity;
  if (refund?.payment_id && !event?.payload?.payment?.entity) {
    const payment = await fetchPayment(refund.payment_id).catch(() => null);
    return payment?.notes?.service === TABLAMIGO_SERVICE;
  }
  return false;
}

export async function forwardToTablamigo(
  rawBody: Buffer,
  event: any,
  deps: {
    fetchPayment: FetchPayment;
    log: (message: string) => void;
    eventId?: string;
    secret?: string;
    url?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<'forwarded' | 'not_tablamigo' | 'no_secret' | 'failed'> {
  try {
    if (!(await isTablamigoEvent(event, deps.fetchPayment))) {
      return 'not_tablamigo';
    }
    const secret = deps.secret ?? process.env.TABLAMIGO_FORWARD_SECRET ?? '';
    if (!secret) {
      deps.log(`Tablamigo event ${event?.event} not forwarded: TABLAMIGO_FORWARD_SECRET is unset`);
      return 'no_secret';
    }
    const url =
      deps.url || process.env.TABLAMIGO_FORWARD_URL || TABLAMIGO_FORWARD_URL_DEFAULT;
    const res = await (deps.fetchImpl || fetch)(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Cloudflare fronts the API and blocks some default client agents.
        'user-agent': 'Hookpost-Razorpay-Forwarder/1',
        [TABLAMIGO_FORWARD_HEADER]: signForward(rawBody, secret),
        ...(deps.eventId ? { 'x-razorpay-event-id': deps.eventId } : {}),
      },
      body: rawBody,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      deps.log(`Tablamigo rejected forwarded ${event?.event}: HTTP ${res.status}`);
      return 'failed';
    }
    return 'forwarded';
  } catch (e) {
    deps.log(`Forwarding ${event?.event} to Tablamigo failed: ${e}`);
    return 'failed';
  }
}
