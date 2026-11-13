<?php
/* =====================================================================================
   METRICA — private settings. This folder (metrica_private) must stay OUTSIDE public_html.
   Fill in: the four database values, then the two Faraz SMS values. Nothing else needs editing.
   Until API_KEY and PATTERN_UID hold real values, no SMS is sent and the code step stays closed.
   ===================================================================================== */

// ---- 1. MySQL database (DirectAdmin → MySQL Management → Create new database) ----
const DB_HOST = "localhost";
const DB_NAME = "PASTE_DB_NAME_HERE";
const DB_USER = "PASTE_DB_USER_HERE";
const DB_PASS = "PASTE_DB_PASSWORD_HERE";

// ---- 2. Faraz SMS (panel.iranpayamak.com) — the only two values to paste ----
const API_KEY = "PASTE_YOUR_API_KEY_HERE";
const PATTERN_UID = "PASTE_YOUR_PATTERN_UID_HERE";

// ---- preset: Faraz SMS pattern API (no need to change) ----
const SMS_API_URL = "https://api.iranpayamak.com/ws/v1/sms/pattern";
const SMS_SENDER = "90008361";
const SMS_PATTERN_VARIABLE = "code"; // the variable name in your approved pattern, e.g. «کد ورود متریکا: %code%»

// ---- preset: generated for this package; keep it private, do not change it after going live ----
const APP_SECRET = "GENERATED_AT_BUILD";

// ---- optional: only behind a CDN/proxy, the header holding the visitor's real IP, e.g. "HTTP_CF_CONNECTING_IP" ----
const TRUSTED_IP_HEADER = "";
