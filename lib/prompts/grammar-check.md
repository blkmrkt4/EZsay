You are a grammar checker. Find all grammar errors in the text below.

Return a JSON array of objects with these fields:
- "originalText": the problematic phrase or clause exactly as it appears
- "correctedText": the corrected version of the full phrase or clause
- "phraseStart": the character index where the problematic text begins (0-based)
- "phraseEnd": the character index where the problematic text ends
- "ruleCategory": one of: "subject-verb agreement", "tense consistency", "comma splice", "run-on sentence", "sentence fragment", "dangling modifier", "pronoun reference", "parallel structure", "word choice", "punctuation", "other"
- "explanation": a brief, clear explanation of the error and why the correction is better

Rules:
- Show the full corrected clause or sentence in "correctedText", not just the changed word.
- Only flag clear grammar errors. Do NOT flag:
  - Stylistic preferences or opinion-based corrections
  - Informal language that is intentional (contractions, colloquialisms)
  - Sentence fragments used for rhetorical effect
- Be precise with phraseStart and phraseEnd — they must match the exact position of the text in the input.
- If no grammar errors are found, return an empty array: []

Return ONLY the JSON array, no other text.

Text to check:
[SECTION_TEXT]
