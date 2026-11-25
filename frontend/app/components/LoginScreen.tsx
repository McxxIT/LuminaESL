"use client";

import { FormEvent, useState } from "react";
import Icon from "./Icon";
import { ApiError } from "../lib/api/client";
import { isDemoMode } from "../lib/auth/mode";
import { accountForUser, signIn } from "../lib/auth/session";
import { findUserByEmail, getSchoolSnapshot } from "../lib/school";
import type { Account } from "../lib/types";

export default function LoginScreen({ onLogin }: { onLogin: (account: Account) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const demoMode = isDemoMode();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (demoMode) {
      // Any person in the shared school can sign in (demo: any non-empty password).
      const user = findUserByEmail(getSchoolSnapshot(), email);
      if (!user || !password.trim()) {
        setError("Use a registered Lumina account and password.");
        return;
      }
      if (user.status !== "active") {
        setError("This account is paused. Contact your school manager.");
        return;
      }
      onLogin({ email: user.email, role: user.role, name: user.name });
      return;
    }

    setSubmitting(true);
    try {
      const user = await signIn(email, password);
      onLogin(accountForUser(user));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark">L</div><strong>Lumina <span>ESL</span></strong></div>
    <div className="auth-heading"><p className="eyebrow">WELCOME BACK</p><h1>Sign in to your workspace</h1><p>Manage lessons, students, and progress in one focused place.</p></div>
    <form className="auth-form" onSubmit={submit}>
      <label>Email address<input type="email" placeholder="you@lumina.school" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <div className="auth-options"><label className="checkbox-label"><input type="checkbox" /> Remember me</label><button type="button" className="text-button" onClick={() => setError("Password reset instructions will be sent to your registered email.")}>Forgot password?</button></div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" className="primary-button auth-submit" disabled={submitting}>{submitting ? "Signing in" : "Sign in"} <Icon name="arrow" size={16} /></button>
    </form>
    <p className="auth-note">Demo accounts: admin@lumina.school · manager@lumina.school · manager2@lumina.school · teacher@lumina.school · student@lumina.school</p>
  </section></main>;
}
