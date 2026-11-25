"use client";

import { useState } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { isDemoMode } from "../../lib/auth/mode";
import type { InviteOutcome } from "../../lib/api/types";
import { can, getSchoolSnapshot, type SchoolUser } from "../../lib/school";
import { resendInvite } from "../../lib/school/services";

/** Who was invited; enough to label the result. */
export type InvitedPerson = Pick<SchoolUser, "id" | "name" | "email" | "role">;

/** The pending invite-result dialog of a people screen. */
export type InviteResult = { person: InvitedPerson; invite: InviteOutcome } | null;

/**
 * True when the actor may resend this person's invitation: API mode only, the
 * person is still `invited`, and `account.invite` allows it (admin, or the
 * manager of that teacher / roster student).
 */
export function canResendInvite(actor: SchoolUser, person: SchoolUser): boolean {
  if (isDemoMode() || person.status !== "invited") return false;
  const target = person.role === "teacher" ? { teacherId: person.id } : person.role === "student" ? { studentId: person.id } : {};
  if (person.role === "manager" || person.role === "admin") return actor.role === "admin";
  return can(getSchoolSnapshot(), actor, "account.invite", target);
}

function describe(person: InvitedPerson, invite: InviteOutcome): { tone: "success" | "info" | "warning"; title: string; detail: string } {
  if (!invite.sent) {
    return { tone: "warning", title: invite.error ?? "The invitation email could not be sent.", detail: "Their account is ready and waits for them to set a password. Try sending the invitation again." };
  }
  if (invite.mode === "smtp") {
    return { tone: "success", title: `Invitation emailed to ${person.email}`, detail: "The link works once and expires in 72 hours. They choose their own password." };
  }
  return {
    tone: "info",
    title: "Email sending is not configured (development).",
    detail: invite.link ? "Copy the link below and send it to them. It works once and expires in 72 hours." : "No email was sent. Ask a school admin for the invitation link.",
  };
}

/**
 * Result of creating or re-inviting a person (API mode). A manager never gets a
 * link from the server, so the copy field only appears for admins.
 */
export function InviteResultModal({ actorId, person, invite: initialInvite, canResend, onClose }: {
  actorId: string;
  person: InvitedPerson;
  invite: InviteOutcome;
  canResend: boolean;
  onClose: () => void;
}) {
  const [invite, setInvite] = useState(initialInvite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const message = describe(person, invite);

  async function resend() {
    setBusy(true);
    setError("");
    setCopied(false);
    const result = await resendInvite(actorId, person.id);
    setBusy(false);
    if (result.ok) setInvite(result.value);
    else setError(result.error);
  }

  async function copy() {
    if (!invite.link) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
    } catch {
      setError("Copy failed. Select the link and copy it by hand.");
    }
  }

  return <Modal eyebrow="INVITATION" title={person.name} description={person.email} onClose={onClose}
    footer={<>
      {canResend && !invite.sent && <button type="button" className="secondary-button" data-testid="invite-resend" disabled={busy} onClick={() => void resend()}><Icon name="mail" size={14} /> {busy ? "Sending" : "Resend invite"}</button>}
      <button type="button" className="primary-button" onClick={onClose}>Done</button>
    </>}>
    <div data-testid="invite-result" className="student-form-grid">
      <div className={`lesson-callout full-field ${message.tone === "warning" ? "warning" : ""}`}><Icon name={message.tone === "warning" ? "x" : "check"} size={16} /><div>
        <strong>{message.title}</strong>
        <p>{message.detail}</p>
      </div></div>
      {invite.link && <label className="full-field">Invitation link
        <input type="text" readOnly value={invite.link} data-testid="invite-link" onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="secondary-button compact-button" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>
      </label>}
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
    </div>
  </Modal>;
}

/** "Resend invite" action for an `invited` row; the caller shows the result modal. */
export function ResendInviteButton({ actorId, person, onResult, compact = false }: {
  actorId: string;
  person: SchoolUser;
  onResult: (person: SchoolUser, result: { ok: true; value: InviteOutcome } | { ok: false; error: string }) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const result = await resendInvite(actorId, person.id);
    setBusy(false);
    onResult(person, result);
  }
  return <button type="button" className={`secondary-button ${compact ? "compact-button" : ""}`} data-testid="invite-row-resend" disabled={busy} onClick={() => void send()}>
    <Icon name="mail" size={14} /> {busy ? "Sending" : "Resend invite"}
  </button>;
}
