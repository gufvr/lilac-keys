const IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi;
const MAX_IMAGE_URL_LENGTH = 2048;
const DATA_IMAGE_PATTERN =
  /^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/]+={0,2})$/i;

export const MAX_MACRO_IMAGES = 12;
export const MAX_EMBEDDED_IMAGE_BYTES = 512 * 1024;
export const MAX_TOTAL_EMBEDDED_IMAGE_BYTES = 2 * 1024 * 1024;

export interface SanitizedMacroImages {
  html: string;
  removedImages: number;
}

export type MacroImageSource =
  | { kind: "https"; source: string; bytes: 0 }
  | { kind: "embedded"; source: string; bytes: number };

export function sanitizeMacroImages(html: string): SanitizedMacroImages {
  let removedImages = 0;
  let acceptedImages = 0;
  let embeddedImageBytes = 0;
  const sanitizedHtml = html.replace(IMAGE_TAG_PATTERN, (imageTag) => {
    const source = readAttribute(imageTag, "src");
    if (!source || acceptedImages >= MAX_MACRO_IMAGES) {
      removedImages += 1;
      return "";
    }

    const imageSource = classifyMacroImageSource(decodeHtmlAttribute(source));
    if (!imageSource) {
      removedImages += 1;
      return "";
    }
    if (
      imageSource.kind === "embedded" &&
      embeddedImageBytes + imageSource.bytes > MAX_TOTAL_EMBEDDED_IMAGE_BYTES
    ) {
      removedImages += 1;
      return "";
    }

    acceptedImages += 1;
    if (imageSource.kind === "embedded") {
      embeddedImageBytes += imageSource.bytes;
    }
    return imageTag;
  });
  return { html: sanitizedHtml, removedImages };
}

export function collapseEmbeddedImagesForClassification(html: string): string {
  return html.replace(IMAGE_TAG_PATTERN, (imageTag) => {
    const source = readAttribute(imageTag, "src");
    if (!source) return imageTag;
    const decodedSource = decodeHtmlAttribute(source);
    if (classifyMacroImageSource(decodedSource)?.kind === "embedded") {
      return imageTag.replace(source, "data:image/png;base64,embedded");
    }
    return imageTag;
  });
}

export function classifyMacroImageSource(
  value: string,
): MacroImageSource | null {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_IMAGE_URL_LENGTH) {
    try {
      const url = new URL(trimmed);
      if (url.protocol === "https:" && url.hostname) {
        return { kind: "https", source: url.href, bytes: 0 };
      }
    } catch {
      // Continue with embedded-image validation.
    }
  }

  const match = DATA_IMAGE_PATTERN.exec(trimmed);
  if (!match) return null;
  const payload = match[2];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;
  if (bytes <= 0 || bytes > MAX_EMBEDDED_IMAGE_BYTES) return null;
  return { kind: "embedded", source: trimmed, bytes };
}

function readAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
