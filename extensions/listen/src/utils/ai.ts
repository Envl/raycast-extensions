import { AI, environment, showToast, Toast } from "@raycast/api";

export interface RefineTranscriptionOptions {
  transcriptionText: string;
  onStart?: () => void;
  onSuccess?: (refinedText: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * Check if AI features are available
 */
export function isAIAvailable(): boolean {
  return environment.canAccess(AI);
}

/**
 * Refine transcription text using AI
 * Returns the refined text or null if refinement failed
 */
export async function refineTranscription(options: RefineTranscriptionOptions): Promise<string | null> {
  const { transcriptionText, onStart, onSuccess, onError, onComplete } = options;

  if (!transcriptionText.trim()) {
    const errorMsg = "No transcription to refine";
    await showToast({
      style: Toast.Style.Failure,
      title: errorMsg,
    });
    onError?.(errorMsg);
    return null;
  }

  // Check if AI is available
  if (!isAIAvailable()) {
    const errorMsg = "Please upgrade to Raycast Pro to use AI features";
    await showToast({
      style: Toast.Style.Failure,
      title: "AI Not Available",
      message: errorMsg,
    });
    onError?.(errorMsg);
    return null;
  }

  onStart?.();

  try {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Refining transcription...",
    });

    const prompt = `You are given a raw, low-quality speech transcription.

Task:
Refine and improve the transcription by:
* Correcting speech recognition errors (misheard or garbled words, wrong homophones, etc.) based on context
* Fixing grammar, spelling, punctuation, and basic formatting
* Preserving the original meaning, intent, and style
* Removing repetition, filler words, and false starts
* Keeping proper nouns, names, and technical terms as appropriate
* In latter part of any transcript, the user might ad‑hoc correct words that were recognized incorrectly beforehand — just correct those words as indicated without changing the rest of the transcript

Instructions:
* Do NOT add any new information, explanations, or commentary
* Do NOT change names, technical terms, or specific wording unless they are clearly speech recognition errors
* Keep the text in the original language
* Output ONLY the refined transcript text, with no extra comments, labels, or markdown
* Fix speech recognition mistakes based on context and your knowledge

Transcript to refine:
<transcription>
${transcriptionText}
</transcription>
`;

    const answer = await AI.ask(prompt, {
      creativity: 0.3, // Low creativity for accurate refinement
      model: AI.Model["OpenAI_GPT5-mini"],
    });

    toast.style = Toast.Style.Success;
    toast.title = "Refinement Complete";
    toast.message = "AI has improved your transcription";

    onSuccess?.(answer);
    return answer;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await showToast({
      style: Toast.Style.Failure,
      title: "Refinement Failed",
      message: errorMsg,
    });
    onError?.(errorMsg);
    return null;
  } finally {
    onComplete?.();
  }
}

export interface TranslateTextOptions {
  text: string;
  targetLanguage: string;
  onStart?: () => void;
  onSuccess?: (translatedText: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * Translate text to a target language using AI
 */
export async function translateText(options: TranslateTextOptions): Promise<string | null> {
  const { text, targetLanguage, onStart, onSuccess, onError, onComplete } = options;

  if (!text.trim()) {
    const errorMsg = "No text to translate";
    await showToast({
      style: Toast.Style.Failure,
      title: errorMsg,
    });
    onError?.(errorMsg);
    return null;
  }

  // Check if AI is available
  if (!isAIAvailable()) {
    const errorMsg = "Please upgrade to Raycast Pro to use AI features";
    await showToast({
      style: Toast.Style.Failure,
      title: "AI Not Available",
      message: errorMsg,
    });
    onError?.(errorMsg);
    return null;
  }

  onStart?.();

  try {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Translating to ${targetLanguage}...`,
    });

    const prompt = `You are a professional translator.

Task:
Translate the following text to ${targetLanguage}.

Instructions:
* Preserve the original meaning, tone, and style
* Keep proper nouns, names, and technical terms as appropriate
* Output ONLY the translated text, with no extra comments, labels, or markdown
* If the text is already in ${targetLanguage}, return it as-is with minor improvements if needed

Text to translate:
<text>
${text}
</text>
`;

    const answer = await AI.ask(prompt, {
      creativity: 0.3,
      model: AI.Model["OpenAI_GPT5-mini"],
    });

    toast.style = Toast.Style.Success;
    toast.title = "Translation Complete";
    toast.message = `Translated to ${targetLanguage}`;

    onSuccess?.(answer);
    return answer;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await showToast({
      style: Toast.Style.Failure,
      title: "Translation Failed",
      message: errorMsg,
    });
    onError?.(errorMsg);
    return null;
  } finally {
    onComplete?.();
  }
}
