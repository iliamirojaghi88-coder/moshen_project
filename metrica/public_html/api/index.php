<?php
// METRICA API entry. All code and settings live outside public_html, in the folder beside it:
// domains/<domain>/public_html/api/index.php → domains/<domain>/metrica_private/ (README-FA.md).
$private = dirname(__DIR__, 2) . '/metrica_private';
foreach (['app/api.php', 'config.php'] as $need) {
    if (!is_file("$private/$need")) { // the private folder is missing, empty or in the wrong place: say what is missing
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        exit(json_encode(['error' => 'SERVICE_UNAVAILABLE', 'missing' => "metrica_private/$need"]));
    }
}
require "$private/app/api.php";
