import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import DemoWizard from "@/components/demo/DemoWizard";

export const metadata: Metadata = {
  title: "See how EzSay works",
  description:
    "A 2-minute interactive walkthrough of EzSay — upload, scan, edit AI-pattern writing section by section, and keep your own voice.",
};

// Public route: no auth or subscription gate. Anyone can take the tour.
// Optional ?step=N (1-based) deep-link jumps straight to a step — read here in
// the server component and passed as the wizard's initial state (avoids a
// client-side effect / hydration mismatch).
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; drill?: string }>;
}) {
  const { step, drill } = await searchParams;
  const parsedStep = step ? parseInt(step, 10) : NaN;
  const initialStep = Number.isNaN(parsedStep) ? 0 : parsedStep - 1;
  const parsedDrill = drill ? parseInt(drill, 10) : NaN;
  const initialDrill = Number.isNaN(parsedDrill) ? undefined : parsedDrill - 1;

  return (
    <div className="min-h-screen bg-white">
      <LandingNav />
      <DemoWizard initialStep={initialStep} initialDrill={initialDrill} />
    </div>
  );
}
