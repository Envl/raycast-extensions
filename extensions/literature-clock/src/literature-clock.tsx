import { Clipboard, MenuBarExtra, showToast, Toast, updateCommandMetadata } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useEffect } from "react";
import {
  getRandomQuoteForCurrentTime,
  getTimeText,
  stripHtmlTags,
  splitQuoteIntoLines,
  type LiteratureClockEntry,
} from "./utils";

export default function Command() {
  const [currentQuote, setCurrentQuote] = useCachedState<LiteratureClockEntry | null>("lit-clock-current-quote", null);

  useEffect(() => {
    // Update quote immediately
    const updateQuote = () => {
      const quote = getRandomQuoteForCurrentTime();
      setCurrentQuote(quote);
      updateCommandMetadata({
        subtitle: quote?.quote ?? "No quote available for this time",
      });
    };

    updateQuote();
  }, []);

  if (!currentQuote) {
    return (
      <MenuBarExtra tooltip="Loading..." title="⏰">
        <MenuBarExtra.Item title={getTimeText()} />
      </MenuBarExtra>
    );
  }

  const { author, quote, title, time, timeString } = currentQuote;
  const cleanQuote = stripHtmlTags(quote);
  const quoteLines = splitQuoteIntoLines(cleanQuote);

  return (
    <MenuBarExtra tooltip={`${title} by ${author}`} title={timeString || time || "⏰"}>
      <MenuBarExtra.Section title={`${time} - ${title}`}>
        {quoteLines.map((line, index) => (
          <MenuBarExtra.Item key={index} title={`"${line}${index === quoteLines.length - 1 ? '"' : ""}`} />
        ))}
        <MenuBarExtra.Item title={`— ${author}`} />
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Copy Quote"
          onAction={() => {
            Clipboard.copy(cleanQuote);
            showToast(Toast.Style.Success, "Quote copied to clipboard");
          }}
        />
        <MenuBarExtra.Item
          title="Copy Citation"
          onAction={() => {
            Clipboard.copy(`"${cleanQuote}" — ${author}, ${title}`);
            showToast(Toast.Style.Success, "Citation copied to clipboard");
          }}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
