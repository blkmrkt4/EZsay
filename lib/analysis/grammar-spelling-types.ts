export interface SpellingFinding {
  id: string;
  word: string;
  correction: string;
  contextBefore: string;
  contextAfter: string;
  sectionId: string;
  phraseStart: number;
  phraseEnd: number;
  explanation: string;
  /**
   * "variant" = correctly-spelled word in the wrong English variant for this
   * document (e.g. "color" in a British paper). Absent/"spelling" = ordinary
   * misspelling.
   */
  category?: "spelling" | "variant";
}

export interface GrammarFinding {
  id: string;
  originalText: string;
  correctedText: string;
  sectionId: string;
  phraseStart: number;
  phraseEnd: number;
  ruleCategory: string;
  explanation: string;
}
