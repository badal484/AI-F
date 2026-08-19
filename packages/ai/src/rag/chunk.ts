const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

/**
 * Splits text into overlapping fixed-size chunks for embedding. No LLM
 * call involved — plain character windowing. Overlap keeps context from
 * being lost right at a chunk boundary.
 */
export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP,
): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - overlap;
  }
  return chunks;
}
