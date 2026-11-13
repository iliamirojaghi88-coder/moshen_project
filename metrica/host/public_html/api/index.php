<?php
// METRICA API entry. All code and settings live outside public_html, in ../../metrica_private (README-FA.md, step 2).
$app = __DIR__ . '/../../metrica_private/app/api.php';
if (!is_file($app)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    exit('{"error":"SERVICE_UNAVAILABLE"}');
}
require $app;
