import { request } from "../../api/client";
import { refreshSchoolAfterCommand } from "./school";

export async function purchaseCredits(studentId: string, hours: number, amount: number) {
  const value = await request("/credits", {
    method: "POST",
    body: { studentId, hours, amount, reason: "purchase", description: "Lesson credits top-up" },
  });
  await refreshSchoolAfterCommand();
  return value;
}
