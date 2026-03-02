#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "Missing SUPABASE_URL"
  exit 1
fi

if [[ -z "${SUPABASE_SECRET_KEY:-}" ]]; then
  echo "Missing SUPABASE_SECRET_KEY (use sb_secret_... or service_role key)"
  exit 1
fi

if [[ -z "${SUPABASE_BUCKET_NAME:-}" ]]; then
  echo "Missing SUPABASE_BUCKET_NAME"
  exit 1
fi

SUPABASE_OBJECT_PREFIX="${SUPABASE_OBJECT_PREFIX:-coin-list}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COIN_DIR="${REPO_DIR}/assets/coin_list"

if [[ ! -d "${COIN_DIR}" ]]; then
  echo "Missing coin asset directory: ${COIN_DIR}"
  exit 1
fi

SUPABASE_URL="${SUPABASE_URL%/}"

uploaded=0
for file in "${COIN_DIR}"/*.png; do
  if [[ ! -f "${file}" ]]; then
    continue
  fi

  filename="$(basename "${file}")"
  object_path="${SUPABASE_OBJECT_PREFIX}/${filename}"
  object_url="${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET_NAME}/${object_path}"

  echo "Uploading ${filename} -> ${object_path}"

  curl -fsS -X POST "${object_url}" \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -H "x-upsert: true" \
    -H "Content-Type: image/png" \
    --data-binary "@${file}" >/dev/null

  uploaded=$((uploaded + 1))
done

echo "Uploaded ${uploaded} files to ${SUPABASE_BUCKET_NAME}/${SUPABASE_OBJECT_PREFIX}"
