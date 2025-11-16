# Listen

Real-time speech transcription and AI refinement using macOS native Speech Recognition API.

## Overview

Listen transforms your spoken words into polished text instantly. Speak naturally, see your words appear in real-time, and optionally refine them with AI - all without leaving Raycast.

Perfect for:

- Dictating emails, messages, or documents
- Capturing quick voice notes and ideas
- Transcribing meeting notes or brainstorming sessions
- Creating content hands-free

## Features

### 🎤 Real-Time Transcription

Watch your words appear as you speak with live transcription powered by Apple's native Speech Recognition API.

### ✨ AI Refinement (Raycast Pro)

Automatically polish your transcriptions with AI. Fixes grammar, punctuation, and formatting while preserving your meaning.

### 🔒 Privacy-First Options

Choose between:

- **On-device processing** - Your voice never leaves your Mac
- **Server-based** - More accurate recognition using Apple's servers

### 🌍 Multi-Language Support

Supports 15 languages including:

- English (US, UK, Australia)
- Spanish (Spain, Mexico)
- French, German, Italian
- Japanese, Korean, Chinese (Simplified & Traditional)
- Portuguese (Brazil), Russian, Dutch

### ⚡ Quick Actions

- **Paste** - Insert transcription directly into any app
- **Copy** - Save to clipboard for later use
- **Refine** - Improve text with AI on demand
- **Discard** - Start over without saving

## How to Use

1. Launch the **Listen** command in Raycast
2. Start speaking when you see "Listening..."
3. Watch your words appear in real-time
4. Press the **Stop Recording** action when finished
5. Choose to paste original text, refine with AI, or discard

### Keyboard Shortcuts

- `⌘ C` - Copy transcription
- `⌘ R` - Refine again with AI (after initial refinement)

## Setup

### Permissions Required

On first launch, macOS will request:

- **Microphone access** - Required to capture audio
- **Speech Recognition** - Required to transcribe speech

Grant both permissions in System Settings > Privacy & Security.

### Preferences

Configure default behavior in Raycast preferences:

**Language**
Choose your preferred speech recognition language (default: English US)

**On-Device Recognition Only**
Enable to keep all processing on your Mac for maximum privacy.

**Auto-Refine with AI**
Automatically refine transcriptions when you stop recording. Requires Raycast Pro for AI features.

## Tips

- Speak clearly and at a natural pace for best results
- Use server-based recognition for higher accuracy
- On-device mode provides better privacy but may be less accurate
- AI refinement works best for longer transcriptions (full sentences or paragraphs)
- You can override language and recognition mode when launching the command

## Requirements

- macOS (uses native Apple Speech Recognition framework)
- Microphone access permission
- Optional: Raycast Pro subscription (for AI refinement features only)

## Privacy

Your privacy is important:

- **On-device mode**: Audio processing happens entirely on your Mac. Nothing is sent to external servers.
- **Server-based mode**: Audio is sent to Apple's servers for recognition, following Apple's privacy policy.
- **AI refinement**: Text is sent to the AI provider configured in Raycast (requires Raycast Pro).

## Troubleshooting

**"Permissions not granted" error**
Go to System Settings > Privacy & Security and enable Microphone and Speech Recognition for Raycast.

**"Speech recognizer not available" error**
The selected language may not support on-device recognition. Try disabling "On-Device Recognition Only" in preferences.

**No transcription appears**
Ensure your microphone is working and not muted. Check microphone input level in System Settings > Sound.

**AI refinement unavailable**
AI features require a Raycast Pro subscription. Upgrade at raycast.com.

## License

MIT
