"use client";

import { useState, type FormEvent } from "react";
import Icon from "../Icon";
import { changePassword } from "../../lib/api/auth";
import { ApiError } from "../../lib/api/client";
import { isDemoMode } from "../../lib/auth/mode";

/** Matches the backend policy (`backend/src/lib/password.ts`): length only. */
const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_CURRENT_PASSWORD") return "Your current password is incorrect.";
    if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
    if (error.code === "VALIDATION_ERROR") return `Choose a new password of ${MIN_LENGTH} to ${MAX_LENGTH} characters that differs from the current one.`;
    return error.message || "Could not change your password.";
  }
  return "Could not reach the server. Check your connection and try again.";
}

/**
 * Self-service password change for every role's Settings page. Only API auth has
 * real passwords: demo mode renders a static explainer and never calls the API.
 */
export default function PasswordChangeCard({ onNotice }: { onNotice: (message: string) => void }) {
  if (isDemoMode()) {
    return <section className="panel student-panel student-settings-card" data-testid="password-demo-card">
      <div className="panel-header"><div><h2>Password</h2><p>Demo mode — passwords are not enforced</p></div></div>
      <p className="student-form-note">In the demo any non-empty password signs you in, so there is nothing to change here. Real accounts can change their password from this page.</p>
    </section>;
  }
  return <PasswordChangeForm onNotice={onNotice} />;
}

function PasswordChangeForm({ onNotice }: { onNotice: (message: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!current) return setError("Enter your current password.");
    if (next.length < MIN_LENGTH || next.length > MAX_LENGTH) return setError(`The new password must be ${MIN_LENGTH} to ${MAX_LENGTH} characters.`);
    if (next === current) return setError("The new password must be different from the current one.");
    if (next !== confirm) return setError("The new passwords do not match.");

    setSaving(true);
    setError("");
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      onNotice("Password changed. Other devices will need to sign in again.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel student-panel student-settings-card" data-testid="password-change-card">
    <div className="panel-header"><div><h2>Password</h2><p>Change the password you use to sign in</p></div></div>
    <form className="student-form-grid" style={{ padding: "16px 20px" }} onSubmit={submit} noValidate aria-label="Change password">
      <label className="full-field">Current password<input type="password" name="current-password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} maxLength={MAX_LENGTH} /></label>
      <label>New password<input type="password" name="new-password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} maxLength={MAX_LENGTH} /><small>At least {MIN_LENGTH} characters.</small></label>
      <label>Confirm new password<input type="password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} maxLength={MAX_LENGTH} /></label>
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
      <p className="student-form-note full-field" style={{ margin: 0 }}>You stay signed in here. Other devices are signed out within 15 minutes.</p>
      <div className="full-field"><button type="submit" className="primary-button" disabled={saving}><Icon name="lock" size={15} /> {saving ? "Saving…" : "Change password"}</button></div>
    </form>
  </section>;
}
