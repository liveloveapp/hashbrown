/** The version recorded on every form abuse assessment. */
export const FORM_ABUSE_VERSION = 'form-abuse-v1';

/** Scores at or above this block the submission (silently accepted, no mail). */
export const FORM_ABUSE_THRESHOLD = 80;

/** The outcome of {@link assessFormAbuse}, recorded on `form.abuse_assessed`. */
export interface FormAbuseAssessment {
  version: typeof FORM_ABUSE_VERSION;
  score: number;
  decision: 'allow' | 'blocked';
  category:
    | 'normal'
    | 'suspicious'
    | 'automated_form_spam'
    | 'placeholder_email'
    | 'honeypot';
  reasons: string[];
}

/**
 * The submitted facts a form abuse assessment reads. The Get unstuck form has
 * no name or company field, so those signals never fire for it.
 */
export interface FormAbuseFacts {
  email: string;
  displayName?: string | null;
  companyName?: string | null;
  message?: string | null;
  honeypot?: string;
  rapidIdentityChange?: boolean;
}

// Deliberately narrow: ordinary words, acronyms, PascalCase and international
// names do not have repeated upper/lower case changes inside a long token.
function randomToken(value: string | null | undefined): boolean {
  const text = value?.trim() ?? '';
  if (!/^[A-Za-z]{12,64}$/.test(text)) return false;
  const upper = (text.match(/[A-Z]/g) ?? []).length;
  if (upper < 3 || text.length - upper < 3) return false;
  let transitions = 0;
  for (let index = 1; index < text.length; index++) {
    if (/[A-Z]/.test(text[index]) !== /[A-Z]/.test(text[index - 1]))
      transitions++;
  }
  return transitions >= 6;
}

/**
 * Scores a form submission for abuse: gibberish name or message (+40 each), a
 * generated "X LLC" company alongside another signal (+20), a placeholder
 * email (+60), a rapid identity change (+20); a filled honeypot scores 100.
 * A score of {@link FORM_ABUSE_THRESHOLD} or more is `blocked`.
 */
export function assessFormAbuse(facts: FormAbuseFacts): FormAbuseAssessment {
  const reasons: string[] = [];
  let score = 0;
  if (randomToken(facts.displayName)) {
    reasons.push('gibberish_name');
    score += 40;
  }
  if (randomToken(facts.message)) {
    reasons.push('gibberish_message');
    score += 40;
  }
  if (score && /^[A-Za-z]{4,12} LLC$/.test(facts.companyName?.trim() ?? '')) {
    reasons.push('generated_company');
    score += 20;
  }
  const placeholder =
    /^(?:test|testing|dummy|fake|asdf|nobody)(?:[0-9]*)@(?:example\.(?:com|org|net)|test\.com|invalid\.com)$/i.test(
      facts.email.trim(),
    );
  if (placeholder) {
    reasons.push('placeholder_email');
    score += 60;
  }
  if (facts.rapidIdentityChange) {
    reasons.push('rapid_identity_change');
    score += 20;
  }
  const honeypot = Boolean(facts.honeypot?.trim());
  if (honeypot) {
    reasons.push('honeypot');
    score = 100;
  }
  score = Math.min(score, 100);
  const blocked = score >= FORM_ABUSE_THRESHOLD;
  return {
    version: FORM_ABUSE_VERSION,
    score,
    decision: blocked ? 'blocked' : 'allow',
    category: honeypot
      ? 'honeypot'
      : blocked
        ? placeholder
          ? 'placeholder_email'
          : 'automated_form_spam'
        : score
          ? 'suspicious'
          : 'normal',
    reasons,
  };
}
