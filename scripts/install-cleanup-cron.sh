#!/usr/bin/env sh
set -eu

APP_DIR="${1:?app dir required}"
CONTAINER_NAME="${2:?container name required}"
LOG_FILE="${3:-/var/log/market-terminal-cleanup.log}"

CRON_CMD="cd ${APP_DIR} && docker exec ${CONTAINER_NAME} node scripts/cleanup-expired-sessions.mjs >> ${LOG_FILE} 2>&1"
CRON_LINE="*/30 * * * * ${CRON_CMD}"

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "cleanup-expired-sessions\\.mjs" > "${TMP_CRON}" || true
printf '%s\n' "${CRON_LINE}" >> "${TMP_CRON}"
crontab "${TMP_CRON}"
rm -f "${TMP_CRON}"

printf 'Installed cron: %s\n' "${CRON_LINE}"
