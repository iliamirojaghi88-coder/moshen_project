#!/usr/bin/env python3
"""Builds ../tools-inventory.json for the Claude Code recovery kit.

Facts that cannot be read from disk (purpose, official link, licence, install
command, evidence from the 2026-11-05 inventory session) are written here once;
skills are discovered from disk so a new skill cannot be missed silently
(tests/run_tests.py fails when disk and JSON disagree).

    python3 build/build_inventory.py            # writes tools-inventory.json
"""
import json, os, re, sys
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
REPO = KIT.parents[1]
INVENTORY_DATE = "2026-11-05"

ALL = {"cloud": "yes", "linux": "yes", "macos": "yes", "windows": "yes"}
WIN_BASH = {"cloud": "yes", "linux": "yes", "macos": "yes", "windows": "partial"}  # hooks/scripts are bash: Git Bash or WSL
LINUX_ONLY = {"cloud": "yes", "linux": "yes", "macos": "no", "windows": "no"}
CLOUD_ONLY = {"cloud": "yes", "linux": "no", "macos": "no", "windows": "no"}
MP = {"cloud": "yes", "linux": "yes", "macos": "partial", "windows": "partial"}

def item(id, name, category, status, purpose, **kw):
    d = dict(id=id, name=name, category=category, status=status, purpose_fa=purpose,
             url=None, version=None, license=None, bundle=None, scope=None,
             install=None, activate=None, verify=None, depends_on=[], auth="none",
             portability=ALL, project_specific=False, sensitive=False,
             recoverable="auto", tested=None, notes=None, restore=None)
    d.update(kw)
    return d

ITEMS = []
add = ITEMS.append

# ---------------------------------------------------------------- core / runtime
CC = "cli:claude-code"
add(item(CC, "Claude Code CLI", "claude-code-core", "installed",
    "خود Claude Code: ایجنت کدنویسی در ترمینال، دسکتاپ، وب و IDE",
    url="https://code.claude.com/docs", version="2.1.318", license="Proprietary (Anthropic)", scope="system",
    install="npm install -g @anthropic-ai/claude-code   (یا نصب‌کنندهٔ رسمی: curl -fsSL https://claude.ai/install.sh | bash ؛ ویندوز: irm https://claude.ai/install.ps1 | iex)",
    activate="claude  ← سپس /login با حساب claude.ai", verify="claude --version",
    auth="account:claude.ai", depends_on=["runtime:node"], tested="claude --version → 2.1.318",
    restore=dict(phase=1, method="command", check="command -v claude",
                 commands={"posix": "npm install -g @anthropic-ai/claude-code", "windows": "npm install -g @anthropic-ai/claude-code"})))

def runtime(id, name, purpose, url, version, verify, cmds, check, tested, phase=0, port=ALL, optional=False, notes=None, status="installed", lic=None, deps=()):
    add(item(id, name, "runtime", status, purpose, url=url, version=version, license=lic, scope="system",
             install=" | ".join(f"{k}: {v}" for k, v in cmds.items()), verify=verify, portability=port,
             tested=tested, notes=notes, depends_on=list(deps),
             restore=dict(phase=phase, method="command", check=check, commands=cmds, optional=optional)))

runtime("runtime:git", "Git + Git LFS", "کنترل نسخه؛ LFS برای GLB/HDR کتابخانه", "https://git-scm.com", "git 2.x, git-lfs 3.4.1",
        "git --version && git lfs version",
        {"linux": "sudo apt-get install -y git git-lfs && git lfs install", "macos": "brew install git git-lfs && git lfs install",
         "windows": "winget install --id Git.Git -e"}, "command -v git && command -v git-lfs", "git-lfs/3.4.1", lic="GPL-2.0 / MIT")
runtime("runtime:node", "Node.js 22 + npm", "اجرای HyperFrames، Remotion، npx، MCPها و هوک‌های Ponytail", "https://nodejs.org", "22.23.4 / npm 10.9.9",
        "node -v && npm -v",
        {"linux": "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs",
         "macos": "brew install node@22", "windows": "winget install --id OpenJS.NodeJS.LTS -e"}, "command -v node && command -v npm",
        "node v22.23.4", lic="MIT")
runtime("runtime:python", "Python 3.12+ + pip", "اسکریپت‌های سه‌بعدی، TTS، اسکیل‌های UI/UX و MP", "https://www.python.org", "3.13.18 (system), 3.12.3 (.venv-cloud)",
        "python3 -V", {"linux": "sudo apt-get install -y python3 python3-pip python3-venv", "macos": "brew install python@3.12",
                       "windows": "winget install --id Python.Python.3.12 -e"}, "command -v python3", "Python 3.13.18", lic="PSF")
runtime("runtime:uv", "uv / uvx", "نصب سریع ابزارهای پایتون (graphify، kinocut، venv ابری)", "https://docs.astral.sh/uv/", "0.11.32",
        "uv --version", {"posix": "curl -LsSf https://astral.sh/uv/install.sh | sh", "windows": "powershell -ExecutionPolicy ByPass -c \"irm https://astral.sh/uv/install.ps1 | iex\""},
        "command -v uv", "uv 0.11.32", lic="MIT/Apache-2.0", notes="نصب‌کنندهٔ اسکریپتی است؛ پیش از اجرا متن آن را بخوانید.")
runtime("runtime:ffmpeg", "FFmpeg / ffprobe", "پردازش ویدیو و صدا، QC، کپشن ASS", "https://ffmpeg.org", "6.1.1 (Ubuntu)",
        "ffmpeg -version", {"linux": "sudo apt-get install -y ffmpeg", "macos": "brew install ffmpeg", "windows": "winget install --id Gyan.FFmpeg -e"},
        "command -v ffmpeg && command -v ffprobe", "ffmpeg 6.1.1", lic="LGPL/GPL")
runtime("runtime:bun", "Bun", "زمان اجرای worker حافظهٔ claude-mem (خودکار با نصب claude-mem)", "https://bun.sh", "1.4.4",
        "bun --version", {"posix": "curl -fsSL https://bun.sh/install | bash", "windows": "powershell -c \"irm bun.sh/install.ps1 | iex\""},
        "command -v bun", "bun 1.4.4", optional=True, phase=5, lic="MIT", notes="نصب‌کنندهٔ claude-mem خودش Bun را نصب می‌کند.")
runtime("runtime:docker", "Docker", "رندر ایزوله (hyperframes render --docker) و اجرای strix", "https://docs.docker.com/get-docker/", "binary present; daemon off",
        "docker info", {"linux": "sudo apt-get install -y docker.io", "macos": "brew install --cask docker", "windows": "winget install --id Docker.DockerDesktop -e"},
        "command -v docker", "باینری هست؛ daemon در این نشست بالا نیامد (اسکریپت setup پیش از آن متوقف شد)", phase=7, optional=True, lic="Apache-2.0")
runtime("runtime:playwright-chromium", "Playwright CLI + Chromium", "مرورگر بدون‌سر برای تست، اسکرین‌شات و ساخت PDF", "https://playwright.dev", "1.63.0",
        "npx playwright --version", {"posix": "npx -y playwright@1.63.0 install chromium", "windows": "npx -y playwright@1.63.0 install chromium"},
        "command -v playwright || test -d /opt/pw-browsers", "Version 1.63.0؛ Chromium در /opt/pw-browsers", lic="Apache-2.0",
        notes="در ایمیج ابری از قبل هست؛ آنجا playwright install اجرا نشود.")
for cli, purpose in [("gh", "GitHub CLI (در نشست ابری فقط برای جست‌وجو)"), ("gcloud", "Google Cloud CLI"), ("bq", "BigQuery CLI"), ("gsutil", "Cloud Storage CLI")]:
    add(item(f"cli:{cli}", cli, "image-cli", "installed", purpose + " — از پیش در ایمیج ابری و پیکربندی‌شده برای پراکسی",
             scope="system", url={"gh": "https://cli.github.com", "gcloud": "https://cloud.google.com/sdk", "bq": "https://cloud.google.com/bigquery/docs/bq-command-line-tool",
                                  "gsutil": "https://cloud.google.com/storage/docs/gsutil"}[cli],
             install="در ایمیج ابری از پیش نصب است؛ روی سیستم شخصی از سایت رسمی", verify=f"command -v {cli}",
             auth="oauth/gcloud auth یا gh auth (روی سیستم شخصی)", portability=ALL, recoverable="manual", tested=f"command -v {cli} → found"))
for cli, purpose, url in [("pandoc", "تبدیل اسناد", "https://pandoc.org"), ("libreoffice", "تبدیل اسناد آفیس", "https://www.libreoffice.org"),
                          ("jq", "پردازش JSON در شل", "https://jqlang.github.io/jq/"), ("cmake", "ساخت whisper.cpp", "https://cmake.org")]:
    add(item(f"cli:{cli}", cli, "image-cli", "installed", purpose + " — از پیش در ایمیج ابری", url=url, scope="system",
             install=f"apt/brew/winget install {cli}", verify=f"command -v {cli}", recoverable="manual", tested=f"command -v {cli} → found"))

# ---------------------------------------------------------------- environments / repo / auth
add(item("repo:moshen_project", "ریپوی moshen_project (منبع vendor همهٔ اسکیل‌ها)", "repository", "installed",
    "نگه‌دارندهٔ .claude/ (۹۹ اسکیل، ایجنت، فرمان، هوک)، .mcp.json و ابزارهای پروژه",
    url="https://github.com/iliamirojaghi88-coder/moshen_project", scope="project", auth="github:repo-access",
    install="git clone https://github.com/iliamirojaghi88-coder/moshen_project.git", verify="git -C <target> rev-parse HEAD",
    recoverable="manual", project_specific=True, tested="شاخهٔ ccr-929b4040-uth0oq = origin/main (98393f0)",
    notes="حساب جدید باید به این ریپو دسترسی بگیرد (Transfer، Fork یا Collaborator). جایگزین بدون دسترسی: payload داخل ZIP."))
add(item("auth:github-app", "Claude GitHub App + اتصال GitHub", "account-auth", "account",
    "دسترسی نشست‌های ابری به ریپو، push و ابزارهای mcp__github__*",
    url="https://github.com/apps/claude", scope="account", auth="oauth:github", recoverable="manual", portability=CLOUD_ONLY,
    install="https://claude.ai/connect-github  سپس نصب App روی ریپو: https://github.com/apps/claude/installations/select_target",
    tested="mcp__github__* در این نشست در دسترس بود"))
add(item("env:Default", "محیط ابری Default", "cloud-environment", "session",
    "محیط فعلی: شبکهٔ محدود (فقط رجیستری بسته‌ها و MCP)، بدون secret و بدون setup script",
    url="https://code.claude.com/docs/en/claude-code-on-the-web", scope="account", portability=CLOUD_ONLY, recoverable="manual",
    install="claude.ai/code → منوی محیط → New environment", tested="get_environment: limited, allowed_hosts=[], network_secrets=[]",
    notes="download.blender.org در این محیط مسدود است (403) و به همین دلیل اسکریپت setup متوقف شد."))
add(item("env:Motion-Production", "محیط ابری Motion-Production", "cloud-environment", "account",
    "محیط دوم: شبکهٔ آزاد + network secret برای Gemini (هدر x-goog-api-key روی generativelanguage.googleapis.com)",
    scope="account", portability=CLOUD_ONLY, recoverable="manual", auth="key:x-goog-api-key (network secret)", sensitive=True,
    url="https://code.claude.com/docs/en/claude-code-on-the-web",
    install="در حساب جدید دستی بسازید؛ مقدار secret را خودتان در Network secrets وارد کنید", tested="get_environment: unrestricted, 1 network secret (فقط نام)",
    notes="مقدار secret هرگز خوانده یا صادر نشد و قابل انتقال نیست."))

# ---------------------------------------------------------------- built-in tools
BUILTIN_TOOLS = {
    "Agent": "اجرای زیرعامل (fork یا نوع مشخص)", "Artifact": "انتشار صفحهٔ HTML خصوصی در claude.ai",
    "ArtifactComments": "خواندن/پاسخ به کامنت‌های Artifact", "ArtifactData": "پایگاه دادهٔ مشترک Artifact",
    "AskUserQuestion": "پرسش چندگزینه‌ای از کاربر", "Bash": "اجرای دستور شل", "CronCreate": "زمان‌بندی محلی کار تکراری",
    "CronDelete": "حذف زمان‌بندی محلی", "CronList": "فهرست زمان‌بندی‌های محلی", "DesignSync": "همگام‌سازی طراحی",
    "Edit": "ویرایش دقیق فایل", "EnterPlanMode": "ورود به حالت برنامه‌ریزی", "EnterWorktree": "کار در git worktree جدا",
    "ExitPlanMode": "خروج از حالت برنامه‌ریزی", "ExitWorktree": "خروج از worktree", "Glob": "یافتن فایل با الگو",
    "Grep": "جست‌وجوی متن (ripgrep)", "ListAgents": "فهرست عامل‌های قابل پیام", "ListConnectors": "فهرست کانکتورهای حساب",
    "ListMcpResourcesTool": "فهرست منابع MCP", "ListPlugins": "فهرست پلاگین‌ها", "ListSkills": "فهرست اسکیل‌های فعال",
    "Monitor": "پایش فرایند پس‌زمینه تا شرط", "NotebookEdit": "ویرایش Jupyter", "PushNotification": "اعلان به گوشی کاربر",
    "Read": "خواندن فایل/تصویر/PDF", "ReadMcpResourceDirTool": "خواندن پوشهٔ منبع MCP", "ReadMcpResourceTool": "خواندن منبع MCP",
    "ReadNotifications": "خواندن اعلان‌های نشست", "ReportFindings": "گزارش یافته‌های بازبینی کد", "ScheduleWakeup": "زمان‌بندی /loop پویا",
    "SearchMcpRegistry": "جست‌وجوی رجیستری MCP", "SearchPlugins": "جست‌وجوی پلاگین", "SearchSkills": "جست‌وجوی اسکیل",
    "SendMessage": "پیام به عامل/نشست دیگر", "SendUserFile": "تحویل فایل قابل دریافت به کاربر",
    "ShowOnboardingRolePicker": "انتخاب نقش در راه‌اندازی Cowork", "Skill": "فراخوانی اسکیل", "SuggestConnectors": "پیشنهاد کانکتور",
    "SuggestPluginInstall": "پیشنهاد نصب پلاگین", "SuggestSkills": "پیشنهاد اسکیل قابل‌افزودن", "TaskCreate": "ساخت وظیفه",
    "TaskGet": "خواندن وظیفه", "TaskList": "فهرست وظایف", "TaskStop": "توقف وظیفهٔ پس‌زمینه", "TaskUpdate": "به‌روزرسانی وظیفه",
    "ToolSearch": "بارگذاری ابزارهای deferred", "WebFetch": "دریافت صفحهٔ وب", "WebSearch": "جست‌وجوی وب", "Write": "نوشتن فایل",
}
SURFACE = {"Artifact", "ArtifactComments", "ArtifactData", "SendUserFile", "PushNotification", "ShowOnboardingRolePicker", "DesignSync",
           "ReadNotifications", "ScheduleWakeup"}
for t, p in BUILTIN_TOOLS.items():
    add(item(f"builtin-tool:{t}", t, "builtin-tool", "builtin", p, scope="system", url="https://code.claude.com/docs",
             install="همراه Claude Code؛ نصب جداگانه ندارد", depends_on=[CC],
             portability=({"cloud": "yes", "linux": "partial", "macos": "partial", "windows": "partial"} if t in SURFACE else ALL),
             notes=("وابسته به سطح (claude.ai/اپ/Cowork)" if t in SURFACE else None),
             tested="در فهرست ابزارهای همین نشست بود"))

BUILTIN_SKILLS = {
    "session-start-hook": "ساخت هوک SessionStart برای ریپو", "dataviz": "اصول ساخت نمودار و داشبورد",
    "artifact-design": "قرارداد و طراحی صفحهٔ Artifact", "artifact-diagramming": "دیاگرام SVG در Artifact",
    "artifact-capabilities": "قابلیت‌های زمان اجرای Artifact", "update-config": "تنظیم settings.json، هوک و مجوزها",
    "keybindings-help": "میان‌برهای صفحه‌کلید", "code-review": "بازبینی diff یا PR برای باگ", "simplify": "پاک‌سازی و ساده‌سازی تغییرات",
    "fewer-permission-prompts": "کاهش درخواست مجوز با allowlist", "loop": "اجرای دوره‌ای یک فرمان", "claude-api": "مرجع Claude API و SDK",
    "run": "اجرای برنامه برای دیدن تغییر", "plugin-authoring": "ساخت mod/پلاگین برای رابط Claude", "init": "ساخت CLAUDE.md برای ریپو",
    "security-review": "بازبینی امنیتی تغییرات",
}
for s, p in BUILTIN_SKILLS.items():
    add(item(f"builtin-skill:{s}", s, "builtin-skill", "builtin", p, scope="system", url="https://code.claude.com/docs/en/skills",
             install="همراه Claude Code", activate=f"/{s}", depends_on=[CC], tested="در فهرست اسکیل‌های همین نشست بود"))
for a, p in {"claude": "عامل همه‌منظوره (پیش‌فرض FleetView)", "claude-code-guide": "پاسخ به پرسش‌های Claude Code/SDK/API",
             "Explore": "جست‌وجوی فقط‌خواندنی گسترده", "general-purpose": "پژوهش و کار چندمرحله‌ای",
             "Plan": "طراحی برنامهٔ پیاده‌سازی", "statusline-setup": "تنظیم status line"}.items():
    add(item(f"builtin-agent:{a}", a, "builtin-agent", "builtin", p, scope="system", url="https://code.claude.com/docs/en/sub-agents",
             install="همراه Claude Code", depends_on=[CC], tested="در فهرست ایجنت‌های همین نشست بود"))

# ---------------------------------------------------------------- MCP servers / connectors
def mcp(id, name, category, status, purpose, tools, **kw):
    kw.setdefault("notes", None)
    kw["tools"] = tools.split()
    add(item(id, name, category, status, purpose + f" ({len(kw['tools'])} ابزار)", **kw))

mcp("mcp:context7", "context7 (MCP)", "project-mcp", "installed", "مستندات به‌روز و نسخه‌دقیق کتابخانه‌ها",
    "resolve-library-id query-docs", url="https://github.com/upstash/context7", license="MIT", scope="project (.mcp.json) + user",
    install="در .mcp.json ریپو: npx -y @upstash/context7-mcp | سراسری: claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp",
    auth="اختیاری key:CONTEXT7_API_KEY (بدون کلید با سقف کمتر)", depends_on=["runtime:node"],
    tested="MCP متصل، ولی resolve-library-id → «fetch failed»: میزبان context7.com در شبکهٔ محدود محیط Default مجاز نیست",
    notes="برای کار کردن: میزبان API کانتکست۷ را به allowed hosts محیط اضافه کنید یا محیط با شبکهٔ آزاد.",
    restore=dict(phase=5, method="command", optional=True, check="grep -q '\"context7\"' \"$HOME/.claude.json\"",
                 commands={"posix": "claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp",
                           "windows": "claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp"}))
mcp("mcp:playwright", "playwright (MCP)", "project-mcp", "installed", "کنترل مرورگر: کلیک، تایپ، اسکرین‌شات، شبکه",
    "browser_click browser_close browser_console_messages browser_drag browser_drop browser_emulate_media browser_evaluate browser_file_upload browser_fill_form browser_find browser_handle_dialog browser_hover browser_navigate browser_navigate_back browser_network_request browser_network_requests browser_press_key browser_resize browser_run_code_unsafe browser_select_option browser_snapshot browser_tabs browser_take_screenshot browser_type browser_wait_for",
    url="https://github.com/microsoft/playwright-mcp", license="Apache-2.0", scope="project (.mcp.json) + user",
    install="در .mcp.json ریپو: npx -y @playwright/mcp@latest | سراسری: claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest",
    depends_on=["runtime:node", "runtime:playwright-chromium"], tested="متصل (ابزارها در فهرست نشست بودند)؛ فراخوانی عملکردی انجام نشد",
    notes="browser_run_code_unsafe کد دلخواه اجرا می‌کند.",
    restore=dict(phase=5, method="command", optional=True, check="grep -q '\"playwright\"' \"$HOME/.claude.json\"",
                 commands={"posix": "claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest",
                           "windows": "claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest"}))
mcp("mcp:kinocut", "kinocut (MCP)", "project-mcp", "installed", "ویرایش ویدیو روی ffmpeg: برش، ادغام، متن، صدا، QC",
    "hyperframes_doctor search_tools video_add_audio video_add_text video_add_texts video_convert video_doctor video_extract_frame video_info video_merge video_project_create video_quality_check video_rescue_inspect video_resize video_review_package video_shorts video_speed video_trim video_validate_text_layout video_workflow_inspect",
    url="https://github.com/KyaniteLabs/kinocut", version="1.16.5", license="Apache-2.0", scope="project (.mcp.json)",
    install="خودکار از .mcp.json → .claude/hooks/kinocut-mcp.sh (uvx --from kinocut==1.16.5 kino --mcp)", depends_on=["runtime:uv", "runtime:ffmpeg"],
    portability=WIN_BASH, tested="video_doctor اجرا شد (پس از ری‌استارت worker یک بار CONNECT_TIMEOUT و سپس اتصال دوباره): required_ok=true، kinocut 1.16.5 (از uvx، چون .venv-cloud هنگام شروع آماده نبود)، ffmpeg 6.1.1", notes="هوش مصنوعی/vision و telemetry آن خاموش است؛ افزونه‌های اختیاری (image، audio، stems) نصب نیستند.")
mcp("mcp:claude-mem", "claude-mem (MCP)", "project-mcp", "installed", "جست‌وجوی حافظهٔ نشست‌ها: search، timeline، get_observations",
    "build_corpus dumb_search get_observations get_tool_uses important_workflow list_corpora prime_corpus query_corpus rebuild_corpus reprime_corpus save_memory search session_start_context smart_outline smart_search smart_unfold timeline work_state_read work_state_write", url="https://github.com/thedotmack/claude-mem", version="15.9.0", license="Apache-2.0",
    scope="project (.mcp.json)", install="خودکار: .mcp.json → bash .claude/hooks/claude-mem.sh mcp", depends_on=["bundle:claude-mem"],
    portability=WIN_BASH, sensitive=True, tested="شروع نشست: CONNECTION_CLOSED (runtime هنوز نصب نبود)؛ پس از ری‌استارت worker همین نشست: متصل با ۱۹ ابزار",
    notes="در کانتینر تازه، اولین شروع نشست پیش از پایان نصب async ممکن است وصل نشود؛ نشست/worker بعدی وصل می‌شود.")
mcp("connector:adobe", "Adobe for Creativity (MCP، از پلاگین حساب)", "connector", "account",
    "ویرایش عکس، وکتور، طراحی Express، PDF/Acrobat، فونت، ویدیو",
    "adobe_mandatory_init create_visual_design_express_skill export_html_to_express acrobat_proxy acrobat_readonly_proxy animate_design asset_add_file asset_add_file_check_status asset_copy_assets asset_create_folders asset_finalize_file_upload asset_get_presigned_urls asset_initialize_file_upload asset_inline_preview asset_invite_collaborators asset_license_and_download_stock asset_list_collaborators asset_migrate_guest_storage asset_preview_file asset_search asset_share_link boards_add_items_to_board boards_create_new_board boards_delete boards_edit boards_read change_background_color convert_pdf_to_indd create_firefly_board document_convert_pdf document_merge_data_layout document_merge_data_vector document_render_layout document_render_vector download_design export_idml fill_text find_fonts font_activate font_create_kit font_details font_preview font_recommend font_search font_styles generate_indd_mapping_prompt get-motion-import-job-status get_account_type get_fontkit_embed_url get_type_palette html_export_readiness_skill image_add_grain image_add_noise image_adjust_brightness_and_contrast image_adjust_color_temperature image_adjust_dark_portions image_adjust_exposure image_adjust_highlights image_adjust_hsl image_adjust_light_portions image_adjust_single_color_saturation image_adjust_vibrance_and_saturation image_apply_adjustments image_apply_auto_tone image_apply_color_overlay image_apply_gaussian_blur image_apply_glitch_effect image_apply_halftone image_apply_lens_blur image_apply_monochromatic_tint image_apply_preset image_auto_straighten image_crop_and_resize image_crop_to_bounds image_fill_area image_generative_expand image_invert_selection image_list_presets image_remove_background image_select_by_prompt image_select_subject image_vectorize import-claude-design-from-url import-claude-motion-from-url markdown_to_pdf media_enhance_speech media_summarize pdf_combine pdf_compress pdf_create pdf_delete_pages pdf_edit_ui pdf_export pdf_highlight pdf_ocr pdf_operation_status pdf_page_organize pdf_properties pdf_redact pdf_reorder_pages pdf_rotate_pages pdf_split pdf_to_image pdf_to_markdown pdf_viewer prepare_indd_merge_template search_design suggest_type_palettes video_create_quick_cut video_export video_metadata video_render video_render_frame video_resize",
    url="https://github.com/adobe/skills", license="Apache-2.0", scope="account", bundle="bundle:account-adobe", auth="oauth:adobe",
    install="از پلاگین حساب adobe-for-creativity (MCP http: https://adobe-creativity.adobe.io/mcp)", recoverable="manual",
    tested="ابزارها در فهرست نشست بودند؛ فراخوانی نشد (هر فراخوانی init/analytics دارد)")
mcp("connector:figma", "Figma (کانکتور حساب)", "connector", "account", "خواندن/نوشتن طرح در Figma، FigJam، Code Connect، شیدر",
    "add_code_connect_map create_generative_plugin create_new_file create_session create_shader download_assets export_video generate_diagram generate_image get_code_connect_map get_code_connect_suggestions get_context_for_code_connect get_design_context get_figjam get_figma_skill get_generative_plugin get_libraries get_metadata get_motion_context get_screenshot get_shader get_variable_defs list_file_shaders list_generative_plugins list_shaders search_design_system send_code_connect_mappings send_code_to_figma update_generative_plugin update_shader upload_assets use_figma weave_cancel_tool_run weave_find_model weave_get_model_run_output weave_get_tool_inputs weave_get_tool_run_output weave_list_tools weave_run_model weave_run_tool weave_upload_asset whoami",
    url="https://help.figma.com/hc/en-us/articles/32132100833559", scope="account", auth="oauth:figma", recoverable="manual",
    install="https://claude.ai/customize/connectors → Figma → Connect", tested="ابزارها در فهرست نشست بودند؛ فراخوانی نشد")
mcp("connector:hyperframes-heygen", "HyperFrames by HeyGen (کانکتور حساب)", "connector", "account",
    "پروژهٔ میزبانی‌شدهٔ HeyGen و رندر ابری (compose/render از CLI غیرفعال است)",
    "compose get-design-import-job-status get-send-to-hyperframes-guide get_project get_project_status get_render_status import-claude-design-from-url import-claude-motion-from-url list_projects render_video submit_feedback",
    url="https://github.com/heygen-com/hyperframes", scope="account", auth="oauth:heygen", recoverable="manual",
    install="https://claude.ai/customize/connectors → HyperFrames by HeyGen → Connect", tested="ابزارها در فهرست نشست بودند؛ فراخوانی نشد",
    notes="رندر ابری هزینه دارد؛ فقط با تأیید صریح.")
mcp("connector:claude-docs", "Claude Docs (کانکتور حساب)", "connector", "account", "سند زندهٔ قابل ویرایش و اشتراک در claude.ai",
    "batch guide update create delete export query read", url="https://claude.ai", scope="account", auth="account:claude.ai",
    recoverable="manual", install="claude.ai → Customize → Connectors (کانکتور first-party)", tested="ابزارها در فهرست نشست بودند؛ فراخوانی نشد")
mcp("session-mcp:github", "GitHub MCP (نشست ابری)", "session-mcp", "session", "PR، issue، شاخه، فایل، Actions در ریپوهای مجاز",
    "actions_get actions_list actions_run_trigger add_comment_to_pending_review add_issue_comment add_reply_to_pull_request_comment create_branch create_or_update_file create_pull_request create_repository delete_file disable_pr_auto_merge enable_pr_auto_merge fork_repository get_check_run get_commit get_file_contents get_job_logs get_label get_latest_release get_me get_release_by_tag get_tag get_team_members get_teams issue_read issue_write list_branches list_commits list_issue_fields list_issue_types list_issues list_pull_requests list_releases list_repository_collaborators list_tags merge_pull_request pull_request_read pull_request_review_write push_files request_copilot_review resolve_review_thread run_secret_scanning sub_issue_write unresolve_review_thread update_issue_comment update_pull_request update_pull_request_branch",
    url="https://github.com/github/github-mcp-server", scope="session", auth="oauth:github (Claude GitHub App)", portability=CLOUD_ONLY,
    recoverable="manual", depends_on=["auth:github-app"], install="خودکار در نشست ابری پس از اتصال GitHub", tested="ابزارها در فهرست نشست بودند")
mcp("session-mcp:claude-code-remote", "claude-code-remote (نشست ابری)", "session-mcp", "session",
    "مدیریت نشست، محیط، زمان‌بندی، ریپو، credential و مستندات محیط ابری",
    "add_repo archive_session confirm_repository_trust create_environment create_session create_trigger delete_trigger fire_trigger get_environment get_event get_session get_trigger interrupt_session list_computer_folders list_environments list_events list_repos list_sessions list_triggers read_documentation register_repo_root report_preview_port request_computer_folder request_credential send_later send_message set_session_tags set_session_title subscribe_pr_activity switch_environment unarchive_session unsubscribe_pr_activity unwatch_url update_environment update_trigger watch_url",
    url="https://code.claude.com/docs/en/claude-code-on-the-web", scope="session", portability=CLOUD_ONLY, recoverable="manual",
    install="خودکار در هر نشست claude.ai/code", tested="get_environment و read_documentation در همین نشست اجرا شد")
mcp("mcp:chrome-devtools", "chrome-devtools MCP (پیکربندی‌نشده)", "candidate", "mentioned", "پیش‌نیاز اسکیل browser-testing-with-devtools",
    "", url="https://github.com/ChromeDevTools/chrome-devtools-mcp", license="Apache-2.0", scope="—",
    install="claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated", recoverable="manual",
    tested="پیکربندی نشده؛ تست نشد", notes="شکاف وابستگی: اسکیل نصب است ولی MCP لازمش نیست؛ playwright جایگزین عملی است.",
    restore=dict(phase=5, method="command", optional=True, check="grep -q '\"chrome-devtools\"' \"$HOME/.claude.json\"",
                 commands={"posix": "claude mcp add chrome-devtools --scope user -- npx -y chrome-devtools-mcp@latest --isolated",
                           "windows": "claude mcp add chrome-devtools --scope user -- npx -y chrome-devtools-mcp@latest --isolated"}))

# ---------------------------------------------------------------- bundles
BUNDLES = {
 "bundle:hyperframes-skills": dict(name="HyperFrames skills (HeyGen)", url="https://github.com/heygen-com/hyperframes", license="Apache-2.0",
     version="vendored with CLI 0.8.193", upstream="npx -y skills add heygen-com/hyperframes -a claude-code -y",
     purpose="ساخت ویدیو از HTML با HyperFrames: قرارداد رندر، CLI، رجیستری بلوک‌ها، رسانه"),
 "bundle:agent-tools-5": dict(name="پنج ابزار سراسری (Playwright، unslop، strix، skillui، context7)", url=None, license="SKILL.md نوشتهٔ پروژه",
     version="de20bd7", upstream="فقط payload/ریپو (SKILL.md ها در همین پروژه نوشته شده‌اند)", purpose="اسکیل‌های راهنمای پنج ابزار عمومی"),
 "bundle:llm-council": dict(name="LLM Council", url="https://github.com/aiwithremy/claude-skills-llm-council", license="بدون LICENSE (استفادهٔ شخصی)",
     version="55ee36e", upstream="git clone https://github.com/aiwithremy/claude-skills-llm-council && cp SKILL.md → .claude/skills/llm-council/",
     purpose="شورای پنج‌مشاوره برای تصمیم"),
 "bundle:ui-ux-pro-max": dict(name="UI/UX Pro Max", url="https://github.com/nextlevelbuilder/ui-ux-pro-max-skill", license="MIT (ui-styling: Apache-2.0)",
     version="2.15.0 (9a3f14f)", upstream="npx -y ui-ux-pro-max-cli@2.15.0 init --ai claude --offline", purpose="هفت اسکیل طراحی وابسته به هم"),
 "bundle:ponytail": dict(name="Ponytail", url="https://github.com/DietrichGebert/ponytail", license="MIT", version="5.3.3 (96608e0)",
     upstream="claude plugin marketplace add DietrichGebert/ponytail && claude plugin install ponytail@ponytail", purpose="حالت «سنیور تنبل» + هوک‌ها"),
 "bundle:graphify": dict(name="Graphify", url="https://github.com/Graphify-Labs/graphify", license="Apache-2.0 (+MIT)", version="0.9.102 (59b5ab1)",
     upstream="uv tool install graphifyy==0.9.102 && graphify install --project && graphify claude install --project", purpose="گراف دانش کد + هوک"),
 "bundle:agent-skills": dict(name="Agent Skills (Addy Osmani)", url="https://github.com/addyosmani/agent-skills", license="MIT", version="0.6.15 (301b02b)",
     upstream="claude plugin marketplace add addyosmani/agent-skills  سپس /plugin برای نصب (نام marketplace در این نشست تأیید نشد)",
     purpose="۲۵ اسکیل چرخهٔ مهندسی + ۴ ایجنت + ۹ فرمان + ۷ مرجع"),
 "bundle:claude-mem": dict(name="claude-mem", url="https://github.com/thedotmack/claude-mem", license="Apache-2.0", version="15.9.0 (d8bf121)",
     upstream="npx -y claude-mem@15.9.0 install --ide claude-code --provider claude", purpose="حافظهٔ پایدار نشست‌ها (هوک + worker + MCP)"),
 "bundle:find-skills": dict(name="find-skills (Vercel Labs)", url="https://github.com/vercel-labs/skills", license="MIT", version="cabe072; CLI skills 1.7.6",
     upstream="npx -y skills add vercel-labs/skills --skill find-skills -a claude-code -y", purpose="کشف اسکیل جدید با تأیید کاربر"),
 "bundle:mp-video-skillset": dict(name="MP Video Skillset", url="https://github.com/ThePudge/mp-video-skillset", license="MIT (+ اجزای Apache-2.0/MIT)",
     version="d58a36d", upstream="git clone https://github.com/ThePudge/mp-video-skillset (تغییرات محلی mp-studio/UPSTREAM.md از دست می‌رود؛ payload/ریپو را ترجیح دهید)",
     purpose="ادیت فوتیج/صدا به ریل: ۳۳ اسکیل + Kinocut + mp-studio/cloud"),
 "bundle:gsap-skills": dict(name="GSAP skills (GreenSock)", url="https://github.com/greensock/gsap-skills", license="MIT", version="aed9cfd",
     upstream="npx -y skills add greensock/gsap-skills -a claude-code -y", purpose="پنج اسکیل رسمی GSAP"),
 "bundle:account-frontend-design": dict(name="frontend-design (پلاگین حساب، Anthropic)", url="https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design",
     license="see repo", version="1.1.1", upstream="claude.ai → Customize → Plugins (Anthropic plugin directory) → frontend-design", purpose="طراحی رابط frontend"),
 "bundle:account-adobe": dict(name="adobe-for-creativity (پلاگین حساب)", url="https://github.com/adobe/skills", license="Apache-2.0", version="3.3.0",
     upstream="claude.ai → Customize → Plugins → adobe-for-creativity  + ورود Adobe", purpose="۱۵ اسکیل + MCP ادوبی"),
 "bundle:account-remotion": dict(name="remotion (پلاگین حساب)", url="https://github.com/remotion-dev/claude-code-plugin", license="MIT", version="4.0.528",
     upstream="claude.ai → Customize → Plugins → Remotion", purpose="۱۲ اسکیل Remotion"),
 "bundle:account-anthropic-skills": dict(name="anthropic-skills (اسکیل‌های همگام‌شدهٔ حساب)", url="https://github.com/anthropics/skills", license="Proprietary/Anthropic (طبق LICENSE هر اسکیل)",
     version="synced 2026-11-05", upstream="خودکار از حساب claude.ai (Settings → Capabilities/Skills)", purpose="۱۴ اسکیل سند، مرورگر، پژوهش"),
}
for bid, b in BUNDLES.items():
    acct = bid.startswith("bundle:account-")
    add(item(bid, b["name"], "account-plugin" if acct else "bundle", "account" if acct else "vendored", b["purpose"], url=b["url"],
             license=b["license"], version=b["version"], scope="account" if acct else "project (.claude/)",
             install=b["upstream"], activate="خودکار در شروع نشست", recoverable="manual" if acct else "auto",
             auth="account:claude.ai" if acct else "none", portability=ALL if acct else WIN_BASH,
             tested=("پلاگین در ~/.claude/plugins/synced بود" if acct and bid != "bundle:account-anthropic-skills" else
                     "اسکیل‌ها در ~/.claude/skills/synced بودند" if acct else "اعضا روی دیسک و در فهرست نشست"),
             restore=None if acct else dict(phase=3, method="bundle")))

SKILL_BUNDLE = {}
def assign(bundle, names):
    for n in names.split(): SKILL_BUNDLE[n] = bundle
assign("bundle:hyperframes-skills", "hyperframes hyperframes-cli hyperframes-registry media-use figma remotion-to-hyperframes slideshow")
assign("bundle:agent-tools-5", "playwright unslop strix-security skillui context7")
assign("bundle:llm-council", "llm-council")
assign("bundle:ui-ux-pro-max", "ui-ux-pro-max design brand design-system ui-styling slides banner-design")
assign("bundle:ponytail", "ponytail ponytail-review ponytail-audit ponytail-debt ponytail-gain ponytail-help")
assign("bundle:graphify", "graphify")
assign("bundle:agent-skills", "api-and-interface-design browser-testing-with-devtools ci-cd-and-automation code-review-and-quality code-simplification constraint-driven-development context-engineering debugging-and-error-recovery deprecation-and-migration documentation-and-adrs doubt-driven-development frontend-ui-engineering git-workflow-and-versioning idea-refine incremental-implementation interview-me observability-and-instrumentation performance-optimization planning-and-task-breakdown security-and-hardening shipping-and-launch source-driven-development spec-driven-development test-driven-development using-agent-skills")
assign("bundle:claude-mem", "mem-search how-it-works timeline-report weekly-digests knowledge-agent backup-setup handoff learn-codebase")
assign("bundle:find-skills", "find-skills")
assign("bundle:gsap-skills", "gsap-core gsap-performance gsap-plugins gsap-timeline gsap-utils")
assign("bundle:mp-video-skillset", "ab-hook-tester anidoodle arta-reels b-roll-shot-list caption-and-hashtags content-factory content-repurposer cover-thumbnail-brief cross-platform-reformatter fav-adaptive-glass fav-breakout-card fav-edit-video fav-find-ideas fav-motion-effects fav-paper-grid fav-product-motion-ads fav-text-over-footage fav-write-script going-viral hook-mining learn-update motion-reference on-screen-text-writer pro-edit reel-analyzer reel-builder reel-scripter story-sequencer style-scout subject-cutout video-use viral-hook-writer voice-motion")

OOTTO = "ab-hook-tester b-roll-shot-list caption-and-hashtags content-factory content-repurposer cover-thumbnail-brief cross-platform-reformatter going-viral hook-mining on-screen-text-writer reel-analyzer reel-builder reel-scripter story-sequencer viral-hook-writer".split()
SKILL_URL = {**{s: "https://github.com/ootto-ai/claude-content-skills" for s in OOTTO},
             **{s: "https://github.com/alisadiq-ai/favstash-ai-video-editing-skills" for s in SKILL_BUNDLE if s.startswith("fav-")},
             "anidoodle": "https://github.com/alexgreensh/anidoodle", "video-use": "https://github.com/browser-use/video-use",
             "arta-reels": "https://github.com/Jenesyx/arta-edit-studio", "playwright": "https://playwright.dev",
             "strix-security": "https://github.com/usestrix/strix", "skillui": "https://www.npmjs.com/package/skillui",
             "context7": "https://github.com/upstash/context7"}
SKILL_LICENSE = {**{s: "MIT" for s in OOTTO}, **{s: "Apache-2.0" for s in SKILL_BUNDLE if s.startswith("fav-")}, "anidoodle": "Apache-2.0",
                 "video-use": "MIT", "arta-reels": "MIT", "ui-styling": "Apache-2.0"}
MP_PROJECT = {"pro-edit", "arta-reels", "learn-update", "motion-reference", "subject-cutout", "voice-motion", "style-scout", "video-use",
              "content-factory", "fav-edit-video"}

PURPOSE = {
 "hyperframes": "نقطهٔ شروع ساخت، ویرایش و رندر ویدیو با HyperFrames (HTML→MP4)",
 "hyperframes-cli": "CLI هایپرفریمز: ساخت پروژه، check، snapshot، preview، render",
 "hyperframes-registry": "حدود ۴۵۰ بلوک آماده: ترنزیشن، تیتر، کپشن، نمودار، سه‌بعدی",
 "media-use": "رسانهٔ ویدیو: TTS، رونویسی، حذف پس‌زمینه، صدا و تصویر",
 "figma": "آوردن طرح Figma (دارایی، توکن، فریم) به ویدیوی HyperFrames",
 "remotion-to-hyperframes": "تبدیل کامپوزیشن Remotion به HyperFrames",
 "slideshow": "اسلایدشوی HyperFrames برای ارائهٔ زنده یا ویدیو",
 "playwright": "خودکارسازی مرورگر، اسکرین‌شات و تست UI با Playwright",
 "unslop": "پاک‌سازی کد زائد AI: کد مرده، import بی‌استفاده، انتزاع اضافه",
 "strix-security": "ممیزی امنیتی/تست نفوذ مجاز با ایجنت Strix",
 "skillui": "استخراج سیستم طراحی (رنگ، فونت، فاصله) از سایت یا ریپو",
 "context7": "گرفتن مستندات به‌روز کتابخانه‌ها از Context7",
 "llm-council": "شورای ۵ مشاور با داوری متقابل برای تصمیم‌های مهم",
 "ui-ux-pro-max": "جست‌وجوی محلی سبک، پالت، فونت، قواعد UX و پیش‌تنظیم GSAP",
 "design": "مسیریاب طراحی: لوگو، هویت سازمانی، آیکن، بنر، تصویر اجتماعی",
 "brand": "صدای برند، هویت بصری و سازگاری برند",
 "design-system": "معماری توکن سه‌لایه و مشخصات کامپوننت",
 "ui-styling": "shadcn/ui + Tailwind، تم و حالت تیره، طراحی بوم",
 "slides": "ارائهٔ HTML با Chart.js",
 "banner-design": "بنر برای شبکه‌های اجتماعی، تبلیغات، وب و چاپ",
 "ponytail": "حالت «سنیور تنبل»: کوچک‌ترین تغییر کامل (lite/full/ultra/off)",
 "ponytail-review": "بازبینی تغییر فعلی با معیار سادگی",
 "ponytail-audit": "ممیزی کل ریپو برای کد و انتزاع زائد",
 "ponytail-debt": "فهرست میان‌برهای ثبت‌شده (shortcut:) به‌عنوان بدهی",
 "ponytail-gain": "نمایش صرفه‌جویی اندازه‌گیری‌شدهٔ Ponytail",
 "ponytail-help": "راهنمای فرمان‌های Ponytail",
 "graphify": "ساخت گراف دانش از کد/اسناد و query/path/explain",
 "api-and-interface-design": "طراحی API و مرز ماژول‌ها",
 "browser-testing-with-devtools": "تست در مرورگر واقعی با Chrome DevTools MCP",
 "ci-cd-and-automation": "راه‌اندازی CI/CD و دروازه‌های کیفیت",
 "code-review-and-quality": "بازبینی چندبعدی کد پیش از ادغام",
 "code-simplification": "ساده‌سازی کد بدون تغییر رفتار",
 "constraint-driven-development": "ثبت معیار کیفیت در CONSTRAINTS.md و پایش تضعیف آن",
 "context-engineering": "تنظیم زمینه و فایل‌های قواعد ایجنت",
 "debugging-and-error-recovery": "اشکال‌زدایی ریشه‌ای و نظام‌مند",
 "deprecation-and-migration": "منسوخ‌سازی و مهاجرت امن",
 "documentation-and-adrs": "مستندسازی و ثبت تصمیم معماری (ADR)",
 "doubt-driven-development": "بازبینی خصمانهٔ هر تصمیم مهم",
 "frontend-ui-engineering": "ساخت UI دسترس‌پذیر و واکنش‌گرا",
 "git-workflow-and-versioning": "روال گیت: کامیت، شاخه، نسخه‌گذاری",
 "idea-refine": "پرورش و محک ایدهٔ خام",
 "incremental-implementation": "پیاده‌سازی در برش‌های کوچک آزمون‌پذیر",
 "interview-me": "مصاحبهٔ تک‌سؤالی برای فهم نیاز واقعی",
 "observability-and-instrumentation": "لاگ، متریک و ردگیری",
 "performance-optimization": "بهینه‌سازی کارایی با اندازه‌گیری",
 "planning-and-task-breakdown": "برنامه‌ریزی و شکستن کار به وظایف",
 "security-and-hardening": "امن‌سازی و بررسی آسیب‌پذیری",
 "shipping-and-launch": "آماده‌سازی انتشار",
 "source-driven-development": "پیاده‌سازی بر پایهٔ مستندات رسمی",
 "spec-driven-development": "نوشتن مشخصات پیش از کد",
 "test-driven-development": "توسعهٔ آزمون‌محور (TDD)",
 "using-agent-skills": "مسیریاب بین اسکیل‌های نصب‌شده",
 "mem-search": "جست‌وجو در حافظهٔ نشست‌های قبلی",
 "how-it-works": "توضیح سازوکار claude-mem",
 "timeline-report": "گزارش زمانی کارهای پروژه از حافظه",
 "weekly-digests": "خلاصهٔ هفتگی از حافظه",
 "knowledge-agent": "ساخت «مغز» دانشی از مشاهدات",
 "backup-setup": "پشتیبان‌گیری و بازیابی پایگاه claude-mem",
 "handoff": "ساخت HANDOFF.md برای ادامهٔ کار در نشست تازه",
 "learn-codebase": "خواندن کامل کد پروژه برای آشنایی",
 "find-skills": "کشف و نصب اسکیل جدید از skills.sh (فقط با تأیید)",
 "ab-hook-tester": "دو نسخهٔ متفاوت هوک برای تست A/B",
 "anidoodle": "تصویر و انیمیشن کدی در ۳۲ سبک با روایت و زیرنویس",
 "arta-reels": "ادیت ریل فارسی بدون زیرنویس (story/split)",
 "b-roll-shot-list": "فهرست نماهای B-roll از روی اسکریپت",
 "caption-and-hashtags": "کپشن، هشتگ و کامنت اول",
 "content-factory": "ارکستراتور کامل تولید ریل (انتشار فقط با تأیید)",
 "content-repurposer": "تبدیل محتوای بلند به ایده و اسکریپت ریل",
 "cover-thumbnail-brief": "متن و بریف کاور ریل",
 "cross-platform-reformatter": "تطبیق ریل برای TikTok و YouTube Shorts",
 "fav-adaptive-glass": "سبک پنل‌های شیشه‌ای کنار گوینده",
 "fav-breakout-card": "سبک کارت با بیرون‌زدگی سر گوینده",
 "fav-edit-video": "پایهٔ ادیت ریل: برش، کپشن، صدا، موشن، QC",
 "fav-find-ideas": "یافتن ایدهٔ اثبات‌شده برای ساخت",
 "fav-motion-effects": "کتابخانهٔ ۳۳ افکت موشن نام‌دار",
 "fav-paper-grid": "سبک صفحهٔ کاغذی با UI متحرک",
 "fav-product-motion-ads": "تبلیغ موشن محصول از دارایی واقعی",
 "fav-text-over-footage": "یک خط متن روی B-roll",
 "fav-write-script": "نوشتن و نقد هوک و اسکریپت",
 "going-viral": "استراتژی وایرال: هدف، احساس، قیف",
 "gsap-core": "API هستهٔ GSAP: tween، easing، stagger",
 "gsap-performance": "کارایی انیمیشن GSAP",
 "gsap-plugins": "پلاگین‌های GSAP (SplitText، Flip، …)",
 "gsap-timeline": "تایم‌لاین و ترتیب انیمیشن GSAP",
 "gsap-utils": "ابزارهای gsap.utils",
 "hook-mining": "تولید هوک از CSV هوک‌های موفق واقعی",
 "learn-update": "تبدیل یادداشت‌های mp-studio/learn به بهبود اسکیل‌ها",
 "motion-reference": "یادگیری سبک ادیت از ویدیوی رفرنس (فقط سبک)",
 "on-screen-text-writer": "متن روی صفحهٔ ریل",
 "pro-edit": "ادیت حرفه‌ای فوتیج گوینده به ریل (مسیر پیش‌فرض)",
 "reel-analyzer": "کالبدشکافی ریل وایرال فریم‌به‌فریم",
 "reel-builder": "تبدیل تحلیل/ایده به ریل آمادهٔ فیلم‌برداری",
 "reel-scripter": "نوشتن اسکریپت ریل",
 "story-sequencer": "طراحی استوری چندفریمی اینستاگرام",
 "style-scout": "انتخاب سبک ادیت مناسب ویدیو",
 "subject-cutout": "جداسازی گوینده برای متن پشت سر او (محلی)",
 "video-use": "ادیت گفت‌وگومحور ویدیو: رونویسی، برش، رنگ، زیرنویس",
 "viral-hook-writer": "نوشتن هوک ویدیو",
 "voice-motion": "تبدیل ویس به ریل موشن‌گرافیک",
}

SESSION_SKILLS = set(BUILTIN_SKILLS) | set(PURPOSE)  # every vendored skill was in this session's skill list (2026-11-05)

def frontmatter(p):
    t = p.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---", t, re.S)
    if not m: return {}
    return {k: v.strip() for k, v in re.findall(r"^([A-Za-z_-]+):(.*)$", m.group(1), re.M)}

skills_dir = REPO / ".claude/skills"
for d in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
    s = d.name
    fm = frontmatter(d / "SKILL.md") if (d / "SKILL.md").exists() else {}
    b = SKILL_BUNDLE.get(s)
    if b is None:
        sys.exit(f"skill {s} has no bundle mapping — add it to SKILL_BUNDLE")
    if s not in PURPOSE:
        sys.exit(f"skill {s} has no Persian purpose — add it to PURPOSE")
    nfiles = sum(len(f) for _, _, f in os.walk(d))
    proj = b == "bundle:mp-video-skillset" and s in MP_PROJECT
    add(item(f"skill:{s}", s, "skill", "vendored", PURPOSE[s], bundle=b, scope="project (.claude/skills)",
             url=SKILL_URL.get(s, BUNDLES[b]["url"]), license=SKILL_LICENSE.get(s, BUNDLES[b]["license"]),
             version=BUNDLES[b]["version"], install=f"همراه {BUNDLES[b]['name']} (payload یا: {BUNDLES[b]['upstream']})",
             activate=f"خودکار، یا /{s}", verify=f"test -f .claude/skills/{s}/SKILL.md", depends_on=[b],
             portability=MP if b == "bundle:mp-video-skillset" else ALL, project_specific=proj,
             frontmatter_name=fm.get("name"), files=nfiles,
             tested=f"SKILL.md موجود ({nfiles} فایل)، frontmatter name={fm.get('name')}، در فهرست اسکیل‌های نشست",
             notes=("به mp-studio/ و cloud/ همین ریپو وابسته است" if proj else
                    "تولید AI پولی (Gemini/Atlas/MuAPI) فقط با تأیید هر بار" if s == "design" else
                    "به chrome-devtools MCP نیاز دارد که پیکربندی نشده" if s == "browser-testing-with-devtools" else None),
             restore=dict(phase=3, method="bundle", check=f"test -f .claude/skills/{s}/SKILL.md")))
add(item("file:LICENSE-ootto-content-skills", "LICENSE-ootto-content-skills", "licence-file", "vendored",
         "متن مجوز MIT اسکیل‌های محتوایی Ootto (باید کنار اسکیل‌ها بماند)", bundle="bundle:mp-video-skillset",
         url="https://github.com/ootto-ai/claude-content-skills", license="MIT", scope="project (.claude/skills)",
         verify="test -f .claude/skills/LICENSE-ootto-content-skills", tested="فایل موجود",
         restore=dict(phase=3, method="bundle", check="test -f .claude/skills/LICENSE-ootto-content-skills")))

# account-synced skills (read from ~/.claude when present; facts recorded on 2026-11-05)
ACCOUNT_SKILLS = {
 "bundle:account-frontend-design": {"frontend-design": "رابط frontend متمایز و باکیفیت"},
 "bundle:account-adobe": {"adobe": "مسیریاب ابزارهای Adobe", "adobe-anydocx": "ساخت/ویرایش DOCX", "adobe-anyexcel": "ساخت/ویرایش Excel",
     "adobe-anypdf": "کار با PDF", "adobe-anypptx": "ساخت/ویرایش PPTX", "adobe-batch-edit-photos": "ویرایش گروهی عکس",
     "adobe-create-pdfs-from-data": "PDF از داده", "adobe-create-social-variations": "نسخه‌های اجتماعی یک طرح",
     "adobe-design-from-template": "طرح از قالب Express", "adobe-design-to-pdf": "تبدیل طرح به PDF", "adobe-document-review": "بازبینی سند",
     "adobe-edit-quick-cut": "برش سریع ویدیو", "adobe-fonts": "فونت‌های Adobe", "adobe-resize-photos-and-videos": "تغییر اندازهٔ عکس/ویدیو",
     "adobe-retouch-portraits": "روتوش پرتره"},
 "bundle:account-remotion": {"remotion-best-practices": "بهترین روش‌های Remotion (اول بخوانید)", "remotion-captions": "کپشن در Remotion",
     "remotion-create": "ساخت پروژهٔ Remotion", "remotion-docs": "مستندات Remotion", "remotion-interactivity": "تعامل در Remotion",
     "remotion-maps": "نقشه در Remotion", "remotion-markup": "مارک‌آپ و چیدمان", "remotion-multimedia": "صدا، ویدیو، تصویر",
     "remotion-render": "رندر Remotion", "remotion-saas": "ویدیوی محصول SaaS", "remotion-studio": "Remotion Studio", "remotion-upgrade": "ارتقای نسخه"},
 "bundle:account-anthropic-skills": {"artifact-emulator": "دیدن Artifact در نمایشگر واقعی", "built-in-browser": "مرورگر داخلی اپ دسکتاپ",
     "chrome-browser": "Claude in Chrome", "computer-use": "کنترل دسکتاپ کاربر", "deep-research": "پژوهش چندمنبعی",
     "docs": "سند قابل اشتراک Claude Docs", "docx": "فایل Word", "google-workspace": "Google Docs/Sheets/Slides",
     "import-memory": "وارد کردن حافظه از دستیار دیگر", "morning": "خلاصهٔ صبحگاهی", "pdf": "کار با PDF",
     "pptx": "فایل PowerPoint", "skill-creator": "ساخت و ارزیابی اسکیل", "xlsx": "فایل Excel"},
}
for b, skills in ACCOUNT_SKILLS.items():
    prefix = {"bundle:account-adobe": "adobe-for-creativity:", "bundle:account-remotion": "remotion:",
              "bundle:account-frontend-design": "frontend-design:", "bundle:account-anthropic-skills": "anthropic-skills:"}[b]
    for s, p in skills.items():
        add(item(f"account-skill:{prefix}{s}", prefix + s, "account-skill", "account", p, bundle=b, scope="account (synced)",
                 url=BUNDLES[b]["url"], license=BUNDLES[b]["license"], version=BUNDLES[b]["version"], install=BUNDLES[b]["upstream"],
                 activate=f"/{prefix}{s}", depends_on=[b], auth="account:claude.ai", recoverable="manual",
                 tested="در فهرست اسکیل‌های همین نشست بود"))

# ---------------------------------------------------------------- agents, commands, references
for a, p in {"code-reviewer": "بازبین ارشد کد در پنج بعد", "security-auditor": "ممیزی امنیتی و مدل تهدید",
             "test-engineer": "راهبرد و نوشتن تست", "web-performance-auditor": "ممیزی Core Web Vitals"}.items():
    add(item(f"agent:{a}", a, "agent", "vendored", p, bundle="bundle:agent-skills", url=BUNDLES["bundle:agent-skills"]["url"],
             license="MIT", scope="project (.claude/agents)", verify=f"test -f .claude/agents/{a}.md", depends_on=["bundle:agent-skills"],
             tested="فایل موجود و در فهرست ایجنت‌های نشست", restore=dict(phase=3, method="bundle", check=f"test -f .claude/agents/{a}.md")))
for c, p in {"build": "پیاده‌سازی برش‌به‌برش", "code-simplify": "ساده‌سازی کد", "constraints": "قرارداد کیفیت CONSTRAINTS.md",
             "planning": "برنامه‌ریزی (به‌جای /plan داخلی)", "quality-review": "بازبینی کیفیت (به‌جای /review داخلی)",
             "ship": "آماده‌سازی انتشار", "spec": "نوشتن مشخصات", "test": "تست‌محور", "webperf": "ممیزی کارایی وب"}.items():
    add(item(f"command:{c}", f"/{c}", "command", "vendored", p, bundle="bundle:agent-skills", url=BUNDLES["bundle:agent-skills"]["url"],
             license="MIT", scope="project (.claude/commands)", activate=f"/{c}", verify=f"test -f .claude/commands/{c}.md",
             depends_on=["bundle:agent-skills"], tested="فایل موجود",
             restore=dict(phase=3, method="bundle", check=f"test -f .claude/commands/{c}.md")))
add(item("file:claude-references", ".claude/references (۷ چک‌لیست)", "reference", "vendored",
         "چک‌لیست‌های مشترک: دسترس‌پذیری، تعریف انجام، observability، الگوهای ارکستراسیون، کارایی، امنیت، تست",
         bundle="bundle:agent-skills", url=BUNDLES["bundle:agent-skills"]["url"], license="MIT", scope="project",
         verify="test -d .claude/references", tested="۷ فایل موجود", restore=dict(phase=3, method="bundle", check="test -d .claude/references")))

# ---------------------------------------------------------------- hooks & settings
def hook(id, name, purpose, event, status, tested, **kw):
    add(item(id, name, "hook", status, purpose, scope="project (.claude/settings.json)", activate=f"خودکار روی {event}",
             portability=kw.pop("portability", WIN_BASH), tested=tested, **kw))
hook("hook:setup-motion-env", "SessionStart → scripts/setup-motion-env.sh", "نصب idempotent محیط موشن در هر نشست ابری",
     "SessionStart (فقط ابری)", "configured-missing", "ناموفق: دانلود Blender با 403 (سیاست شبکه) و set -e بقیهٔ مراحل را لغو کرد",
     project_specific=True, portability=LINUX_ONLY,
     notes="مراحل بعد از Blender اجرا نشد: KTX، whisper.cpp، صدای Piper، Docker، skillui، strix، graphify، کپی اسکیل‌ها به ~/.claude/skills. راه موقت: WITH_BLENDER=0.",
     restore=dict(phase=4, method="command", needs_repo=True, check="command -v graphify && command -v whisper-cli",
                  commands={"linux": "WITH_BLENDER=0 bash scripts/setup-motion-env.sh"}))
hook("hook:mp-video-env", "SessionStart → scripts/mp-video-env.sh (async)", "ساخت/بررسی .venv-cloud برای MP Video", "SessionStart (async، ابری)",
     "installed", ".mp-cloud-ready موجود؛ kinocut/faster-whisper/rembg در venv import شد", project_specific=True, portability=LINUX_ONLY,
     restore=dict(phase=6, method="command", needs_repo=True, check=".venv-cloud/bin/python -c 'import kinocut'",
                  commands={"linux": "bash cloud/setup.sh --with-pro"}))
hook("hook:ponytail", "Ponytail hooks (SessionStart/UserPromptSubmit/SubagentStart)", "تزریق قوانین Ponytail به نشست و زیرعامل‌ها",
     "SessionStart، UserPromptSubmit، SubagentStart", "installed", "«PONYTAIL MODE ACTIVE — level: full» در شروع همین نشست دیده شد",
     bundle="bundle:ponytail", depends_on=["runtime:node"], verify="test -f .claude/hooks/ponytail/run.sh",
     restore=dict(phase=3, method="bundle", check="test -f .claude/hooks/ponytail/run.sh"))
hook("hook:claude-mem", "claude-mem hooks (۸ رویداد)", "ثبت مشاهدات و تزریق حافظه در شروع نشست", "SessionStart … SessionEnd",
     "installed", "runtime نصب شد (~/.local/bin/claude-mem)؛ MCP در شروع نشست وصل نشد", bundle="bundle:claude-mem", sensitive=True,
     verify="test -x \"$HOME/.local/bin/claude-mem\"", notes="هر مشاهده یک فراخوانی Haiku (هزینه) و ذخیرهٔ محلی خلاصهٔ کارهاست.")
hook("hook:graphify-guard", "PreToolUse → graphify hook-guard", "یادآوری query گراف پیش از grep/خواندن", "PreToolUse (Bash|Grep|Read|Glob)",
     "configured-missing", "بی‌اثر: graphify نصب نیست (مرحلهٔ setup اجرا نشد)", bundle="bundle:graphify", depends_on=["cli:graphify"])
hook("hook:graph-sync", "Stop → scripts/graph-sync.sh", "به‌روزرسانی افزایشی گراف پس از هر نوبت", "Stop (async)", "configured-missing",
     "بی‌اثر: graphify نصب نیست؛ graphify-out/ وجود ندارد", bundle="bundle:graphify", project_specific=True, depends_on=["cli:graphify"])
add(item("settings:env", "متغیرهای env در .claude/settings.json", "settings", "vendored",
         "PYTHONUTF8، PYTHONIOENCODING، HF_HUB_DISABLE_SYMLINKS_WARNING، HYPERFRAMES_NO_TELEMETRY=1", scope="project",
         verify="python3 -c \"import json;json.load(open('.claude/settings.json'))\"", tested="JSON معتبر", restore=dict(phase=3, method="bundle")))
for h, p in {"stop-hook-git-check.sh": "یادآوری کامیت/push در پایان نوبت", "user-prompt-submit-reply-reminder.py": "یادآور پاسخ در نشست ابری",
             "session-start-setup-script-failure.sh": "گزارش شکست setup script محیط"}.items():
    add(item(f"cloud-hook:{h}", f"~/.claude/{h}", "cloud-env", "session", p + " (ساخت مدیر محیط ابری)", scope="user (container)",
             portability=CLOUD_ONLY, recoverable="no", install="خودکار توسط محیط ابری؛ قابل انتقال نیست", tested="فایل در ~/.claude موجود بود"))

# ---------------------------------------------------------------- agent CLIs
def cli(id, name, status, purpose, url, version, lic, cmds, check, tested, phase=5, optional=False, sensitive=False, deps=(), auth="none", notes=None, bundle=None, port=ALL, needs_repo=False):
    add(item(id, name, "cli", status, purpose, url=url, version=version, license=lic, scope="user", bundle=bundle,
             install=" | ".join(f"{k}: {v}" for k, v in cmds.items()), verify=check, depends_on=list(deps), auth=auth,
             sensitive=sensitive, tested=tested, notes=notes, portability=port,
             restore=dict(phase=phase, method="command", check=check, commands=cmds, optional=optional, sensitive=sensitive, needs_repo=needs_repo)))
cli("cli:graphify", "graphify (graphifyy)", "configured-missing", "CLI گراف دانش: build/update/query/path/explain",
    "https://github.com/Graphify-Labs/graphify", "0.9.102", "Apache-2.0",
    {"posix": "uv tool install graphifyy==0.9.102", "windows": "uv tool install graphifyy==0.9.102"}, "command -v graphify",
    "در این نشست نصب نبود (setup متوقف شد)؛ نصب در HOME ایزوله در آزمون ۱۰ بررسی شد", deps=["runtime:uv"], bundle="bundle:graphify")
cli("cli:claude-mem", "claude-mem runtime", "installed", "worker حافظه، SQLite/Chroma و لانچر هوک‌ها",
    "https://github.com/thedotmack/claude-mem", "15.9.0", "Apache-2.0",
    {"posix": "npx -y claude-mem@15.9.0 install --ide claude-code --provider claude", "windows": "npx -y claude-mem@15.9.0 install --ide claude-code --provider claude"},
    "test -x \"$HOME/.local/bin/claude-mem\"", "~/.local/bin/claude-mem موجود؛ پلاگین claude-mem@thedotmack 15.9.0 در installed_plugins.json",
    sensitive=True, deps=["runtime:node"], auth="account:claude (Haiku روی اشتراک)", bundle="bundle:claude-mem",
    notes="حریم خصوصی: خلاصهٔ کارها محلی ذخیره می‌شود؛ telemetry خاموش (CLAUDE_MEM_TELEMETRY=0).")
cli("cli:skills", "skills CLI (npx skills)", "installed", "جست‌وجو/نصب اسکیل از skills.sh", "https://github.com/vercel-labs/skills", "1.7.6", "MIT",
    {"posix": "npx -y skills@1.7.6 --help", "windows": "npx -y skills@1.7.6 --help"}, "true",
    "بر حسب نیاز با npx اجرا می‌شود؛ نسخه در رجیستری npm تأیید شد", optional=True, deps=["runtime:node"], bundle="bundle:find-skills")
cli("cli:skillui", "skillui", "configured-missing", "استخراج سیستم طراحی از URL/ریپو", "https://www.npmjs.com/package/skillui", "1.3.4", "see npm",
    {"posix": "npm install -g skillui@1.3.4", "windows": "npm install -g skillui@1.3.4"}, "command -v skillui",
    "در این نشست نصب نبود (setup متوقف شد)", optional=True, deps=["runtime:node"])
cli("cli:strix", "strix (strix-agent)", "configured-missing", "ایجنت تست نفوذ مجاز (Docker + کلید LLM کاربر)", "https://github.com/usestrix/strix", "1.7.0", "Apache-2.0",
    {"posix": "pip install strix-agent==1.7.0", "windows": "pip install strix-agent==1.7.0"}, "command -v strix",
    "در این نشست نصب نبود (setup متوقف شد)", phase=7, sensitive=True, optional=True, deps=["runtime:python", "runtime:docker"],
    auth="key:LLM_API_KEY + STRIX_LLM", notes="ابزار امنیتی تهاجمی: فقط روی سیستم‌های تحت مالکیت یا با مجوز کتبی؛ پیش از نصب بررسی امنیتی.")
cli("cli:ui-ux-pro-max-cli", "ui-ux-pro-max-cli (نصب سراسری اختیاری)", "optional", "نصب رسمی سراسری هفت اسکیل UI/UX در ~/.claude/skills",
    "https://www.npmjs.com/package/ui-ux-pro-max-cli", "2.15.0", "MIT",
    {"posix": "npx -y ui-ux-pro-max-cli@2.15.0 init --ai claude --global --offline", "windows": "npx -y ui-ux-pro-max-cli@2.15.0 init --ai claude --global --offline"},
    "test -f \"$HOME/.claude/skills/ui-ux-pro-max/SKILL.md\"", "اجرا نشد؛ نسخه در npm تأیید شد", optional=True, deps=["runtime:node"], bundle="bundle:ui-ux-pro-max")
cli("cli:kinocut", "kinocut", "installed", "سرور MCP ویرایش ویدیو (اجرای uvx یا .venv-cloud)", "https://github.com/KyaniteLabs/kinocut", "1.16.5", "Apache-2.0",
    {"posix": "uv tool install kinocut==1.16.5", "windows": "uv tool install kinocut==1.16.5"},
    "command -v kino || test -x .venv-cloud/bin/python", "kinocut 1.16.5 در .venv-cloud", optional=True, deps=["runtime:uv", "runtime:ffmpeg"])

# ---------------------------------------------------------------- project runtime (moshen_project)
def proj(id, name, status, purpose, url, version, lic, tested, cmds=None, check=None, phase=4, optional=False, deps=(), port=LINUX_ONLY, notes=None, auth="none", category="project-runtime"):
    add(item(id, name, category, status, purpose, url=url, version=version, license=lic, scope="project", project_specific=True,
             install=(" | ".join(f"{k}: {v}" for k, v in cmds.items()) if cmds else "با setup-motion-env.sh یا cloud/setup.sh"),
             verify=check, depends_on=list(deps), portability=port, tested=tested, notes=notes, auth=auth,
             restore=(dict(phase=phase, method="command", check=check, commands=cmds, optional=optional, needs_repo=True) if cmds else None)))
proj("cli:hyperframes", "HyperFrames CLI", "installed", "رندر HTML→MP4، check، snapshot، transcribe، TTS", "https://github.com/heygen-com/hyperframes",
     "0.8.193", "Apache-2.0", "npx hyperframes --version → 0.8.193", {"posix": "npm ci", "windows": "npm ci"}, "test -x node_modules/.bin/hyperframes",
     deps=["runtime:node"], port=ALL, notes="رندر ابری/publish پولی است؛ فقط با تأیید.")
proj("cli:chrome-headless-shell", "Chrome Headless Shell (HyperFrames)", "installed", "مرورگر رندر محلی HyperFrames", "https://github.com/heygen-com/hyperframes",
     None, "BSD", "~/.cache/hyperframes/chrome موجود", {"posix": "npx hyperframes browser ensure", "windows": "npx hyperframes browser ensure"},
     "test -d \"$HOME/.cache/hyperframes/chrome\"", deps=["cli:hyperframes"], port=ALL)
proj("cli:remotion", "Remotion 4 workspace", "installed", "رندر React→MP4 (remotion-studio/)", "https://www.remotion.dev", "4.0.538",
     "Remotion License (رایگان برای فرد/تیم کوچک)", "npx remotion --version اجرا شد", {"posix": "cd remotion-studio && npm ci", "windows": "cd remotion-studio && npm ci"},
     "test -d remotion-studio/node_modules", deps=["runtime:node"], port=ALL, notes="روی این کانتینر --gl=swangle لازم است.")
proj("cli:gltf-transform", "glTF-Transform CLI", "installed", "بهینه‌سازی/تبدیل GLB", "https://gltf-transform.dev", "4.5.1", "MIT",
     "npx gltf-transform --version → 4.5.1", None, "test -x node_modules/.bin/gltf-transform", port=ALL)
proj("py:piper-tts", "Piper TTS (fa_IR)", "installed", "تولید گفتار فارسی محلی (scripts/tts-fa.sh)", "https://github.com/OHF-Voice/piper1-gpl", "1.8.0", "GPL-3.0",
     "import piper موفق؛ /usr/local/bin/piper", {"posix": "pip install piper-tts==1.8.0 kokoro-onnx soundfile opencv-python-headless numpy"},
     "python3 -c 'import piper, kokoro_onnx, soundfile, cv2, numpy'", deps=["runtime:python"], port=ALL,
     notes="روی اوبونتو ۲۴: --break-system-packages یا venv لازم است.")
proj("asset:piper-voice-fa", "صدای fa_IR-amir-medium", "configured-missing", "صدای پیش‌فرض فارسی Piper", "https://huggingface.co/rhasspy/piper-voices",
     "medium", "see model card", "در ~/.cache/piper نبود (مرحلهٔ setup اجرا نشد)", {"posix": "bash scripts/tts-fa.sh 'سلام' /tmp/warmup.wav"},
     "test -f \"$HOME/.cache/piper/fa_IR-amir-medium.onnx\"", deps=["py:piper-tts"], optional=True, port=ALL)
proj("py:kokoro-opencv", "kokoro-onnx + OpenCV + soundfile", "installed", "TTS انگلیسی و تصحیح عکس محصول", "https://github.com/thewh1teagle/kokoro-onnx",
     None, "MIT/Apache-2.0", "import موفق (cv2 5.0.0)", None, None, port=ALL)
proj("cli:blender", "Blender 5.2.3 LTS", "configured-missing", "ساخت سه‌بعدی، GLB، رندر Cycles (tools/3d/)", "https://www.blender.org", "5.2.3", "GPL-3.0",
     "نصب نشد: download.blender.org → 403 در محیط Default",
     {"linux": "WITH_BLENDER=1 bash scripts/setup-motion-env.sh", "macos": "brew install --cask blender", "windows": "winget install --id BlenderFoundation.Blender -e"},
     "command -v blender", phase=7, optional=True, port=ALL, notes="به شبکهٔ آزاد (مثل محیط Motion-Production) نیاز دارد.")
proj("cli:toktx", "KTX-Software 4.4.2 (toktx)", "configured-missing", "بافت KTX2/Basis برای gltf-transform", "https://github.com/KhronosGroup/KTX-Software",
     "4.4.2", "Apache-2.0", "نصب نشد (setup پیش از آن متوقف شد)",
     {"linux": "curl -fsSL -o /tmp/ktx.deb https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.deb && sudo dpkg -i /tmp/ktx.deb"},
     "command -v toktx", phase=7, optional=True)
proj("cli:whisper-cli", "whisper.cpp (whisper-cli)", "configured-missing", "رونویسی و کپشن محلی", "https://github.com/ggml-org/whisper.cpp", "master (ساخت از منبع)", "MIT",
     "نصب نشد (setup پیش از آن متوقف شد)", {"linux": "WITH_BLENDER=0 bash scripts/setup-motion-env.sh"}, "command -v whisper-cli", phase=7, optional=True,
     deps=["cli:cmake"])
proj("py:musicgen", "MusicGen (torch + transformers)", "optional", "موسیقی پس‌زمینهٔ محلی (CPU، حدود ۱GB)", "https://huggingface.co/facebook/musicgen-small",
     None, "CC-BY-NC (مدل)", "نصب نشده (اختیاری WITH_MUSICGEN=1)", {"linux": "WITH_MUSICGEN=1 WITH_BLENDER=0 bash scripts/setup-motion-env.sh"},
     "python3 -c 'import torch, transformers'", phase=7, optional=True, notes="مجوز مدل غیرتجاری است.")
proj("venv:mp-cloud", ".venv-cloud (MP Video runtime)", "installed", "FastAPI، faster-whisper، yt-dlp، rembg، mediapipe، pedalboard، noisereduce، kinocut",
     "https://github.com/ThePudge/mp-video-skillset", "Python 3.12.3", "MIT + deps", "همهٔ importها موفق", None, ".venv-cloud/bin/python -c 'import kinocut'",
     notes="با hook:mp-video-env / cloud/setup.sh --with-pro بازسازی می‌شود.")
proj("venv:arta", "venv جدای arta-reels (openai-whisper، torch، OpenCV<5)", "optional", "پیش‌نیاز اجرای Arta Edit Studio", "https://github.com/Jenesyx/arta-edit-studio",
     None, "MIT", "ساخته نشده", None, None, notes="PyTorch باید اول طبق pytorch.org نصب شود.")
for lib, (p, url, ver, lic) in {
    "gsap": ("انیمیشن", "https://gsap.com", "^3.15.0", "GSAP Standard License"), "three": ("سه‌بعدی وب", "https://threejs.org", "^0.186.1", "MIT"),
    "@fontsource/vazirmatn": ("فونت فارسی وزیرمتن", "https://github.com/rastikerdar/vazirmatn", "^5.3.0", "OFL-1.1"),
    "@google/genai": ("SDK رسمی Gemini", "https://github.com/googleapis/js-genai", "^2.31.0", "Apache-2.0"),
    "icon-packs": ("Material Symbols، Phosphor، Tabler، Lucide", "https://lucide.dev", "see package.json", "Apache-2.0/MIT/ISC"),
    "remotion-libs": ("@remotion/*، React 19، R3F/drei، postprocessing", "https://www.remotion.dev", "4.0.538", "Remotion License/MIT"),
}.items():
    add(item(f"library:{lib}", lib, "library", "installed", p, url=url, version=ver, license=lic, scope="project (package.json)",
             project_specific=True, install="npm ci (و remotion-studio: npm ci)", depends_on=["runtime:node"], tested="node_modules نصب شد (لاگ setup: added 279 / 413 packages)"))

TOOLS = {
 "tools/assets/assets.mjs": "موتور یافتن/نصب دارایی با ledger مجوز", "tools/assets/library.mjs": "کاتالوگ آفلاین کتابخانه",
 "tools/assets/contact_sheet.py": "مقایسهٔ بصری کاندیداها", "tools/ai/gemini.mjs": "پل Gemini: check، plan، image، video (پولی با --approve-cost)",
 "tools/3d/build_tile.py": "ساخت کاشی سه‌بعدی در Blender", "tools/3d/customize.py": "تطبیق رنگ/جنس/اندازهٔ مدل",
 "tools/3d/icon3d.py": "آیکن سه‌بعدی از SVG", "tools/3d/pbr_from_photo.py": "نقشه‌های PBR از عکس", "tools/3d/preview.mjs": "پیش‌نمایش GLB",
 "tools/3d/rectify_photo.py": "صاف‌کردن عکس محصول به بافت", "tools/3d/rocketbox_anim_to_glb.py": "تبدیل انیمیشن Rocketbox",
 "tools/3d/rocketbox_to_glb.py": "تبدیل کاراکتر Rocketbox", "scripts/setup-motion-env.sh": "نصب idempotent محیط موشن",
 "scripts/mp-video-env.sh": "راه‌انداز venv ابری MP", "scripts/graph-sync.sh": "همگام‌سازی گراف graphify", "scripts/tts-fa.sh": "TTS فارسی Piper",
 "scripts/captions-fa-from-script.py": "کپشن فارسی با متن دقیق اسکریپت", "scripts/audio-master.sh": "مسترینگ صدا (−14 LUFS)",
 "scripts/qc-video.sh": "QC ویدیو: مشخصات، فریم سیاه/ثابت، بلندی، همگامی", "scripts/analyze-reference.sh": "تحلیل ویدیوی رفرنس",
 "scripts/font-fix-libass.py": "اصلاح cmap فونت فارسی برای libass", "cloud/setup.sh": "نصب‌کنندهٔ ابری MP", "cloud/doctor.py": "گزارش قابلیت‌ها",
 "cloud/deliver.py": "تحویل به Google Drive (فقط با تأیید)", "cloud/fetch_input.py": "دانلود ورودی از لینک (yt-dlp)", "cloud/jobs.py": "صف کارهای MP",
 "mp-studio/app": "اپ وب MP Studio (FastAPI)",
}
for path, p in TOOLS.items():
    sens = path in ("cloud/deliver.py", "tools/ai/gemini.mjs", "cloud/fetch_input.py")
    add(item(f"project-tool:{path}", path, "project-tool", "vendored", p, scope="project", project_specific=True, sensitive=sens,
             url="https://github.com/iliamirojaghi88-coder/moshen_project", install="همراه ریپو", verify=f"test -e {path}",
             depends_on=["repo:moshen_project"], portability=WIN_BASH if path.endswith(".sh") else ALL, recoverable="manual",
             tested="فایل در ریپو موجود"))

# ---------------------------------------------------------------- external services (auth, never exported)
SERVICES = {
 "gemini": ("Gemini API / Omni Flash", "متن رایگان؛ تصویر/ویدیو پولی", "https://ai.google.dev", "network secret x-goog-api-key یا GEMINI_API_KEY"),
 "heygen": ("HeyGen / HyperFrames cloud", "رندر ابری، publish، آواتار", "https://www.heygen.com", "HEYGEN_API_KEY / HYPERFRAMES_API_KEY یا OAuth کانکتور"),
 "elevenlabs": ("ElevenLabs", "TTS ابری (در media-use)", "https://elevenlabs.io", "ELEVENLABS_API_KEY"),
 "atlascloud": ("Atlas Cloud", "تولید لوگو/تصویر AI در اسکیل design", "https://www.atlascloud.ai", "ATLASCLOUD_API_KEY"),
 "muapi": ("MuAPI", "تولید تصویر AI در اسکیل design", "https://muapi.ai", "MUAPI_API_KEY"),
 "sketchfab": ("Sketchfab", "جست‌وجو/دانلود مدل سه‌بعدی (--online)", "https://sketchfab.com/developers", "SKETCHFAB_API_TOKEN"),
 "gdrive": ("Google Drive (cloud/deliver.py)", "تحویل خروجی", "https://developers.google.com/drive", "MP_GDRIVE_CLIENT_SECRET + MP_GDRIVE_REFRESH_TOKEN"),
 "openverse-met-polyhaven": ("Poly Haven، Openverse، Met، Cleveland، ambientCG", "منابع دارایی آزاد", "https://polyhaven.com", "بدون کلید"),
 "pexels-unsplash": ("Pexels / Unsplash", "عکس پس‌زمینه در design-system", "https://www.pexels.com/api/", "کلید هر سرویس"),
 "cmem-cloud": ("cmem.ai Cloud Sync", "همگام‌سازی حافظهٔ claude-mem (فعال نشده)", "https://github.com/thedotmack/claude-mem", "حساب cmem.ai"),
 "strix-llm": ("ارائه‌دهندهٔ LLM برای strix", "مدل پشت ایجنت امنیتی", "https://github.com/usestrix/strix", "LLM_API_KEY + STRIX_LLM"),
 "openai-groq": ("OpenAI / Groq (ارائه‌دهندهٔ اختیاری در برخی اسکیل‌ها)", "رونویسی/LLM جایگزین", "https://platform.openai.com", "OPENAI_API_KEY / GROQ_API_KEY"),
}
for sid, (name, p, url, auth) in SERVICES.items():
    free = auth == "بدون کلید"
    add(item(f"service:{sid}", name, "external-service", "mentioned" if sid in ("cmem-cloud", "openai-groq") else "configured" if sid == "gemini" else "mentioned",
             p, url=url, scope="account/external", auth=auth, sensitive=not free, recoverable="manual",
             install="نصب ندارد؛ فقط احراز هویت" + ("" if free else " — کلید را خودتان در Network secrets یا env وارد کنید"),
             tested="کلید/اتصال آزموده نشد (عمداً)", notes=None if free else "هیچ کلیدی خوانده یا صادر نشد."))

# ---------------------------------------------------------------- mentioned / proposed / rejected / excluded
def cand(id, name, status, purpose, url, notes, lic=None):
    add(item(id, name, "candidate", status, purpose, url=url, license=lic, scope="—", recoverable="manual", notes=notes,
             tested="نصب/آزموده نشد", install="نصب نشده؛ فقط با تأیید شما"))
cand("candidate:lottie-iart", "iart-ai/web-animation-skills@lottie-animation", "proposed", "Lottie برای UI وب", "https://github.com/iart-ai/web-animation-skills", "پیشنهاد در skill-discovery-log؛ ستاره کم", "MIT")
cand("candidate:lottie-freshtech", "freshtechbro/claudedesignskills@lottie-animations", "mentioned", "Lottie (جایگزین)", "https://github.com/freshtechbro/claudedesignskills", "کاندیدای دوم لاگ", "MIT")
cand("candidate:blender-skills", "اسکیل‌های Blender (affaan-m/ecc، roble3/cc-blender-skill، freshtechbro)", "rejected", "مدل‌سازی/رندر Blender", "https://skills.sh", "not needed: tools/3d کافی است")
cand("candidate:ffmpeg-skills", "اسکیل‌های ffmpeg (digitalsamba، fabriqaai)", "rejected", "ادیت/تحلیل ffmpeg", "https://skills.sh", "not needed: media-use و اسکریپت‌ها کافی‌اند")
cand("candidate:gsplat-skills", "اسکیل‌های Gaussian Splatting (scenario-labs، wu-yc، sandeeprdy1729)", "rejected", "رندر اسپلت", "https://skills.sh", "رد هر سه")
cand("candidate:spark-gsplat", "Spark @sparkjsdev/spark 2.4.0 / @mkkellogg/gaussian-splats-3d 0.4.7", "proposed", "کتابخانهٔ رندر Gaussian Splat", "https://github.com/sparkjsdev/spark", "فقط با تأیید", "MIT")
cand("excluded:claude-mem-22-skills", "۲۲ اسکیل claude-mem منتقل‌نشده (build، do، make-plan، release، cloud-sync، smart-explore، …)", "excluded", "ابزار توسعهٔ خود claude-mem / سرویس بیرونی / تداخل نام", "https://github.com/thedotmack/claude-mem", "عمداً منتقل نشد")
cand("excluded:agent-skills-hooks", "هوک‌های اختیاری agent-skills (sdd-cache، simplify-ignore)", "excluded", "کش و نادیده‌گیری", "https://github.com/addyosmani/agent-skills", "در پلاگین اصلی هم غیرفعال‌اند")
cand("excluded:ponytail-band", "Ponytail band/status line", "excluded", "نوار وضعیت ترمینال", "https://github.com/DietrichGebert/ponytail", "فقط در نصب پلاگینی ترمینال/دسکتاپ")
cand("excluded:insta-login-research", "insta-login-research + ig_session.py", "excluded", "خواندن کوکی مرورگر کاربر", "https://github.com/ThePudge/mp-video-skillset", "حساس؛ عمداً منتقل نشد")
cand("excluded:mp-studio-exe", "MP Studio.exe / setup.bat / CUDA wheels", "excluded", "نصب‌کنندهٔ ویندوز دسکتاپ", "https://github.com/ThePudge/mp-video-skillset", "فقط ویندوز/GPU")
cand("excluded:favstash-publish", "favstash publish-and-analyze + اتصال FavStash", "excluded", "انتشار و آنالیتیکس", "https://github.com/alisadiq-ai/favstash-ai-video-editing-skills", "عمداً منتقل نشد")
cand("mentioned:remotion-dev-skills", "remotion-dev/skills (fallback در cloud/setup.sh)", "mentioned", "remotion-best-practices وقتی پلاگین نباشد", "https://github.com/remotion-dev/skills", "gitignored؛ کامیت نمی‌شود")
cand("mentioned:cloud-setup-with-motion", "cloud/setup.sh --with-motion", "mentioned", "Node 22 + HyperFrames + Chrome برای MP", "https://github.com/ThePudge/mp-video-skillset", "در این ریپو با setup-motion-env پوشش داده شده")
cand("mentioned:robust-video-matting", "RobustVideoMatting", "mentioned", "مدل جداسازی گوینده (ذکر در subject-cutout)", "https://github.com/PeterL1n/RobustVideoMatting", "دانلود هنگام استفاده", "GPL-3.0")
cand("mentioned:docker-render", "hyperframes render --docker", "mentioned", "رندر ایزوله در Docker", "https://github.com/heygen-com/hyperframes", "نیاز به daemon Docker")

# ---------------------------------------------------------------- the kit's own restore steps
add(item("payload:project-claude-layer", "بازگردانی لایهٔ .claude پروژه از payload", "restore-step", "vendored",
         "کپی .claude/ (اسکیل، ایجنت، فرمان، هوک، مجوز)، .mcp.json و skills-lock.json به پروژهٔ مقصد بدون بازنویسی",
         scope="project", portability=WIN_BASH, tested="در آزمون ۱۰ در پوشهٔ ایزوله اجرا شد",
         restore=dict(phase=3, method="payload", check="test -f .claude/skills/ponytail/SKILL.md")))
add(item("payload:global-skills", "آینهٔ اسکیل‌های عمومی در ~/.claude/skills", "restore-step", "vendored",
         "در دسترس‌کردن اسکیل‌های عمومی در هر پروژهٔ همین کاربر/محیط", scope="user", portability=ALL,
         tested="در آزمون ۱۰ با HOME ایزوله اجرا شد",
         restore=dict(phase=3, method="payload-global", optional=True, check="test -f \"$HOME/.claude/skills/find-skills/SKILL.md\"")))

# ---------------------------------------------------------------- write
ids = [i["id"] for i in ITEMS]
dupes = {x for x in ids if ids.count(x) > 1}
if dupes: sys.exit(f"duplicate ids: {sorted(dupes)}")
counts = {}
for i in ITEMS:
    counts.setdefault(i["category"], 0); counts[i["category"]] += 1
status_counts = {}
for i in ITEMS:
    status_counts[i["status"]] = status_counts.get(i["status"], 0) + 1
out = {
    "schema": "claude-code-recovery-kit/1",
    "generated": INVENTORY_DATE,
    "source_session_note": "Inventory of the Claude Code ecosystem reachable from the moshen_project cloud session (repo, user config, account plugins/connectors, session MCP, container CLIs).",
    "status_legend": {
        "installed": "present and probed in this session", "vendored": "committed in the repo, loads every session",
        "account": "synced from the claude.ai account", "builtin": "ships with Claude Code", "session": "cloud-session only",
        "configured": "configured, credential/connection not tested", "configured-missing": "configured but not present in this session",
        "failed-connect": "configured, connection failed", "optional": "documented optional, not installed",
        "mentioned": "mentioned only", "proposed": "proposed, not installed", "rejected": "evaluated and rejected",
        "excluded": "deliberately not ported"},
    "counts": {"total": len(ITEMS), "by_category": counts, "by_status": status_counts},
    "phases": {"0": "prerequisites", "1": "Claude Code CLI", "2": "auth & account (manual)", "3": "project/.claude layer",
               "4": "project dependencies (moshen_project)", "5": "agent tools & MCP (general)", "6": "MP video runtime",
               "7": "optional heavy tools", "8": "sensitive / paid (manual)", "9": "verify"},
    "items": ITEMS,
}
(KIT / "tools-inventory.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"wrote {len(ITEMS)} items → {KIT/'tools-inventory.json'}")
print(json.dumps(counts, ensure_ascii=False))
