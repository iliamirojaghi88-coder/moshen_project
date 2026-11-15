-- TEST ONLY: the live site's tables (schema.sql is not in the package), rebuilt from what app/*.php reads and writes,
-- so the API can run against a local MariaDB. Never run this on the host: the real tables already exist there.
CREATE TABLE IF NOT EXISTS mt_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone CHAR(11) NOT NULL UNIQUE,
  first_name VARCHAR(40) NOT NULL DEFAULT '',
  last_name VARCHAR(40) NOT NULL DEFAULT '',
  plan VARCHAR(10) NOT NULL DEFAULT 'normal',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS mt_sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  complete TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  last_seen_at BIGINT NULL,
  expires_at BIGINT NOT NULL,
  KEY (user_id), KEY (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mt_otp_locks (k VARCHAR(100) NOT NULL PRIMARY KEY) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mt_otp_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, k VARCHAR(100) NOT NULL, at BIGINT NOT NULL, KEY (k, at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mt_otp_requests (
  id CHAR(32) NOT NULL PRIMARY KEY, phone CHAR(11) NOT NULL, device CHAR(32) NOT NULL, code_hash CHAR(64) NOT NULL,
  created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, fails INT NOT NULL DEFAULT 0, used TINYINT(1) NOT NULL DEFAULT 0,
  KEY (phone, created_at), KEY (device, created_at)
) ENGINE=InnoDB;
