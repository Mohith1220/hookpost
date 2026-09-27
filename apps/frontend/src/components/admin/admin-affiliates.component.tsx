'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@hookpost/helpers/utils/custom.fetch';
import { useUser } from '@hookpost/frontend/components/layout/user.context';
import { useToaster } from '@hookpost/react/toaster/toaster';
import { LoadingComponent } from '@hookpost/frontend/components/layout/loading';
import {
  money,
  moneyList,
} from '@hookpost/frontend/components/affiliates/affiliate.component';

interface Overview {
  affiliates: {
    id: string;
    name: string;
    email: string;
    code: string;
    active: boolean;
    payoutDetails: string | null;
    commissionPercent: number;
    referrals: number;
    pending: Record<string, number>;
    paid: Record<string, number>;
    createdAt: string;
  }[];
  pendingCommissions: {
    id: string;
    organizationId: string;
    paymentId: string;
    amount: number;
    commission: number;
    currency: string;
    createdAt: string;
    affiliate: {
      name: string;
      email: string;
      code: string;
      payoutDetails: string | null;
    };
  }[];
}

/**
 * Commissions are paid by hand. This page lists what is owed, grouped by
 * affiliate, with their payout details; after sending the UPI/bank transfer,
 * tick the rows and record it with the transfer reference.
 */
export const AdminAffiliatesComponent: FC = () => {
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  const { data, isLoading, mutate } = useSWR<Overview>(
    '/affiliates/admin',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load affiliates');
      return res.json();
    }
  );

  const byAffiliate = useMemo(() => {
    const groups = new Map<string, Overview['pendingCommissions']>();
    for (const c of data?.pendingCommissions || []) {
      const k = c.affiliate.code;
      groups.set(k, [...(groups.get(k) || []), c]);
    }
    return [...groups.entries()];
  }, [data]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const markPaid = useCallback(async () => {
    if (!selected.size) return;
    const res = await fetch('/affiliates/admin/commissions/paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected], note: note || undefined }),
    });
    if (!res.ok) {
      toaster.show('Could not record the payout', 'warning');
      return;
    }
    toaster.show(`Marked ${selected.size} commission(s) paid`, 'success');
    setSelected(new Set());
    setNote('');
    mutate();
  }, [fetch, mutate, note, selected, toaster]);

  const voidOne = useCallback(
    async (id: string) => {
      const reason = window.prompt('Why void this commission? (e.g. refunded)');
      if (reason === null) return;
      await fetch(`/affiliates/admin/commissions/${id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reason }),
      });
      toaster.show('Commission voided', 'success');
      mutate();
    },
    [fetch, mutate, toaster]
  );

  const setActive = useCallback(
    async (id: string, active: boolean) => {
      await fetch(`/affiliates/admin/${id}/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      mutate();
    },
    [fetch, mutate]
  );

  if (!user?.isSuperAdmin) {
    return (
      <div className="text-textColor p-[20px]">
        This page is for administrators.
      </div>
    );
  }
  if (isLoading || !data) return <LoadingComponent />;

  return (
    <div className="flex flex-col gap-[20px] text-textColor max-w-[1100px] w-full mx-auto">
      <div>
        <h1 className="text-[24px] font-[700] text-white">Affiliates</h1>
        <p className="text-[13px] opacity-70 mt-[2px]">
          {data.affiliates.length} affiliates ·{' '}
          {data.pendingCommissions.length} unpaid commissions. Pay by UPI or
          bank transfer, then record it here.
        </p>
      </div>

      <section className="flex flex-col gap-[12px]">
        <h2 className="text-[16px] font-[700] text-white">Owed</h2>
        {byAffiliate.length === 0 && (
          <div className="text-[14px] opacity-70">Nothing owed.</div>
        )}
        {byAffiliate.map(([code, rows]) => {
          const total: Record<string, number> = {};
          rows.forEach(
            (r) => (total[r.currency] = (total[r.currency] || 0) + r.commission)
          );
          return (
            <div
              key={code}
              className="rounded-[10px] border border-newTableBorder bg-newBgColorInner overflow-hidden"
            >
              <div className="px-[14px] py-[10px] flex flex-wrap gap-[8px] justify-between">
                <div>
                  <b className="text-white">{rows[0].affiliate.name}</b>{' '}
                  <span className="opacity-60">
                    {rows[0].affiliate.email} · {code}
                  </span>
                  <div className="text-[13px] mt-[2px]">
                    Pay to:{' '}
                    <span className="text-white">
                      {rows[0].affiliate.payoutDetails || 'not given yet'}
                    </span>
                  </div>
                </div>
                <div className="text-[18px] font-[700] text-white">
                  {moneyList(total)}
                </div>
              </div>
              <table className="w-full text-[13px]">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-newTableBorder">
                      <td className="px-[14px] py-[8px] w-[32px]">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                      <td className="px-[8px] py-[8px] whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-[8px] py-[8px] opacity-70">
                        {r.paymentId}
                      </td>
                      <td className="px-[8px] py-[8px]">
                        {money(r.amount, r.currency)} →{' '}
                        <b className="text-white">
                          {money(r.commission, r.currency)}
                        </b>
                      </td>
                      <td className="px-[14px] py-[8px] text-right">
                        <button
                          type="button"
                          onClick={() => voidOne(r.id)}
                          className="text-[12px] underline opacity-60 hover:opacity-100"
                        >
                          Void
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {selected.size > 0 && (
          <div className="flex gap-[8px] flex-wrap items-center">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Transfer reference (UTR / UPI ref)"
              className="h-[38px] flex-1 min-w-[220px] rounded-[8px] bg-newBgColor border border-newTableBorder px-[10px] text-[14px]"
            />
            <button
              type="button"
              onClick={markPaid}
              className="h-[38px] px-[16px] rounded-[8px] bg-emerald-600 text-white font-[600]"
            >
              Mark {selected.size} paid
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-[12px]">
        <h2 className="text-[16px] font-[700] text-white">All affiliates</h2>
        <div className="overflow-x-auto rounded-[10px] border border-newTableBorder">
          <table className="w-full text-[13px]">
            <thead className="text-left opacity-60 bg-newBgColorInner">
              <tr>
                {['Affiliate', 'Code', 'Sign-ups', 'Owed', 'Paid', ''].map((h) => (
                  <th key={h} className="px-[12px] py-[8px] font-[500]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.affiliates.map((a) => (
                <tr key={a.id} className="border-t border-newTableBorder">
                  <td className="px-[12px] py-[8px]">
                    <div className="text-white">{a.name}</div>
                    <div className="opacity-60">{a.email}</div>
                  </td>
                  <td className="px-[12px] py-[8px]">{a.code}</td>
                  <td className="px-[12px] py-[8px]">{a.referrals}</td>
                  <td className="px-[12px] py-[8px]">{moneyList(a.pending)}</td>
                  <td className="px-[12px] py-[8px]">{moneyList(a.paid)}</td>
                  <td className="px-[12px] py-[8px] text-right">
                    <button
                      type="button"
                      onClick={() => setActive(a.id, !a.active)}
                      className="text-[12px] underline opacity-70 hover:opacity-100"
                    >
                      {a.active ? 'Pause' : 'Resume'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
