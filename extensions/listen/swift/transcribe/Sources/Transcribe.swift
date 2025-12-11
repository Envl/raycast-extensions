import AppKit
import Foundation
import RaycastSwiftMacros
import Speech

// MARK: - File-based IPC for real-time updates

class TranscriptionIPC {
    let statusFile: URL
    let stopFile: URL
    let sessionId: String

    init() {
        let tempDir = FileManager.default.temporaryDirectory
        statusFile = tempDir.appendingPathComponent("raycast-listen-status.json")
        stopFile = tempDir.appendingPathComponent("raycast-listen-stop")
        sessionId = UUID().uuidString
    }

    func writeStatus(_ dict: [String: Any]) {
        var statusDict = dict
        statusDict["sessionId"] = sessionId
        if let jsonData = try? JSONSerialization.data(withJSONObject: statusDict, options: [.prettyPrinted]) {
            try? jsonData.write(to: statusFile)
        }
    }

    func shouldStop() -> Bool {
        return FileManager.default.fileExists(atPath: stopFile.path)
    }

    func cleanup() {
        try? FileManager.default.removeItem(at: statusFile)
        try? FileManager.default.removeItem(at: stopFile)
    }

    func clearStopSignal() {
        try? FileManager.default.removeItem(at: stopFile)
    }
}

// MARK: - Speech Recognizer

class SpeechRecognizer: NSObject {
    private let speechRecognizer: SFSpeechRecognizer
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var transcriptionResult = ""
    private var accumulatedTranscription = ""
    private var lastTextLength = 0
    private var isFinished = false
    private let locale: Locale
    private let onDevice: Bool
    private var stopRequested = false
    private let ipc: TranscriptionIPC

    init(locale: String, onDevice: Bool, ipc: TranscriptionIPC) {
        self.locale = Locale(identifier: locale)
        self.onDevice = onDevice
        self.ipc = ipc
        guard let recognizer = SFSpeechRecognizer(locale: self.locale) else {
            fatalError("Speech recognizer not available for locale: \(locale)")
        }
        self.speechRecognizer = recognizer
        super.init()
    }

    func writeUpdate(type: String, text: String? = nil, message: String? = nil) {
        var dict: [String: Any] = [
            "type": type,
            "timestamp": Date().timeIntervalSince1970
        ]
        if let text = text {
            dict["text"] = text
        }
        if let message = message {
            dict["message"] = message
        }
        ipc.writeStatus(dict)
    }

    func requestPermissions(completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                completion(status == .authorized)
            }
        }
    }

    func startTranscribing(duration: TimeInterval) throws {
        let request = SFSpeechAudioBufferRecognitionRequest()
        recognitionRequest = request

        if onDevice && speechRecognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }

        request.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        writeUpdate(type: "recording_started")

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                let text = result.bestTranscription.formattedString

                if self.lastTextLength > 10 && text.count < self.lastTextLength / 2 {
                    if !self.transcriptionResult.isEmpty {
                        if self.accumulatedTranscription.isEmpty {
                            self.accumulatedTranscription = self.transcriptionResult
                        } else {
                            self.accumulatedTranscription += " " + self.transcriptionResult
                        }
                    }
                }

                self.lastTextLength = text.count
                self.transcriptionResult = text

                let fullText = self.accumulatedTranscription.isEmpty
                    ? text
                    : self.accumulatedTranscription + " " + text

                self.writeUpdate(type: "partial", text: fullText)
            }

            if let error = error {
                self.writeUpdate(type: "error", message: error.localizedDescription)
                self.stopTranscribing()
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            self?.stopTranscribing()
        }
    }

    func stopTranscribing() {
        guard !stopRequested else { return }
        stopRequested = true
        isFinished = true

        if audioEngine.isRunning {
            audioEngine.inputNode.removeTap(onBus: 0)
            audioEngine.stop()
            audioEngine.reset()
        }

        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil

        let finalText = accumulatedTranscription.isEmpty
            ? transcriptionResult
            : accumulatedTranscription + " " + transcriptionResult

        writeUpdate(type: "completed", text: finalText)
    }

    func isComplete() -> Bool {
        return isFinished
    }
}

// MARK: - Raycast Entry Points

/// Start streaming transcription. Updates are written to a temp file for real-time access.
/// Returns the path to the status file that TypeScript should watch.
@raycast func startTranscription(
    duration: Double = 3000.0,
    locale: String = "en-US",
    onDevice: Bool = false
) -> String {
    let ipc = TranscriptionIPC()
    let recognizer = SpeechRecognizer(locale: locale, onDevice: onDevice, ipc: ipc)

    // Clear any existing stop signal
    ipc.clearStopSignal()

    // Write initial status
    ipc.writeStatus([
        "type": "initializing",
        "timestamp": Date().timeIntervalSince1970
    ])

    recognizer.requestPermissions { granted in
        guard granted else {
            ipc.writeStatus([
                "type": "error",
                "message": "Permissions not granted. Please enable microphone and speech recognition in System Settings.",
                "timestamp": Date().timeIntervalSince1970
            ])
            exit(1)
        }

        do {
            try recognizer.startTranscribing(duration: duration)
        } catch {
            ipc.writeStatus([
                "type": "error",
                "message": "Error starting transcription: \(error.localizedDescription)",
                "timestamp": Date().timeIntervalSince1970
            ])
            exit(1)
        }
    }

    // Run loop to keep process alive until transcription completes
    // Also check for stop signal from TypeScript and parent process death
    let parentPID = getppid()

    // Set up stdin monitoring - when stdin closes, parent has died
    let stdinSource = DispatchSource.makeReadSource(fileDescriptor: STDIN_FILENO, queue: .global())
    var stdinClosed = false
    stdinSource.setEventHandler {
        // Check if stdin is closed (EOF)
        var buffer = [UInt8](repeating: 0, count: 1)
        let bytesRead = read(STDIN_FILENO, &buffer, 1)
        if bytesRead <= 0 {
            stdinClosed = true
            stdinSource.cancel()
        }
    }
    stdinSource.setCancelHandler {}
    stdinSource.resume()

    while !recognizer.isComplete() {
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))

        // Check if TypeScript requested stop
        if ipc.shouldStop() {
            recognizer.stopTranscribing()
            ipc.clearStopSignal()
            break
        }

        // Check if parent process died (becomes 1 on macOS when parent exits)
        if getppid() != parentPID || getppid() == 1 {
            recognizer.stopTranscribing()
            ipc.cleanup()
            break
        }

        // Check if stdin was closed (parent process terminated)
        if stdinClosed {
            recognizer.stopTranscribing()
            ipc.cleanup()
            break
        }
    }

    stdinSource.cancel()

    // Return the final transcription text
    return ipc.statusFile.path
}

/// Signal the transcription to stop
@raycast func stopTranscription() {
    let tempDir = FileManager.default.temporaryDirectory
    let stopFile = tempDir.appendingPathComponent("raycast-listen-stop")
    // Create the stop file to signal the transcription to stop
    // Use write to ensure file is created even if createFile fails
    do {
        try Data().write(to: stopFile)
    } catch {
        FileManager.default.createFile(atPath: stopFile.path, contents: Data(), attributes: nil)
    }
}

/// Get the path to the status file for watching
@raycast func getStatusFilePath() -> String {
    let tempDir = FileManager.default.temporaryDirectory
    return tempDir.appendingPathComponent("raycast-listen-status.json").path
}

/// Clean up the status file
@raycast func cleanupStatusFile() {
    let tempDir = FileManager.default.temporaryDirectory
    let statusFile = tempDir.appendingPathComponent("raycast-listen-status.json")
    let stopFile = tempDir.appendingPathComponent("raycast-listen-stop")
    try? FileManager.default.removeItem(at: statusFile)
    try? FileManager.default.removeItem(at: stopFile)
}
