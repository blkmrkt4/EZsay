import type { ReactNode } from "react";
import type { CalloutSpec } from "./Callout";
import WelcomeMock from "./mocks/WelcomeMock";
import UploadMock from "./mocks/UploadMock";
import LibraryMock from "./mocks/LibraryMock";
import ResultsMock from "./mocks/ResultsMock";
import WorkspaceMock from "./mocks/WorkspaceMock";
import AnalysisMock from "./mocks/AnalysisMock";
import MorphMock from "./mocks/MorphMock";
import ReviewMock from "./mocks/ReviewMock";
import CitationsMock from "./mocks/CitationsMock";
import StyleRulesMock from "./mocks/StyleRulesMock";
import ShadingLegendMock from "./mocks/ShadingLegendMock";
import DashboardMock from "./mocks/DashboardMock";
import LibraryVersionsMock from "./mocks/LibraryVersionsMock";
import PanelCollapseMock from "./mocks/PanelCollapseMock";
import EditMarksMock from "./mocks/EditMarksMock";
import CitationsDetailMock from "./mocks/CitationsDetailMock";
import StyleRulesFullMock from "./mocks/StyleRulesFullMock";
import FormattingWizardMock from "./mocks/FormattingWizardMock";
import AuditorScanMock from "./mocks/AuditorScanMock";
import StatusBarMock from "./mocks/StatusBarMock";

/** A single screen within a drill-down (cul-de-sac) detour. */
export interface DrillStep {
  id: string;
  title: string;
  body: ReactNode;
  url: string;
  visual: ReactNode;
  callouts?: CalloutSpec[];
  caption?: string;
}

export interface DemoStep {
  id: string;
  /** Small label above the title, e.g. "Upload". */
  eyebrow: string;
  title: string;
  body: ReactNode;
  /** Faux address-bar path shown in the window chrome. */
  url: string;
  /** The visual: a mock component or a screenshot <img>. */
  visual: ReactNode;
  /** Optional annotation markers positioned over the visual. */
  callouts?: CalloutSpec[];
  /** Optional caption under the visual (e.g. desktop-only note). */
  caption?: string;
  /** Optional cul-de-sac detour: a labelled set of deeper sub-screens. */
  drill?: { label: string; steps: DrillStep[] };
}

export const STEPS: DemoStep[] = [
  {
    id: "welcome",
    eyebrow: "Welcome",
    title: "Make AI-assisted writing sound like you",
    body: (
      <>
        EzSay is an <strong>editor, not a generator</strong>. You upload your own draft, it finds the
        phrasing that reads as AI, and it guides you through fixing it — every change is your call. This
        2-minute tour shows how the whole thing works.
      </>
    ),
    url: "ezsay.byzyb.ai",
    visual: <WelcomeMock />,
    drill: {
      label: "It's not just about AI — see everything EzSay checks",
      steps: [
        {
          id: "welcome-dashboard",
          title: "EzSay checks eight things, not just AI",
          body: (
            <>
              &ldquo;Sounding human&rdquo; is more than dodging AI detectors. EzSay scores your draft across{" "}
              <strong>eight measures</strong>{" "}— AI detectability, AI artifacts, writing quality, citations,
              plagiarism / close matches, tone consistency, spelling, and grammar — and rolls them into one
              Auditor score. This is the full dashboard you land on after a scan.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <DashboardMock focus="overview" />,
        },
      ],
    },
  },
  {
    id: "upload",
    eyebrow: "Step 1 · Upload",
    title: "Bring in your document — and name it",
    body: (
      <>
        Drop a <strong>PDF, DOCX, or TXT</strong>, or paste text straight in. Give it a name right here —
        that becomes your <strong>working document</strong>. Then pick the document type
        (professional, academic, casual, or legal) so the scan knows what &ldquo;normal&rdquo; looks like.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <UploadMock />,
    callouts: [
      { n: 1, label: "Rename → your working doc", x: 50, y: 67, side: "top" },
      { n: 2, label: "Tell it the document type", x: 30, y: 78, side: "bottom" },
    ],
  },
  {
    id: "library",
    eyebrow: "Step 2 · Library",
    title: "Your library tracks every document",
    body: (
      <>
        Each document shows its <strong>word count</strong>, how many <strong>items are left to
        review</strong>, the date, version count, and a <strong>risk score</strong>. The score is
        color-coded: <span className="font-medium text-red-600">red</span>{" "}needs work,
        <span className="font-medium text-amber-500"> amber</span>{" "}is borderline,
        <span className="font-medium text-green-600"> green</span>{" "}reads as human.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <LibraryMock />,
    callouts: [
      { n: 1, label: "Words & items to review", x: 27, y: 41, side: "bottom" },
      { n: 2, label: "Risk score", x: 88, y: 33, side: "left" },
    ],
    drill: {
      label: "See a document's version history",
      steps: [
        {
          id: "library-versions",
          title: "Every save is a version you can return to",
          body: (
            <>
              The library is more than a flat list. Open any document&apos;s picker and you&apos;ll see its{" "}
              <strong>version history</strong>{" "}— each saved revision with its date and risk score, so you can
              watch the score drop as you edit and jump back to an earlier draft anytime.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <LibraryVersionsMock />,
          callouts: [{ n: 1, label: "Saved revisions, newest first", x: 50, y: 62, side: "top" }],
        },
      ],
    },
  },
  {
    id: "scan",
    eyebrow: "Step 3 · Scan",
    title: "Scan finds the AI patterns",
    body: (
      <>
        EzSay scans your text against a live library of AI-pattern phrases and structures, then gives you a
        single <strong>AI Risk Score (0–100)</strong>{" "}and a list of flagged sections. The score only
        changes <strong>when you ask it to re-evaluate</strong>{" "}— never silently mid-edit.
      </>
    ),
    url: "ezsay.byzyb.ai/results",
    visual: <ResultsMock />,
    callouts: [
      { n: 1, label: "Your AI Risk Score", x: 86, y: 18, side: "left" },
      { n: 2, label: "Flagged sections, by severity", x: 22, y: 62, side: "top" },
    ],
  },
  {
    id: "workspace",
    eyebrow: "Step 4 · Workspace",
    title: "The workspace has four tabs",
    body: (
      <>
        Everything happens here. Across the top:
        <strong> Analysis</strong>{" "}(the summary), <strong>Edit</strong>{" "}(fix flags one by one),
        <strong> Review Edit Choices</strong>{" "}(see your before/after), and <strong>Citations</strong>.
        Three panels work together — your document, the edit, and your choice.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <WorkspaceMock />,
    callouts: [
      { n: 1, label: "Four tabs", x: 50, y: 4, side: "bottom" },
      { n: 2, label: "Document", x: 18, y: 21, side: "bottom" },
      { n: 3, label: "Edit", x: 56, y: 32, side: "bottom" },
      { n: 4, label: "Your choice", x: 90, y: 21, side: "bottom" },
    ],
    caption: "The editing workspace is built for full-width desktop.",
  },
  {
    id: "analysis",
    eyebrow: "Tab · Analysis",
    title: "Analysis: the whole picture at a glance",
    body: (
      <>
        The Analysis tab breaks your score into parts — AI detectability, artifacts, writing quality,
        citations, tone — and counts exactly how many <strong>items are left to review</strong>{" "}and what
        kind they are. It&apos;s your starting map before you dive into editing.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <AnalysisMock />,
    drill: {
      label: "Click a score to see exactly what's behind it",
      steps: [
        {
          id: "analysis-ai",
          title: "AI detectability — every flag, listed",
          body: (
            <>
              Click the <strong>AI Detectability</strong>{" "}score and it expands into the actual flags: the
              common AI phrases (<em>Furthermore</em>, <em>nuanced</em>, <em>holistic</em>…) and the structural
              tells like uniform sentence length. No black box — you see what drove the number.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <DashboardMock focus="ai" />,
        },
        {
          id: "analysis-artifacts",
          title: "AI artifacts — the invisible giveaways",
          body: (
            <>
              <strong>AI artifacts</strong>{" "}are the formatting tells pasted in from chatbots: en dashes, curly
              &ldquo;smart&rdquo; quotes, unicode ellipses, double spaces. Individually tiny, collectively a
              dead giveaway — here they&apos;re counted so you can strip them in one pass.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <DashboardMock focus="artifacts" />,
        },
        {
          id: "analysis-writing",
          title: "Writing quality — readability and rhythm",
          body: (
            <>
              <strong>Writing quality</strong>{" "}breaks into readability, paragraph and sentence variation,
              coherence, and lexical diversity. Uniform, monotone writing scores low — exactly the texture
              detectors (and readers) notice.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <DashboardMock focus="writing" />,
        },
        {
          id: "analysis-plagiarism",
          title: "Plagiarism — close matches against the web",
          body: (
            <>
              EzSay checks each passage against real sources and surfaces <strong>close matches</strong>{" "}—
              phrasing that mirrors a source too closely — with a confidence score and a link, so you can
              rephrase in your own words. (Outright plagiarism is separate; here it&apos;s zero.)
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <DashboardMock focus="plagiarism" />,
        },
      ],
    },
  },
  {
    id: "edit-panes",
    eyebrow: "Tab · Edit",
    title: "Edit: three panels, one decision at a time",
    body: (
      <>
        The <strong>Document panel</strong>{" "}(left) keeps your full text in context and highlights the exact
        passage in <span className="font-medium text-violet-600">violet</span>. The <strong>Edit
        panel</strong>{" "}(center) shows numbered rewrite options. The <strong>Choices panel</strong>{" "}(right)
        is where you Confirm, Skip, Reject — or choose to edit it yourself.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <WorkspaceMock />,
    callouts: [
      { n: 1, label: "Passage in context (violet)", x: 18, y: 21, side: "bottom" },
      { n: 2, label: "Numbered options", x: 56, y: 32, side: "bottom" },
      { n: 3, label: "Confirm / Skip / Reject", x: 90, y: 37, side: "bottom" },
    ],
    caption: "The editing workspace is built for full-width desktop.",
    drill: {
      label: "Make room: collapse panels & jump between edits",
      steps: [
        {
          id: "edit-collapse",
          title: "Collapse any panel for more room",
          body: (
            <>
              Each panel header has a <strong>caret</strong>. Click it to fold that panel away and give the
              space to the others — hide the document while you focus on options, or hide choices to read in
              context. Every panel toggles independently.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <PanelCollapseMock />,
        },
        {
          id: "edit-marks",
          title: "The scroll rail shows where every edit is",
          body: (
            <>
              Down the right edge of the document, little <span className="font-medium text-amber-600">marks</span>{" "}
              pinpoint each flag — a heat-map of where the work is. Click a mark to jump straight to that edit
              instead of scrolling to hunt for it.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <EditMarksMock />,
        },
      ],
    },
  },
  {
    id: "morph",
    eyebrow: "Tab · Edit",
    title: "Compare options without the noise",
    body: (
      <>
        When the options are full rewrites, EzSay dims the wording they share and stacks only the parts that
        actually <strong>differ</strong>{" "}— numbered to match your choices. You pick a whole option (so the
        paragraph stays coherent); want a custom blend? Choose <em>&ldquo;Edit myself.&rdquo;</em>
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <MorphMock />,
  },
  {
    id: "shading",
    eyebrow: "Reference",
    title: "What the colors mean",
    body: (
      <>
        The highlighting is consistent everywhere. Amber / yellow / blue rank how strongly something reads as
        AI.{" "}
        <span className="font-medium text-violet-600">Violet</span>{" "}marks the passage you&apos;re editing
        right now, <span className="font-medium text-green-600">green</span>{" "}means resolved, and grey means a
        locked citation EzSay will never touch.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <ShadingLegendMock />,
  },
  {
    id: "review",
    eyebrow: "Tab · Review",
    title: "Review every change before you commit",
    body: (
      <>
        The <strong>Review Edit Choices</strong>{" "}tab lays your edits out as a clean before/after diff —
        removed text struck through, your replacement in green. Nothing in your document changed without a
        choice you made.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <ReviewMock />,
  },
  {
    id: "citations",
    eyebrow: "Tab · Citations",
    title: "Citations are protected",
    body: (
      <>
        Citations and reference lists are <strong>locked</strong>{" "}— never flagged, edited, or counted in your
        risk score. EzSay only checks their <strong>format</strong>{" "}and whether the <strong>source is
        real</strong>, and every suggested fix needs your explicit accept, edit, verify, or dismiss.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <CitationsMock />,
    drill: {
      label: "See the Citations tab in action",
      steps: [
        {
          id: "citations-detail",
          title: "Structural checks + live web verification",
          body: (
            <>
              EzSay flags <strong>structural</strong>{" "}problems (a missing year, wrong format for your style)
              and <strong>verifies each source against the web</strong>{" "}to catch invented references. It also
              nudges you to leave citations for last — rewrites can move text around them. Every fix is still
              yours to accept or dismiss.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <CitationsDetailMock />,
        },
      ],
    },
  },
  {
    id: "style",
    eyebrow: "Settings · Style Rules",
    title: "Set the rules for how you sound",
    body: (
      <>
        Style Rules let you tell EzSay your preferences — contractions, first person, sentence variety, and
        more — and they steer both the scan and the suggestions. Each document type keeps its
        <strong> own separate rules</strong>.
      </>
    ),
    url: "ezsay.byzyb.ai/w",
    visual: <StyleRulesMock />,
    drill: {
      label: "Explore the rules & the setup wizard",
      steps: [
        {
          id: "style-full",
          title: "Dozens of preferences, all searchable",
          body: (
            <>
              Beyond the basics there&apos;s a full list of <strong>universal preferences</strong>{" "}— English
              variant, formality, passive-voice tolerance, quotation style, spacing — each a toggle or
              dropdown. Search to find one fast. These directly shape what the scan flags and what rewrites you
              get.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <StyleRulesFullMock />,
        },
        {
          id: "style-wizard",
          title: "A wizard sets up document formatting",
          body: (
            <>
              New document? The <strong>Quick setup wizard</strong>{" "}walks you through formatting in a couple of
              pages — citation placement, first person, indentation, line spacing, heading format, reference
              list, word-count limit — then saves it as the document&apos;s rules.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <FormattingWizardMock />,
        },
      ],
    },
  },
  {
    id: "rescore",
    eyebrow: "You're ready",
    title: "Re-evaluate, save, and you're done",
    body: (
      <>
        When you&apos;ve worked through the flags, hit <strong>Re-evaluate</strong>{" "}to get a fresh score and{" "}
        <strong>Save a version</strong>{" "}to track your progress over time. That&apos;s the whole loop —
        upload, scan, edit, re-score. Ready to try it on your own draft?
      </>
    ),
    url: "ezsay.byzyb.ai",
    visual: <WelcomeMock />,
    drill: {
      label: "See the Auditor score & live counters",
      steps: [
        {
          id: "rescore-auditor",
          title: "One Auditor score, on demand",
          body: (
            <>
              The <strong>Scan</strong>{" "}button in the header runs a full re-evaluation and rolls all eight
              measures into a single weighted <strong>Auditor score</strong>. It only moves when you ask it to
              — so the number always reflects a deliberate checkpoint, not a half-finished edit.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <AuditorScanMock />,
        },
        {
          id: "rescore-status",
          title: "Live word & character count",
          body: (
            <>
              The status bar in the bottom-left tracks your <strong>word and character count</strong>{" "}as you
              type, plus sections, flags, items left to review, and your last scan depth — handy when
              you&apos;re writing to a limit.
            </>
          ),
          url: "ezsay.byzyb.ai/w",
          visual: <StatusBarMock />,
        },
      ],
    },
  },
];
