import {
  ActionPanel,
  Action,
  showToast,
  Toast,
  Clipboard,
  Icon,
  Detail,
  LaunchProps,
  getPreferenceValues,
  List,
  popToRoot,
  AI,
  environment,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { spawn } from "child_process";
import { join } from "path";

interface Arguments {
  locale?: string;
  recognitionMode?: string;
}

interface Preferences {
  locale: string;
  onDeviceOnly: boolean;
  autoRefine: boolean;
}

// List view with actions
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

  // Auto-refine effect when component mounts if autoRefine is enabled
  useEffect(() => {
    if (autoRefine && !refinedText && environment.canAccess(AI)) {
      handleRefineWithAI();
    }
  }, []);

  async function handleRefineWithAI() {
    if (!transcriptionText.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No transcription to refine",
      });
      return;
    }

    // Check if AI is available
    if (!environment.canAccess(AI)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "AI Not Available",
        message: "Please upgrade to Raycast Pro to use AI features",
      });
      return;
    }

    setIsRefining(true);

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

      setRefinedText(answer);

      toast.style = Toast.Style.Success;
      toast.title = "Refinement Complete";
      toast.message = "AI has improved your transcription";
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Refinement Failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsRefining(false);
    }
  }

  const wordCount = transcriptionText.split(/\s+/).filter((w) => w.trim()).length;
  const charCount = transcriptionText.length;
  const isRefined = !!refinedText;

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
  const [childProcess, setChildProcess] = useState<ReturnType<typeof spawn> | null>(null);
  const [showActionsList, setShowActionsList] = useState(false);
  const [maybeBlinkDot, setMaybeBlinkDot] = useState("");

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
  useEffect(() => {
    startTranscription();
  }, []);

  async function startTranscription() {
    const binaryPath = join(environment.assetsPath, "transcribe");

    // Use a very long duration since we'll stop it manually
    const args: string[] = ["-d", "3000", "-l", locale, "-s"];

    if (onDevice) {
      args.push("-o");
    }

    let buffer = "";

    const process = spawn(binaryPath, args);
    setChildProcess(process);

    process.stdout.on("data", (data) => {
      buffer += data.toString();

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line);

          switch (event.type) {
            case "recording_started":
              setIsMicReady(true);
              break;

            case "partial":
              if (event.text) {
                setTranscriptionText(event.text);
              }
              break;

            case "completed":
              setIsRecording(false);
              break;

            case "error": {
              const errorMsg = event.message || "Unknown error";
              setIsRecording(false);
              showToast({
                style: Toast.Style.Failure,
                title: "Transcription Failed",
                message: errorMsg,
              });
              break;
            }
          }
        } catch (error) {
          console.error("Failed to parse stream event:", line, error);
        }
      }
    });

    process.stderr.on("data", (data) => {
      console.error("Transcription stderr:", data.toString());
    });

    process.on("error", async (error) => {
      const errorMsg = `Failed to start transcription process: ${error.message}`;
      setIsRecording(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to Start",
        message: errorMsg,
      });
    });

    process.on("close", (code) => {
      if (code !== 0 && code !== null) {
        setIsRecording(false);
      }
    });
  }

  async function stopRecording() {
    if (childProcess && isRecording) {
      setIsRecording(false);
      console.log("Sending STOP to transcription process via stdin");

      try {
        if (childProcess.stdin) {
          childProcess.stdin.write("STOP\n");
          childProcess.stdin.end();
        } else {
          console.warn("Transcription process stdin is not available, falling back to SIGTERM");
          childProcess.kill("SIGTERM");
        }
      } catch (error) {
        console.error("Failed to send STOP to process, falling back to SIGTERM:", error);
        childProcess.kill("SIGTERM");
      }

      // Automatically show actions list after stopping
      setTimeout(() => {
        if (transcriptionText.trim()) {
          setShowActionsList(true);
        }
      }, 100);
    }
  }

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

  /**
   * MARK:rendering
   */

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
