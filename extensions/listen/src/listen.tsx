import {
  Action,
  ActionPanel,
  AI,
  Clipboard,
  Detail,
  environment,
  getPreferenceValues,
  Icon,
  type LaunchProps,
  List,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import type { ChildProcess } from "child_process";
import { useEffect, useRef, useState } from "react";
import { refineTranscription } from "./utils/ai";
import { handleStopRecording, startTranscription } from "./utils/transcribe";
import { useProductionSafeMount } from "./utils/use-production-safe-mount";

interface Arguments {
  locale?: string;
  recognitionMode?: string;
}

interface Preferences {
  locale: string;
  onDeviceOnly: boolean;
  autoRefine: boolean;
}

//MARK: List view with actions
function TranscriptionActionsList({
  transcriptionText,
  locale,
  onDevice,
  autoRefine,
}: {
  transcriptionText: string;
  locale: string;
  onDevice: boolean;
  autoRefine: boolean;
}) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinedText, setRefinedText] = useState("");

  const refiningRef = useRef(false);

  const wordCount = transcriptionText.split(/\s+/).filter((w) => w.trim()).length;
  const charCount = transcriptionText.length;
  const isRefined = !!refinedText;

  // Auto-refine effect when component mounts if autoRefine is enabled
  useProductionSafeMount(() => {
    if (autoRefine && !refinedText && environment.canAccess(AI)) {
      handleRefineWithAI();
    }
  }, []);

  /**
   * MARK: functions
   */
  async function handleRefineWithAI() {
    if (refiningRef.current) {
      return;
    }
    refineTranscription({
      transcriptionText,
      onStart() {
        refiningRef.current = true;
        setIsRefining(true);
      },
      onSuccess(refinedText) {
        setRefinedText(refinedText);
      },
      onComplete() {
        refiningRef.current = false;
        setIsRefining(false);
      },
    });
  }

  async function handlePasteOriginal() {
    if (transcriptionText.trim()) {
      await Clipboard.paste(transcriptionText);
      await showToast({
        style: Toast.Style.Success,
        title: "Pasted Original",
        message: "Original transcription pasted to active app",
      });
      await popToRoot();
    }
  }

  async function handleCopyOriginal() {
    if (transcriptionText.trim()) {
      await Clipboard.copy(transcriptionText);
      await showToast({
        style: Toast.Style.Success,
        title: "Copied Original",
        message: "Original transcription copied to clipboard",
      });
    }
  }

  async function handleCopyRefined() {
    if (refinedText) {
      await Clipboard.copy(refinedText);
      await showToast({
        style: Toast.Style.Success,
        title: "Copied Refined",
        message: "Refined transcription copied to clipboard",
      });
    }
  }

  // MARK: rendering
  const OriginalItem = (
    <List.Item
      id="original-text"
      title="Original Text"
      icon={Icon.Text}
      subtitle="Paste original transcription"
      detail={
        <List.Item.Detail
          markdown={transcriptionText}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Type" text="Original" />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Language" text={locale.toUpperCase()} />
              <List.Item.Detail.Metadata.Label title="Recognition" text={onDevice ? "On-device" : "Server-based"} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Words" text={wordCount.toString()} />
              <List.Item.Detail.Metadata.Label title="Characters" text={charCount.toString()} />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action title="Paste Original Text" icon={Icon.Clipboard} onAction={handlePasteOriginal} />
          <Action
            title="Copy Original Text"
            icon={Icon.CopyClipboard}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
            onAction={handleCopyOriginal}
          />
        </ActionPanel>
      }
    />
  );

  const RefineItem = (
    <List.Item
      id="refined-text"
      title="Refined Text"
      icon={Icon.Stars}
      subtitle={isRefining ? "Processing..." : isRefined ? "Ready to paste" : "Refine with AI"}
      detail={
        <List.Item.Detail
          markdown={isRefined ? refinedText : transcriptionText}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Type" text={isRefined ? "✨ AI Refined" : "Not refined yet"} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Language" text={locale.toUpperCase()} />
              <List.Item.Detail.Metadata.Label title="Recognition" text={onDevice ? "On-device" : "Server-based"} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Words" text={wordCount.toString()} />
              <List.Item.Detail.Metadata.Label title="Characters" text={charCount.toString()} />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          {isRefined ? (
            <>
              <Action
                title="Paste Refined Text"
                icon={Icon.Clipboard}
                onAction={async () => {
                  await Clipboard.paste(refinedText);
                  await showToast({
                    style: Toast.Style.Success,
                    title: "Pasted Refined",
                    message: "Refined transcription pasted to active app",
                  });
                  await popToRoot();
                }}
              />
              <Action
                title="Copy Refined Text"
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
                onAction={handleCopyRefined}
              />
              <Action
                title="Refine Again"
                icon={Icon.RotateClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={handleRefineWithAI}
              />
            </>
          ) : (
            <Action title="Refine with AI" icon={Icon.Stars} onAction={handleRefineWithAI} />
          )}
        </ActionPanel>
      }
    />
  );

  return (
    <List isShowingDetail>
      {autoRefine ? (
        <>
          {RefineItem}
          {OriginalItem}
        </>
      ) : (
        <>
          {OriginalItem}
          {RefineItem}
        </>
      )}

      <List.Item
        title="Discard & Close"
        icon={Icon.Trash}
        subtitle="Close without pasting"
        detail={
          <List.Item.Detail
            markdown={`~~${transcriptionText}~~`}
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label title="Action" text="Discard" />
                <List.Item.Detail.Metadata.Separator />
                <List.Item.Detail.Metadata.Label title="Language" text={locale.toUpperCase()} />
                <List.Item.Detail.Metadata.Label title="Recognition" text={onDevice ? "On-device" : "Server-based"} />
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          <ActionPanel>
            <Action title="Discard & Close" icon={Icon.Trash} onAction={() => popToRoot()} />
          </ActionPanel>
        }
      />
    </List>
  );
}

// MARK: Transcription View

function TranscriptionView({
  locale,
  onDevice,
  autoRefine,
}: {
  locale: string;
  onDevice: boolean;
  autoRefine: boolean;
}) {
  const [transcriptionText, setTranscriptionText] = useState("");
  const [isRecording, setIsRecording] = useState(true);
  const [isMicReady, setIsMicReady] = useState(false);
  const childProcessRef = useRef<ChildProcess | null>(null);
  const [showActionsList, setShowActionsList] = useState(false);
  const [maybeBlinkDot, setMaybeBlinkDot] = useState("");
  const acceptUpdatesRef = useRef(true);

  // when transcribing, blink dot 500ms
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setMaybeBlinkDot((prev) => (prev ? "" : "|"));
        // setMaybeBlinkDot((prev) => (prev ? "" : "▍"));
      }, 500);
    } else {
      setMaybeBlinkDot("");
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Start transcription on mount
  useProductionSafeMount(() => {
    startTranscriptionSession();
  }, []);

  // MARK: functions
  async function startTranscriptionSession() {
    const process = startTranscription({
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

    childProcessRef.current = process;
  }

  async function stopRecording() {
    // Stop accepting any further updates
    acceptUpdatesRef.current = false;

    handleStopRecording({
      childProcess: childProcessRef.current,
      isRecording,
      transcriptionText,
      onStop: () => setIsRecording(false),
      onShowActions: () => setShowActionsList(true),
    });
  }

  // MARK:rendering

  // Show actions list if recording stopped and we have transcription
  if (!isRecording && transcriptionText && showActionsList) {
    return (
      <TranscriptionActionsList
        transcriptionText={transcriptionText}
        locale={locale}
        onDevice={onDevice}
        autoRefine={autoRefine}
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
      <Detail.Metadata.Label title="Language" text={locale.toUpperCase()} />
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
        </ActionPanel>
      }
    />
  );
}

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const preferences = getPreferenceValues<Preferences>();

  const locale = props.arguments.locale || preferences.locale;
  const onDevice = props.arguments.recognitionMode
    ? props.arguments.recognitionMode !== "server"
    : preferences.onDeviceOnly;
  const autoRefine = preferences.autoRefine;

  return <TranscriptionView locale={locale} onDevice={onDevice} autoRefine={autoRefine} />;
}
