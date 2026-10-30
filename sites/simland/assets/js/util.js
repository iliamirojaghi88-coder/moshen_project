export const toFa = (value) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

// Document offset that ignores CSS transforms (unlike getBoundingClientRect).
export function docOffset(el) {
  let top = 0;
  let left = 0;
  for (let node = el; node; node = node.offsetParent) {
    top += node.offsetTop;
    left += node.offsetLeft;
  }
  return { top, left, width: el.offsetWidth, height: el.offsetHeight };
}
