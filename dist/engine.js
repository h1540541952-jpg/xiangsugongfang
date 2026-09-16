'use strict';
window.EditorEngine = (() => {
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const abort=signal=>{if(signal?.aborted)throw signal.reason||new DOMException('已取消','AbortError')};
  function parseSRT(text){
    const blocks=text.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);const cues=[];
    if(!text.trim())return cues;
    const stamp=s=>{const m=s.trim().match(/^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/);if(!m)throw Error('字幕时间格式无效：'+s);return Number(m[1])*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/1000};
    for(let i=0;i<blocks.length;i++){
      const lines=blocks[i].split('\n');if(/^\d+$/.test(lines[0].trim()))lines.shift();
      const pair=lines.shift()?.split(/\s*-->\s*/);if(!pair||pair.length!==2)throw Error('第 '+(i+1)+' 段缺少有效时间轴');
      const start=stamp(pair[0]),end=stamp(pair[1]);if(end<=start)throw Error('第 '+(i+1)+' 段结束时间需晚于开始时间');
      const body=lines.join('\n').replace(/<[^>]*>/g,'').trim();if(!body)throw Error('第 '+(i+1)+' 段字幕没有文字');cues.push({start,end,text:body});
    }
    return cues.sort((a,b)=>a.start-b.start);
  }
  function dimensions(sw,sh,ratio,res){
    if(ratio==='original')return Studio.outputSize(sw,sh,res);
    const [a,b]=ratio.split(':').map(Number);const short=res;
    return a>=b?[Math.round(short*a/b/2)*2,short]:[short,Math.round(short*b/a/2)*2];
  }
  function rectangle(sw,sh,w,h,fit,fx=.5,fy=.5){
    const k=fit==='cover'?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh),dw=sw*k,dh=sh*k;
    return{x:(w-dw)*(fit==='cover'?clamp(fx,0,1):.5),y:(h-dh)*(fit==='cover'?clamp(fy,0,1):.5),w:dw,h:dh};
  }
  function markRect(w,h,c,asset){
    const sw=asset?.image?.naturalWidth||Math.max(1,c['mark-text'].length)*24,sh=asset?.image?.naturalHeight||42;
    const scale=Math.min(w*c['mark-size']/100/sw,h*.8/sh),dw=sw*scale,dh=sh*scale;
    return{x:(w-dw)*c['mark-x']/100,y:(h-dh)*c['mark-y']/100,w:dw,h:dh};
  }
  function linesFor(ctx,text,width){
    const lines=[];for(const para of text.split('\n')){let line='';for(const char of para){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line=''}line+=char}lines.push(line)}return lines;
  }
  function draw(ctx,source,w,h,c,assets,segment,time,cues,cover=false){
    ctx.globalAlpha=1;ctx.fillStyle=c.background;ctx.fillRect(0,0,w,h);
    const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;
    const r=rectangle(sw,sh,w,h,segment.kind==='clip'?c.fit:'contain',segment.focusX,segment.focusY);
    ctx.drawImage(source,r.x,r.y,r.w,r.h);
    if((segment.kind==='clip'||c['mark-ends'])&&(assets.mark||c['mark-text'])){
      const m=markRect(w,h,c,assets.mark);ctx.save();ctx.globalAlpha=c['mark-alpha']/100;
      if(assets.mark)ctx.drawImage(assets.mark.image,m.x,m.y,m.w,m.h);
      else{ctx.font='600 '+m.h*.72+'px sans-serif';ctx.textBaseline='middle';ctx.fillStyle='#ffffff';ctx.shadowColor='#000';ctx.shadowBlur=w*.003;ctx.fillText(c['mark-text'],m.x,m.y+m.h/2,m.w)}ctx.restore();
    }
    const active=cues.filter(q=>time>=q.start+c['subtitle-offset']&&time<q.end+c['subtitle-offset']).map(q=>q.text).join('\n');
    if(active){
      ctx.save();const font=w*c['subtitle-size']/100;ctx.font='600 '+font+'px '+c['subtitle-font'];ctx.textAlign='center';ctx.textBaseline='middle';
      const lines=linesFor(ctx,active,w*.9).slice(0,8),height=font*1.4*lines.length,y=clamp(h*c['subtitle-y']/100-height/2,8,Math.max(8,h-height-8));
      if(c['subtitle-bg']){ctx.fillStyle='rgba(0,0,0,.58)';const max=Math.max(...lines.map(t=>ctx.measureText(t).width));ctx.fillRect((w-max)/2-font*.4,y-font*.2,max+font*.8,height+font*.4)}
      ctx.fillStyle=c['subtitle-color'];ctx.shadowColor='#000';ctx.shadowBlur=w*.002;lines.forEach((t,i)=>ctx.fillText(t,w/2,y+font*.7+i*font*1.4));ctx.restore();
    }
    if(cover&&c['cover-title']){
      ctx.save();ctx.font='750 '+w*c['cover-size']/100+'px sans-serif';ctx.fillStyle=c['cover-color'];ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#000';ctx.shadowBlur=w*.01;
      const lines=linesFor(ctx,c['cover-title'],w*.86).slice(0,5),lh=w*c['cover-size']/100*1.3;lines.forEach((t,i)=>ctx.fillText(t,w/2,h/2+(i-(lines.length-1)/2)*lh));ctx.restore();
    }
  }
  function segments(clips,c,assets){
    const out=[];
    for(const kind of ['intro','clip','outro']){
      if(kind==='clip'){for(const clip of clips){if(!(clip.end>clip.start)||clip.start<0||clip.end>clip.duration+.01)throw Error(clip.file.name+' 的裁剪区间无效');out.push({...clip,kind:'clip',seconds:clip.end-clip.start})}}
      else if(assets[kind]){const a=assets[kind];out.push({...a,kind,start:0,seconds:a.isVideo?a.duration:c[kind+'-duration'],focusX:.5,focusY:.5})}
    }
    return out;
  }
  function seek(video,time,signal){
    if(Math.abs(video.currentTime-time)<.005)return Promise.resolve();
    return new Promise((resolve,reject)=>{abort(signal);const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',ready);video.removeEventListener('error',failed);signal?.removeEventListener('abort',cancel)};
      const ready=()=>{cleanup();resolve()},failed=()=>{cleanup();reject(Error('视频定位失败'))},cancel=()=>{cleanup();reject(signal.reason)};
      const timer=setTimeout(failed,10000);video.addEventListener('seeked',ready,{once:true});video.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',cancel,{once:true});video.currentTime=time;
    });
  }
  function envelope(t,total,c){return Math.max(0,Math.min(1,c['fade-in']>0?t/c['fade-in']:1,c['fade-out']>0?(total-t)/c['fade-out']:1))*c['music-volume']/100}
  async function compose(job,audioContext,externalSignal,onProgress){
    abort(externalSignal);const localAbort=new AbortController(),signal=localAbort.signal;const relay=()=>localAbort.abort(externalSignal.reason);externalSignal.addEventListener("abort",relay,{once:true});const {config:c,assets,cues}=job,seq=segments(job.clips,c,assets),total=seq.reduce((s,x)=>s+x.seconds,0);
    if(!seq.length)throw Error('请先添加视频');const [w,h]=dimensions(job.clips[0].width,job.clips[0].height,job.ratio,c.resolution);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
    let rec,video,source,gain,musicSource,musicGain,raf,timer,stopped=false,offset=0,bytes=0,rejectRecorder;
    const dest=audioContext.createMediaStreamDestination(),stream=canvas.captureStream(c.fps);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
    let musicBuffer;
    try{
      if(assets.music){musicBuffer=await audioContext.decodeAudioData(await assets.music.file.arrayBuffer());abort(signal);if(c['music-offset']>=musicBuffer.duration)throw Error('背景音乐起始位置超过音频时长')}
      const chunks=[];rec=new MediaRecorder(stream,{mimeType:job.format.mime,videoBitsPerSecond:c.bitrate,audioBitsPerSecond:128000});
      const recorded=new Promise((resolve,reject)=>{rejectRecorder=reject;rec.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size}if(bytes>1073741824)localAbort.abort(Error('单任务成片超过 1 GB，请降低码率或缩短片段'))};rec.onstop=()=>{stopped=true;resolve(new Blob(chunks,{type:rec.mimeType}))};rec.onerror=()=>localAbort.abort(Error('编码失败，请尝试较低分辨率或另一格式'))});recorded.catch(()=>{});
      const cancel=()=>rejectRecorder(signal.reason||new DOMException('已取消','AbortError'));
      const hidden=()=>{if(document.hidden)localAbort.abort(Error('页面切至后台，当前任务已停止。保持前台后可重试'))};
      signal.addEventListener('abort',cancel,{once:true});document.addEventListener('visibilitychange',hidden);
      const cleanupSegment=()=>{clearInterval(timer);cancelAnimationFrame(raf);try{musicSource?.stop()}catch{}musicSource?.disconnect();musicGain?.disconnect();source?.disconnect();gain?.disconnect();Studio.releaseVideo(video);video=source=gain=musicSource=musicGain=null};
      async function run(){
        try{
          for(const segment of seq){
            abort(signal);if(document.hidden)throw Error('请保持页面前台再导出');
            const isVideo=segment.kind==='clip'||segment.isVideo;
            if(isVideo){video=await Studio.loadVideo(segment.url,signal);await seek(video,segment.start,signal);source=audioContext.createMediaElementSource(video);gain=audioContext.createGain();gain.gain.value=(segment.kind==='clip'||c['ends-audio'])?c['original-volume']/100:0;source.connect(gain);gain.connect(dest)}
            abort(signal);const visual=video||segment.image;draw(ctx,visual,w,h,c,assets,segment,offset,cues);
            if(rec.state==='inactive')rec.start(500);else rec.resume();
            if(musicBuffer){
              const raw=c['music-offset']+offset;
              if(c['music-loop']||raw<musicBuffer.duration){
                musicSource=audioContext.createBufferSource();musicSource.buffer=musicBuffer;musicSource.loop=c['music-loop'];musicGain=audioContext.createGain();const now=audioContext.currentTime;
                musicGain.gain.setValueAtTime(envelope(offset,total,c),now);
                const points=[c['fade-in'],Math.max(0,total-c['fade-out']),offset+segment.seconds].filter(t=>t>offset&&t<=offset+segment.seconds).sort((a,b)=>a-b);
                for(const t of points)musicGain.gain.linearRampToValueAtTime(envelope(t,total,c),now+t-offset);
                musicSource.connect(musicGain);musicGain.connect(dest);musicSource.start(0,c['music-loop']?raw%musicBuffer.duration:raw);
              }
            }
            let resolveEnd,rejectEnd;const ended=new Promise((resolve,reject)=>{resolveEnd=resolve;rejectEnd=reject});let begin=performance.now(),lastAdvance=begin,last=0;
            const elapsed=()=>video?Math.max(0,video.currentTime-segment.start):(performance.now()-begin)/1000;
            const paint=()=>{try{draw(ctx,visual,w,h,c,assets,segment,offset+Math.min(elapsed(),segment.seconds),cues);raf=requestAnimationFrame(paint)}catch(e){rejectEnd(e)}};
            if(video){video.onended=resolveEnd;video.onerror=()=>rejectEnd(Error('片段播放失败'));await Promise.race([video.play(),recorded])}begin=performance.now();paint();
            timer=setInterval(()=>{const t=elapsed();onProgress(Math.min(1,(offset+t)/total),segment.kind==='clip'?'合成片段':'合成'+(segment.kind==='intro'?'片头':'尾版'));if(t>=segment.seconds-.01)resolveEnd();if(video){if(t>last+.005){last=t;lastAdvance=performance.now()}else if(performance.now()-lastAdvance>20000)rejectEnd(Error('视频播放停滞，请检查源文件'))}},30);
            try{await Promise.race([ended,recorded])}finally{if(rec.state==='recording')rec.pause();cleanupSegment()}
            offset+=segment.seconds;
          }
          rec.stop();return await recorded;
        }finally{cleanupSegment()}
      }
      try{const blob=await Promise.race([run(),recorded]);abort(signal);if(!blob.size||!blob.type.startsWith('video/'+job.format.ext))throw Error('输出格式校验失败');return{blob,w,h,total}}
      finally{signal.removeEventListener('abort',cancel);document.removeEventListener('visibilitychange',hidden);cleanupSegment()}
    }finally{
      externalSignal.removeEventListener("abort",relay);clearInterval(timer);cancelAnimationFrame(raf);if(rec&&!stopped&&rec.state!=='inactive')rec.stop();stream.getTracks().forEach(t=>t.stop());dest.stream.getTracks().forEach(t=>t.stop());Studio.releaseVideo(video);
    }
  }
  return{parseSRT,dimensions,rectangle,markRect,draw,segments,seek,envelope,compose};
})();
