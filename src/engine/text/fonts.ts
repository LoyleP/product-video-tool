/**
 * Fonts available for text layers. They ship as files in /public/fonts (SIL Open Font License) and are
 * registered with FontFace in both the page and the export worker, so text renders identically.
 */
export interface FontOption {
  family: string;
  label: string;
  url: string;
  weights: [number, number];
}

export const FONTS: FontOption[] = [
  { family: "Studio Inter", label: "Inter", url: "/fonts/inter.woff2", weights: [100, 900] },
  { family: "Studio Space Grotesk", label: "Space Grotesk", url: "/fonts/space-grotesk.woff2", weights: [300, 700] },
  { family: "Studio Fraunces", label: "Fraunces", url: "/fonts/fraunces.woff2", weights: [100, 900] },
  { family: "Studio JetBrains Mono", label: "JetBrains Mono", url: "/fonts/jetbrains-mono.woff2", weights: [100, 800] },
];

export const DEFAULT_FONT_FAMILY = FONTS[0]!.family;

export function fontOption(family: string): FontOption {
  return FONTS.find((f) => f.family === family) ?? FONTS[0]!;
}

/** Canvas font shorthand for a text layer. Unknown families fall back to the default font. */
export function canvasFont(family: string, weight: number, size: number): string {
  const option = fontOption(family);
  const w = Math.min(option.weights[1], Math.max(option.weights[0], Math.round(weight)));
  return `${w} ${size}px "${option.family}", sans-serif`;
}

const loaded = new WeakMap<FontFaceSet, Map<string, Promise<void>>>();

/** Registers and loads fonts in a FontFaceSet (document.fonts or a worker's self.fonts). */
export function loadFonts(set: FontFaceSet, families: Iterable<string>, baseUrl: string): Promise<void> {
  let perSet = loaded.get(set);
  if (!perSet) loaded.set(set, (perSet = new Map()));
  const jobs: Promise<void>[] = [];
  for (const family of new Set(families)) {
    const option = fontOption(family);
    let job = perSet.get(option.family);
    if (!job) {
      const face = new FontFace(option.family, `url(${new URL(option.url, baseUrl).href})`, {
        weight: `${option.weights[0]} ${option.weights[1]}`,
      });
      job = face.load().then((f) => {
        set.add(f);
      });
      perSet.set(option.family, job);
    }
    jobs.push(job);
  }
  return Promise.all(jobs).then(() => {});
}

/** Families used by a project's text layers. */
export function projectFontFamilies(textTracks: readonly { layers: readonly { font: { family: string } }[] }[]): string[] {
  return [...new Set(textTracks.flatMap((t) => t.layers.map((l) => fontOption(l.font.family).family)))];
}

/** Loads fonts in whichever scope this runs in: the page (document.fonts) or a worker (self.fonts). */
export function loadFontsHere(families: Iterable<string>): Promise<void> {
  const scope = globalThis as unknown as { document?: { fonts: FontFaceSet }; fonts?: FontFaceSet; location: Location };
  const set = scope.document?.fonts ?? scope.fonts;
  if (!set) return Promise.resolve();
  return loadFonts(set, families, scope.location.href);
}
