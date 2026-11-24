import { describe, expect, it, vi } from "vitest";
import {
  buildSmtpOptions,
  createArrayMailer,
  createLogMailer,
  createMailer,
  maskEmail,
  resolveMailSettings,
  type MailEnv,
} from "../src/lib/mailer";

const base: MailEnv = { NODE_ENV: "development" };
const message = {
  to: "someone@example.com",
  subject: "Set your Lumina ESL password",
  text: "body with https://app/#set-password=SECRETTOKEN",
  html: "<p>https://app/#set-password=SECRETTOKEN</p>",
};

function spyLogger() {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(JSON.stringify(args));
  };
  return {
    lines,
    logger: {
      info: vi.fn(record),
      warn: vi.fn(record),
      error: vi.fn(record),
      debug: vi.fn(record),
    },
  };
}

describe("array mailer", () => {
  it("stores messages, clears them, and fails the next send on request", async () => {
    const mailer = createArrayMailer();
    expect(mailer.kind).toBe("array");
    await mailer.send(message);
    expect(mailer.outbox).toEqual([message]);
    mailer.clear();
    expect(mailer.outbox).toEqual([]);
    mailer.failNext();
    await expect(mailer.send(message)).rejects.toThrow();
    expect(mailer.outbox).toEqual([]);
    await mailer.send(message);
    expect(mailer.outbox).toHaveLength(1);
  });
});

describe("log mailer", () => {
  it("should not put the token, link, body or recipient in log output", async () => {
    const { logger, lines } = spyLogger();
    const mailer = createLogMailer(logger);
    expect(mailer.kind).toBe("log");
    await mailer.send(message);
    const output = lines.join("\n");
    expect(output).toContain(message.subject);
    expect(output).not.toContain("SECRETTOKEN");
    expect(output).not.toContain("set-password");
    expect(output).not.toContain(message.to);
    expect(output).toContain(maskEmail(message.to));
  });

  it("masks recipients", () => {
    expect(maskEmail("someone@example.com")).toBe("s***@example.com");
    expect(maskEmail("not-an-email")).toBe("***");
  });
});

describe("createMailer", () => {
  it("should refuse the smtp mailer under NODE_ENV=test", () => {
    const { logger } = spyLogger();
    expect(() =>
      createMailer(
        {
          ...base,
          NODE_ENV: "test",
          MAIL_MAILER: "smtp",
          MAIL_HOST: "smtp.example",
          MAIL_FROM_ADDRESS: "school@example.com",
        },
        logger,
      ),
    ).toThrow(/NODE_ENV=test/);
  });

  it("defaults to the log mailer and honours array", () => {
    const { logger } = spyLogger();
    expect(createMailer(base, logger).kind).toBe("log");
    expect(createMailer({ ...base, MAIL_MAILER: "array" }, logger).kind).toBe("array");
    expect(createMailer({ ...base, NODE_ENV: "test" }, logger).kind).toBe("log");
  });

  it("builds an smtp mailer outside test without connecting", () => {
    const { logger } = spyLogger();
    const mailer = createMailer(
      {
        ...base,
        MAIL_MAILER: "smtp",
        MAIL_HOST: "smtp.example",
        MAIL_FROM_ADDRESS: "school@example.com",
      },
      logger,
    );
    expect(mailer.kind).toBe("smtp");
  });
});

describe("SMTP options", () => {
  it("should map ssl/tls/none to the right SMTP options with timeouts and no network", () => {
    const ssl = buildSmtpOptions({ ...base, MAIL_HOST: "smtp.example", MAIL_ENCRYPTION: "ssl" });
    expect(ssl).toMatchObject({ host: "smtp.example", port: 465, secure: true, requireTLS: false });
    expect(ssl.auth).toBeUndefined();
    expect(ssl).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    const tls = buildSmtpOptions({ ...base, MAIL_HOST: "smtp.example", MAIL_ENCRYPTION: "tls" });
    expect(tls).toMatchObject({ port: 587, secure: false, requireTLS: true });
    expect(
      buildSmtpOptions({ ...base, MAIL_HOST: "h", MAIL_ENCRYPTION: "starttls" }),
    ).toMatchObject({ port: 587, requireTLS: true });
    expect(
      buildSmtpOptions({ ...base, MAIL_HOST: "h", MAIL_ENCRYPTION: "smtps" }),
    ).toMatchObject({ port: 465, secure: true });

    const plain = buildSmtpOptions({ ...base, MAIL_HOST: "h", MAIL_ENCRYPTION: "none" });
    expect(plain).toMatchObject({ secure: false, requireTLS: false });

    const explicitPort = buildSmtpOptions({
      ...base,
      MAIL_HOST: "h",
      MAIL_ENCRYPTION: "ssl",
      MAIL_PORT: 2465,
    });
    expect(explicitPort.port).toBe(2465);
  });

  it("sets auth only when both credentials are present", () => {
    expect(buildSmtpOptions({ ...base, MAIL_HOST: "h", MAIL_USERNAME: "u" }).auth).toBeUndefined();
    expect(buildSmtpOptions({ ...base, MAIL_HOST: "h", MAIL_PASSWORD: "p" }).auth).toBeUndefined();
    expect(
      buildSmtpOptions({ ...base, MAIL_HOST: "h", MAIL_USERNAME: "u", MAIL_PASSWORD: "p" }).auth,
    ).toEqual({ user: "u", pass: "p" });
  });

  it("resolves the default mailer and from name in code", () => {
    const settings = resolveMailSettings(base);
    expect(settings.mailer).toBe("log");
    expect(settings.fromName).toBe("Lumina ESL");
  });
});
