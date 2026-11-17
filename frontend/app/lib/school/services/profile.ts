import { isApiDataMode } from "../../auth/mode";
import { refreshSchoolAfterCommand, updateMyName as updateMyNameApi } from "../api/school";
import { patch, recordActivity } from "../repositories";
import { updateSchool } from "../store";
import { requireUser } from "./common";
import { run, runAsync, ServiceError, type ServiceResult } from "./result";

/** Anyone can rename themselves; the new name shows for every role. Email changes go through an admin. */
export function updateMyName(actorId: string, name: string): ServiceResult | Promise<ServiceResult> {
  if (isApiDataMode()) {
    return runAsync(async () => {
      const trimmed = name.trim().replace(/\s+/g, " ");
      if (trimmed.length < 2) throw new ServiceError("Enter your full name.");
      await updateMyNameApi(actorId, trimmed);
      await refreshSchoolAfterCommand();
    });
  }
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (trimmed.length < 2) throw new ServiceError("Enter your full name.");
    if (trimmed === actor.name) return;
    patch(draft, "users", actor.id, { name: trimmed });
    recordActivity(draft, { actorId, action: "user.renamed", targetType: "user", targetId: actor.id, summary: `${actor.name} → ${trimmed}` });
  }));
}
