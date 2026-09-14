const RICH_MAX_CHARACTERS = 4 * 1024;
const RICH_MAX_ELEMENTS = 40;
const RICH_MAX_DEPTH = 6;
const RICH_MAX_LIST_ITEMS = 12;
const RICH_MAX_LINKS = 8;
const RICH_MAX_COMPLEXITY = 90;
const MAX_EXPANSION_CHARACTERS = 128 * 1024;
const MAX_EXPANSION_ELEMENTS = 1000;

export type HubSpotExpansionStrategy = "rich" | "structured" | "blocked";

export interface HubSpotPayloadPlan {
  strategy: HubSpotExpansionStrategy;
  characters: number;
  estimatedElements: number;
  maxDepth: number;
  listItems: number;
  links: number;
  images: number;
  blockElements: number;
  complexity: number;
}

export function classifyHubSpotPayload(html: string): HubSpotPayloadPlan {
  const metrics = analyzeHubSpotPayload(html);
  if (
    metrics.characters > MAX_EXPANSION_CHARACTERS ||
    metrics.estimatedElements > MAX_EXPANSION_ELEMENTS
  ) {
    return { strategy: "blocked", ...metrics };
  }

  const richIsSafe =
    metrics.characters <= RICH_MAX_CHARACTERS &&
    metrics.estimatedElements <= RICH_MAX_ELEMENTS &&
    metrics.maxDepth <= RICH_MAX_DEPTH &&
    metrics.listItems <= RICH_MAX_LIST_ITEMS &&
    metrics.links <= RICH_MAX_LINKS &&
    metrics.complexity <= RICH_MAX_COMPLEXITY;
  return { strategy: richIsSafe ? "rich" : "structured", ...metrics };
}

function analyzeHubSpotPayload(
  html: string,
): Omit<HubSpotPayloadPlan, "strategy"> {
  let estimatedElements = 0;
  let depth = 0;
  let maxDepth = 0;
  let listItems = 0;
  let links = 0;
  let images = 0;
  let blockElements = 0;
  const tagPattern = /<\s*(\/?)\s*([a-z][a-z0-9-]*)\b[^>]*>/gi;
  let match = tagPattern.exec(html);
  while (match) {
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const selfClosing = /\/\s*>$/.test(match[0]) || VOID_TAGS.has(tag);
    if (closing) {
      depth = Math.max(0, depth - 1);
    } else {
      estimatedElements += 1;
      if (tag === "li") listItems += 1;
      if (tag === "a") links += 1;
      if (tag === "img") images += 1;
      if (BLOCK_TAGS.has(tag)) blockElements += 1;
      if (!selfClosing) {
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    match = tagPattern.exec(html);
  }

  const complexity =
    estimatedElements +
    maxDepth * 3 +
    blockElements * 2 +
    listItems * 3 +
    links * 4 +
    images * 10;
  return {
    characters: html.length,
    estimatedElements,
    maxDepth,
    listItems,
    links,
    images,
    blockElements,
    complexity,
  };
}

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link"]);
const BLOCK_TAGS = new Set([
  "blockquote",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "table",
  "ul",
]);
