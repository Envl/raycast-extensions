declare module "swift:../../swift/transcribe" {
  export function startTranscription(duration?: number, locale?: string, onDevice?: boolean): Promise<string>;
  export function stopTranscription(): Promise<void>;
  export function getStatusFilePath(): Promise<string>;
  export function cleanupStatusFile(): Promise<void>;
}
