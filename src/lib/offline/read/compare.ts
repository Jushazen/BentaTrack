// Sorting helpers shared by the offline reads (leaf 9.2).

/**
 * Orders text the way the database does. Postgres here (musl's en_US, like "C") and on Neon
 * ("C.UTF-8") compares by Unicode code point, so "Zebra" sorts before "apple". JavaScript's `<`
 * compares UTF-16 units, which differs only past U+FFFF, so this walks code points.
 */
export function compareText(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(j)!;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return a.length - i === b.length - j ? 0 : i < a.length ? 1 : -1;
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * Case-insensitive "contains", exactly as Prisma's `contains` with `mode: "insensitive"` runs it:
 * `ILIKE '%query%'`, with the query not escaped. So in the query `_` stands for any one
 * character, `%` for any run of them, and a backslash makes the next character literal.
 * Returns a test to run on each row.
 */
export function containsInsensitive(query: string): (text: string) => boolean {
  let source = "";
  let escaped = false;
  for (const ch of query.toLowerCase()) {
    if (escaped) {
      source += ch.replace(REGEX_SPECIAL, "\\$&");
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === "%") {
      source += ".*";
    } else if (ch === "_") {
      source += ".";
    } else {
      source += ch.replace(REGEX_SPECIAL, "\\$&");
    }
  }
  // Postgres refuses a pattern ending in a lone backslash; here it simply matches a backslash.
  if (escaped) source += "\\\\";
  const pattern = new RegExp(source, "su");
  return (text) => pattern.test(text.toLowerCase());
}

/** One page of rows, numbered from 1, with the same counts the server queries return. */
export function pageOf<T>(rows: T[], page: number, size: number) {
  return {
    items: rows.slice((page - 1) * size, page * size),
    total: rows.length,
    page,
    pageCount: Math.max(1, Math.ceil(rows.length / size)),
  };
}
