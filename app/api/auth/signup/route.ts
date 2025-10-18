import clientPromise from '../../../../lib/mongodb';
import { hashPassword, signToken } from '../../../../lib/auth';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  const body = await req.json();
  const { email, password, referralCode } = body;
  if (!email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const client = await clientPromise;
  const db = client.db();

  const existing = await db.collection('users').findOne({ email });
  if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 409 });

  // If referralCode provided, check it's valid (exists)
  let referredBy = null;
  let referrerId: any = null;
  if (referralCode) {
    const referrer = await db.collection('users').findOne({ referralCode });
    if (!referrer) return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
    referredBy = referrer._id;
    referrerId = referrer._id;
    var referrerEmail = referrer.email;
  }

  const passwordHash = await hashPassword(password);

  // generate a short referral code for this user
  const newReferralCode = Math.random().toString(36).slice(2, 9);

  // initialize activationEvents with the three required triggers (not completed)
  const activationEvents = {
    'Profile Completed': { completed: false, props: null },
    'Project Saved': { completed: false, props: null },
    'Literature Matrix Created': { completed: false, props: null },
  };

  const result = await db.collection('users').insertOne({
    email,
    passwordHash,
    referralCode: newReferralCode,
    referredBy,
    referrerEmail: referrerEmail || null,
    credits: 0,
    rewardReceived: false,
    activationEvents,
    requiredEvents: Object.keys(activationEvents),
    referralStatus: referralCode ? 'pending' : null,
    createdAt: new Date(),
  });

  // If this signup used a referral code, credit the referrer immediately (20 credits go to the owner of the referral code)
  if (referralCode && referrerId) {
    await db.collection('users').updateOne({ _id: referrerId }, { $inc: { credits: 20 } });
  }

  const user = { id: result.insertedId.toString(), email, referralCode: newReferralCode };
  const token = signToken({ sub: user.id, email: user.email });

  return NextResponse.json({ user, token });
}
