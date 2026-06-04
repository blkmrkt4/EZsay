import type { Metadata } from "next";
import LegalShell, { LegalSection } from "@/components/legal/LegalShell";
import { LEGAL_META } from "@/lib/legal/meta";

export const metadata: Metadata = {
  title: "Terms of Service — EzSay",
  description: "The terms governing your use of EzSay.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" lastUpdated={LEGAL_META.lastUpdated}>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use
        of {LEGAL_META.productName}, a web-based writing editor operated by{" "}
        {LEGAL_META.companyName} (&quot;we&quot;, &quot;us&quot;,
        &quot;our&quot;), available at {LEGAL_META.siteUrl}. By creating an
        account, scanning a document, or subscribing, you agree to these Terms.
        If you do not agree, do not use {LEGAL_META.productName}.
      </p>

      <LegalSection heading="1. What EzSay does">
        <p>
          {LEGAL_META.productName} is an edit-oriented writing tool. You upload
          or paste your own documents; we analyse them, flag patterns commonly
          associated with AI-generated writing, weak citations, grammar issues,
          and similar, and present suggested edits. You decide which suggestions
          to accept, modify, or reject. {LEGAL_META.productName} does not write
          documents for you and does not guarantee that any output will evade,
          or be detected by, any third-party AI-detection tool.
        </p>
      </LegalSection>

      <LegalSection heading="2. Eligibility and accounts">
        <p>
          You must be at least 16 years old (or the age of digital consent in
          your jurisdiction) to use {LEGAL_META.productName}. You are
          responsible for the accuracy of your account information, for keeping
          your credentials secure, and for all activity under your account.
        </p>
      </LegalSection>

      <LegalSection heading="3. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            upload content you do not own or have the right to process, or that
            infringes anyone&apos;s rights;
          </li>
          <li>
            use {LEGAL_META.productName} to commit academic misconduct, fraud,
            or any unlawful act, where doing so is prohibited by the rules that
            apply to you (for example, your institution&apos;s academic-integrity
            policy);
          </li>
          <li>
            attempt to access other users&apos; data, probe or circumvent our
            security, or scrape, overload, or abuse the service or its
            rate limits;
          </li>
          <li>
            resell, sublicense, or provide the service to third parties except
            as expressly permitted.
          </li>
        </ul>
        <p>
          You are solely responsible for how you use any edited output,
          including compliance with the academic, professional, or legal rules
          that apply to your work.
        </p>
      </LegalSection>

      <LegalSection heading="4. Your content">
        <p>
          You retain all rights to the documents you upload (&quot;Your
          Content&quot;). You grant us a limited licence to store, process, and
          transmit Your Content solely to operate the service for you — which
          includes sending relevant text to the third-party AI model and
          web-search providers that power analysis and citation checking. We do
          not sell Your Content. See our{" "}
          <a href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </a>{" "}
          for detail on how data is handled.
        </p>
      </LegalSection>

      <LegalSection heading="5. Subscriptions, billing, and free scans">
        <p>
          {LEGAL_META.productName} offers a free tier (a limited number of
          scans) and paid subscriptions billed monthly or annually through our
          payment processor, Stripe. By subscribing you authorise recurring
          charges to your payment method until you cancel. Subscriptions renew
          automatically at the end of each billing period at the then-current
          price. You can cancel at any time from your account&apos;s billing
          portal; cancellation takes effect at the end of the current period.
          Refunds are governed by our{" "}
          <a href="/refund" className="text-blue-600 hover:underline">
            Refund Policy
          </a>
          . We may change prices on prospective renewals with reasonable notice.
        </p>
      </LegalSection>

      <LegalSection heading="6. Service availability">
        <p>
          We aim to keep {LEGAL_META.productName} available but provide it on an
          &quot;as is&quot; and &quot;as available&quot; basis. We may modify,
          suspend, or discontinue features, and we rely on third-party providers
          (hosting, model routing, payments) whose availability we do not
          control.
        </p>
      </LegalSection>

      <LegalSection heading="7. Disclaimers">
        <p>
          To the fullest extent permitted by law, {LEGAL_META.productName} is
          provided without warranties of any kind. Analysis, scores, suggested
          edits, and citation checks are automated, may be inaccurate, and are
          not a substitute for your own judgement or professional advice. You
          remain responsible for the final content you submit anywhere.
        </p>
      </LegalSection>

      <LegalSection heading="8. Limitation of liability">
        <p>
          To the fullest extent permitted by law, {LEGAL_META.companyName} will
          not be liable for any indirect, incidental, consequential, or special
          damages, or for loss of data, reputation, grades, or profits. Our
          total liability for any claim relating to the service is limited to
          the amount you paid us in the twelve months before the claim arose.
          Nothing in these Terms excludes liability that cannot be excluded by
          law.
        </p>
      </LegalSection>

      <LegalSection heading="9. Termination">
        <p>
          You may stop using {LEGAL_META.productName} at any time. We may suspend
          or terminate access if you breach these Terms or use the service in a
          way that risks harm to others or to us. On termination, your right to
          use the service ends; sections that by their nature should survive
          (content ownership, disclaimers, liability, governing law) continue to
          apply.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to these Terms">
        <p>
          We may update these Terms from time to time. When we make material
          changes we will update the &quot;Last updated&quot; date and, where
          appropriate, notify you. Continued use after changes take effect means
          you accept the revised Terms.
        </p>
      </LegalSection>

      <LegalSection heading="11. Governing law and contact">
        <p>
          These Terms are governed by the laws of {LEGAL_META.jurisdiction},
          without regard to conflict-of-laws rules. Questions about these Terms
          can be sent to{" "}
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
