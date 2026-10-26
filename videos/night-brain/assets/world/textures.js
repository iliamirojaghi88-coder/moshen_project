// Canvas-painted surfaces: calendar page, clock dial, phone and laptop UIs,
// notification cards. Persian text is drawn RTL in Estedad (loaded by
// index.html's @font-face before the world builds).
import * as THREE from "three";

const FONT = "Estedad";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function tex(c, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, s, x, y, { size = 40, weight = 500, color = "#fff", align = "right", rtl = true } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

// Line icon tinted to a colour (SVGs are stroke=currentColor → black).
async function icon(name, size, color) {
  const im = await loadImage(`assets/icons/${name}.svg`);
  const [c, ctx] = canvas(size, size);
  ctx.drawImage(im, 0, 0, size, size);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export async function loadFonts() {
  await Promise.all(
    [300, 400, 500, 700, 800, 900].map((w) => document.fonts.load(`${w} 48px ${FONT}`, "سلام ۱۲۳")),
  );
}

// Tomorrow's page of a desk calendar: Tuesday, 5 Aban 1405, three to-dos.
export function calendarPage() {
  const [c, ctx] = canvas(1024, 1024);
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, "#fbfaf7");
  g.addColorStop(1, "#ecebe6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = "#14233a";
  ctx.fillRect(0, 0, 1024, 210);
  text(ctx, "آبان ۱۴۰۵", 512, 140, { size: 92, weight: 800, color: "#f4f1ea", align: "center" });
  text(ctx, "۵", 512, 610, { size: 380, weight: 900, color: "#14233a", align: "center" });
  text(ctx, "سه‌شنبه · فردا", 512, 720, { size: 66, weight: 700, color: "#e0672b", align: "center" });
  ctx.strokeStyle = "rgba(20,35,58,0.18)";
  ctx.lineWidth = 3;
  const todos = ["جلسه با مدیر ۹:۰۰", "تحویل پروژه", "قسط بانک"];
  todos.forEach((s, i) => {
    const y = 815 + i * 66;
    ctx.beginPath();
    ctx.moveTo(150, y + 16);
    ctx.lineTo(874, y + 16);
    ctx.stroke();
    rr(ctx, 832, y - 34, 40, 40, 8);
    ctx.stroke();
    text(ctx, s, 805, y, { size: 44, weight: 500, color: "#2b3442" });
  });
  return tex(c);
}

export function calendarBack() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = "#1a2638";
  ctx.fillRect(0, 0, 256, 256);
  return tex(c);
}

// Matte black dial, white batons, Persian quarter numerals.
export function clockDial() {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const cx = S / 2;
  const g = ctx.createRadialGradient(cx, cx * 0.8, 50, cx, cx, cx);
  g.addColorStop(0, "#1b1f26");
  g.addColorStop(1, "#0b0d11");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const major = i % 5 === 0;
    const r0 = major ? 400 : 430;
    const r1 = 462;
    ctx.strokeStyle = major ? "#f2f2f0" : "rgba(242,242,240,0.55)";
    ctx.lineWidth = major ? 13 : 4;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * r0, cx - Math.cos(a) * r0);
    ctx.lineTo(cx + Math.sin(a) * r1, cx - Math.cos(a) * r1);
    ctx.stroke();
  }
  const nums = { 0: "۱۲", 3: "۳", 6: "۶", 9: "۹" };
  for (const [k, s] of Object.entries(nums)) {
    const a = (k / 12) * Math.PI * 2;
    ctx.font = `300 96px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e9e9e6";
    ctx.fillText(s, cx + Math.sin(a) * 320, cx - Math.cos(a) * 320 + 8);
  }
  return tex(c);
}

// Lock-screen wallpaper with the time; notifications are separate 3D cards.
export function phoneScreen() {
  const [c, ctx] = canvas(720, 1520);
  const g = ctx.createLinearGradient(0, 0, 720, 1520);
  g.addColorStop(0, "#1d3557");
  g.addColorStop(0.55, "#22264a");
  g.addColorStop(1, "#0d1022");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 720, 1520);
  const r = ctx.createRadialGradient(560, 380, 10, 560, 380, 520);
  r.addColorStop(0, "rgba(255,150,90,0.35)");
  r.addColorStop(1, "rgba(255,150,90,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, 720, 1520);
  text(ctx, "سه‌شنبه، ۴ آبان", 360, 250, { size: 40, weight: 500, color: "rgba(255,255,255,0.85)", align: "center" });
  text(ctx, "۱۰:۲۴", 360, 430, { size: 190, weight: 700, color: "#ffffff", align: "center" });
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  rr(ctx, 260, 1470, 200, 10, 5);
  ctx.fill();
  return tex(c);
}

export function phoneScreenOff() {
  const [c, ctx] = canvas(16, 16);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 16, 16);
  return tex(c);
}

// A focused-work dashboard: tasks, a calendar strip, a progress chart.
export async function laptopScreen() {
  const W = 1600,
    H = 1000;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#f5f6f8";
  ctx.fillRect(0, 0, W, H);
  // sidebar (right, RTL)
  ctx.fillStyle = "#162238";
  ctx.fillRect(W - 300, 0, 300, H);
  text(ctx, "کارهای امروز", W - 40, 90, { size: 44, weight: 800, color: "#ffffff" });
  ["داشبورد", "پروژه‌ها", "تقویم", "پیام‌ها", "گزارش‌ها"].forEach((s, i) => {
    if (i === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      rr(ctx, W - 285, 150 + i * 80, 270, 62, 14);
      ctx.fill();
    }
    text(ctx, s, W - 50, 192 + i * 80, { size: 34, weight: 500, color: i === 1 ? "#ffffff" : "rgba(255,255,255,0.65)" });
  });
  text(ctx, "پروژهٔ فصل پاییز", W - 360, 100, { size: 52, weight: 800, color: "#162238" });
  text(ctx, "۷ کار باز · ۳ مهلت امروز", W - 360, 150, { size: 30, weight: 500, color: "#6b7585" });
  const tasks = [
    ["ارسال گزارش ماهانه", "#e0672b", true],
    ["بازبینی طراحی صفحه", "#3a7bd5", false],
    ["تماس با مشتری", "#e0672b", false],
    ["آماده‌سازی ارائه", "#3a7bd5", false],
    ["پاسخ به ایمیل‌ها", "#8a94a6", false],
  ];
  tasks.forEach(([s, col, done], i) => {
    const y = 200 + i * 112;
    ctx.fillStyle = "#ffffff";
    rr(ctx, 520, y, W - 360 - 520 + 0, 92, 18);
    ctx.fill();
    ctx.fillStyle = col;
    rr(ctx, W - 380, y + 18, 8, 56, 4);
    ctx.fill();
    ctx.strokeStyle = done ? "#2fa36b" : "#c3c9d4";
    ctx.lineWidth = 4;
    rr(ctx, W - 440, y + 28, 36, 36, 9);
    ctx.stroke();
    if (done) {
      ctx.beginPath();
      ctx.moveTo(W - 432, y + 46);
      ctx.lineTo(W - 424, y + 55);
      ctx.lineTo(W - 410, y + 36);
      ctx.stroke();
    }
    text(ctx, s, W - 465, y + 58, { size: 34, weight: 600, color: done ? "#9aa3b1" : "#1d2635" });
    text(ctx, ["۱۰:۰۰", "۱۱:۳۰", "۱۴:۰۰", "۱۵:۰۰", "۱۷:۰۰"][i], 590, y + 58, { size: 30, weight: 500, color: "#6b7585", align: "left", rtl: false });
  });
  // chart card (left)
  ctx.fillStyle = "#ffffff";
  rr(ctx, 40, 200, 440, 540, 22);
  ctx.fill();
  text(ctx, "پیشرفت هفته", 450, 260, { size: 34, weight: 700, color: "#1d2635" });
  const bars = [0.42, 0.58, 0.5, 0.74, 0.66, 0.88, 0.35];
  bars.forEach((b, i) => {
    const x = 80 + i * 56;
    const h = b * 380;
    ctx.fillStyle = i === 5 ? "#e0672b" : "#3a7bd5";
    rr(ctx, x, 700 - h, 34, h, 8);
    ctx.fill();
  });
  ctx.fillStyle = "#ffffff";
  rr(ctx, 40, 770, 440, 190, 22);
  ctx.fill();
  text(ctx, "۷۸٪", 450, 880, { size: 96, weight: 900, color: "#162238" });
  text(ctx, "تمرکز امروز", 450, 930, { size: 28, weight: 500, color: "#6b7585" });
  return tex(c, { aniso: 16 });
}

export function keyboardDeck() {
  const W = 1600,
    H = 1100;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#c9ccd2";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#b9bdc4";
  rr(ctx, 90, 60, W - 180, 610, 18);
  ctx.fill();
  const cols = 14;
  const kw = (W - 220) / cols;
  for (let r = 0; r < 6; r++) {
    for (let k = 0; k < cols; k++) {
      const x = 110 + k * kw;
      const y = 80 + r * 98;
      let w = kw - 10;
      if (r === 5 && k === 4) w = kw * 6 - 10;
      if (r === 5 && k > 4 && k < 10) continue;
      ctx.fillStyle = "#1c1e22";
      rr(ctx, x, y, w, r === 0 ? 50 : 84, 9);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#bfc2c8";
  rr(ctx, W / 2 - 330, 720, 660, 340, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 3;
  ctx.stroke();
  return tex(c);
}

// Frosted-glass notification card.
export async function notificationCard({ icon: iconName, accent, title, body, time }) {
  const W = 900,
    H = 260;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(250,251,253,0.9)";
  rr(ctx, 4, 4, W - 8, H - 8, 52);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = accent;
  rr(ctx, W - 190, 58, 140, 140, 36);
  ctx.fill();
  const ic = await icon(iconName, 84, "#ffffff");
  ctx.drawImage(ic, W - 162, 86);
  text(ctx, title, W - 220, 112, { size: 46, weight: 800, color: "#141b26" });
  text(ctx, body, W - 220, 182, { size: 40, weight: 500, color: "#3a4352" });
  text(ctx, time, 50, 104, { size: 32, weight: 500, color: "#7a8494", align: "left", rtl: false });
  return tex(c);
}

export function notebookCover() {
  const [c, ctx] = canvas(512, 700);
  ctx.fillStyle = "#1b2a44";
  ctx.fillRect(0, 0, 512, 700);
  for (let i = 0; i < 4000; i++) {
    const x = (i * 97.13) % 512;
    const y = (i * 61.7) % 700;
    ctx.fillStyle = `rgba(255,255,255,${0.012 + ((i * 7) % 5) * 0.004})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.fillStyle = "#c79a4a";
  ctx.fillRect(470, 0, 14, 700);
  return tex(c);
}

export function softSprite() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.75)");
  g.addColorStop(0.5, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// A soft pool of light (white on black) for an emissive map.
export function lightPool(w, h, cx, cy, r) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.6, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return tex(c);
}

export function radialShadow() {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.5, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export async function photo(src) {
  const t = await new THREE.TextureLoader().loadAsync(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
