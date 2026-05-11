"use client";

type WorkspaceMode = "dashboard" | "edit" | "review" | "citations";

interface WorkspaceModeStripProps {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onCollapse: () => void;
}

const VIEW_MODES: { key: WorkspaceMode; label: string; shortcut: string }[] = [
  { key: "dashboard", label: "Analysis", shortcut: "\u2318 1" },
  { key: "edit", label: "Edit", shortcut: "\u2318 2" },
  { key: "review", label: "Review Edit Choices", shortcut: "\u2318 3" },
];

const CHECK_MODES: { key: WorkspaceMode; label: string; shortcut: string }[] = [
  { key: "citations", label: "Citations", shortcut: "\u2318 4" },
];

export default function WorkspaceModeStrip({ mode, onModeChange, onCollapse }: WorkspaceModeStripProps) {
  return (
    <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50/80 px-2 py-1">
      {/* Views group */}
      {VIEW_MODES.map((m) => (
        <button
          key={m.key}
          onClick={() => onModeChange(m.key)}
          title={m.shortcut}
          className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
            mode === m.key
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-gray-200"
              : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
          }`}
        >
          {m.label}
        </button>
      ))}

      {/* Separator */}
      <div className="mx-1.5 h-4 w-px bg-gray-300" />

      {/* Checks group */}
      {CHECK_MODES.map((m) => (
        <button
          key={m.key}
          onClick={() => onModeChange(m.key)}
          title={m.shortcut}
          className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
            mode === m.key
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-gray-200"
              : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
          }`}
        >
          {m.label}
        </button>
      ))}

      {/* Spacer + collapse */}
      <div className="flex-1" />
      <button
        onClick={onCollapse}
        title="Collapse panel (E)"
        className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200/60"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
      </button>
    </div>
  );
}
