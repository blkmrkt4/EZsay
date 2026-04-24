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
