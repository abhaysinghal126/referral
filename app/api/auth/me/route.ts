import clientPromise from '../../../../lib/mongodb';
import { verifyToken } from '../../../../lib/auth';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || !payload.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = await clientPromise;
  const db = client.db();

  const user = await db.collection('users').findOne({ _id: new ObjectId(payload.sub) });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ user: { id: user._id.toString(), email: user.email, referralCode: user.referralCode } });
}
