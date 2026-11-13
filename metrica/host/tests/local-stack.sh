#!/usr/bin/env bash
# Deploy metrica/dist/host into a DirectAdmin-like layout and serve it with Apache + mod_php on :8080 (tests only).
#   domains/metrica.test/{public_html, metrica_private, database, README-FA.md}
# usage: local-stack.sh [placeholders|live|nodb]   (which config.php the test site runs with)
set -euo pipefail
MODE=${1:-placeholders}
SRC=$(cd "$(dirname "$0")/../../dist/host" && pwd)
SITE=/srv/da/domains/metrica.test
rm -rf "$SITE" && mkdir -p "$SITE" && cp -a "$SRC"/. "$SITE"/
CFG="$SITE/metrica_private/config.php"
if [ "$MODE" != nodb ]; then
  sed -i 's/"PASTE_DB_NAME_HERE"/"metrica_test"/; s/"PASTE_DB_USER_HERE"/"mt"/; s/"PASTE_DB_PASSWORD_HERE"/"mt-pass"/' "$CFG"
fi
if [ "$MODE" = live ]; then # a fake Faraz gateway run by the test (http allowed only on this machine)
  sed -i 's/"PASTE_YOUR_API_KEY_HERE"/"test-api-key-123"/; s/"PASTE_YOUR_PATTERN_UID_HERE"/"test-pattern-uid"/' "$CFG"
  sed -i 's#"https://api.iranpayamak.com/ws/v1/sms/pattern"#"http://127.0.0.1:18090/ws/v1/sms/pattern"#' "$CFG"
fi
chown -R www-data:www-data "$SITE/metrica_private"
cat > /etc/apache2/sites-available/metrica-test.conf <<CONF
Listen 8080
<VirtualHost *:8080>
  ServerName localhost
  DocumentRoot $SITE/public_html
  <Directory $SITE/public_html>
    AllowOverride All
    Require all granted
  </Directory>
  ErrorLog /var/log/apache2/metrica-test-error.log
  CustomLog /var/log/apache2/metrica-test-access.log combined
</VirtualHost>
CONF
a2enmod -q php8.3 headers deflate >/dev/null
a2ensite -q metrica-test >/dev/null
(apache2ctl -k graceful 2>/dev/null || apache2ctl -k start) && sleep 1
mysql -e "DROP DATABASE IF EXISTS metrica_test; CREATE DATABASE metrica_test CHARACTER SET utf8mb4;"
mysql metrica_test < "$SITE/database/schema.sql"
sleep 2.2 # PHP opcache re-reads a changed config.php only every 2 s
echo "serving $SITE on http://localhost:8080 ($MODE)"
