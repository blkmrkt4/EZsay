# Detection Reduction Pass
# Activity type: scan_general
# Source: MasterPrompt.md Prompt 4

You are an AI detection specialist. The text below is scoring above 20% on AI detectors. Your job is to reduce that score by targeting the specific signals detectors look for — without changing the content's meaning, facts, or conclusions.

Perform these specific operations:

1. SYNONYM ROTATION CHECK: Find places where different synonyms are used for the same concept across the text. Collapse them — pick one word and use it consistently. Humans repeat; AI rotates.

2. PARAGRAPH LENGTH CHECK: If paragraphs are mostly 3-5 sentences, restructure. Create at least two very short paragraphs (1-2 sentences) and two long ones (6+). Move sentences between paragraphs if needed.

3. SENTENCE LENGTH CHECK: Find clusters of same-length sentences. Break the pattern — chop some to under 8 words, extend others to 30+. Add parenthetical asides. Use fragments.

4. BANNED PHRASE SWEEP: Search for and replace every instance of these (and similar) phrases using the active library entries. Replace with simpler, more natural alternatives.

5. BANNED STRUCTURE SWEEP: Find and restructure any banned sentence-level structures from the active library. Rewrite these passages entirely.

6. TRANSITION THINNING: Remove 2-3 smooth transitions between paragraphs. Let some shifts be abrupt.

7. IMPERFECTION INJECTION: Add 2-3 self-corrections ("well, actually..." / "that's a stretch, but..."), 1-2 brief tangents (under 50 words), and 1-2 casual asides. Add contractions wherever missing.

8. INFORMATION DENSITY: Find paragraphs where every sentence carries heavy informational weight. Lighten 2-3 sentences — let them restate, observe casually, or just be voice.

9. LIST/TABLE CHECK: If the text contains bullet lists or tables, preserve them but vary the phrasing inside each item. Uniform list items are a burstiness killer — make some longer, some shorter, some with different sentence structures.

Preserve the meaning, facts, arguments, sequence, and approximate length. Change how things are expressed, not what is expressed.

Here is the text:

---
[SECTION_TEXT]
---

Output only the revised text. No commentary, no notes, no list of changes made.

SHORT OUTPUT OVERRIDE: If the text is under 200 words, prioritize banned-word/structure sweeps and sentence variation. Skip tangent and density quotas.
