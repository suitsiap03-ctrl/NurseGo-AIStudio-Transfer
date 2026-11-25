/**
 * Normalizes a person's full name to clean Title Case without ALL-CAPS:
 * - Trims leading/trailing whitespace and collapses internal multiple spaces
 * - Converts each token to Title Case (e.g. "FAISAL PRATAMA" -> "Faisal Pratama")
 * - Preserves hyphens with capitalization after hyphen (e.g. "santoso-wijaya" -> "Santoso-Wijaya")
 * - Preserves apostrophes without capitalizing the suffix (e.g. "ma'ruf amin" -> "Ma'ruf Amin", "SA'DIAH" -> "Sa'diah")
 */
export function normalizePersonName(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((hyphenPart) => {
          if (!hyphenPart) return '';
          const lower = hyphenPart.toLocaleLowerCase('id-ID');
          return lower.charAt(0).toLocaleUpperCase('id-ID') + lower.slice(1);
        })
        .join('-')
    )
    .join(' ');
}
