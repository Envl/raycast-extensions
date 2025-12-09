import { Action, ActionPanel, AI, Clipboard, environment, Icon, List, popToRoot, showToast, Toast } from "@raycast/api";
import { useRef, useState } from "react";
import { type AIModelPreference, refineTranscription, translateText } from "../utils/ai";
import { useProductionSafeMount } from "../utils/use-production-safe-mount";

// MARK: - Constants

const COMMON_LANGUAGES = [
  { name: "English", code: "English" },
  { name: "Chinese (Simplified)", code: "Simplified Chinese" },
  { name: "Chinese (Traditional)", code: "Traditional Chinese" },
  { name: "Japanese", code: "Japanese" },
  { name: "Korean", code: "Korean" },
  { name: "Spanish", code: "Spanish" },
  { name: "French", code: "French" },
  { name: "German", code: "German" },
  { name: "Dutch", code: "Dutch" },
  { name: "Italian", code: "Italian" },
  { name: "Portuguese", code: "Portuguese" },
  { name: "Russian", code: "Russian" },
  { name: "Arabic", code: "Arabic" },
  { name: "Hindi", code: "Hindi" },
];

const MODEL_DISPLAY_NAMES: Record<AIModelPreference, string> = {
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gpt5-mini": "GPT-5 Mini",
  "claude-haiku": "Claude Haiku",
};

const ALL_MODELS: AIModelPreference[] = ["gemini-2.0-flash", "gemini-2.5-flash", "gpt5-mini", "claude-haiku"];

// MARK: - Shared Types

interface TranscriptionMetadataProps {
  locale: string;
  onDevice: boolean;
  wordCount?: number;
  charCount?: number;
  typeLabel?: string;
  sourceLabel?: string;
  modelLabel?: string;
}

// MARK: - Shared Metadata Component

function TranscriptionMetadata({
  locale,
  onDevice,
  wordCount,
  charCount,
  typeLabel,
  sourceLabel,
  modelLabel,
}: TranscriptionMetadataProps) {
  return (
    <List.Item.Detail.Metadata>
      {typeLabel && <List.Item.Detail.Metadata.Label title="Type" text={typeLabel} />}
      {sourceLabel && <List.Item.Detail.Metadata.Label title="Source" text={sourceLabel} />}
      {modelLabel && <List.Item.Detail.Metadata.Label title="Model" text={modelLabel} />}
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Language" text={locale.toUpperCase()} />
      <List.Item.Detail.Metadata.Label title="Recognition" text={onDevice ? "On-device" : "Server-based"} />
      {(wordCount !== undefined || charCount !== undefined) && (
        <>
          <List.Item.Detail.Metadata.Separator />
          {wordCount !== undefined && <List.Item.Detail.Metadata.Label title="Words" text={wordCount.toString()} />}
          {charCount !== undefined && (
            <List.Item.Detail.Metadata.Label title="Characters" text={charCount.toString()} />
          )}
        </>
      )}
    </List.Item.Detail.Metadata>
  );
}

// MARK: - Original Text Item

interface OriginalTextItemProps {
  transcriptionText: string;
  locale: string;
  onDevice: boolean;
  wordCount: number;
  charCount: number;
  onPaste: () => Promise<void>;
  onCopy: () => Promise<void>;
}

function OriginalTextItem({
  transcriptionText,
  locale,
  onDevice,
  wordCount,
  charCount,
  onPaste,
  onCopy,
}: OriginalTextItemProps) {
  return (
    <List.Item
      id="original-text"
      title="Original Text"
      icon={Icon.Text}
      subtitle="Paste original transcription"
      detail={
        <List.Item.Detail
          markdown={transcriptionText}
          metadata={
            <TranscriptionMetadata
              locale={locale}
              onDevice={onDevice}
              wordCount={wordCount}
              charCount={charCount}
              typeLabel="Original"
            />
          }
        />
      }
      actions={
        <ActionPanel>
          <Action title="Paste Original Text" icon={Icon.Clipboard} onAction={onPaste} />
          <Action
            title="Copy Original Text"
            icon={Icon.CopyClipboard}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
            onAction={onCopy}
          />
        </ActionPanel>
      }
    />
  );
}

// MARK: - Refined Text Item

interface RefinedTextItemProps {
  transcriptionText: string;
  refinedText: string;
  isRefining: boolean;
  isRefined: boolean;
  locale: string;
  onDevice: boolean;
  wordCount: number;
  charCount: number;
  model: AIModelPreference;
  onRefine: () => Promise<void>;
  onPaste: () => Promise<void>;
  onCopy: () => Promise<void>;
  onChangeModel: (model: AIModelPreference) => void;
}

function RefinedTextItem({
  transcriptionText,
  refinedText,
  isRefining,
  isRefined,
  locale,
  onDevice,
  wordCount,
  charCount,
  model,
  onRefine,
  onPaste,
  onCopy,
  onChangeModel,
}: RefinedTextItemProps) {
  return (
    <List.Item
      id="refined-text"
      title="Refined Text"
      icon={Icon.Stars}
      subtitle={isRefining ? "Processing..." : isRefined ? "Ready to paste" : "Refine with AI"}
      detail={
        <List.Item.Detail
          markdown={isRefined ? refinedText : transcriptionText}
          metadata={
            <TranscriptionMetadata
              locale={locale}
              onDevice={onDevice}
              wordCount={wordCount}
              charCount={charCount}
              typeLabel={isRefined ? "✨ AI Refined" : "Not refined yet"}
              modelLabel={isRefined ? MODEL_DISPLAY_NAMES[model] : undefined}
            />
          }
        />
      }
      actions={
        <ActionPanel>
          {isRefined ? (
            <>
              <Action title="Paste Refined Text" icon={Icon.Clipboard} onAction={onPaste} />
              <Action
                title="Copy Refined Text"
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
                onAction={onCopy}
              />
              <Action
                title="Refine Again"
                icon={Icon.RotateClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={onRefine}
              />
              <ActionPanel.Submenu
                title="Change Model & Refine Again"
                icon={Icon.Switch}
                shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
              >
                {ALL_MODELS.filter((m) => m !== model).map((m) => (
                  <Action key={m} title={MODEL_DISPLAY_NAMES[m]} onAction={() => onChangeModel(m)} />
                ))}
              </ActionPanel.Submenu>
            </>
          ) : (
            <Action title="Refine with AI" icon={Icon.Stars} onAction={onRefine} />
          )}
        </ActionPanel>
      }
    />
  );
}

// MARK: - Translate Item

interface TranslateItemProps {
  transcriptionText: string;
  refinedText: string;
  translatedText: string;
  translatedLanguage: string;
  isTranslating: boolean;
  isTranslated: boolean;
  locale: string;
  onDevice: boolean;
  model: AIModelPreference;
  onTranslate: (targetLanguage: string) => void;
  onPaste: () => Promise<void>;
  onCopy: () => Promise<void>;
  onChangeModel: (model: AIModelPreference, targetLanguage: string) => void;
}

function TranslateItem({
  transcriptionText,
  refinedText,
  translatedText,
  translatedLanguage,
  isTranslating,
  isTranslated,
  locale,
  onDevice,
  model,
  onTranslate,
  onPaste,
  onCopy,
  onChangeModel,
}: TranslateItemProps) {
  return (
    <List.Item
      id="translate-text"
      title="Translate"
      icon={Icon.Globe}
      subtitle={
        isTranslating
          ? "Translating..."
          : isTranslated
            ? `Translated to ${translatedLanguage}`
            : "Translate to another language"
      }
      detail={
        <List.Item.Detail
          markdown={isTranslated ? translatedText : refinedText || transcriptionText}
          metadata={
            <TranscriptionMetadata
              locale={locale}
              onDevice={onDevice}
              typeLabel={isTranslated ? `🌐 ${translatedLanguage}` : "Not translated yet"}
              sourceLabel={refinedText ? "Refined text" : "Original text"}
              modelLabel={isTranslated ? MODEL_DISPLAY_NAMES[model] : undefined}
            />
          }
        />
      }
      actions={
        <ActionPanel>
          {isTranslated ? (
            <>
              <Action title="Paste Translation" icon={Icon.Clipboard} onAction={onPaste} />
              <Action
                title="Copy Translation"
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
                onAction={onCopy}
              />
              <ActionPanel.Submenu
                title="Translate to Another Language"
                icon={Icon.Globe}
                shortcut={{ modifiers: ["cmd"], key: "t" }}
              >
                {COMMON_LANGUAGES.map((lang) => (
                  <Action key={lang.code} title={lang.name} onAction={() => onTranslate(lang.code)} />
                ))}
              </ActionPanel.Submenu>
              <ActionPanel.Submenu
                title="Change Model & Translate Again"
                icon={Icon.Switch}
                shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
              >
                {ALL_MODELS.filter((m) => m !== model).map((m) => (
                  <Action
                    key={m}
                    title={MODEL_DISPLAY_NAMES[m]}
                    onAction={() => onChangeModel(m, translatedLanguage)}
                  />
                ))}
              </ActionPanel.Submenu>
            </>
          ) : (
            <ActionPanel.Submenu title="Translate to Language" icon={Icon.Globe}>
              {COMMON_LANGUAGES.map((lang) => (
                <Action key={lang.code} title={lang.name} onAction={() => onTranslate(lang.code)} />
              ))}
            </ActionPanel.Submenu>
          )}
        </ActionPanel>
      }
    />
  );
}

// MARK: - Discard Item

interface DiscardItemProps {
  transcriptionText: string;
  locale: string;
  onDevice: boolean;
}

function DiscardItem({ transcriptionText, locale, onDevice }: DiscardItemProps) {
  return (
    <List.Item
      title="Discard & Close"
      icon={Icon.Trash}
      subtitle="Close without pasting"
      detail={
        <List.Item.Detail
          markdown={`~~${transcriptionText}~~`}
          metadata={<TranscriptionMetadata locale={locale} onDevice={onDevice} typeLabel="Discard" />}
        />
      }
      actions={
        <ActionPanel>
          <Action title="Discard & Close" icon={Icon.Trash} onAction={() => popToRoot()} />
        </ActionPanel>
      }
    />
  );
}

// MARK: - Main Component

export interface TranscriptionActionsListProps {
  transcriptionText: string;
  locale: string;
  onDevice: boolean;
  autoRefine: boolean;
  aiModel: AIModelPreference;
}

export function TranscriptionActionsList({
  transcriptionText,
  locale,
  onDevice,
  autoRefine,
  aiModel,
}: TranscriptionActionsListProps) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinedText, setRefinedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [translatedLanguage, setTranslatedLanguage] = useState("");
  const [currentRefineModel, setCurrentRefineModel] = useState<AIModelPreference>(aiModel);
  const [currentTranslateModel, setCurrentTranslateModel] = useState<AIModelPreference>(aiModel);

  const refiningRef = useRef(false);
  const translatingRef = useRef(false);

  const wordCount = transcriptionText.split(/\s+/).filter((w) => w.trim()).length;
  const charCount = transcriptionText.length;
  const isRefined = !!refinedText;
  const isTranslated = !!translatedText;

  // Auto-refine on mount if enabled
  useProductionSafeMount(() => {
    if (autoRefine && !refinedText && environment.canAccess(AI)) {
      handleRefineWithAI();
    }
  }, []);

  // MARK: Handlers

  async function handleRefineWithAI() {
    if (refiningRef.current) return;
    refineTranscription({
      transcriptionText,
      model: currentRefineModel,
      onStart() {
        refiningRef.current = true;
        setIsRefining(true);
      },
      onSuccess(text) {
        setRefinedText(text);
      },
      onComplete() {
        refiningRef.current = false;
        setIsRefining(false);
      },
    });
  }

  function handleChangeRefineModel(newModel: AIModelPreference) {
    setCurrentRefineModel(newModel);
    refineTranscription({
      transcriptionText,
      model: newModel,
      onStart() {
        refiningRef.current = true;
        setIsRefining(true);
      },
      onSuccess(text) {
        setRefinedText(text);
      },
      onComplete() {
        refiningRef.current = false;
        setIsRefining(false);
      },
    });
  }

  async function handlePasteOriginal() {
    if (!transcriptionText.trim()) return;
    await Clipboard.paste(transcriptionText);
    await showToast({
      style: Toast.Style.Success,
      title: "Pasted Original",
      message: "Original transcription pasted to active app",
    });
    await popToRoot();
  }

  async function handleCopyOriginal() {
    if (!transcriptionText.trim()) return;
    await Clipboard.copy(transcriptionText);
    await showToast({
      style: Toast.Style.Success,
      title: "Copied Original",
      message: "Original transcription copied to clipboard",
    });
  }

  async function handlePasteRefined() {
    if (!refinedText) return;
    await Clipboard.paste(refinedText);
    await showToast({
      style: Toast.Style.Success,
      title: "Pasted Refined",
      message: "Refined transcription pasted to active app",
    });
    await popToRoot();
  }

  async function handleCopyRefined() {
    if (!refinedText) return;
    await Clipboard.copy(refinedText);
    await showToast({
      style: Toast.Style.Success,
      title: "Copied Refined",
      message: "Refined transcription copied to clipboard",
    });
  }

  function handleTranslate(targetLanguage: string) {
    if (translatingRef.current) return;
    const textToTranslate = refinedText || transcriptionText;
    translateText({
      text: textToTranslate,
      targetLanguage,
      model: currentTranslateModel,
      onStart() {
        translatingRef.current = true;
        setIsTranslating(true);
      },
      onSuccess(translated) {
        setTranslatedText(translated);
        setTranslatedLanguage(targetLanguage);
      },
      onComplete() {
        translatingRef.current = false;
        setIsTranslating(false);
      },
    });
  }

  function handleChangeTranslateModel(newModel: AIModelPreference, targetLanguage: string) {
    setCurrentTranslateModel(newModel);
    const textToTranslate = refinedText || transcriptionText;
    translateText({
      text: textToTranslate,
      targetLanguage,
      model: newModel,
      onStart() {
        translatingRef.current = true;
        setIsTranslating(true);
      },
      onSuccess(translated) {
        setTranslatedText(translated);
        setTranslatedLanguage(targetLanguage);
      },
      onComplete() {
        translatingRef.current = false;
        setIsTranslating(false);
      },
    });
  }

  async function handlePasteTranslated() {
    if (!translatedText) return;
    await Clipboard.paste(translatedText);
    await showToast({
      style: Toast.Style.Success,
      title: "Pasted Translation",
      message: `Translation (${translatedLanguage}) pasted to active app`,
    });
    await popToRoot();
  }

  async function handleCopyTranslated() {
    if (!translatedText) return;
    await Clipboard.copy(translatedText);
    await showToast({
      style: Toast.Style.Success,
      title: "Copied Translation",
      message: `Translation (${translatedLanguage}) copied to clipboard`,
    });
  }

  // MARK: Render

  return (
    <List isShowingDetail>
      {autoRefine ? (
        <>
          <RefinedTextItem
            transcriptionText={transcriptionText}
            refinedText={refinedText}
            isRefining={isRefining}
            isRefined={isRefined}
            locale={locale}
            onDevice={onDevice}
            wordCount={wordCount}
            charCount={charCount}
            model={currentRefineModel}
            onRefine={handleRefineWithAI}
            onPaste={handlePasteRefined}
            onCopy={handleCopyRefined}
            onChangeModel={handleChangeRefineModel}
          />
          <OriginalTextItem
            transcriptionText={transcriptionText}
            locale={locale}
            onDevice={onDevice}
            wordCount={wordCount}
            charCount={charCount}
            onPaste={handlePasteOriginal}
            onCopy={handleCopyOriginal}
          />
        </>
      ) : (
        <>
          <OriginalTextItem
            transcriptionText={transcriptionText}
            locale={locale}
            onDevice={onDevice}
            wordCount={wordCount}
            charCount={charCount}
            onPaste={handlePasteOriginal}
            onCopy={handleCopyOriginal}
          />
          <RefinedTextItem
            transcriptionText={transcriptionText}
            refinedText={refinedText}
            isRefining={isRefining}
            isRefined={isRefined}
            locale={locale}
            onDevice={onDevice}
            wordCount={wordCount}
            charCount={charCount}
            model={currentRefineModel}
            onRefine={handleRefineWithAI}
            onPaste={handlePasteRefined}
            onCopy={handleCopyRefined}
            onChangeModel={handleChangeRefineModel}
          />
        </>
      )}

      <TranslateItem
        transcriptionText={transcriptionText}
        refinedText={refinedText}
        translatedText={translatedText}
        translatedLanguage={translatedLanguage}
        isTranslating={isTranslating}
        isTranslated={isTranslated}
        locale={locale}
        onDevice={onDevice}
        model={currentTranslateModel}
        onTranslate={handleTranslate}
        onPaste={handlePasteTranslated}
        onCopy={handleCopyTranslated}
        onChangeModel={handleChangeTranslateModel}
      />

      <DiscardItem transcriptionText={transcriptionText} locale={locale} onDevice={onDevice} />
    </List>
  );
}
