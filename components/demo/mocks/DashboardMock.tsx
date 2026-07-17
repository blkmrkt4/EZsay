"use client";

/**
 * The Analysis dashboard (mirrors components/results/AnalysisPanel.tsx and the
 * real /w analysis tab). Drives the welcome-step "it's not just AI" overview
 * AND the four Analysis drill-downs via the `focus` prop:
 *   "overview"   → all 8 score spectrums
 *   "ai"         → AI Detectability + AI Artifacts pair, AI-detection flags breakdown
 *   "artifacts"  → same pair, artifacts breakdown
 *   "writing"    → Writing Quality + Citations pair, writing-quality breakdown
 *   "plagiarism" → Plagiarism + Tone pair, plagiarism close-matches breakdown
 */
type Focus = "overview" | "ai" | "artifacts" | "writing" | "plagiarism";

interface Spectrum {
  key: string;
  label: string;
  score: number; // 0-100, higher = better — every metric, no exceptions
  band: string;
}

const SPECTRUMS: Record<string, Spectrum> = {
  ai: { key: "ai", label: "AI Detectability", score: 83, band: "Low AI signals" },
  artifacts: { key: "artifacts", label: "AI Artifacts", score: 73, band: "Minor" },
  writing: { key: "writing", label: "Writing Quality", score: 58, band: "Fair" },
  citations: { key: "citations", label: "Citations", score: 0, band: "Needs attention" },
  plagiarism: { key: "plagiarism", label: "Plagiarism", score: 96, band: "Minor matches" },
  tone: { key: "tone", label: "Tone Consistency", score: 100, band: "Consistent" },
  spelling: { key: "spelling", label: "Spelling", score: 100, band: "Clean" },
  grammar: { key: "grammar", label: "Grammar", score: 100, band: "Clean" },
};

const OVERVIEW_ORDER = ["ai", "artifacts", "writing", "citations", "plagiarism", "tone", "spelling", "grammar"];
const PAIRS: Record<string, [string, string]> = {
  ai: ["ai", "artifacts"],
  artifacts: ["ai", "artifacts"],
  writing: ["writing", "citations"],
  plagiarism: ["plagiarism", "tone"],
};

function ScoreCard({ s, focused }: { s: Spectrum; focused?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white p-3 ${focused ? "border-blue-400 ring-2 ring-blue-300" : "border-gray-200"}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-gray-900">{s.label}</span>
        </div>
        <span className="text-2xl font-bold text-gray-900">{s.score}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500">
        <span
          className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-gray-900 ring-1 ring-white"
          style={{ left: `${s.score}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-gray-400">
        <span>0</span>
        <span className="font-medium text-gray-500">{s.band}</span>
        <span>100</span>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-bold text-gray-900">Analysis</h3>
        <span className="text-xs text-gray-500">
          29 AI flags, 122 artifacts, 7 close matches
        </span>
        <span className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white">Start Editing</span>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">Click any score to see what contributed to it.</p>
    </div>
  );
}

function AiBreakdown() {
  const phrases = ["Furthermore", "dichotomy", "testament", "facilitate", "Additionally", "essential", "nuanced", "holistic"];
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">AI Detection (29 flags)</p>
      <div className="flex items-center justify-between">
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">Common AI Phrase</span>
        <span className="text-[10px] text-gray-400">16 flags</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
        {phrases.map((p) => (
          <p key={p} className="truncate text-[11px]">
            <span className="font-medium text-red-600">{p}</span>{" "}
            <span className="text-gray-400">high-signal AI marker</span>
          </p>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-gray-400">+ 8 more</p>
      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
        <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[11px] font-medium text-yellow-800">Uniform Length</span>
        <span className="text-[10px] text-gray-400">14 flags</span>
      </div>
    </div>
  );
}

function ArtifactsBreakdown() {
  const rows = [
    ["En dashes (used as separators)", "2 en dashes", -4],
    ["Unicode ellipsis", "1 unicode ellipsis", -2],
    ["Curly/smart double quotes", "8 curly double quotes", -2],
    ["Curly/smart single quotes", "63 curly single quote pairs", -4],
    ["Curly apostrophes mid-word", "38 curly apostrophes", -4],
    ["Double spaces after periods", "7 double spaces", -4],
    ["Decorative dingbats", "3 dingbats", -3],
  ] as const;
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">AI Artifacts (122 instances)</p>
      <div className="divide-y divide-gray-100">
        {rows.map(([name, sub, pts]) => (
          <div key={name} className="flex items-center justify-between py-1.5">
            <div>
              <p className="text-xs font-medium text-gray-800">{name}</p>
              <p className="text-[10px] text-gray-400">{sub}</p>
            </div>
            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[11px] font-medium text-yellow-800">{pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WritingBreakdown() {
  const rows = [
    ["Readability (Flesch)", "Sentence length and word complexity. Higher = more readable.", 23, "bg-red-500"],
    ["Paragraph Variation", "How varied your paragraph lengths are. Uniform = AI-like.", 100, "bg-green-500"],
    ["Sentence Variation", "Mix of short and long sentences. Higher = more natural.", 100, "bg-green-500"],
    ["Section Coherence", "How well adjacent sentences connect.", 76, "bg-green-500"],
    ["Lexical Diversity", "Vocabulary range. Higher = richer word choice.", 100, "bg-green-500"],
  ] as const;
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Writing Quality Breakdown</p>
      <div className="space-y-2">
        {rows.map(([name, desc, val, color]) => (
          <div key={name}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-800">{name}</span>
              <span className={`text-xs font-bold ${val < 40 ? "text-red-600" : "text-green-600"}`}>{val}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${val}%` }} />
            </div>
            <p className="text-[9px] text-gray-400">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlagiarismBreakdown() {
  const cards = [
    {
      conf: "80% confidence",
      quote: "Using Populist Theory to Analyse the Empirical Behaviour of Recent Populist Leaders…",
      source: "The Populist Harm to Democracy: An Empirical Assessment",
    },
    {
      conf: "70% confidence",
      quote: "populist leaders which underly their foreign policy behaviour, as well as the reaction…",
      source: "Populism and foreign policy: a research agenda — PMC",
    },
  ];
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Plagiarism — 21 passages checked, 0 plagiarism, 7 close matches
      </p>
      <div className="space-y-2">
        {cards.map((c) => (
          <div key={c.source} className="rounded-md border-l-4 border-l-orange-400 bg-orange-50/60 p-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">Close Match</span>
              <span className="text-[10px] italic text-gray-500">consider rephrasing</span>
              <span className="text-[10px] text-gray-400">{c.conf}</span>
            </div>
            <p className="mt-1 text-[11px] italic text-gray-700">&ldquo;{c.quote}&rdquo;</p>
            <p className="mt-1 text-[11px] text-blue-600 underline">{c.source}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardMock({ focus = "overview" }: { focus?: Focus }) {
  if (focus === "overview") {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden p-5 text-left">
        <Header />
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          {OVERVIEW_ORDER.map((k) => (
            <ScoreCard key={k} s={SPECTRUMS[k]} />
          ))}
        </div>
      </div>
    );
  }

  const [a, b] = PAIRS[focus];
  const Breakdown =
    focus === "ai" ? AiBreakdown : focus === "artifacts" ? ArtifactsBreakdown : focus === "writing" ? WritingBreakdown : PlagiarismBreakdown;
  const ringed = focus === "artifacts" ? "artifacts" : focus;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden p-5 text-left">
      <Header />
      <div className="mt-1 grid grid-cols-2 gap-2.5">
        <ScoreCard s={SPECTRUMS[a]} focused={a === ringed} />
        <ScoreCard s={SPECTRUMS[b]} focused={b === ringed} />
      </div>
      <div className="mt-2.5">
        <Breakdown />
      </div>
    </div>
  );
}
