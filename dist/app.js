'use strict';
const $=id=>document.getElementById(id);let mode='image',files=[],results=[],busy=false,cancelled=false,stopVideo=null,batchController=null;
const copy={image:['图片批量输出','一份图片，多种可能','一次导入，同时输出多种尺寸和格式。让素材适合每一个画面。','支持 JPG、PNG、WebP 等浏览器可读取图片','批量导出'],video:['视频自动合成','原片到成片，一次完成','上传水印与尾版，批量合成，再同时导出多种格式。','支持浏览器可播放的 MP4、WebM、MOV 等视频','合成并批量导出'],rename:['批量命名','让每份素材，有名有序','统一文字、连续编号、查找替换。告别一个一个改名字。','支持图片、视频、文档等任意文件','生成命名副本']};
function size(n){return n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB'}
function safe(s){return s.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,180)||'未命名'}
function parts(name){const i=name.lastIndexOf('.');return i>0?[name.slice(0,i),name.slice(i)]:[name,'']}
function newName(f,i){let [base,ext]=parts(f.name);const kind=$('rename-mode').value;if(kind==='sequence')base=($('basename').value||'素材')+'_'+String((Number($('start').value)||0)+i).padStart(Number($('digits').value),'0');else if(kind==='replace'&&$('find').value)base=base.split($('find').value).join($('replacement').value);else if(kind==='affix')base=$('prefix').value+base+$('suffix').value;return safe(base)+ext}
function clearResults(){$('result-dialog').close();$('result-media').replaceChildren();results.forEach(r=>URL.revokeObjectURL(r.url));results=[];$('results').replaceChildren();$('result-panel').hidden=true}
function status(s,error=false){$('status').textContent=s;$('status').classList.toggle('error',error)}
function render(){const list=$('file-list');list.replaceChildren();files.forEach((f,i)=>{const row=document.createElement('div');row.className='file-row';const thumb=document.createElement(PixelCompat.mediaKind(f)==='image'?'img':'span');thumb.className='thumb';if(thumb.tagName==='IMG'){thumb.src=f.preview;thumb.alt='';}else thumb.textContent=PixelCompat.mediaKind(f)==='video'?'▷':'≡';const info=document.createElement('div');info.className='file-info';const name=document.createElement('strong');name.textContent=f.name;const meta=document.createElement('small');meta.textContent=mode==='rename'?'→ '+newName(f,i):size(f.size);info.append(name,meta);const remove=document.createElement('button');remove.className='text-button';remove.textContent='×';remove.setAttribute('aria-label','移除 '+f.name);remove.disabled=busy;remove.onclick=()=>{URL.revokeObjectURL(f.preview);files.splice(i,1);render()};row.append(thumb,info,remove);list.append(row)});$('count').textContent=files.length+' 个文件';$('empty').hidden=files.length>0;$('process').disabled=!files.length||busy;$('clear').disabled=busy;Studio.syncPreview(files,mode==='video');updateSummary();}
function addFiles(incoming){if(busy)return;let rejected=0;for(const f of incoming){if(mode!=='rename'&&PixelCompat.mediaKind(f)!==mode){rejected++;continue}f.preview=URL.createObjectURL(f);files.push(f)}render();status(rejected?rejected+' 个类型不符的文件已跳过':'已添加 '+files.length+' 个文件');$('picker').value=''}
$('picker').onchange=e=>addFiles(e.target.files);$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('drag')};$('drop').ondragleave=()=>$('drop').classList.remove('drag');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('drag');addFiles(e.dataTransfer.files)};
$('clear').onclick=()=>{files.forEach(f=>URL.revokeObjectURL(f.preview));files=[];clearResults();render();status('准备好后，开始处理')};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(busy)return;$('clear').click();mode=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b))});['image','video','rename'].forEach(m=>$(m+'-settings').hidden=m!==mode);const c=copy[mode];$('crumb').textContent=c[0];$('title').replaceChildren(document.createTextNode(c[1]),Object.assign(document.createElement('span'),{textContent:'。'}));$('subtitle').textContent=c[2];$('accept-note').textContent=c[3];$('process').textContent=c[4]+' ↗';$('picker').accept=mode==='rename'?'':mode+'/*';document.querySelector('.step-mark').innerHTML='0'+(['image','video','rename'].indexOf(mode)+1)+' <span>/ 03</span>';render()});
$('quality').oninput=()=>$('quality-label').textContent=$('quality').value+'%';$('rename-settings').oninput=()=>{['sequence','replace','affix'].forEach(k=>$(k+'-fields').hidden=$('rename-mode').value!==k);render()};
function result(blob,name,detail=''){const names=new Set(results.map(r=>r.name));let final=name,i=2;while(names.has(final)){const [b,e]=parts(name);final=b+'_'+i+++e}const r={blob,name:final,url:URL.createObjectURL(blob)};results.push(r);$('result-panel').hidden=false;$('result-count').textContent=results.length+' 个文件';const row=document.createElement('div');row.className='result-row';const info=document.createElement('div');info.className='file-info';const n=document.createElement('strong');n.textContent=final;const s=document.createElement('small');s.textContent=size(blob.size)+(detail?' · '+detail:'');info.append(n,s);const a=document.createElement('a');a.href=r.url;a.download=final;a.textContent='下载 ↓';const view=document.createElement('button');view.className='text-button';view.textContent='预览';view.onclick=()=>showResult(r);if(blob.type.startsWith('image/')||blob.type.startsWith('video/'))row.append(info,view,a);else row.append(info,a);$('results').append(row)}
function imageLoad(f){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('无法读取图片，请换用 JPG、PNG 或 WebP'));img.src=f.preview})}
function dimensions(){const sizes=[...document.querySelectorAll('[name=size]:checked')].map(x=>x.value.split(',').map(Number));if($('custom').checked)sizes.push([Number($('width').value),Number($('height').value)]);if(!sizes.length)throw Error('请至少选择一个输出尺寸');for(const [w,h]of sizes)if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>8192||h>8192||w*h>33554432)throw Error('尺寸需为 1–8192 的整数，单张不超过 3200 万像素');return [...new Map(sizes.map(s=>[s.join('x'),s])).values()]}
function imageFormats(){const values=[...document.querySelectorAll('[name="image-format"]:checked')].map(x=>x.value);if(!values.length)throw Error('请至少选择一种图片格式');return values}
async function convertImage(f,sizes,mimes){
  const img=await imageLoad(f);
  for(const [w,h]of sizes){
    for(const mime of mimes){
      if(cancelled)return;
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');
      if(mime==='image/jpeg'||!$('transparent').checked){ctx.fillStyle=$('bg').value;ctx.fillRect(0,0,w,h)}
      ctx.imageSmoothingQuality='high';let dw=w,dh=h;const fit=$('fit').value;
      if(fit!=='stretch'){const scale=fit==='cover'?Math.max(w/img.width,h/img.height):Math.min(w/img.width,h/img.height);dw=img.width*scale;dh=img.height*scale}
      ctx.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);
      const blob=await new Promise(r=>canvas.toBlob(r,mime,Number($('quality').value)/100));
      if(!blob)throw Error('图片导出失败，尝试较小尺寸');
      if(blob.type!==mime)throw Error('当前浏览器不支持 '+mime.split('/')[1]+' 编码，其他已完成结果可以下载');
      if(cancelled)return;
      const ext=blob.type.split('/')[1].replace('jpeg','jpg');result(blob,safe(parts(f.name)[0])+'_'+w+'x'+h+'.'+ext,w+' × '+h);
      canvas.width=canvas.height=1;
    }
  }
}
function updateSummary(){
  let count=0;
  if(mode==='image')count=files.length*([...document.querySelectorAll('[name=size]:checked')].length+($('custom').checked?1:0))*document.querySelectorAll('[name="image-format"]:checked').length;
  if(mode==='video')count=files.length*document.querySelectorAll('[name="video-format"]:checked').length;
  if(mode==='rename')count=files.length;
  $('job-summary').textContent=files.length?'预计生成 '+count+' 个文件'+(mode==='video'?' · 每条视频独立合成':''):'选择文件后显示导出数量';
}
function showResult(r){
  const media=document.createElement(r.blob.type.startsWith('video/')?'video':'img');media.src=r.url;
  if(media.tagName==='VIDEO'){media.controls=true;media.playsInline=true}else media.alt=r.name;
  $('result-media').replaceChildren(media);$('result-title').textContent=r.name;$('result-dialog').showModal();
}
$('close-result').onclick=()=>$('result-dialog').close();
$('result-dialog').addEventListener('close',()=>{$('result-media').querySelector('video')?.pause();$('result-media').replaceChildren()});
window.studioMessage=status;window.studioSummary=updateSummary;Studio.init();
$('image-settings').addEventListener('input',updateSummary);
$('cancel').onclick=()=>{cancelled=true;batchController?.abort(new DOMException('已取消处理','AbortError'));status('正在取消…')};
function lockControls(locked){
  document.querySelectorAll('.settings input,.settings select,.settings details button,nav button,#picker,.composition-preview button,.composition-preview select,.composition-preview input').forEach(e=>{e.disabled=locked||e.dataset.unsupported==='true'});
  if(!locked)Studio.updateAssetLabels();
}
$('process').onclick=async()=>{
  if(busy||!files.length)return;
  let sizes,mimes,config,videoFormats,audioContext;
  try{
    if(mode==='image'){sizes=dimensions();mimes=imageFormats()}
    if(mode==='rename'&&$('rename-mode').value==='replace'&&!$('find').value)throw Error('请填写要查找的文字');
    if(mode==='video'){
      config=Studio.validate();videoFormats=Studio.selectedFormats();
      if(!window.AudioContext||!HTMLCanvasElement.prototype.captureStream)throw Error('当前浏览器不支持视频合成');
      if(document.hidden)throw Error('请保持页面在前台再导出');
      // Unlock audio within this click before loading any files.
      audioContext=new AudioContext();
    }
  }catch(e){status(e.message,true);return}
  busy=true;cancelled=false;batchController=new AbortController();Studio.stopPreview();clearResults();
  $('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;lockControls(true);render();
  let errors=[];let wakeLock;
  try{
    if(audioContext){
      await Promise.race([audioContext.resume(),new Promise((_,reject)=>setTimeout(()=>reject(Error('音频初始化超时，请重试或更换浏览器')),8000))]);
      try{wakeLock=await navigator.wakeLock?.request('screen')}catch{}
    }
    const total=mode==='video'?files.length*videoFormats.length:files.length;let done=0;
    for(let i=0;i<files.length;i++){
      if(cancelled)break;
      status('正在处理 '+(i+1)+' / '+files.length+' · '+files[i].name);
      if(mode==='video'){
        for(const format of videoFormats){
          if(cancelled)break;
          try{
            const output=await Studio.compose(files[i],format,config,audioContext,batchController.signal,(fraction,note)=>{
              $('progress').value=(done+fraction)/total*100;
              status('任务 '+(done+1)+' / '+total+' · '+files[i].name+' · '+format.ext.toUpperCase()+' · '+note);
            });
            if(!cancelled){const diff=Math.round((1-output.blob.size/files[i].size)*100);result(output.blob,safe(parts(files[i].name)[0]+$('video-suffix').value)+'.'+format.ext,output.w+' × '+output.h+' · '+output.duration.toFixed(1)+' 秒 · '+(diff>=0?'比原片减少 '+diff+'%':'比原片增加 '+(-diff)+'%'))}
          }catch(e){if(!cancelled)errors.push(files[i].name+' ('+format.ext+')：'+e.message);if(document.hidden){cancelled=true;batchController.abort();break}}
          done++;$('progress').value=done/total*100;
        }
      }else{
        try{if(mode==='image')await convertImage(files[i],sizes,mimes);else result(files[i],newName(files[i],i))}catch(e){errors.push(files[i].name+'：'+e.message)}
        done++;$('progress').value=done/total*100;
      }
      await new Promise(r=>setTimeout(r,0));
    }
    status((cancelled?'已停止，保留已完成结果。':'处理完成，生成 '+results.length+' 个文件。')+(errors.length?' '+errors.join('；'):''),errors.length>0);
  }catch(e){status(e.message,true)}
  finally{
    if(audioContext)await audioContext.close();try{await wakeLock?.release()}catch{}
    busy=false;batchController=null;$('cancel').hidden=true;lockControls(false);render();
  }
};
// Standard ZIP store entries: preserves already-compressed media without recompression.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});function crc32(a){let c=0xffffffff;for(const x of a)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0}
async function zipFiles(items){if(items.length>65535)throw Error("单次打包不能超过 65535 个文件");let offset=0;const local=[],central=[];const enc=new TextEncoder();for(const item of items){const name=enc.encode(item.name),data=new Uint8Array(await item.blob.arrayBuffer()),crc=crc32(data);if(offset+data.length>0xffffffff)throw Error('打包内容超过 4 GB，请分别下载');const h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);local.push(h,data);const c=new Uint8Array(46+name.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=h.length+data.length}const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,items.length,true);ev.setUint16(10,items.length,true);ev.setUint32(12,central.reduce((s,a)=>s+a.length,0),true);ev.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/zip'})}
$('zip').onclick=async()=>{if(!results.length)return;$('zip').disabled=true;try{const snapshot=results.slice();const blob=await zipFiles(snapshot);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='像素工坊_'+mode+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){status(e.message,true)}finally{$('zip').disabled=false}};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});
