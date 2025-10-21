"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState('');
  const [msg, setMsg] = useState('');
  // toast via sonner

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, referralCode: referral }),
    });
    const data = (await res.json()) as { token?: string; user?: { referralCode: string }; error?: string };
    if (!res.ok) {
      const m = data.error || 'Error';
      setMsg(m);
      toast.error(m);
      return;
    }
    if (data.token) localStorage.setItem('token', data.token);
    setMsg('Signed up! Your referral code: ' + (data.user?.referralCode || '')); 
    toast.success('Signed up successfully');
    setTimeout(() => router.push('/'), 600);
  }

  async function createExampleUser() {
    const exampleEmail = `example+${Date.now()}@example.com`;
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: exampleEmail, password: 'password123', referralCode: 'ru99mi0' }),
    });
    const data = (await res.json()) as { token?: string; error?: string };
    if (!res.ok) {
      const m = data.error || 'Error creating example user';
      setMsg(m);
      toast.error(m);
      return;
    }
    if (data.token) localStorage.setItem('token', data.token);
    toast.success('Example user created: ' + exampleEmail);
    setTimeout(() => router.push('/'), 600);
  }

  return (
    <main className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Sign up with email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Referral code (optional)</label>
              <Input value={referral} onChange={(e) => setReferral(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Sign up</Button>
              <Button type="button" variant="secondary" onClick={createExampleUser}>
                Create example user (uses ru99mi0)
              </Button>
            </div>
          </form>
          {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">By continuing, you agree to our Terms and Privacy Policy.</p>
        </CardContent>
      </Card>
    </main>
  );
}
