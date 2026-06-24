/** Short menu-ready names for agent suggestions — no pantry SKU / supplier brands. */

const BRAND_PREFIXES = [
  "starbucks",
  "land o lakes",
  "land o' lakes",
  "monin",
  "kraft",
  "philadelphia",
  "nestle",
  "hormel",
  "tyson",
  "perdue",
  "organic valley",
  "horizon",
];

const SIZE_SUFFIX = /\s+\d+\s*(?:oz|ml|lb|g|pt|qt|gal)\b/gi;
const SIZE_PAREN = /\s*\(\s*\d+\s*(?:oz|ml|lb)\s*\)/gi;

const PHRASE_SIMPLIFY: Array<[RegExp, string]> = [
  [/\bwhole bean coffee\b/gi, "Coffee"],
  [/\bpike place coffee\b/gi, "Pike Place Coffee"],
  [/\bwhole milk\b/gi, "Milk"],
  [/\bskim milk\b/gi, "Skim Milk"],
  [/\bhalf\s*&\s*half\b/gi, "Half & Half"],
  [/\bheavy (?:whipping )?cream\b/gi, "Cream"],
  [/\bunsalted butter\b/gi, "Butter"],
  [/\bwhipped topping\b/gi, "Whip"],
  [/\bextra\s+/gi, ""],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingBrands(name: string): string {
  let result = name;
  let prev = "";
  while (prev !== result) {
    prev = result;
    for (const brand of BRAND_PREFIXES) {
      const pattern = brand.replace(/'/g, "['']?");
      result = result.replace(new RegExp(`^${escapeRegExp(pattern)}\\s+`, "i"), "");
    }
  }
  return result;
}

/**
 * Turn pantry/POS-style text into a short customer-facing dish name.
 * Brands and pack sizes belong in the description, not the title.
 */
export function formatSuggestedMenuName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  let name = trimmed.split(/\s+[—–]\s+/)[0]?.trim() ?? trimmed;
  name = name.split(/\s+\+\s+/)[0]?.trim() ?? name;

  name = name.replace(SIZE_SUFFIX, "").replace(SIZE_PAREN, "").trim();
  name = stripLeadingBrands(name);

  for (const [pattern, replacement] of PHRASE_SIMPLIFY) {
    name = name.replace(pattern, replacement);
  }

  name = name.replace(/\s{2,}/g, " ").replace(/^[\s,—–-]+|[\s,—–-]+$/g, "").trim();

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 5) {
    name = words.slice(0, 5).join(" ");
  }

  if (!name || name.length < 2) {
    const fallback = trimmed.split(/\s+[—–]\s+/)[0]?.trim() ?? trimmed;
    return stripLeadingBrands(fallback.replace(SIZE_SUFFIX, "").trim())
      .split(/\s+/)
      .slice(0, 4)
      .join(" ")
      .trim() || trimmed;
  }

  return name;
}
