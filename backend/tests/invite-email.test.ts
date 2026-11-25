import { describe, expect, it } from "vitest";
import { renderInviteEmail } from "../src/lib/invite-email";

const link = "https://school.example/#set-password=abcDEF123_-";

describe("invite email", () => {
  it("has a fixed subject and carries the link and expiry in both parts", () => {
    const email = renderInviteEmail({ name: "Ada", link, hours: 72, schoolName: "Lumina ESL" });
    expect(email.subject).toBe("Set your Lumina ESL password");
    expect(email.text).toContain(link);
    expect(email.html).toContain(link);
    expect(email.text).toContain("72");
    expect(email.html).toContain("72");
    expect(email.text).toContain("Ada");
  });

  it("escapes the name in the HTML part", () => {
    const email = renderInviteEmail({
      name: "<script>alert(1)</script>",
      link,
      hours: 72,
      schoolName: "Lumina ESL",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("should include no password in the email", () => {
    const email = renderInviteEmail({ name: "Ada", link, hours: 72, schoolName: "Lumina ESL" });
    for (const part of [email.text, email.html]) {
      const withoutPhrase = part
        .replace(/set your password/gi, "")
        .replace(/set-password/g, "");
      expect(withoutPhrase.toLowerCase()).not.toContain("password");
    }
  });
});
