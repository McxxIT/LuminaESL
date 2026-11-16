import { assertCan } from "../permissions";
import { updateSchool } from "../store";
import { changeCredits, requireUser } from "./common";
import { run, ServiceError, type ServiceResult } from "./result";

export function purchaseCredits(actorId: string, hours: number, amount: number): ServiceResult {
  return run(() => updateSchool((draft) => {
    const actor = requireUser(draft, actorId);
    assertCan(draft, actor, "credits.purchase", { studentId: actor.id });
    if (!(hours > 0)) throw new ServiceError("Choose a credit package.");
    changeCredits(draft, { studentId: actor.id, hours, amount, reason: "purchase", description: "Lesson credits top-up", actorId });
  }));
}
