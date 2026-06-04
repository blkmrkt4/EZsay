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

interface StylePrefs {
  [key: string]: unknown;
}

export function buildIntakeTokens(
  docType: string,
  intake?: Intake | null,
  stylePrefs?: StylePrefs | null,
): Record<string, string> {
  const defaults = DEFAULTS[docType] ?? DEFAULTS.professional;
  const tokens: Record<string, string> = {
    DOCUMENT_TYPE: docType,
    ...defaults,
  };

  // Apply style preferences as prompt tokens
  if (stylePrefs) {
    if (typeof stylePrefs.english_variant === "string" && stylePrefs.english_variant !== "american") {
      const variants: Record<string, string> = {
        british: "British English spelling and conventions (e.g. organised, colour, analyse, -ise endings).",
        australian: "Australian English spelling and conventions (follows British spelling: organised, colour, but with local idiom).",
        canadian: "Canadian English spelling and conventions (e.g. colour, centre, but -ize endings like American English).",
        irish: "Irish English spelling and conventions (follows British spelling conventions).",
        south_african: "South African English spelling and conventions (follows British spelling conventions).",
      };
      tokens.SPELLING_VARIANT = variants[stylePrefs.english_variant] || "";
    }
    // Backwards compatibility: support old british_spelling boolean
    if (stylePrefs.british_spelling === true && !stylePrefs.english_variant) {
      tokens.SPELLING_VARIANT = "British English spelling and conventions (e.g. organised, colour, analyse, -ise endings).";
    }
    if (stylePrefs.oxford_comma === false) {
      tokens.OXFORD_COMMA = "Do not use the Oxford comma (no comma before 'and' in lists).";
    } else if (stylePrefs.oxford_comma === true) {
      tokens.OXFORD_COMMA = "Use the Oxford comma (comma before 'and' in lists of three or more).";
    }
    if (stylePrefs.contractions_allowed === false) {
      tokens.CONTRACTIONS_POLICY = "Contractions are not allowed. Use full forms (do not, it is, cannot).";
    }
    if (typeof stylePrefs.formality_level === "string") {
      const levels: Record<string, string> = {
        very_formal: "very formal and academic",
        formal: "formal and professional",
        moderate: "moderately formal",
        casual: "casual and conversational",
      };
      tokens.FORMALITY_LEVEL = levels[stylePrefs.formality_level] || stylePrefs.formality_level;
    }
    if (typeof stylePrefs.passive_voice_tolerance === "string") {
      const policies: Record<string, string> = {
        strict: "Flag most passive voice constructions. Active voice is strongly preferred.",
        moderate: "Flag excessive passive voice. Some passive is acceptable where natural.",
        relaxed: "Only flag passive voice when it makes the meaning unclear.",
      };
      tokens.PASSIVE_VOICE_POLICY = policies[stylePrefs.passive_voice_tolerance] || "";
    }
    if (typeof stylePrefs.citation_format === "string") {
      tokens.CITATION_FORMAT = stylePrefs.citation_format;
    }
    if (typeof stylePrefs.citation_placement === "string") {
      tokens.CITATION_PLACEMENT = stylePrefs.citation_placement;
    }
    if (stylePrefs.first_person_allowed === false) {
      tokens.FIRST_PERSON_POLICY = "First person (I, we, my, our) is not allowed. Use third person or passive constructions.";
    }
    if (stylePrefs.block_quote_threshold) {
      tokens.BLOCK_QUOTE_THRESHOLD = String(stylePrefs.block_quote_threshold);
    }

    // Legal & Professional tokens
    if (typeof stylePrefs.legal_citation_style === "string" && stylePrefs.legal_citation_style !== "none") {
      tokens.LEGAL_CITATION_STYLE = stylePrefs.legal_citation_style;
    }
    if (stylePrefs.defined_terms_caps === true) {
      tokens.DEFINED_TERMS_CAPS = "Defined terms should be capitalised throughout (e.g. 'the Agreement', 'the Parties').";
    }
    if (typeof stylePrefs.shall_vs_must === "string" && stylePrefs.shall_vs_must !== "either") {
      tokens.SHALL_VS_MUST = stylePrefs.shall_vs_must === "shall"
        ? "Use 'shall' for obligations (traditional legal drafting)."
        : "Use 'must' for obligations (plain language drafting).";
    }
    if (typeof stylePrefs.professional_tone === "string") {
      const tones: Record<string, string> = {
        authoritative: "authoritative and direct",
        collaborative: "collaborative and approachable",
        neutral: "neutral and objective",
      };
      if (tones[stylePrefs.professional_tone]) {
        tokens.PROFESSIONAL_TONE = tones[stylePrefs.professional_tone];
      }
    }
    if (stylePrefs.acronyms_defined === true) {
      tokens.ACRONYMS_POLICY = "All acronyms must be written in full on first use, e.g. 'Chief Executive Officer (CEO)'.";
    }

    // Strictness & Voice tokens
    if (typeof stylePrefs.scan_strictness === "string") {
      const levels: Record<string, string> = {
        lenient: "Only flag strong, unambiguous AI signals. Err on the side of not flagging.",
        balanced: "Flag likely AI patterns. Balance sensitivity with false positives.",
        strict: "Flag anything that could be AI-generated. Be thorough even if some flags are false positives.",
      };
      if (levels[stylePrefs.scan_strictness]) {
        tokens.SCAN_STRICTNESS = levels[stylePrefs.scan_strictness];
      }
    }
    if (typeof stylePrefs.preserve_voice === "string") {
      const voice: Record<string, string> = {
        high: "Preserve the writer's original voice and phrasing as much as possible. Only change what is necessary.",
        moderate: "Balance preserving the writer's voice with improving naturalness.",
        low: "Prioritise natural-sounding rewrites over preserving exact phrasing.",
      };
      if (voice[stylePrefs.preserve_voice]) {
        tokens.PRESERVE_VOICE = voice[stylePrefs.preserve_voice];
      }
    }
    if (typeof stylePrefs.suggestion_creativity === "string") {
      const creativity: Record<string, string> = {
        conservative: "Generate conservative suggestions that stay close to the original text.",
        moderate: "Generate moderately varied suggestions.",
        creative: "Generate creative, varied alternatives that explore different phrasings.",
      };
      if (creativity[stylePrefs.suggestion_creativity]) {
        tokens.SUGGESTION_CREATIVITY = creativity[stylePrefs.suggestion_creativity];
      }
    }
    if (typeof stylePrefs.target_audience_level === "string") {
      const levels: Record<string, string> = {
        general: "a general public audience",
        educated: "an educated adult audience",
        expert: "subject matter experts",
        academic: "academic peers and reviewers",
      };
      if (levels[stylePrefs.target_audience_level]) {
        tokens.TARGET_READING_LEVEL = levels[stylePrefs.target_audience_level];
      }
    }

    // Fiction tokens
    if (typeof stylePrefs.narrative_pov === "string") {
      const povs: Record<string, string> = {
        first: "first person",
        second: "second person",
        third_limited: "third person limited",
        third_omniscient: "third person omniscient",
        mixed: "mixed points of view",
      };
      if (povs[stylePrefs.narrative_pov]) tokens.NARRATIVE_POV = povs[stylePrefs.narrative_pov];
    }
    if (typeof stylePrefs.dialogue_style === "string" && stylePrefs.dialogue_style !== "none") {
      const styles: Record<string, string> = {
        double_quotes: "double quotes for dialogue (American convention)",
        single_quotes: "single quotes for dialogue (British convention)",
        em_dashes: "em dashes for dialogue (Continental convention)",
      };
      if (styles[stylePrefs.dialogue_style]) tokens.DIALOGUE_STYLE = styles[stylePrefs.dialogue_style];
    }
    if (stylePrefs.tense_consistency === true) {
      tokens.TENSE_CONSISTENCY = "Tense consistency is important. Flag tense shifts within scenes.";
    }
    if (stylePrefs.show_dont_tell === true) {
      tokens.SHOW_DONT_TELL = "Flag instances of 'telling' that could be 'shown' through action and detail.";
    }

    // Marketing tokens
    if (typeof stylePrefs.brand_voice === "string") {
      const voices: Record<string, string> = {
        playful: "playful and fun",
        professional: "professional and trustworthy",
        bold: "bold and provocative",
        empathetic: "warm and empathetic",
        authoritative: "expert and authoritative",
      };
      if (voices[stylePrefs.brand_voice]) tokens.BRAND_VOICE = voices[stylePrefs.brand_voice];
    }
    if (typeof stylePrefs.cta_style === "string") {
      const ctas: Record<string, string> = {
        direct: "direct calls to action (e.g. 'Buy now', 'Sign up')",
        soft: "soft calls to action (e.g. 'Learn more', 'Explore')",
        conversational: "conversational calls to action (e.g. 'Ready to start?')",
      };
      if (ctas[stylePrefs.cta_style]) tokens.CTA_STYLE = ctas[stylePrefs.cta_style];
    }
    if (typeof stylePrefs.jargon_tolerance === "string") {
      const jargon: Record<string, string> = {
        avoid: "Avoid industry jargon. Use plain language accessible to non-experts.",
        moderate: "Some industry jargon is acceptable for expert audiences.",
        welcome: "Technical jargon expected. This is a B2B or expert audience.",
      };
      if (jargon[stylePrefs.jargon_tolerance]) tokens.JARGON_TOLERANCE = jargon[stylePrefs.jargon_tolerance];
    }

    // Business tokens
    if (typeof stylePrefs.email_formality === "string") {
      const formality: Record<string, string> = {
        formal: "formal business style (e.g. 'Dear Mr. Smith')",
        semi_formal: "semi-formal business style (e.g. 'Hi John')",
        informal: "informal team style (e.g. 'Hey team')",
      };
      if (formality[stylePrefs.email_formality]) tokens.EMAIL_FORMALITY = formality[stylePrefs.email_formality];
    }
    if (stylePrefs.bullet_points_preferred === true) {
      tokens.BULLET_POINTS = "Favour bullet points over long paragraphs for clarity and scanability.";
    }

    // Universal: quotation, spacing, gender, sentence length
    if (typeof stylePrefs.quotation_style === "string") {
      tokens.QUOTATION_STYLE = stylePrefs.quotation_style === "single"
        ? "Use single quotation marks (\u2018 \u2019) as the primary quote style."
        : "Use double quotation marks (\u201c \u201d) as the primary quote style.";
    }
    if (typeof stylePrefs.punctuation_in_quotes === "string") {
      tokens.PUNCTUATION_IN_QUOTES = stylePrefs.punctuation_in_quotes === "outside"
        ? "Place periods and commas outside quotation marks (British convention)."
        : "Place periods and commas inside quotation marks (American convention).";
    }
    if (typeof stylePrefs.spaces_after_period === "string" && stylePrefs.spaces_after_period === "two") {
      tokens.SPACES_AFTER_PERIOD = "Use two spaces after a period (full stop).";
    }
    if (stylePrefs.gender_neutral_language === true) {
      tokens.GENDER_NEUTRAL = "Use gender-neutral, inclusive language. Avoid gendered terms (e.g. use 'chairperson' not 'chairman', 'they' not 'he/she').";
    }
    if (typeof stylePrefs.sentence_length_flag === "number" && stylePrefs.sentence_length_flag > 0) {
      tokens.SENTENCE_LENGTH_FLAG = `Flag sentences longer than ${stylePrefs.sentence_length_flag} words.`;
    }

    // Punctuation & Typography
    if (typeof stylePrefs.em_dash_style === "string") {
      const dash: Record<string, string> = {
        no_spaces: "Use em dashes without spaces\u2014like this.",
        spaced: "Use em dashes with spaces \u2014 like this.",
        en_dash: "Use en dashes with spaces \u2013 instead of em dashes.",
      };
      if (dash[stylePrefs.em_dash_style]) tokens.EM_DASH_STYLE = dash[stylePrefs.em_dash_style];
    }
    if (typeof stylePrefs.ellipsis_style === "string") {
      const ell: Record<string, string> = {
        unicode: "Use the single ellipsis character (\u2026).",
        three_dots: "Use three periods for ellipsis (...).",
        spaced: "Use spaced periods for ellipsis (. . .).",
      };
      if (ell[stylePrefs.ellipsis_style]) tokens.ELLIPSIS_STYLE = ell[stylePrefs.ellipsis_style];
    }
    if (typeof stylePrefs.apostrophe_decades === "string") {
      tokens.APOSTROPHE_DECADES = stylePrefs.apostrophe_decades === "apostrophe"
        ? "Use an apostrophe with decades (1990's)."
        : "Do not use an apostrophe with decades (1990s).";
    }

    // Numbers & Dates
    if (typeof stylePrefs.number_spell_threshold === "number" && stylePrefs.number_spell_threshold > 0) {
      tokens.NUMBER_SPELL_THRESHOLD = `Spell out numbers below ${stylePrefs.number_spell_threshold}. Use numerals for ${stylePrefs.number_spell_threshold} and above.`;
    }
    if (stylePrefs.number_start_sentence === true) {
      tokens.NUMBER_START_SENTENCE = "Always spell out numbers that begin a sentence.";
    }
    if (typeof stylePrefs.date_format === "string") {
      const dates: Record<string, string> = {
        dd_mm_yyyy: "DD/MM/YYYY format (e.g. 15/01/2025)",
        mm_dd_yyyy: "MM/DD/YYYY format (e.g. 01/15/2025)",
        d_month_yyyy: "day month year format (e.g. 15 January 2025)",
        month_d_yyyy: "month day, year format (e.g. January 15, 2025)",
        yyyy_mm_dd: "ISO format (e.g. 2025-01-15)",
      };
      if (dates[stylePrefs.date_format]) tokens.DATE_FORMAT = `Use ${dates[stylePrefs.date_format]}.`;
    }
    if (typeof stylePrefs.time_format === "string") {
      tokens.TIME_FORMAT = stylePrefs.time_format === "24_hour"
        ? "Use 24-hour time format (e.g. 14:30)."
        : "Use 12-hour time format (e.g. 2:30 PM).";
    }
    if (typeof stylePrefs.percentage_format === "string") {
      tokens.PERCENTAGE_FORMAT = stylePrefs.percentage_format === "word"
        ? "Write out 'percent' (e.g. 25 percent)."
        : "Use the percent symbol (e.g. 25%).";
    }

    // Capitalisation & Lists
    if (typeof stylePrefs.heading_capitalisation === "string") {
      tokens.HEADING_CAPITALISATION = stylePrefs.heading_capitalisation === "sentence_case"
        ? "Use sentence case for headings (only capitalise the first word)."
        : "Use title case for headings (capitalise major words).";
    }
    if (stylePrefs.capitalise_after_colon === true) {
      tokens.CAPITALISE_AFTER_COLON = "Capitalise the first word after a colon.";
    }
    if (typeof stylePrefs.list_punctuation === "string") {
      const lp: Record<string, string> = {
        full_stops: "End each list item with a full stop (period).",
        semicolons: "End each list item with a semicolon; end the last item with a full stop.",
        none: "Do not use end punctuation on list items.",
      };
      if (lp[stylePrefs.list_punctuation]) tokens.LIST_PUNCTUATION = lp[stylePrefs.list_punctuation];
    }
    if (stylePrefs.list_capitalise_first === false) {
      tokens.LIST_CAPITALISE_FIRST = "Do not capitalise the first word of list items (unless proper nouns).";
    }

    // Page Formatting
    if (typeof stylePrefs.text_alignment === "string") {
      tokens.TEXT_ALIGNMENT = stylePrefs.text_alignment === "justified"
        ? "Body text should be fully justified."
        : "Body text should be left-aligned (ragged right).";
    }
  }

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
