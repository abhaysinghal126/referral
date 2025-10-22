import clientPromise from '../../../../lib/mongodb';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

/* POST body: { userId }
   Simulate the Project Saved - First Time event for a user. For demo, we just return whether to show referral prompt.
   Used by the simulator to mimic a user's first project, which triggers the in-app referral banner.
*/

export async function POST(req: Request) {
  // Parse and validate input
  const body = (await req.json()) as { userId?: string };
  const { userId } = body;
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  // Connect to DB and locate user
  const client = await clientPromise;
  const db = client.db();

  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // For demo: if this is the user's first project save, respond with showPrompt: true
  // We'll simply check a `projectsSaved` counter on the user
  const projectsSaved = user.projectsSaved || 0;
  // Persist increment — this emulates "first time saved" when projectsSaved was 0
  await db.collection('users').updateOne({ _id: user._id }, { $inc: { projectsSaved: 1 } });

  const showPrompt = projectsSaved === 0; // first time

  return NextResponse.json({ showPrompt });
}
