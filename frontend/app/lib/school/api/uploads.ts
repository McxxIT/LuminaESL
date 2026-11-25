import { request, requestBlob } from "../../api/client";
import type { AttachmentMeta } from "../types";

/** Uploads bytes to the backend; the response is the stored `attachments` row. */
export async function uploadFile(file: File): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append("file", file, file.name);
  return request<AttachmentMeta>("/uploads", { method: "POST", body: form });
}

/** Authenticated binary download (the bearer token never goes in an `<a href>`). */
export function downloadAttachment(id: string): Promise<Blob> {
  return requestBlob(`/uploads/${encodeURIComponent(id)}/download`);
}
