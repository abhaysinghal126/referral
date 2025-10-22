import clientPromise from '../../../../lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

// Records activation progress for a referred user and applies rewards when activation completes.
// POST body: { referredId | referredEmail, eventName, props? }
// - Updates user.activationEvents[eventName] to completed
// - If all required events are completed, flips referralStatus to 'activated' and grants referrer milestone rewards
// - Separately handles "Super Activation" on event 'Research Proposal Created' within 30 days of signup

type ActivationProps = Record<string, unknown> | undefined;
type UserDoc = {
  _id: unknown;
  referredBy?: string | unknown;
  activationEvents?: Record<string, { completed: boolean; props?: ActivationProps; timestamp?: Date }>;
  requiredEvents?: string[];
  projectsSaved?: number;
  createdAt?: Date;
  referralStatus?: string | null;
};

export async function POST(req: Request) {
  const body = (await req.json()) as { referredId?: string; referredEmail?: string; eventName: string; props?: ActivationProps };
  const { referredId, referredEmail, eventName, props } = body;
  if ((!referredId && !referredEmail) || !eventName) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const client = await clientPromise;
  const db = client.db();

  // find the referred user
  let user: UserDoc | null = null;
  if (referredId) {
    user = await db.collection('users').findOne({ _id: new ObjectId(referredId) });
  } else if (referredEmail) {
    user = await db.collection('users').findOne({ email: referredEmail });
  }
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // update activationEvents on the user document
  const activationEvents: NonNullable<UserDoc['activationEvents']> = user.activationEvents || {};
  activationEvents[eventName] = { completed: true, props, timestamp: new Date() };

  // Persist the updated activation events
  await db.collection('users').updateOne({ _id: user._id }, { $set: { activationEvents } });

  const required = user.requiredEvents || ['Profile Completed', 'Project Saved', 'Literature Matrix Created'];
  const done = required.every((k: string) => activationEvents[k] && activationEvents[k].completed);

  if (done) {
    // Flip referralStatus to 'activated' once (idempotent)
    const updateResult = await db.collection('users').updateOne(
      { _id: user._id, referralStatus: { $ne: 'activated' } },
      { $set: { referralStatus: 'activated', activatedAt: new Date() } }
    );

    if (updateResult.modifiedCount && updateResult.modifiedCount > 0) {
      // Mark rewardReceived on the referred user to ensure we only process rewards once per referred user
      const setRes = await db.collection('users').findOneAndUpdate(
        { _id: user._id, rewardReceived: { $ne: true } },
        { $set: { rewardReceived: true, activatedAt: new Date() } },
        { returnDocument: 'after' }
      );

      if (setRes && setRes.value) {
        // Milestone rewards for referrer based on count of activated referrals
        const referrerIdRaw = user.referredBy;
        if (referrerIdRaw) {
          let refObjId: unknown | null = null;
          if (typeof referrerIdRaw === 'string') {
            try { refObjId = new ObjectId(referrerIdRaw); } catch { refObjId = null; }
          } else if (typeof referrerIdRaw === 'object' && referrerIdRaw !== null && typeof (referrerIdRaw as { toString: () => string }).toString === 'function') {
            try { refObjId = new ObjectId((referrerIdRaw as { toString: () => string }).toString()); } catch { refObjId = null; }
          }
          if (refObjId) {
            // Count activated referrals for this referrer
            const activatedCount = await db.collection('users').countDocuments({ referredBy: refObjId as unknown, referralStatus: 'activated' });
            // Load referrer
            const referrer = await db.collection('users').findOne({ _id: refObjId });
            const milestones = (referrer?.milestones as { m1?: boolean; m3?: boolean; m5?: boolean } | undefined) || {};

            const updates: Record<string, unknown> = {};
            let incPremium = 0;
            if (activatedCount >= 1 && !milestones.m1) { updates['milestones.m1'] = true; incPremium += 1; }
            if (activatedCount >= 3 && !milestones.m3) { updates['milestones.m3'] = true; incPremium += 2; }
            if (activatedCount >= 5 && !milestones.m5) { updates['milestones.m5'] = true; incPremium += 3; }

            if (Object.keys(updates).length > 0 || incPremium > 0) {
              const setObj: Record<string, unknown> = { ...updates };
              const updateOps: { $set?: Record<string, unknown>; $inc?: { premiumMonths: number } } = {};
              if (Object.keys(setObj).length > 0) updateOps.$set = setObj;
              if (incPremium > 0) updateOps.$inc = { premiumMonths: incPremium };
              await db.collection('users').updateOne({ _id: refObjId as unknown }, updateOps);
            }
          }
        }
      }
    }
  }

  // Super Activation bonus: if the event is "Research Proposal Created", and within 30 days of referred user's createdAt,
  // credit the referrer +50 one-time credits and set a badge. Avoid double-granting per referred user.
  if (eventName === 'Research Proposal Created') {
    const createdAt = user.createdAt ? new Date(user.createdAt) : null;
    const within30Days = createdAt ? (Date.now() - createdAt.getTime()) <= 30 * 24 * 60 * 60 * 1000 : false;
    if (within30Days && user.referredBy) {
      // mark on referred user that super activation reward was processed
      const mark = await db.collection('users').findOneAndUpdate(
        { _id: user._id, superActivationRewarded: { $ne: true } },
        { $set: { superActivationRewarded: true, superActivationAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (mark && mark.value) {
        let refObjId: ObjectId | null = null;
        const raw = user.referredBy as unknown;
        try {
          const idStr = typeof raw === 'string'
            ? raw
            : (raw && typeof (raw as { toString: () => string }).toString === 'function'
                ? (raw as { toString: () => string }).toString()
                : '');
          refObjId = idStr ? new ObjectId(idStr) : null;
        } catch { refObjId = null; }
        if (refObjId) {
          // Add +50 credits and badge if not already present
          const referrerUnknown = await db.collection('users').findOne({ _id: refObjId as unknown });
          const badges: string[] = Array.isArray((referrerUnknown as { badges?: unknown } | null)?.badges)
            ? ((referrerUnknown as { badges?: string[] } | null)?.badges as string[])
            : [];
          const newBadges = badges.includes('Aveksana Ambassador') ? badges : [...badges, 'Aveksana Ambassador'];
          await db.collection('users').updateOne(
            { _id: refObjId as unknown },
            { $inc: { credits: 50 }, $set: { badges: newBadges } }
          );
        }
      }
    }
  }

  return NextResponse.json({ ok: true, activated: done });
}
