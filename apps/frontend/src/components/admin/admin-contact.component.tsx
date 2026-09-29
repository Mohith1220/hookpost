'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import copy from 'copy-to-clipboard';
import Link from 'next/link';
import { useFetch } from '@hookpost/helpers/utils/custom.fetch';
import { useUser } from '@hookpost/frontend/components/layout/user.context';
import { useToaster } from '@hookpost/react/toaster/toaster';
import { LoadingComponent } from '@hookpost/frontend/components/layout/loading';

type State = 'NEW' | 'READ' | 'DONE';

interface ContactMessage {
  id: string;
  name: string | null;
  email: string;
  topic: string;
  message: string;
  state: State;
  ip: string | null;
  userAgent: string | null;
  emailSent: boolean;
  emailError: string | null;
  ref: string;
  answeredAt: string | null;
  createdAt: string;
}

interface ContactReply {
  id: string;
  body: string;
  adminEmail: string | null;
  emailSent: boolean;
  emailError: string | null;
  createdAt: string;
}

interface TicketDetail extends ContactMessage {
  replies: ContactReply[];
}

interface Response {
  messages: ContactMessage[];
  total: number;
  newCount: number;
  failedCount: number;
}

const STATE_STYLES: Record<State, string> = {
  NEW: 'bg-[#FF4CE2]/15 text-[#FF4CE2] border-[#FF4CE2]/30',
  READ: 'bg-white/5 text-textColor border-newTableBorder',
  DONE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Open = NEW or READ; a reply sets answeredAt; DONE = closed.
const statusOf = (row: ContactMessage) =>
  row.state === 'DONE' ? 'CLOSED' : row.answeredAt ? 'ANSWERED' : row.state === 'NEW' ? 'NEW' : 'OPEN';

const STATUS_STYLES: Record<string, string> = {
  NEW: STATE_STYLES.NEW,
  OPEN: STATE_STYLES.READ,
  ANSWERED: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  CLOSED: STATE_STYLES.DONE,
};

const useTicket = (id: string | null) => {
  const fetch = useFetch();
  return useSWR<TicketDetail>(id ? `/admin/contact-messages/${id}` : null, async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load ticket');
    return res.json();
  });
};

const Thread: FC<{ row: ContactMessage; onChanged: () => void }> = ({ row, onChanged }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useTicket(row.id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (draft.trim().length < 2) return;
    setSending(true);
    try {
      const res = await fetch(`/admin/contact-messages/${row.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out?.ok) {
        toaster.show(`Reply emailed to ${row.email}`, 'success');
        setDraft('');
      } else {
        toaster.show(out?.error || out?.message || 'Reply saved but the email failed', 'warning');
      }
      mutate();
      onChanged();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-[10px]">
      {(data?.replies || []).map((r) => (
        <div
          key={r.id}
          className="border border-sky-500/20 bg-sky-500/[0.04] rounded-[8px] p-[12px]"
        >
          <div className="text-[11px] opacity-60 mb-[6px]">
            {r.adminEmail || 'admin'} · {when(r.createdAt)}
            {r.emailSent ? ' · emailed' : ` · email failed${r.emailError ? `: ${r.emailError}` : ''}`}
          </div>
          <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.6]">{r.body}</div>
        </div>
      ))}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        placeholder={`Reply to ${row.email}. Sent from support@hookstep.in with ${row.ref} in the subject.`}
        className="bg-newBgColorInnerInner border border-newTableBorder rounded-[8px] p-[10px] text-[13px] outline-none w-full"
      />
      <div>
        <button
          type="button"
          disabled={sending || draft.trim().length < 2}
          onClick={send}
          className="px-[14px] h-[32px] rounded-[6px] text-[13px] font-[600] bg-primary text-white hover:opacity-90 disabled:opacity-40"
        >
          {sending ? 'Sending…' : 'Send reply'}
        </button>
      </div>
      <div className="text-[11px] opacity-50">
        When the customer answers, the reply lands in the support@hookstep.in inbox with {row.ref} in
        the subject. Search the inbox for the ref; this page only records replies sent from here.
      </div>
    </div>
  );
};

const Row: FC<{
  row: ContactMessage;
  onState: (id: string, s: State) => void;
  onChanged: () => void;
  initiallyOpen?: boolean;
}> = ({ row, onState, onChanged, initiallyOpen }) => {
  const [open, setOpen] = useState(!!initiallyOpen);
  const toaster = useToaster();
  const status = statusOf(row);

  return (
    <div className="border border-newTableBorder rounded-[8px] bg-newBgColorInner overflow-hidden">
      <div
        className="flex items-start gap-[12px] p-[14px] cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[8px] flex-wrap">
            <span className="text-[12px] font-[700] text-white">{row.ref}</span>
            <span
              className={`px-[8px] py-[2px] rounded-[4px] text-[11px] font-[600] border ${STATUS_STYLES[status]}`}
            >
              {status}
            </span>
            <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-[500] bg-white/5 border border-newTableBorder">
              {row.topic}
            </span>
            {!row.emailSent && (
              <span
                className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-[600] bg-amber-500/10 text-amber-400 border border-amber-500/30"
                title={row.emailError || 'The notification email did not send'}
              >
                email failed
              </span>
            )}
            <span className="text-[12px] opacity-60">{when(row.createdAt)}</span>
          </div>
          <div className="mt-[6px] text-[14px] font-[600] text-white truncate">
            {row.name || '(no name)'}{' '}
            <span className="font-[400] opacity-70">{row.email}</span>
          </div>
          {!open && (
            <div className="mt-[2px] text-[13px] opacity-70 truncate">
              {row.message}
            </div>
          )}
        </div>
        <div className="text-[12px] opacity-50 shrink-0">{open ? '▲' : '▼'}</div>
      </div>

      {open && (
        <div className="px-[14px] pb-[14px] flex flex-col gap-[12px]">
          <pre className="whitespace-pre-wrap break-words text-[13px] leading-[1.6] bg-newBgColorInnerInner border border-newTableBorder rounded-[8px] p-[12px]">
            {row.message}
          </pre>

          {row.emailError && (
            <div className="text-[12px] text-amber-400 break-words">
              Email error: {row.emailError}
            </div>
          )}

          <div className="text-[11px] opacity-50 break-words">
            {row.ip ? `IP ${row.ip}` : 'no IP'}
            {row.userAgent ? ` · ${row.userAgent}` : ''}
          </div>

          <Thread row={row} onChanged={onChanged} />

          <div className="flex flex-wrap gap-[8px]">
            <button
              type="button"
              onClick={() => {
                copy(row.email);
                toaster.show('Email copied', 'success');
              }}
              className="px-[14px] h-[32px] rounded-[6px] text-[13px] font-[500] bg-white/5 border border-newTableBorder hover:bg-white/10"
            >
              Copy address
            </button>
            {row.state !== 'READ' && (
              <button
                type="button"
                onClick={() => onState(row.id, 'READ')}
                className="px-[14px] h-[32px] rounded-[6px] text-[13px] font-[500] bg-white/5 border border-newTableBorder hover:bg-white/10"
              >
                Mark read
              </button>
            )}
            {row.state !== 'DONE' && (
              <button
                type="button"
                onClick={() => onState(row.id, 'DONE')}
                className="px-[14px] h-[32px] rounded-[6px] text-[13px] font-[500] bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30"
              >
                Close ticket
              </button>
            )}
            {row.state === 'DONE' && (
              <button
                type="button"
                onClick={() => onState(row.id, 'READ')}
                className="px-[14px] h-[32px] rounded-[6px] text-[13px] font-[500] bg-white/5 border border-newTableBorder hover:bg-white/10"
              >
                Reopen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminContactComponent: FC = () => {
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();

  const searchParams = useSearchParams();
  const linkedTicket = searchParams?.get('ticket') || null;
  const [state, setState] = useState<'ALL' | 'OPEN' | 'ANSWERED' | State>(
    linkedTicket ? 'ALL' : 'OPEN'
  );
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(state !== 'ALL' ? { state } : {}),
    ...(search ? { search } : {}),
  });

  const { data, isLoading, mutate } = useSWR<Response>(
    `/admin/contact-messages?${query.toString()}`,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json();
    },
    { refreshInterval: 60000 }
  );

  const onState = useCallback(
    async (id: string, next: State) => {
      await fetch(`/admin/contact-messages/${id}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: next }),
      });
      toaster.show(next === 'DONE' ? 'Ticket closed' : next === 'READ' ? 'Ticket open' : 'Updated', 'success');
      mutate();
    },
    [fetch, mutate, toaster]
  );

  if (!user?.isSuperAdmin) {
    return (
      <div className="text-textColor p-[20px]">
        This page is for administrators.
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="flex flex-col gap-[16px] text-textColor max-w-[1000px] w-full mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-[16px]">
        <div>
          <h1 className="text-[24px] font-[700] text-white flex items-center gap-[8px]">
            <span>✉️</span> Support tickets
          </h1>
          <p className="text-[13px] opacity-70 mt-[2px]">
            Every contact-form message is a ticket with a ref (HP-XXXX). The
            customer gets an automatic confirmation; replies typed here are emailed
            to them from support@hookstep.in.
          </p>
        </div>

        <div className="flex items-center gap-[8px] bg-newBgColorInner border border-newTableBorder p-[4px] rounded-[10px]">
          <Link
            href="/admin/users"
            className="px-[14px] py-[6px] rounded-[6px] text-[13px] font-[500] text-textColor hover:text-white hover:bg-white/5 transition-all"
          >
            👥 Users &amp; Billing
          </Link>
          <Link
            href="/admin/stats"
            className="px-[14px] py-[6px] rounded-[6px] text-[13px] font-[500] text-textColor hover:text-white hover:bg-white/5 transition-all"
          >
            📊 Social Stats
          </Link>
          <Link
            href="/admin/errors"
            className="px-[14px] py-[6px] rounded-[6px] text-[13px] font-[500] text-textColor hover:text-white hover:bg-white/5 transition-all"
          >
            ⚠️ Error Logs
          </Link>
          <Link
            href="/admin/contact"
            className="px-[14px] py-[6px] rounded-[6px] text-[13px] font-[600] bg-primary text-white"
          >
            ✉️ Contact
          </Link>
        </div>
      </div>

      {data && data.failedCount > 0 && (
        <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[10px] text-[13px] text-amber-300">
          {data.failedCount} message{data.failedCount === 1 ? '' : 's'} never
          reached the support inbox. They are listed here — the email is the only
          thing that failed, not the message.
        </div>
      )}

      <div className="flex flex-wrap gap-[12px] items-end bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[12px] opacity-70">Status</div>
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value as any);
              setPage(1);
            }}
            className="bg-newBgColorInnerInner border border-newTableBorder rounded-[6px] h-[36px] px-[10px] text-[13px] outline-none"
          >
            <option value="OPEN">Open</option>
            <option value="NEW">New{data ? ` (${data.newCount})` : ''}</option>
            <option value="ANSWERED">Answered</option>
            <option value="DONE">Closed</option>
            <option value="ALL">All</option>
          </select>
        </div>
        <div className="flex flex-col gap-[6px] flex-1 min-w-[220px]">
          <div className="text-[12px] opacity-70">Search</div>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="ref (HP-7K2Q), name, email or message text"
            className="bg-newBgColorInnerInner border border-newTableBorder rounded-[6px] h-[36px] px-[10px] text-[13px] outline-none w-full"
          />
        </div>
      </div>

      {isLoading && !data ? (
        <LoadingComponent />
      ) : !data || data.messages.length === 0 ? (
        <div className="border border-newTableBorder rounded-[8px] bg-newBgColorInner p-[32px] text-center">
          <div className="text-[15px] font-[600] text-white">
            Nothing here yet
          </div>
          <div className="text-[13px] opacity-70 mt-[4px]">
            Messages sent through the contact page will appear here.
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[13px] opacity-70">
            <span>
              {data.total} message{data.total === 1 ? '' : 's'}
            </span>
            <span>
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="flex flex-col gap-[8px]">
            {data.messages.map((m) => (
              <Row
                key={m.id}
                row={m}
                onState={onState}
                onChanged={() => mutate()}
                initiallyOpen={m.id === linkedTicket}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-[8px]">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-[14px] h-[34px] rounded-[6px] text-[13px] bg-white/5 border border-newTableBorder disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-[14px] h-[34px] rounded-[6px] text-[13px] bg-white/5 border border-newTableBorder disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
