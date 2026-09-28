/**
 * Text normalization helpers shared by rule-based recognizers and slot
 * extractors. All helpers are pure and total (no throws).
 */

/** Collapse whitespace, trim, lowercase if requested. */
export function normalizeText(input: string, opts?: { lowercase?: boolean }): string {
  if (typeof input !== 'string') return '';
  const collapsed = input.replace(/\s+/g, ' ').trim();
  return opts?.lowercase ? collapsed.toLowerCase() : collapsed;
}

/**
 * Normalize a CJK / mixed-script string. Performs the following passes:
 *
 *  1. Full-width space (U+3000)          → half-width space
 *  2. Full-width ASCII punctuation      → half-width (e.g. `？` → `?`)
 *  3. CJK sentence punctuation `、 。`   → space (so they break words cleanly)
 *  4. CJK brackets 《》「」『』【】      → straight ASCII counterparts
 *  5. Horizontal ellipsis `…`           → `...`
 *  6. Collapse repeated whitespace and trim
 *
 * Intentionally a tiny heuristic — full NMT-style normalization is out of
 * scope. The bracket choices (e.g. 《》 → ") are conventional for a
 * tool-routing pipeline where we just want punctuation to stop being a
 * hard wall between the recognizer and the slot extractor.
 */
export function normalizeMixed(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u3000]/g, ' ')
    .replace(/[！-～]/g, (ch) => { if (ch === '，') return ' '; return String.fromCharCode(ch.charCodeAt(0) - 0xfee0); })
    .replace(/[、。]/g, ' ') // 、 。
    .replace(/[《》]/g, '"') // 《 》
    .replace(/[「」]/g, '"') // 「 」
    .replace(/[『』]/g, "'") // 『 』
    .replace(/[【】]/g, '"') // 【 】
    .replace(/…/g, '...') // …
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case-insensitive substring match against a normalized haystack. */
export function containsKeyword(haystack: string, keyword: string): boolean {
  return normalizeText(haystack, { lowercase: true }).includes(
    normalizeText(keyword, { lowercase: true })
  );
}

/** Regex test that returns false for non-RegExp inputs instead of throwing. */
export function safeRegexTest(pattern: RegExp | undefined, input: string): boolean {
  if (!pattern) return false;
  try {
    pattern.lastIndex = 0;
    return pattern.test(input);
  } catch {
    return false;
  }
}

/** Default Date parsing; returns null if the string cannot be parsed. */
export function safeDateParse(input: string): Date | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  const ts = Date.parse(input);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

/** Add a timezone offset (e.g. `+08:00`) to an ISO date string. */
export function applyTzOffset(iso: string, tzOffset?: string): string {
  if (!tzOffset) return iso;
  // ponytail: only handles `+HH:MM` / `-HH:MM` style offsets; full IANA tz
  // support belongs to a dedicated lib (e.g. luxon), add when needed.
  if (!/^[+-]\d{2}:\d{2}$/.test(tzOffset)) return iso;
  return `${iso}${tzOffset}`;
}
