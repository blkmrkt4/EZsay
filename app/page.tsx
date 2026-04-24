import { redirect } from "next/navigation";
import { isDevBypass } from "@/lib/supabase/dev-auth";
import Link from "next/link";

export default function Home() {
  if (isDevBypass()) {
    redirect("/w");
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="text-base font-bold tracking-tight text-gray-900">
          EzSay
        </span>
        <div className="flex items-center gap-5">
          <Link
            href="/pricing"
            className="hidden text-sm text-gray-500 hover:text-gray-900 sm:block"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Log In
          </Link>
          <button className="flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
            Watch Demo
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-20 pt-16 text-center sm:pt-24 sm:pb-28">
        {/* Announcement pill */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs text-gray-500">
          <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            New
          </span>
          Try a free scan — see your document scores instantly
        </div>

        <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">
          Sound like you wrote it.{" "}
          <br className="hidden sm:block" />
          Because{" "}
          <span className="bg-amber-100/70 px-1">you did</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-gray-500 sm:text-lg">
          A co-editing workspace that catches the tells, tightens the prose,
          checks your sources, and hands you back your own voice — section by
          section, your call every time.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/upload?free=1"
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-7 py-3 text-sm font-medium text-white hover:bg-gray-800"
          >
            Scan My Draft — Free
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
          <a
            href="#catch"
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-7 py-3 text-sm font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900"
          >
            See How It Works
          </a>
        </div>
        <p className="mt-4 text-xs text-gray-400">
          One free scan. See where your draft stands before you commit.
        </p>
      </section>

      {/* Manifesto */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Manifesto
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-gray-700 italic sm:text-2xl">
          Somewhere along the way, writing tools got weird. They either do
          everything for you — and everyone can tell — or they nag you with red
          squiggles and move on. We built the thing in the middle. The editor
          that reads your draft, flags what sounds off, and lets you decide what
          stays. Your voice, louder. Your words, yours.
        </p>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl border-t border-gray-100" />

      {/* Section 1 — Catch */}
      <section id="catch" className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Catch
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Every tell. Flagged and explained.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-500">
          Not just AI phrasing. The whole mess — weak citations, soft grammar,
          borrowed lines, corporate filler. One pass, one list, one score.
        </p>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-x-14 sm:gap-y-12">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Spot the AI
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              The phrases, rhythms and sign-offs that give it away — flagged in
              context, not flagged in panic.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Check the Sources
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Every citation verified against the real reference. Page numbers,
              dates, titles. No more plausible fiction.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Clean the Grammar
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Not just typos. The bloated clauses, the passive voice, the
              40-word sentences that should&apos;ve been two.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Scan for Borrowed Lines
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Plagiarism detection built in, so you don&apos;t have to run a
              second tool just to be sure.
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl border-t border-gray-100" />

      {/* Section 2 — Choose */}
      <section className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Choose
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Option A. Option B. Or write your own.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-500">
          This is the part nobody else does. When something&apos;s flagged, we
          don&apos;t silently rewrite it. We show you two options, explain what
          each one changes, and let you pick — or ignore both and write it
          yourself.
        </p>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-x-14 sm:gap-y-12">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Two Versions, Side by Side
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              See exactly what each rewrite does to the sentence before you
              commit. No surprises, no silent edits.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Blend the Best of Both
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Grab the opening from A, the ending from B, keep the middle as
              yours. It&apos;s a text editor, not a slot machine.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Train Your Voice
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              The more you edit, the more it learns. After a few passes it
              starts suggesting rewrites in the voice you actually write in —
              not some average of everyone on the internet.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Your Call, Every Time
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Nothing changes unless you say so. You can accept every flag,
              reject every flag, or do what everyone actually does: pick and
              choose.
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl border-t border-gray-100" />

      {/* Section 3 — Score */}
      <section className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Score
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          See the draft get better. Literally.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-500">
          One number when you start. Another when you finish. In between, every
          flag you resolve moves the needle. It&apos;s the writing equivalent of
          watching your deadlift go up.
        </p>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-x-14 sm:gap-y-12">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Writing Quality Score
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Grammar, clarity, citation strength, and originality — combined
              into a single score so you know where the draft stands.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Track the Delta
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Before and after, on the same page. Useful when your editor asks
              what you actually changed.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Export Clean
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Download the final draft with a clean bill of health. Or a report
              showing your edits, if the situation calls for it.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Works Where You Write
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              Paste it in, upload a .docx, or drop a link. EZsay handles the
              format. You handle the writing.
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl border-t border-gray-100" />

      {/* Free scan vs paid comparison */}
      <section className="mx-auto max-w-4xl px-6 py-20 sm:py-24">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
          Try Before You Buy
        </p>
        <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          One free scan. No card required.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-relaxed text-gray-500">
          Upload a draft. See the flags, see the score, see exactly what EZsay
          would fix. When you&apos;re ready for the rewrite, that&apos;s when
          the subscription kicks in.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {/* Free column */}
          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900">Free Scan</h3>
            <ul className="mt-4 space-y-3">
              {[
                "Full AI detection across your draft",
                "Every flag located and categorized",
                "Grammar and citation issues identified",
                "Your starting Writing Quality Score",
                "Up to 2,000 words per scan",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Paid column */}
          <div className="rounded-xl border-2 border-gray-900 p-6">
            <h3 className="text-sm font-semibold text-gray-900">
              With a Subscription
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                "Side-by-side A/B rewrites on every flag",
                "Voice learning across your documents",
                "Unlimited scans, unlimited length",
                "Clean exports in .docx, .pdf, or .md",
                "Track your score improvement over time",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-900" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl border-t border-gray-100" />

      {/* Customer quote — placeholder */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
        <p className="mx-auto max-w-xl text-lg italic leading-relaxed text-gray-400">
          &ldquo;Customer quote coming soon.&rdquo;
        </p>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl border-t border-gray-100" />

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Ready to sound like yourself again?
        </h2>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/upload?free=1"
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-7 py-3 text-sm font-medium text-white hover:bg-gray-800"
          >
            Scan My Draft
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
          <Link
            href="/"
            className="rounded-full border border-gray-300 px-7 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
          >
            Maybe Later
          </Link>
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Your first scan is on us. See the flags, see the score, see what needs
          work — then decide if you want the full rewrite.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-6 sm:px-10">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <span className="text-xs text-gray-400">
            EZsay. Your voice, louder.
          </span>
          <div className="flex gap-5">
            <Link
              href="/pricing"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
