/* Small, dependency-free fallbacks shared by both workspaces. */
(function () {
  var sequence = 0;
  window.PixelCompat = {
    id: function () {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
      sequence += 1;
      return 'local-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2);
    },
    copySettings: function (value) { return JSON.parse(JSON.stringify(value)); },
    mediaKind: function (file) {
      var type = file.type || '';
      if (/^(image|video|audio)\//.test(type)) return type.split('/')[0];
      var name = (file.name || '').toLowerCase();
      if (/\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(name)) return 'image';
      if (/\.(mp4|webm|mov|m4v|mkv|avi|3gp)$/.test(name)) return 'video';
      if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return 'audio';
      return '';
    }
  };
  if (!window.AudioContext && window.webkitAudioContext) window.AudioContext = window.webkitAudioContext;
  if (!Element.prototype.replaceChildren) Element.prototype.replaceChildren = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (var i = 0; i < arguments.length; i++) this.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
  };
  var dialogs = document.querySelectorAll('dialog');
  for (var i = 0; i < dialogs.length; i++) {
    if (typeof dialogs[i].showModal === 'function') continue;
    var dialog = dialogs[i];
    dialog.setAttribute('data-dialog-fallback', 'true');
    dialog.setAttribute('role', 'dialog');
    dialog.showModal = function () { this.setAttribute('open', ''); var button = this.querySelector('button'); if (button) button.focus(); };
    dialog.close = function () {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      var e = document.createEvent('Event'); e.initEvent('close', false, false); this.dispatchEvent(e);
      if (!window.HTMLDialogElement && typeof this.onclose === 'function') this.onclose(e);
    };
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelectorAll('dialog[data-dialog-fallback][open]');
    for (var i = 0; i < open.length; i++) open[i].close();
  });
})();
