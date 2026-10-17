import { describe, it, expect, vi, beforeEach } from "vitest";

const TOPIC = "arn:aws:sns:us-east-1:123456789012:carnaghan-admin-alerts";

/**
 * ALERT_TOPIC_ARN is read once at module load, so each test sets the env then
 * imports the module fresh.
 */
async function loadAlerts(topicArn?: string) {
  vi.resetModules();
  if (topicArn === undefined) {
    delete process.env.ALERT_TOPIC_ARN;
  } else {
    process.env.ALERT_TOPIC_ARN = topicArn;
  }

  const mockSend = vi.fn().mockResolvedValue({});
  vi.doMock("@aws-sdk/client-sns", () => ({
    SNSClient: class {
      send = mockSend;
    },
    PublishCommand: class {
      constructor(public input: unknown) {}
    },
  }));

  const mod = await import("./alerts");
  return { mod, mockSend };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyFailure", () => {
  it("publishes to the configured topic", async () => {
    const { mod, mockSend } = await loadAlerts(TOPIC);

    const published = await mod.notifyFailure({
      subject: "deploy failed",
      message: "something broke",
    });

    expect(published).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const input = (mockSend.mock.calls[0][0] as { input: Record<string, string> }).input;
    expect(input.TopicArn).toBe(TOPIC);
    expect(input.Subject).toBe("deploy failed");
    expect(input.Message).toContain("something broke");
  });

  it("is a no-op when no topic is configured", async () => {
    const { mod, mockSend } = await loadAlerts(undefined);

    const published = await mod.notifyFailure({ subject: "s", message: "m" });

    expect(published).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("treats an empty topic ARN as disabled", async () => {
    const { mod, mockSend } = await loadAlerts("");
    expect(await mod.notifyFailure({ subject: "s", message: "m" })).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("never throws when publishing fails", async () => {
    const { mod, mockSend } = await loadAlerts(TOPIC);
    mockSend.mockRejectedValue(new Error("SNS is down"));

    await expect(mod.notifyFailure({ subject: "s", message: "m" })).resolves.toBe(false);
  });

  it("appends context lines to the body", async () => {
    const { mod, mockSend } = await loadAlerts(TOPIC);

    await mod.notifyFailure({
      subject: "deploy failed",
      message: "the reason",
      context: { "Triggered by": "ian@example.com", "Failed at": "2026-07-03T10:00:00Z" },
    });

    const input = (mockSend.mock.calls[0][0] as { input: Record<string, string> }).input;
    expect(input.Message).toContain("the reason");
    expect(input.Message).toContain("Triggered by: ian@example.com");
    expect(input.Message).toContain("Failed at: 2026-07-03T10:00:00Z");
  });

  it("omits undefined and empty context values", async () => {
    const { mod, mockSend } = await loadAlerts(TOPIC);

    await mod.notifyFailure({
      subject: "s",
      message: "m",
      context: { Present: "yes", Missing: undefined, Blank: "" },
    });

    const input = (mockSend.mock.calls[0][0] as { input: Record<string, string> }).input;
    expect(input.Message).toContain("Present: yes");
    expect(input.Message).not.toContain("Missing");
    expect(input.Message).not.toContain("Blank");
  });
});

describe("subject sanitising", () => {
  it("truncates subjects over the SNS 100-character limit", async () => {
    const { mod } = await loadAlerts(TOPIC);
    const long = "x".repeat(150);
    const result = mod.__testables.sanitizeSubject(long);

    expect(result.length).toBe(100);
    expect(result.endsWith("...")).toBe(true);
  });

  it("collapses newlines, which SNS rejects in subjects", async () => {
    const { mod } = await loadAlerts(TOPIC);
    expect(mod.__testables.sanitizeSubject("line one\nline two")).toBe("line one line two");
  });

  it("falls back to a default for a blank subject", async () => {
    const { mod } = await loadAlerts(TOPIC);
    expect(mod.__testables.sanitizeSubject("   ")).toBe("Deployment failure");
  });

  it("leaves a normal subject untouched", async () => {
    const { mod } = await loadAlerts(TOPIC);
    expect(mod.__testables.sanitizeSubject("carnaghan.com deploy failed")).toBe(
      "carnaghan.com deploy failed"
    );
  });
});
