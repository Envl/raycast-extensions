import { Action, ActionPanel, Clipboard, getPreferenceValues, Icon, Keyboard, List } from "@raycast/api";
import { useState } from "react";
import { Email, getEmails, markAsRead } from "../services/mailtrap";

interface ListEmailsViewProps {
  inboxId: number;
}

export default function ListEmailsView({ inboxId }: ListEmailsViewProps) {
  const [searchText, setSearchText] = useState<string | undefined>(undefined);
  const { isLoading, data, revalidate, pagination } = getEmails(inboxId);
  const preferences = getPreferenceValues<Preferences.GetMailtrapSubject>();

  Clipboard.read().then((value) => {
    if (value && value.text && preferences.clipboardRegex) {
      const regex = new RegExp(preferences.clipboardRegex);
      if (!value.text.match(regex)) return;
      setSearchText(value.text);
    }
  });

  const filteredData = data && preferences.onlyShowUnread ? data.filter((email) => !email.is_read) : data;

  return (
    <List isLoading={isLoading} searchText={searchText} pagination={pagination} searchBarPlaceholder="Search email">
      {filteredData.map((email) => (
        <List.Item
          key={email.id}
          icon={email.is_read ? Icon.Circle : Icon.CircleFilled}
          title={email.to_email}
          subtitle={email.subject}
          keywords={[email.subject, email.to_email]}
          accessories={[{ date: new Date(email.created_at) }]}
          actions={
            <ActionPanel>
              {getCopyActions(email, preferences)}
              <Action.CopyToClipboard key="Copy Email" title={"Copy Email"} content={email.to_email} />
              <Action
                key="Refresh"
                title="Refresh"
                icon={Icon.RotateClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function getCopyActions(email: Email, preferences: Preferences.GetMailtrapSubject) {
  const actions = [
    <Action.CopyToClipboard
      key="Copy Subject"
      title="Copy Subject"
      content={getCopyContent(email.subject, preferences.subjectRegex)}
      onCopy={() => markAsRead(email.inbox_id, email.id)}
    />,
    <Action.Paste
      key="Paste Subject"
      title="Paste Subject"
      content={getCopyContent(email.subject, preferences.subjectRegex)}
      onPaste={() => markAsRead(email.inbox_id, email.id)}
    />,
  ];

  if (preferences.autoPaste) actions.reverse();

  return actions;
}

function getCopyContent(subject: string, regex?: string) {
  if (regex) {
    const matches = subject.match(new RegExp(regex));
    if (!matches) return subject;
    return matches[0];
  }
  return subject;
}
