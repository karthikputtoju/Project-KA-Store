// Shared script for the practice iframes (external file because of the Content-Security-Policy)
document.getElementById('frameForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var name = document.getElementById('fname').value || '(empty)';
  var city = document.getElementById('fcity');
  var text = 'Frame "' + document.title + '" says: ' + name + (city ? ' from ' + city.value : '');
  document.getElementById('out').textContent = 'Submitted ✅ ' + name;
  window.top.postMessage({ from: 'ka-frame', text: text }, location.origin);
});
