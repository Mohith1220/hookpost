'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import copy from 'copy-to-clipboard';
import { useFetch } from '@hookpost/helpers/utils/custom.fetch';
import { useToaster } from '@hookpost/react/toaster/toaster';
import { LoadingComponent } from '@hookpost/frontend/components/layout/loading';

type Money = Record<string, number>;

interface Affiliate {
  code: string;
  couponPercent: number;
  active: boolean;
  commissionPercent: number;
  commissionMonths: number;
  payoutDetails: string | null;
  referrals: number;
  payingCustomers: number;
  pending: Money;
  paid: Money;
  recent: {
    id: string;
    createdAt: string;
    amount: number;
    commission: number;
    currency: string;
    status: 'PENDING' | 'PAID' | 'VOID';
  }[];
}

const SITE = 'https://hookpost.hookstep.in';

export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);

export const moneyList = (m: Money) => {
  const parts = Object.entries(m).map(([c, v]) => money(v, c));
  return parts.length ? parts.join(' + ') : money(0, 'INR');
};

const Stat: FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="flex-1 min-w-[150px] rounded-[10px] border border-newTableBorder bg-newBgColorInner p-[16px]">
    <div className="text-[12px] uppercase tracking-wider opacity-60">{label}</div>
    <div className="text-[24px] font-[700] text-white mt-[4px]">{value}</div>
    {hint && <div className="text-[12px] opacity-60 mt-[2px]">{hint}</div>}
  </div>
);

export const AffiliateComponent: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const [payout, setPayout] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, mutate } = useSWR<{ affiliate: Affiliate | null }>(
    '/affiliates/me',
    async (url: string) => (await fetch(url)).json()
  );
  const affiliate = data?.affiliate;

  useEffect(() => {
    setPayout(affiliate?.payoutDetails || '');
  }, [affiliate?.payoutDetails]);

  const join = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/affiliates/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutDetails: payout || undefined }),
      });
      if (!res.ok) throw new Error();
      await mutate(await res.json(), { revalidate: false });
      toaster.show('You are in. Share your link to start earning.', 'success');
    } catch {
      toaster.show('Could not join right now. Please try again.', 'warning');
    } finally {
      setBusy(false);
    }
  }, [fetch, mutate, payout, toaster]);

  const savePayout = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/affiliates/me/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutDetails: payout }),
      });
      if (!res.ok) throw new Error();
      await mutate(await res.json(), { revalidate: false });
      toaster.show('Payout details saved', 'success');
    } catch {
      toaster.show('Could not save. Please try again.', 'warning');
    } finally {
      setBusy(false);
    }
  }, [fetch, mutate, payout, toaster]);

  if (isLoading) return <LoadingComponent />;

  const payoutField = (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-[600] text-white">
        Where should we pay you?
      </span>
      <textarea
        value={payout}
        onChange={(e) => setPayout(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="UPI ID (e.g. name@okaxis), or bank account + IFSC, or PayPal email"
        className="rounded-[8px] bg-newBgColor border border-newTableBorder p-[10px] text-[14px] text-textColor outline-none focus:border-[#FF4CE2]/60"
      />
    </label>
  );

  if (!affiliate) {
    return (
      <div className="flex flex-col gap-[20px] text-textColor max-w-[760px] w-full mx-auto">
        <div>
          <h1 className="text-[26px] font-[700] text-white">
            Earn 30% for every customer you send
          </h1>
          <p className="mt-[8px] text-[15px] opacity-80 leading-relaxed">
            Share your Hookpost link. When someone signs up through it and
            pays, you get <b className="text-white">30% of every payment</b>{' '}
            they make for their first <b className="text-white">12 months</b>.
            Standard is ₹599 a month, so one customer on it earns you about
            ₹2,156 over the year.
          </p>
        </div>
        <ul className="grid gap-[10px] sm:grid-cols-3 text-[14px]">
          {[
            ['Free to join', 'Any Hookpost account, free plan included.'],
            ['10% off for them', 'Your code is also a coupon for your audience.'],
            ['Paid monthly', 'By UPI or bank transfer, once you pass ₹1,000.'],
          ].map(([t, d]) => (
            <li
              key={t}
              className="rounded-[10px] border border-newTableBorder bg-newBgColorInner p-[14px]"
            >
              <div className="font-[700] text-white">{t}</div>
              <div className="opacity-70 mt-[4px]">{d}</div>
            </li>
          ))}
        </ul>
        {payoutField}
        <div className="flex items-center gap-[12px] flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={join}
            className="h-[44px] px-[22px] rounded-[8px] bg-[#FF4CE2] text-white font-[700] disabled:opacity-60"
          >
            {busy ? 'Joining…' : 'Get my affiliate link'}
          </button>
          <a
            href="/affiliates"
            target="_blank"
            className="text-[13px] underline opacity-70 hover:opacity-100"
          >
            Programme terms
          </a>
        </div>
      </div>
    );
  }

  const link = `${SITE}/?ref=${affiliate.code}`;

  return (
    <div className="flex flex-col gap-[20px] text-textColor max-w-[960px] w-full mx-auto">
      <div>
        <h1 className="text-[26px] font-[700] text-white">Affiliate dashboard</h1>
        <p className="mt-[4px] text-[14px] opacity-70">
          {affiliate.commissionPercent}% of every payment for each customer's
          first {affiliate.commissionMonths} months.{' '}
          {!affiliate.active && (
            <b className="text-amber-400">
              Your link is paused - contact support@hookstep.in.
            </b>
          )}
        </p>
      </div>

      <div className="rounded-[10px] border border-[#FF4CE2]/40 bg-[#FF4CE2]/[0.06] p-[16px] flex flex-col gap-[10px]">
        <div className="text-[13px] font-[600] text-white">Your link</div>
        <div className="flex gap-[8px] flex-wrap">
          <code className="flex-1 min-w-0 break-all rounded-[8px] bg-newBgColor border border-newTableBorder px-[12px] py-[10px] text-[14px]">
            {link}
          </code>
          <button
            type="button"
            onClick={() => {
              copy(link);
              toaster.show('Link copied', 'success');
            }}
            className="h-[42px] px-[18px] rounded-[8px] bg-[#FF4CE2] text-white font-[700]"
          >
            Copy
          </button>
        </div>
        <div className="text-[12px] opacity-70">
          Works on any page: add <code>?ref={affiliate.code}</code> to a
          link to a comparison page or guide, e.g.{' '}
          <code className="break-all">
            {SITE}/compare?ref={affiliate.code}
          </code>
        </div>
      </div>

      <div className="rounded-[10px] border border-newTableBorder bg-newBgColorInner p-[16px] flex flex-wrap items-center gap-[12px] justify-between">
        <div className="text-[14px]">
          <div className="font-[600] text-white">
            Your coupon code: {affiliate.code.toUpperCase()}
          </div>
          <div className="opacity-70 mt-[2px]">
            Gives your audience {affiliate.couponPercent}% off any paid plan,
            and credits you even if they never clicked your link. It is
            applied automatically for anyone who arrives on your link.
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            copy(affiliate.code.toUpperCase());
            toaster.show('Code copied', 'success');
          }}
          className="h-[38px] px-[16px] rounded-[8px] bg-white/10 border border-newTableBorder text-white font-[600]"
        >
          Copy code
        </button>
      </div>

      <div className="flex gap-[12px] flex-wrap">
        <Stat label="Sign-ups" value={String(affiliate.referrals)} />
        <Stat
          label="Paying customers"
          value={String(affiliate.payingCustomers)}
        />
        <Stat
          label="Due to you"
          value={moneyList(affiliate.pending)}
          hint="Paid monthly once over ₹1,000"
        />
        <Stat label="Paid out" value={moneyList(affiliate.paid)} />
      </div>

      <div className="rounded-[10px] border border-newTableBorder bg-newBgColorInner p-[16px] flex flex-col gap-[12px]">
        {payoutField}
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={savePayout}
            className="h-[38px] px-[16px] rounded-[8px] bg-white/10 border border-newTableBorder text-white font-[600] disabled:opacity-60"
          >
            Save payout details
          </button>
        </div>
      </div>

      <div className="rounded-[10px] border border-newTableBorder overflow-hidden">
        <div className="px-[16px] py-[12px] font-[600] text-white bg-newBgColorInner">
          Commissions
        </div>
        {affiliate.recent.length === 0 ? (
          <div className="px-[16px] py-[18px] text-[14px] opacity-70">
            Nothing yet. A commission appears here the moment a customer you
            referred is charged.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="text-left opacity-60">
                <tr>
                  <th className="px-[16px] py-[8px] font-[500]">Date</th>
                  <th className="px-[16px] py-[8px] font-[500]">Payment</th>
                  <th className="px-[16px] py-[8px] font-[500]">Your share</th>
                  <th className="px-[16px] py-[8px] font-[500]">Status</th>
                </tr>
              </thead>
              <tbody>
                {affiliate.recent.map((c) => (
                  <tr key={c.id} className="border-t border-newTableBorder">
                    <td className="px-[16px] py-[10px] whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-[16px] py-[10px]">
                      {money(c.amount, c.currency)}
                    </td>
                    <td className="px-[16px] py-[10px] font-[600] text-white">
                      {money(c.commission, c.currency)}
                    </td>
                    <td className="px-[16px] py-[10px]">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
