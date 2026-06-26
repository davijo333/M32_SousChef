/** Multi-dish brainstorm from Creator before a dish name is locked. */

export function isDishBrainstormReply(text: string): boolean {
  const body = (text ?? "").trim();
  if (!body) return false;

  const numberedDishes = (body.match(/^###\s+\d+\./gm) ?? []).length;
  if (numberedDishes >= 2) return true;

  return /\b(?:couple of options|here are (?:a few|some|couple)|which dish you(?:'d| would) like|let me know which dish|modifications in mind)\b/i.test(
    body
  );
}

export function extractDishNamesFromBrainstorm(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/^###\s+\d+\.\s+(.+)$/gim)) {
    const name = match[1]?.trim().replace(/\*+/g, "");
    if (name) names.push(name);
  }
  return names;
}
