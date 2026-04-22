/**
 * Pre-evaluation edge case checks for Feynman transcripts.
 * These run BEFORE calling the LLM to save costs and give instant feedback.
 */

/** Minimum meaningful transcript length (characters) */
const MIN_LENGTH = 20;

/** Maximum transcript length (characters) */
const MAX_LENGTH = 5000;

/** Minimum unique characters ratio (detects repeated gibberish) */
const MIN_UNIQUE_CHAR_RATIO = 0.1;

/** Minimum meaningful word count */
const MIN_WORD_COUNT = 5;

/** Maximum allowed repeated single-char ratio (detects "啊啊啊啊啊") */
const MAX_REPEATED_CHAR_RATIO = 0.6;

export interface TranscriptCheckResult {
  valid: boolean;
  code: "ok" | "blank" | "too_short" | "too_long" | "gibberish" | "off_topic";
  message: string;
}

/**
 * Check transcript for edge cases before sending to LLM.
 * Returns a result indicating if the transcript is valid for evaluation.
 *
 * @param transcript - The user's feynman explanation text
 * @param keyPoints - The knowledge point's key points for topic relevance check
 */
export function checkTranscript(
  transcript: string,
  keyPoints: string[]
): TranscriptCheckResult {
  const trimmed = transcript.trim();

  // 1. Blank or near-blank
  if (trimmed.length === 0) {
    return {
      valid: false,
      code: "blank",
      message: "录音未识别到任何内容，请确保麦克风正常工作后重新录音",
    };
  }

  // 2. Too short
  if (trimmed.length < MIN_LENGTH || countWords(trimmed) < MIN_WORD_COUNT) {
    return {
      valid: false,
      code: "too_short",
      message: `讲解内容过短（当前 ${trimmed.length} 字），请尝试更详细地讲解，至少覆盖几个核心要点`,
    };
  }

  // 3. Too long
  if (trimmed.length > MAX_LENGTH) {
    return {
      valid: false,
      code: "too_long",
      message: `讲解内容过长（当前 ${trimmed.length} 字，上限 ${MAX_LENGTH} 字），请精炼表达后重新提交`,
    };
  }

  // 4. Gibberish detection (repeated characters, low uniqueness)
  if (isGibberish(trimmed)) {
    return {
      valid: false,
      code: "gibberish",
      message: "录音转写结果异常，可能是语音质量问题，请在安静环境重新录音",
    };
  }

  // 5. Off-topic detection (basic keyword overlap check)
  if (keyPoints.length > 0 && isLikelyOffTopic(trimmed, keyPoints)) {
    return {
      valid: false,
      code: "off_topic",
      message: "讲解内容似乎与该知识点无关，请确认选择了正确的知识点后重新讲解",
    };
  }

  return { valid: true, code: "ok", message: "" };
}

/** Count Chinese + English words roughly */
function countWords(text: string): number {
  // Chinese characters count as individual words
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  // English words
  const englishWords = (text.match(/[a-zA-Z]+/g) ?? []).length;
  return chineseChars + englishWords;
}

/** Detect gibberish: repeated chars, low unique ratio */
function isGibberish(text: string): boolean {
  const stripped = text.replace(/\s/g, "");
  const chars = stripped.split("");
  if (chars.length === 0) return true;

  // Check unique character ratio
  const uniqueChars = new Set(chars).size;
  if (uniqueChars / chars.length < MIN_UNIQUE_CHAR_RATIO) return true;

  // Check for dominant repeated character
  const charCounts = new Map<string, number>();
  for (const c of chars) {
    charCounts.set(c, (charCounts.get(c) ?? 0) + 1);
  }
  let maxCount = 0;
  charCounts.forEach((count) => {
    if (count > maxCount) maxCount = count;
  });
  if (maxCount / chars.length > MAX_REPEATED_CHAR_RATIO) return true;

  return false;
}

/**
 * Basic off-topic detection using keyword overlap.
 * Checks if the transcript has ANY overlap with key point terms.
 * This is a lightweight pre-filter; the LLM will do detailed analysis.
 */
function isLikelyOffTopic(transcript: string, keyPoints: string[]): boolean {
  const lowerTranscript = transcript.toLowerCase();

  // Extract significant terms from key points (2+ char Chinese words or English words)
  const keyTerms = extractKeyTerms(keyPoints);

  if (keyTerms.length === 0) return false;

  // Count how many key terms appear in the transcript
  const matchCount = keyTerms.filter((term) =>
    lowerTranscript.includes(term.toLowerCase())
  ).length;

  // If less than 10% of key terms match, likely off-topic
  // Use a generous threshold since ASR may introduce errors
  const matchRatio = matchCount / keyTerms.length;
  return matchRatio < 0.1;
}

/** Extract meaningful terms from key points */
function extractKeyTerms(keyPoints: string[]): string[] {
  const allText = keyPoints.join(" ");

  // Chinese terms (2-4 char sequences)
  const chineseTerms: string[] = Array.from(allText.match(/[\u4e00-\u9fff]{2,4}/g) ?? []);
  // English terms (3+ chars)
  const englishTerms: string[] = Array.from(allText.match(/[a-zA-Z]{3,}/g) ?? []).map((t) =>
    t.toLowerCase()
  );

  // Deduplicate
  const combined = chineseTerms.concat(englishTerms);
  return Array.from(new Set(combined));
}
