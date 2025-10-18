import { Action, ActionPanel, Color, getSelectedFinderItems, Icon, List, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { exec } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: string;
  extension: string;
  created: Date;
  modified: Date;
  accessed: Date;
  permissions: string;
  owner: string;
  group: string;
  isDirectory: boolean;
  mimeType?: string;
  dimensions?: string;
}

async function getFileInfo(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  const parsedPath = path.parse(filePath);

  // Get file owner/group info
  let owner = "";
  let group = "";
  try {
    const { stdout } = await execAsync(`ls -ld "${filePath}"`);
    const parts = stdout.trim().split(/\s+/);
    if (parts.length >= 4) {
      owner = parts[2];
      group = parts[3];
    }
  } catch {
    // Ignore errors
  }

  // Get MIME type
  let mimeType = "";
  try {
    const { stdout } = await execAsync(`file --mime-type -b "${filePath}"`);
    mimeType = stdout.trim();
  } catch {
    // Ignore errors
  }

  // Get media dimensions for images and videos
  let dimensions = "";
  const ext = parsedPath.ext.toLowerCase();

  // Check if it's an image
  if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".heic"].includes(ext)) {
    try {
      const { stdout } = await execAsync(`sips -g pixelWidth -g pixelHeight "${filePath}"`);
      const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
      const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/);
      if (widthMatch && heightMatch) {
        dimensions = `${widthMatch[1]} × ${heightMatch[1]}`;
      }
    } catch {
      // Ignore errors
    }
  }

  // Check if it's a video
  if ([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv"].includes(ext)) {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${filePath}"`,
      );
      const trimmed = stdout.trim();
      if (trimmed?.includes("x")) {
        dimensions = trimmed.replace("x", " × ");
      }
    } catch {
      // Ignore errors
    }
  }

  return {
    name: parsedPath.base,
    path: filePath,
    size: stats.size,
    type: stats.isDirectory() ? "Directory" : "File",
    extension: parsedPath.ext || "None",
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    permissions: stats.mode.toString(8).slice(-3),
    owner,
    group,
    isDirectory: stats.isDirectory(),
    mimeType,
    dimensions,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / k ** i) * 100) / 100 + " " + sizes[i];
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getFileIcon(fileInfo: FileInfo): Icon {
  if (fileInfo.isDirectory) return Icon.Folder;

  const ext = fileInfo.extension.toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp"].includes(ext)) return Icon.Image;
  if ([".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext)) return Icon.Video;
  if ([".mp3", ".wav", ".aac", ".flac", ".m4a"].includes(ext)) return Icon.Music;
  if ([".pdf"].includes(ext)) return Icon.Document;
  if ([".txt", ".md", ".rtf"].includes(ext)) return Icon.Text;
  if ([".zip", ".tar", ".gz", ".rar", ".7z"].includes(ext)) return Icon.Box;
  if ([".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cpp", ".swift", ".go", ".rs"].includes(ext))
    return Icon.Code;

  return Icon.Document;
}

export default function Command() {
  const {
    isLoading,
    data: fileInfo,
    error,
  } = usePromise(async () => {
    const items = await getSelectedFinderItems();
    if (items.length === 0) {
      throw new Error("No file selected. Please select a file in Finder first.");
    }
    return getFileInfo(items[0].path);
  });

  if (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Error",
      message: error.message,
    });
  }

  return (
    <List isLoading={isLoading} isShowingDetail>
      {fileInfo && (
        <>
          <List.Section title="File Overview">
            <List.Item
              icon={{ source: getFileIcon(fileInfo), tintColor: Color.Blue }}
              title="File Info"
              subtitle={fileInfo.name}
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title="General Information" text="" />
                      <List.Item.Detail.Metadata.Label title="Name" text={fileInfo.name} />
                      <List.Item.Detail.Metadata.Label title="Type" text={fileInfo.type} />
                      <List.Item.Detail.Metadata.Label
                        title="Size"
                        text={`${formatBytes(fileInfo.size)} (${fileInfo.size.toLocaleString()} bytes)`}
                      />
                      <List.Item.Detail.Metadata.Label title="Extension" text={fileInfo.extension} />
                      {fileInfo.mimeType && (
                        <List.Item.Detail.Metadata.Label title="MIME Type" text={fileInfo.mimeType} />
                      )}
                      {fileInfo.dimensions && (
                        <List.Item.Detail.Metadata.Label title="Dimensions" text={fileInfo.dimensions} />
                      )}

                      <List.Item.Detail.Metadata.Separator />

                      <List.Item.Detail.Metadata.Label title="Location" text="" />
                      <List.Item.Detail.Metadata.Label title="Path" text={fileInfo.path} />

                      <List.Item.Detail.Metadata.Separator />

                      <List.Item.Detail.Metadata.Label title="Timestamps" text="" />
                      <List.Item.Detail.Metadata.Label title="Created" text={formatDate(fileInfo.created)} />
                      <List.Item.Detail.Metadata.Label title="Modified" text={formatDate(fileInfo.modified)} />
                      <List.Item.Detail.Metadata.Label title="Accessed" text={formatDate(fileInfo.accessed)} />

                      <List.Item.Detail.Metadata.Separator />

                      <List.Item.Detail.Metadata.Label title="Permissions" text="" />
                      <List.Item.Detail.Metadata.Label title="Mode" text={fileInfo.permissions} />
                      {fileInfo.owner && <List.Item.Detail.Metadata.Label title="Owner" text={fileInfo.owner} />}
                      {fileInfo.group && <List.Item.Detail.Metadata.Label title="Group" text={fileInfo.group} />}
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy File Path"
                    content={fileInfo.path}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.ShowInFinder path={fileInfo.path} shortcut={{ modifiers: ["cmd"], key: "f" }} />
                  <Action.OpenWith path={fileInfo.path} shortcut={{ modifiers: ["cmd"], key: "o" }} />
                  <Action.CopyToClipboard
                    title="Copy All Info"
                    content={`Name: ${fileInfo.name}
Path: ${fileInfo.path}
Type: ${fileInfo.type}
Size: ${formatBytes(fileInfo.size)}
Extension: ${fileInfo.extension}
Created: ${formatDate(fileInfo.created)}
Modified: ${formatDate(fileInfo.modified)}
Accessed: ${formatDate(fileInfo.accessed)}
Permissions: ${fileInfo.permissions}
Owner: ${fileInfo.owner}
Group: ${fileInfo.group}`}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                </ActionPanel>
              }
            />
          </List.Section>

          <List.Section title="Quick Stats">
            <List.Item
              icon={{ source: Icon.HardDrive, tintColor: Color.Orange }}
              title="Size"
              accessories={[{ text: formatBytes(fileInfo.size) }]}
            />
            <List.Item
              icon={{ source: Icon.Document, tintColor: Color.Purple }}
              title="Type"
              accessories={[{ text: fileInfo.type }]}
            />
            {fileInfo.dimensions && (
              <List.Item
                icon={{ source: Icon.Image, tintColor: Color.Magenta }}
                title="Dimensions"
                accessories={[{ text: fileInfo.dimensions }]}
              />
            )}
            <List.Item
              icon={{ source: Icon.Clock, tintColor: Color.Green }}
              title="Modified"
              accessories={[{ text: formatDate(fileInfo.modified) }]}
            />
            <List.Item
              icon={{ source: Icon.Lock, tintColor: Color.Red }}
              title="Permissions"
              accessories={[{ text: fileInfo.permissions }]}
            />
          </List.Section>
        </>
      )}
    </List>
  );
}
