import { Detail, getPreferenceValues, type LaunchProps, LocalStorage } from "@raycast/api";
import { useEffect, useState } from "react";
import { VoiceCommandView } from "./components/VoiceCommandView";
import type { AIModelPreference } from "./utils/ai";

interface Arguments {
  locale?: string;
  recognitionMode?: string;
}

interface Preferences {
  locale: string;
  onDeviceOnly: boolean;
  aiModel: AIModelPreference;
}

const LAST_LOCALE_KEY = "lastUsedLocale";

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const preferences = getPreferenceValues<Preferences>();
  const [locale, setLocale] = useState<string | null>(null);

  const onDevice = props.arguments.recognitionMode
    ? props.arguments.recognitionMode !== "server"
    : preferences.onDeviceOnly;

  // Load last used locale on mount
  useEffect(() => {
    async function loadLocale() {
      // If locale is provided via arguments, use it and save it
      if (props.arguments.locale) {
        setLocale(props.arguments.locale);
        await LocalStorage.setItem(LAST_LOCALE_KEY, props.arguments.locale);
        return;
      }

      // Try to get last used locale from storage
      const lastLocale = await LocalStorage.getItem<string>(LAST_LOCALE_KEY);
      if (lastLocale) {
        setLocale(lastLocale);
      } else {
        // Fall back to preferences
        setLocale(preferences.locale);
      }
    }
    loadLocale();
  }, [props.arguments.locale, preferences.locale]);

  // Don't render until we have the locale
  if (!locale) {
    return <Detail isLoading />;
  }

  return (
    <VoiceCommandView
      locale={locale}
      onDevice={onDevice}
      aiModel={preferences.aiModel}
      onLocaleUsed={async (usedLocale) => {
        await LocalStorage.setItem(LAST_LOCALE_KEY, usedLocale);
      }}
    />
  );
}
