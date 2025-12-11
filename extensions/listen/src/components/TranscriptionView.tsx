import { Action, ActionPanel, Detail, Icon, showToast, Toast } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import type { AIModelPreference } from "../utils/ai";
import { LOCALE_OPTIONS } from "../utils/locales";
import {
  cleanupTranscription,
  handleStopRecording,
  startTranscription,
  type TranscriptionSession,
} from "../utils/transcribe";
import { useProductionSafeMount } from "../utils/use-production-safe-mount";
import { TranscriptionActionsList } from "./TranscriptionActionsList";

export interface TranscriptionViewProps {
  locale: string;
  onDevice: boolean;
  autoRefine: boolean;
  aiModel: AIModelPreference;
  onLocaleUsed?: (locale: string) => Promise<void>;
}

export function TranscriptionView({ locale, onDevice, autoRefine, aiModel, onLocaleUsed }: TranscriptionViewProps) {
  const [transcriptionText, setTranscriptionText] = useState("");
  const [isRecording, setIsRecording] = useState(true);
  const [isMicReady, setIsMicReady] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<string>(locale);
  const sessionRef = useRef<TranscriptionSession | null>(null);
  const [showActionsList, setShowActionsList] = useState(false);
  const [maybeBlinkDot, setMaybeBlinkDot] = useState("");
  const acceptUpdatesRef = useRef(true);

  // Blink cursor when transcribing
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setMaybeBlinkDot((prev) => (prev ? "" : "|"));
      }, 500);
    } else {
      setMaybeBlinkDot("");
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Cleanup on unmount - stop transcription when command is closed
  useEffect(() => {
    return () => {
      // Fire and forget - cleanup will signal Swift to stop
      void cleanupTranscription();
    };
  }, []);

  // Start transcription on mount
  useProductionSafeMount(() => {
    startTranscriptionSession();
  }, []);

  // MARK: Functions

  async function startTranscriptionSession(localeToUse?: string) {
    const effectiveLocale = localeToUse || currentLocale;
    // Save the locale as last used
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
          setIsRecording(false);
        },
        onError: async (message) => {
          setIsRecording(false);
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

  async function stopRecording() {
    // Stop accepting any further updates
    acceptUpdatesRef.current = false;

    await handleStopRecording({
      session: sessionRef.current,
      isRecording,
      transcriptionText,
      onStop: () => setIsRecording(false),
      onShowActions: () => setShowActionsList(true),
    });

    // Ensure session is cleaned up
    sessionRef.current = null;
    await cleanupTranscription();
  }

  // MARK: Rendering

  // Show actions list if recording stopped and we have transcription
  if (!isRecording && transcriptionText && showActionsList) {
    return (
      <TranscriptionActionsList
        transcriptionText={transcriptionText}
        locale={currentLocale}
        onDevice={onDevice}
        autoRefine={autoRefine}
        aiModel={aiModel}
      />
    );
  }

  const statusIndicator = isRecording ? (isMicReady ? "Listening..." : "Setting up...") : "✅ Complete";

  // Calculate stats from current transcription
  const wordCount = transcriptionText.split(/\s+/).filter((w) => w.trim()).length;
  const charCount = transcriptionText.length;

  const markdown = `${transcriptionText ? `${transcriptionText}${maybeBlinkDot}` : isRecording ? (isMicReady ? "Listening..." : "Opening Mic...") : "_No transcription_"}`;

  const metadata = (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Status" text={statusIndicator} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="Language" text={currentLocale.toUpperCase()} />
      <Detail.Metadata.Label title="Recognition" text={onDevice ? "On-device" : "Server-based"} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="Words" text={wordCount.toString()} />
      <Detail.Metadata.Label title="Characters" text={charCount.toString()} />
    </Detail.Metadata>
  );

  return (
    <Detail
      markdown={markdown}
      metadata={metadata}
      isLoading={false}
      actions={
        <ActionPanel>
          {isRecording && <Action title="Stop Recording" icon={Icon.Stop} onAction={stopRecording} />}
          {isRecording && (
            <ActionPanel.Submenu title="Change Language" icon={Icon.Globe} shortcut={{ modifiers: ["cmd"], key: "l" }}>
              {LOCALE_OPTIONS.map((option) => (
                <Action
                  key={option.value}
                  title={option.title}
                  icon={option.value === currentLocale ? Icon.Checkmark : Icon.Circle}
                  onAction={() => changeLanguage(option.value)}
                />
              ))}
            </ActionPanel.Submenu>
          )}
        </ActionPanel>
      }
    />
  );
}
