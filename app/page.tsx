"use client";
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type BasicUser = {
  id: string;
  email: string;
  referralCode?: string;
  credits?: number;
  premiumMonths?: number;
  referredBy?: string;
  referrerEmail?: string;
};
type MeResponse = { user?: Pick<BasicUser, 'id' | 'email' | 'referralCode'> };
type DebugUserResponse = { user?: BasicUser };
type RecordEventResponse = { ok?: boolean; activated?: boolean };
type TriggerFirstProjectResponse = { showPrompt?: boolean };
type ReferralRow = {
  id: string;
  email: string;
  referralCode?: string;
  completed: boolean;
  required: string[];
  activationEvents: Record<string, boolean>;
};
type ReferralsResponse = { referrals: ReferralRow[] };

type ReferrerInfo = { id: string | null; email: string; credits?: number; premiumMonths?: number };

export default function Home() {
  const [log, setLog] = useState<string[]>([]);
  const [referrerUser, setReferrerUser] = useState<ReferrerInfo | null>(null);
  const [myUser, setMyUser] = useState<BasicUser | null>(null);

  function addLog(msg: string) {
    setLog((s) => [msg, ...s].slice(0, 20));
  }

  const [user, setUser] = useState<Pick<BasicUser, 'id' | 'email' | 'referralCode'> | null>(null);
  const [myReferrals, setMyReferrals] = useState<ReferralRow[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => r.json() as Promise<MeResponse>)
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          // load full user document (includes referredBy, credits, activationEvents)
          fetch('/api/debug/user-by-email?email=' + encodeURIComponent(data.user.email))
            .then((r2) => r2.json() as Promise<DebugUserResponse>)
            .then((full) => {
                  if (full && full.user) {
                    setMyUser(full.user);
                    // Load your referrals (people you referred)
                    fetch('/api/debug/referrals-of?id=' + encodeURIComponent(full.user.id))
                      .then((r) => r.json() as Promise<ReferralsResponse>)
                      .then((rr) => setMyReferrals(rr.referrals || []))
                      .catch(() => {});
                    // if the user document includes a denormalized referrerEmail, show it immediately
                    if (full.user.referrerEmail) {
                      // show a lightweight referrer email immediately
                      setReferrerUser({ email: full.user.referrerEmail, id: full.user.referredBy || null });

                      // try to resolve full referrer row by email (to show credits/premium)
                      fetch('/api/debug/user-by-email?email=' + encodeURIComponent(full.user.referrerEmail))
                        .then((rref) => rref.json() as Promise<DebugUserResponse>)
                        .then((refJ) => { if (refJ && refJ.user) setReferrerUser({ id: refJ.user.id, email: refJ.user.email, credits: refJ.user.credits, premiumMonths: refJ.user.premiumMonths }); })
                        .catch(() => {});
                    }
                    // if user has referredBy id, fetch referrer by id (overwrite the lightweight/email referrer when available)
                    if (full.user.referredBy) {
                      fetch('/api/debug/user-by-id?id=' + encodeURIComponent(full.user.referredBy))
                        .then((r3) => r3.json() as Promise<DebugUserResponse>)
                        .then((refj) => { if (refj && refj.user) setReferrerUser({ id: refj.user.id, email: refj.user.email, credits: refj.user.credits, premiumMonths: refj.user.premiumMonths }); })
                        .catch(() => {});
                    }
                  }
            })
            .catch(() => {});
        }
      }).catch(() => {});
  }, []);

  async function triggerReferrerFirstProject() {
    if (!referrerUser) return addLog('triggerReferrerFirstProject: no referrer available');
    const userId = referrerUser.id;
    const res = await fetch('/api/referrals/trigger-first-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    let data: TriggerFirstProjectResponse | { ok: boolean } = { ok: res.ok };
    try { data = await res.json() as TriggerFirstProjectResponse; } catch { data = { ok: res.ok }; }
    addLog('triggerReferrerFirstProject: ' + JSON.stringify(data));
    if (data && (data as TriggerFirstProjectResponse).showPrompt) toast.success('Referral prompt shown to referrer');
  }

  // removed createUserBWithReferral — signup should occur externally. We'll record activations for `myEmail`.

  async function recordActivationEvent(eventName: string) {
    // By default record for the logged-in user's full id (if available)
    let referredId = myUser?.id || user?.id;

    // If the logged-in user has a denormalized referrerEmail and that email maps to a user in the DB,
    // then record the activation for that resolved user instead (per UI request).
    if (myUser?.referrerEmail) {
      try {
        const probe = await fetch('/api/debug/user-by-email?email=' + encodeURIComponent(myUser.referrerEmail));
        const pj = (await probe.json()) as DebugUserResponse;
        if (pj && pj.user && pj.user.id) {
          addLog('recordActivationEvent: resolved referrerEmail to ' + pj.user.email + ', recording for that user');
          referredId = pj.user.id;
        }
      } catch {
        // resolution failed; fall back to current user
      }
    }

    if (!referredId) return addLog('recordActivationEvent: no current user loaded');

    const res = await fetch('/api/referrals/record-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referredId, eventName, props: { article_count: eventName === 'Literature Matrix Created' ? 3 : undefined } }) });
    let data: RecordEventResponse | { ok: boolean } = { ok: res.ok };
    try { data = await res.json() as RecordEventResponse; } catch { data = { ok: res.ok }; }
    addLog('recordActivationEvent ' + eventName + ': ' + JSON.stringify(data));
    if ((data as RecordEventResponse).activated) {
      toast.success('Reward unlocked — referrer credited and premium applied');
      // refresh referrer info if available
      if (myUser && myUser.referredBy) {
        try {
          const refRes = await fetch('/api/debug/user-by-id?id=' + encodeURIComponent(myUser.referredBy));
          const refJson = (await refRes.json()) as DebugUserResponse;
          if (refJson && refJson.user) setReferrerUser({ id: refJson.user.id, email: refJson.user.email, credits: refJson.user.credits, premiumMonths: refJson.user.premiumMonths });
        } catch {}
      }
    }
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Referral Flow Simulator</h1>
      {!user && (
        <div className="mb-5">
          <p className="text-muted-foreground">You must be signed in to view the simulator.</p>
          <div className="mt-2 text-sm">
            <a className="underline underline-offset-4 hover:text-foreground" href="/auth/signin">Sign in</a>
            <span className="mx-2 text-muted-foreground">|</span>
            <a className="underline underline-offset-4 hover:text-foreground" href="/auth/signup">Sign up</a>
          </div>
        </div>
      )}
      {user && (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>Signed in as</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="font-semibold">{user.email}</div>
            <Separator />
            <div className="text-muted-foreground">Your referral code (if any):</div>
            <div className="font-semibold">{user.referralCode || '—'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Referrer & Referred</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-muted-foreground">Referrer</div>
                <div className="font-semibold">{referrerUser ? referrerUser.email : '—'}</div>
              </div>
              <Button onClick={triggerReferrerFirstProject} disabled={!referrerUser} className="rounded-md border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                Trigger first project
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-muted-foreground">Referred (you)</div>
                <div className="font-semibold">{myUser ? myUser.email : (user ? user.email : '—')}</div>
              </div>
              <div className="inline-block p-2 text-xs text-muted-foreground">Record activations for the logged-in referrer email if it exists in the DB (falls back to you).</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => recordActivationEvent('Profile Completed')} className="rounded-md border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">Profile Completed</Button>
              <Button onClick={() => recordActivationEvent('Project Saved')} className="rounded-md border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">Project Saved</Button>
              <Button onClick={() => recordActivationEvent('Literature Matrix Created')} className="rounded-md border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">Literature Matrix Created</Button>
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="text-sm font-medium">Referrer</h4>
              {referrerUser ? (
                <div>
                  <div className="font-semibold">{referrerUser.email}</div>
                  <div className="text-muted-foreground">Credits: {referrerUser.credits ?? 0} • Premium months: {referrerUser.premiumMonths ?? 0}</div>
                </div>
              ) : (
                <div className="text-muted-foreground">No referrer loaded</div>
              )}

              <h4 className="text-sm font-medium">Referred (target)</h4>
              {myUser ? (
                <div>
                  <div className="font-semibold">{myUser.email}</div>
                  <div className="text-muted-foreground">Credits: {myUser.credits ?? 0} • Premium months: {myUser.premiumMonths ?? 0}</div>
                </div>
              ) : (
                <div className="text-muted-foreground">No referred user loaded</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your referrals</CardTitle>
            <CardDescription>People who used your code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {myReferrals.length === 0 && (
              <div className="text-muted-foreground">No referrals yet</div>
            )}
            {myReferrals.map((r) => (
              <div key={r.id} className="flex items-start justify-between rounded-md border p-2">
                <div>
                  <div className="font-medium text-sm">{r.email}</div>
                  <div className="text-xs text-muted-foreground">Code: {r.referralCode || '—'}</div>
                </div>
                <div className={"text-xs px-2 py-1 rounded-md " + (r.completed ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20") }>
                  {r.completed ? 'Completed' : 'In progress'}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      )}

      <section className="mt-5">
        <h2 className="text-lg font-medium">Log</h2>
        <div className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-2">
          {log.map((l, i) => (
            <div key={i} className="p-1 text-xs">{l}</div>
          ))}
        </div>
      </section>

      {/* Toaster */}
      <div />
    </main>
  );
}
