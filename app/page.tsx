"use client";
import { useState, useEffect } from 'react';

export default function Home() {
  const [log, setLog] = useState<string[]>([]);
  const [referrerUser, setReferrerUser] = useState<any>(null);
  const [myUser, setMyUser] = useState<any>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);

  function pushToast(text: string) {
    const id = Date.now();
    setToasts((t) => [{ id, text }, ...t].slice(0, 5));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  function addLog(msg: string) {
    setLog((s) => [msg, ...s].slice(0, 20));
  }

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          // load full user document (includes referredBy, credits, activationEvents)
          fetch('/api/debug/user-by-email?email=' + encodeURIComponent(data.user.email))
            .then((r2) => r2.json())
            .then((full) => {
                  if (full && full.user) {
                    setMyUser(full.user);
                    // if the user document includes a denormalized referrerEmail, show it immediately
                    if (full.user.referrerEmail) {
                      // show a lightweight referrer email immediately
                      setReferrerUser({ email: full.user.referrerEmail, id: full.user.referredBy || null });

                      // try to resolve full referrer row by email (to show credits/premium)
                      fetch('/api/debug/user-by-email?email=' + encodeURIComponent(full.user.referrerEmail))
                        .then((rref) => rref.json())
                        .then((refJ) => { if (refJ && refJ.user) setReferrerUser(refJ.user); })
                        .catch(() => {});
                    }
                    // if user has referredBy id, fetch referrer by id (overwrite the lightweight/email referrer when available)
                    if (full.user.referredBy) {
                      fetch('/api/debug/user-by-id?id=' + encodeURIComponent(full.user.referredBy))
                        .then((r3) => r3.json())
                        .then((refj) => { if (refj && refj.user) setReferrerUser(refj.user); })
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
    let data: any = null;
    try { data = await res.json(); } catch (e) { data = { ok: res.ok }; }
    addLog('triggerReferrerFirstProject: ' + JSON.stringify(data));
    if (data && data.showPrompt) pushToast('Referral prompt shown to referrer');
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
        const pj = await probe.json();
        if (pj && pj.user && pj.user.id) {
          addLog('recordActivationEvent: resolved referrerEmail to ' + pj.user.email + ', recording for that user');
          referredId = pj.user.id;
        }
      } catch (e) {
        // resolution failed; fall back to current user
      }
    }

    if (!referredId) return addLog('recordActivationEvent: no current user loaded');

    const res = await fetch('/api/referrals/record-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referredId, eventName, props: { article_count: eventName === 'Literature Matrix Created' ? 3 : undefined } }) });
    let data: any = null;
    try { data = await res.json(); } catch (e) { data = { ok: res.ok }; }
    addLog('recordActivationEvent ' + eventName + ': ' + JSON.stringify(data));
    if (data && data.activated) {
      pushToast('Reward unlocked — referrer credited and premium applied');
      // refresh referrer info if available
      if (myUser && myUser.referredBy) {
        try {
          const refRes = await fetch('/api/debug/user-by-id?id=' + encodeURIComponent(myUser.referredBy));
          const refJson = await refRes.json();
          if (refJson && refJson.user) setReferrerUser(refJson.user);
        } catch (e) {}
      }
    }
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>Referral Flow Simulator</h1>
      {!user && (
        <div style={{ marginBottom: 20 }}>
          <p>You must be signed in to view the simulator.</p>
          <a href="/auth/signin">Sign in</a> | <a href="/auth/signup">Sign up</a>
        </div>
      )}
      {user && (
      <div className="sim-grid" style={{ maxWidth: 900 }}>
        <div className="sim-card">
          <h3>Your account</h3>
          <p className="muted">Signed in as</p>
          <div style={{ fontWeight: 600 }}>{user.email}</div>
          <p className="muted" style={{ marginTop: 8 }}>Your referral code (if any):</p>
          <div style={{ fontWeight: 600 }}>{user.referralCode || '—'}</div>
        </div>

        <div className="sim-card">
          <h3>Referrer & Referred</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div className="muted">Referrer</div>
              <div style={{ fontWeight: 600 }}>{referrerUser ? referrerUser.email : '—'}</div>
            </div>
            <button className="sim-button" onClick={triggerReferrerFirstProject} disabled={!referrerUser}>Trigger first project</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div className="muted">Referred (you)</div>
              <div style={{ fontWeight: 600 }}>{myUser ? myUser.email : (user ? user.email : '—')}</div>
            </div>
            <div style={{ display: 'inline-block', padding: 8, fontSize: 12 }} className="muted">Record activations for the logged-in referrer email if it exists in the DB (falls back to you).</div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sim-button" onClick={() => recordActivationEvent('Profile Completed')}>Profile Completed</button>
            <button className="sim-button" onClick={() => recordActivationEvent('Project Saved')}>Project Saved</button>
            <button className="sim-button" onClick={() => recordActivationEvent('Literature Matrix Created')}>Literature Matrix Created</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <h4>Referrer</h4>
            {referrerUser ? (
              <div>
                <div style={{ fontWeight: 600 }}>{referrerUser.email}</div>
                <div className="muted">Credits: {referrerUser.credits ?? 0} • Premium months: {referrerUser.premiumMonths ?? 0}</div>
              </div>
            ) : (
              <div className="muted">No referrer loaded</div>
            )}

            <h4 style={{ marginTop: 8 }}>Referred (target)</h4>
            {myUser ? (
              <div>
                <div style={{ fontWeight: 600 }}>{myUser.email}</div>
                <div className="muted">Credits: {myUser.credits ?? 0} • Premium months: {myUser.premiumMonths ?? 0}</div>
              </div>
            ) : (
              <div className="muted">No referred user loaded</div>
            )}
          </div>
        </div>
      </div>

      )}

      <section style={{ marginTop: 20 }}>
        <h2>Log</h2>
        <div style={{ maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 8 }}>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 12, padding: 4 }}>{l}</div>
          ))}
        </div>
      </section>

      {/* Toaster */}
      <div style={{ position: 'fixed', right: 20, bottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ background: 'white', padding: '10px 14px', borderRadius: 8, boxShadow: '0 6px 18px rgba(17,24,39,0.08)' }}>{t.text}</div>
        ))}
      </div>
    </main>
  );
}
