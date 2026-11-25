import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { Env, MailEncryption } from "../config/env.js";

export type MailerKind = "smtp" | "log" | "array";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface Mailer {
  readonly kind: MailerKind;
  send(message: MailMessage): Promise<void>;
}

/** In-memory mailer for tests and smoke runs. Nothing leaves the process. */
export interface ArrayMailer extends Mailer {
  readonly kind: "array";
  readonly outbox: MailMessage[];
  clear(): void;
  /** Make the next `send` reject (simulates an SMTP failure). */
  failNext(error?: Error): void;
}

/** Minimal logger shape (pino / Fastify logger compatible). */
export type MailLogger = {
  info: (obj: object, message?: string) => void;
  warn: (obj: object, message?: string) => void;
};

export type MailEnv = Pick<
  Env,
  | "NODE_ENV"
  | "MAIL_MAILER"
  | "MAIL_HOST"
  | "MAIL_PORT"
  | "MAIL_USERNAME"
  | "MAIL_PASSWORD"
  | "MAIL_ENCRYPTION"
  | "MAIL_FROM_ADDRESS"
  | "MAIL_FROM_NAME"
>;

export const DEFAULT_MAIL_FROM_NAME = "Lumina ESL";
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 15_000;

export type MailSettings = {
  mailer: MailerKind;
  host: string | undefined;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  username: string | undefined;
  password: string | undefined;
  fromAddress: string | undefined;
  fromName: string;
};

function isImplicitTls(encryption: MailEncryption | undefined): boolean {
  return encryption === "ssl" || encryption === "smtps";
}

function isStartTls(encryption: MailEncryption | undefined): boolean {
  return encryption === "tls" || encryption === "starttls";
}

/** Resolve mail defaults in code (the env schema has no zod defaults). */
export function resolveMailSettings(env: MailEnv): MailSettings {
  const secure = isImplicitTls(env.MAIL_ENCRYPTION);
  const requireTLS = isStartTls(env.MAIL_ENCRYPTION);
  const defaultPort = secure ? 465 : requireTLS ? 587 : 25;
  return {
    mailer: env.MAIL_MAILER ?? "log",
    host: env.MAIL_HOST,
    port: env.MAIL_PORT ?? defaultPort,
    secure,
    requireTLS,
    username: env.MAIL_USERNAME,
    password: env.MAIL_PASSWORD,
    fromAddress: env.MAIL_FROM_ADDRESS,
    fromName: env.MAIL_FROM_NAME ?? DEFAULT_MAIL_FROM_NAME,
  };
}

/** Pure nodemailer SMTP options; opens no connection. */
export function buildSmtpOptions(env: MailEnv): SMTPTransport.Options {
  const settings = resolveMailSettings(env);
  const options: SMTPTransport.Options = {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: settings.requireTLS,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  };
  if (settings.username && settings.password) {
    options.auth = { user: settings.username, pass: settings.password };
  }
  return options;
}

/** `someone@example.com` -> `s***@example.com`; anything else -> `***`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

export function createArrayMailer(): ArrayMailer {
  const outbox: MailMessage[] = [];
  let pendingFailure: Error | null = null;
  return {
    kind: "array",
    outbox,
    clear() {
      outbox.length = 0;
    },
    failNext(error?: Error) {
      pendingFailure = error ?? new Error("Simulated mail failure");
    },
    async send(message) {
      if (pendingFailure) {
        const failure = pendingFailure;
        pendingFailure = null;
        throw failure;
      }
      outbox.push({ ...message });
    },
  };
}

/** Development mailer: logs the subject and a masked recipient, never the body. */
export function createLogMailer(logger: MailLogger): Mailer {
  return {
    kind: "log",
    async send(message) {
      logger.info(
        { mail: { to: maskEmail(message.to), subject: message.subject } },
        "mail not sent (MAIL_MAILER=log)",
      );
    },
  };
}

export function createSmtpMailer(env: MailEnv): Mailer {
  const settings = resolveMailSettings(env);
  if (!settings.host) {
    throw new Error("MAIL_HOST is required for the smtp mailer");
  }
  if (!settings.fromAddress) {
    throw new Error("MAIL_FROM_ADDRESS is required for the smtp mailer");
  }
  const from = { name: settings.fromName, address: settings.fromAddress };
  const transport = nodemailer.createTransport(buildSmtpOptions(env));
  return {
    kind: "smtp",
    async send(message) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

/**
 * Build the configured mailer. `smtp` is refused under NODE_ENV=test so no test
 * harness can ever send real mail, whatever the env file says.
 */
export function createMailer(env: MailEnv, logger: MailLogger): Mailer {
  const settings = resolveMailSettings(env);
  switch (settings.mailer) {
    case "smtp":
      if (env.NODE_ENV === "test") {
        throw new Error(
          "Refusing the smtp mailer under NODE_ENV=test; use MAIL_MAILER=array or log",
        );
      }
      return createSmtpMailer(env);
    case "array":
      return createArrayMailer();
    case "log":
      return createLogMailer(logger);
  }
}
