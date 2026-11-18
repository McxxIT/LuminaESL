"use client";

import { useEffect, useState } from "react";
import { isApiDataMode } from "../auth/mode";
import { downloadAttachment } from "./api/uploads";
import { readFileAsync } from "./files";

/** The subset of an attachment needed to download it in either mode. */
export type DownloadableAttachment = {
  id?: string;
  name: string;
  storageKey?: string;
};

/**
 * Downloads an attachment: authenticated API bytes in API mode, IndexedDB/localStorage
 * in demo mode. Returns false when the bytes are not available on this device.
 */
export async function downloadAttachmentFile(file: DownloadableAttachment): Promise<boolean> {
  let href: string | undefined;
  let revoke = false;

  if (isApiDataMode() && file.id) {
    href = URL.createObjectURL(await downloadAttachment(file.id));
    revoke = true;
  } else {
    href = await readFileAsync(file.storageKey);
  }
  if (!href) return false;

  const link = document.createElement("a");
  link.href = href;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a tick to start the download before releasing the object URL.
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(href!), 1_000);
  return true;
}

/** Loads API attachment bytes as an object URL for inline preview (images). */
export function useAttachmentObjectUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!id || !isApiDataMode()) return;
    let active = true;
    let created: string | undefined;
    downloadAttachment(id)
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => {
        // Preview is optional; the download link still reports the failure.
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);

  return url;
}
