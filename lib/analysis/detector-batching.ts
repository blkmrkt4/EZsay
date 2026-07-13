/**
 * Shared batching for the LLM-backed detectors (spelling, grammar).
 *
 * One LLM call per section dies on long documents: a 30-section essay is
 * 60 serial calls across the two detectors — far past the Vercel Hobby 60s
 * function cap. Sections are instead grouped into character-budgeted batches
 * (one LLM call each) and processed with limited concurrency under a
 * wall-clock deadline; past the deadline, remaining batches are skipped and
 * the detector returns partial results rather than the function being killed.
 *
 * Finding attribution survives batching because both detectors locate each
 * finding by SEARCHING the section text (LLM offsets were never trusted).
 */

export interface SectionInput {
  id: string;
  currentText: string;
  isLocked: boolean;
}

const MAX_BATCH_CHARS = 6000;

/** Groups eligible sections into character-budgeted batches. */
export function batchSections(sections: SectionInput[]): SectionInput[][] {
  const eligible = sections.filter((s) => !s.isLocked && s.currentText.trim().length >= 10);
  const batches: SectionInput[][] = [];
  let current: SectionInput[] = [];
  let size = 0;

  for (const s of eligible) {
    if (current.length > 0 && size + s.currentText.length > MAX_BATCH_CHARS) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(s);
    size += s.currentText.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Runs `fn` over items with limited concurrency and a hard deadline.
 * Items not started before the deadline are skipped (their results omitted).
 */
export async function mapBatchesWithDeadline<T, R>(
  items: T[],
  concurrency: number,
  deadlineAt: number,
  fn: (item: T) => Promise<R>,
): Promise<{ results: R[]; skipped: number }> {
  const results: R[] = [];
  let index = 0;
  let skipped = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      if (Date.now() > deadlineAt) {
        skipped++;
        continue;
      }
      try {
        results.push(await fn(items[i]));
      } catch {
        // Individual batch failures are non-fatal — other batches still count.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()),
  );
  return { results, skipped };
}
