<?php
/* METRICA API — the server side of the sign-in and subscription panels. PHP twin of panels/server/api.mjs
   (same paths, same replies; contract: API-fa.md). Run by public_html/api/index.php.
   The page and this API share one domain: no CORS, and POSTs from any other origin are refused. */
declare(strict_types=1);

require dirname(__DIR__) . '/config.php';
require __DIR__ . '/OtpPolicy.php';
require __DIR__ . '/FarazSms.php';
require __DIR__ . '/Sessions.php';

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body === [] ? new stdClass() : $body, JSON_UNESCAPED_UNICODE);
    exit;
}

// private log (metrica_private/logs/app.log): failures only; never keys, codes or full numbers
function log_error(string $msg): void
{
    $dir = dirname(__DIR__) . '/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
        @file_put_contents("$dir/.htaccess", "Require all denied\n");
    }
    $file = "$dir/app.log";
    if (is_file($file) && filesize($file) > 1048576) {
        @rename($file, "$file.1");
    }
    @file_put_contents($file, gmdate('c') . ' ' . str_replace(API_KEY, '***', $msg) . "\n", FILE_APPEND | LOCK_EX);
}

const NOT_SET = 'PASTE_';
function now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

// all three of name, user and password must be filled in config.php
function db_configured(): bool
{
    return strpos(DB_NAME, NOT_SET) !== 0 && strpos(DB_USER, NOT_SET) !== 0 && strpos(DB_PASS, NOT_SET) !== 0;
}

function db(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    if (!db_configured()) {
        return $pdo = null;
    }
    try {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED'); // every read inside a lock sees the latest commits
        Sessions::upgrade($pdo); // one-time v2 column if migrate-account-v2.sql was not run; a cheap check afterwards
    } catch (PDOException $e) {
        log_error('database: ' . $e->getMessage());
        $pdo = null;
    }
    return $pdo;
}

function otp_ready(): bool
{
    return FarazSms::ready() && strlen(APP_SECRET) >= 32 && APP_SECRET !== 'GENERATED_AT_BUILD';
}

function policy(PDO $db): OtpPolicy
{
    return new OtpPolicy($db, otp_ready() ? [FarazSms::class, 'send'] : null, APP_SECRET);
}

/* ---------- request context ---------- */
$uri = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$at = strpos($uri, '/index.php');
$path = $at === false ? '' : substr($uri, $at + strlen('/index.php')); // api/index.php/auth/session → /auth/session
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';

function cookie(string $name, string $value, int $maxAge): void
{
    global $https;
    setcookie($name, $value, ['expires' => $maxAge > 0 ? time() + $maxAge : 1, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
}

$device = (string) ($_COOKIE['mdev'] ?? '');
if (!preg_match('/^[a-f0-9]{32}$/', $device)) {
    $device = bin2hex(random_bytes(16));
    cookie('mdev', $device, 31536000);
}
$ip = TRUSTED_IP_HEADER !== '' ? trim(explode(',', (string) ($_SERVER[TRUSTED_IP_HEADER] ?? ''))[0]) : '';
if (!filter_var($ip, FILTER_VALIDATE_IP)) {
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '?');
}

$token = (string) ($_COOKIE['msid'] ?? ''); // this browser's session (HttpOnly cookie); only its hash is in mt_sessions

function session_user(PDO $db): ?array
{
    global $token;
    return (new Sessions($db))->find($token);
}

/* the name typed after the first OTP: one field, any script (Persian, English, …), inner spaces allowed.
   Trimmed (also NBSP/ZWNJ/bidi marks at the ends), runs of spaces collapsed; null when it is not a name. */
function clean_name($raw): ?string
{
    if (!is_string($raw) || strlen($raw) > 400) {
        return null;
    }
    $edge = '[\s\x{00A0}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]';
    $n = preg_replace(["/^$edge+|$edge+$/u", '/[\s\x{00A0}]+/u'], ['', ' '], $raw);
    if ($n === null) {
        return null; // not valid UTF-8
    }
    if (class_exists('Normalizer')) {
        $n = (string) Normalizer::normalize($n, Normalizer::FORM_C);
    }
    // letters and combining marks of any script, single spaces, ZWNJ, apostrophe, hyphen, dot; at least one letter; ≤ 40 characters
    return preg_match('/^(?=.*\p{L})[\p{L}\p{M}\x{200C} .\'’-]{1,40}$/u', $n) ? $n : null;
}

function pub(array $u): array
{
    return ['id' => (int) $u['id'], 'firstName' => $u['first_name'], 'lastName' => $u['last_name'],
        'name' => trim($u['first_name'] . ' ' . $u['last_name']), 'plan' => $u['plan']];
}

/* ---------- routes ---------- */
try {
    if ($method === 'GET' && $path === '/health') { // install check, no secrets: README-FA.md step 6
        $db = db();
        $schema = 'unknown';
        if ($db) {
            try {
                $db->query('SELECT 1 FROM mt_otp_locks LIMIT 1');
                $schema = 'ok';
            } catch (PDOException $e) {
                $schema = 'missing';
            }
            if ($schema === 'ok') {
                try {
                    $db->query('SELECT last_seen_at FROM mt_sessions LIMIT 1'); // added by database/migrate-account-v2.sql
                } catch (PDOException $e) {
                    $schema = 'update-needed';
                }
            }
        }
        $database = !db_configured() ? 'not-configured' : ($db ? 'ok' : 'error');
        $sms = FarazSms::ready() ? 'ready' : 'not-configured';
        $php = extension_loaded('curl') && extension_loaded('pdo_mysql') ? 'ok' : 'missing curl or pdo_mysql';
        reply(200, ['database' => $database, 'schema' => $schema, 'sms' => $sms, 'php' => $php,
            'otp' => $database === 'ok' && $schema === 'ok' && $php === 'ok' && otp_ready() ? 'active' : 'inactive']);
    }

    if ($method === 'GET' && in_array($path, ['/auth/session', '/subscription'], true)) {
        $db = db();
        $s = $db ? session_user($db) : null;
        $user = $s && (int) $s['complete'] ? pub($s) : null;
        if ($path === '/subscription') {
            $user ? reply(200, ['plan' => $user['plan'], 'status' => 'none']) : reply(401, ['error' => 'UNAUTHORIZED']);
        }
        if ($s && (new Sessions($db))->renew($token, $s)) {
            cookie('msid', $token, Sessions::TTL); // a valid visit: 7 more days from now, in the database and in the browser
        }
        if ($s && !$user) { // code verified, name not given yet: the panel opens on the name step
            reply(200, ['user' => null, 'profileRequired' => true, 'pendingOtp' => null]);
        }
        reply(200, ['user' => $user, 'pendingOtp' => $user || !$db ? null : policy($db)->pending($device)]);
    }

    if ($method !== 'POST') {
        reply(404, ['error' => 'NOT_FOUND']);
    }
    // CSRF: the custom header forces a CORS preflight that this API never answers, and any foreign Origin is refused
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $originHost = $origin === '' ? '' : strtolower((string) parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : ''));
    if (($_SERVER['HTTP_X_METRICA_CLIENT'] ?? '') !== 'web' || stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0
        || ($origin !== '' && $originHost !== strtolower((string) ($_SERVER['HTTP_HOST'] ?? '')))) {
        reply(403, ['error' => 'FORBIDDEN']);
    }
    $raw = (string) file_get_contents('php://input', false, null, 0, 4097);
    $body = json_decode($raw === '' ? '{}' : $raw, true);
    if (strlen($raw) > 4096 || !is_array($body)) {
        reply(400, ['error' => 'BAD_REQUEST']);
    }
    $db = db();
    if (!$db) {
        reply(503, ['error' => 'SERVICE_UNAVAILABLE']);
    }
    if (random_int(1, 50) === 1) { // occasional cleanup
        policy($db)->sweep();
        (new Sessions($db))->sweep();
    }

    switch ($path) {
        case '/auth/otp/request':
            try {
                [$status, $out] = policy($db)->request($body['phone'] ?? null, $ip, $device);
            } catch (SmsFailed $e) {
                $p = (string) OtpPolicy::phone($body['phone'] ?? null);
                log_error('sms to ' . substr($p, 0, 4) . '*****' . substr($p, -2) . ': ' . $e->getMessage());
                reply(502, ['error' => 'SMS_FAILED']);
            }
            reply($status, $out);
            // no break: reply() exits
        case '/auth/otp/verify':
            [$status, $out] = policy($db)->verify($body['requestId'] ?? null, $body['code'] ?? null, $ip, $device);
            if ($status !== 200) {
                reply($status, $out);
            }
            $db->prepare('INSERT INTO mt_users (phone, last_login_at) VALUES (?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE last_login_at = UTC_TIMESTAMP()')->execute([$out['phone']]);
            $q = $db->prepare('SELECT * FROM mt_users WHERE phone = ?');
            $q->execute([$out['phone']]);
            $u = $q->fetch(PDO::FETCH_ASSOC);
            $sessions = new Sessions($db);
            $sessions->revoke($token); // a previous session of this browser ends here
            $token = $sessions->create((int) $u['id'], $u['first_name'] !== ''); // the browser keeps the token, the database only its hash
            cookie('msid', $token, Sessions::TTL);
            reply(200, $u['first_name'] !== '' ? ['user' => pub($u)] : ['profileRequired' => true, 'user' => pub($u)]);
            // no break
        case '/auth/profile':
            $s = session_user($db);
            if (!$s) {
                reply(401, ['error' => 'UNAUTHORIZED']);
            }
            $f = clean_name($body['firstName'] ?? null); // one field «نام»; last_name keeps its stored value ('' for new accounts)
            if ($f === null) {
                reply(400, ['error' => 'INVALID_NAME']);
            }
            $db->prepare('UPDATE mt_users SET first_name = ? WHERE id = ?')->execute([$f, $s['id']]);
            (new Sessions($db))->complete($token);
            reply(200, ['user' => pub(['first_name' => $f] + $s)]);
            // no break
        case '/auth/logout':
            (new Sessions($db))->revoke($token); // this device only; other devices stay signed in
            cookie('msid', '', 0);
            reply(200, []);
            // no break
        case '/subscription/checkout':
            $s = session_user($db);
            if (!$s || !(int) $s['complete']) {
                reply(401, ['error' => 'UNAUTHORIZED']);
            }
            reply(503, ['error' => 'SERVICE_UNAVAILABLE']); // no payment gateway yet
            // no break
        default:
            reply(404, ['error' => 'NOT_FOUND']);
    }
} catch (Throwable $e) {
    log_error(get_class($e) . ': ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine());
    reply(500, ['error' => 'SERVER']);
}
