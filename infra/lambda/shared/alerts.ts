/**
 * Shared failure-alert helper.
 *
 * Publishes operational failures to an SNS topic so unattended automation
 * doesn't fail silently. The scheduled-publish rule runs hourly with nobody
 * watching, so without this the only signal is the admin Deploy page or
 * CloudWatch.
 *
 * Best-effort by design: never throws. A notification problem must not mask or
 * replace the underlying failure being reported.
 *
 * Env:
 *   - ALERT_TOPIC_ARN : SNS topic ARN. When unset, alerting is disabled and
 *                       every call is a no-op (keeps local runs and tests quiet).
 */

const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN || "";

export interface FailureAlert {
  /** Short summary, used as the email subject (SNS caps subjects at 100 chars). */
  subject: string;
  /** Full detail for the body. */
  message: string;
  /** Optional extra key/value context appended to the body. */
  context?: Record<string, string | number | undefined>;
}

/** SNS rejects subjects over 100 characters or containing newlines. */
function sanitizeSubject(subject: string): string {
  const flat = subject.replace(/\s+/g, " ").trim() || "Deployment failure";
  return flat.length > 100 ? `${flat.slice(0, 97)}...` : flat;
}

function formatBody(alert: FailureAlert): string {
  const lines = [alert.message, ""];
  if (alert.context) {
    for (const [key, value] of Object.entries(alert.context)) {
      if (value !== undefined && value !== "") lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

/**
 * Send a failure alert. Returns true if published, false if disabled or failed.
 *
 * The AWS SDK is imported lazily so this module loads in tests without the
 * package present, matching the approach in `audit.ts`.
 */
export async function notifyFailure(alert: FailureAlert): Promise<boolean> {
  if (!ALERT_TOPIC_ARN) return false;

  try {
    const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns");
    const client = new SNSClient({});

    await client.send(
      new PublishCommand({
        TopicArn: ALERT_TOPIC_ARN,
        Subject: sanitizeSubject(alert.subject),
        Message: formatBody(alert),
      })
    );
    return true;
  } catch (err) {
    console.error("Failed to publish failure alert:", err);
    return false;
  }
}

// Exported for unit testing.
export const __testables = { sanitizeSubject, formatBody };
