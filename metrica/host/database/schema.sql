-- METRICA — MySQL / MariaDB tables for sign-in (OTP) and accounts.
-- Import once into the database created in DirectAdmin (phpMyAdmin → Import). Safe to run again.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS mt_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone CHAR(11) NOT NULL,
  first_name VARCHAR(40) NOT NULL DEFAULT '',
  last_name VARCHAR(40) NOT NULL DEFAULT '',
  plan VARCHAR(10) NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- the browser holds the session token in an HttpOnly cookie; only its SHA-256 is stored here
CREATE TABLE IF NOT EXISTS mt_sessions (
  token_hash CHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  complete TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (token_hash),
  KEY user_id (user_id),
  KEY expires_at (expires_at),
  CONSTRAINT mt_sessions_user FOREIGN KEY (user_id) REFERENCES mt_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- one row per code sent; the code itself is never stored, only its HMAC (times in milliseconds)
CREATE TABLE IF NOT EXISTS mt_otp_requests (
  id CHAR(32) NOT NULL,
  phone CHAR(11) NOT NULL,
  device CHAR(32) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  fails TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY phone_created (phone, created_at),
  KEY device_created (device, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

-- rolling-window counters: code requests and wrong codes per phone, IP and device
CREATE TABLE IF NOT EXISTS mt_otp_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  k VARCHAR(96) NOT NULL,
  at BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY k_at (k, at)
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

-- one row per phone / IP / device key; locked (SELECT … FOR UPDATE) while its limits are checked and counted
CREATE TABLE IF NOT EXISTS mt_otp_locks (
  k VARCHAR(96) NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;
