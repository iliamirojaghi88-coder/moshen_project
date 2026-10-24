# moshen_project

استودیو موشن‌گرافیک بر پایه [HyperFrames](https://github.com/heygen-com/hyperframes) (HTML → MP4)، آماده برای متن، صدا و زیرنویس فارسی.

```bash
npm run setup                     # نصب/بررسی کامل محیط (idempotent)
npm run new -- videos/my-video    # پروژه ویدیویی جدید
cd videos/starter-fa && npx hyperframes check && npx hyperframes snapshot --at 2
npm run tts:fa -- "متن" out.wav   # صداگذاری فارسی محلی (Piper)
npx hyperframes render            # رندر محلی MP4 (رایگان)
```

جزئیات و قوانین کار: `CLAUDE.md`.
