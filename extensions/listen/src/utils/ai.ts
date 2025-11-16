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

    const prompt = `Please refine and improve the following transcription. Fix any grammar errors, punctuation, and formatting issues. Keep the meaning and content the same, just make it more polished and professional:
<transcript>
${transcriptionText}
</transcript>

- keep it in original language
- only output refined text, no explanations`;

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
