/* Re-lays every card skin whenever its box changes size (layout breakpoints, font load, rotation). */
(() => {
  const G = window.MetricaGeometry;
  if (!G || !('ResizeObserver' in window)) return; // pre-filled reference geometry stays in place
  const ro = new ResizeObserver(entries => entries.forEach(e => G.fit(e.target)));
  document.querySelectorAll('[data-skin]').forEach(card => ro.observe(card));
})();
