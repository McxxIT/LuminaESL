"use client";

import { FormEvent, useState } from "react";
import Icon from "./Icon";
import { ApiError } from "../lib/api/client";
import { setPasswordWithToken } from "../lib/api/auth";
import { clearInviteHash } from "../lib/auth/invite-hash";

const MIN_LENGTH = 10;
const MAX_LENGTH = 128;
const INVALID_LINK_MESSAGE = "This invitation link is invalid or has expired. Ask your school contact to send a new one.";

/**
 * API mode only. Shown when the page was opened from an invitation link
 * (`/#set-password=<token>`). The token stays in component state so a policy
 * error can be corrected and retried; the fragment is cleared before the request.
 */
export default function SetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
      setError(`Use ${MIN_LENGTH} to ${MAX_LENGTH} characters.`);
      return;
    }

    // Take the token out of the address bar and history before it goes anywhere.
    clearInviteHash();
    setSubmitting(true);
    try {
      await setPasswordWithToken(token, password);
      setDone(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "VALIDATION_ERROR") {
        setError(`Use ${MIN_LENGTH} to ${MAX_LENGTH} characters.`);
      } else if (cause instanceof ApiError && cause.status === 0) {
        setError(cause.message);
      } else {
        setError(INVALID_LINK_MESSAGE);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark">L</div><strong>Lumina <span>ESL</span></strong></div>
    {done ? (
      <div data-testid="set-password-success">
        <div className="auth-heading"><p className="eyebrow">ALL SET</p><h1>Password set</h1><p>Your account is active. Sign in with your email address and the password you just chose.</p></div>
        <button type="button" className="primary-button auth-submit" onClick={onDone}>Continue to sign in <Icon name="arrow" size={16} /></button>
      </div>
    ) : (
      <>
        <div className="auth-heading"><p className="eyebrow">WELCOME</p><h1>Set your password</h1><p>Choose a password with {MIN_LENGTH} to {MAX_LENGTH} characters to activate your account.</p></div>
        <form className="auth-form" onSubmit={submit} data-testid="set-password-form">
          <label>New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
          {error && <p className="auth-error" role="alert" data-testid="set-password-error">{error}</p>}
          <button type="submit" className="primary-button auth-submit" disabled={submitting}>{submitting ? "Saving" : "Set password"} <Icon name="arrow" size={16} /></button>
        </form>
        <p className="auth-note"><button type="button" className="text-button" onClick={onDone}>Back to sign in</button></p>
      </>
    )}
  </section></main>;
}
