import { spawn } from "child_process";
import { environment } from "@raycast/api";
import { join } from "path";

export interface TranscriptionResult {
  success: boolean;
  transcription: string;
  duration: number;
  on_device: boolean;
  locale: string;
}

export interface TranscriptionOptions {
  duration: number;
  onDevice: boolean;
  locale: string;
  stream?: boolean;
}

export interface TranscriptionProgress {
  status: "starting" | "recording" | "processing" | "completed" | "error";
  message: string;
}

export interface StreamEvent {
  type: "recording_started" | "partial" | "completed" | "error";
  text?: string;
  message?: string;
  duration?: number;
  timestamp: number;
}

export interface StreamCallbacks {
  onPartialResult?: (text: string) => void;
  onError?: (error: string) => void;
  onComplete?: (text: string) => void;
}

/**
 * Transcribe audio from the microphone using macOS native Speech Recognition API
 */
export async function transcribeMicrophone(
  options: TranscriptionOptions,
  onProgress?: (progress: TranscriptionProgress) => void,
): Promise<TranscriptionResult> {
  const { duration, onDevice, locale } = options;

  // Path to the bundled Swift executable
  const binaryPath = join(environment.assetsPath, "transcribe");

  // Build arguments
  const args: string[] = ["-d", duration.toString(), "-l", locale];

  if (onDevice) {
    args.push("-o");
  }

  return new Promise((resolve, reject) => {
    let stderrData = "";
    let jsonCapture = false;
    let jsonText = "";

    onProgress?.({ status: "starting", message: "Initializing transcription..." });

    const process = spawn(binaryPath, args);

    process.stdout.on("data", (data) => {
      const text = data.toString();

      // Look for status messages
      if (text.includes("Requesting permissions")) {
        onProgress?.({ status: "starting", message: "Requesting permissions..." });
      } else if (text.includes("Recording for")) {
        onProgress?.({ status: "recording", message: `Recording for ${duration} seconds...` });
      }

      // Look for JSON output (starts after "--- TRANSCRIPTION RESULT ---")
      if (text.includes("--- TRANSCRIPTION RESULT ---")) {
        jsonCapture = true;
        onProgress?.({ status: "processing", message: "Processing transcription..." });
        // Capture everything after the marker in this chunk
        const markerIndex = text.indexOf("--- TRANSCRIPTION RESULT ---");
        const afterMarker = text.substring(markerIndex + "--- TRANSCRIPTION RESULT ---".length);
        jsonText += afterMarker;
      } else if (jsonCapture) {
        jsonText += text;
      }
    });

    process.stderr.on("data", (data) => {
      const text = data.toString();
      stderrData += text;

      // Log Swift output to console for debugging
      console.log("[Swift stderr]:", text);

      // Look for JSON output in stderr too (Swift outputs to stderr)
      if (text.includes("--- TRANSCRIPTION RESULT ---")) {
        jsonCapture = true;
        onProgress?.({ status: "processing", message: "Processing transcription..." });
        // Capture everything after the marker in this chunk
        const markerIndex = text.indexOf("--- TRANSCRIPTION RESULT ---");
        const afterMarker = text.substring(markerIndex + "--- TRANSCRIPTION RESULT ---".length);
        jsonText += afterMarker;
      } else if (jsonCapture) {
        jsonText += text;
      }
    });

    process.on("error", (error) => {
      onProgress?.({ status: "error", message: error.message });
      reject(new Error(`Failed to start transcription process: ${error.message}`));
    });

    process.on("close", (code) => {
      if (code !== 0) {
        const errorMessage = stderrData || `Process exited with code ${code}`;
        onProgress?.({ status: "error", message: errorMessage });
        reject(new Error(`Transcription failed: ${errorMessage}`));
        return;
      }

      try {
        // Parse the JSON result
        console.log("transcribe result", jsonText);
        const result = JSON.parse(jsonText.trim()) as TranscriptionResult;
        onProgress?.({ status: "completed", message: "Transcription completed!" });
        resolve(result);
      } catch (error) {
        const errorMessage = `Failed to parse transcription result: ${error instanceof Error ? error.message : "Unknown error"}`;
        onProgress?.({ status: "error", message: errorMessage });
        reject(new Error(errorMessage));
      }
    });
  });
}

/**
 * Check if the system supports transcription
 */
export function isTranscriptionSupported(): boolean {
  return process.platform === "darwin";
}

/**
 * Transcribe audio with real-time streaming results
 */
export async function transcribeMicrophoneStream(
  options: TranscriptionOptions,
  callbacks: StreamCallbacks,
): Promise<TranscriptionResult> {
  const { duration, onDevice, locale } = options;

  // Path to the bundled Swift executable
  const binaryPath = join(environment.assetsPath, "transcribe");

  // Build arguments with streaming enabled
  const args: string[] = ["-d", duration.toString(), "-l", locale, "-s"];

  if (onDevice) {
    args.push("-o");
  }

  return new Promise((resolve, reject) => {
    let lastText = "";
    let buffer = "";

    const process = spawn(binaryPath, args);

    process.stdout.on("data", (data) => {
      buffer += data.toString();

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line) as StreamEvent;

          switch (event.type) {
            case "recording_started":
              // Recording has started
              break;

            case "partial":
              if (event.text) {
                lastText = event.text;
                callbacks.onPartialResult?.(event.text);
              }
              break;

            case "completed":
              if (event.text) {
                lastText = event.text;
              }
              callbacks.onComplete?.(lastText);
              break;

            case "error": {
              const errorMsg = event.message || "Unknown error";
              callbacks.onError?.(errorMsg);
              reject(new Error(errorMsg));
              return;
            }
          }
        } catch (error) {
          console.error("Failed to parse stream event:", line, error);
        }
      }
    });

    process.stderr.on("data", (data) => {
      const errorMsg = data.toString();
      // Log Swift output to console for debugging
      console.log("[Swift stderr (stream)]:", errorMsg);
    });

    process.on("error", (error) => {
      const errorMsg = `Failed to start transcription process: ${error.message}`;
      callbacks.onError?.(errorMsg);
      reject(new Error(errorMsg));
    });

    process.on("close", (code) => {
      if (code !== 0) {
        const errorMsg = `Process exited with code ${code}`;
        callbacks.onError?.(errorMsg);
        reject(new Error(errorMsg));
        return;
      }

      // Return the final result
      resolve({
        success: true,
        transcription: lastText,
        duration,
        on_device: onDevice,
        locale,
      });
    });
  });
}

/**
 * Get a user-friendly error message for common transcription errors
 */
export function getErrorMessage(error: unknown): string {
  const errorStr = error instanceof Error ? error.message : String(error);

  if (errorStr.includes("Permissions not granted")) {
    return "Microphone or Speech Recognition permissions not granted. Please enable them in System Settings.";
  }

  if (errorStr.includes("Speech recognizer not available")) {
    return "Speech recognizer not available for the selected language. Try using English (US).";
  }

  if (errorStr.includes("Failed to start transcription process")) {
    return "Failed to start transcription. Make sure the binary is compiled correctly.";
  }

  return errorStr;
}
