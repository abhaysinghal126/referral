import clientPromise from '../../../../lib/mongodb';
import { hashPassword, signToken } from '../../../../lib/auth';
import { NextResponse } from 'next/server';
// no ObjectId needed in this route

export async function POST(req: Request) {
  // Parse and validate incoming payload
  const body = await req.json();
  const { email, password, referralCode } = body;
  if (!email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // Connect to Mongo and ensure the user doesn't already exist
  const client = await clientPromise;
  const db = client.db();

  const existing = await db.collection('users').findOne({ email });
  if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 409 });

  // If referralCode provided, check it's valid (exists)
  let referredBy = null;
  let referrerEmail: string | null = null;
  if (referralCode) {
    // Look up referrer by referralCode and attach attribution to the new user
    const referrer = await db.collection('users').findOne({ referralCode });
    if (!referrer) return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
    referredBy = referrer._id;
    referrerEmail = referrer.email as string;
  }

  // Hash the password before saving
  const passwordHash = await hashPassword(password);

  // generate a short referral code for this user
  const newReferralCode = Math.random().toString(36).slice(2, 9);

  // initialize activationEvents with the three required triggers (not completed)
  // These will be flipped to completed by the activation API as the user progresses
  const activationEvents = {
    'Profile Completed': { completed: false, props: null },
    'Project Saved': { completed: false, props: null },
    'Literature Matrix Created': { completed: false, props: null },
  };

  // Persist the new user
  const result = await db.collection('users').insertOne({
    email,
    passwordHash,
    referralCode: newReferralCode,
    referredBy,
    referrerEmail: referrerEmail || null,
    credits: referralCode ? 20 : 0,
    rewardReceived: false,
    activationEvents,
    requiredEvents: Object.keys(activationEvents),
    referralStatus: referralCode ? 'pending' : null,
    createdAt: new Date(),
  });

  // Issue a token so the client can sign the user in immediately
  const user = { id: result.insertedId.toString(), email, referralCode: newReferralCode };
  const token = signToken({ sub: user.id, email: user.email });

  return NextResponse.json({ user, token });
}
