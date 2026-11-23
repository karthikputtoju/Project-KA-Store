var q = new URLSearchParams(location.search);
document.getElementById('info').textContent = q.get('popup') ? 'This is the pop-up window.' : q.get('tab') ? 'This is tab number ' + q.get('tab') + '.' : 'Opened from a target="_blank" link.';
document.getElementById('closeBtn').onclick = function () { window.close(); };
