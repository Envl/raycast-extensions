import { environment } from "@raycast/api";
import { type ChildProcess, spawn } from "child_process";
import { join } from "path";

export interface StreamEvent {
  type: "recording_started" | "partial" | "completed" | "error";
  text?: string;
  message?: string;
  duration?: number;
  timestamp: number;
}

export interface TranscriptionCallbacks {
  onRecordingStarted?: () => void;
  onPartialResult?: (text: string) => void;
  onCompleted?: () => void;
  onError?: (message: string) => void;
}

export interface TranscriptionOptions {
  locale: string;
  onDevice: boolean;
  callbacks?: TranscriptionCallbacks;
}

/**
 * Start a streaming transcription session
 * Returns a ChildProcess that can be controlled (stopped via stdin)
 */
export function startTranscription(options: TranscriptionOptions): ChildProcess {
  const { locale, onDevice, callbacks } = options;

  const binaryPath = join(environment.assetsPath, "transcribe");

  // Use a very long duration since we'll stop it manually
  const args: string[] = ["-d", "3000", "-l", locale, "-s"];

  if (onDevice) {
    args.push("-o");
  }

  let buffer = "";

  const process = spawn(binaryPath, args);

  process.stdout.on("data", (data) => {
    buffer += data.toString();

    // Process complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line) as StreamEvent;

        switch (event.type) {
          case "recording_started":
            callbacks?.onRecordingStarted?.();
            break;

          case "partial":
            if (event.text) {
              callbacks?.onPartialResult?.(event.text);
            }
            break;

          case "completed":
            callbacks?.onCompleted?.();
            break;

          case "error": {
            const errorMsg = event.message || "Unknown error";
            callbacks?.onError?.(errorMsg);
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

  process.on("error", (error) => {
    const errorMsg = `Failed to start transcription process: ${error.message}`;
    callbacks?.onError?.(errorMsg);
  });

  process.on("close", (code) => {
    if (code !== 0 && code !== null) {
      callbacks?.onError?.(`Process exited with code ${code}`);
    }
  });

  return process;
}

/**
 * Stop a running transcription process gracefully
 */
export function stopTranscription(process: ChildProcess): void {
  console.log("Sending STOP to transcription process via stdin");

  try {
    if (process.stdin) {
      process.stdin.write("STOP\n");
      process.stdin.end();
    } else {
      console.warn("Transcription process stdin is not available, falling back to SIGTERM");
      process.kill("SIGTERM");
    }
  } catch (error) {
    console.error("Failed to send STOP to process, falling back to SIGTERM:", error);
    process.kill("SIGTERM");
  }
}

export interface StopRecordingOptions {
  childProcess: ChildProcess | null;
  isRecording: boolean;
  transcriptionText: string;
  onStop: () => void;
  onShowActions: () => void;
}

/**
 * Stop recording and handle the post-stop flow
 */
export function handleStopRecording(options: StopRecordingOptions): void {
  const { childProcess, isRecording, transcriptionText, onStop, onShowActions } = options;

  if (childProcess && isRecording) {
    onStop();
    stopTranscription(childProcess);

    // Automatically show actions list after stopping
    setTimeout(() => {
      if (transcriptionText.trim()) {
        onShowActions();
      }
    }, 100);
  }
}
