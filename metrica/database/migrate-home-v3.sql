-- METRICA — home page tables (reminders, their colour counter, notifications). Version 3 of the schema.
-- Non-destructive: only CREATE TABLE IF NOT EXISTS. No existing table or row is changed, dropped or reset.
-- Import once in phpMyAdmin (DirectAdmin → MySQL Management → phpMyAdmin → database → Import), or skip it:
-- the API creates the same tables by itself the first time the home page needs them.
-- Same statements as metrica_private/app/Home.php (Home::SCHEMA).

CREATE TABLE IF NOT EXISTS mt_reminders (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mt_reminder_seq (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    n INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mt_notifications (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(120) NOT NULL,
    body VARCHAR(500) NOT NULL DEFAULT '',
    link VARCHAR(200) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,
    KEY mt_notifications_user (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
