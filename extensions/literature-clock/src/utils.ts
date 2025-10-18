import fs from "fs";
import path from "path";

export interface LiteratureClockEntry {
  time: string;
  timeString: string;
  quote: string;
  title: string;
  author: string;
  rating: "sfw" | "nsfw" | "unknown";
}

/**
 * Extracts literature clock entries from the CSV file for the current time
 * @param customTime Optional custom time in HH:MM format (24-hour). If not provided, uses current time.
 * @returns Array of literature clock entries matching the time
 */
export function getLiteratureQuotesForCurrentTime(customTime?: string): LiteratureClockEntry[] {
  // Get current time in HH:MM format
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const currentTime = customTime || `${hours}:${minutes}`;

  // Read the CSV file
  const csvPath = path.join(__dirname, "./assets/litclock_annotated.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");

  // Parse CSV and filter by time
  const lines = csvContent.split("\n");
  const entries: LiteratureClockEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Split by pipe character (|)
    const parts = line.split("|");
    if (parts.length < 6) continue;

    const [time, timeString, quote, title, author, rating] = parts;

    // Check if this entry matches the current time
    if (time === currentTime) {
      entries.push({
        time,
        timeString,
        quote,
        title,
        author,
        rating: rating.trim() as "sfw" | "nsfw" | "unknown",
      });
    }
  }

  return entries;
}

/**
 * Gets a random literature quote for the current time
 * @param customTime Optional custom time in HH:MM format (24-hour). If not provided, uses current time.
 * @returns A random literature clock entry for the time, or null if none found
 */
export function getRandomQuoteForCurrentTime(customTime?: string): LiteratureClockEntry | null {
  const entries = getLiteratureQuotesForCurrentTime(customTime);
  if (entries.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * entries.length);
  return entries[randomIndex];
}

export function getTimeText(date?: Date): string {
  const now = date || new Date();

  return now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
