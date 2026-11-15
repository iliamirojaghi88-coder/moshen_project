<?php
/* METRICA — the signed-in home page («خانه»): dashboard figures, reminders and notifications of one user.
   Tables mt_reminders, mt_reminder_seq and mt_notifications (database/migrate-home-v3.sql). If that file was not run,
   they are created here the first time they are needed (CREATE TABLE IF NOT EXISTS, nothing else is touched).
   Every query is bound to the user of the session: no one reads or changes another user's rows. */
declare(strict_types=1);

final class Home
{
    public const COLORS = 4;            // calendar colours in order of creation: blue, green, orange, red, then blue again
    public const MAX_REMINDERS = 500;   // per user
    public const NOTIFICATIONS = 20;    // latest ones sent to the page

    public const SCHEMA = [
        "CREATE TABLE IF NOT EXISTS mt_reminders (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL,
            title VARCHAR(120) NOT NULL,
            project VARCHAR(80) NOT NULL DEFAULT '',
            due_date DATE NOT NULL,
            due_time TIME NULL,
            done TINYINT(1) NOT NULL DEFAULT 0,
            color TINYINT UNSIGNED NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY mt_reminders_user (user_id, done, due_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        // how many reminders each user has ever created: the colour of a new one never depends on deleted ones
        "CREATE TABLE IF NOT EXISTS mt_reminder_seq (
            user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
            n INT UNSIGNED NOT NULL
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS mt_notifications (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL,
            title VARCHAR(120) NOT NULL,
            body VARCHAR(500) NOT NULL DEFAULT '',
            link VARCHAR(200) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME NULL,
            KEY mt_notifications_user (user_id, read_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];

    private $db;
    private $uid;

    public function __construct(PDO $db, int $userId)
    {
        $this->db = $db;
        $this->uid = $userId;
    }

    public static function install(PDO $db): void
    {
        foreach (self::SCHEMA as $sql) {
            $db->exec($sql);
        }
    }

    /** runs $fn; when one of the tables is missing (MySQL error 1146) they are created once and $fn runs again */
    private function run(callable $fn)
    {
        try {
            return $fn();
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 1146) {
                throw $e;
            }
            self::install($this->db);
            return $fn();
        }
    }

    /** GET /home: everything the page shows */
    public function overview(): array
    {
        return $this->run(function () {
            return ['dashboard' => $this->dashboard(), 'notifications' => $this->notifications()] + $this->list();
        });
    }

    /* The figures of the dashboard cards and «وضعیت مالی پروژه‌ها».
       shortcut: projects are not stored yet, so every figure is 0 and the list is empty; once a projects table exists,
       compute them here from this user's rows (the page already formats and draws whatever arrives). */
    private function dashboard(): array
    {
        return ['activeProjects' => 0, 'progress' => 0, 'totalCost' => 0, 'income' => 0, 'cost' => 0, 'profit' => 0, 'recentProjects' => []];
    }

    /* ---------- reminders ---------- */

    private static function pub(array $r): array
    {
        return ['id' => (int) $r['id'], 'title' => $r['title'], 'project' => $r['project'], 'date' => $r['due_date'],
            'time' => $r['due_time'] === null ? '' : substr($r['due_time'], 0, 5), 'done' => (bool) $r['done'], 'color' => (int) $r['color']];
    }

    /** open ones first, by date and time (all-day before timed), then the done ones */
    public function reminders(): array
    {
        $q = $this->db->prepare('SELECT id, title, project, due_date, due_time, done, color FROM mt_reminders WHERE user_id = ?
            ORDER BY done, due_date, due_time IS NOT NULL, due_time, id');
        $q->execute([$this->uid]);
        return array_map([self::class, 'pub'], $q->fetchAll(PDO::FETCH_ASSOC));
    }

    /** the colour the next new reminder gets (0–3): the panel shows it before saving */
    private function nextColor(): int
    {
        $q = $this->db->prepare('SELECT n FROM mt_reminder_seq WHERE user_id = ?');
        $q->execute([$this->uid]);
        return (int) $q->fetchColumn() % self::COLORS;
    }

    private function list(): array
    {
        return ['reminders' => $this->reminders(), 'nextColor' => $this->nextColor()];
    }

    /** one line of text typed by the user: trimmed, inner whitespace collapsed, NFC; null when it is not acceptable */
    public static function text($raw, int $max, bool $required): ?string
    {
        if ($raw === null && !$required) {
            return '';
        }
        if (!is_string($raw) || strlen($raw) > $max * 4 + 64) {
            return null;
        }
        $edge = '[\s\x{00A0}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]';
        $t = preg_replace(["/^$edge+|$edge+$/u", '/[\s\x{00A0}]+/u'], ['', ' '], $raw);
        // invalid UTF-8, control characters, or bidi overrides that could disguise the text
        if ($t === null || preg_match('/[\p{Cc}\p{Cs}\p{Co}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', $t)) {
            return null;
        }
        if (class_exists('Normalizer')) {
            $t = (string) Normalizer::normalize($t, Normalizer::FORM_C);
        }
        if ($t === '') {
            return $required ? null : '';
        }
        return preg_match('/^.{1,' . $max . '}$/us', $t) ? $t : null;
    }

    /** a calendar date «YYYY-MM-DD» (the page converts the Persian date it shows) */
    public static function date($raw): ?string
    {
        if (!is_string($raw) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $raw, $m)) {
            return null;
        }
        $y = (int) $m[1];
        return $y >= 2000 && $y <= 2100 && checkdate((int) $m[2], (int) $m[3], $y) ? $raw : null;
    }

    /** «HH:MM» (24 h), '' for none, null when malformed */
    public static function time($raw): ?string
    {
        if ($raw === null || $raw === '') {
            return '';
        }
        return is_string($raw) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $raw) ? $raw : null;
    }

    private static function id($raw): ?int
    {
        return is_int($raw) && $raw > 0 ? $raw : (is_string($raw) && preg_match('/^[1-9]\d{0,9}$/', $raw) ? (int) $raw : null);
    }

    private function owns(int $id): bool
    {
        $q = $this->db->prepare('SELECT 1 FROM mt_reminders WHERE id = ? AND user_id = ?');
        $q->execute([$id, $this->uid]);
        return (bool) $q->fetchColumn();
    }

    /** POST /reminders/save — new (no id) or edited reminder. @return array [httpStatus, body] */
    public function save(array $b): array
    {
        $title = self::text($b['title'] ?? null, 120, true);
        $project = self::text($b['project'] ?? null, 80, false);
        $date = self::date($b['date'] ?? null);
        $time = self::time($b['time'] ?? null);
        $id = array_key_exists('id', $b) && $b['id'] !== null ? self::id($b['id']) : 0;
        $bad = $title === null ? 'title' : ($project === null ? 'project' : ($date === null ? 'date' : ($time === null ? 'time' : ($id === null ? 'id' : ''))));
        if ($bad !== '') {
            return [400, ['error' => 'INVALID_REMINDER', 'field' => $bad]];
        }
        return $this->run(function () use ($id, $title, $project, $date, $time) {
            if ($id) {
                if (!$this->owns($id)) {
                    return [404, ['error' => 'NOT_FOUND']];
                }
                $this->db->prepare('UPDATE mt_reminders SET title = ?, project = ?, due_date = ?, due_time = ? WHERE id = ? AND user_id = ?')
                    ->execute([$title, $project, $date, $time === '' ? null : $time, $id, $this->uid]);
            } else {
                $q = $this->db->prepare('SELECT COUNT(*) FROM mt_reminders WHERE user_id = ?');
                $q->execute([$this->uid]);
                if ((int) $q->fetchColumn() >= self::MAX_REMINDERS) {
                    return [409, ['error' => 'LIMIT', 'max' => self::MAX_REMINDERS]];
                }
                // the user's running count, read back through LAST_INSERT_ID on this connection: safe under parallel requests
                $this->db->prepare('INSERT INTO mt_reminder_seq (user_id, n) VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE n = LAST_INSERT_ID(n + 1)')
                    ->execute([$this->uid]);
                $n = (int) $this->db->query('SELECT LAST_INSERT_ID()')->fetchColumn();
                $this->db->prepare('INSERT INTO mt_reminders (user_id, title, project, due_date, due_time, color) VALUES (?, ?, ?, ?, ?, ?)')
                    ->execute([$this->uid, $title, $project, $date, $time === '' ? null : $time, ($n - 1) % self::COLORS]);
                $id = (int) $this->db->lastInsertId();
            }
            return [200, ['id' => $id] + $this->list()];
        });
    }

    /** POST /reminders/done {id, done} */
    public function done(array $b): array
    {
        $id = self::id($b['id'] ?? null);
        if ($id === null || !is_bool($b['done'] ?? null)) {
            return [400, ['error' => 'BAD_REQUEST']];
        }
        return $this->run(function () use ($id, $b) {
            if (!$this->owns($id)) {
                return [404, ['error' => 'NOT_FOUND']];
            }
            $this->db->prepare('UPDATE mt_reminders SET done = ? WHERE id = ? AND user_id = ?')->execute([$b['done'] ? 1 : 0, $id, $this->uid]);
            return [200, $this->list()];
        });
    }

    /** POST /reminders/delete {id} */
    public function delete(array $b): array
    {
        $id = self::id($b['id'] ?? null);
        if ($id === null) {
            return [400, ['error' => 'BAD_REQUEST']];
        }
        return $this->run(function () use ($id) {
            $q = $this->db->prepare('DELETE FROM mt_reminders WHERE id = ? AND user_id = ?');
            $q->execute([$id, $this->uid]);
            return $q->rowCount() ? [200, $this->list()] : [404, ['error' => 'NOT_FOUND']];
        });
    }

    /* ---------- notifications ---------- */

    public function notifications(): array
    {
        $q = $this->db->prepare('SELECT COUNT(*) FROM mt_notifications WHERE user_id = ? AND read_at IS NULL');
        $q->execute([$this->uid]);
        $unread = (int) $q->fetchColumn();
        $q = $this->db->prepare('SELECT id, title, body, link, created_at, read_at FROM mt_notifications WHERE user_id = ? ORDER BY id DESC LIMIT ' . self::NOTIFICATIONS);
        $q->execute([$this->uid]);
        $items = array_map(static function (array $n): array {
            return ['id' => (int) $n['id'], 'title' => $n['title'], 'body' => $n['body'], 'link' => $n['link'],
                'createdAt' => str_replace(' ', 'T', $n['created_at']) . 'Z', 'read' => $n['read_at'] !== null];
        }, $q->fetchAll(PDO::FETCH_ASSOC));
        return ['unread' => $unread, 'items' => $items];
    }

    /** POST /notifications/read: everything this user has been shown is read */
    public function readAll(): array
    {
        return $this->run(function () {
            $this->db->prepare('UPDATE mt_notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL')->execute([$this->uid]);
            return [200, $this->notifications()];
        });
    }

    /** for the server's own events (a project step, a payment, the account): one notification for one user.
        Nothing calls it yet: no event that deserves a notification exists today. */
    public static function notify(PDO $db, int $userId, string $title, string $body = '', string $link = ''): void
    {
        self::install($db);
        $db->prepare('INSERT INTO mt_notifications (user_id, title, body, link, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())')
            ->execute([$userId, $title, $body, $link]);
    }
}
