#!/usr/bin/env swift

import Foundation
import Speech
import AVFoundation

class SpeechRecognizer: NSObject {
    private let speech_recognizer: SFSpeechRecognizer
    private let audio_engine = AVAudioEngine()
    private var recognition_request: SFSpeechAudioBufferRecognitionRequest?
    private var recognition_task: SFSpeechRecognitionTask?
    private var transcription_result = ""
    private var accumulated_transcription = ""
    private var last_text_length = 0
    private var is_finished = false
    private let stream_mode: Bool
    private var stop_requested = false

    init(locale: String, streamMode: Bool = false) {
        // Initialize with specified locale
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) else {
            fatalError("Speech recognizer not available for locale: \(locale)")
        }

        self.speech_recognizer = recognizer
        self.stream_mode = streamMode
        super.init()
    }

    func request_permissions(completion: @escaping (Bool) -> Void) {
        // Request speech recognition authorization
        SFSpeechRecognizer.requestAuthorization { auth_status in
            DispatchQueue.main.async {
                switch auth_status {
                case .authorized:
                    // On macOS, microphone permission is handled automatically by AVAudioEngine
                    // when it starts. Just return true if speech recognition is authorized.
                    completion(true)
                case .denied, .restricted, .notDetermined:
                    completion(false)
                @unknown default:
                    completion(false)
                }
            }
        }
    }

    func output_json(_ json: [String: Any]) {
        if let json_data = try? JSONSerialization.data(withJSONObject: json, options: []),
           let json_string = String(data: json_data, encoding: .utf8) {
            print(json_string)
            fflush(stdout)
        }
    }

    func start_transcribing(duration: TimeInterval, use_on_device: Bool) throws {
        fputs("[SWIFT LOG] ========== TRANSCRIPTION STARTED ==========\n", stderr)
        fputs("[SWIFT LOG] Duration: \(duration)s\n", stderr)
        fputs("[SWIFT LOG] Use on-device requested: \(use_on_device)\n", stderr)
        fputs("[SWIFT LOG] Stream mode: \(stream_mode)\n", stderr)
        fputs("[SWIFT LOG] Locale: \(speech_recognizer.locale.identifier)\n", stderr)
        fflush(stderr)

        // Cancel any existing task
        if let task = recognition_task {
            task.cancel()
            recognition_task = nil
        }

        // On macOS, no audio session configuration is needed
        // AVAudioEngine handles microphone access automatically

        // Create recognition request
        recognition_request = SFSpeechAudioBufferRecognitionRequest()
        guard let recognition_request = recognition_request else {
            throw NSError(domain: "SpeechRecognizer", code: -1, userInfo: [NSLocalizedDescriptionKey: "Unable to create recognition request"])
        }

        // Enable on-device recognition if requested and supported
        if use_on_device {
            if speech_recognizer.supportsOnDeviceRecognition {
                recognition_request.requiresOnDeviceRecognition = true
                fputs("[SWIFT LOG] ✓ On-device recognition ENABLED and SUPPORTED\n", stderr)
                fflush(stderr)
            } else {
                fputs("[SWIFT LOG] ✗ On-device recognition NOT SUPPORTED, falling back to server\n", stderr)
                fflush(stderr)
                if !stream_mode {
                    fputs("Warning: On-device recognition not supported, falling back to server\n", stderr)
                }
            }
        } else {
            fputs("[SWIFT LOG] Using SERVER-BASED recognition (on-device not requested)\n", stderr)
            fflush(stderr)
        }

        // Configure for real-time results
        recognition_request.shouldReportPartialResults = true

        // Get audio input node
        let input_node = audio_engine.inputNode
        let recording_format = input_node.outputFormat(forBus: 0)

        // Install tap on audio engine
        input_node.installTap(onBus: 0, bufferSize: 1024, format: recording_format) { buffer, _ in
            recognition_request.append(buffer)
        }

        // Prepare and start audio engine
        audio_engine.prepare()
        try audio_engine.start()

        fputs("[SWIFT LOG] Audio engine started successfully\n", stderr)
        fflush(stderr)

        // Output recording started event in stream mode
        if stream_mode {
            output_json([
                "type": "recording_started",
                "duration": duration,
                "timestamp": Date().timeIntervalSince1970
            ])
        }

        // Start recognition task
        recognition_task = speech_recognizer.recognitionTask(with: recognition_request) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                let text = result.bestTranscription.formattedString
                let segmentCount = result.bestTranscription.segments.count

                // Log recognition info on first result
                if self.last_text_length == 0 {
                    fputs("[SWIFT LOG] First recognition result received\n", stderr)
                    fputs("[SWIFT LOG] Is final: \(result.isFinal)\n", stderr)
                    fflush(stderr)
                }

                // Detect if this is a new utterance (text got significantly shorter)
                // This happens when user pauses and the recognizer restarts
                if self.last_text_length > 10 && text.count < self.last_text_length / 2 {
                    // Save the previous transcription before it's replaced
                    if !self.transcription_result.isEmpty {
                        if self.accumulated_transcription.isEmpty {
                            self.accumulated_transcription = self.transcription_result
                        } else {
                            self.accumulated_transcription += " " + self.transcription_result
                        }
                    }
                }

                self.last_text_length = text.count
                self.transcription_result = text

                // Combine accumulated text with current text for display
                let full_text = self.accumulated_transcription.isEmpty ? text : self.accumulated_transcription + " " + text

                // Output partial result in stream mode
                if self.stream_mode {
                    self.output_json([
                        "type": "partial",
                        "text": full_text,
                        "segmentCount": segmentCount,
                        "timestamp": Date().timeIntervalSince1970
                    ])
                }
            }

            if let error = error {
                if self.stream_mode {
                    self.output_json([
                        "type": "error",
                        "message": error.localizedDescription,
                        "timestamp": Date().timeIntervalSince1970
                    ])
                } else {
                    fputs("Recognition error: \(error.localizedDescription)\n", stderr)
                }
                self.stop_transcribing()
            }
        }

        // Set up timer to stop after duration as a safety net
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            self?.stop_transcribing()
        }
    }

    func stop_transcribing() {
        if stop_requested {
            return
        }

        fputs("[SWIFT LOG] Stopping transcription...\n", stderr)
        fflush(stderr)

        stop_requested = true

        // Stop audio engine and remove tap if running
        if audio_engine.isRunning {
            audio_engine.inputNode.removeTap(onBus: 0)
            audio_engine.stop()
            audio_engine.reset()
        }

        // End the recognition request and cancel the task
        recognition_request?.endAudio()
        recognition_request = nil

        recognition_task?.cancel()
        recognition_task = nil

        // Mark as finished so the run loop exits
        is_finished = true

        // Emit a final completion event in stream mode
        if stream_mode {
            output_json([
                "type": "completed",
                "timestamp": Date().timeIntervalSince1970
            ])
        }
    }

    func get_result() -> String {
        // Return the full accumulated text
        let full_text = accumulated_transcription.isEmpty ? transcription_result : accumulated_transcription + " " + transcription_result
        return full_text
    }

    func is_complete() -> Bool {
        return is_finished
    }
}

// MARK: - Main Execution

func print_usage() {
    print("""
    Usage: transcribe [OPTIONS]

    Options:
        -d, --duration <seconds>    Duration to record (default: 5)
        -o, --on-device             Use on-device recognition only (more private, some languages)
        -l, --locale <code>         Locale code (default: en-US)
        -s, --stream                Enable streaming mode (outputs real-time partial results)
        -h, --help                  Show this help message

    Examples:
        transcribe -d 10                    # Record for 10 seconds
        transcribe -d 5 --on-device         # 5 seconds, on-device only
        transcribe -l es-ES -d 8            # Spanish, 8 seconds
        transcribe -d 10 --stream           # Real-time streaming transcription
    """)
}

func parse_arguments() -> (duration: TimeInterval, on_device: Bool, locale: String, stream: Bool) {
    var duration: TimeInterval = 5.0
    var on_device = false
    var locale = "en-US"
    var stream = false

    let args = CommandLine.arguments
    var i = 1

    while i < args.count {
        let arg = args[i]

        switch arg {
        case "-h", "--help":
            print_usage()
            exit(0)
        case "-d", "--duration":
            if i + 1 < args.count {
                i += 1
                if let value = TimeInterval(args[i]) {
                    duration = value
                } else {
                    fputs("Error: Invalid duration value\n", stderr)
                    exit(1)
                }
            }
        case "-o", "--on-device":
            on_device = true
        case "-l", "--locale":
            if i + 1 < args.count {
                i += 1
                locale = args[i]
            }
        case "-s", "--stream":
            stream = true
        default:
            fputs("Error: Unknown option '\(arg)'\n", stderr)
            print_usage()
            exit(1)
        }

        i += 1
    }

    return (duration, on_device, locale, stream)
}

// Main program
let (duration, use_on_device, locale_code, stream_mode) = parse_arguments()
let recognizer = SpeechRecognizer(locale: locale_code, streamMode: stream_mode)

// Listen for STOP command on stdin to allow early termination without signals
DispatchQueue.global(qos: .background).async {
    while true {
        if let line = readLine(strippingNewline: true) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            fputs("[DEBUG] stdin line: '\(trimmed)'\n", stderr)
            fflush(stderr)

            if trimmed.uppercased() == "STOP" {
                fputs("[DEBUG] STOP command received, calling stop_transcribing()\n", stderr)
                fflush(stderr)
                recognizer.stop_transcribing()
                break
            }
        } else {
            // EOF on stdin, nothing more to read
            fputs("[DEBUG] stdin EOF, stopping stdin listener\n", stderr)
            fflush(stderr)
            break
        }
    }
}

if !stream_mode {
    print("Requesting permissions...", terminator: "")
    fflush(stdout)
}

recognizer.request_permissions { granted in
    if !granted {
        if stream_mode {
            recognizer.output_json([
                "type": "error",
                "message": "Permissions not granted. Please enable microphone and speech recognition in System Settings.",
                "timestamp": Date().timeIntervalSince1970
            ])
        } else {
            print("\nError: Permissions not granted. Please enable microphone and speech recognition in System Settings.")
        }
        exit(1)
    }

    if !stream_mode {
        print(" granted!")
        print("Recording for \(Int(duration)) seconds...")
        print("Speak now!")
    }

    do {
        try recognizer.start_transcribing(duration: duration, use_on_device: use_on_device)
    } catch {
        if stream_mode {
            recognizer.output_json([
                "type": "error",
                "message": "Error starting transcription: \(error.localizedDescription)",
                "timestamp": Date().timeIntervalSince1970
            ])
        } else {
            print("Error starting transcription: \(error.localizedDescription)")
        }
        exit(1)
    }
}

// Run loop to keep the program alive
while !recognizer.is_complete() {
    RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))
}

fputs("[DEBUG] Run loop exited, recognizer is_complete == true\n", stderr)
fflush(stderr)

// Output result in non-stream mode
if !stream_mode {
    let result = recognizer.get_result()
    let json_output: [String: Any] = [
        "success": true,
        "transcription": result,
        "duration": duration,
        "on_device": use_on_device,
        "locale": locale_code
    ]

    if let json_data = try? JSONSerialization.data(withJSONObject: json_output, options: .prettyPrinted),
       let json_string = String(data: json_data, encoding: .utf8) {
        print("\n--- TRANSCRIPTION RESULT ---")
        print(json_string)
    } else {
        print("Error: Could not serialize result to JSON")
        exit(1)
    }
}

exit(0)
