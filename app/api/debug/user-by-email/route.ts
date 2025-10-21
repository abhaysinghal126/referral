import clientPromise from '../../../../lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 });

  const client = await clientPromise;
  const db = client.db();
  const user = await db.collection('users').findOne({ email });
  if (!user) return NextResponse.json({});

  // Prefer denormalized referrerEmail on the user document, if present
  let referrerEmail = null;
  if (user.referrerEmail) {
    referrerEmail = user.referrerEmail;
  } else {
    try {
      if (user.referredBy) {
        // user.referredBy may be an ObjectId or a string representation
        const refId = typeof user.referredBy === 'string' ? new ObjectId(user.referredBy) : user.referredBy;
        const refUser = await db.collection('users').findOne({ _id: refId });
        if (refUser) referrerEmail = refUser.email;
      }
    } catch {
      // ignore and fall back
      referrerEmail = null;
    }
  }

  // No separate referrals collection in this schema — we only use `user.referredBy`.

  // Return referrerEmail inside the user object as well for convenience on the client
  const outUser: { id: string; email: string; referralCode?: string; credits: number; premiumMonths: number; referrerEmail?: string } = {
    id: user._id.toString(),
    email: user.email,
    referralCode: user.referralCode,
    credits: user.credits || 0,
    premiumMonths: user.premiumMonths || 0,
  };
  if (referrerEmail) outUser.referrerEmail = referrerEmail;

  return NextResponse.json({ user: outUser, referrerEmail });
}
