/* METRICA card geometry.
   Every skin is drawn in its reference pixels (w × h, measured from the design references).
   Each point carries an anchor: x l|r|p (left, right, proportional), y t|b|p (top, bottom, proportional).
   When a card is wider or taller than its reference aspect, only the straight runs lengthen;
   corners, ribbons and lighting keep their size, so nothing is ever stretched. */
(function (root) {
  const SKINS = {
    sub: { w: 713, h: 437, g: {
      body: 'M l0,t223 C l0,t65.1 l56.4,t0 l193.3,t0 L r518.4,t0 C r638.7,t0 r713,t35.3 r713,t92.5 L r713,b360.8 C r713,b388.1 r655.5,b437 r552.5,b437 L l111.6,b437 C l47.4,b437 l0,b407.1 l0,b366.7 Z',
      wave: 'M l-20,b392 C l60,b378 l150,b350 l250,b356 C l340,b362 r440,b408 r520,b437 L r520,b470 L l-20,b470 Z',
      waveLine: 'M l0,b386 C l70,b374 l150,b350 l250,b356 C l340,b362 r440,b408 r520,b437',
      wave2: 'M l-20,b415 C l90,b398 l190,b386 l290,b396 C l380,b405 r470,b425 r560,b445 L r560,b470 L l-20,b470 Z',
    } },
    hdr: { w: 746, h: 606, g: {
      body: 'M l0,t310 C l0,t120 l100,t45 l376,t40 C r470,t38 r560,t36 r600,t36 C r650,t34 r668,t8 r700,t4 C r726,t1 r746,t16 r746,t44 L r746,b540 C r746,b590 r716,b606 r656,b606 L l90,b606 C l30,b606 l0,b590 l0,b540 Z',
      floor: 'M l-10,b420 C l120,b380 r626,b380 r756,b420 L r756,b630 L l-10,b630 Z',
    } },
    econ: { w: 710, h: 207, g: {
      body: 'M l0,t69 C l0,t32.3 l35.8,t2.5 l80,t2.5 C l200,t2 r330,t4 r420,t6.5 C r470,t7.9 r560,t3 r640,t0 C r670.7,t0 r711,t22.5 r711,t87.1 L r711,b125 C r711,b160 r690,b190 r650,b201 C r636,b204.85 r615,b206.5 r600,b206.5 C r560,b206.5 r520,b206.8 r480,b206 C r450,b205.4 r420,b202.4 r380,b201.5 C r330,b200.6 l240,b201.2 l190,b202.2 C l150,b203 l110,b206.5 l62,b207.5 C l27.8,b207.5 l0,b187.4 l0,b162.5 Z',
      neon: 'M l24,b198.6 C l34,b203.6 l46,b206.6 l62,b207.3 C l95,b207 l118,b205 l140,b200.5 C l175,b193.5 l225,b188.8 l280,b188.8 C r335,b188.8 r370,b196.5 r410,b200 C r430,b202.6 r448,b204.2 r466,b205',
      above: 'M l24,b198.6 C l34,b203.6 l46,b206.6 l62,b207.3 C l95,b207 l118,b205 l140,b200.5 C l175,b193.5 l225,b188.8 l280,b188.8 C r335,b188.8 r370,b196.5 r410,b200 C r430,b202.6 r448,b204.2 r466,b205 L r770,b205 L r770,t-60 L l-60,t-60 L l-60,b198.6 Z',
      below: 'M l24,b198.6 C l34,b203.6 l46,b206.6 l62,b207.3 C l95,b207 l118,b205 l140,b200.5 C l175,b193.5 l225,b188.8 l280,b188.8 C r335,b188.8 r370,b196.5 r410,b200 C r430,b202.6 r448,b204.2 r466,b205 L r466,b240 L l24,b240 Z',
      edge: 'M r480,b206 C r450,b205.4 r420,b202.4 r380,b201.5 C r330,b200.6 l240,b201.2 l190,b202.2 C l150,b203 l110,b206.5 l62,b207.5',
    } },
    est: { w: 711, h: 200, g: {
      body: 'M l0,t62 C l0,t24 l26,t0 l72,t0 L r636,t0 C r684,t0 r711,t24 r711,t66 L r711,b146 C r711,b182 r688,b200 r646,b200 L l74,b200 C l28,b200 l0,b178 l0,b140 Z',
      sheet: 'M l0,b150 C l40,b168 l110,b182 l240,b188 C r400,b192 r560,b190 r711,b176',
    } },
    proj: { w: 715, h: 217, g: {
      body: 'M l0,t115 C l0,t45 l25,t20 l95,t20 L l264,t20 C r400,t20 r500,t8 r600,t5 C r660,t3 r714,t18 r714,t60 L r714,b100 C r714,b150 r650,b204 r560,b204 L l300,b206 C l200,b206 l140,b216 l100,b215 C l40,b215 l0,b197 l0,b167 Z',
      neon: 'M l60,b211 C l150,b215 l230,b208 l330,b206 C r420,b205 r470,b204 r540,b203',
    } },
    tools: { w: 713, h: 200, g: {
      body: 'M l0,t64 C l0,t24 l26,t0 l72,t0 L r640,t0 C r688,t0 r713,t26 r713,t66 L r713,b142 C r713,b180 r690,b200 r646,b200 L l72,b200 C l26,b200 l0,b178 l0,b138 Z',
      sheet: 'M l250,b200 C r460,b192 r600,b178 r713,b140',
    } },
    cta: { w: 724, h: 366, g: {
      body: 'M l0,t200 C l0,t110 l50,t44 l125,t44 L l369,t44 C r470,t44 r560,t30 r620,t12 C r650,t3 r672,t4 r690,t12 C r712,t22 r724,t46 r724,t80 L r724,b150 C r724,b260 r650,b345 r540,b362 L l200,b366 L l120,b366 C l60,b366 l0,b330 l0,b280 Z',
      wave: 'M l-20,b236 C l90,b250 l170,b320 l330,b350 C r470,b362 r560,b372 r640,b390 L r640,b420 L l-20,b420 Z',
      waveLine: 'M l0,b238 C l90,b250 l170,b320 l330,b350 C r470,b362 r560,b366 r620,b372',
    } },
  };
  const at = (a, v, size, ref) => (a === 'l' || a === 't') ? v : (a === 'r' || a === 'b') ? size - ref + v : v * size / ref;
  const geo = (tpl, W, H, rw, rh) => tpl.replace(/([lrp])(-?[\d.]+),([tbp])(-?[\d.]+)/g,
    (_, ax, x, ay, y) => at(ax, +x, W, rw).toFixed(2) + ',' + at(ay, +y, H, rh).toFixed(2));

  /* Lay one skin out for a W × H box given in reference units. */
  function layout(svg, key, W, H) {
    const s = SKINS[key];
    svg.setAttribute('viewBox', `0 0 ${W.toFixed(3)} ${H.toFixed(3)}`);
    svg.querySelectorAll('[data-g]').forEach(el => el.setAttribute('d', geo(s.g[el.dataset.g], W, H, s.w, s.h)));
    svg.querySelectorAll('[data-anchor]').forEach(el => {
      const a = el.dataset.anchor;
      el.setAttribute('transform', `translate(${a[0] === 'r' ? (W - s.w).toFixed(2) : 0} ${a[1] === 'b' ? (H - s.h).toFixed(2) : 0})`);
    });
  }

  function fit(card) {
    const svg = card.querySelector(':scope > .mt-skin'), key = card.dataset.skin, s = SKINS[key];
    const r = card.getBoundingClientRect(), u = parseFloat(getComputedStyle(card).getPropertyValue('--u'));
    if (!svg || !s || !(u > 0) || !r.width) return;
    layout(svg, key, Math.max(r.width / u, s.w), r.height / u); // height may be below the reference (desktop header) — anchors still hold
  }

  root.MetricaGeometry = { SKINS, geo, layout, fit };
  if (typeof module === 'object' && module.exports) module.exports = root.MetricaGeometry;
})(typeof window !== 'undefined' ? window : globalThis);
