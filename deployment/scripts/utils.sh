#!/bin/bash

# Shared utility functions for deployment scripts

# Color codes
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    echo ""
}

# Check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        log_info "Install it from: https://aws.amazon.com/cli/"
        exit 1
    fi
}

# Check if AWS profile is configured
check_aws_profile() {
    local profile=$1
    if ! aws configure list --profile "$profile" &> /dev/null; then
        log_error "AWS profile '$profile' is not configured"
        log_info "Run: aws configure --profile $profile"
        exit 1
    fi
}

# Load environment configuration
load_env_config() {
    local env=$1
    # Find project root (where deployment/ directory exists)
    local project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    local config_file="$project_root/deployment/config/${env}.env"
    
    if [ ! -f "$config_file" ]; then
        log_error "Configuration file not found: $config_file"
        log_info "To fix this, run:"
        log_info "  cp deployment/config/${env}.env.example deployment/config/${env}.env"
        log_info "Then edit ${env}.env with your AWS profile, domain, certificate ARN, and Glean settings."
        log_info "See README.md Step 3 for details."
        exit 1
    fi
    
    log_info "Loading configuration from: $config_file"
    source "$config_file"
    
    # Validate required variables
    local required_vars=("AWS_PROFILE" "AWS_REGION" "STACK_NAME")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Required variable $var is not set in $config_file"
            exit 1
        fi
    done
}

# Get CloudFormation stack output
get_stack_output() {
    local stack_name=$1
    local output_key=$2
    local profile=$3
    local region=$4
    
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$region" \
        --profile "$profile" \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text 2>/dev/null
}

# Check if CloudFormation stack exists
stack_exists() {
    local stack_name=$1
    local profile=$2
    local region=$3
    
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$region" \
        --profile "$profile" \
        &> /dev/null
    
    return $?
}

# Wait for CloudFormation stack operation to complete
wait_for_stack() {
    local stack_name=$1
    local profile=$2
    local region=$3
    
    log_info "Waiting for stack operation to complete..."
    
    aws cloudformation wait stack-create-complete \
        --stack-name "$stack_name" \
        --region "$region" \
        --profile "$profile" 2>/dev/null || \
    aws cloudformation wait stack-update-complete \
        --stack-name "$stack_name" \
        --region "$region" \
        --profile "$profile" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        log_success "Stack operation completed successfully"
        return 0
    else
        log_error "Stack operation failed or timed out"
        return 1
    fi
}

# Create CloudFront invalidation
invalidate_cloudfront() {
    local distribution_id=$1
    local profile=$2
    local paths=$3
    
    log_info "Creating CloudFront invalidation..."
    
    local invalidation_id=$(aws cloudfront create-invalidation \
        --distribution-id "$distribution_id" \
        --profile "$profile" \
        --paths "$paths" \
        --query 'Invalidation.Id' \
        --output text)
    
    if [ $? -eq 0 ]; then
        log_success "Invalidation created: $invalidation_id"
        log_info "This may take 1-2 minutes to complete"
        return 0
    else
        log_error "Failed to create invalidation"
        return 1
    fi
}

# Export functions
export -f log_info
export -f log_success
export -f log_warning
export -f log_error
export -f log_section
export -f check_aws_cli
export -f check_aws_profile
export -f load_env_config
export -f get_stack_output
export -f stack_exists
export -f wait_for_stack
export -f invalidate_cloudfront
