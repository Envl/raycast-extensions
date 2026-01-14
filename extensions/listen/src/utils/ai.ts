import { AI, environment, showToast, Toast } from "@raycast/api";

export interface RefineTranscriptionOptions {
  transcriptionText: string;
  model?: AIModelPreference;
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
  const { transcriptionText, model, onStart, onSuccess, onError, onComplete } = options;

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
      model: getAIModel(model),
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
  model?: AIModelPreference;
  onStart?: () => void;
  onSuccess?: (translatedText: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * Translate text to a target language using AI
 */
export async function translateText(options: TranslateTextOptions): Promise<string | null> {
  const { text, targetLanguage, model, onStart, onSuccess, onError, onComplete } = options;

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
      model: getAIModel(model),
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

export type AIModelPreference = "gemini-2.0-flash" | "gemini-2.5-flash" | "gpt5.1-instant" | "claude-4.5-haiku";

const MODEL_MAP: Record<AIModelPreference, AI.Model> = {
  "gemini-2.0-flash": AI.Model["Google_Gemini_2.0_Flash"],
  "gemini-2.5-flash": AI.Model["Google_Gemini_2.5_Flash"],
  "gpt5.1-instant": AI.Model["OpenAI_GPT-5.1_Instant"],
  "claude-4.5-haiku": AI.Model["Anthropic_Claude_4.5_Haiku"],
};

export function getAIModel(preference?: AIModelPreference): AI.Model {
  return (preference && MODEL_MAP[preference]) || AI.Model["Anthropic_Claude_4.5_Haiku"];
}

export interface VoiceCommandOptions {
  selectedText: string;
  instruction: string;
  model?: AIModelPreference;
  onStart?: () => void;
  onSuccess?: (result: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * Process selected text with voice instruction using AI.
 * The AI automatically determines whether to:
 * - Modify/transform the selected text
 * - Answer a question about the selected text
 * - Or perform any other operation based on the instruction
 *
 * The AI will first correct any speech recognition errors in the instruction,
 * then perform the appropriate operation.
 */
export async function processVoiceCommand(options: VoiceCommandOptions): Promise<string | null> {
  const { selectedText, instruction, onStart, onSuccess, onError, onComplete } = options;

  if (!selectedText.trim()) {
    const errorMsg = "No text selected";
    await showToast({
      style: Toast.Style.Failure,
      title: errorMsg,
    });
    onError?.(errorMsg);
    return null;
  }

  if (!instruction.trim()) {
    const errorMsg = "No voice instruction provided";
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
      title: "Processing...",
    });

    const prompt = getUnifiedPrompt(selectedText, instruction);

    const answer = await AI.ask(prompt, {
      creativity: 0.4,
      model: getAIModel(options.model),
    });

    toast.style = Toast.Style.Success;
    toast.title = "Complete";

    onSuccess?.(answer);
    return answer;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await showToast({
      style: Toast.Style.Failure,
      title: "Processing Failed",
      message: errorMsg,
    });
    onError?.(errorMsg);
    return null;
  } finally {
    onComplete?.();
  }
}

function getUnifiedPrompt(selectedText: string, instruction: string): string {
  return `Be an intelligent assistant that processes text based on voice instructions. You will receive:
1. A piece of SELECTED TEXT from the user
2. A raw VOICE INSTRUCTION (speech-to-text transcription) describing what to do with it

The task is to:
1. First, interpret and correct the voice instruction - fix any speech recognition errors, typos, or unclear parts based on context
2. Determine what the user wants:
   - If they want to MODIFY the text (rewrite, translate, fix, format, summarize, expand, etc.) → output the modified text
   - If they're asking a QUESTION about the text (explain, what does this mean, why, how, etc.) → answer the question in a precise and concise way, sacrifice grammar for brevity
   - If unclear, make the best interpretation based on context

For TEXT MODIFICATIONS:
* Output ONLY the final modified text
* Preserve formatting style (code blocks, lists, etc.) unless asked to change it
* Common modifications: rewrite, translate, change tone, fix grammar, summarize, expand, format, etc.

For QUESTIONS/EXPLANATIONS:
* Provide a clear, helpful answer
* Use markdown formatting when it improves readability
* Base your answer on the provided text, supplemented by your knowledge when appropriate
* If explaining code, be clear and concise

General Instructions:
* Do NOT include labels like "Modified text:" or "Answer:" - just output the result directly
* If the instruction cannot be reasonably interpreted, return the original text unchanged
* Keep the output focused and relevant

<selected_text>
${selectedText}
</selected_text>

<voice_instruction>
${instruction}
</voice_instruction>

Output:`;
}
