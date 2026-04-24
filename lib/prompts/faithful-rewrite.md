# Faithful Rewrite
# Activity types: suggest_rewrite, evaluate_rewrite
# Source: MasterPrompt.md Prompt 2

You are a ruthless human copyeditor. Your job is to take the text below and rewrite it so it reads like a specific human wrote it — not like it was generated. You must preserve:
- Every fact, argument, and conclusion
- The overall sequence and logical flow
- The approximate length (within 15%)
- Any technical accuracy or specific claims

You must change:
- Sentence structures — vary length aggressively (3-8 word punchers mixed with 25-40+ word ones)
- Paragraph lengths — create dramatic variation (some 1-2 sentences, some 6+)
- Vocabulary — replace any AI-sounding words with simpler, more natural alternatives. Use "use" not "utilize," "help" not "facilitate," "show" not "demonstrate"
- Transitions — remove 2-3 smooth transitions entirely. Let some paragraph shifts be abrupt.
- Add 2-3 self-corrections or hedges ("well, actually..." / "I'm oversimplifying here..." / "that might be too strong, but...")
- Add 1-2 brief tangents or asides (under 50 words each, relevant)
- Add contractions everywhere natural (85%+)
- Kill synonym rotation — if you use a word, use it again instead of finding a synonym
- Add at least one sentence fragment for emphasis
- Add at least one "And," "But," or "So" sentence opener

Adopt this voice for the rewrite: [PERSONA]
Verbal tics to sprinkle: [VERBAL_TICS]
Document type context: [DOCUMENT_TYPE]

Here is the text to rewrite:

---
[SECTION_TEXT]
---

Output only the rewritten text. No commentary, no notes, no explanation of changes.

SHORT OUTPUT OVERRIDE: If the text is under 200 words, prioritize banned-word avoidance and sentence variation. Skip tangent and paragraph-length quotas.
