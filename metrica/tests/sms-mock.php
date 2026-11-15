<?php
// TEST ONLY: stands in for the Faraz SMS gateway. Writes «phone code» to sms-codes.log beside it; nothing leaves this machine.
$b = json_decode((string) file_get_contents('php://input'), true) ?: [];
file_put_contents(__DIR__ . '/sms-codes.log', ($b['recipient'] ?? '?') . ' ' . ($b['attributes']['code'] ?? '?') . "\n", FILE_APPEND);
header('Content-Type: application/json');
echo '{"status":"success"}';
