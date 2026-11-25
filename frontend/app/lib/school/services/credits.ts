import { assertCan } from "../permissions";
import { updateSchool } from "../store";
import { isApiDataMode } from "../../auth/mode";
import { purchaseCredits as purchaseCreditsApi } from "../api/credits";
import { changeCredits, requireUser } from "./common";
import { run, runAsync, ServiceError, type ServiceCall } from "./result";

export function purchaseCredits(actorId: string, hours: number, amount: number): ServiceCall {
  if (isApiDataMode()) return runAsync(async () => { if (!(hours > 0)) throw new ServiceError("Choose a credit package."); await purchaseCreditsApi(actorId, hours, amount); });
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "credits.purchase", { studentId: actor.id });
    if (!(hours > 0)) throw new ServiceError("Choose a credit package.");
    changeCredits(draft, { studentId: actor.id, hours, amount, reason: "purchase", description: "Lesson credits top-up", actorId });
  }));
}
