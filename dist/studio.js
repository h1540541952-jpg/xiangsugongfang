'use strict';
window.Studio = (() => {
  const el = id => document.getElementById(id);
  const assets = { watermark: null, outro: null };
  let assetLoads = 0, preview = null, previewId = 0, previewFrame = 0, showingTail = false;
  const abortError = () => new DOMException('已取消处理', 'AbortError');
  function check(signal) { if (signal?.aborted) throw signal.reason || abortError(); }
  function finite(value, min, max, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw Error(label + '需在 ' + min + '–' + max + ' 之间');
    return n;
  }
  function fitRect(sw, sh, w, h, fit = 'contain') {
    const k = fit === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    return { x: (w - sw * k) / 2, y: (h - sh * k) / 2, w: sw * k, h: sh * k };
  }
  function outputSize(w, h, cap) {
    const k = cap ? Math.min(1, cap / Math.min(w, h)) : 1;
    return [Math.max(2, Math.round(w * k / 2) * 2), Math.max(2, Math.round(h * k / 2) * 2)];
  }
  function watermarkRect(sw, sh, w, h, c) {
    const margin = Math.min(w, h) * c.margin / 100;
    const scale = Math.min(w * c.scale / 100 / sw, (h - 2 * margin) * 0.8 / sh);
    const dw = sw * scale, dh = sh * scale;
    let x = c.position.includes('l') ? margin : w - margin - dw;
    let y = c.position.startsWith('t') ? margin : h - margin - dh;
    if (c.position === 'center') { x = (w - dw) / 2; y = (h - dh) / 2; }
    return { x, y, w: dw, h: dh };
  }
  function settings() {
    return {
      cap: Number(el('resolution').value), bitrate: Number(el('bitrate').value), fps: Number(el('fps').value),
      audio: el('keep-audio').checked, outroAudio: el('outro-audio').checked,
      duration: finite(el('outro-duration').value, 0.5, 60, '图片尾版时长'),
      bg: el('video-bg').value, fit: el('outro-fit').value, watermark: assets.watermark,
      outro: assets.outro, text: el('watermark-text').value.trim(), position: el('watermark-position').value,
      margin: finite(el('watermark-margin').value, 0, 20, '水印边距'),
      scale: Number(el('watermark-scale').value), opacity: Number(el('watermark-opacity').value) / 100,
      markTail: el('watermark-on-outro').checked
    };
  }
  function draw(ctx, source, w, h, c, tail = false) {
    ctx.globalAlpha = 1; ctx.fillStyle = c.bg; ctx.fillRect(0, 0, w, h);
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    if (sw && sh) {
      const r = fitRect(sw, sh, w, h, tail ? c.fit : 'contain');
      ctx.drawImage(source, r.x, r.y, r.w, r.h);
    }
    if (tail && !c.markTail) return;
    ctx.save(); ctx.globalAlpha = c.opacity;
    if (c.watermark) {
      const image = c.watermark.image;
      const r = watermarkRect(image.naturalWidth, image.naturalHeight, w, h, c);
      ctx.drawImage(image, r.x, r.y, r.w, r.h);
    } else if (c.text) {
      const fontSize = Math.max(12, w * 0.045);
      ctx.font = '600 ' + fontSize + 'px system-ui, sans-serif';
      const textWidth = ctx.measureText(c.text).width;
      const r = watermarkRect(textWidth, fontSize * 1.5, w, h, c);
      ctx.font = '600 ' + fontSize * r.w / textWidth + 'px system-ui, sans-serif';
      ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = Math.max(2, w / 240);
      ctx.fillText(c.text, r.x, r.y + r.h / 2);
    }
    ctx.restore();
  }
  function releaseVideo(v) { if (!v) return; v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
  function loadVideo(url, signal, muted = false) {
    return new Promise((resolve, reject) => {
      check(signal);
      const v = document.createElement('video');
      v.playsInline = true; v.preload = 'auto'; v.muted = muted;
      v.style.cssText = 'position:fixed;width:2px;height:2px;left:0;bottom:0;pointer-events:none;opacity:.01';
      v.setAttribute('aria-hidden', 'true'); document.body.append(v);
      const clean = () => { clearTimeout(timer); v.onloadeddata = null; v.onerror = null; signal?.removeEventListener('abort', aborted); };
      const fail = error => { clean(); releaseVideo(v); reject(error); };
      const aborted = () => fail(signal.reason || abortError());
      const timer = setTimeout(() => fail(Error('视频读取超时，请使用较小的兼容视频')), 20000);
      v.onloadeddata = () => {
        if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.videoWidth) return fail(Error('无法读取视频时长或画面'));
        clean(); resolve(v);
      };
      v.onerror = () => fail(Error('无法播放这个视频，请换用浏览器兼容的 MP4 / WebM'));
      signal?.addEventListener('abort', aborted, { once: true }); v.src = url;
    });
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const timeout = setTimeout(() => reject(Error('图片读取超时')), 15000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(Error('无法读取图片，请使用 PNG、JPG 或 WebP')); }; img.src = url;
    });
  }
  const versions = {watermark: 0, outro: 0};
  async function setAsset(kind, file) {
    const version = ++versions[kind];
    if (!file) { if (assets[kind]) URL.revokeObjectURL(assets[kind].url); assets[kind] = null; updateAssetLabels(); await updatePreview(); return; }
    const url = URL.createObjectURL(file); assetLoads++;
    try {
      const isVideo = PixelCompat.mediaKind(file)==='video';
      if ((kind === 'watermark' && isVideo) || (!isVideo && PixelCompat.mediaKind(file)!=='image')) throw Error('请选择有效图片或视频');
      const next = { file, url, isVideo };
      if (isVideo) { const v = await loadVideo(url, undefined, true); next.duration = v.duration; releaseVideo(v); }
      else next.image = await loadImage(url);
      if (versions[kind] !== version) { URL.revokeObjectURL(url); return; }
      if (assets[kind]) URL.revokeObjectURL(assets[kind].url);
      assets[kind] = next; updateAssetLabels(); await updatePreview();
    } catch (e) { URL.revokeObjectURL(url); window.studioMessage?.(e.message, true); }
    finally { assetLoads--; window.studioSummary?.(); }
  }
  function updateAssetLabels() {
    el('watermark-name').textContent = assets.watermark?.file.name || '建议使用透明 PNG；有图片时优先使用图片';
    el('outro-name').textContent = assets.outro ? assets.outro.file.name + (assets.outro.isVideo ? ' · ' + assets.outro.duration.toFixed(1) + ' 秒' : '') : '将同一尾版追加到每条视频后';
    el('timeline-outro').textContent = assets.outro ? (assets.outro.isVideo ? '视频尾版' : '图片尾版 · ' + el('outro-duration').value + ' 秒') : '无尾版';
    el('preview-tail').disabled = !assets.outro;
    el('watermark-text').disabled = !!assets.watermark;
  }
  function formats() {
    const has = mime => !!window.MediaRecorder && MediaRecorder.isTypeSupported(mime);
    return [
      { label: 'MP4', mime: ['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/mp4'].find(has) || '', ext: 'mp4' },
      { label: 'WebM', mime: ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(has) || '', ext: 'webm' }
    ];
  }
  function renderFormats() {
    el('video-formats').replaceChildren();
    formats().forEach((f, i, all) => {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.name = 'video-format'; input.value = f.mime; input.dataset.ext = f.ext;
      input.dataset.unsupported = String(!f.mime); input.disabled = !f.mime;
      input.checked = !!f.mime && (i === 0 || !all[0].mime);
      label.append(input, document.createTextNode(f.label + (!f.mime ? ' · 不支持' : ''))); el('video-formats').append(label);
    });
    el('format-support').textContent = '只启用当前浏览器支持的格式。MP4 / WebM 可同时输出；不支持的格式请更换浏览器。此版本不导出 MOV / AVI。';
  }
  function selectedFormats() {
    const values = [...document.querySelectorAll('[name="video-format"]:checked')].map(x => ({mime: x.value, ext: x.dataset.ext}));
    if (!values.length) throw Error('请至少选择一种可用的视频输出格式'); return values;
  }
  function validate() { if (assetLoads) throw Error('水印或尾版仍在读取，请稍等'); selectedFormats(); return settings(); }
  function stopPreview() { cancelAnimationFrame(previewFrame); if (preview?.video) preview.video.pause(); el('preview-play').textContent = '播放'; }
  function previewDraw() {
    if (!preview) return;
    cancelAnimationFrame(previewFrame);
    try {
      const c = settings(), canvas = el('preview-canvas');
      draw(canvas.getContext('2d'), preview.source, canvas.width, canvas.height, c, preview.tail);
      if (preview.video) { el('preview-seek').value = preview.video.currentTime / preview.video.duration * 100; el('preview-time').textContent = time(preview.video.currentTime) + ' / ' + time(preview.video.duration); }
    } catch (e) { el('preview-note').textContent = e.message; }
    if (preview?.video && !preview.video.paused) previewFrame = requestAnimationFrame(previewDraw);
  }
  function time(n) { return Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0'); }
  async function updatePreview() {
    const id = ++previewId; stopPreview(); if (preview?.video) releaseVideo(preview.video); preview = null;
    const picker = el('preview-source'); const url = picker.value;
    el('preview-empty').hidden = false;
    if (!url || el('composition-preview').hidden) return;
    let v;
    try {
      const base = await loadVideo(url, undefined, true);
      if (id !== previewId) { releaseVideo(base); return; }
      const [w,h] = outputSize(base.videoWidth, base.videoHeight, Number(el('resolution').value));
      const canvas = el('preview-canvas'), k = Math.min(1, 960 / w, 720 / h);
      canvas.width = Math.max(2, Math.round(w * k)); canvas.height = Math.max(2, Math.round(h * k));
      let source = base, tail = showingTail && !!assets.outro;
      if (tail) {
        releaseVideo(base);
        if (assets.outro.isVideo) { v = await loadVideo(assets.outro.url, undefined, true); source = v; }
        else source = assets.outro.image;
      } else v = base;
      if (id !== previewId) { releaseVideo(v); return; }
      preview = { source, video: v, tail }; el('preview-empty').hidden = true;
      el('preview-tail').textContent = tail ? '返回原片' : '查看尾版';
      el('preview-play').disabled = !v; el('preview-seek').disabled = !v;
      if (v) v.onended = () => { el('preview-play').textContent = '播放'; previewDraw(); };
      else { el('preview-time').textContent = el('outro-duration').value + ' 秒'; el('preview-seek').value = 0; }
      el('preview-note').textContent = '预览静音 · 导出 ' + w + ' × ' + h + '。水印位置与导出一致。'; previewDraw();
    } catch (e) { releaseVideo(v); if (id === previewId) el('preview-note').textContent = e.message; }
  }
  function syncPreview(files, active) {
    el('composition-preview').hidden = !active || !files.length;
    const picker = el('preview-source'), old = picker.value;
    picker.replaceChildren(); files.forEach(f => picker.add(new Option(f.name, f.preview)));
    if (files.some(f => f.preview === old)) picker.value = old;
    if (!active || !files.length) { ++previewId; stopPreview(); if (preview?.video) releaseVideo(preview.video); preview = null; }
    else if (old !== picker.value || !preview) updatePreview();
  }
  async function compose(file, format, c, audioContext, signal, progress) {
    check(signal); let main, tail, stream, recorder, frame, activeVideo, failEncoding;
    const nodes = []; let stopped = false;
    try {
      main = await loadVideo(file.preview, signal); check(signal);
      if (c.outro?.isVideo) tail = await loadVideo(c.outro.url, signal);
      check(signal);
      const [w,h] = outputSize(main.videoWidth, main.videoHeight, c.cap);
      if (w*h > 16777216) throw Error('视频画面过大，请选择 1080p 或更低分辨率');
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d'); draw(ctx, main, w, h, c);
      stream = canvas.captureStream(c.fps);
      const dest = audioContext.createMediaStreamDestination();
      for (const [video, keep] of [[main,c.audio],[tail,c.outroAudio]]) {
        if (!video) continue;
        const source = audioContext.createMediaElementSource(video); nodes.push(source);
        if (keep) source.connect(dest);
      }
      if (c.audio || (tail && c.outroAudio)) dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: c.bitrate, audioBitsPerSecond: 128000 });
      const chunks = []; let bytes = 0;
      const finished = new Promise((resolve, reject) => {
        failEncoding = reject;
        recorder.ondataavailable = e => {
          if (e.data.size) { chunks.push(e.data); bytes += e.data.size; }
          if (bytes > 1073741824) reject(Error('单个成片超过 1 GB，请调低码率或缩短视频'));
        };
        recorder.onstop = () => { stopped = true; resolve(new Blob(chunks, {type: recorder.mimeType})); };
        recorder.onerror = () => reject(Error('编码失败，请尝试另一格式或较低分辨率'));
      });
      // Attach immediately; an encoder failure must not become an unhandled rejection.
      finished.catch(() => {});
      const aborted = () => failEncoding(signal.reason || abortError());
      signal.addEventListener('abort', aborted, {once:true});
      const hidden = () => { if (document.hidden) failEncoding(Error('页面已切到后台，已停止当前导出。请保持前台后重新处理')); };
      document.addEventListener('visibilitychange', hidden);
      const tailDuration = c.outro ? (tail ? tail.duration : c.duration) : 0;
      const duration = main.duration + tailDuration;
      async function segment(source, seconds, isTail, offset) {
        check(signal); activeVideo = source instanceof HTMLVideoElement ? source : null;
        let timer, resolveEnd, rejectEnd, lastTime = 0, lastAdvance = performance.now();
        const segmentEnded = new Promise((resolve, reject) => { resolveEnd = resolve; rejectEnd = reject; });
        const started = performance.now();
        const paint = () => { draw(ctx, source, w, h, c, isTail); frame = requestAnimationFrame(paint); };
        try {
          if (activeVideo) {
            activeVideo.onended = () => resolveEnd(); activeVideo.onerror = () => rejectEnd(Error('片段播放失败'));
          }
          paint();
          if (activeVideo) await Promise.race([activeVideo.play(), finished]);
          timer = setInterval(() => {
            const elapsed = activeVideo ? activeVideo.currentTime : (performance.now() - started) / 1000;
            progress(Math.min(1, (offset + elapsed) / duration), (isTail ? '合成尾版' : '合成原片') + ' · ' + time(offset + elapsed) + ' / ' + time(duration));
            if (!activeVideo && elapsed >= seconds) resolveEnd();
            if (activeVideo) {
              if (elapsed > lastTime + 0.01) { lastAdvance = performance.now(); lastTime = elapsed; }
              else if (performance.now() - lastAdvance > 20000) rejectEnd(Error('视频播放停滞，请使用兼容的视频文件'));
            }
          }, 100);
          await Promise.race([segmentEnded, finished]);
        } finally { clearInterval(timer); cancelAnimationFrame(frame); activeVideo?.pause(); if (activeVideo) { activeVideo.onended = null; activeVideo.onerror = null; } }
      }
      try {
        if (document.hidden) throw Error("请保持页面前台再导出");
        recorder.start(500);
        // The recorder stays continuous over both segments, retaining the tail audio.
        const run = async () => {
          await segment(main, main.duration, false, 0);
          if (c.outro) await segment(tail || c.outro.image, tailDuration, true, main.duration);
          if (recorder.state !== 'inactive') recorder.stop();
          return await finished;
        };
        const blob = await Promise.race([run(), finished]);
        check(signal);
        if (!blob.size) throw Error('没有生成视频内容');
        if (!blob.type.startsWith('video/' + format.ext)) throw Error('浏览器未按所选格式导出，请更换格式');
        return {blob,w,h,duration};
      } finally { signal.removeEventListener('abort', aborted); document.removeEventListener('visibilitychange', hidden); }
    } finally {
      cancelAnimationFrame(frame); activeVideo?.pause();
      if (recorder && !stopped && recorder.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach(t => t.stop()); nodes.forEach(n => n.disconnect()); releaseVideo(main); releaseVideo(tail);
    }
  }
  function init() {
    renderFormats(); updateAssetLabels();
    for (const kind of ['watermark','outro']) {
      el(kind+'-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) setAsset(kind,f); };
      el(kind+'-clear').onclick = () => setAsset(kind,null);
    }
    el('preview-source').onchange = () => { showingTail = false; updatePreview(); };
    el('preview-tail').onclick = () => { showingTail = !showingTail; updatePreview(); };
    el('preview-play').onclick = async () => {
      const v = preview?.video; if (!v) return;
      try { if (v.paused) { if (v.ended) v.currentTime = 0; await v.play(); el('preview-play').textContent = '暂停'; previewDraw(); } else stopPreview(); }
      catch (e) { el('preview-note').textContent = e.message; }
    };
    el('preview-seek').oninput = () => { if (preview?.video) { preview.video.currentTime = Number(el('preview-seek').value) / 100 * preview.video.duration; preview.video.onseeked = previewDraw; } };
    el('video-settings').addEventListener('input', e => {
      for (const key of ['scale','opacity']) el('watermark-'+key+'-label').textContent = el('watermark-'+key).value+'%';
      updateAssetLabels();
      if (e.target.id === 'resolution') updatePreview(); else previewDraw();
      window.studioSummary?.();
    });
  }
  return { loadVideo, loadImage, releaseVideo, init, formats, selectedFormats, settings, validate, compose, syncPreview, stopPreview, fitRect, outputSize, watermarkRect, draw, loading: () => assetLoads, updateAssetLabels };
})();
