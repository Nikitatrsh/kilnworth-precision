// Runs in <head> before first paint (blocking, under 1 KB) so saved preferences never flash.
// External file instead of an inline script keeps the CSP free of 'unsafe-inline'.
try {
  var root = document.documentElement;
  var unit = localStorage.getItem('kp-unit');
  if (unit === 'in' || unit === 'mm') root.dataset.unit = unit;
  if (localStorage.getItem('kp-demo-dismissed') === '1') root.dataset.demoDismissed = '';
  root.classList.add('js');
} catch (e) {
  // localStorage can throw in private modes; defaults stay in place.
}
