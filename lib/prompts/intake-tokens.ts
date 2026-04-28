/**
 * Builds prompt token replacements from a document's intake questionnaire answers.
 * Falls back to sensible defaults when answers are missing.
 */

interface Intake {
  audience?: string;
  purpose?: string;
  aiUsage?: string;
  discipline?: string;
}

const AUDIENCE_LABELS: Record<string, string> = {
  professor: "a university professor or academic marker",
  client: "a client expecting professional, polished communication",
  board: "a board of directors or executive leadership",
  team: "an internal team of colleagues",
  public: "a general public audience",
  peers: "professional peers and colleagues",
};

const PURPOSE_LABELS: Record<string, string> = {
  assignment: "a university assignment or essay",
  thesis: "a thesis or dissertation",
  report: "a professional report or analysis",
  memo: "an executive memo or brief",
  proposal: "a proposal",
  article: "an article or blog post",
  email: "an email or letter",
  presentation: "a presentation or deck",
};

const DISCIPLINE_LABELS: Record<string, string> = {
  business: "business and management",
  law: "law",
  medicine: "medicine and health sciences",
  psychology: "psychology",
  education: "education",
  humanities: "humanities and arts",
  engineering: "engineering and computer science",
  social_science: "social science",
  natural_science: "natural science",
};

const DEFAULTS: Record<string, Record<string, string>> = {
  academic: {
    PERSONA: "a university student who is genuinely interested in the subject but writes informally when thinking through ideas",
    VERBAL_TICS: "basically, I mean, honestly",
    ACADEMIC_LEVEL: "Year 2 undergraduate",
    SUBJECT: "the subject area of the document",
    WRITER_DESCRIPTION: "engaged with the core argument but less confident with abstract theory",
  },
  professional: {
    PERSONA: "a pragmatic senior professional who values clarity over formality and writes like they talk",
    VERBAL_TICS: "look, the thing is, honestly",
  },
  casual: {
    PERSONA: "a knowledgeable person writing for peers — informal, direct, no corporate polish",
    VERBAL_TICS: "basically, right, I mean",
  },
  legal: {
    PERSONA: "a legal professional who writes precisely but avoids unnecessary formality",
    VERBAL_TICS: "in practice, that said, the issue is",
  },
};

export function buildIntakeTokens(
  docType: string,
  intake?: Intake | null,
): Record<string, string> {
  const defaults = DEFAULTS[docType] ?? DEFAULTS.professional;
  const tokens: Record<string, string> = {
    DOCUMENT_TYPE: docType,
    ...defaults,
  };

  if (!intake) return tokens;

  // PERSONA — adapt based on audience and purpose
  if (intake.audience || intake.purpose) {
    const audience = intake.audience ? AUDIENCE_LABELS[intake.audience] : null;
    const purpose = intake.purpose ? PURPOSE_LABELS[intake.purpose] : null;

    if (audience && purpose) {
      tokens.PERSONA = `a writer preparing ${purpose} for ${audience} — values clarity and authenticity over polish`;
    } else if (audience) {
      tokens.PERSONA = `a writer communicating to ${audience} — values clarity and authenticity over polish`;
    } else if (purpose) {
      tokens.PERSONA = `a writer working on ${purpose} — values clarity and authenticity over polish`;
    }
  }

  // SUBJECT — from discipline
  if (intake.discipline) {
    tokens.SUBJECT = DISCIPLINE_LABELS[intake.discipline] ?? intake.discipline;
  }

  // WRITER_DESCRIPTION — adapt based on AI usage
  if (intake.aiUsage) {
    switch (intake.aiUsage) {
      case "drafted":
        tokens.WRITER_DESCRIPTION = "used AI to draft the text and needs help making it sound natural and personal";
        break;
      case "outlined":
        tokens.WRITER_DESCRIPTION = "used AI for structure but wrote the content — may have some formulaic transitions";
        break;
      case "edited":
        tokens.WRITER_DESCRIPTION = "wrote the content personally but used AI to refine — original voice is present but may be over-polished";
        break;
      case "research":
        tokens.WRITER_DESCRIPTION = "wrote the content independently, using AI only for research — voice is authentic but may have absorbed some AI phrasing from sources";
        break;
      case "none":
        tokens.WRITER_DESCRIPTION = "wrote entirely without AI assistance — any AI-like patterns are natural writing habits, not AI artifacts";
        break;
    }
  }

  return tokens;
}
