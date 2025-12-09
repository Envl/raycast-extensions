import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  getPreferenceValues,
  getSelectedText,
  Icon,
  type LaunchProps,
  LocalStorage,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { processVoiceCommand } from "./utils/ai";
import { cleanupTranscription, startTranscription, type TranscriptionSession } from "./utils/transcribe";
import { useProductionSafeMount } from "./utils/use-production-safe-mount";

interface Arguments {
  locale?: string;
  recognitionMode?: string;
}

import type { AIModelPreference } from "./utils/ai";

const MODEL_DISPLAY_NAMES: Record<AIModelPreference, string> = {
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gpt5-mini": "GPT-5 Mini",
  "claude-haiku": "Claude Haiku",
};

const ALL_MODELS: AIModelPreference[] = ["gemini-2.0-flash", "gemini-2.5-flash", "gpt5-mini", "claude-haiku"];

interface Preferences {
  locale: string;
  onDeviceOnly: boolean;
  aiModel: AIModelPreference;
}

const LAST_LOCALE_KEY = "lastUsedLocale";

type ViewState = "recording" | "processing" | "result";

export default function VoiceCommandCommand(props: LaunchProps<{ arguments: Arguments }>) {
  const preferences = getPreferenceValues<Preferences>();
  const [locale, setLocale] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDevice = props.arguments.recognitionMode
    ? props.arguments.recognitionMode !== "server"
    : preferences.onDeviceOnly;

  // Load selected text and locale on mount
  useEffect(() => {
    async function init() {
      try {
        const text = await getSelectedText();
        if (!text || !text.trim()) {
          setError("No text selected. Please select some text and try again.");
          return;
        }
        setSelectedText(text);

        // If locale is provided via arguments, use it and save it
        if (props.arguments.locale) {
          setLocale(props.arguments.locale);
          await LocalStorage.setItem(LAST_LOCALE_KEY, props.arguments.locale);
          return;
        }

        // Try to get last used locale from storage
        const lastLocale = await LocalStorage.getItem<string>(LAST_LOCALE_KEY);
        if (lastLocale) {
          setLocale(lastLocale);
        } else {
          // Fall back to preferences
          setLocale(preferences.locale);
        }
      } catch {
        setError("Failed to get selected text. Please select some text and try again.");
      }
    }
    init();
  }, [props.arguments.locale, preferences.locale]);

  if (error) {
    return (
      <Detail
        markdown={`## ⚠️ Error\n\n${error}`}
        actions={
          <ActionPanel>
            <Action title="Close" icon={Icon.XMarkCircle} onAction={() => popToRoot()} />
          </ActionPanel>
        }
      />
    );
  }

  if (!locale || !selectedText) {
    return <Detail isLoading markdown="Loading..." />;
  }

  return (
    <VoiceCommandView
      selectedText={selectedText}
      locale={locale}
      onDevice={onDevice}
      aiModel={preferences.aiModel}
      onLocaleUsed={async (usedLocale) => {
        await LocalStorage.setItem(LAST_LOCALE_KEY, usedLocale);
      }}
    />
  );
}

// MARK: - Voice Command View

interface VoiceCommandViewProps {
  selectedText: string;
  locale: string;
  onDevice: boolean;
  aiModel: AIModelPreference;
  onLocaleUsed?: (locale: string) => Promise<void>;
}

function VoiceCommandView({ selectedText, locale, onDevice, aiModel, onLocaleUsed }: VoiceCommandViewProps) {
  const [viewState, setViewState] = useState<ViewState>("recording");
  const [transcriptionText, setTranscriptionText] = useState("");
  const [resultText, setResultText] = useState("");
  const [isMicReady, setIsMicReady] = useState(false);
  const [maybeBlinkDot, setMaybeBlinkDot] = useState("");
  const [currentModel, setCurrentModel] = useState<AIModelPreference>(aiModel);

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
  }, []);

  // MARK: Functions

  async function startTranscriptionSession() {
    await onLocaleUsed?.(locale);

    const session = await startTranscription({
      locale,
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

  async function stopAndProcess() {
    if (!sessionRef.current) return;

    // Stop accepting updates
    acceptUpdatesRef.current = false;

    // Stop recording
    await sessionRef.current.stop();
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

  // MARK: Rendering

  const selectedTextPreview = selectedText.length > 200 ? selectedText.substring(0, 200) + "..." : selectedText;

  if (viewState === "recording") {
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
            <Detail.Metadata.Label title="Language" text={locale.toUpperCase()} />
            <Detail.Metadata.Label title="Recognition" text={onDevice ? "On-device" : "Server-based"} />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Selected" text={`${selectedText.length} chars`} />
          </Detail.Metadata>
        }
        actions={
          <ActionPanel>
            <Action title="Stop & Process" icon={Icon.Play} onAction={stopAndProcess} />
          </ActionPanel>
        }
      />
    );
  }

  if (viewState === "processing") {
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
            <Detail.Metadata.Label title="Language" text={locale.toUpperCase()} />
          </Detail.Metadata>
        }
      />
    );
  }

  // Result state
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
          <Action title="Paste Result" icon={Icon.Clipboard} onAction={handlePaste} />
          <Action
            title="Copy Result"
            icon={Icon.CopyClipboard}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
            onAction={handleCopy}
          />
          <Action
            title="Regenerate"
            icon={Icon.RotateClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={handleRegenerate}
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
                onAction={async () => {
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
            ))}
          </ActionPanel.Submenu>
          <Action title="Discard & Close" icon={Icon.Trash} onAction={() => popToRoot()} />
        </ActionPanel>
      }
    />
  );
}
