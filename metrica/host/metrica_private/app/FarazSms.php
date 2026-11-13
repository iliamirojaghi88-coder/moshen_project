<?php
/* METRICA — Faraz SMS (IranPayamak) pattern SMS: one POST per code, sent at once (no "schedule").
   The API key travels only in the Api-Key header, from config.php; it never reaches the browser or a log. */
declare(strict_types=1);

final class FarazSms
{
    // true only once both values in config.php are real (not the PASTE_… placeholders)
    public static function ready(): bool
    {
        foreach ([API_KEY, PATTERN_UID] as $v) {
            if (trim($v) === '' || strpos($v, 'PASTE_YOUR_') === 0) {
                return false;
            }
        }
        // HTTPS only; plain http is accepted for a gateway on this machine (tests)
        return (bool) preg_match('#^(https://|http://(localhost|127\.0\.0\.1)[:/])#', SMS_API_URL);
    }

    /** throws RuntimeException when the gateway did not accept the message */
    public static function send(string $phone, string $code): void
    {
        $body = json_encode([
            'code' => PATTERN_UID,
            'attributes' => [SMS_PATTERN_VARIABLE => $code],
            'recipient' => $phone,
            'line_number' => SMS_SENDER,
            'number_format' => 'english',
        ], JSON_UNESCAPED_UNICODE);
        $ch = curl_init(SMS_API_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Api-Key: ' . API_KEY, 'Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            throw new RuntimeException("Faraz SMS unreachable: $error");
        }
        $json = json_decode((string) $raw, true);
        // the gateway reports a refusal with an HTTP error, or with "status" set to an error value in the body
        $refused = is_array($json) && array_key_exists('status', $json)
            && ($json['status'] === false || in_array(strtolower((string) $json['status']), ['error', 'failed', 'failure', 'fail'], true));
        if ($status < 200 || $status >= 300 || $refused) {
            $msg = is_array($json) ? json_encode(array_intersect_key($json, array_flip(['status', 'code', 'message', 'messages', 'errors'])), JSON_UNESCAPED_UNICODE) : substr((string) $raw, 0, 200);
            throw new RuntimeException("Faraz SMS refused (HTTP $status): $msg");
        }
    }
}
