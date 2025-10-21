import clientPromise from '../../../../lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

/*
POST body: { referredId, eventName, props }
Records activation events for a referred user and if activation is complete, mark referral activated and reward referrer.
*/

type ActivationProps = Record<string, unknown> | undefined;
type UserDoc = {
  _id: unknown;
  referredBy?: string | unknown;
  activationEvents?: Record<string, { completed: boolean; props?: ActivationProps; timestamp?: Date }>;
  requiredEvents?: string[];
  projectsSaved?: number;
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
    // Use a conditional update to flip referralStatus to 'activated' only if it wasn't already.
    // This returns the modifiedCount so we can tell if we should credit the referrer.
    const updateResult = await db.collection('users').updateOne({ _id: user._id, referralStatus: { $ne: 'activated' } }, { $set: { referralStatus: 'activated', activatedAt: new Date() } });

    if (updateResult.modifiedCount && updateResult.modifiedCount > 0) {
      // The status was flipped from non-activated to activated.
      // Now set rewardReceived on the referred user and credit the referrer only if rewardReceived was previously false.
      const setRes = await db.collection('users').findOneAndUpdate(
        { _id: user._id, rewardReceived: { $ne: true } },
        { $set: { rewardReceived: true, activatedAt: new Date() } },
        { returnDocument: 'after' }
      );

      // If setRes.value exists, we changed rewardReceived from false -> true and should credit referrer
      if (setRes && setRes.value) {
        const referrerIdRaw = user.referredBy;
        if (referrerIdRaw) {
          let refObjId = null as null | InstanceType<typeof ObjectId>;
          if (typeof referrerIdRaw === 'string') {
            try { refObjId = new ObjectId(referrerIdRaw); } catch { refObjId = null; }
          } else if (
            typeof referrerIdRaw === 'object' && referrerIdRaw !== null &&
            // cast minimal shape to avoid any
            typeof (referrerIdRaw as { toString: () => string }).toString === 'function'
          ) {
            try { refObjId = new ObjectId((referrerIdRaw as { toString: () => string }).toString()); } catch { refObjId = null; }
          }
          if (refObjId) {
            await db.collection('users').updateOne({ _id: refObjId }, { $inc: { premiumMonths: 1 } });
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, activated: done });
}
