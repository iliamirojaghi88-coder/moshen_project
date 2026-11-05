import { createLiveHero } from './live-hero.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- items without a destination yet (product pages, the second phone line)

document.querySelectorAll('[aria-disabled="true"]').forEach((el) => {
  el.addEventListener('click', (e) => e.preventDefault());
});

// ---------------------------------------------------------------- menu and hero buttons: the sections of this page
// Real anchors (#top, #products, #contact), so they also work without script and
// from the address bar. Each section's scroll-margin-top keeps its title clear of
// the fixed header; focus moves to the section's title for keyboard users.

function goTo(id, behavior) {
  const target = document.getElementById(id);
  if (!target) return false;
  if (id === 'top') scrollTo({ top: 0, behavior });
  else target.scrollIntoView({ behavior, block: 'start' });
  const title = id === 'top' ? document.getElementById('hero-title') : target.querySelector('h2');
  if (title) {
    title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }
  return true;
}

// the catalogue page on screen (null: the home page); see «catalogue pages» below
let routeView = null;

// ---------------------------------------------------------------- the menu follows the page
// One state and one place that changes it: setActive(). What is in view comes from
// two IntersectionObservers: a thin line across the screen at 35% of its height
// (well below the fixed header), on which exactly one section lies, and a marker at
// the very end of the page (the last section may be shorter than a tall screen).
// The hero is «خانه», the products, «چرا سیم‌لند؟» and the résumé are «محصولات», the contact
// section is «ارتباط با ما». During a jump from the menu or a hero button the menu
// shows the destination at once and ignores the sections it glides past; once the
// page has come to rest, what is in view decides again (also if the visitor took
// over mid-way). No work on scroll except while such a jump is moving.

const navItems = [...document.querySelectorAll('.topnav-item[data-scroll]')];
const navKey = { top: 'top', products: 'products', why: 'products', resume: 'products', contact: 'contact' };
let active = navItems.find((a) => a.classList.contains('is-active'))?.getAttribute('href').slice(1) || 'top';

function setActive(key) {
  if (key === active) return;
  active = key;
  for (const a of navItems) {
    const on = a.getAttribute('href') === `#${key}`;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
}

let onLine = 'top'; // the section crossing the line
let atEnd = false; // the end of the page is in view
let jump = null; // destination of a jump still on its way
let jumpAt = 0;
let moved = false;
let restTimer = 0;
const inView = () => (atEnd ? 'contact' : onLine);

function rest() {
  // the jump is over when the page has stopped moving (a smooth scroll can take a
  // moment to begin on a busy device: until it has moved, wait up to a second)
  clearTimeout(restTimer);
  restTimer = setTimeout(() => {
    const y = scrollY;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!jump || scrollY !== y) return; // still moving: the next scroll event checks again
      if (!moved && performance.now() - jumpAt < 1000) return rest();
      jump = null;
      removeEventListener('scroll', onJumpScroll);
      setActive(inView());
    }));
  }, 120);
}

function onJumpScroll() {
  moved = true;
  rest();
}

function startJump(key) {
  jump = key;
  jumpAt = performance.now();
  moved = false;
  setActive(key);
  addEventListener('scroll', onJumpScroll, { passive: true });
  rest();
}

if ('IntersectionObserver' in window) {
  const sections = new Map([[document.querySelector('.hero'), 'top'], ...['products', 'why', 'resume', 'contact'].map((id) => [document.getElementById(id), navKey[id]])]);
  const line = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) onLine = sections.get(e.target);
    if (!jump && !routeView) setActive(inView());
  }, { rootMargin: '-35% 0px -64% 0px' });
  for (const el of sections.keys()) if (el) line.observe(el);
  const contact = document.getElementById('contact');
  if (contact) {
    const marker = document.createElement('span');
    marker.className = 'page-end';
    marker.setAttribute('aria-hidden', 'true');
    contact.append(marker);
    new IntersectionObserver(([e]) => {
      atEnd = e.isIntersecting;
      if (!jump && !routeView) setActive(inView());
    }).observe(marker);
  }
}

document.querySelectorAll('[data-scroll]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href').slice(1);
    // from a catalogue page: back to the home page, at that section (Back returns here)
    if (routeView) {
      e.preventDefault();
      history.pushState(null, '', id === 'top' ? location.pathname + location.search : `#${id}`);
      showRoute();
      return;
    }
    if (!goTo(id, reducedMotion ? 'auto' : 'smooth')) return;
    e.preventDefault();
    startJump(navKey[id] || 'top');
    history.replaceState(null, '', id === 'top' ? location.pathname + location.search : `#${id}`);
  });
});

// ---------------------------------------------------------------- the résumé PDF
// The button links to assets/resume/simland-resume.pdf next to the page (a web server
// or the unzipped folder on a computer) and opens it in a new tab. Where that address
// cannot work, the same PDF is opened another way:
//  · on a web server where the PDF was not uploaded (checked once with HEAD): its
//    public copy (data-online, the client's Google Drive link to the same file);
//  · a page opened from a phone's file manager (content://, or any phone opening a
//    local file) cannot reach a file next to it, and phone browsers do not show a
//    local PDF themselves: the public copy;
//  · the one-file page (dist-standalone/) carries the PDF inside it
//    (<script type="application/pdf;base64" id="catalog-pdf">): opened from disk on a
//    computer it opens that copy in a new tab; on a phone with no connection it saves
//    it (download), so it can be opened in the phone's PDF reader.
const resumeLink = document.querySelector('a.resume-cta');
const resumeData = document.getElementById('catalog-pdf');

// where the button should lead, for a given page context (also used by the checks)
function resumeRoute({ protocol, phone, online, embedded }) {
  if (protocol === 'http:' || protocol === 'https:') return 'file-then-check';
  if (embedded && !(phone && online)) return phone ? 'embedded-download' : 'embedded';
  if (protocol === 'file:' && !phone) return 'file';
  return 'online';
}
window.__resumeRoute = resumeRoute;

if (resumeLink) {
  const route = resumeRoute({
    protocol: location.protocol,
    phone: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    online: navigator.onLine !== false,
    embedded: !!resumeData,
  });
  resumeLink.dataset.route = route;
  const publicCopy = resumeLink.dataset.online;
  if (route === 'online' && publicCopy) resumeLink.href = publicCopy;
  if (route === 'file-then-check' && publicCopy) {
    fetch(resumeLink.href, { method: 'HEAD' })
      .then((r) => { if (!r.ok) resumeLink.href = publicCopy; })
      .catch(() => {});
  }
  if (route === 'embedded' || route === 'embedded-download') {
    let blobUrl = '';
    resumeLink.addEventListener('click', () => {
      if (!blobUrl) {
        const bin = atob(resumeData.textContent.trim());
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      }
      resumeLink.href = blobUrl;
      if (route === 'embedded-download') resumeLink.setAttribute('download', 'simland-resume.pdf');
    });
  }
}

// ---------------------------------------------------------------- catalogue pages
// The category and product pages are <main class="route-view" data-route> blocks
// after the home page (built from assets/data/catalog.json). The address says which
// one is shown: #/products/<category> or #/products/<category>/<id>. A hash, so a
// direct link, Refresh and Back work everywhere: on a web server, from the disk,
// in the one-file page and from a phone's file manager. Any other address shows
// the home page: where it was left, or at the #section the address names.
const homeMain = document.getElementById('top');
const routeViews = [...document.querySelectorAll('.route-view')];
const homeTitle = document.title;
let homeY = 0;
let homeHash = null; // the home page's address when a catalogue page was opened from it
let mediaData = null;

// in the one-file page each product photo is embedded once (#media-data)
function showMedia(view) {
  const imgs = view.querySelectorAll('img[data-media]:not([src])');
  if (!imgs.length) return;
  if (!mediaData) {
    const el = document.getElementById('media-data');
    mediaData = el ? JSON.parse(el.textContent) : {};
  }
  imgs.forEach((img) => {
    if (mediaData[img.dataset.media]) img.src = mediaData[img.dataset.media];
  });
}

function showRoute(e) {
  const path = location.hash.startsWith('#/') ? location.hash.slice(1) : '';
  const view = routeViews.find((v) => v.dataset.route === path);
  if (view) {
    if (!routeView) {
      homeY = scrollY;
      homeHash = e && e.oldURL ? new URL(e.oldURL).hash : null;
    }
    homeMain.hidden = true;
    routeViews.forEach((v) => (v.hidden = v !== view));
    routeView = view;
    showMedia(view);
    document.title = view.dataset.title;
    setActive('products');
    scrollTo({ top: 0, behavior: 'instant' });
    view.querySelector('h1').focus({ preventScroll: true });
    return;
  }
  if (!routeView) return;
  routeViews.forEach((v) => (v.hidden = true));
  homeMain.hidden = false;
  routeView = null;
  document.title = homeTitle;
  const id = location.hash.slice(1);
  const section = id && document.getElementById(id);
  // Back (or a link) to the very address the page was opened from: where the visitor was
  if (e && location.hash === homeHash) scrollTo({ top: homeY, behavior: 'instant' });
  else if (id === 'top') goTo('top', 'instant');
  else if (section && homeMain.contains(section)) goTo(id, 'instant');
  else scrollTo({ top: homeY, behavior: 'instant' });
}

addEventListener('hashchange', showRoute);
showRoute();

// ---------------------------------------------------------------- «توضیحات» (accordion)
// A <details> (works, and is found by search-in-page, without this script): its height
// slides open and shut; reduced motion: it just opens and closes.
document.querySelectorAll('details.pdetail-acc').forEach((acc) => {
  const sum = acc.querySelector('summary');
  const body = acc.querySelector('.pdetail-acc-body');
  let open = acc.open;
  let anim = null;
  acc.classList.toggle('is-open', open);
  sum.addEventListener('click', (e) => {
    e.preventDefault();
    open = !open;
    acc.classList.toggle('is-open', open);
    const from = acc.open ? body.getBoundingClientRect().height : 0;
    if (anim) anim.cancel();
    acc.open = true;
    const to = open ? body.scrollHeight : 0;
    if (reducedMotion) {
      acc.open = open;
      return;
    }
    anim = body.animate(
      { height: [`${from}px`, `${to}px`], opacity: open ? [from ? 1 : 0.2, 1] : [1, 0.2] },
      { duration: 380, easing: 'cubic-bezier(0.22, 0.7, 0.2, 1)' },
    );
    anim.onfinish = () => {
      anim = null;
      acc.open = open;
    };
  });
});

// ---------------------------------------------------------------- «در انتظار تأمین»
// Cards marked supply: pending: a click (or Enter / Space on the card's button) shows one small note in
// the middle of the screen for 2 s; another click restarts the 2 s. The text is set anew each time so
// screen readers announce it again (role=status, aria-live=polite).
const toast = document.getElementById('supply-toast');
if (toast) {
  const text = toast.querySelector('.supply-toast-text');
  const SHOW = 2000;
  const FADE = 180;
  let timer = 0;
  const show = () => {
    clearTimeout(timer);
    text.textContent = '';
    toast.classList.add('is-on');
    requestAnimationFrame(() => (text.textContent = 'در انتظار تأمین'));
    timer = setTimeout(() => toast.classList.remove('is-on'), SHOW - FADE);
  };
  document.querySelectorAll('.pcard[data-supply]').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      show();
    });
    const cta = card.querySelector('[data-supply]');
    cta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        show();
      }
    });
  });
}

// ---------------------------------------------------------------- the contact panel («استعلام قیمت»)
// One <dialog> for the whole site (#contact-panel): every [data-inquiry] button opens
// it. A centred card on larger screens, a sheet from the bottom on phones; closed by
// ×, Escape or a tap outside it; the page behind does not scroll; focus goes back to
// the button that opened it. Without <dialog> support the button leads to #contact.
const panel = document.getElementById('contact-panel');
if (panel) {
  let opener = null;
  const closePanel = () => panel.open && panel.close();
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-inquiry]');
    if (!trigger) return;
    e.preventDefault();
    if (typeof panel.showModal !== 'function') {
      location.hash = '#contact';
      return;
    }
    opener = trigger;
    fillChoice(trigger);
    document.documentElement.classList.add('panel-open');
    panel.showModal();
  });
  panel.addEventListener('click', (e) => {
    if (e.target === panel) closePanel(); // the dimmed area around the card
  });
  panel.querySelector('[data-close]').addEventListener('click', closePanel);
  panel.addEventListener('close', () => {
    document.documentElement.classList.remove('panel-open');
    if (opener) opener.focus({ preventScroll: true });
    opener = null;
  });
}

// ---------------------------------------------------------------- product pages: gallery and choices
// Gallery: a thumbnail shows its picture in the frame (the frame takes the picture's look: technical pictures on
// black). Choices: colour and size are radio buttons; the choice is summed up under the specs; a colour with its
// own photo (data-slide) shows that photo, another colour goes back to the main photo. The contact panel names
// the product and the choice it was opened with.
function showSlide(visual, i) {
  if (!visual) return;
  const slides = visual.querySelectorAll('.pgal-slide');
  const slide = slides[i];
  if (!slide) return;
  slides.forEach((s, k) => {
    s.classList.toggle('is-active', k === i);
    if (k === i) s.removeAttribute('aria-hidden');
    else s.setAttribute('aria-hidden', 'true');
  });
  visual.querySelectorAll('.pgal-thumb').forEach((t, k) => t.setAttribute('aria-pressed', String(k === i)));
  const media = visual.querySelector('.pdetail-media');
  const frame = slide.dataset.frame || '';
  media.classList.toggle('is-tech', /\bis-tech\b/.test(frame));
  media.classList.toggle('has-bleed', /\bhas-bleed\b/.test(frame));
}

function choiceText(article) {
  const parts = [...article.querySelectorAll('input[data-choice]:checked')].map((i) => `${i.dataset.choice}: ${i.value}`);
  return parts.join('، ');
}

document.addEventListener('click', (e) => {
  const thumb = e.target.closest('.pgal-thumb');
  if (!thumb) return;
  showSlide(thumb.closest('[data-gallery]'), Number(thumb.dataset.go));
});

document.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-choice]');
  if (!input) return;
  const article = input.closest('.pdetail');
  if (!article) return;
  article.querySelectorAll(`input[name="${input.name}"]`).forEach((i) => i.closest('label').classList.toggle('is-on', i.checked));
  const summary = article.querySelector('[data-choice-summary]');
  if (summary) {
    const text = choiceText(article);
    summary.textContent = text ? `انتخاب شما — ${text}` : '';
    summary.hidden = !text;
  }
  const visual = article.querySelector('[data-gallery]');
  if (visual && input.dataset.choice === 'رنگ') showSlide(visual, input.dataset.slide !== undefined ? Number(input.dataset.slide) : 0);
});

function fillChoice(trigger) {
  const box = document.getElementById('cpanel-choice');
  if (!box) return;
  const article = trigger.closest('.pdetail');
  const name = article && article.querySelector('.pdetail-title');
  if (!name) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  const text = choiceText(article);
  box.textContent = `محصول: ${name.textContent.trim()}${text ? `، ${text}` : ''}`;
  box.hidden = false;
}

// opened with #products or #contact: land on the section once the fonts have settled the layout
if (/^#(products|contact|why)$/.test(location.hash)) {
  const id = location.hash.slice(1);
  document.fonts.ready.then(() => {
    const root = document.documentElement;
    root.style.scrollBehavior = 'auto';
    goTo(id, 'auto');
    root.style.scrollBehavior = '';
  });
}

// ---------------------------------------------------------------- entrance: each block slides or rises in once
// One observer for the page. A product card comes in from its own side of its
// real row (right half from the right, left half from the left, a middle one from
// below), one after another along the row, whatever the number of columns; the
// four «چرا سیم‌لند؟» cards alternate; the contact title rises, its cards follow
// from the reading side and the phone settles in last. Only transform and opacity
// move, nothing stays transformed afterwards, and without script or with reduced
// motion everything is simply there.

const revealing = [...document.querySelectorAll('[data-reveal]')];
if (!reducedMotion && 'IntersectionObserver' in window && revealing.length) {
  const pending = (el) => !el.classList.contains('is-in');

  const placeProducts = () => {
    const rows = new Map();
    for (const card of document.querySelectorAll('.pcard')) {
      const key = card.offsetTop; // layout position: not moved by the entrance transform
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(card);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => b.offsetLeft - a.offsetLeft); // right to left, the reading order
      const n = row.length;
      row.forEach((card, i) => {
        if (!pending(card)) return;
        card.dataset.reveal = n % 2 && i === (n - 1) / 2 ? 'up' : i < n / 2 ? 'right' : 'left';
        card.style.setProperty('--rd', `${i * 70}ms`);
      });
    }
  };

  const placeWhy = () => {
    const cards = [...document.querySelectorAll('.why-card')];
    const oneRow = cards.length > 1 && cards.every((c) => c.offsetTop === cards[0].offsetTop);
    // one column: from the side of the text, the third rises; a row of four: from the outer edges inwards
    const sides = oneRow ? ['right', 'up', 'up', 'left'] : ['right', 'left', 'up', 'left'];
    cards.forEach((card, i) => {
      if (!pending(card)) return;
      card.dataset.reveal = sides[i % sides.length];
      card.style.setProperty('--rd', oneRow ? `${i * 90}ms` : '0ms');
    });
  };

  document.querySelectorAll('.contact-list > li').forEach((li, i) => li.style.setProperty('--rd', `${80 + i * 90}ms`));
  placeProducts();
  placeWhy();
  document.documentElement.classList.add('reveal-on');

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      placeProducts();
      placeWhy();
    }, 150);
  });

  const reveal = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        reveal.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  revealing.forEach((el) => reveal.observe(el));
}

// ---------------------------------------------------------------- contact: «کپی آدرس»

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers, or no clipboard permission: copy through a hidden field
    const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  }
}

document.querySelectorAll('.ccard-copy').forEach((button) => {
  const status = button.parentElement.querySelector('.ccard-status');
  let timer = 0;
  button.addEventListener('click', async () => {
    const ok = await copyText(button.dataset.copy);
    button.classList.toggle('is-copied', ok);
    status.textContent = ok ? 'آدرس کپی شد' : 'کپی نشد؛ آدرس را انتخاب کنید';
    clearTimeout(timer);
    timer = setTimeout(() => {
      button.classList.remove('is-copied');
      status.textContent = '';
    }, 2200);
  });
});

// ---------------------------------------------------------------- loading screen
// The bar fills on CSS from the first paint and waits at 92 %; it is finished here once the first view is really
// ready: the fonts and the hero picture, and the live hero's first frame if it comes within 3 s (the still picture
// under it is the same image, so a slower device is shown that one). The bar is full at about 3 s; never later than
// 8 s, so a slow device or connection still gets the page. Reduced motion: it closes as soon as that is ready,
// without animation.
const loader = document.getElementById('loader');
let heroLive = () => {};
const heroLiveDone = new Promise((resolve) => (heroLive = resolve));
if (loader) {
  const MIN = reducedMotion ? 0 : 2600;
  const MAX = 8000;
  const root = document.documentElement;
  const homeShown = !document.getElementById('top').hidden;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms - performance.now())));
  const pictures = [...document.querySelectorAll('.hero img')].map((img) => img.decode().catch(() => {}));
  const ready = Promise.all([document.fonts.ready, ...pictures, homeShown && !reducedMotion ? Promise.race([heroLiveDone, wait(3000)]) : null]);
  Promise.race([Promise.all([ready, wait(MIN)]), wait(MAX)]).then(() => {
    const reveal = () => {
      loader.classList.add('is-leaving');
      root.classList.remove('is-loading');
      setTimeout(() => {
        root.classList.add('loaded');
        loader.remove();
      }, reducedMotion ? 0 : 650);
    };
    if (reducedMotion) {
      reveal();
      return;
    }
    // from where the CSS bar is now to the end, then the fade
    const fill = loader.querySelector('.loader-fill');
    const at = getComputedStyle(fill).transform;
    fill.style.animation = 'none';
    fill.style.transform = at === 'none' ? 'scaleX(0)' : at;
    fill.getBoundingClientRect();
    fill.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
    fill.style.transform = 'scaleX(1)';
    setTimeout(reveal, 420);
  });
}

// ---------------------------------------------------------------- the live hero

const host = document.querySelector('[data-scene]');
const data = JSON.parse(document.getElementById('hero-data').textContent);

function load(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

const images = {
  base: host.querySelector('[data-layer="base"]'),
  masks: load(data.masks),
};
if (data.power) images.power = load(data.power.mask);
for (const t of data.scene.turbines) {
  images[`blades-${t.id}`] = host.querySelector(`[data-layer="blades-${t.id}"]`);
  images[`caps-${t.id}`] = host.querySelector(`[data-layer="caps-${t.id}"]`);
}

createLiveHero({
  host,
  scene: data.scene,
  power: data.power,
  images,
  reducedMotion,
  onLive: () => {
    host.classList.add('is-live');
    heroLive();
  },
})
  .then((hero) => {
    if (hero) window.__hero = hero;
    else heroLive(); // no live hero here (no WebGL): the still picture is the first view
  })
  .catch((err) => {
    heroLive();
    console.warn('[simland] live hero off:', err.message);
  });
