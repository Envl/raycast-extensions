import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  getSelectedText,
  Icon,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { type AIModelPreference, processVoiceCommand } from "../utils/ai";
import { LOCALE_OPTIONS } from "../utils/locales";
import { cleanupTranscription, startTranscription, type TranscriptionSession } from "../utils/transcribe";
import { useProductionSafeMount } from "../utils/use-production-safe-mount";

// MARK: - Constants

const MODEL_DISPLAY_NAMES: Record<AIModelPreference, string> = {
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gpt5-mini": "GPT-5 Mini",
  "claude-haiku": "Claude Haiku",
};

const ALL_MODELS: AIModelPreference[] = ["gemini-2.0-flash", "gemini-2.5-flash", "gpt5-mini", "claude-haiku"];

type ViewState = "recording" | "processing" | "result";

// MARK: - Props

export interface VoiceCommandViewProps {
  locale: string;
  onDevice: boolean;
  aiModel: AIModelPreference;
  onLocaleUsed?: (locale: string) => Promise<void>;
}

// MARK: - Component

export function VoiceCommandView({ locale, onDevice, aiModel, onLocaleUsed }: VoiceCommandViewProps) {
  const [viewState, setViewState] = useState<ViewState>("recording");
  const [transcriptionText, setTranscriptionText] = useState("");
  const [resultText, setResultText] = useState("");
  const [isMicReady, setIsMicReady] = useState(false);
  const [maybeBlinkDot, setMaybeBlinkDot] = useState("");
  const [currentModel, setCurrentModel] = useState<AIModelPreference>(aiModel);
  const [currentLocale, setCurrentLocale] = useState<string>(locale);
  const [selectedText, setSelectedText] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  const sessionRef = useRef<TranscriptionSession | null>(null);
  const acceptUpdatesRef = useRef(true);

  // Blink cursor when recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (viewState === "recording") {
      interval = setInterval(() => {
        setMaybeBlinkDot((prev) => (prev ? "" : "|"));
      }, 500);
    } else {
      setMaybeBlinkDot("");
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [viewState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void cleanupTranscription();
    };
  }, []);

  // Start transcription on mount
  useProductionSafeMount(() => {
    startTranscriptionSession();
    getSelectedText()
      .then((text) => {
        setSelectedText(text);
      })
      .finally(() => setMounted(true));
  }, []);

  // MARK: - Error State

  if (!selectedText && mounted) {
    return (
      <Detail
        markdown={`## ⚠️ Error\n\n${"No text selected. Please select some text and try again."}`}
        actions={
          <ActionPanel>
            <Action title="Close" icon={Icon.XMarkCircle} onAction={() => popToRoot()} />
          </ActionPanel>
        }
      />
    );
  }

  // MARK: - Functions

  async function startTranscriptionSession(localeToUse?: string) {
    const effectiveLocale = localeToUse || currentLocale;
    await onLocaleUsed?.(effectiveLocale);

    const session = await startTranscription({
      locale: effectiveLocale,
      onDevice,
      callbacks: {
        onRecordingStarted: () => {
          setIsMicReady(true);
        },
        onPartialResult: (text) => {
          if (acceptUpdatesRef.current) {
            setTranscriptionText(text);
          }
        },
        onCompleted: () => {
          // Don't automatically process - wait for user to stop
        },
        onError: async (message) => {
          setViewState("result");
          await showToast({
            style: Toast.Style.Failure,
            title: "Transcription Failed",
            message,
          });
        },
      },
    });

    sessionRef.current = session;
  }

  async function changeLanguage(newLocale: string) {
    if (newLocale === currentLocale) return;

    // Stop current transcription
    if (sessionRef.current) {
      await sessionRef.current.stop();
      sessionRef.current = null;
    }

    // Ensure cleanup before starting new session
    await cleanupTranscription();

    // Reset state for new recording
    setCurrentLocale(newLocale);
    setTranscriptionText("");
    setIsMicReady(false);
    acceptUpdatesRef.current = true;

    // Start new transcription with new locale
    await startTranscriptionSession(newLocale);
  }

  async function stopAndProcess() {
    if (!sessionRef.current) return;

    // Stop accepting updates
    acceptUpdatesRef.current = false;

    // Stop recording and cleanup
    await sessionRef.current.stop();
    sessionRef.current = null;
    await cleanupTranscription();

    setViewState("processing");

    if (!transcriptionText.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No Voice Input",
        message: "Please speak your instruction or question",
      });
      setViewState("result");
      setResultText(selectedText);
      return;
    }

    // Process with AI
    await processVoiceCommand({
      selectedText,
      instruction: transcriptionText,
      model: currentModel,
      onStart: () => {
        // Already in processing state
      },
      onSuccess: (result) => {
        setResultText(result);
        setViewState("result");
      },
      onError: async (message) => {
        await showToast({
          style: Toast.Style.Failure,
          title: "Processing Failed",
          message,
        });
        setViewState("result");
        setResultText(selectedText);
      },
      onComplete: () => {
        // Done
      },
    });
  }

  async function handlePaste() {
    if (!resultText) return;
    await Clipboard.paste(resultText);
    await showToast({
      style: Toast.Style.Success,
      title: "Pasted",
      message: "Result pasted to active app",
    });
    await popToRoot();
  }

  async function handleCopy() {
    if (!resultText) return;
    await Clipboard.copy(resultText);
    await showToast({
      style: Toast.Style.Success,
      title: "Copied",
      message: "Result copied to clipboard",
    });
  }

  async function handleRegenerate() {
    if (!transcriptionText.trim()) return;

    setViewState("processing");

    await processVoiceCommand({
      selectedText,
      instruction: transcriptionText,
      model: currentModel,
      onStart: () => {
        // Already in processing state
      },
      onSuccess: (result) => {
        setResultText(result);
        setViewState("result");
      },
      onError: async (message) => {
        await showToast({
          style: Toast.Style.Failure,
          title: "Regenerate Failed",
          message,
        });
        setViewState("result");
      },
      onComplete: () => {
        // Done
      },
    });
  }

  // MARK: - Rendering

  const selectedTextPreview = selectedText.length > 200 ? selectedText.substring(0, 200) + "..." : selectedText;

  if (viewState === "recording") {
    return (
      <RecordingView
        selectedTextPreview={selectedTextPreview}
        selectedTextLength={selectedText.length}
        transcriptionText={transcriptionText}
        maybeBlinkDot={maybeBlinkDot}
        isMicReady={isMicReady}
        currentLocale={currentLocale}
        onDevice={onDevice}
        onStopAndProcess={stopAndProcess}
        onChangeLanguage={changeLanguage}
      />
    );
  }

  if (viewState === "processing") {
    return (
      <ProcessingView
        selectedTextPreview={selectedTextPreview}
        transcriptionText={transcriptionText}
        currentLocale={currentLocale}
      />
    );
  }

  // Result state
  return (
    <ResultView
      resultText={resultText}
      transcriptionText={transcriptionText}
      selectedText={selectedText}
      currentModel={currentModel}
      onPaste={handlePaste}
      onCopy={handleCopy}
      onRegenerate={handleRegenerate}
      onChangeModelAndRegenerate={async (model) => {
        setCurrentModel(model);
        setViewState("processing");
        await processVoiceCommand({
          selectedText,
          instruction: transcriptionText,
          model,
          onSuccess: (result) => {
            setResultText(result);
            setViewState("result");
          },
          onError: async () => {
            setViewState("result");
          },
        });
      }}
    />
  );
}

// MARK: - Recording View

interface RecordingViewProps {
  selectedTextPreview: string;
  selectedTextLength: number;
  transcriptionText: string;
  maybeBlinkDot: string;
  isMicReady: boolean;
  currentLocale: string;
  onDevice: boolean;
  onStopAndProcess: () => void;
  onChangeLanguage: (locale: string) => void;
}

function RecordingView({
  selectedTextPreview,
  selectedTextLength,
  transcriptionText,
  maybeBlinkDot,
  isMicReady,
  currentLocale,
  onDevice,
  onStopAndProcess,
  onChangeLanguage,
}: RecordingViewProps) {
  const markdown = `## Selected Text

\`\`\`
${selectedTextPreview}
\`\`\`

---

## Your Voice Command

${transcriptionText ? `${transcriptionText}${maybeBlinkDot}` : isMicReady ? "_Listening..._" : "_Opening Mic..._"}`;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text={isMicReady ? "🎤 Listening..." : "Setting up..."} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Language" text={currentLocale.toUpperCase()} />
          <Detail.Metadata.Label title="Recognition" text={onDevice ? "On-device" : "Server-based"} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Selected" text={`${selectedTextLength} chars`} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action title="Stop & Process" icon={Icon.Play} onAction={onStopAndProcess} />
          <ActionPanel.Submenu title="Change Language" icon={Icon.Globe} shortcut={{ modifiers: ["cmd"], key: "l" }}>
            {LOCALE_OPTIONS.map((option) => (
              <Action
                key={option.value}
                title={option.title}
                icon={option.value === currentLocale ? Icon.Checkmark : Icon.Circle}
                onAction={() => onChangeLanguage(option.value)}
              />
            ))}
          </ActionPanel.Submenu>
        </ActionPanel>
      }
    />
  );
}

// MARK: - Processing View

interface ProcessingViewProps {
  selectedTextPreview: string;
  transcriptionText: string;
  currentLocale: string;
}

function ProcessingView({ selectedTextPreview, transcriptionText, currentLocale }: ProcessingViewProps) {
  const markdown = `## Selected Text
\`\`\`
${selectedTextPreview}
\`\`\`

---
## Your Voice Command
\`\`\`
${transcriptionText}
\`\`\`

---
## ⏳ Processing...

_Analyzing and processing your request..._`;

  return (
    <Detail
      isLoading
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text="🔄 Processing..." />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Language" text={currentLocale.toUpperCase()} />
        </Detail.Metadata>
      }
    />
  );
}

// MARK: - Result View

interface ResultViewProps {
  resultText: string;
  transcriptionText: string;
  selectedText: string;
  currentModel: AIModelPreference;
  onPaste: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onChangeModelAndRegenerate: (model: AIModelPreference) => void;
}

function ResultView({
  resultText,
  transcriptionText,
  selectedText,
  currentModel,
  onPaste,
  onCopy,
  onRegenerate,
  onChangeModelAndRegenerate,
}: ResultViewProps) {
  const markdown = `### Result

${resultText}

---
### Voice Command
\`\`\`
${transcriptionText || "_No input_"}
\`\`\`

---
### Original Text
\`\`\`
${selectedText}
\`\`\``;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text="✅ Complete" />
          <Detail.Metadata.Label title="Model" text={MODEL_DISPLAY_NAMES[currentModel]} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Original" text={`${selectedText.length} chars`} />
          <Detail.Metadata.Label title="Result" text={`${resultText.length} chars`} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action title="Paste Result" icon={Icon.Clipboard} onAction={onPaste} />
          <Action
            title="Copy Result"
            icon={Icon.CopyClipboard}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
            onAction={onCopy}
          />
          <Action
            title="Regenerate"
            icon={Icon.RotateClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={onRegenerate}
          />
          <ActionPanel.Submenu
            title="Change Model & Regenerate"
            icon={Icon.Switch}
            shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
          >
            {ALL_MODELS.map((model) => (
              <Action
                key={model}
                title={MODEL_DISPLAY_NAMES[model]}
                icon={model === currentModel ? Icon.Checkmark : Icon.Circle}
                onAction={() => onChangeModelAndRegenerate(model)}
              />
            ))}
          </ActionPanel.Submenu>
          <Action title="Discard & Close" icon={Icon.Trash} onAction={() => popToRoot()} />
        </ActionPanel>
      }
    />
  );
}
