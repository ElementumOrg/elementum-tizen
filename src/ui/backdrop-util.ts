/** Distinct non-empty URLs, in order, at most `max`. */
export function imageList(urls: (string | null | undefined)[], max = 8): string[] {
  const out: string[] = [];
  for (const u of urls) if (u && out.indexOf(u) < 0 && out.length < max) out.push(u);
  return out;
}

/** TMDB images come in many sizes; full-screen layers want w1280. */
export function big(url: string | null | undefined): string | null {
  return url ? url.replace(/\/(w\d+|original)\//, '/w1280/') : null;
}

export function nextIndex(i: number, n: number): number {
  return n ? (i + 1) % n : 0;
}
