"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState('');
  const [msg, setMsg] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);

  function pushToast(text: string) {
    const id = Date.now();
    setToasts((t) => [{ id, text }, ...t].slice(0, 5));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }

  async function submit(e: any) {
    e.preventDefault();
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, referralCode: referral }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || 'Error');
    localStorage.setItem('token', data.token);
    setMsg('Signed up! Your referral code: ' + data.user.referralCode);
    pushToast('Signed up successfully');
    setTimeout(() => router.push('/'), 600);
  }

  async function createExampleUser() {
    const exampleEmail = `example+${Date.now()}@example.com`;
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: exampleEmail, password: 'password123', referralCode: '3wdm91c' }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || 'Error creating example user');
    localStorage.setItem('token', data.token);
    pushToast('Example user created: ' + exampleEmail);
    setTimeout(() => router.push('/'), 600);
  }

  return (
    <main style={{ padding: 20 }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }} className="sim-card">
        <h1 style={{ marginBottom: 8 }}>Create account</h1>
        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          <div>
            <label className="muted">Email</label>
            <input className="sim-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="muted">Password</label>
            <input className="sim-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="muted">Referral code (optional)</label>
            <input className="sim-input" value={referral} onChange={(e) => setReferral(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sim-button" type="submit">Sign up</button>
            <button type="button" className="sim-button" onClick={createExampleUser}>Create example user (uses 3wdm91c)</button>
          </div>
        </form>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </div>

      {/* Toaster */}
      <div style={{ position: 'fixed', right: 20, bottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ background: 'white', padding: '10px 14px', borderRadius: 8, boxShadow: '0 6px 18px rgba(17,24,39,0.08)' }}>{t.text}</div>
        ))}
      </div>
    </main>
  );
}
