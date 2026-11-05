# MP Video Skillset در moshen_project

ادیت ویدیوی خام (فارسی/انگلیسی) و ساخت موشن‌گرافیک از روی صدا، داخل همین مخزن و در سشن‌های ابری Claude Code.
منبع: [ThePudge/mp-video-skillset](https://github.com/ThePudge/mp-video-skillset) (MIT) — جزئیات و تغییرات محلی در
`mp-studio/UPSTREAM.md`، مجوزها در `.claude/licenses/`.

## چه چیزهایی نصب است
| بخش | کجا | کار |
|---|---|---|
| `pro-edit` | `.claude/skills/pro-edit` | خط تولید اصلی ادیت: رونوشت → برنامه → برش → زیرنویس، گرید، پانچ‌این، موزیک، موشن → QC |
| `video-use` | `.claude/skills/video-use` | موتور برش، گرید، رندر EDL (9:16، 4:5، 1:1، 16:9) |
| `voice-motion` + motion-kit | `.claude/skills/voice-motion`، `pro-edit/templates/motion-kit` | ویس → ریل کامل موشن‌گرافیک (HyperFrames) |
| `subject-cutout` | `.claude/skills/subject-cutout` | متن پشت سر گوینده، تار/تیره/تعویض پس‌زمینه |
| `motion-reference`، `style-scout` | `.claude/skills/` | یادگرفتن سبک ویدیوی رفرنس / انتخاب سبک ادیت |
| `fav-*` (۹ مهارت) | `.claude/skills/fav-*` | سبک‌های کامل ادیت: شیشه‌ای، کاغذ شطرنجی، کارت سر بیرون‌زده، متن روی فوتیج، ۳۳ افکت، تبلیغ محصول |
| `anidoodle`، `arta-reels` | `.claude/skills/` | انیمیشن کدی در ۳۲ سبک / ریل فارسی بدون زیرنویس (نصب سنگینشان فقط با اجازه) |
| ۱۵ مهارت محتوا | `viral-hook-writer`، `reel-scripter`، `caption-and-hashtags`، `going-viral`، … | هوک، سناریو، متن روی صفحه، کپشن و هشتگ |
| `learn-update` | `.claude/skills/learn-update` | یادگرفتن از یادداشت‌های `mp-studio/learn/inbox/` |
| ۵ مهارت GSAP | `.claude/skills/gsap-*` (greensock، MIT) | تایم‌لاین و ایزینگ درست برای HyperFrames |
| HyperFrames، Remotion | از قبل در مخزن / پلاگین `remotion` حساب | موشن‌گرافیک HTML و React |
| Kinocut MCP | `.mcp.json` → `.claude/hooks/kinocut-mcp.sh` | ۲۰ ابزار سریع: برش، ادغام، تغییر اندازه، تبدیل، متن، صدا |
| خط تولید ابری | `cloud/` (`setup.sh`، `doctor.py`، `jobs.py`، `fetch_input.py`، `deliver.py`) | نصب، تست سلامت، کارها با تأیید، تحویل |
| MP Studio (وب‌اپ) | `mp-studio/app` | `handoff.py` برای نمایش برنامه و ثبت تأیید |
| فونت‌ها | `mp-studio/fonts` | Vazirmatn و Lalezar (OFL)، اصلاح‌شده برای libass (پایین را ببین) |

نصب نشده (فقط ویندوز/کامپیوتر شخصی): `MP Studio.exe` و نصاب‌هایش، `insta-login-research` (ورود با اینستاگرام خودت).

## دستورها
- مهارت‌ها را با اسم صدا بزن یا فقط بخواه: `/pro-edit`، `/voice-motion`، `/subject-cutout`، `/motion-reference`، `/style-scout`،
  `/fav-edit-video`، `/fav-product-motion-ads`، `/viral-hook-writer`، `/reel-scripter`، `/caption-and-hashtags`، `/gsap-core` …
- محیط: `bash cloud/setup.sh --with-pro` (نصب/تعمیر، تکرارش بی‌خطر است) و `.venv-cloud/bin/python cloud/doctor.py` (جدول قابلیت‌ها).
- کارها: `cloud/jobs.py new|run|render|status|resume|clean`، نمایش و تأیید: `mp-studio/app/handoff.py present|approve|revise`.
- صدا: `pro-edit/audio/voice_clean.py` (light/clean/strong/podcast)، بعد `scripts/audio-master.sh`.
- QC: `scripts/qc-video.sh <mp4>`. فونت فارسی تازه: `scripts/font-fix-libass.py --check <font.ttf>`.

## ادیت یک ویدیو
1. ویدیو را در چت پیوست کن (یا در `mp-studio/input/<project>/` بگذار) و بگو چه می‌خواهی، مثلاً:
   «این ویدیو رو حرفه‌ای ادیت کن»، «مکث‌ها و اضافه‌ها رو حذف کن»، «زیرنویس فارسی متحرک بذار»، «صداش رو تمیز کن»،
   «یه ریل سینمایی ۹:۱۶ با ترنزیشن‌های خوب بساز».
2. Claude رونوشت می‌گیرد (Whisper محلی)، مکث‌ها را می‌بُرد، غلط‌های زیرنویس را درست می‌کند و **برنامه + جدول برش + استوری‌بورد**
   (و در صورت نیاز یک پیش‌نمایش کوتاه) را در چت نشانت می‌دهد.
3. تا وقتی صریحاً نگویی «تأیید» رندر نهایی انجام نمی‌شود. هر تغییری بعد از تأیید (برش، زیرنویس، تنظیمات)، تأیید را باطل می‌کند.
4. خروجی نهایی در `mp-studio/output/<job>/` ساخته می‌شود، QC می‌گیرد و همان فایل در چت برایت فرستاده می‌شود.

## موشن‌گرافیک از روی صدا
ویس یا وویس‌اور را بفرست و بگو «از این صدا یه ویدیوی موشن‌گرافیک حرفه‌ای بساز». `voice-motion` صحنه‌ها (تیتر، کارت آیکون، آمار،
لیست، چت، نوتیفیکیشن، نمودار، CTA) را با تم futuristic یا اپلی می‌چیند و با HyperFrames رندر می‌کند؛ کتابخانه‌ها (GSAP، آیکون‌ها) یک‌بار
دانلود و داخل پروژه گذاشته می‌شوند، رندر به CDN وصل نمی‌شود. برای تبلیغ محصول: `fav-product-motion-ads` با تصاویر/مدل واقعی محصول.

## ویدیوی رفرنس
فایل‌های رفرنس را در `mp-studio/input/<project>/ref/` بگذار (یا پیوست کن و بگو «سبک ادیت این رو بگیر»). `motion-reference` ریتم برش،
هوک ۱۰ ثانیه‌ی اول و حرکت‌ها را به دستورالعمل تبدیل می‌کند؛ فقط سبک برداشته می‌شود، نه صحنه، آدم یا متن. دانلود از لینک فقط با اجازه‌ی تو.

## خروجی
- ابعاد: ۹:۱۶ (۱۰۸۰×۱۹۲۰، پیش‌فرض)، ۱:۱ و ۱۶:۹ (برش از وسط تصویر؛ در `render-profiles.json`). H.264 + AAC، بلندی ‎−14 LUFS‎.
- تحویل پیش‌فرض: فایل در چت. آپلود گوگل‌درایو (`cloud/deliver.py`) فقط اگر خودت بخواهی و Secretهای `MP_GDRIVE_*` را در تنظیمات محیط بگذاری.

## محدودیت‌های فضای ابری
- فقط CPU: Whisper `medium` با int8 (`VIDEO_USE_WHISPER_MODEL`، برای فارسی بهتر از small)؛ رندرها کندتر از کارت گرافیک.
  کارهای طولانی در پس‌زمینه اجرا می‌شوند.
- مدل Whisper (~۱٫۵ گیگ) اولین بار که رونوشت لازم شود دانلود می‌شود؛ کانتینر تازه یعنی دانلود دوباره.
- بدون پنجره‌ی MP Studio، بدون ورود به اینستاگرام، بدون انکودر GPU، بدون `MP Studio.exe`.
- لینک مستقیم ویدیو یا صفحه‌ی عمومی (با `cloud/fetch_input.py`، سقف حجم/مدت، بدون کوکی و لاگین) کار می‌کند، ولی سیاست شبکه‌ی محیط
  ممکن است بعضی سایت‌ها را ببندد (مثلاً `github.com/.../raw` اینجا 403 داد)؛ آن وقت فایل را پیوست کن.
- `anidoodle` و `arta-reels` نصب سنگین جدا دارند (Chromium/npm، PyTorch)؛ فقط با اجازه.
- ابزارهای AI/vision در Kinocut، HeyGen cloud، ElevenLabs، Gemini و پست خودکار `content-factory` پولی/بیرونی‌اند: فقط با اجازه‌ی صریح.

## پیش‌نیازها
Ubuntu (کانتینر ابری)، Python 3.12 در `.venv-cloud` (uv)، FFmpeg با libass و libx264 (۶.۱ هم پشتیبانی می‌شود)، Node 22 + HyperFrames
+ Chrome headless (از `scripts/setup-motion-env.sh`)، فونت‌های `mp-studio/fonts`. حجم: محیط پایه + pro حدود ۱٫۴ گیگ (git-ignored).

## ماندگاری بین سشن‌ها
- **در سطح مخزن (تست‌شده):** همه‌ی مهارت‌ها، اسکریپت‌ها، فونت‌ها و تنظیمات در git هستند؛ هر سشن تازه روی `main` آن‌ها را دارد.
  هوک `SessionStart` (`scripts/mp-video-env.sh`، async) اگر `.venv-cloud` نباشد یا requirements عوض شده باشد آن را در پس‌زمینه
  می‌سازد (حدود یک دقیقه) و در غیر این صورت در چند میلی‌ثانیه رد می‌شود. `cloud/setup.sh` قفل دارد؛ اجرای دستی منتظر نصب پس‌زمینه می‌ماند.
  Kinocut MCP اگر venv آماده نباشد از `uvx` (نسخه‌ی پین‌شده) بالا می‌آید.
- **در سطح محیط (تست نشده):** «Setup script» محیط ابری (منوی محیط ← Edit) برای همه‌ی مخزن‌های همان محیط اجرا می‌شود؛ می‌شود آنجا
  این مهارت‌ها را در `~/.claude/skills` کپی کرد. تنظیمش با خودت است.
- **در سطح حساب (تست نشده):** مهارت‌ها و پلاگین‌هایی که در حساب claude.ai فعال‌اند (مثل پلاگین `remotion`) در هر سشن همگام می‌شوند.
  آپلود این مجموعه به حسابت انجام نشده و ادعا نمی‌شود؛ در مخزن‌های دیگر این مهارت‌ها خودکار نیستند.

## نکته‌ی فونت فارسی
libass (زیرنویس FFmpeg) حروف تنها (ا ی ر و ن …) را در فونت‌هایی که Arabic Presentation Forms ندارند مربع یا حذف می‌کند
(Lalezar: «حرفه□□»؛ Vazirmatn: «دربارۀ» ← «دربار»). فونت‌های `mp-studio/fonts` با `scripts/font-fix-libass.py` اصلاح شده‌اند
(فقط جدول cmap، شکل حروف دست نخورده). هر فونت تازه‌ای که اضافه می‌کنی را با `--check` بسنج و در صورت نیاز اصلاح کن.
