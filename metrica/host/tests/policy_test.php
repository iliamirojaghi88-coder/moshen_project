<?php
/* php metrica/host/tests/policy_test.php — the OTP rules on a real MySQL/MariaDB database
   (same 14 cases as panels/server/otp-policy.test.mjs). Needs an empty test database:
     METRICA_TEST_DSN="mysql:host=localhost;dbname=metrica_unit;charset=utf8mb4" METRICA_TEST_USER=… METRICA_TEST_PASS=… */
declare(strict_types=1);
require __DIR__ . '/../metrica_private/app/OtpPolicy.php';

$pdo = new PDO(getenv('METRICA_TEST_DSN') ?: 'mysql:host=localhost;dbname=metrica_unit;charset=utf8mb4',
    getenv('METRICA_TEST_USER') ?: 'mt', getenv('METRICA_TEST_PASS') ?: 'mt-pass',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
$pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
foreach (['mt_sessions', 'mt_users', 'mt_otp_requests', 'mt_otp_events', 'mt_otp_locks'] as $t) {
    $pdo->exec("DROP TABLE IF EXISTS $t");
}
$pdo->exec(file_get_contents(__DIR__ . '/../database/schema.sql'));

$pass = 0;
$fail = 0;
function check(bool $ok, string $name, $got = null): void
{
    global $pass, $fail;
    if ($ok) {
        $pass++;
        return;
    }
    $fail++;
    echo "  ✗ $name" . ($got !== null ? ' — ' . json_encode($got, JSON_UNESCAPED_UNICODE) : '') . "\n";
}
function setup(PDO $pdo, array $limits = [], bool $sms = true): array
{
    foreach (['mt_otp_requests', 'mt_otp_events', 'mt_otp_locks'] as $t) {
        $pdo->exec("DELETE FROM $t");
    }
    $clock = new ArrayObject(['t' => 1794480000000]);
    $outbox = new ArrayObject();
    $p = new OtpPolicy($pdo, $sms ? static function (string $phone, string $code) use ($outbox) { $outbox[] = [$phone, $code]; } : null,
        str_repeat('k', 64), static function () use ($clock) { return $clock['t']; }, $limits);
    $tick = static function (int $s) use ($clock) { $clock['t'] += $s * 1000; };
    $code = static function () use ($outbox) { return $outbox[count($outbox) - 1][1]; };
    return [$p, $outbox, $tick, $code, $clock];
}
$A = ['1.1.1.1', 'devA'];
$B = ['2.2.2.2', 'devB'];
$wrong = static function (string $c, int $k = 1): string { return str_pad((string) (((int) $c + $k) % 10000), 4, '0', STR_PAD_LEFT); };

echo "1 no SMS provider: nothing is issued\n";
[$p] = setup($pdo, [], false);
check($p->request('09121234567', ...$A) === [503, ['error' => 'SERVICE_UNAVAILABLE']], 'service unavailable');

echo "2 only Iranian mobile numbers\n";
[$p] = setup($pdo);
foreach (['0912123456', '9121234567', '08121234567', '+989121234567', '', null, 9121234567] as $n) {
    check($p->request($n, ...$A)[0] === 400, 'rejects ' . json_encode($n));
}

echo "3 a code lives exactly 120 s and is used once\n";
[$p, $out, $tick, $code] = setup($pdo);
[$s, $r] = $p->request('09120000001', ...$A);
check($s === 200 && $r['expiresIn'] === 120 && $r['resendIn'] === 120, 'issued for 120 s', $r);
$tick(119);
check($p->verify($r['requestId'], $code(), ...$A)[0] === 200, 'valid at 119 s');
check($p->verify($r['requestId'], $code(), ...$A)[1]['error'] === 'CODE_EXPIRED', 'used once');
[, $r2] = $p->request('09120000001', ...$A);
$tick(120);
check($p->verify($r2['requestId'], $code(), ...$A)[1]['error'] === 'CODE_EXPIRED', 'expired at 120 s');

echo "4 no new code while the current one is valid; the same device resumes it, others wait\n";
[$p, $out, $tick] = setup($pdo);
[, $r] = $p->request('09120000002', ...$A);
$tick(30);
[, $again] = $p->request('09120000002', ...$A);
check($again['requestId'] === $r['requestId'] && $again['expiresIn'] === 90 && $again['resumed'] === true, 'resumed', $again);
$other = $p->request('09120000002', ...$B);
check($other === [429, ['error' => 'RATE_LIMITED', 'retryAfter' => 90]], 'other device waits', $other);
check(count($out) === 1, 'one SMS');

echo "5 a new code replaces the old one\n";
[$p, $out, $tick] = setup($pdo);
[, $r1] = $p->request('09120000003', ...$A);
$c1 = $out[0][1];
$tick(121);
[, $r2] = $p->request('09120000003', ...$A);
check($r2['requestId'] !== $r1['requestId'] && $p->verify($r1['requestId'], $c1, ...$A)[1]['error'] === 'CODE_EXPIRED', 'old code dead');

echo "6 verify is bound to the device that asked\n";
[$p, $out, $tick, $code] = setup($pdo);
[, $r] = $p->request('09120000004', ...$A);
check($p->verify($r['requestId'], $code(), ...$B)[1]['error'] === 'CODE_EXPIRED' && $p->verify($r['requestId'], $code(), ...$A)[0] === 200, 'device bound');

echo "7 5 wrong tries per code, then the code is locked\n";
[$p, $out, $tick, $code] = setup($pdo);
[, $r] = $p->request('09120000005', ...$A);
$left = [];
for ($i = 1; $i <= 4; $i++) {
    $left[] = $p->verify($r['requestId'], $wrong($code(), $i), ...$A)[1]['attemptsLeft'];
}
check($left === [4, 3, 2, 1], 'attempts left 4..1', $left);
check($p->verify($r['requestId'], $wrong($code(), 5), ...$A)[1]['error'] === 'CODE_LOCKED', '5th locks');
check($p->verify($r['requestId'], $code(), ...$A)[1]['error'] === 'CODE_LOCKED', 'even the right code');

echo "8 7 wrong codes per phone in a rolling 10 minutes, across codes, devices and new requests\n";
[$p, $out, $tick, $code] = setup($pdo);
[, $r1] = $p->request('09120000006', ...$A);
for ($i = 1; $i <= 5; $i++) {
    $p->verify($r1['requestId'], $wrong($code(), $i), ...$A);
}
$tick(121);
[$s, $r2] = $p->request('09120000006', ...$A);
check($s === 200 && $r2['attemptsLeft'] === 2, 'two left for the phone', $r2);
check($p->verify($r2['requestId'], $wrong($code()), ...$A)[1]['attemptsLeft'] === 1, 'one left');
$seventh = $p->verify($r2['requestId'], $wrong($code(), 2), ...$A);
check($seventh === [429, ['error' => 'TOO_MANY_ATTEMPTS', 'retryAfter' => 600 - 121]], '7th blocks until the oldest fail leaves', $seventh);
check($p->verify($r2['requestId'], $code(), ...$A)[1]['error'] === 'TOO_MANY_ATTEMPTS', '8th refused before comparing');
$tick(121);
check($p->request('09120000006', ...$A)[1]['error'] === 'TOO_MANY_ATTEMPTS' && $p->request('09120000006', ...$B)[1]['error'] === 'TOO_MANY_ATTEMPTS', 'new code / other device still blocked');
check(($p->pending('devA')['verifyBlockedFor'] ?? 0) > 0, 'reload sees the block');
$tick(600 - 242 + 1);
[$s, $r3] = $p->request('09120000006', ...$A);
check($s === 200 && $p->verify($r3['requestId'], $code(), ...$A)[0] === 200, 'free after the window');

echo "9 5 code requests per phone in a rolling 10 minutes; the 6th is refused with the next allowed time\n";
[$p, $out, $tick, $code] = setup($pdo);
for ($i = 0; $i < 5; $i++) {
    [$s, $r] = $p->request('09120000007', ...$A);
    check($s === 200 && $p->verify($r['requestId'], $code(), ...$A)[0] === 200, 'request ' . ($i + 1));
    $tick(60);
}
check($p->request('09120000007', ...$A) === [429, ['error' => 'RATE_LIMITED', 'retryAfter' => 300]], '6th refused, 300 s');
check($p->request('09120000007', ...$B)[1]['error'] === 'RATE_LIMITED', 'per phone, not per device');
$tick(300);
check($p->request('09120000007', ...$A)[0] === 200, 'allowed when the window has room');

echo "10 the 5th request says when the next one is allowed\n";
[$p, $out, $tick, $code] = setup($pdo);
for ($i = 0; $i < 5; $i++) {
    [, $r] = $p->request('09120000008', ...$A);
    $p->verify($r['requestId'], $code(), ...$A);
    $tick(10);
}
check($r['resendIn'] === 600 - 40, 'resendIn waits for the window', $r);

echo "11 IP and device limits\n";
[$p] = setup($pdo, ['ipRequests' => 2, 'deviceRequests' => 3]);
check($p->request('09120000011', 'X', 'd1')[0] === 200 && $p->request('09120000012', 'X', 'd2')[0] === 200, 'two per IP');
check($p->request('09120000013', 'X', 'd3')[1]['error'] === 'RATE_LIMITED', 'third from the IP refused');
[$q] = setup($pdo, ['deviceRequests' => 1]);
check($q->request('09120000014', 'Y1', 'same')[0] === 200 && $q->request('09120000015', 'Y2', 'same')[1]['error'] === 'RATE_LIMITED', 'device cap');

echo "12 parallel verifies cannot exceed the per-code or per-phone limits (separate processes)\n";
[$p, $out, $tick, $code, $clock] = setup($pdo);
[, $r1] = $p->request('09120000009', ...$A);
$burst = static function (string $id, string $c, int $n) use ($clock): array {
    // n PHP processes verify at the same moment against the same database
    $args = escapeshellarg(json_encode(['id' => $id, 'c' => $c, 'dsn' => getenv('METRICA_TEST_DSN') ?: '', 'now' => $clock['t']]));
    $procs = [];
    for ($i = 1; $i <= $n; $i++) {
        $procs[] = popen(PHP_BINARY . ' ' . escapeshellarg(__DIR__ . '/verify_once.php') . " $args $i", 'r');
    }
    $res = [];
    foreach ($procs as $h) {
        $res[] = trim(stream_get_contents($h));
        pclose($h);
    }
    sort($res);
    return array_count_values($res);
};
$counts = $burst($r1['requestId'], $code(), 20);
check(($counts['INVALID_CODE'] ?? 0) === 4 && ($counts['CODE_LOCKED'] ?? 0) === 16, '20 parallel: 4 invalid, 16 locked', $counts);
$tick(121);
[, $r2] = $p->request('09120000009', ...$A);
$counts = $burst($r2['requestId'], $code(), 10);
check(($counts['INVALID_CODE'] ?? 0) === 1 && ($counts['TOO_MANY_ATTEMPTS'] ?? 0) === 9, '10 parallel: 1 invalid, 9 blocked', $counts);
check((int) $pdo->query("SELECT COUNT(*) FROM mt_otp_events WHERE k = 'fail:p:09120000009'")->fetchColumn() === 7, 'exactly 7 failures recorded');

echo "13 parallel requests send one SMS\n";
[$p, $out] = setup($pdo);
$procs = [];
for ($i = 0; $i < 10; $i++) {
    $procs[] = popen(PHP_BINARY . ' ' . escapeshellarg(__DIR__ . '/request_once.php') . ' 09120000010', 'r');
}
$ids = [];
foreach ($procs as $h) {
    $ids[] = trim(stream_get_contents($h));
    pclose($h);
}
check(count(array_unique($ids)) === 1 && strlen($ids[0]) === 32, '10 parallel requests → one code', array_count_values($ids));
check((int) $pdo->query("SELECT COUNT(*) FROM mt_otp_events WHERE k = 'req:p:09120000010'")->fetchColumn() === 1, 'counted once');

echo "14 codes are stored only as an HMAC\n";
[$p, $out, $tick, $code] = setup($pdo);
$p->request('09120000020', ...$A);
$row = $pdo->query("SELECT * FROM mt_otp_requests WHERE phone = '09120000020'")->fetch(PDO::FETCH_ASSOC);
check(strlen($row['code_hash']) === 64 && strpos(json_encode($row), $code()) === false, 'no plain code in the row');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
