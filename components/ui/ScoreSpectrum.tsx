"use client";

// Deterministic mock of scan-history values per label.
function mockScanHistory(label: string, current: number): number[] {
  const seed = label.charCodeAt(0) + (label.charCodeAt(1) || 0);
  const hist: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const base = current * (0.6 + 0.4 * t);
    const noise = Math.sin((seed + i * 17) * 0.37) * 7;
    hist.push(Math.max(0, Math.min(100, Math.round(base + noise))));
  }
  hist.push(current);
  return hist;
}

function Sparkline({ history, color, width = 44, height = 16 }: {
  history: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (history.length < 2) return null;
  const max = Math.max(...history);
  const min = Math.min(...history);
  const range = max - min || 1;
  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * (width - 2) + 1;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = history[history.length - 1];
  const lastY = height - ((last - min) / range) * (height - 2) - 1;

  return (
    <svg width={width} height={height} className="shrink-0 opacity-80" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width - 1} cy={lastY} r={1.75} fill={color} />
    </svg>
  );
}

export default function ScoreSpectrum({ label, score, interpretation, lowLabel, highLabel, lowerIsBetter, loading, expanded, onClick }: {
  label: string;
  score: number | null;
  interpretation: string;
  lowLabel: string;
  highLabel: string;
  lowerIsBetter?: boolean;
  loading?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}) {
  const hasScore = score !== null;
  const markerPosition = hasScore ? (lowerIsBetter ? 100 - score : score) : 0;
  const history = hasScore ? mockScanHistory(label, score) : [];

  const perf = hasScore ? (lowerIsBetter ? 100 - score : score) : 0;
  const sparkColor = perf >= 67 ? "#10b981" : perf >= 34 ? "#f59e0b" : "#ef4444";

  return (
    <button
      onClick={onClick}
      aria-pressed={expanded}
      className={`w-full text-left rounded-lg border p-3 transition-all duration-200 ${
        expanded
          ? "border-blue-400 bg-blue-50/40 scale-[1.02]"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
      style={
        expanded
          ? {
              boxShadow:
                "0 0 0 2px rgba(59, 130, 246, 0.30), 0 8px 20px -6px rgba(59, 130, 246, 0.25)",
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">{label}</span>
          <span className="text-[8px] text-gray-400 italic">{lowerIsBetter ? "lower is better" : "higher is better"}</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />}
          {hasScore ? (
            <>
              <Sparkline history={history} color={sparkColor} />
              <span className="text-xl font-bold text-gray-800 tabular-nums">{score}</span>
            </>
          ) : (
            <span className="text-sm text-gray-300">&mdash;</span>
          )}
        </div>
      </div>

      <div
        className="relative h-3 rounded-full overflow-hidden"
        style={{
          background: hasScore
            ? "linear-gradient(to right, #ef4444, #eab308 50%, #22c55e)"
            : "#e5e7eb",
          boxShadow: hasScore
            ? "inset 0 1px 2px rgba(0, 0, 0, 0.18), inset 0 -1px 1px rgba(255, 255, 255, 0.25)"
            : undefined,
        }}
      >
        {hasScore && (
          <div
            className="absolute top-[-1px] h-[calc(100%+2px)] w-1.5 bg-gray-900 rounded-full"
            style={{
              left: `${markerPosition}%`,
              transform: "translateX(-50%)",
              boxShadow: "0 0 0 1.5px rgba(255,255,255,0.9), 0 2px 4px rgba(0,0,0,0.25)",
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-gray-400">{lowLabel}</span>
        <span className="text-[10px] text-gray-500">{interpretation}</span>
        <span className="text-[9px] text-gray-400">{highLabel}</span>
      </div>
    </button>
  );
}
