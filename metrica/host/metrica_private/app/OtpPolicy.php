<?php
/* METRICA — OTP rules on MySQL. PHP twin of panels/server/otp-policy.mjs (same rules, same replies, same tests).
     - 4-digit code (CSPRNG), stored only as an HMAC, valid 120 s; a new code replaces the old one
     - a new code for a phone only after the current one has expired or was used
     - per phone: at most 5 code requests and 7 wrong codes in any rolling 10 minutes; 5 wrong tries per code
     - extra request / wrong-code caps per IP and per device
   Every check-and-count runs in one transaction holding row locks (mt_otp_locks) on the phone, IP and device keys,
   so parallel requests cannot slip past a limit. All times are milliseconds. */
declare(strict_types=1);

final class OtpPolicy
{
    public const LIMITS = [
        'codeTtl' => 120,       // s — life of one code (the panel's 02:00)
        'perCodeFails' => 5,    // wrong tries for one code
        'window' => 600,        // s — rolling window of the limits below
        'phoneRequests' => 5,   // codes sent to one phone
        'phoneFails' => 7,      // wrong codes for one phone, across all its codes
        // generous: Iranian mobile networks put many users behind one IP (carrier NAT)
        'ipRequests' => 50, 'deviceRequests' => 10,
        'ipFails' => 100, 'deviceFails' => 15,
        'pendingVisible' => 600, // s — how long a device can still resume its code after a reload
    ];

    private $db;
    private $sms;
    private $secret;
    private $now;
    private $L;

    /** $sms: function (string $phone, string $code): void — throws when the SMS was not accepted; null = no provider */
    public function __construct(PDO $db, ?callable $sms, string $secret, ?callable $now = null, array $limits = [])
    {
        $this->db = $db;
        $this->sms = $sms;
        $this->secret = $secret;
        $this->now = $now ?: static function (): int { return (int) floor(microtime(true) * 1000); };
        $this->L = array_merge(self::LIMITS, $limits);
    }

    private function ms(): int
    {
        return ($this->now)();
    }

    // run $fn in a transaction that holds row locks on $keys, taken in sorted order so two callers never deadlock
    private function locked(array $keys, callable $fn)
    {
        $keys = array_values(array_unique($keys));
        sort($keys, SORT_STRING);
        $ins = $this->db->prepare('INSERT IGNORE INTO mt_otp_locks (k) VALUES (?)');
        foreach ($keys as $k) {
            $ins->execute([$k]);
        }
        $in = implode(',', array_fill(0, count($keys), '?'));
        for ($try = 0; ; $try++) {
            $this->db->beginTransaction();
            try {
                $this->db->prepare("SELECT k FROM mt_otp_locks WHERE k IN ($in) ORDER BY k FOR UPDATE")->execute($keys);
                $result = $fn();
                $this->db->commit();
                return $result;
            } catch (PDOException $e) {
                $this->db->rollBack();
                if ($try < 2 && in_array((int) ($e->errorInfo[1] ?? 0), [1205, 1213], true)) {
                    continue; // lock wait timeout / deadlock: run the whole check again
                }
                throw $e;
            }
        }
    }

    private function recent(string $k, int $now): array
    {
        $q = $this->db->prepare('SELECT at FROM mt_otp_events WHERE k = ? AND at > ? ORDER BY at');
        $q->execute([$k, $now - $this->L['window'] * 1000]);
        return array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
    }

    private function add(string $k, int $now): void
    {
        $this->db->prepare('INSERT INTO mt_otp_events (k, at) VALUES (?, ?)')->execute([$k, $now]);
    }

    // seconds until a counter with these hits may count again (0 = free now)
    private function wait(array $hits, int $max, int $now): int
    {
        if (count($hits) < $max) {
            return 0;
        }
        return max(1, (int) ceil(($hits[count($hits) - $max] + $this->L['window'] * 1000 - $now) / 1000));
    }

    private function hash(string $id, string $code): string
    {
        return hash_hmac('sha256', $id . ':' . $code, $this->secret);
    }

    private function failKeys(string $phone, string $ip, string $device): array
    {
        return [["fail:p:$phone", $this->L['phoneFails']], ["fail:ip:$ip", $this->L['ipFails']], ["fail:d:$device", $this->L['deviceFails']]];
    }

    private function failWait(string $phone, string $ip, string $device, int $now): int
    {
        $w = 0;
        foreach ($this->failKeys($phone, $ip, $device) as [$k, $max]) {
            $w = max($w, $this->wait($this->recent($k, $now), $max, $now));
        }
        return $w;
    }

    private function row(string $sql, array $args): ?array
    {
        $q = $this->db->prepare($sql);
        $q->execute($args);
        $r = $q->fetch(PDO::FETCH_ASSOC);
        if (!$r) {
            return null;
        }
        foreach (['created_at', 'expires_at', 'fails', 'used'] as $f) {
            $r[$f] = (int) $r[$f];
        }
        return $r;
    }

    // what the panel needs to show the code step (also used to resume after a reload)
    public function view(array $r, int $now): array
    {
        $expiresIn = max(0, (int) ceil(($r['expires_at'] - $now) / 1000));
        $next = $this->wait($this->recent('req:p:' . $r['phone'], $now), $this->L['phoneRequests'], $now);
        $phoneFails = count($this->recent('fail:p:' . $r['phone'], $now));
        return [
            'requestId' => $r['id'], 'phone' => $r['phone'], 'expiresIn' => $expiresIn,
            'resendIn' => max($expiresIn, $next),
            'attemptsLeft' => max(0, min($this->L['perCodeFails'] - $r['fails'], $this->L['phoneFails'] - $phoneFails)),
            'locked' => $r['fails'] >= $this->L['perCodeFails'],
        ];
    }

    /** @return array [httpStatus, body] */
    public function request($phone, string $ip, string $device): array
    {
        if (!is_string($phone) || !preg_match('/^09\d{9}$/', $phone)) {
            return [400, ['error' => 'INVALID_PHONE']];
        }
        if (!$this->sms) {
            return [503, ['error' => 'SERVICE_UNAVAILABLE']];
        }
        $L = $this->L;
        $res = $this->locked(["p:$phone", "ip:$ip", "d:$device"], function () use ($phone, $ip, $device, $L) {
            $now = $this->ms();
            $blocked = $this->wait($this->recent("fail:p:$phone", $now), $L['phoneFails'], $now);
            if ($blocked) {
                return [429, ['error' => 'TOO_MANY_ATTEMPTS', 'retryAfter' => $blocked]]; // a new code does not lift it
            }
            $cur = $this->row('SELECT * FROM mt_otp_requests WHERE phone = ? ORDER BY created_at DESC LIMIT 1', [$phone]);
            if ($cur && !$cur['used'] && $now < $cur['expires_at']) {
                if (hash_equals($cur['device'], $device)) {
                    return [200, $this->view($cur, $now) + ['resumed' => true]]; // same code, same clock
                }
                return [429, ['error' => 'RATE_LIMITED', 'retryAfter' => (int) ceil(($cur['expires_at'] - $now) / 1000)]];
            }
            $counters = [["req:p:$phone", $L['phoneRequests']], ["req:ip:$ip", $L['ipRequests']], ["req:d:$device", $L['deviceRequests']]];
            foreach ($counters as [$k, $max]) {
                $w = $this->wait($this->recent($k, $now), $max, $now);
                if ($w) {
                    return [429, ['error' => 'RATE_LIMITED', 'retryAfter' => $w]];
                }
            }
            foreach ($counters as [$k]) {
                $this->add($k, $now); // counted even if the SMS gateway then fails
            }
            $this->db->prepare('DELETE FROM mt_otp_requests WHERE phone = ?')->execute([$phone]); // the old code stops working
            $id = bin2hex(random_bytes(16));
            $code = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            $this->db->prepare('INSERT INTO mt_otp_requests (id, phone, device, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$id, $phone, $device, $this->hash($id, $code), $now, $now + $L['codeTtl'] * 1000]);
            $r = $this->row('SELECT * FROM mt_otp_requests WHERE id = ?', [$id]);
            return [200, $this->view($r, $now), $code];
        });
        if (!isset($res[2])) {
            return $res;
        }
        // sent after the commit: the gateway call never holds the locks
        try {
            ($this->sms)($phone, $res[2]);
        } catch (Throwable $e) {
            $this->db->prepare('DELETE FROM mt_otp_requests WHERE id = ?')->execute([$res[1]['requestId']]);
            throw new SmsFailed($e->getMessage(), 0, $e);
        }
        return [200, $res[1]];
    }

    /** @return array [httpStatus, body]; on success body = ['phone' => …] for the caller to sign in */
    public function verify($requestId, $code, string $ip, string $device): array
    {
        $first = is_string($requestId) ? $this->row('SELECT * FROM mt_otp_requests WHERE id = ?', [$requestId]) : null;
        if (!$first || !hash_equals($first['device'], $device)) {
            return [410, ['error' => 'CODE_EXPIRED']];
        }
        if (!is_string($code) || !preg_match('/^\d{4}$/', $code)) {
            return [400, ['error' => 'BAD_REQUEST']];
        }
        $L = $this->L;
        return $this->locked(['p:' . $first['phone'], "ip:$ip", "d:$device"], function () use ($first, $code, $ip, $device, $L) {
            $now = $this->ms();
            $r = $this->row('SELECT * FROM mt_otp_requests WHERE id = ? FOR UPDATE', [$first['id']]);
            if (!$r) {
                return [410, ['error' => 'CODE_EXPIRED']];
            }
            $blocked = $this->failWait($r['phone'], $ip, $device, $now);
            if ($blocked) {
                return [429, ['error' => 'TOO_MANY_ATTEMPTS', 'retryAfter' => $blocked]]; // checked before the code
            }
            if ($r['used'] || $now >= $r['expires_at']) {
                return [410, ['error' => 'CODE_EXPIRED']];
            }
            if ($r['fails'] >= $L['perCodeFails']) {
                return [429, ['error' => 'CODE_LOCKED'] + $this->view($r, $now)];
            }
            if (!hash_equals($r['code_hash'], $this->hash($r['id'], $code))) {
                $r['fails']++;
                $this->db->prepare('UPDATE mt_otp_requests SET fails = ? WHERE id = ?')->execute([$r['fails'], $r['id']]);
                foreach ($this->failKeys($r['phone'], $ip, $device) as [$k]) {
                    $this->add($k, $now);
                }
                $blocked = $this->failWait($r['phone'], $ip, $device, $now);
                if ($blocked) {
                    return [429, ['error' => 'TOO_MANY_ATTEMPTS', 'retryAfter' => $blocked]];
                }
                if ($r['fails'] >= $L['perCodeFails']) {
                    return [429, ['error' => 'CODE_LOCKED'] + $this->view($r, $now)];
                }
                return [400, ['error' => 'INVALID_CODE', 'attemptsLeft' => $this->view($r, $now)['attemptsLeft']]];
            }
            $this->db->prepare('UPDATE mt_otp_requests SET used = 1 WHERE id = ?')->execute([$r['id']]);
            return [200, ['phone' => $r['phone']]];
        });
    }

    // the device's latest unfinished code, so a reload resumes it instead of starting again
    public function pending(string $device): ?array
    {
        $now = $this->ms();
        $r = $this->row('SELECT * FROM mt_otp_requests WHERE device = ? ORDER BY created_at DESC LIMIT 1', [$device]);
        if (!$r || $r['used'] || $now - $r['created_at'] > $this->L['pendingVisible'] * 1000) {
            return null;
        }
        $v = $this->view($r, $now);
        $blocked = $this->wait($this->recent('fail:p:' . $r['phone'], $now), $this->L['phoneFails'], $now);
        return $blocked ? $v + ['verifyBlockedFor' => $blocked] : $v;
    }

    // occasional cleanup of rows no rule looks at any more
    public function sweep(): void
    {
        $now = $this->ms();
        $this->db->prepare('DELETE FROM mt_otp_events WHERE at < ?')->execute([$now - 2 * $this->L['window'] * 1000]);
        $this->db->prepare('DELETE FROM mt_otp_requests WHERE created_at < ?')->execute([$now - 86400000]);
    }
}

final class SmsFailed extends RuntimeException
{
}
