<?php
// helper for policy_test.php (case 13): one code request in its own process; prints the request id
declare(strict_types=1);
require __DIR__ . '/../metrica_private/app/OtpPolicy.php';
$pdo = new PDO(getenv('METRICA_TEST_DSN') ?: 'mysql:host=localhost;dbname=metrica_unit;charset=utf8mb4', getenv('METRICA_TEST_USER') ?: 'mt', getenv('METRICA_TEST_PASS') ?: 'mt-pass',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
$pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
$p = new OtpPolicy($pdo, static function () {}, str_repeat('k', 64));
[$status, $body] = $p->request($argv[1], '1.1.1.1', 'devA');
echo $body['requestId'] ?? ($body['error'] ?? '?');
