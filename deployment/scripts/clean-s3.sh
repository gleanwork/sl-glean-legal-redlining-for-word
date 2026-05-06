#!/bin/bash

set -e

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# Parse arguments
ENV=${1:-prod}

log_section "S3 Cleanup Script"

# Load configuration
load_env_config "$ENV"

# Check prerequisites
check_aws_cli
check_aws_profile "$AWS_PROFILE"

# Get bucket name from CloudFormation
BUCKET_NAME=$(get_stack_output "$STACK_NAME" "WebsiteBucketName" "$AWS_PROFILE" "$AWS_REGION")

if [ -z "$BUCKET_NAME" ]; then
    log_error "Could not retrieve bucket name from CloudFormation stack"
    log_info "Make sure the stack '$STACK_NAME' exists and has been deployed"
    exit 1
fi

log_info "Bucket: $BUCKET_NAME"
log_info "Profile: $AWS_PROFILE"
log_info "Region: $AWS_REGION"
echo ""

# Confirm cleanup
read -p "This will remove duplicate and backup files from S3. Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Cleanup cancelled"
    exit 0
fi

log_section "Removing Duplicate Files"

# Remove root-level duplicates (files that should only be in taskpane/)
log_info "Removing root-level login files..."
aws s3 rm "s3://$BUCKET_NAME/login.html" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/login.css" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/login.js" --profile "$AWS_PROFILE" 2>/dev/null || true

log_info "Removing root-level taskpane files..."
aws s3 rm "s3://$BUCKET_NAME/taskpane.html" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/taskpane.js" --profile "$AWS_PROFILE" 2>/dev/null || true

log_section "Removing Backup Files"

# Remove .fixed, .bak, and other backup files
log_info "Removing backup files from taskpane/..."
aws s3 rm "s3://$BUCKET_NAME/taskpane/login.js.fixed" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/taskpane/login.js.fixed.bak" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/taskpane/login.js.fixed2" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/taskpane/login.js.fixed2.bak" --profile "$AWS_PROFILE" 2>/dev/null || true

log_info "Removing backup files from src/taskpane/..."
aws s3 rm "s3://$BUCKET_NAME/src/taskpane/login.js.fixed" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/src/taskpane/login.js.fixed.bak" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/src/taskpane/login.js.fixed2" --profile "$AWS_PROFILE" 2>/dev/null || true
aws s3 rm "s3://$BUCKET_NAME/src/taskpane/login.js.fixed2.bak" --profile "$AWS_PROFILE" 2>/dev/null || true

log_section "Removing Old Deployment Structures"

# Remove entire src/ directory from S3 (we'll deploy with correct structure)
log_info "Removing old src/ directory structure..."
aws s3 rm "s3://$BUCKET_NAME/src/" --recursive --profile "$AWS_PROFILE" 2>/dev/null || true

# Remove dist/ directory if it exists
log_info "Removing old dist/ directory..."
aws s3 rm "s3://$BUCKET_NAME/dist/" --recursive --profile "$AWS_PROFILE" 2>/dev/null || true

log_section "Cleanup Summary"

# List remaining files
log_info "Remaining files in bucket:"
aws s3 ls "s3://$BUCKET_NAME/" --recursive --profile "$AWS_PROFILE" --human-readable --summarize

log_success "S3 cleanup completed!"
log_info "Run deploy-app.sh to upload files with correct structure"
