import clientPromise from '../../../../lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

// GET /api/debug/referrals-of?id=<referrerId>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const client = await clientPromise;
  const db = client.db();

  let objId;
  try { objId = new ObjectId(id); } catch { return NextResponse.json({ referrals: [] }); }

  const cursor = db.collection('users').find({ referredBy: objId });
  const docs = await cursor.toArray();

  const referrals = docs.map((u: {
    _id: { toString(): string };
    email: string;
    referralCode?: string;
    activationEvents?: Record<string, { completed?: boolean }>;
    requiredEvents?: string[];
  }) => {
    const activationEvents = u.activationEvents || {};
    const required: string[] = u.requiredEvents || ['Profile Completed', 'Project Saved', 'Literature Matrix Created'];
    const completed = required.every((k: string) => activationEvents[k]?.completed);
    return {
      id: u._id.toString(),
      email: u.email,
      referralCode: u.referralCode,
      completed,
      required,
      activationEvents: Object.keys(activationEvents).reduce((acc: Record<string, boolean>, k: string) => {
        acc[k] = activationEvents[k]?.completed === true;
        return acc;
      }, {}),
    };
  });

  return NextResponse.json({ referrals });
}
