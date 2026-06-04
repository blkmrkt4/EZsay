import type { Metadata } from "next";
import LegalShell, { LegalSection } from "@/components/legal/LegalShell";
import { LEGAL_META } from "@/lib/legal/meta";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — EzSay",
  description: "How cancellations and refunds work on EzSay.",
};

export default function RefundPage() {
  return (
    <LegalShell
      title="Refund & Cancellation Policy"
      lastUpdated={LEGAL_META.lastUpdated}
    >
      <p>
        This policy explains how cancellations and refunds work for{" "}
        {LEGAL_META.productName} subscriptions. It forms part of our{" "}
        <a href="/terms" className="text-blue-600 hover:underline">
          Terms of Service
        </a>
        .
      </p>

      <LegalSection heading="1. Try before you pay">
        <p>
          Every account includes a free scan so you can see exactly what{" "}
          {LEGAL_META.productName} does — the flags, the score, and the kinds of
          edits we suggest — before you subscribe. We encourage you to use it
          before purchasing.
        </p>
      </LegalSection>

      <LegalSection heading="2. Cancelling your subscription">
        <p>
          You can cancel at any time from the billing portal in your account.
          Cancellation stops future renewals; your subscription remains active
          until the end of the period you have already paid for, after which it
          will not renew. We do not automatically refund the unused portion of a
          period on cancellation, except as set out below or as required by law.
        </p>
      </LegalSection>

      <LegalSection heading="3. Refunds">
        <p>
          If {LEGAL_META.productName} isn&apos;t right for you, contact us within{" "}
          <strong>14 days</strong> of your first payment and we will refund that
          payment. This goodwill window applies to first-time subscribers and to
          the most recent charge only.
        </p>
        <p>For renewals after the first period:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            we generally do not refund a renewal once the new period has begun;
          </li>
          <li>
            if you were charged for a renewal you intended to cancel and you
            contact us promptly (within a few days), we will usually refund it as
            a courtesy;
          </li>
          <li>
            duplicate charges and billing errors are always refunded in full.
          </li>
        </ul>
        <p>
          Refunds are issued to your original payment method via Stripe and
          typically appear within 5–10 business days, depending on your bank.
        </p>
      </LegalSection>

      <LegalSection heading="4. Statutory rights">
        <p>
          Nothing in this policy limits any non-waivable refund or cancellation
          rights you have under the consumer law of your country. Where those
          rights give you more than this policy does, they apply.
        </p>
      </LegalSection>

      <LegalSection heading="5. How to request a refund">
        <p>
          Email{" "}
          <a
            href={`mailto:${LEGAL_META.contactEmail}`}
            className="text-blue-600 hover:underline"
          >
            {LEGAL_META.contactEmail}
          </a>{" "}
          from the address on your account, with the date of the charge. We aim
          to respond within a few business days.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
