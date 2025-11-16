#!/bin/bash
set -e

echo "🔨 Building universal binary for macOS native transcription..."

# Check for Swift compiler
if ! command -v swiftc &> /dev/null; then
    echo "❌ Error: Swift compiler not found"
    echo "Please install Xcode Command Line Tools:"
    echo "  xcode-select --install"
    exit 1
fi

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create build directory
mkdir -p ../assets

# Compile for both architectures
echo "📦 Compiling for arm64 (Apple Silicon)..."
swiftc -o transcribe-arm64 main.swift \
    -target arm64-apple-macos11 \
    -framework Speech \
    -framework AVFoundation \
    -framework Foundation

echo "📦 Compiling for x86_64 (Intel)..."
swiftc -o transcribe-x86_64 main.swift \
    -target x86_64-apple-macos11 \
    -framework Speech \
    -framework AVFoundation \
    -framework Foundation

# Create universal binary using lipo
echo "🔗 Creating universal binary..."
lipo -create transcribe-arm64 transcribe-x86_64 -output ../assets/transcribe

# Make it executable
chmod +x ../assets/transcribe

# Clean up temporary binaries
rm transcribe-arm64 transcribe-x86_64

echo "✅ Universal binary created successfully: ../assets/transcribe"

# Show file info
echo ""
echo "Binary info:"
file ../assets/transcribe
echo ""
echo "Size: $(du -h ../assets/transcribe | cut -f1)"
