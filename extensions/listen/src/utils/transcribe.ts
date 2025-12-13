import {
  cleanupStatusFile,
  getStatusFilePath,
  startTranscription as swiftStartTranscription,
  stopTranscription as swiftStopTranscription,
} from "swift:../../swift/transcribe";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

export interface StreamEvent {
  type: "initializing" | "recording_started" | "partial" | "completed" | "error";
  text?: string;
  message?: string;
  timestamp: number;
  sessionId?: string;
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

  // Get file paths - derive mic ready path from status file path (same temp directory)
  const statusFilePath = await getStatusFilePath();
  const micReadyFilePath = join(dirname(statusFilePath), "raycast-listen-mic-ready");
  let lastTimestamp = 0;
  let currentSessionId: string | null = null;
  let isRunning = true;
  let pollInterval: NodeJS.Timeout | null = null;
  let recordingStartedCalled = false;

  // Clean up any existing status file
  await cleanupStatusFile();

  // Start watching the status file for changes
  const startWatching = () => {
    let lastEventType = "";

    const checkFile = () => {
      if (!isRunning) return;

      // Check for mic ready file - this is the reliable way to detect mic ready
      if (!recordingStartedCalled && existsSync(micReadyFilePath)) {
        recordingStartedCalled = true;
        callbacks?.onRecordingStarted?.();
      }

      try {
        if (existsSync(statusFilePath)) {
          const content = readFileSync(statusFilePath, "utf-8");
          const event = JSON.parse(content) as StreamEvent;

          // Capture session ID from any event that has it
          if (event.sessionId && !currentSessionId) {
            currentSessionId = event.sessionId;
          }

          // Ignore events from different sessions (only if we have a session ID set)
          if (currentSessionId && event.sessionId && event.sessionId !== currentSessionId) {
            return;
          }

          // Process new events based on timestamp OR event type change
          // This handles cases where timestamps might be very close
          const isNewEvent =
            event.timestamp > lastTimestamp || (event.timestamp === lastTimestamp && event.type !== lastEventType);

          if (isNewEvent) {
            lastTimestamp = event.timestamp;
            lastEventType = event.type;

            switch (event.type) {
              case "recording_started":
                if (!recordingStartedCalled) {
                  recordingStartedCalled = true;
                  callbacks?.onRecordingStarted?.();
                }
                break;

              case "partial":
                // If we receive partial results, the mic is definitely ready
                // This handles the case where recording_started event was missed
                if (!recordingStartedCalled) {
                  recordingStartedCalled = true;
                  callbacks?.onRecordingStarted?.();
                }
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
    // Call checkFile immediately, then start interval
    checkFile();
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
      // Wait for Swift process to detect the stop signal and terminate
      await new Promise((resolve) => setTimeout(resolve, 200));
      // Clean up IPC files
      await cleanupStatusFile();
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
    // Signal Swift to stop
    await swiftStopTranscription();
    // Wait for Swift process to detect the stop signal and terminate
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Now clean up the files
    await cleanupStatusFile();
  } catch {
    // Ignore cleanup errors
  }
}
