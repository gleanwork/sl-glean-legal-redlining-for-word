#!/bin/bash

set -e

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# Parse arguments
ENV=${1:-prod}
SKIP_INVALIDATION=${2:-false}

log_section "Application Deployment Script"

# Load configuration
load_env_config "$ENV"

# Check prerequisites
check_aws_cli
check_aws_profile "$AWS_PROFILE"

# Get stack outputs
BUCKET_NAME=$(get_stack_output "$STACK_NAME" "WebsiteBucketName" "$AWS_PROFILE" "$AWS_REGION")
DISTRIBUTION_ID=$(get_stack_output "$STACK_NAME" "CloudFrontDistributionId" "$AWS_PROFILE" "$AWS_REGION")

if [ -z "$BUCKET_NAME" ]; then
    log_error "Could not retrieve bucket name from CloudFormation stack"
    log_info "Run deploy-infrastructure.sh first to create the stack"
    exit 1
fi

log_info "Environment: $ENV"
log_info "Bucket: $BUCKET_NAME"
log_info "Distribution: $DISTRIBUTION_ID"
log_info "Profile: $AWS_PROFILE"
log_info "Region: $AWS_REGION"
echo ""

# Navigate to project root
cd "$(dirname "$SCRIPT_DIR")/.."

log_section "Step 1: Generating Configuration Files"

# Get API Gateway URL from CloudFormation outputs
API_GATEWAY_URL=$(get_stack_output "$STACK_NAME" "ApiGatewayUrl" "$AWS_PROFILE" "$AWS_REGION")
if [ -z "$API_GATEWAY_URL" ]; then
    log_error "Could not retrieve API Gateway URL from CloudFormation stack"
    exit 1
fi

# Extract just the API Gateway ID from the full URL
API_GATEWAY_ID=$(echo "$API_GATEWAY_URL" | sed -n 's|https://\([^.]*\)\.execute-api.*|\1|p')

log_info "API Gateway URL: $API_GATEWAY_URL"
log_info "API Gateway ID: $API_GATEWAY_ID"
log_info "Domain: $DOMAIN_NAME"

# Get auth mode and config table from CloudFormation outputs
STACK_AUTH_MODE=$(get_stack_output "$STACK_NAME" "AuthMode" "$AWS_PROFILE" "$AWS_REGION")
CONFIG_TABLE=$(get_stack_output "$STACK_NAME" "ConfigTableName" "$AWS_PROFILE" "$AWS_REGION")
log_info "Auth Mode: ${STACK_AUTH_MODE:-cognito}"
log_info "Config Table: $CONFIG_TABLE"

# Get Cognito configuration (only in cognito mode)
if [ "$STACK_AUTH_MODE" != "sso" ]; then
    USER_POOL_ID=$(get_stack_output "$STACK_NAME" "UserPoolId" "$AWS_PROFILE" "$AWS_REGION")
    CLIENT_ID=$(get_stack_output "$STACK_NAME" "UserPoolClientId" "$AWS_PROFILE" "$AWS_REGION")
    
    if [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
        log_error "Could not retrieve Cognito configuration from CloudFormation stack"
        log_info "Ensure deploy-infrastructure.sh was run successfully"
        exit 1
    fi
    
    log_info "Cognito User Pool ID: $USER_POOL_ID"
    log_info "Cognito Client ID: $CLIENT_ID"
else
    USER_POOL_ID="unused"
    CLIENT_ID="unused"
    log_info "SSO mode: Cognito outputs not needed"
fi

# Generate api.js from template
log_info "Generating src/config/api.js from template..."
if [ ! -f "src/config/api.js.example" ]; then
    log_error "Template file src/config/api.js.example not found"
    exit 1
fi
sed "s|{{API_GATEWAY_URL}}|$API_GATEWAY_URL|g" src/config/api.js.example > src/config/api.js
log_success "Generated src/config/api.js"

# Generate login.js from template
log_info "Generating src/taskpane/login.js from template..."
if [ ! -f "src/taskpane/login.js.example" ]; then
    log_error "Template file src/taskpane/login.js.example not found"
    exit 1
fi
sed -e "s|{{USER_POOL_ID}}|$USER_POOL_ID|g" \
    -e "s|{{CLIENT_ID}}|$CLIENT_ID|g" \
    src/taskpane/login.js.example > src/taskpane/login.js
log_success "Generated src/taskpane/login.js"

# Generate auth.js from template
log_info "Generating src/taskpane/auth.js from template..."
if [ ! -f "src/taskpane/auth.js.example" ]; then
    log_error "Template file src/taskpane/auth.js.example not found"
    exit 1
fi
sed -e "s|{{CLIENT_ID}}|$CLIENT_ID|g" \
    src/taskpane/auth.js.example > src/taskpane/auth.js
log_success "Generated src/taskpane/auth.js"

# Generate glean-defaults.js from template
log_info "Generating src/config/glean-defaults.js from template..."
if [ ! -f "src/config/glean-defaults.js.example" ]; then
    log_error "Template file src/config/glean-defaults.js.example not found"
    exit 1
fi
sed -e "s|{{GLEAN_INSTANCE}}|${GLEAN_INSTANCE:-}|g" \
    -e "s|{{CHAT_AGENT_ID}}|${CHAT_AGENT_ID:-}|g" \
    -e "s|{{REDLINER_AGENT_ID}}|${REDLINER_AGENT_ID:-}|g" \
    -e "s|{{LISTING_AGENT_ID}}|${LISTING_AGENT_ID:-}|g" \
    -e "s|{{AUTH_MODE}}|${STACK_AUTH_MODE:-cognito}|g" \
    -e "s|{{OAUTH_CLIENT_TYPE}}|${OAUTH_CLIENT_TYPE:-dcr}|g" \
    -e "s|{{GLEAN_OAUTH_CLIENT_ID}}|${GLEAN_OAUTH_CLIENT_ID:-}|g" \
    src/config/glean-defaults.js.example > src/config/glean-defaults.js
log_success "Generated src/config/glean-defaults.js"

# Generate manifest.xml from template
log_info "Generating manifest.xml from template..."
if [ ! -f "manifest.xml.example" ]; then
    log_error "Template file manifest.xml.example not found"
    exit 1
fi
sed -e "s|{{DOMAIN_NAME}}|$DOMAIN_NAME|g" \
    -e "s|{{API_GATEWAY_ID}}|$API_GATEWAY_ID|g" \
    -e "s|{{GLEAN_INSTANCE}}|${GLEAN_INSTANCE:?GLEAN_INSTANCE is required in prod.env}|g" \
    manifest.xml.example > manifest.xml
log_success "Generated manifest.xml"

echo ""

# Seed DynamoDB config table (first deploy only, unless --force-seed)
if [ -n "$CONFIG_TABLE" ]; then
    log_section "Step 1b: Seeding DynamoDB Config"
    
    FORCE_SEED=false
    for arg in "$@"; do
        [ "$arg" = "--force-seed" ] && FORCE_SEED=true
    done
    
    # Check if config already exists
    EXISTING_CONFIG=$(aws dynamodb get-item \
        --table-name "$CONFIG_TABLE" \
        --key '{"PK": {"S": "CONFIG"}, "SK": {"S": "auth"}}' \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query 'Item.PK.S' \
        --output text 2>/dev/null)
    
    if [ "$EXISTING_CONFIG" = "CONFIG" ] && [ "$FORCE_SEED" = "false" ]; then
        log_info "Config already exists in DynamoDB — skipping seed (use --force-seed to overwrite)"
        
        # Always sync critical auth values even when skipping full seed
        if [ "$STACK_AUTH_MODE" = "sso" ]; then
            aws dynamodb update-item \
                --table-name "$CONFIG_TABLE" \
                --key '{"PK":{"S":"CONFIG"},"SK":{"S":"auth"}}' \
                --update-expression "SET oauthClientId = :cid, authMode = :mode, oauthClientType = :ctype" \
                --expression-attribute-values "{\":cid\":{\"S\":\"${GLEAN_OAUTH_CLIENT_ID:-}\"},\":mode\":{\"S\":\"sso\"},\":ctype\":{\"S\":\"${OAUTH_CLIENT_TYPE:-dcr}\"}}" \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" 2>/dev/null
            log_info "Synced oauthClientId to DynamoDB"
        fi
    else
        if [ "$FORCE_SEED" = "true" ]; then
            log_warning "Force-seeding DynamoDB config (overwriting existing values)"
        else
            log_info "First deploy — seeding DynamoDB config from prod.env"
        fi
        
        # Build admin emails list
        ADMIN_EMAILS_JSON="[]"
        if [ -n "$ADMIN_EMAILS" ]; then
            # Convert comma-separated to JSON array
            ADMIN_EMAILS_JSON=$(echo "$ADMIN_EMAILS" | python3 -c "import sys,json; print(json.dumps([e.strip() for e in sys.stdin.read().strip().split(',')]))") 
        fi
        
        # Seed auth config
        aws dynamodb put-item \
            --table-name "$CONFIG_TABLE" \
            --item "{
                \"PK\": {\"S\": \"CONFIG\"},
                \"SK\": {\"S\": \"auth\"},
                \"authMode\": {\"S\": \"${STACK_AUTH_MODE:-cognito}\"},
                \"oauthClientType\": {\"S\": \"${OAUTH_CLIENT_TYPE:-dcr}\"},
                \"oauthClientId\": {\"S\": \"${GLEAN_OAUTH_CLIENT_ID:-}\"},
                \"adminEmails\": {\"L\": $(echo "$ADMIN_EMAILS_JSON" | python3 -c "import sys,json; emails=json.load(sys.stdin); print(json.dumps([{'S': e} for e in emails]))")}
            }" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION"
        log_success "Seeded auth config"
        
        # Seed agents config
        aws dynamodb put-item \
            --table-name "$CONFIG_TABLE" \
            --item "{
                \"PK\": {\"S\": \"CONFIG\"},
                \"SK\": {\"S\": \"agents\"},
                \"redlinerAgentId\": {\"S\": \"${REDLINER_AGENT_ID:-}\"},
                \"chatAgentId\": {\"S\": \"${CHAT_AGENT_ID:-}\"},
                \"listingAgentId\": {\"S\": \"${LISTING_AGENT_ID:-}\"}
            }" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION"
        log_success "Seeded agents config"
        
        # Seed instance config
        aws dynamodb put-item \
            --table-name "$CONFIG_TABLE" \
            --item "{
                \"PK\": {\"S\": \"CONFIG\"},
                \"SK\": {\"S\": \"instance\"},
                \"gleanInstance\": {\"S\": \"${GLEAN_INSTANCE:-}\"}
            }" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION"
        log_success "Seeded instance config"
        
        # Seed defaults config
        aws dynamodb put-item \
            --table-name "$CONFIG_TABLE" \
            --item '{
                "PK": {"S": "CONFIG"},
                "SK": {"S": "defaults"},
                "defaultPlaybook": {"M": {"name": {"S": ""}, "url": {"S": ""}}},
                "defaultTemplate": {"M": {"name": {"S": ""}, "url": {"S": ""}}},
                "trackChangesDefault": {"BOOL": true},
                "notificationsDefault": {"BOOL": true}
            }' \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION"
        log_success "Seeded defaults config"
        
        log_success "DynamoDB config seeding complete"
    fi
fi

log_section "Step 2: Syncing Application Files"

# Sync src/ directory to S3, maintaining structure
log_info "Uploading files from src/ to S3..."

aws s3 sync src/ "s3://$BUCKET_NAME/" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --exclude "*.DS_Store" \
    --exclude "*.map" \
    --exclude "*.bak" \
    --exclude "*.fixed" \
    --exclude "*.fixed2" \
    --exclude "*.tmp" \
    --exclude "*.example" \
    --exclude "manifest.xml" \
    --delete \
    --cache-control "max-age=300"

log_success "Files synced successfully"

# Upload manifest.xml to S3 root for public hosting via URL
log_info "Uploading manifest.xml to S3..."
aws s3 cp manifest.xml "s3://$BUCKET_NAME/manifest.xml" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --content-type "text/xml" \
    --cache-control "max-age=300"
log_success "Manifest uploaded to S3"

log_section "Step 3: Setting Content Types and Cache Headers"

# Set correct content-type for HTML files
log_info "Setting content-type for HTML files..."
aws s3 cp "s3://$BUCKET_NAME/taskpane/" "s3://$BUCKET_NAME/taskpane/" \
    --recursive \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --exclude "*" \
    --include "*.html" \
    --content-type "text/html" \
    --cache-control "$CACHE_CONTROL_HTML" \
    --metadata-directive REPLACE

# Set correct content-type for JavaScript files
log_info "Setting content-type for JavaScript files..."
aws s3 cp "s3://$BUCKET_NAME/" "s3://$BUCKET_NAME/" \
    --recursive \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --exclude "*" \
    --include "*.js" \
    --content-type "application/javascript" \
    --cache-control "$CACHE_CONTROL_JS" \
    --metadata-directive REPLACE

# Set correct content-type for CSS files
log_info "Setting content-type for CSS files..."
aws s3 cp "s3://$BUCKET_NAME/" "s3://$BUCKET_NAME/" \
    --recursive \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --exclude "*" \
    --include "*.css" \
    --content-type "text/css" \
    --cache-control "$CACHE_CONTROL_CSS" \
    --metadata-directive REPLACE

# Set correct content-type for image files
log_info "Setting content-type for image files..."
aws s3 cp "s3://$BUCKET_NAME/assets/" "s3://$BUCKET_NAME/assets/" \
    --recursive \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --exclude "*" \
    --include "*.png" \
    --content-type "image/png" \
    --cache-control "$CACHE_CONTROL_ASSETS" \
    --metadata-directive REPLACE

log_success "Content types and cache headers set"

log_section "Step 4: Verifying Deployment"

# List deployed files
log_info "Deployed file structure:"
aws s3 ls "s3://$BUCKET_NAME/" --recursive --profile "$AWS_PROFILE" --human-readable | grep -E "(taskpane|services|utils|assets)" | head -20

# Verify critical files exist
log_info "Verifying critical files..."
CRITICAL_FILES=(
    "manifest.xml"
    "taskpane/taskpane.html"
    "taskpane/login.html"
    "taskpane/app.js"
    "taskpane/auth.js"
    "services/gleanApi.js"
    "services/settings.js"
)

for file in "${CRITICAL_FILES[@]}"; do
    if aws s3 ls "s3://$BUCKET_NAME/$file" --profile "$AWS_PROFILE" &> /dev/null; then
        log_success "✓ $file"
    else
        log_error "✗ $file (MISSING)"
    fi
done

if [ "$SKIP_INVALIDATION" = "false" ] && [ -n "$DISTRIBUTION_ID" ]; then
    log_section "Step 5: Invalidating CloudFront Cache"
    invalidate_cloudfront "$DISTRIBUTION_ID" "$AWS_PROFILE" "/*"
else
    log_warning "Skipping CloudFront invalidation"
fi

log_section "Deployment Complete!"

# Get CloudFront domain
CF_DOMAIN=$(get_stack_output "$STACK_NAME" "CloudFrontDomainName" "$AWS_PROFILE" "$AWS_REGION")

log_success "Application deployed successfully!"
echo ""
log_info "Access your add-in at:"
log_info "  https://$CF_DOMAIN/taskpane/taskpane.html"
echo ""
log_info "Login page:"
log_info "  https://$CF_DOMAIN/taskpane/login.html"
echo ""
if [ -n "$DOMAIN_NAME" ]; then
    log_info "Manifest URL (for IT deployment):"
    log_info "  https://$DOMAIN_NAME/manifest.xml"
    echo ""
fi

if [ "$SKIP_INVALIDATION" = "false" ]; then
    log_warning "Note: CloudFront cache invalidation may take 1-2 minutes"
    log_info "You can check status with:"
    log_info "  aws cloudfront get-distribution --id $DISTRIBUTION_ID --profile $AWS_PROFILE --query 'Distribution.Status'"
fi
