# Contributing

Thanks for your interest in improving Glean Legal Redlining for Word.

This repository is a customer-deployable Solution Library example for a Microsoft Word add-in backed by Glean Agents and AWS serverless infrastructure. Contributions should keep the sample easy to understand, public-safe, and deployable without committing secrets or customer data.

## Before You Start

1. Fork the repository.
2. Create a feature branch.
3. Read `README.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md`.
4. Confirm your change does not require committing customer-specific Glean, Microsoft 365, AWS, or legal-document data.

## Public-Safety Rules

- Do not commit customer contracts, excerpts, playbooks, transcripts, or redline output.
- Do not commit Glean API tokens, OAuth client secrets, AWS credentials, Microsoft tenant details, or generated deployment files.
- Keep deployment-specific values in `deployment/config/prod.env`, AWS Secrets Manager, DynamoDB configuration, or the customer's own secret-management process.
- Keep example screenshots, prompts, templates, and sample data generic.
- Treat AI-generated redline suggestions as review assistance. Do not present this example as legal advice or as a substitute for attorney review.

## Validation

Run the repository checks before opening a pull request:

```bash
npm install
npm run check
```

If your change affects Office add-in manifest generation, deploy scripts, or Microsoft Word behavior, also validate the generated manifest and test the add-in in Word.

## Pull Requests

Please include:

- A concise summary of the change
- Any deployment, Glean Agent, OAuth, AWS, or Microsoft 365 configuration impact
- The validation commands you ran
- Screenshots for visible UI changes

## Licensing

This project is licensed under the MIT License. By contributing, you agree that your contribution will be licensed under the same license.

## Code of Conduct

All contributors must follow `CODE_OF_CONDUCT.md`.

