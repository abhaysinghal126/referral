import clientPromise from '../../../../lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

/* POST body: { userId }
   Simulate the Project Saved - First Time event for a user. For demo, we just return whether to show referral prompt.
*/

export async function POST(req: Request) {
  const body = (await req.json()) as { userId?: string };
  const { userId } = body;
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const client = await clientPromise;
  const db = client.db();

  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // For demo: if this is the user's first project save, respond with showPrompt: true
  // We'll simply check a `projectsSaved` counter on the user
  const projectsSaved = user.projectsSaved || 0;
  await db.collection('users').updateOne({ _id: user._id }, { $inc: { projectsSaved: 1 } });

  const showPrompt = projectsSaved === 0; // first time

  return NextResponse.json({ showPrompt });
}
