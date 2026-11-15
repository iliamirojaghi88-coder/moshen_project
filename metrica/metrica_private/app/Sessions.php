<?php
/* METRICA — sign-in sessions on MySQL (table mt_sessions).
     - the browser keeps a random 256-bit token in the HttpOnly cookie «msid»; the database keeps only its SHA-256
     - sliding expiry: a session lives SESSION_TTL after the last valid visit; every visit (GET /auth/session)
       moves expires_at forward again, at most once per TOUCH_EVERY seconds
     - one row per browser/device: signing out removes only this device's row
   All times are milliseconds. $now is injectable for tests (same pattern as OtpPolicy). */
declare(strict_types=1);

final class Sessions
{
    public const TTL = 604800;     // s — 7 days after the last valid visit
    public const TOUCH_EVERY = 60; // s — a reload within a minute does not write again

    private $db;
    private $now;

    public function __construct(PDO $db, ?callable $now = null)
    {
        $this->db = $db;
        $this->now = $now ?: static function (): int { return (int) floor(microtime(true) * 1000); };
    }

    private function ms(): int
    {
        return ($this->now)();
    }

    private static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    /** v2 schema: adds mt_sessions.last_seen_at once, with the same steps as database/migrate-account-v2.sql, so the
        site works even if that file was not run. Returns false when it cannot (tables missing, or no ALTER right). */
    public static function upgrade(PDO $db): bool
    {
        try {
            $db->query('SELECT last_seen_at FROM mt_sessions LIMIT 0');
            return true;
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 1054) { // 1054 = unknown column; anything else (e.g. no table): schema.sql not imported
                return false;
            }
        }
        try {
            $db->exec('ALTER TABLE mt_sessions ADD COLUMN last_seen_at BIGINT NULL AFTER created_at');
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 1060) { // 1060 = a parallel request has just added it
                return false;
            }
        }
        // sessions of the old version: last known visit = their sign-in, so they last 7 days from it
        $db->exec('UPDATE mt_sessions SET last_seen_at = created_at, expires_at = LEAST(expires_at, created_at + 604800000) WHERE last_seen_at IS NULL');
        return true;
    }

    public static function valid(string $token): bool
    {
        return (bool) preg_match('/^[a-f0-9]{64}$/', $token);
    }

    /** a new session for this browser; returns the raw token (cookie value), which is never stored */
    public function create(int $userId, bool $complete): string
    {
        $token = bin2hex(random_bytes(32));
        $now = $this->ms();
        $this->db->prepare('INSERT INTO mt_sessions (token_hash, user_id, complete, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([self::hash($token), $userId, $complete ? 1 : 0, $now, $now, $now + self::TTL * 1000]);
        return $token;
    }

    /** the live session joined with its user, or null (unknown, malformed or expired token) */
    public function find(string $token): ?array
    {
        if (!self::valid($token)) {
            return null;
        }
        $q = $this->db->prepare('SELECT s.complete, s.last_seen_at, s.expires_at, u.* FROM mt_sessions s JOIN mt_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?');
        $q->execute([self::hash($token), $this->ms()]);
        return $q->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /** a valid visit: the session gets another full TTL. Returns true when it was extended (the cookie is sent again). */
    public function renew(string $token, array $session): bool
    {
        $now = $this->ms();
        if ($now - (int) $session['last_seen_at'] < self::TOUCH_EVERY * 1000) {
            return false;
        }
        $q = $this->db->prepare('UPDATE mt_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ? AND expires_at > ?');
        $q->execute([$now, $now + self::TTL * 1000, self::hash($token), $now]);
        return $q->rowCount() > 0;
    }

    public function complete(string $token): void
    {
        $this->db->prepare('UPDATE mt_sessions SET complete = 1 WHERE token_hash = ?')->execute([self::hash($token)]);
    }

    public function revoke(string $token): void
    {
        if (self::valid($token)) {
            $this->db->prepare('DELETE FROM mt_sessions WHERE token_hash = ?')->execute([self::hash($token)]);
        }
    }

    public function sweep(): void
    {
        $this->db->prepare('DELETE FROM mt_sessions WHERE expires_at < ?')->execute([$this->ms()]);
    }
}
