import clientPromise from '../../../../lib/mongodb';
import { comparePassword, signToken } from '../../../../lib/auth';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  const { email, password } = body;
  if (!email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const client = await clientPromise;
  const db = client.db();

  const user = await db.collection('users').findOne({ email });
  if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const token = signToken({ sub: user._id.toString(), email: user.email });

  return NextResponse.json({ user: { id: user._id.toString(), email: user.email, referralCode: user.referralCode }, token });
}
