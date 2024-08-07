import { promises, existsSync } from "fs";
import { BookmarkDirectory, HistoryEntry, RawBookmarks, SearchResult } from "../interfaces";
import { getBookmarksFilePath } from "../util";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { NO_BOOKMARKS_MESSAGE, NOT_INSTALLED_MESSAGE } from "../constants";
import { NoBookmarksError, NotInstalledError, UnknownError } from "../components";

function extractBookmarkFromBookmarkDirectory(bookmarkDirectory: BookmarkDirectory): HistoryEntry[] {
  const bookmarks: HistoryEntry[] = [];

  if (bookmarkDirectory.type === "folder") {
    bookmarkDirectory.children.forEach((child) => {
      bookmarks.push(...extractBookmarkFromBookmarkDirectory(child));
    });
  } else if (bookmarkDirectory.type === "url" && bookmarkDirectory.url) {
    bookmarks.push({
      id: bookmarkDirectory.id,
      url: bookmarkDirectory.url,
      title: bookmarkDirectory.name,
      lastVisited: new Date(bookmarkDirectory.date_added),
    });
  }
  return bookmarks;
}

const extractBookmarks = (rawBookmarks: RawBookmarks): HistoryEntry[] => {
  const bookmarks: HistoryEntry[] = [];
  Object.keys(rawBookmarks.roots).forEach((rootKey) => {
    const rootLevelBookmarkFolders = rawBookmarks.roots[rootKey];
    const bookmarkEntries = extractBookmarkFromBookmarkDirectory(rootLevelBookmarkFolders);
    bookmarks.push(...bookmarkEntries);
  });
  return bookmarks;
};

const getBookmarks = async (profile?: string): Promise<HistoryEntry[]> => {
  const bookmarksFilePath = getBookmarksFilePath(profile);
  if (!existsSync(bookmarksFilePath)) {
    throw new Error(NO_BOOKMARKS_MESSAGE);
  }

  const fileBuffer = await promises.readFile(bookmarksFilePath, { encoding: "utf-8" });
  return extractBookmarks(JSON.parse(fileBuffer));
};

export function useBookmarkSearch(
  query?: string
): Required<SearchResult<HistoryEntry> & { readonly errorView: ReactNode }> {
  const [data, setData] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [profile, setProfile] = useState<string>();
  const [errorView, setErrorView] = useState<ReactNode>();

  const revalidate = useCallback(
    (profileId: string) => {
      setProfile(profileId);
    },
    [profile]
  );

  useEffect(() => {
    getBookmarks(profile)
      .then((bookmarks) => {
        setData(
          bookmarks.filter(
            (bookmark) =>
              bookmark.title.toLowerCase().includes(query?.toLowerCase() || "") ||
              bookmark.url.toLowerCase().includes(query?.toLowerCase() || "")
          )
        );
        setIsLoading(false);
      })
      .catch((e) => {
        if (e.message === NOT_INSTALLED_MESSAGE) {
          setErrorView(<NotInstalledError />);
        } else if (e.message === NO_BOOKMARKS_MESSAGE) {
          setErrorView(<NoBookmarksError />);
        } else {
          setErrorView(<UnknownError />);
        }
        setIsLoading(false);
      });
  }, [profile, query]);

  return { errorView, isLoading, data, revalidate };
}
