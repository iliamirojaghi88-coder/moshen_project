# متریکا — وب‌اپلیکیشن (نسخه جدید)

وب‌اپ چهارصفحه‌ای، RTL و ریسپانسیو با HTML/CSS/JS خالص؛ بدون فریم‌ورک و بدون اتصال به سرویس.

```bash
cd metrica && python3 -m http.server 8765    # سپس http://127.0.0.1:8765
```
(باز کردن مستقیم `index.html` با `file://` هم کار می‌کند.)

## ساختار

| مسیر | محتوا |
|---|---|
| `index.html` | هدر مشترک، `<main id="view">`، منوی پایین مشترک، قالب چهار صفحه (`<template>`) |
| `assets/css/app.css` | توکن‌ها، پس‌زمینه، هدر، منوی پایین و سلکتور طلایی، صفحه‌های خانه/پروژه‌ها |
| `assets/css/features.css` | شش کارت ابزار، منتقل‌شده از `metrica-sections (2).html` |
| `assets/css/account.css` | صفحه حساب من (واحد `--a` = یک پیکسل مرجع ۹۴۶px) |
| `assets/js/app.js` | روتر hash، وضعیت منو، داده حساب، منحنی‌های SVG (هدر و کارت پروفایل) |
| `assets/img/` | نسخه وب همان PNGهای اصلی (فقط برش حاشیه شفاف و کوچک‌سازی) |
| `source/` | فایل‌های اصلی دست‌نخورده + نسخه پشتیبان HTML قبلی (Git LFS) |
| `tools/prepare-assets.py` | ساخت `assets/img` و فونت از `source/` |
| `tests/` | `nav.test.cjs` (رفتار ناوبری و داده) و `render-matrix.cjs` (رندر در اندازه‌های مختلف) |

## رفتار

- مسیرها: `#/home` خانه · `#/features` امکانات (پیش‌فرض) · `#/projects` پروژه‌ها · `#/account` حساب من. مسیر ناشناخته به امکانات برمی‌گردد.
- هدر و منوی پایین یک بار ساخته می‌شوند؛ با تغییر مسیر فقط `#view` عوض می‌شود و سلکتور طلایی روی گزینه فعال می‌لغزد.
- پنهان‌کردن هدر و منو برای صفحه‌های داخلی عمیق‌تر آماده است (`chrome:false` در `ROUTES`)؛ فعلاً هیچ مسیری از آن استفاده نمی‌کند.
- داده حساب از `state.user` خوانده می‌شود: `Metrica.setUser({ name, avatar, plan: 'normal'|'plus'|'pro' })`. شماره موبایل نمایش داده نمی‌شود.
- دکمه‌هایی که هنوز سرویس ندارند فقط رویداد `metrica:action` می‌فرستند (`document.addEventListener('metrica:action', e => e.detail.action)`).

## تست

```bash
python3 -m http.server 8765 &        # از داخل metrica/
node tests/nav.test.cjs               # ۲۵ بررسی: مسیرها، سلکتور، ثابت‌ماندن هدر/منو، back، داده حساب، خطای کنسول
node tests/render-matrix.cjs http://127.0.0.1:8765/index.html <out-dir>   # اسکرین‌شات + overflow افقی + فونت
```
