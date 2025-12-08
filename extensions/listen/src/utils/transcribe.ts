import {
  cleanupStatusFile,
  getStatusFilePath,
  startTranscription as swiftStartTranscription,
  stopTranscription as swiftStopTranscription,
} from "swift:../../swift/transcribe";
import { existsSync, readFileSync } from "fs";

export interface StreamEvent {
  type: "initializing" | "recording_started" | "partial" | "completed" | "error";
  text?: string;
  message?: string;
  timestamp: number;
}

export interface TranscriptionCallbacks {
  onRecordingStarted?: () => void;
  onPartialResult?: (text: string) => void;
  onCompleted?: (finalText: string) => void;
  onError?: (message: string) => void;
}

export interface TranscriptionOptions {
  locale: string;
  onDevice: boolean;
  callbacks?: TranscriptionCallbacks;
}

export interface TranscriptionSession {
  stop: () => Promise<void>;
}

/**
 * Start a streaming transcription session using file-based IPC
 */
export async function startTranscription(options: TranscriptionOptions): Promise<TranscriptionSession> {
  const { locale, onDevice, callbacks } = options;

  // Get the status file path
  const statusFilePath = await getStatusFilePath();
  let lastTimestamp = 0;
  let isRunning = true;
  let pollInterval: NodeJS.Timeout | null = null;

  // Clean up any existing status file
  await cleanupStatusFile();

  // Start watching the status file for changes
  const startWatching = () => {
    const checkFile = () => {
      if (!isRunning) return;

      try {
        if (existsSync(statusFilePath)) {
          const content = readFileSync(statusFilePath, "utf-8");
          const event = JSON.parse(content) as StreamEvent;

          // Only process new events
          if (event.timestamp > lastTimestamp) {
            lastTimestamp = event.timestamp;

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
                callbacks?.onCompleted?.(event.text || "");
                isRunning = false;
                break;

              case "error":
                callbacks?.onError?.(event.message || "Unknown error");
                isRunning = false;
                break;
            }
          }
        }
      } catch {
        // File might be being written, ignore parse errors
      }
    };

    // Poll the file every 100ms for changes
    pollInterval = setInterval(() => {
      if (!isRunning) {
        if (pollInterval) clearInterval(pollInterval);
        return;
      }
      checkFile();
    }, 100);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  };

  const stopPolling = startWatching();

  // Start the Swift transcription in background
  // Note: This will block until transcription completes
  const transcriptionPromise = swiftStartTranscription(3000, locale, onDevice);

  // Handle completion
  transcriptionPromise
    .then(() => {
      isRunning = false;
      stopPolling();
    })
    .catch((error) => {
      isRunning = false;
      stopPolling();
      callbacks?.onError?.(String(error));
    });

  return {
    stop: async () => {
      // Signal Swift to stop transcription
      await swiftStopTranscription();
      isRunning = false;
      stopPolling();
    },
  };
}

export interface StopRecordingOptions {
  session: TranscriptionSession | null;
  isRecording: boolean;
  transcriptionText: string;
  onStop: () => void;
  onShowActions: () => void;
}

/**
 * Stop recording and handle the post-stop flow
 */
export async function handleStopRecording(options: StopRecordingOptions): Promise<void> {
  const { session, isRecording, transcriptionText, onStop, onShowActions } = options;

  if (session && isRecording) {
    onStop();
    await session.stop();

    // Automatically show actions list after stopping
    setTimeout(() => {
      if (transcriptionText.trim()) {
        onShowActions();
      }
    }, 100);
  }
}

/**
 * Cleanup transcription resources - call this when component unmounts
 */
export async function cleanupTranscription(): Promise<void> {
  try {
    await swiftStopTranscription();
    await cleanupStatusFile();
  } catch {
    // Ignore cleanup errors
  }
}
