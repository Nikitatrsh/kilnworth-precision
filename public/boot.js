// Runs in <head> before first paint so saved preferences never flash. An external file keeps the
// CSP free of 'unsafe-inline'. The js class comes first: the quote form is hidden without it.
var root = document.documentElement;
root.classList.add('js');
try {
  var unit = localStorage.getItem('kp-unit');
  if (unit === 'in' || unit === 'mm') root.dataset.unit = unit;
  if (localStorage.getItem('kp-demo-dismissed') === '1') root.dataset.demoDismissed = '';
} catch (e) {
  // localStorage can throw in private modes; defaults stay in place.
}
