# Security Policy

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

If you believe you found a vulnerability in this example, contact Glean Support at `support@glean.com` and include:

- A description of the issue
- Steps to reproduce
- Any affected deployment configuration
- Whether any credentials, legal documents, customer data, or Glean data may have been exposed

## Secret Handling

This repository must remain public-safe.

Do not commit:

- Customer contracts, legal documents, playbooks, transcripts, or redline output
- Glean API keys, OAuth tokens, OAuth client IDs or secrets, or refresh tokens
- AWS access keys, session tokens, account-specific deployment outputs, or generated CloudFormation outputs
- Microsoft tenant IDs, production manifest files, or customer-specific add-in configuration
- Customer-specific Agent IDs, Glean instance names, backend URLs, admin emails, or Cognito credentials

Use `deployment/config/prod.env`, AWS Secrets Manager, DynamoDB configuration, environment variables outside source control, or a customer's own secret-management process for deployment-specific values.

## Deployment Security

Glean Legal Redlining for Word is a customer-deployable example. Review the generated AWS resources, OAuth mode, Dynamic Client Registration behavior, DynamoDB defaults, WAF rules, and Microsoft 365 add-in deployment model against your organization's requirements before production use.

AI-generated redline suggestions must be reviewed by qualified users before they are applied to legal documents. This example is not legal advice.
