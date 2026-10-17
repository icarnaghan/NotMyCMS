# Runbook: Scope the GitLab Deploy Role

**Status: not yet applied.** The deploy role currently uses `AdministratorAccess`.
The replacement policy is written and committed at
[`infra/deploy-role-policy.json`](../infra/deploy-role-policy.json) but has not
been attached. This is optional hygiene, not a prerequisite for anything — the
pipeline works as-is.

## Why bother

The deploy role is assumed from CI via OIDC. With `AdministratorAccess`, anything
that can run the pipeline gets full admin over the whole AWS account, not just
this project. The realistic threat isn't you deploying — it's a malicious
`postinstall` script in a transitive npm dependency running in CI, or a
compromised GitLab account. Scoping the role limits the blast radius to this
project's resources.

It's reversible: if the policy is missing a permission the deploy fails loudly,
and you re-attach `AdministratorAccess` to unblock.

## Prerequisite check

The policy assumes the account was bootstrapped with the **default** CDK
qualifier (`hnb659fds`). Confirm the bootstrap roles exist:

```bash
aws iam list-roles \
  --query "Roles[?starts_with(RoleName, 'cdk-hnb659fds-')].RoleName" \
  --output table
```

You should see roles like `cdk-hnb659fds-deploy-role-<ACCOUNT>-<REGION>`,
`...-file-publishing-role-...`, and `...-lookup-role-...`. If the prefix differs,
your account used a custom qualifier — update the `Resource` ARN pattern in the
`AssumeCdkDeploymentRoles` statement and the SSM parameter path to match.

## Why the policy is so small

`cdk deploy` does almost nothing with the CI role's own permissions. It assumes
the CDK bootstrap roles to do the real work (CloudFormation changesets, asset
publishing to the bootstrap bucket, context lookups). So the CI principal needs:

| Statement                  | Why                                                   |
| -------------------------- | ----------------------------------------------------- |
| `AssumeCdkDeploymentRoles` | Lets `cdk deploy` assume the bootstrap roles          |
| `ReadCdkBootstrapVersion`  | The CLI reads the bootstrap version SSM parameter     |
| `PublishAdminSpa`          | `aws s3 sync admin/dist/ s3://carnaghan.com/admin/`   |
| `ListSiteBucketForSync`    | `s3 sync` lists the prefix to diff local vs remote    |
| `InvalidateAdminCache`     | The `/admin/*` CloudFront invalidation after the sync |

The last three exist because those deploy-job steps run the AWS CLI directly with
the CI role's credentials, not through an assumed CDK role.

## Steps

1. **Fill in the placeholders.** Copy the policy and replace `<ACCOUNT_ID>` and
   `<REGION>` (e.g. `us-east-1`):

   ```bash
   ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   REGION=us-east-1

   sed -e "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" -e "s/<REGION>/${REGION}/g" \
     infra/deploy-role-policy.json > /tmp/deploy-role-policy.json
   ```

2. **Attach it** to the deploy role as an inline policy. Substitute your role
   name (the one behind the `AWS_DEPLOY_ROLE_ARN` CI variable):

   ```bash
   ROLE_NAME=gitlab-deploy

   aws iam put-role-policy \
     --role-name "${ROLE_NAME}" \
     --policy-name carnaghan-deploy-least-privilege \
     --policy-document file:///tmp/deploy-role-policy.json
   ```

3. **Verify before removing admin.** With both policies attached, the scoped one
   grants nothing new, so this run only proves the pipeline still works. Run the
   `deploy` job — or safer, a diff-only check:

   ```bash
   cd infra && npx cdk diff --all
   ```

4. **Detach `AdministratorAccess`:**

   ```bash
   aws iam detach-role-policy \
     --role-name "${ROLE_NAME}" \
     --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
   ```

5. **Validate for real.** Trigger a pipeline and run the manual `deploy` job. It
   must get through all three script steps: `cdk deploy --all`, the `s3 sync`, and
   the CloudFront invalidation.

## Rollback

```bash
aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

Then re-run the deploy job. Optionally remove the scoped policy:

```bash
aws iam delete-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name carnaghan-deploy-least-privilege
```

## Troubleshooting

| Symptom                                                   | Likely cause                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `is not authorized to perform: sts:AssumeRole on cdk-...` | Wrong bootstrap qualifier or region in the ARN pattern — re-run the prerequisite check         |
| `Need to perform AWS calls but no credentials configured` | `AWS_DEPLOY_ROLE_ARN` or the OIDC trust policy is the problem, not this policy                 |
| SSM `AccessDenied` on `/cdk-bootstrap/.../version`        | Qualifier mismatch in the `ReadCdkBootstrapVersion` resource path                              |
| `s3 sync` fails with `AccessDenied`                       | Bucket name changed, or objects are being written outside the `admin/` prefix                  |
| Invalidation fails                                        | `cloudfront:ListDistributions` needs `Resource: "*"` — it doesn't support resource-level perms |

## When this is done

Update the status line at the top of this file and the
"CI/CD — Scoped IAM Permissions" entry in
[`future-improvements.md`](./future-improvements.md).
