// LinkedIn stores post commentary in its "little" text format, where these
// characters are markup and must be backslash-escaped to render as plain text.
// Unescaped, they can silently truncate the post (an unmatched "(" is the
// usual culprit).
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format
const RESERVED = /[|{}@[\]()<>\\*_~]/g;

// A "#" that starts a word is a hashtag element and stays live; any other "#"
// is escaped so it renders literally.
const STRAY_HASH = /#(?![\p{L}\p{N}_])/gu;

/** Escapes text for LinkedIn's "little" commentary format; hashtags stay live. */
export function escapeLittleText(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`).replace(STRAY_HASH, '\\#');
}
