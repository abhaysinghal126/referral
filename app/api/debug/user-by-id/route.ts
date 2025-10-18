import clientPromise from '../../../../lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const client = await clientPromise;
  const db = client.db();
  let objId: any;
  try { objId = new ObjectId(id); } catch (e) { return NextResponse.json({}); }

  const user = await db.collection('users').findOne({ _id: objId });
  if (!user) return NextResponse.json({});

  return NextResponse.json({ user: { id: user._id.toString(), email: user.email, credits: user.credits || 0, premiumMonths: user.premiumMonths || 0, referralCode: user.referralCode } });
}
