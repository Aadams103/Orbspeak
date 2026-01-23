/**
 * Help Me Write - Text Rewriting Service
 * 
 * A standalone text rewriting pipeline that works independently of dictation.
 * Can be triggered by text selection anywhere on the page.
 */

export type HelpMeWriteStyle = "formal" | "casual" | "creative" | "creative_writing";

export interface HelpMeWriteOptions {
  style: HelpMeWriteStyle;
  preserveFormatting?: boolean;
}

export interface HelpMeWriteResult {
  originalText: string;
  rewrittenText: string;
  style: HelpMeWriteStyle;
}

/**
 * Rewrite text according to the selected style
 */
export function rewriteText(
  text: string,
  style: HelpMeWriteStyle
): string {
  if (!text || !text.trim()) {
    return text;
  }

  let result = text.trim();

  switch (style) {
    case "formal":
      result = result
        .replace(/\bdon't\b/gi, "do not")
        .replace(/\bcan't\b/gi, "cannot")
        .replace(/\bwon't\b/gi, "will not")
        .replace(/\bit's\b/gi, "it is")
        .replace(/\bthat's\b/gi, "that is")
        .replace(/\bI'm\b/gi, "I am")
        .replace(/\byou're\b/gi, "you are")
        .replace(/\bwe're\b/gi, "we are")
        .replace(/\bthey're\b/gi, "they are")
        .replace(/\bkind of\b/gi, "somewhat")
        .replace(/\bsort of\b/gi, "somewhat")
        .replace(/\bgot\b/gi, "received")
        .replace(/\bget\b/gi, "obtain")
        .replace(/\bbig\b/gi, "substantial")
        .replace(/\bgood\b/gi, "excellent")
        .replace(/\bbad\b/gi, "unfavorable")
        .replace(/\breally\b/gi, "truly")
        .replace(/\bvery\b/gi, "extremely")
        .replace(/\bjust\b/gi, "merely")
        .replace(/\bmaybe\b/gi, "perhaps");
      break;

    case "casual":
      result = result
        .replace(/\bdo not\b/gi, "don't")
        .replace(/\bcannot\b/gi, "can't")
        .replace(/\bwill not\b/gi, "won't")
        .replace(/\bit is\b/gi, "it's")
        .replace(/\bthat is\b/gi, "that's")
        .replace(/\bI am\b/gi, "I'm")
        .replace(/\byou are\b/gi, "you're")
        .replace(/\bwe are\b/gi, "we're")
        .replace(/\bthey are\b/gi, "they're")
        .replace(/\bHowever,\b/gi, "But")
        .replace(/\bTherefore,\b/gi, "So")
        .replace(/\bFurthermore,\b/gi, "Also")
        .replace(/\bIn addition,\b/gi, "Plus")
        .replace(/\bAdditionally,\b/gi, "Also")
        .replace(/\bNevertheless,\b/gi, "Still")
        .replace(/\bConsequently,\b/gi, "So");
      break;

    case "creative":
      result = result
        .replace(/\bvery\b/gi, "incredibly")
        .replace(/\bgood\b/gi, "fantastic")
        .replace(/\bnice\b/gi, "wonderful")
        .replace(/\binteresting\b/gi, "fascinating")
        .replace(/\bimportant\b/gi, "crucial")
        .replace(/\bsaid\b/gi, "exclaimed")
        .replace(/\bwalked\b/gi, "strolled")
        .replace(/\blooked\b/gi, "gazed")
        .replace(/\bwent\b/gi, "journeyed")
        .replace(/\bgot\b/gi, "obtained")
        .replace(/\bmade\b/gi, "crafted")
        .replace(/\bdid\b/gi, "accomplished");
      break;

    case "creative_writing":
      result = result
        .replace(/\bThe\b/g, (m, offset) =>
          offset === 0 ? "In the tapestry of moments, the" : m
        )
        .replace(/\bvery\b/gi, "remarkably")
        .replace(/\bsaw\b/gi, "witnessed")
        .replace(/\bfelt\b/gi, "sensed deeply")
        .replace(/\bwas\b/gi, "seemed to be")
        .replace(/\bhappy\b/gi, "filled with joy")
        .replace(/\bsad\b/gi, "touched by melancholy")
        .replace(/\bwalked\b/gi, "drifted")
        .replace(/\blooked\b/gi, "beheld")
        .replace(/\bheard\b/gi, "perceived");
      break;
  }

  // Preserve capitalization of first letter
  if (text[0] === text[0].toUpperCase() && result[0]) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  return result;
}

/**
 * Process text with Help Me Write pipeline
 */
export function processHelpMeWrite(
  text: string,
  options: HelpMeWriteOptions
): HelpMeWriteResult {
  const rewrittenText = rewriteText(text, options.style);

  return {
    originalText: text,
    rewrittenText,
    style: options.style,
  };
}

/**
 * Available styles for Help Me Write
 */
export const HELP_ME_WRITE_STYLES: {
  value: HelpMeWriteStyle;
  label: string;
  description: string;
}[] = [
  { value: "formal", label: "Formal", description: "Professional, polished" },
  { value: "casual", label: "Casual", description: "Friendly, conversational" },
  { value: "creative", label: "Creative", description: "Unique, expressive" },
  {
    value: "creative_writing",
    label: "Literary",
    description: "Narrative flair",
  },
];


