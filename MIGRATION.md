# Migration Guide: Cognito or Static OAuth to Glean SSO/DCR

This guide is for existing deployments that were originally configured with Cognito authentication or a static Glean OAuth client.

For new production deployments, use the README's recommended configuration:

```bash
AUTH_MODE=sso
OAUTH_CLIENT_TYPE=dcr
GLEAN_OAUTH_CLIENT_ID=
GLEAN_OAUTH_CLIENT_SECRET=
```

With SSO/DCR, users sign in with Glean and do not enter personal Glean API tokens.

## Migrate from Cognito to Glean SSO/DCR

### Prerequisites

- Existing deployment using `AUTH_MODE=cognito`.
- Admin access to the Glean instance.
- AWS CLI configured with permission to update the deployed stack.
- Admin email list for the add-in's org-level configuration.

### Step 1: Update `prod.env`

Edit `deployment/config/prod.env`:

```bash
AUTH_MODE=sso
OAUTH_CLIENT_TYPE=dcr

# DCR mode uses a public client registered dynamically.
# Leave static OAuth client fields blank.
GLEAN_OAUTH_CLIENT_ID=
GLEAN_OAUTH_CLIENT_SECRET=

# Cognito users do not carry over; seed admins explicitly.
ADMIN_EMAILS=admin@yourcompany.com
```

You can leave `COGNITO_USER_EMAIL` and `COGNITO_USER_PASSWORD` in the file. They are ignored when `AUTH_MODE=sso`.

### Step 2: Deploy Infrastructure

```bash
./deployment/scripts/deploy-infrastructure.sh prod
```

This updates:

- Lambda@Edge behavior for SSO mode.
- Config Lambda environment variables.
- OAuth and DCR helper endpoints.
- DynamoDB auth/config defaults.

### Step 3: Deploy Application and Reseed Defaults

```bash
./deployment/scripts/deploy-app.sh prod --force-seed
```

The `--force-seed` flag overwrites existing DynamoDB defaults with the new auth mode, OAuth client type, and admin list.

This updates:

- `src/config/glean-defaults.js` with `authMode: 'sso'` and `oauthClientType: 'dcr'`.
- Generated login/auth files.
- DynamoDB configuration.
- Hosted taskpane assets and manifest.

### Step 4: Verify

1. Open the add-in in Word.
2. Confirm the login screen shows **Sign in with Glean** instead of an email/password form.
3. Sign in with Glean.
4. Confirm the home screen loads.
5. Run template/playbook listing and a small redlining review.
6. Confirm admin access appears for emails in `ADMIN_EMAILS`.

## Migrate from Static OAuth to DCR

Static OAuth clients are still supported, but DCR is recommended for new production deployments because it dynamically registers a public client and does not require a client secret.

### Step 1: Update `prod.env`

```bash
AUTH_MODE=sso
OAUTH_CLIENT_TYPE=dcr
GLEAN_OAUTH_CLIENT_ID=
GLEAN_OAUTH_CLIENT_SECRET=
```

### Step 2: Deploy Infrastructure

```bash
./deployment/scripts/deploy-infrastructure.sh prod
```

This ensures the DCR registration Lambda and API Gateway `/oauth/register` endpoint are available.

### Step 3: Deploy Application and Reseed Defaults

```bash
./deployment/scripts/deploy-app.sh prod --force-seed
```

This updates:

- Generated `glean-defaults.js` to use `oauthClientType: 'dcr'`.
- DynamoDB auth configuration.
- Hosted app files.

### Step 4: Force Re-Authentication

Users should log out and sign in again after switching OAuth client modes. Old tokens from a static client may not have the expected scopes.

## How DCR Works

1. User clicks **Sign in with Glean**.
2. The add-in checks localStorage for a cached DCR `client_id`.
3. If none exists, the add-in calls `POST /oauth/register`.
4. The DCR Lambda checks DynamoDB for a cached client.
5. If no cached client exists, the Lambda registers a public OAuth client with Glean `/oauth/register`.
6. The Lambda caches the returned `client_id` in DynamoDB and returns it to the add-in.
7. The add-in uses that `client_id` for a standard OAuth2 PKCE authorize flow.
8. After authorization, the add-in exchanges the code directly with Glean `/oauth/token`.
9. Access-token refresh also goes directly to Glean.

## Static OAuth Mode

Use static OAuth only when your environment requires a pre-registered OAuth client:

```bash
AUTH_MODE=sso
OAUTH_CLIENT_TYPE=static
GLEAN_OAUTH_CLIENT_ID=<your-static-client-id>
GLEAN_OAUTH_CLIENT_SECRET=<your-static-client-secret>
```

Register the client in Glean Admin Console:

- Redirect URI: `https://<your-domain>/taskpane/oauth-callback.html`
- Scopes: `agents chat search`

In static mode, the client secret is stored in the OAuth token proxy Lambda environment and is never sent to the browser.

## Rollback to Cognito

Only use this if you intentionally want to return to demo/POC username-password mode.

```bash
AUTH_MODE=cognito
COGNITO_USER_EMAIL=admin@example.com
COGNITO_USER_PASSWORD=ChangeMe123!@#

./deployment/scripts/deploy-infrastructure.sh prod
./deployment/scripts/deploy-app.sh prod --force-seed
```

In Cognito mode, users sign in with Cognito credentials and must enter a Glean API token in the add-in settings.

## Security Notes

- DCR `client_id` values for public clients are not secrets.
- PKCE is required for OAuth flows.
- DCR mode does not store or transmit a client secret.
- Static OAuth mode stores the client secret only in Lambda environment variables.
- Switching auth modes requires users to sign out and sign in again.
