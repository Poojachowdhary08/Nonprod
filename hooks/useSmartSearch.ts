import { useMemo } from "react";

// Normalize text for case-insensitive, symbol-free comparison
const normalizeText = (text: string = "") =>
  text.toLowerCase().replace(/[^a-z0-9]/gi, "");

// Generate multiple date format strings for search
const generateDateFormats = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return [];

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return [
    `${dd}-${mm}-${yyyy}`,
    `${yyyy}-${mm}-${dd}`,
    `${dd}/${mm}/${yyyy}`,
    `${dd}.${mm}.${yyyy}`,
    `${dd}${mm}${yyyy}`,
    `${mm}-${dd}-${yyyy}`,
  ].map(normalizeText);
};

// Levenshtein Distance Calculation
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];

  const lenA = a.length;
  const lenB = b.length;

  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  for (let i = 0; i <= lenB; i++) matrix[i] = [i];
  for (let j = 0; j <= lenA; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[lenB][lenA];
};

const getLevenshteinSimilarity = (a: string, b: string): number => {
  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
};

export const useSmartSearch = <T>({
  data,
  query,
  keys,
}: {
  data: T[];
  query: string;
  keys: (keyof T)[];
}): T[] => {
  return useMemo(() => {
    if (!query.trim()) return data;

    const normalizedQuery = normalizeText(query);
    const queryTokens = normalizedQuery.match(/[a-z0-9]+/g) || [];

    return data.filter((item) => {
      const fieldValues = keys.map((key) => String(item[key] ?? "")).join(" ");
      const normalizedFields = normalizeText(fieldValues);

      // ✅ Exact match check
      if (normalizedFields === normalizedQuery) return true;

      // ✅ All tokens must exist in the field
      const allTokensMatch = queryTokens.every((token) =>
        normalizedFields.includes(token)
      );
      if (allTokensMatch) return true;

      // ✅ Strict token match (e.g. "123456" !== "12345")
      const exactTokenMatch = queryTokens.every((token) =>
        fieldValues
          .toLowerCase()
          .split(/\s+/)
          .some((word) => normalizeText(word) === token)
      );
      if (exactTokenMatch) return true;

      // ✅ Date matching
      const dateMatches = keys.some((key) => {
        const val = item[key];
        if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const variants = generateDateFormats(val);
          return variants.some((v) => v.includes(normalizedQuery));
        }
        return false;
      });
      if (dateMatches) return true;

      // ✅ Full/Half Day
      const isFullDay =
        normalizedQuery.includes("fullday") || normalizedQuery.includes("full");
      const isHalfDay =
        normalizedQuery.includes("halfday") || normalizedQuery.includes("half");
      const dayType = (item as any)?.day_type?.toLowerCase();
      if (isFullDay && dayType === "full") return true;
      if (isHalfDay && dayType === "half") return true;

      // ✅ Fuzzy fallback only if nothing matches
      const similarity = getLevenshteinSimilarity(
        normalizedQuery,
        normalizedFields
      );
      return similarity > 0.75;
    });
  }, [query, data, keys]);
};
