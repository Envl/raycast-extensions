# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Literature Clock** is a Raycast extension that displays the current time alongside a randomly selected literary quote that references that specific time of day. The quotes are sourced from the [literature-clock project](https://github.com/JohannesNE/literature-clock/) by Johannes.

The extension runs as a menu-bar command that updates approximately every minute, showing the time and a relevant literary quote from a curated CSV dataset.

## Architecture & Key Components

### Core Structure

The application has a simple architecture with two main files:

1. **`src/literature-clock.tsx`** - The main Raycast command component
   - Uses `MenuBarExtra` to display the extension in the menu bar
   - Manages quote state with `useCachedState` to persist quotes across updates
   - Displays quote text, author, title, and provides actions to copy quote or full citation
   - Updates command metadata to show the quote in the subtitle

2. **`src/utils.ts`** - Utility functions for data processing
   - `getLiteratureQuotesForCurrentTime()`: Reads the CSV file and returns all quotes matching the current time (or a custom time for testing)
   - `getRandomQuoteForCurrentTime()`: Returns a random quote from the matching entries
   - `getTimeText()`: Formats the current time for display

### Data Source

- **`assets/litclock_annotated.csv`** - CSV file containing ~10,000 literary quotes
  - Format: `time|timeString|quote|title|author|rating` (pipe-delimited)
  - `time` field: 24-hour format (HH:MM)
  - `rating`: "sfw", "nsfw", or "unknown"
  - The data is loaded at runtime and parsed line-by-line to find matching quotes

### Key Data Types

The `LiteratureClockEntry` interface (`src/utils.ts`) defines the quote structure:
```typescript
interface LiteratureClockEntry {
  time: string;              // HH:MM format
  timeString: string;        // Human-readable time reference
  quote: string;             // The actual quote text
  title: string;             // Book title
  author: string;            // Author name
  rating: "sfw" | "nsfw" | "unknown";
}
```

## Development Commands

```bash
npm run dev           # Start development mode (live reload)
npm run build         # Build the extension for distribution
npm run lint          # Check code with ESLint
npm run fix-lint      # Automatically fix linting issues
npm run publish       # Publish to Raycast Store
```

## Code Style

- **ESLint**: Uses `@raycast/eslint-config` (see `eslint.config.js`)
- **Prettier**: Configured in `.prettierrc` with:
  - `printWidth: 120`
  - `singleQuote: false`

## Important Notes

- The CSV file is read synchronously at runtime, so adding filtering for rating (sfw/nsfw) could improve performance
- The extension updates on a 1-minute interval as defined in `package.json` commands config
- Quotes are cached using `@raycast/utils`'s `useCachedState` to avoid redundant CSV parsing within the cache window
