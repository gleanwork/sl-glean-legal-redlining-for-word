# Migrating from Cognito to Glean SSO

This guide covers migrating an existing Cognito-based deployment to Glean OAuth SSO (PKCE flow).

## Prerequisites

- An existing deployment using `AUTH_MODE=cognito`
- Admin access to your Glean instance (to register an OAuth client)
- AWS CLI configured with appropriate permissions

## Step 1: Register OAuth Client in Glean

1. Log into your Glean admin console
2. Navigate to **Settings** → **Third-party access (OAuth)**
3. Click **Register new client**
4. Configure:
   - **Redirect URI**: `https://<your-domain>/taskpane/oauth-callback.html`
   - **Scopes**: `agents chat search`
5. Copy the **Client ID** and **Client Secret**

## Step 2: Update prod.env

Edit `deployment/config/prod.env`:

```bash
# Change auth mode
AUTH_MODE=sso

# Add OAuth credentials
GLEAN_OAUTH_CLIENT_ID=<your-client-id>
GLEAN_OAUTH_CLIENT_SECRET=<your-client-secret>

# Update admin emails (Cognito users won't carry over)
ADMIN_EMAILS=admin@yourcompany.com
```

You can leave the Cognito fields (`COGNITO_USER_EMAIL`, `COGNITO_USER_PASSWORD`) empty or as-is — they are ignored when `AUTH_MODE=sso`.

## Step 3: Deploy Infrastructure

```bash
./deployment/scripts/deploy-infrastructure.sh prod
```

This updates:
- **Lambda@Edge**: Switches authentication from Cognito JWT validation to SSO cookie/token validation
- **Config Lambda**: Updates auth mode in environment variables
- **OAuth Token Proxy Lambda**: Receives the client secret as an environment variable (never exposed to the client)
- **DynamoDB**: Seeds the new `authMode` and `oauthClientId` values

## Step 4: Deploy Application

```bash
./deployment/scripts/deploy-app.sh prod --force-seed
```

The `--force-seed` flag is required to overwrite the existing DynamoDB config with the new auth mode and admin emails.

This updates:
- **glean-defaults.js**: Regenerated with `authMode: 'sso'` and the OAuth client ID
- **auth.js / login.js**: Regenerated from templates with SSO support
- **DynamoDB config**: Seeded with new admin emails and auth settings

## Step 5: Verify

1. Open the add-in in Word (or refresh if already open)
2. You should see a **"Sign in with Glean"** button instead of email/password
3. Click the button — a dialog opens with your organization's SSO login
4. After successful authentication, the dialog closes and you're signed in
5. Verify admin access: open Settings → you should see the Admin section if your email is in `ADMIN_EMAILS`

## Rollback

To revert to Cognito:

```bash
# In prod.env
AUTH_MODE=cognito

# Redeploy
./deployment/scripts/deploy-infrastructure.sh prod
./deployment/scripts/deploy-app.sh prod --force-seed
```

## What Changes

| Component | Cognito | SSO |
|---|---|---|
| Login UI | Email/password form | "Sign in with Glean" button |
| Token source | Cognito User Pool | Glean OAuth (PKCE) |
| Token refresh | Cognito refresh token | OAuth refresh token via Lambda proxy |
| Client secret | N/A | Stored in Lambda env var (never in client code) |
| User management | Cognito User Pool | Your organization's IdP (via Glean) |
| Admin seeding | From `COGNITO_USER_EMAIL` | From `ADMIN_EMAILS` in prod.env |

## What Stays the Same

- All API Lambdas (Listing, Analysis, Chat) work identically — they accept tokens from either auth mode
- CloudFront, S3, WAF, DynamoDB infrastructure is unchanged
- The Word Add-in manifest does not change
- User settings (API token, agent IDs) stored in localStorage persist

---

# Migrating from Static OAuth Client to DCR

Dynamic Client Registration (DCR) automatically registers a public OAuth client with Glean. Unlike static clients, DCR grants **all scopes (including `agents`) to all users** regardless of their Glean admin role.

## When to Use DCR

- **Recommended for all new deployments** (it's the default)
- Required when non-admin users need the `agents` scope (e.g., to call Glean Agents API)
- Static clients restrict `agents` scope to users with the "Agents admin" role

## Step 1: Update prod.env

```bash
# Set OAuth client type to DCR (this is now the default)
OAUTH_CLIENT_TYPE=dcr

# Static client fields can be left empty for DCR mode
GLEAN_OAUTH_CLIENT_ID=
GLEAN_OAUTH_CLIENT_SECRET=
```

## Step 2: Deploy Infrastructure

```bash
./deployment/scripts/deploy-infrastructure.sh prod
```

This creates:
- **DCR Registration Lambda**: Registers a public OAuth client with Glean and caches the `client_id` in DynamoDB
- **API Gateway `/oauth/register` endpoint**: Proxies DCR requests from the browser to the Lambda

## Step 3: Deploy Application

```bash
./deployment/scripts/deploy-app.sh prod --force-seed
```

This updates:
- **glean-defaults.js**: Sets `oauthClientType: 'dcr'`
- **DynamoDB config**: Seeds `oauthClientType` value

## Step 4: Test

1. All existing users must **log out and log back in** (their old tokens from the static client won't have the right scopes)
2. On first login, the add-in will call the DCR Lambda to register a client (subsequent logins reuse the cached `client_id`)
3. Verify agents work for non-admin users who previously got 401 errors

## How DCR Works

1. User clicks "Sign in with Glean"
2. Client checks localStorage for a cached DCR `client_id`
3. If none → calls `POST /oauth/register` Lambda → Lambda checks DynamoDB cache → if miss, registers with Glean `/oauth/register` → caches `client_id` in DynamoDB + returns it
4. Client uses the `client_id` to build the OAuth authorize URL (standard PKCE flow)
5. After authorization, client exchanges the code **directly with Glean** `/oauth/token` (no Lambda proxy needed — public client with PKCE)
6. Token refresh also goes directly to Glean

## Rollback to Static Client

```bash
# In prod.env
OAUTH_CLIENT_TYPE=static
GLEAN_OAUTH_CLIENT_ID=<your-static-client-id>
GLEAN_OAUTH_CLIENT_SECRET=<your-static-client-secret>

# Redeploy
./deployment/scripts/deploy-infrastructure.sh prod
./deployment/scripts/deploy-app.sh prod --force-seed
```

Users must log out and log back in after switching modes.

## Security Notes

- DCR `client_id` for public clients is **not a secret** — safe in DynamoDB and localStorage
- PKCE is **required** for all OAuth flows (already enforced)
- No `client_secret` is stored or transmitted in DCR mode
- Redirect URI validation is enforced by both the Lambda and Glean's authorization server
