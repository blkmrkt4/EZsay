import type { Metadata } from "next";
import LegalShell, { LegalSection } from "@/components/legal/LegalShell";
import { LEGAL_META } from "@/lib/legal/meta";

export const metadata: Metadata = {
  title: "Privacy Policy — EzSay",
  description: "How EzSay collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated={LEGAL_META.lastUpdated}>
      <p>
        This Privacy Policy explains how {LEGAL_META.companyName} (&quot;we&quot;,
        &quot;us&quot;, &quot;our&quot;) collects, uses, and protects your
        information when you use {LEGAL_META.productName} at {LEGAL_META.siteUrl}.
        We are the data controller for the personal data described here.
      </p>

      <LegalSection heading="1. Data we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account data</strong> — your email address and authentication
            details, handled by our authentication provider (Supabase). If you
            sign in with Google, we receive your email and basic profile from
            Google.
          </li>
          <li>
            <strong>Document content</strong> — the text you upload or paste, the
            edits you make, the suggestions you accept or reject, and the scores
            and flags generated for your documents.
          </li>
          <li>
            <strong>Billing data</strong> — subscription status and plan. Card
            details are collected and stored by Stripe; we never see or store
            your full card number.
          </li>
          <li>
            <strong>Usage data</strong> — basic product events (for example,
            scans run and limits hit) and standard server logs used to operate
            and secure the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How we use your data">
        <ul className="list-disc space-y-1 pl-5">
          <li>to provide the analysis, editing, and citation features you request;</li>
          <li>to authenticate you and manage your account and subscription;</li>
          <li>to learn and apply your writing-style preferences within your own account;</li>
          <li>to enforce usage limits, prevent abuse, and secure the service;</li>
          <li>to comply with our legal obligations.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your personal data or your document
          content, and we do not use your document content to train our own or
          third parties&apos; foundation models.
        </p>
      </LegalSection>

      <LegalSection heading="3. Third-party processors">
        <p>
          To deliver the service we share data with the processors below, only
          as needed to perform their function:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> — authentication, database, and file
            storage.
          </li>
          <li>
            <strong>Vercel</strong> — application hosting and delivery.
          </li>
          <li>
            <strong>Stripe</strong> — subscription payments and billing.
          </li>
          <li>
            <strong>OpenRouter</strong> and the AI model providers it routes to
            — to analyse and generate edit suggestions, we transmit the relevant
            sections of your document text for processing.
          </li>
          <li>
            <strong>Tavily / web search</strong> — for citation verification we
            transmit citation strings (not your full document) to a web-search
            provider.
          </li>
        </ul>
        <p>
          Some of these providers may process data outside your country. Where
          required, we rely on appropriate safeguards for such transfers.
        </p>
      </LegalSection>

      <LegalSection heading="4. Retention">
        <p>
          We keep your account and document data for as long as your account is
          active. You can delete your documents at any time from within the app.
          When you delete a document or close your account, the associated
          content is removed from our database; backups and provider logs may
          persist for a limited period before being overwritten.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your rights">
        <p>
          Depending on where you live, you may have the right to access,
          correct, export, or delete your personal data, to object to or
          restrict certain processing, and to withdraw consent. To exercise any
          of these rights, contact us at{" "}
          <a
            href={`mailto:${LEGAL_META.contactEmail}`}
            className="text-blue-600 hover:underline"
          >
            {LEGAL_META.contactEmail}
          </a>
          . You also have the right to complain to your local data-protection
          authority.
        </p>
      </LegalSection>

      <LegalSection heading="6. Security">
        <p>
          We use encryption in transit, access controls, and per-user data
          isolation to protect your information. No system is perfectly secure;
          we cannot guarantee absolute security, but we work to protect your
          data and to notify you of material breaches where the law requires.
        </p>
      </LegalSection>

      <LegalSection heading="7. Children">
        <p>
          {LEGAL_META.productName} is not directed to children under 16, and we
          do not knowingly collect their personal data. If you believe a child
          has provided us data, contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes and contact">
        <p>
          We may update this policy from time to time and will revise the
          &quot;Last updated&quot; date when we do. For any privacy question or
          request, contact{" "}
          <a
            href={`mailto:${LEGAL_META.contactEmail}`}
            className="text-blue-600 hover:underline"
          >
            {LEGAL_META.contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
