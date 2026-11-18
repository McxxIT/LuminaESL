import { isApiDataMode } from "../../auth/mode";
import { uploadFile as uploadFileApi } from "../api/uploads";
import { largeFileKey, MAX_UPLOAD_BYTES, saveLargeFile } from "../files";
import { createId } from "../repositories";
import { attachFileToPlan } from "./curriculum";
import { fail, runAsync, ServiceError, type ServiceResult } from "./result";

const ACCEPTED = /^(application\/pdf|image\/|application\/(msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-powerpoint))/;

function validate(file: File): string | undefined {
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  if (!ACCEPTED.test(file.type)) return "Upload a PDF, image, Word, or PowerPoint file.";
  return undefined;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Validates, stores the bytes (API in API mode, IndexedDB in demo mode), then records the
 * file on the lesson plan.
 */
export async function uploadPlanFile(actorId: string, planId: string, file: File): Promise<ServiceResult> {
  const invalid = validate(file);
  if (invalid) return fail(invalid);

  if (isApiDataMode()) {
    return runAsync(async () => {
      const attachment = await uploadFileApi(file);
      const result = await attachFileToPlan(actorId, planId, attachment);
      if (!result.ok) throw new ServiceError(result.error);
      return result.value;
    });
  }

  let dataUrl: string;
  try {
    dataUrl = await readAsDataUrl(file);
  } catch {
    return fail(`Could not read ${file.name}. Try another file.`);
  }
  const id = createId("attachment");
  const storageKey = largeFileKey(id);
  if (!(await saveLargeFile(storageKey, dataUrl))) return fail("The browser refused to store this file. Free some space and try again.");
  return attachFileToPlan(actorId, planId, { id, name: file.name, type: file.type, size: file.size, storageKey });
}
