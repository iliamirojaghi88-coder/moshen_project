# کیت بازیابی اکوسیستم Claude Code

موجودی کامل و آزمودهٔ همهٔ ابزارها، اسکیل‌ها، پلاگین‌ها، سرورهای MCP، کانکتورها، هوک‌ها و CLIهایی که از نشست ابری
`moshen_project` در دسترس بودند (۲۰۲۶-۱۱-۰۵)، به‌همراه اسکریپت بازیابی برای انتقال به حساب، سیستم یا محیط دیگر.

| فایل | کار |
|---|---|
| `tools-inventory.json` | منبع حقیقت: هر مورد با کاربرد، لینک رسمی، نسخه، مجوز، دستور نصب و فعال‌سازی، وابستگی، فاز، سکوها، حساسیت و نتیجهٔ آزمون |
| `dist/claude-code-recovery-report.pdf` | گزارش کامل فارسی (RTL) |
| `dist/claude-code-recovery-kit.zip` | بستهٔ قابل‌حمل: همهٔ موارد بالا + `payload/project` (لایهٔ `.claude` ردیابی‌شده در git، `.mcp.json`، `skills-lock.json`) + `MANIFEST.sha256`. در git نیست (حدود ۱۰ مگابایت و تکرار فایل‌های ریپو)؛ با `build-kit.sh` دوباره ساخته می‌شود |
| `restore.sh` / `restore.py` | بازیابی بر اساس فاز؛ **پیش‌فرض Dry Run است**؛ فایل موجود را بازنویسی نمی‌کند؛ کلید و احراز هویت را خودکار نمی‌کند |
| `verify.sh` | بررسی فقط‌خواندنی: PASS / FAIL / ABSENT برای هر مورد |
| `templates/` | تنظیمات و MCP عمومی برای پروژه‌ای غیر از moshen_project |
| `tests/run_tests.py` | ده آزمون؛ نتیجه در `TEST-RESULTS.md` و `test-results.json` |
| `build-kit.sh`، `build/` | بازسازی JSON → HTML → PDF → ZIP از روی ریپو |

## بازیابی

```bash
unzip claude-code-recovery-kit.zip && cd claude-code-recovery-kit
sha256sum -c payload/MANIFEST.sha256 --quiet     # سلامت payload (macOS: shasum -a 256 -c)
bash restore.sh                                   # برنامه، بدون هیچ تغییری
bash restore.sh --apply --phase 0,1               # Git، Node 22، Python، uv، FFmpeg، Claude Code
claude                                            # و /login
```

سپس فاز ۲ را دستی انجام دهید (هیچ‌کدام قابل اسکریپت نیست):

1. اتصال GitHub و نصب Claude GitHub App: <https://claude.ai/connect-github>
2. کانکتورها (Figma، HyperFrames by HeyGen، Adobe): <https://claude.ai/customize/connectors>
3. پلاگین‌های حساب: frontend-design، adobe-for-creativity، remotion (Anthropic plugin directory در claude.ai)
4. محیط‌های ابری: Default (شبکهٔ محدود) و Motion-Production (شبکهٔ آزاد + network secret برای Gemini با هدر `x-goog-api-key`). مقدار secret را خودتان وارد کنید.
5. دسترسی حساب جدید به ریپوی `iliamirojaghi88-coder/moshen_project` (Transfer، Fork یا Collaborator)
6. شبکهٔ محیط: در محیط با شبکهٔ محدود، میزبان‌های فهرست‌شده در `network-hosts.txt` را به allowed hosts اضافه کنید، وگرنه نصب Blender، صدای فارسی، Context7 و MusicGen با خطای ۴۰۳ شکست می‌خورد.

بعد:

```bash
git clone https://github.com/iliamirojaghi88-coder/moshen_project.git
bash restore.sh --apply --phase 4,5,6 --target moshen_project        # وابستگی‌های پروژه، graphify، venv ویدیو
bash restore.sh --apply --phase 5,7 --include-optional --target moshen_project   # MCPهای سراسری، Blender، KTX، whisper.cpp، ...
bash verify.sh --target moshen_project
```

پروژهٔ دیگر یا بدون دسترسی به ریپو: `bash restore.sh --apply --phase 3 --generic --target ~/my-repo`
(لایهٔ `.claude` از payload، با تنظیمات عمومی به‌جای هوک‌هایی که اسکریپت‌های این ریپو را صدا می‌زنند).
آینهٔ اسکیل‌های عمومی در `~/.claude/skills`: `--phase 3 --include-optional`.

| گزینه | معنی |
|---|---|
| `--apply` | اجرای واقعی (بدون آن فقط برنامه) |
| `--phase 0,1,…` / `--only <id>` | محدود به فاز یا شناسه |
| `--include-optional` | ابزارهای اختیاری (MCP سراسری، Blender، Docker، …) |
| `--include-sensitive` | ابزارهای حساس (claude-mem، strix)؛ فقط پس از بررسی |
| `--generic` | مقصد moshen_project نیست |
| `--os windows\|macos` | فقط برنامه برای سیستم دیگر |
| `--payload <dir>` | payload دیگر (پیش‌فرض: `payload/project` در ZIP یا ریشهٔ همین ریپو) |

## فازها

0 پیش‌نیازها · 1 Claude Code · 2 حساب و احراز هویت (دستی) · 3 لایهٔ `.claude` · 4 وابستگی‌های پروژه · 5 ابزارهای ایجنت و MCP ·
6 runtime ویدیوی MP · 7 ابزارهای سنگین اختیاری · 8 سرویس‌های کلیددار و ابزارهای حساس (دستی) · 9 `verify.sh`

## امنیت

- هیچ کلید، توکن، مقدار secret، کوکی یا حافظهٔ claude-mem در کیت نیست. `build-kit.sh` پیش از ساخت ZIP اسکن secret می‌کند.
- نصب یک ابزار با احراز هویت سرویس پشت آن فرق دارد. نصب را کیت انجام می‌دهد و احراز هویت را فقط مالک حساب.
- ابزارهای 🔒 (strix، claude-mem، سرویس‌های پولی، آپلود Drive، انتشار محتوا) بدون پرچم صریح اجرا نمی‌شوند.
- نصب‌کننده‌هایی که اسکریپت را مستقیم به شل می‌دهند (uv، Bun، NodeSource، Claude) را پیش از اجرا بخوانید. بار اول در محیط آزمایشی اجرا کنید.

## بازسازی کیت

```bash
bash docs/claude-code-recovery/build-kit.sh       # JSON → PDF → ZIP
python3 docs/claude-code-recovery/tests/run_tests.py
bash docs/claude-code-recovery/build-kit.sh       # تا نتیجهٔ آزمون‌ها داخل PDF و ZIP برود
```

اسکیل تازه‌ای که در `.claude/skills` اضافه شود و نگاشت بسته و کاربرد فارسی در `build/build_inventory.py` نداشته باشد،
ساخت را متوقف می‌کند تا هیچ موردی بی‌صدا جا نیفتد.
