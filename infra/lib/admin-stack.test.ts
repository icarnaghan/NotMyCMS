import { beforeAll, describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AdminStack } from "./admin-stack";
import { siteConfig } from "./site-config";
import type { DeploymentConfig } from "./deployment";

/**
 * Tests for the admin stack's git wiring.
 *
 * The stacks had no tests at all — every infra test was a Lambda handler test. That was
 * a gap worth leaving alone until it guarded something consequential, and now it does:
 * GITLAB_PROJECT_ID decides **which repository content is written to**. It used to be
 * hardcoded here as the source repository; it is now the Content_Repo, read from config.
 *
 * Getting it wrong does not fail a deploy or a save. Content would simply be committed
 * to the wrong repository, and while commits are best-effort the only symptom is a
 * logged error behind a successful save. That is precisely the kind of mistake a
 * template assertion is cheap insurance against.
 */

const deployment: DeploymentConfig = {
  resourcePrefix: "testprefix",
  bucketName: "test-bucket",
  displayName: "Test Deployment",
  siteUrl: "https://test.example.com",
  costGuard: false,
};

// Synthesising the admin stack bundles six Lambdas with esbuild, which takes several
// seconds on a cold CI runner — enough to blow a 5s *per-test* timeout. The stack is a
// pure function of its props, so it is synthesised once in beforeAll (which gets its own
// generous timeout) and every test reads the ready template. Memoising inside a lazy
// template() was not enough: whichever test called it first still paid the whole synth
// cost against its own timeout, and in CI that test timed out.
let cachedTemplate: Template | undefined;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new AdminStack(app, "TestAdmin", {
    env: { account: "123456789012", region: "us-east-1" },
    deployment,
  });
  cachedTemplate = Template.fromStack(stack);
}, 120_000);

function template() {
  if (!cachedTemplate) throw new Error("template not synthesised — beforeAll did not run");
  return cachedTemplate;
}

/** Environment maps of the Lambdas that commit content. */
function gitLambdaEnvs(t: Template): Record<string, unknown>[] {
  const functions = t.findResources("AWS::Lambda::Function");
  return Object.values(functions)
    .map((fn) => fn.Properties?.Environment?.Variables as Record<string, unknown> | undefined)
    .filter((vars): vars is Record<string, unknown> =>
      Boolean(vars && "GITLAB_PROJECT_ID" in vars)
    );
}

describe("admin stack git wiring", () => {
  it("points the content Lambdas at the configured Content_Repo", () => {
    const envs = gitLambdaEnvs(template());

    // Content, media, taxonomy, and pages (the landing-page editor, which also commits
    // to the Content_Repo).
    expect(envs).toHaveLength(4);
    for (const vars of envs) {
      expect(vars.GITLAB_PROJECT_ID).toBe(siteConfig.git.contentProjectId);
      expect(vars.GITLAB_API_URL).toBe(siteConfig.git.apiUrl);
      expect(vars.GITLAB_BRANCH).toBe(siteConfig.git.branch);
      expect(vars.GIT_PROVIDER).toBe(siteConfig.git.provider);
    }
  });

  it("does not point them at the old source repository", () => {
    // The id the mirror used before content moved. Named explicitly: a regression here
    // would send every edit to the repository that is about to stop holding content, and
    // the failure is silent.
    const SOURCE_REPO_PROJECT_ID = "80629335";
    expect(siteConfig.git.contentProjectId).not.toBe(SOURCE_REPO_PROJECT_ID);

    for (const vars of gitLambdaEnvs(template())) {
      expect(vars.GITLAB_PROJECT_ID).not.toBe(SOURCE_REPO_PROJECT_ID);
    }
  });

  it("resolves the token secret per deployment rather than sharing one", () => {
    const t = template();
    t.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: `${deployment.resourcePrefix}-admin/gitlab-token`,
    });
    for (const vars of gitLambdaEnvs(t)) {
      // A CloudFormation Ref to the secret in this stack, not a literal ARN.
      expect(vars.GITLAB_TOKEN_SECRET_ARN).toEqual({
        Ref: expect.stringContaining("GitLabToken"),
      });
    }
  });

  it("retains the token secret, so redeploying cannot discard it", () => {
    template().hasResource("AWS::SecretsManager::Secret", {
      DeletionPolicy: "Retain",
    });
  });
});

/**
 * The deploy Lambda's S3 permissions.
 *
 * It writes prerendered per-page heads and removes them when a post is unpublished. Its
 * bucket access is a set of narrow explicit statements rather than `grantReadWrite`, so
 * each new object it touches needs a matching grant — and a missing one is invisible to
 * the handler tests, which mock the SDK and so never see AccessDenied. These assertions
 * exist because all three of the grants below were initially absent.
 */
describe("deploy Lambda S3 permissions", () => {
  /** A rendered IAM statement. Resource is an ARN or a CloudFormation Fn::Join. */
  interface Statement {
    Effect?: string;
    Action?: string | string[];
    Resource?: unknown;
  }

  /** Policy statements attached to the role the deploy function assumes. */
  function deployStatements(t: Template): Statement[] {
    const statements: Statement[] = [];
    for (const policy of Object.values(t.findResources("AWS::IAM::Policy"))) {
      const properties = policy.Properties as
        { Roles?: unknown; PolicyDocument?: { Statement?: Statement[] } } | undefined;
      if (!JSON.stringify(properties?.Roles ?? []).includes("DeployFnServiceRole")) continue;
      statements.push(...(properties?.PolicyDocument?.Statement ?? []));
    }
    return statements;
  }

  function matching(t: Template, action: string, effect = "Allow"): Statement[] {
    return deployStatements(t).filter((statement) => {
      const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action ?? ""];
      return statement.Effect === effect && actions.includes(action);
    });
  }

  /** Does a statement cover a key suffix, as an ARN join fragment? */
  function covers(statement: Statement, fragment: string): boolean {
    return JSON.stringify(statement.Resource ?? "").includes(fragment);
  }

  it("can read the SPA shell every prerendered page is built from", () => {
    const t = template();
    const gets = matching(t, "s3:GetObject");
    expect(gets.some((s) => covers(s, "/index.html"))).toBe(true);
  });

  it("can write prerendered pages", () => {
    const t = template();
    const puts = matching(t, "s3:PutObject");
    expect(puts.some((s) => covers(s, "/*/index.html"))).toBe(true);
  });

  it("can delete prerendered pages, so unpublishing removes them", () => {
    const t = template();
    const deletes = matching(t, "s3:DeleteObject");
    expect(deletes.length).toBeGreaterThan(0);
    expect(deletes.some((s) => covers(s, "/*/index.html"))).toBe(true);
  });

  it("is denied the admin application's own index.html", () => {
    const t = template();
    const denies = deployStatements(t).filter((s) => s.Effect === "Deny");

    expect(denies.some((s) => covers(s, "/admin/index.html"))).toBe(true);
  });

  /**
   * The deny has to stay narrower than the prefix. An earlier version denied `admin/*`,
   * which also covers deploy-status.json and deploy-history.json — the Lambda writes
   * both on every run, and an explicit deny beats the allow, so it would have failed
   * every deploy at the first status write.
   */
  it("does not deny the whole admin prefix, which would break every deploy", () => {
    const t = template();
    const denies = deployStatements(t).filter((s) => s.Effect === "Deny");

    for (const statement of denies) {
      const resource = JSON.stringify(statement.Resource ?? "");
      expect(resource).not.toContain("/admin/*");
    }

    // And the status files are still writable.
    const puts = matching(t, "s3:PutObject");
    expect(puts.some((s) => covers(s, "/admin/deploy-status.json"))).toBe(true);
    expect(puts.some((s) => covers(s, "/admin/deploy-history.json"))).toBe(true);
  });

  it("is not granted blanket write access to the bucket", () => {
    const t = template();
    for (const statement of matching(t, "s3:PutObject")) {
      const resource = JSON.stringify(statement.Resource ?? "");
      // A bare bucket-wide `/*` would make the deny above the only protection.
      expect(resource).not.toMatch(/"[^"]*arn[^"]*\/\*"/);
    }
  });
});
