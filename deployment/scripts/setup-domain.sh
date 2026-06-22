#!/bin/bash

# Bootstraps the custom domain for an environment:
#   1. Ensures an ACM certificate (DNS validation) exists for DOMAIN_NAME in us-east-1
#   2. Publishes the ACM validation record into the matching Route 53 hosted zone
#   3. Waits for the certificate to be ISSUED
#   4. Writes CERTIFICATE_ARN back into deployment/config/<env>.env
#
# CloudFront requires the certificate in us-east-1, so the cert region is fixed
# regardless of AWS_REGION. The DNS alias to CloudFront is created later by
# deploy-infrastructure.sh once the distribution domain is known.
#
# Usage: ./scripts/setup-domain.sh <env>   (default env: prod)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

ENV=${1:-prod}
CERT_REGION="us-east-1"

log_section "Domain Bootstrap (ACM + Route 53)"

load_env_config "$ENV"
check_aws_cli
check_aws_profile "$AWS_PROFILE"

if [ -z "$DOMAIN_NAME" ]; then
    log_error "DOMAIN_NAME is not set in the $ENV config — nothing to bootstrap"
    exit 1
fi

CONFIG_FILE="$(cd "$SCRIPT_DIR/../.." && pwd)/deployment/config/${ENV}.env"

log_info "Environment:  $ENV"
log_info "Domain:       $DOMAIN_NAME"
log_info "Cert region:  $CERT_REGION"
log_info "Config file:  $CONFIG_FILE"
echo ""

# Replace or append KEY=VALUE in an env file (values with '=' inside are preserved).
update_env_var() {
    local file=$1 key=$2 value=$3
    if grep -q "^${key}=" "$file"; then
        awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' "$file" > "${file}.tmp" \
            && mv "${file}.tmp" "$file"
    else
        echo "${key}=${value}" >> "$file"
    fi
}

# Reuse an already-issued certificate if one exists for this exact domain.
EXISTING_ARN=$(aws acm list-certificates \
    --certificate-statuses ISSUED \
    --region "$CERT_REGION" \
    --profile "$AWS_PROFILE" \
    --query "CertificateSummaryList[?DomainName=='${DOMAIN_NAME}'].CertificateArn | [0]" \
    --output text 2>/dev/null)

if [ -n "$EXISTING_ARN" ] && [ "$EXISTING_ARN" != "None" ]; then
    log_success "Found existing ISSUED certificate for $DOMAIN_NAME"
    log_info "  $EXISTING_ARN"
    update_env_var "$CONFIG_FILE" "CERTIFICATE_ARN" "$EXISTING_ARN"
    log_success "Wrote CERTIFICATE_ARN to $CONFIG_FILE"
    exit 0
fi

log_info "No issued certificate found — requesting a new one (DNS validation)..."

ZONE_ID=$(find_hosted_zone_id "$DOMAIN_NAME" "$AWS_PROFILE") || {
    log_error "Could not find a Route 53 hosted zone for $DOMAIN_NAME"
    log_info "Create the hosted zone (or its parent) first, then re-run."
    exit 1
}
log_info "Hosted zone: $ZONE_ID"

CERT_ARN=$(aws acm request-certificate \
    --domain-name "$DOMAIN_NAME" \
    --validation-method DNS \
    --region "$CERT_REGION" \
    --profile "$AWS_PROFILE" \
    --query CertificateArn \
    --output text)
log_success "Requested certificate: $CERT_ARN"

# The validation ResourceRecord is populated asynchronously — poll briefly.
log_info "Waiting for ACM to publish the validation record..."
RR_NAME=""
for _ in $(seq 1 30); do
    RR_NAME=$(aws acm describe-certificate \
        --certificate-arn "$CERT_ARN" \
        --region "$CERT_REGION" \
        --profile "$AWS_PROFILE" \
        --query "Certificate.DomainValidationOptions[0].ResourceRecord.Name" \
        --output text 2>/dev/null)
    [ -n "$RR_NAME" ] && [ "$RR_NAME" != "None" ] && break
    sleep 2
done

if [ -z "$RR_NAME" ] || [ "$RR_NAME" = "None" ]; then
    log_error "Timed out waiting for ACM validation record details"
    exit 1
fi

RR_VALUE=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region "$CERT_REGION" \
    --profile "$AWS_PROFILE" \
    --query "Certificate.DomainValidationOptions[0].ResourceRecord.Value" \
    --output text)

log_info "Validation record: $RR_NAME -> $RR_VALUE"

CHANGE_BATCH=$(mktemp)
cat > "$CHANGE_BATCH" <<EOF
{
  "Comment": "ACM DNS validation for ${DOMAIN_NAME}",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${RR_NAME}",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{ "Value": "${RR_VALUE}" }]
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
log_success "Published validation record to Route 53"

log_info "Waiting for certificate to be ISSUED (this can take a few minutes)..."
aws acm wait certificate-validated \
    --certificate-arn "$CERT_ARN" \
    --region "$CERT_REGION" \
    --profile "$AWS_PROFILE"
log_success "Certificate issued: $CERT_ARN"

update_env_var "$CONFIG_FILE" "CERTIFICATE_ARN" "$CERT_ARN"
log_success "Wrote CERTIFICATE_ARN to $CONFIG_FILE"

log_section "Domain Bootstrap Complete"
log_info "Next: ./scripts/deploy-infrastructure.sh $ENV"
