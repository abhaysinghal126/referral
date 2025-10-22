import clientPromise from "@/lib/mongodb";
import { notFound } from "next/navigation";

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const client = await clientPromise;
  const db = client.db();

  const referrer = await db.collection("users").findOne({ referralCode: code });
  if (!referrer) return notFound();

  // Use name if available, otherwise default to email, then a generic fallback
  const nameOrEmail = (referrer as { name?: string; email?: string } | null)?.name
    || (referrer as { name?: string; email?: string } | null)?.email
    || "A friend";
  const signupHref = `/auth/signup?code=${encodeURIComponent(code)}`;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <section className="rounded-lg border p-6 bg-background">
        <h1 className="text-2xl font-semibold mb-2">{nameOrEmail} has invited you to Aveksana and gifted you 20 free credits.</h1>
        <p className="text-muted-foreground mb-4">Go from a vague idea to a structured research project in minutes.</p>
        <p className="text-sm text-muted-foreground mb-6">Join thousands of students and researchers who are accelerating discovery.</p>
        <a href={signupHref} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground shadow-sm transition hover:opacity-90">
          Sign Up & Claim Your 20 Credits
        </a>
      </section>
    </main>
  );
}
