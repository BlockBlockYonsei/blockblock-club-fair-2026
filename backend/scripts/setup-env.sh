#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${BACKEND_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${BACKEND_DIR}/.env.example" "${ENV_FILE}"
fi

read -r -p "CONTRACT_PACKAGE_ID (0x...): " CONTRACT_PACKAGE_ID
read -r -p "MINT_CONFIG_OBJECT_ID (0x...): " MINT_CONFIG_OBJECT_ID
read -r -s -p "SPONSOR_PRIVATE_KEY (suiprivkey...): " SPONSOR_PRIVATE_KEY
echo
read -r -p "PUBLIC_BASE_URL (optional, Enter to skip): " PUBLIC_BASE_URL
read -r -p "S3_BUCKET_NAME (optional, Enter to skip): " S3_BUCKET_NAME
read -r -p "S3_REGION [ap-northeast-2]: " S3_REGION
read -r -p "S3_PUBLIC_BASE_URL (optional, Enter to skip): " S3_PUBLIC_BASE_URL
read -r -p "S3_OBJECT_PREFIX [generated]: " S3_OBJECT_PREFIX
read -r -p "ALLOWED_ORIGINS [http://localhost:5173,https://blockblock-club-fair-2026.onrender.com]: " ALLOWED_ORIGINS
read -r -p "TRUST_PROXY [false]: " TRUST_PROXY

if [[ -z "${ALLOWED_ORIGINS}" ]]; then
  ALLOWED_ORIGINS="http://localhost:5173,https://blockblock-club-fair-2026.onrender.com"
fi

if [[ -z "${TRUST_PROXY}" ]]; then
  TRUST_PROXY="false"
fi

if [[ -z "${S3_REGION}" ]]; then
  S3_REGION="ap-northeast-2"
fi

if [[ -z "${S3_OBJECT_PREFIX}" ]]; then
  S3_OBJECT_PREFIX="generated"
fi

replace_key() {
  local key="$1"
  local value="$2"
  local escaped_value
  escaped_value="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s/^${key}=.*/${key}=${escaped_value}/" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

replace_key "CONTRACT_PACKAGE_ID" "${CONTRACT_PACKAGE_ID}"
replace_key "MINT_CONFIG_OBJECT_ID" "${MINT_CONFIG_OBJECT_ID}"
replace_key "SPONSOR_PRIVATE_KEY" "${SPONSOR_PRIVATE_KEY}"
replace_key "PUBLIC_BASE_URL" "${PUBLIC_BASE_URL}"
replace_key "S3_BUCKET_NAME" "${S3_BUCKET_NAME}"
replace_key "S3_REGION" "${S3_REGION}"
replace_key "S3_PUBLIC_BASE_URL" "${S3_PUBLIC_BASE_URL}"
replace_key "S3_OBJECT_PREFIX" "${S3_OBJECT_PREFIX}"
replace_key "ALLOWED_ORIGINS" "${ALLOWED_ORIGINS}"
replace_key "TRUST_PROXY" "${TRUST_PROXY}"

echo
echo "Updated ${ENV_FILE}"
echo "Next: npm run dev --workspace backend"
