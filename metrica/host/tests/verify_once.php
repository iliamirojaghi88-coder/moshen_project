<?php
// helper for policy_test.php (case 12): one verify in its own process; prints the outcome
declare(strict_types=1);
require __DIR__ . '/../metrica_private/app/OtpPolicy.php';
$a = json_decode($argv[1], true);
$pdo = new PDO($a['dsn'] ?: 'mysql:host=localhost;dbname=metrica_unit;charset=utf8mb4', getenv('METRICA_TEST_USER') ?: 'mt', getenv('METRICA_TEST_PASS') ?: 'mt-pass',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
$pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
$p = new OtpPolicy($pdo, static function () {}, str_repeat('k', 64), static function () use ($a) { return (int) $a['now']; });
$wrong = str_pad((string) (((int) $a['c'] + (int) $argv[2]) % 10000), 4, '0', STR_PAD_LEFT);
[$status, $body] = $p->verify($a['id'], $wrong, '1.1.1.1', 'devA');
echo $body['error'] ?? 'OK';
