"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import DocPanel from "./DocPanel";
import EditPanel from "./EditPanel";
import ChoicesPanel from "./ChoicesPanel";
import MobileEditView from "./MobileEditView";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

interface Section {
  id: string;
  index: number;
  currentText: string;
  isLocked: boolean;
  flagCount: number;
  flagsResolved: number;
}

interface Flag {
  id: string;
  sectionId: string;
  phraseStart: number;
  phraseEnd: number;
  flaggedPhrase: string;
  explanation: string;
  patternType: string;
  status: string;
}

interface FlagOption {
  id: string;
  flagId: string;
  text: string;
  isBlend: boolean;
}

interface EditingShellProps {
  documentId: string;
  sections: Section[];
  flags: Flag[];
  flagOptions: FlagOption[];
  onFlagResolved: (flagId: string, action: "accepted" | "rejected" | "skipped", optionId?: string, manualText?: string) => Promise<boolean>;
  onRescore: () => void;
}

export default function EditingShell({
  documentId,
  sections,
  flags,
  flagOptions,
  onFlagResolved,
  onRescore,
}: EditingShellProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [docPanelOpen, setDocPanelOpen] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [completedSections, setCompletedSections] = useState<Set<number>>(new Set());
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [manualText, setManualText] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Section lookup map — O(1) instead of O(n) per .find() call
  const sectionMap = useMemo(() => {
    const map = new Map<string, typeof sections[number]>();
    for (const s of sections) map.set(s.id, s);
    return map;
  }, [sections]);

  // Compute the ordered list of open flags across all unlocked sections
  const openFlags = useMemo(() =>
    flags
      .filter((f) => f.status === "open")
      .sort((a, b) => {
        const secA = sectionMap.get(a.sectionId);
        const secB = sectionMap.get(b.sectionId);
        if (!secA || !secB) return 0;
        if (secA.index !== secB.index) return secA.index - secB.index;
        return a.phraseStart - b.phraseStart;
      }),
    [flags, sectionMap]
  );

  const [currentFlagIdx, setCurrentFlagIdx] = useState(0);
  const currentFlag = openFlags[currentFlagIdx] ?? null;
  const currentSection = currentFlag
    ? sectionMap.get(currentFlag.sectionId) ?? null
    : null;

  // Options for the current flag
  const currentOptions = currentFlag
    ? flagOptions
        .filter((o) => o.flagId === currentFlag.id)
        .map((o) => ({
          id: o.id,
          text: o.text,
          note: o.isBlend ? "Blended version" : "Alternative phrasing",
        }))
    : [];

  // Build choices for the ChoicesPanel
  const choices = [
    ...currentOptions.map((o, i) => ({
      number: i + 1,
      label: o.text.slice(0, 40) + (o.text.length > 40 ? "..." : ""),
    })),
    {
      number: currentOptions.length + 1,
      label: "Edit myself",
      isEditMyself: true,
    },
  ];

  function advanceToNextFlag() {
    setSelectedOptionIndex(null);
    setIsManualEditing(false);
    setManualText("");
    if (currentFlagIdx < openFlags.length - 1) {
      setCurrentFlagIdx(currentFlagIdx + 1);
    }
    // Mark section complete if all its flags are resolved
    if (currentSection) {
      const sectionFlags = flags.filter(
        (f) => f.sectionId === currentSection.id
      );
      const allResolved = sectionFlags.every((f) => f.status !== "open" || f.id === currentFlag?.id);
      if (allResolved) {
        setCompletedSections((prev) => new Set([...prev, currentSection.index]));
      }
    }
  }

  async function handleConfirm() {
    if (selectedOptionIndex === null || !currentFlag) return;
    setResolveError(null);

    const totalOptions = currentOptions.length + 1; // +1 for "Edit myself"
    const isEditMyself = selectedOptionIndex === totalOptions - 1;

    if (isEditMyself) {
      if (!isManualEditing) {
        // Enter manual edit mode — show textarea pre-filled with section text
        setIsManualEditing(true);
        setManualText(currentSection?.currentText ?? "");
        return;
      }
      // Already editing — submit the manual text
      const ok = await onFlagResolved(currentFlag.id, "accepted", undefined, manualText);
      if (ok) {
        setIsManualEditing(false);
        setManualText("");
        advanceToNextFlag();
      } else {
        setResolveError("Failed to save your edit. Please try again.");
      }
      return;
    }

    const selectedOption = currentOptions[selectedOptionIndex];
    if (selectedOption) {
      const ok = await onFlagResolved(currentFlag.id, "accepted", selectedOption.id);
      if (ok) {
        advanceToNextFlag();
      } else {
        setResolveError("Failed to save your choice. Please try again.");
      }
    }
  }

  async function handleSkip() {
    if (!currentFlag) return;
    setResolveError(null);
    const ok = await onFlagResolved(currentFlag.id, "skipped");
    if (ok) {
      advanceToNextFlag();
    } else {
      setResolveError("Failed to skip. Please try again.");
    }
  }

  async function handleRejectAll() {
    if (!currentFlag) return;
    setResolveError(null);
    const ok = await onFlagResolved(currentFlag.id, "rejected");
    if (ok) {
      advanceToNextFlag();
    } else {
      setResolveError("Failed to reject. Please try again.");
    }
  }

  function handleSectionClick(index: number) {
    // Jump to the first open flag in this section
    const sectionId = sections.find((s) => s.index === index)?.id;
    if (!sectionId) return;
    const flagIdx = openFlags.findIndex((f) => f.sectionId === sectionId);
    if (flagIdx !== -1) {
      setCurrentFlagIdx(flagIdx);
      setSelectedOptionIndex(null);
    }
  }

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const key = e.key.toLowerCase();

      // Number keys 1-9 select option
      if (key >= "1" && key <= "9") {
        const idx = parseInt(key) - 1;
        if (idx < choices.length) {
          setSelectedOptionIndex(idx);
        }
        return;
      }

      if (key === "enter") {
        e.preventDefault();
        handleConfirm();
        return;
      }

      if (key === "s") {
        handleSkip();
        return;
      }

      if (key === "r") {
        handleRejectAll();
        return;
      }

      if (key === "d") {
        setDocPanelOpen((prev) => !prev);
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choices.length, selectedOptionIndex, currentFlag]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (isMobile) {
    return (
      <MobileEditView
        sectionText={currentSection?.currentText ?? ""}
        flag={
          currentFlag
            ? {
                id: currentFlag.id,
                flaggedPhrase: currentFlag.flaggedPhrase,
                phraseStart: currentFlag.phraseStart,
                phraseEnd: currentFlag.phraseEnd,
                explanation: currentFlag.explanation,
              }
            : null
        }
        options={currentOptions}
        currentFlagNum={currentFlagIdx + 1}
        totalFlags={openFlags.length}
        onConfirm={async (optionId) => {
          if (currentFlag) {
            const ok = await onFlagResolved(currentFlag.id, "accepted", optionId);
            if (ok) advanceToNextFlag();
          }
        }}
        onConfirmManual={async (text) => {
          if (currentFlag) {
            const ok = await onFlagResolved(currentFlag.id, "accepted", undefined, text);
            if (ok) advanceToNextFlag();
          }
        }}
        onSkip={handleSkip}
        onRejectAll={handleRejectAll}
        onRescore={onRescore}
      />
    );
  }

  return (
    <div className="flex h-screen">
      {/* Panel 1 — Doc Panel (toggleable) */}
      {docPanelOpen && (
        <aside className="w-80 shrink-0 border-r border-gray-200 bg-white">
          <DocPanel
            sections={sections}
            activeSectionIndex={currentSection?.index ?? 0}
            completedSections={completedSections}
            onSectionClick={handleSectionClick}
          />
        </aside>
      )}

      {/* Panel 2 — Edit Panel (always visible, primary) */}
      <main className="flex-1 min-w-0 bg-white">
        {/* Error banner */}
        {resolveError && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
            {resolveError}
          </div>
        )}
        {/* Re-evaluate header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-2">
          <span className="text-xs text-gray-400">
            Document: {documentId.slice(0, 8)}...
          </span>
          <button
            onClick={onRescore}
            className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
          >
            Re-evaluate
          </button>
        </div>

        <EditPanel
          sectionText={currentSection?.currentText ?? ""}
          flag={
            currentFlag
              ? {
                  id: currentFlag.id,
                  flaggedPhrase: currentFlag.flaggedPhrase,
                  phraseStart: currentFlag.phraseStart,
                  phraseEnd: currentFlag.phraseEnd,
                  explanation: currentFlag.explanation,
                }
              : null
          }
          options={currentOptions}
          selectedIndex={selectedOptionIndex}
          onSelect={setSelectedOptionIndex}
          currentFlagNum={currentFlagIdx + 1}
          totalFlags={openFlags.length}
          docPanelOpen={docPanelOpen}
          onToggleDocPanel={() => setDocPanelOpen(!docPanelOpen)}
          isManualEditing={isManualEditing}
          manualText={manualText}
          onManualTextChange={setManualText}
        />
      </main>

      {/* Panel 3 — Choices Panel (always visible) */}
      <aside className="w-64 shrink-0 border-l border-gray-200 bg-gray-50">
        <ChoicesPanel
          choices={choices}
          selectedIndex={selectedOptionIndex}
          onSelect={setSelectedOptionIndex}
          onConfirm={handleConfirm}
          onSkip={handleSkip}
          onRejectAll={handleRejectAll}
          currentFlag={currentFlagIdx + 1}
          totalFlags={openFlags.length}
          isManualEditing={isManualEditing}
        />
      </aside>
    </div>
  );
}
