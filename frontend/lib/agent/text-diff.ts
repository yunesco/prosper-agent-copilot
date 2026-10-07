export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string };

// Words and the whitespace after them stay together, so joined parts rebuild the text.
const tokens = (text: string) => text.match(/\S+\s*|\s+/g) ?? [];

/** Word-level diff via longest common subsequence. Pure and display-only. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const lengths = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i][j] =
        a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push('same', a[i++]);
      j++;
    } else if (j < b.length && (i === a.length || lengths[i][j + 1] >= lengths[i + 1][j]))
      push('added', b[j++]);
    else push('removed', a[i++]);
  }
  return parts;
}
