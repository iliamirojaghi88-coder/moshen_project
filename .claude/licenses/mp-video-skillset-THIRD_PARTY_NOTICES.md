# Third-party notices

This project (MIT, © mohammadpour.bi) builds on work by others. Each keeps its own license.

## Included in this repository
| Part | Source | License | Where |
|---|---|---|---|
| `video-use` skill and helpers (with local changes listed in `UPSTREAM.txt`) | [browser-use/video-use](https://github.com/browser-use/video-use) | MIT | `.claude/skills/video-use/LICENSE` |
| Content skills (hooks, scripts, captions, reels…) | [ootto-ai/claude-content-skills](https://github.com/ootto-ai/claude-content-skills) | MIT | `.claude/skills/LICENSE-ootto-content-skills` |
| `fav-*` skills (`fav-edit-video` + styles `fav-adaptive-glass`, `fav-paper-grid`, `fav-breakout-card`, `fav-text-over-footage`, `fav-motion-effects`, `fav-product-motion-ads`, `fav-find-ideas`, `fav-write-script`); the pack's `publish-and-analyze` skill and FavStash connection are not included | [alisadiq-ai/favstash-ai-video-editing-skills](https://github.com/alisadiq-ai/favstash-ai-video-editing-skills) | Apache-2.0 | `.claude/skills/fav-edit-video/LICENSE` |
| `anidoodle` skill and engine | [alexgreensh/anidoodle](https://github.com/alexgreensh/anidoodle) | Apache-2.0 | `.claude/skills/anidoodle/LICENSE`, `NOTICE` |
| Arta Edit Studio (Farsi-first reel edits), driven by the `arta-reels` skill | [Jenesyx/arta-edit-studio](https://github.com/Jenesyx/arta-edit-studio) by Arta Bidkhori | MIT | `mp-studio/vendor/arta-edit-studio/LICENSE` |
| Vazirmatn font | [rastikerdar/vazirmatn](https://github.com/rastikerdar/vazirmatn) | SIL OFL 1.1 | `fonts/OFL-Vazirmatn.txt` |
| Lalezar font | [Google Fonts](https://fonts.google.com/specimen/Lalezar) | SIL OFL 1.1 | `fonts/OFL-Lalezar.txt` |

## Downloaded at setup or first use (not redistributed here)
| Part | Source | License |
|---|---|---|
| HyperFrames CLI and skills | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0 |
| Remotion best-practices skill | [remotion-dev/skills](https://github.com/remotion-dev/skills) | see repo; Remotion itself is free for individuals and small teams, larger companies need a [Remotion license](https://www.remotion.dev/license) |
| GSAP skills | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | MIT |
| GSAP | [greensock/GSAP](https://github.com/greensock/GSAP) | GSAP standard license (free) |
| Lucide icons | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | ISC |
| Simple Icons (brand logos) | [simple-icons/simple-icons](https://github.com/simple-icons/simple-icons) | CC0-1.0 |
| Three.js | [mrdoob/three.js](https://github.com/mrdoob/three.js) | MIT |
| Rapier 2D physics | [dimforge/rapier](https://github.com/dimforge/rapier) | Apache-2.0 |
| lottie-web | [airbnb/lottie-web](https://github.com/airbnb/lottie-web) | MIT |
| HyperFrames and GSAP runtime for the `fav-*` skills (`.favstash-studio/runtime`) | npm (`hyperframes`, `gsap`) | Apache-2.0 / GSAP standard license |
| openai-whisper, PyTorch, OpenCV (only for `arta-reels`, own venv) | [openai/whisper](https://github.com/openai/whisper), [pytorch/pytorch](https://github.com/pytorch/pytorch), [opencv-python](https://github.com/opencv/opencv-python) | MIT / BSD-3 / Apache-2.0 |
| Kinocut MCP server | [KyaniteLabs/kinocut](https://github.com/KyaniteLabs/kinocut) | Apache-2.0 |
| faster-whisper / Whisper models | [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) | MIT |
| FFmpeg | [ffmpeg.org](https://ffmpeg.org) | LGPL/GPL (installed separately via winget) |
| yt-dlp | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense |

## Ideas adapted (no code copied)
- Depth effects: Charlie Hills, "9 video effects for Claude".
- Editorial theme, article highlight, cinematic camera: [Liamrjohnston/remotion-motion-graphics-skill](https://github.com/Liamrjohnston/remotion-motion-graphics-skill) (MIT).
- Hook microscope and link downloads: [taoufik123-collab/claude-watch](https://github.com/taoufik123-collab/claude-watch) (MIT).

## Trademarks
Brand logos (Instagram, Claude, Notion, …) are trademarks of their owners and appear only to
refer to those products. Fonts you add yourself stay on your computer and are never committed;
most commercial Persian fonts do not allow sharing their files.
