"use client";

interface OriginalTextBlockProps {
  text: string;
  flaggedPhrase: string;
  phraseStart: number;
  phraseEnd: number;
}

/**
 * Displays the user's original text with the flagged phrase highlighted.
 * This is the most visually dominant element on screen.
 */
export default function OriginalTextBlock({
  text,
  flaggedPhrase,
  phraseStart,
  phraseEnd,
}: OriginalTextBlockProps) {
  const before = text.slice(0, phraseStart);
  const highlighted = text.slice(phraseStart, phraseEnd);
  const after = text.slice(phraseEnd);

  return (
    <div className="rounded-lg border-2 border-gray-300 bg-white p-5">
      <p className="text-base leading-relaxed text-gray-900">
        {before}
        <mark className="rounded bg-amber-200 px-0.5 underline decoration-amber-400 decoration-2 underline-offset-2">
          {highlighted}
        </mark>
        {after}
      </p>
    </div>
  );
}
