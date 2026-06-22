#!/bin/bash

set -e

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# Parse arguments
ENV=${1:-prod}

log_section "Infrastructure Deployment Script"

# Load configuration
load_env_config "$ENV"

# Check prerequisites
check_aws_cli
check_aws_profile "$AWS_PROFILE"

log_info "Environment: $ENV"
log_info "Stack Name: $STACK_NAME"
log_info "Profile: $AWS_PROFILE"
log_info "Region: $AWS_REGION"
echo ""

# Resolve AWS Account ID (needed for template bucket naming)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text 2>/dev/null)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    log_error "Could not resolve AWS Account ID. Check your AWS_PROFILE credentials."
    exit 1
fi
log_info "Account ID: $AWS_ACCOUNT_ID"

# Check for required CloudFormation parameters
if [ -z "$DOMAIN_NAME" ]; then
    log_warning "DOMAIN_NAME not set in config"
    log_info "CloudFront will use default domain"
fi

if [ -z "$CERTIFICATE_ARN" ]; then
    log_warning "CERTIFICATE_ARN not set in config"
    log_info "SSL certificate will not be configured"
fi

# Navigate to deployment directory
cd "$(dirname "$SCRIPT_DIR")"

# Check if stack exists
if stack_exists "$STACK_NAME" "$AWS_PROFILE" "$AWS_REGION"; then
    log_info "Stack '$STACK_NAME' exists - will update"
    ACTION="update"
else
    log_info "Stack '$STACK_NAME' does not exist - will create"
    ACTION="create"
fi

log_section "Deploying CloudFormation Stack"

# Build parameter overrides
PARAMS="DeploymentId=$DEPLOYMENT_ID"

if [ -n "$DOMAIN_NAME" ]; then
    PARAMS="$PARAMS DomainName=$DOMAIN_NAME"
fi

if [ -n "$CERTIFICATE_ARN" ]; then
    PARAMS="$PARAMS CertificateArn=$CERTIFICATE_ARN"
fi

# Auth mode aware parameter passing
if [ "$AUTH_MODE" = "sso" ]; then
    log_info "Auth mode: SSO (Glean OAuth)"
    PARAMS="$PARAMS AuthMode=sso"
    PARAMS="$PARAMS OAuthClientType=${OAUTH_CLIENT_TYPE:-dcr}"
    if [ -n "$GLEAN_OAUTH_CLIENT_ID" ]; then
        PARAMS="$PARAMS GleanOAuthClientId=$GLEAN_OAUTH_CLIENT_ID"
    fi
    if [ -n "$GLEAN_OAUTH_CLIENT_SECRET" ]; then
        PARAMS="$PARAMS GleanOAuthClientSecret=$GLEAN_OAUTH_CLIENT_SECRET"
    fi
    if [ -n "$GLEAN_INSTANCE" ]; then
        PARAMS="$PARAMS GleanInstance=$GLEAN_INSTANCE"
    fi
    # Cognito params default to 'unused' in CloudFormation — no need to pass them
else
    log_info "Auth mode: Cognito"
    PARAMS="$PARAMS AuthMode=cognito"
    if [ -n "$COGNITO_USER_EMAIL" ]; then
        PARAMS="$PARAMS CognitoUserEmail=$COGNITO_USER_EMAIL"
    fi
    if [ -n "$COGNITO_USER_PASSWORD" ]; then
        PARAMS="$PARAMS CognitoUserPassword=$COGNITO_USER_PASSWORD"
    fi
    if [ -n "$GLEAN_INSTANCE" ]; then
        PARAMS="$PARAMS GleanInstance=$GLEAN_INSTANCE"
    fi
fi

# Mask secrets for logging
PARAMS_LOG=$(echo "$PARAMS" | sed -E 's/(GleanOAuthClientSecret=)[^ ]*/\1***/g; s/(CognitoUserPassword=)[^ ]*/\1***/g')
log_info "Deploying stack with parameters:"
log_info "  $PARAMS_LOG"
echo ""

# Check template size - if > 51200 bytes, upload to S3 first
TEMPLATE_SIZE=$(wc -c < cloudformation.yaml | tr -d ' ')
if [ "$TEMPLATE_SIZE" -gt 51200 ]; then
    log_warning "Template size ($TEMPLATE_SIZE bytes) exceeds inline limit (51200 bytes)"
    log_info "Uploading template to S3..."
    
    # Get or create bucket name for templates
    TEMPLATE_BUCKET="glean-legal-addin-${DEPLOYMENT_ID}-${AWS_ACCOUNT_ID}-templates"
    TEMPLATE_KEY="cloudformation-$(date +%Y%m%d-%H%M%S).yaml"
    
    # Ensure template bucket exists (required for fresh deployments)
    if ! aws s3 ls "s3://${TEMPLATE_BUCKET}" --profile "$AWS_PROFILE" --region "$AWS_REGION" &>/dev/null; then
        log_info "Creating template bucket: ${TEMPLATE_BUCKET}"
        aws s3 mb "s3://${TEMPLATE_BUCKET}" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION"
    fi
    
    # Upload template to S3
    aws s3 cp cloudformation.yaml "s3://${TEMPLATE_BUCKET}/${TEMPLATE_KEY}" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION"
    
    TEMPLATE_URL="https://${TEMPLATE_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${TEMPLATE_KEY}"
    log_success "Template uploaded to: s3://${TEMPLATE_BUCKET}/${TEMPLATE_KEY}"
    
    # Build parameters array for update-stack/create-stack
    PARAM_ARRAY=""
    
    # Add DeploymentId
    PARAM_ARRAY="ParameterKey=DeploymentId,ParameterValue=$DEPLOYMENT_ID"
    
    # Add DomainName
    if [ -n "$DOMAIN_NAME" ]; then
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=DomainName,ParameterValue=$DOMAIN_NAME"
    else
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=DomainName,UsePreviousValue=true"
    fi
    
    # Add CertificateArn
    if [ -n "$CERTIFICATE_ARN" ]; then
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=CertificateArn,ParameterValue=$CERTIFICATE_ARN"
    else
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=CertificateArn,UsePreviousValue=true"
    fi
    
    # Add AuthMode and OAuthClientType
    if [ "$AUTH_MODE" = "sso" ]; then
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=AuthMode,ParameterValue=sso"
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=OAuthClientType,ParameterValue=${OAUTH_CLIENT_TYPE:-dcr}"
    else
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=AuthMode,ParameterValue=cognito"
    fi
    
    # Add GleanInstance
    if [ -n "$GLEAN_INSTANCE" ]; then
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=GleanInstance,ParameterValue=$GLEAN_INSTANCE"
    else
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=GleanInstance,UsePreviousValue=true"
    fi
    
    # Add GleanOAuthClientId (SSO mode)
    if [ -n "$GLEAN_OAUTH_CLIENT_ID" ]; then
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=GleanOAuthClientId,ParameterValue=$GLEAN_OAUTH_CLIENT_ID"
    else
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=GleanOAuthClientId,UsePreviousValue=true"
    fi
    
    # Add GleanOAuthClientSecret (SSO mode)
    if [ -n "$GLEAN_OAUTH_CLIENT_SECRET" ]; then
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=GleanOAuthClientSecret,ParameterValue=$GLEAN_OAUTH_CLIENT_SECRET"
    else
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=GleanOAuthClientSecret,UsePreviousValue=true"
    fi
    
    # Add CognitoUserEmail
    if [ -n "$COGNITO_USER_EMAIL" ] && [ "$AUTH_MODE" != "sso" ]; then
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=CognitoUserEmail,ParameterValue=$COGNITO_USER_EMAIL"
    else
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=CognitoUserEmail,UsePreviousValue=true"
    fi
    
    # Add CognitoUserPassword
    if [ -n "$COGNITO_USER_PASSWORD" ] && [ "$AUTH_MODE" != "sso" ]; then
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=CognitoUserPassword,ParameterValue=$COGNITO_USER_PASSWORD"
    else
        PARAM_ARRAY="$PARAM_ARRAY ParameterKey=CognitoUserPassword,UsePreviousValue=true"
    fi
    
    # Use update-stack or create-stack with S3 URL
    if stack_exists "$STACK_NAME" "$AWS_PROFILE" "$AWS_REGION"; then
        log_info "Updating existing stack..."
        set +e
        UPDATE_OUTPUT=$(aws cloudformation update-stack \
            --stack-name "$STACK_NAME" \
            --template-url "$TEMPLATE_URL" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --parameters $PARAM_ARRAY \
            --capabilities CAPABILITY_NAMED_IAM 2>&1)
        UPDATE_EXIT=$?
        set -e
        
        if [ $UPDATE_EXIT -ne 0 ]; then
            if echo "$UPDATE_OUTPUT" | grep -q "No updates are to be performed"; then
                log_info "No CloudFormation changes detected - stack is up to date"
            else
                log_error "CloudFormation update failed: $UPDATE_OUTPUT"
                exit 1
            fi
        else
            log_info "Waiting for stack update to complete..."
            aws cloudformation wait stack-update-complete \
                --stack-name "$STACK_NAME" \
                --region "$AWS_REGION" \
                --profile "$AWS_PROFILE"
        fi
    else
        log_info "Creating new stack..."
        # For create-stack, we can't use UsePreviousValue, so build a clean param list
        CREATE_PARAMS="ParameterKey=DeploymentId,ParameterValue=$DEPLOYMENT_ID"
        [ -n "$DOMAIN_NAME" ] && CREATE_PARAMS="$CREATE_PARAMS ParameterKey=DomainName,ParameterValue=$DOMAIN_NAME"
        [ -n "$CERTIFICATE_ARN" ] && CREATE_PARAMS="$CREATE_PARAMS ParameterKey=CertificateArn,ParameterValue=$CERTIFICATE_ARN"
        [ -n "$GLEAN_INSTANCE" ] && CREATE_PARAMS="$CREATE_PARAMS ParameterKey=GleanInstance,ParameterValue=$GLEAN_INSTANCE"
        if [ "$AUTH_MODE" = "sso" ]; then
            CREATE_PARAMS="$CREATE_PARAMS ParameterKey=AuthMode,ParameterValue=sso"
            CREATE_PARAMS="$CREATE_PARAMS ParameterKey=OAuthClientType,ParameterValue=${OAUTH_CLIENT_TYPE:-dcr}"
            [ -n "$GLEAN_OAUTH_CLIENT_ID" ] && CREATE_PARAMS="$CREATE_PARAMS ParameterKey=GleanOAuthClientId,ParameterValue=$GLEAN_OAUTH_CLIENT_ID"
            [ -n "$GLEAN_OAUTH_CLIENT_SECRET" ] && CREATE_PARAMS="$CREATE_PARAMS ParameterKey=GleanOAuthClientSecret,ParameterValue=$GLEAN_OAUTH_CLIENT_SECRET"
        else
            CREATE_PARAMS="$CREATE_PARAMS ParameterKey=AuthMode,ParameterValue=cognito"
            [ -n "$COGNITO_USER_EMAIL" ] && CREATE_PARAMS="$CREATE_PARAMS ParameterKey=CognitoUserEmail,ParameterValue=$COGNITO_USER_EMAIL"
            [ -n "$COGNITO_USER_PASSWORD" ] && CREATE_PARAMS="$CREATE_PARAMS ParameterKey=CognitoUserPassword,ParameterValue=$COGNITO_USER_PASSWORD"
        fi
        
        aws cloudformation create-stack \
            --stack-name "$STACK_NAME" \
            --template-url "$TEMPLATE_URL" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --parameters $CREATE_PARAMS \
            --capabilities CAPABILITY_NAMED_IAM
        
        log_info "Waiting for stack creation to complete..."
        aws cloudformation wait stack-create-complete \
            --stack-name "$STACK_NAME" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    
    # Clean up template from S3 (no longer needed after stack operation)
    log_info "Cleaning up template from S3..."
    aws s3 rm "s3://${TEMPLATE_BUCKET}/${TEMPLATE_KEY}" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" 2>/dev/null || true
    
    DEPLOY_EXIT_CODE=$?
else
    # Template is small enough for inline deployment
    log_info "Using inline template deployment..."
    aws cloudformation deploy \
        --template-file cloudformation.yaml \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --parameter-overrides $PARAMS \
        --capabilities CAPABILITY_NAMED_IAM \
        --no-fail-on-empty-changeset
    
    DEPLOY_EXIT_CODE=$?
fi

if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    log_success "CloudFormation stack deployed successfully"
else
    log_error "CloudFormation deployment failed"
    exit 1
fi

# Redeploy API Gateway stage after stack updates
# CloudFormation doesn't automatically redeploy the stage when methods/integrations change
if [ "$ACTION" = "update" ]; then
    log_section "Redeploying API Gateway Stage"
    API_GATEWAY_URL=$(get_stack_output "$STACK_NAME" "ApiGatewayUrl" "$AWS_PROFILE" "$AWS_REGION")
    API_GATEWAY_ID=$(echo "$API_GATEWAY_URL" | sed -n 's|https://\([^.]*\)\.execute-api.*|\1|p')
    
    if [ -n "$API_GATEWAY_ID" ]; then
        log_info "API Gateway ID: $API_GATEWAY_ID"
        aws apigateway create-deployment \
            --rest-api-id "$API_GATEWAY_ID" \
            --stage-name prod \
            --description "Automated redeployment after CloudFormation stack update" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION"
        
        if [ $? -eq 0 ]; then
            log_success "API Gateway stage redeployed successfully"
        else
            log_warning "API Gateway redeployment failed - you may need to redeploy manually"
        fi
    else
        log_warning "Could not determine API Gateway ID - skipping stage redeployment"
    fi
fi

log_section "Retrieving Stack Outputs"

# Get all stack outputs
BUCKET_NAME=$(get_stack_output "$STACK_NAME" "WebsiteBucketName" "$AWS_PROFILE" "$AWS_REGION")
DISTRIBUTION_ID=$(get_stack_output "$STACK_NAME" "CloudFrontDistributionId" "$AWS_PROFILE" "$AWS_REGION")
CF_DOMAIN=$(get_stack_output "$STACK_NAME" "CloudFrontDomainName" "$AWS_PROFILE" "$AWS_REGION")
WEBSITE_URL=$(get_stack_output "$STACK_NAME" "WebsiteURL" "$AWS_PROFILE" "$AWS_REGION")
CONFIG_TABLE=$(get_stack_output "$STACK_NAME" "ConfigTableName" "$AWS_PROFILE" "$AWS_REGION")
STACK_AUTH_MODE=$(get_stack_output "$STACK_NAME" "AuthMode" "$AWS_PROFILE" "$AWS_REGION")

log_info "Stack Outputs:"
echo "  Bucket Name:       $BUCKET_NAME"
echo "  Distribution ID:   $DISTRIBUTION_ID"
echo "  CloudFront Domain: $CF_DOMAIN"
echo "  Website URL:       $WEBSITE_URL"
echo "  Config Table:      $CONFIG_TABLE"
echo "  Auth Mode:         $STACK_AUTH_MODE"

# Cognito-specific outputs (only available in cognito mode)
if [ "$STACK_AUTH_MODE" = "cognito" ]; then
    USER_POOL_ID=$(get_stack_output "$STACK_NAME" "UserPoolId" "$AWS_PROFILE" "$AWS_REGION")
    CLIENT_ID=$(get_stack_output "$STACK_NAME" "UserPoolClientId" "$AWS_PROFILE" "$AWS_REGION")
    USER_EMAIL=$(get_stack_output "$STACK_NAME" "CognitoUserEmail" "$AWS_PROFILE" "$AWS_REGION")
    echo "  User Pool ID:      $USER_POOL_ID"
    echo "  Client ID:         $CLIENT_ID"
    echo "  User Email:        $USER_EMAIL"
else
    USER_POOL_ID=""
    CLIENT_ID=""
    USER_EMAIL=""
fi
echo ""

# Save outputs to file for other scripts
OUTPUT_FILE="$(dirname "$SCRIPT_DIR")/.stack-outputs"
cat > "$OUTPUT_FILE" << EOF
BUCKET_NAME=$BUCKET_NAME
DISTRIBUTION_ID=$DISTRIBUTION_ID
CF_DOMAIN=$CF_DOMAIN
WEBSITE_URL=$WEBSITE_URL
USER_POOL_ID=$USER_POOL_ID
CLIENT_ID=$CLIENT_ID
USER_EMAIL=$USER_EMAIL
CONFIG_TABLE=$CONFIG_TABLE
AUTH_MODE=$STACK_AUTH_MODE
EOF

log_success "Stack outputs saved to: $OUTPUT_FILE"

log_section "Infrastructure Deployment Complete!"

if [ "$ACTION" = "create" ]; then
    log_warning "Note: CloudFront distribution creation takes 10-15 minutes"
    log_info "Check status with:"
    log_info "  aws cloudfront get-distribution --id $DISTRIBUTION_ID --profile $AWS_PROFILE --query 'Distribution.Status'"
    echo ""
fi

log_info "Next steps:"
log_info "  1. Run: ./scripts/deploy-app.sh $ENV"
log_info "  2. Access add-in at: $WEBSITE_URL"
echo ""

if [ -n "$DOMAIN_NAME" ] && [ "$DOMAIN_NAME" != "$CF_DOMAIN" ]; then
    # Opt-in DNS management (set MANAGE_DNS=true in the env config). Prod manages
    # its DNS manually, so this leaves prod untouched unless explicitly enabled.
    if [ "${MANAGE_DNS:-false}" = "true" ] && [ -n "$CF_DOMAIN" ]; then
        log_section "Upserting DNS Alias Record"
        ZONE_ID=$(find_hosted_zone_id "$DOMAIN_NAME" "$AWS_PROFILE") || ZONE_ID=""
        if [ -z "$ZONE_ID" ]; then
            log_warning "No Route 53 hosted zone found for $DOMAIN_NAME — create the record manually:"
            log_info "  $DOMAIN_NAME -> $CF_DOMAIN"
        else
            log_info "Hosted zone: $ZONE_ID"
            # CloudFront's fixed alias hosted zone id (global)
            CHANGE_BATCH=$(mktemp)
            cat > "$CHANGE_BATCH" <<EOF
{
  "Comment": "Alias ${DOMAIN_NAME} to CloudFront",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN_NAME}",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "${CF_DOMAIN}",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
EOF
            aws route53 change-resource-record-sets \
                --hosted-zone-id "$ZONE_ID" \
                --change-batch "file://${CHANGE_BATCH}" \
                --profile "$AWS_PROFILE" \
                --query "ChangeInfo.Id" \
                --output text
            rm -f "$CHANGE_BATCH"
            log_success "Alias record upserted: $DOMAIN_NAME -> $CF_DOMAIN"
        fi
    else
        log_warning "Don't forget to create DNS record:"
        log_info "  $DOMAIN_NAME -> $CF_DOMAIN (A-alias or CNAME)"
    fi
fi
