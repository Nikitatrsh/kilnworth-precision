// Runs in <head> before first paint (blocking, under 1 KB) so saved preferences never flash.
// External file instead of an inline script keeps the CSP free of 'unsafe-inline'.
var root = document.documentElement;
// First, outside try: the quote form is hidden without this class, so it must be set even when storage is blocked.
root.classList.add('js');
try {
  var unit = localStorage.getItem('kp-unit');
  if (unit === 'in' || unit === 'mm') root.dataset.unit = unit;
  if (localStorage.getItem('kp-demo-dismissed') === '1') root.dataset.demoDismissed = '';
} catch (e) {
  // localStorage can throw in private modes; defaults stay in place.
}
