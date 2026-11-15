#!/usr/bin/env bash
# TEST ONLY: runs the site on http://127.0.0.1:8080 against a local MariaDB (database metrica_test) and an SMS mock on :8099.
# Builds a throw-away copy in $RUN (default: /tmp/metrica-run) with a test config.php; the real config.php is never read.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); SITE=$(dirname "$HERE"); RUN=${RUN:-/tmp/metrica-run}
rm -rf "$RUN" && mkdir -p "$RUN/metrica_private" "$RUN/mock"
cp -a "$SITE/public_html" "$RUN/"; cp -a "$SITE/metrica_private/app" "$RUN/metrica_private/"; mkdir -p "$RUN/metrica_private/logs"
cp "$HERE/sms-mock.php" "$RUN/mock/index.php"
cat > "$RUN/metrica_private/config.php" <<'PHP'
<?php
const DB_HOST = "127.0.0.1"; const DB_NAME = "metrica_test"; const DB_USER = "mt_test"; const DB_PASS = "mt_test_pw";
const API_KEY = "test-key-not-real"; const PATTERN_UID = "test-pattern";
const SMS_API_URL = "http://127.0.0.1:8099/index.php"; const SMS_SENDER = "0"; const SMS_PATTERN_VARIABLE = "code";
const APP_SECRET = "test-secret-0123456789abcdef0123456789abcdef"; const TRUSTED_IP_HEADER = "";
PHP
mysql -e "DROP DATABASE IF EXISTS metrica_test; CREATE DATABASE metrica_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql metrica_test < "$HERE/schema-baseline.test.sql"
pkill -f "php -S 127.0.0.1:80[89]" 2>/dev/null || true
(cd "$RUN" && nohup php -S 127.0.0.1:8099 -t mock > "$RUN/mock.log" 2>&1 &)
(cd "$RUN" && nohup php -S 127.0.0.1:8080 -t public_html > "$RUN/site.log" 2>&1 &)
sleep 0.5 && curl -s http://127.0.0.1:8080/api/index.php/health && echo
