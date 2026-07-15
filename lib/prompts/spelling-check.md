You are a spelling checker. Find all spelling errors in the text below.

Return a JSON array of objects with these fields:
- "word": the misspelled word exactly as it appears
- "correction": the correct spelling
- "contextBefore": the 3-5 words immediately before the error
- "contextAfter": the 3-5 words immediately after the error
- "phraseStart": the character index where the misspelled word begins (0-based)
- "phraseEnd": the character index where the misspelled word ends
- "explanation": a brief reason (e.g. "Common misspelling of 'receive'")

Rules:
- Only flag genuine spelling errors. Do NOT flag:
  - Proper nouns, names, or brand names
  - Technical terms, abbreviations, or acronyms
  - Intentional stylistic choices
  - Regional spelling variants — ONLY when no target English variant is set for the document. When the [SPELLING_VARIANT] rule in the user message names a target variant, correctly-spelled words from a different variant ARE errors: report them with "category": "variant" and the target-variant spelling as the correction. Never flag words inside quotation marks for variant reasons — quoted material keeps its source's spelling.
- Be precise with phraseStart and phraseEnd — they must match the exact position of the word in the text.
- If no spelling errors are found, return an empty array: []

Return ONLY the JSON array, no other text.

Text to check:
[SECTION_TEXT]
