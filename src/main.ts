import './styles.css';
type ApiResponse<T=any>={data:T};
const API_BASE=(import.meta.env.VITE_API_BASE||'https://coal-ai-api-staging.onrender.com').replace(/\/$/,'');
const request=async<T=any>(path:string,init:RequestInit={}):Promise<ApiResponse<T>>=>{const res=await fetch(API_BASE+path,{...init,headers:{'Content-Type':'application/json',...(init.headers||{})},credentials:'include'});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data?.message||('HTTP '+res.status));return {data};};
const api={get:<T=any>(path:string)=>request<T>(path),post:<T=any>(path:string,body:any)=>request<T>(path,{method:'POST',body:JSON.stringify(body)}),delete:<T=any>(path:string)=>request<T>(path,{method:'DELETE'})};
type SessionUser={authorized:boolean;userId?:string;email?:string;name?:string;role?:'admin'|'dispatcher'|'mechanic'};
let sessionCache:SessionUser|null=null;
const loadSession=async(force=false):Promise<SessionUser>=>{if(sessionCache&&!force)return sessionCache;try{sessionCache=(await request<SessionUser>('/api/me')).data;return sessionCache;}catch{sessionCache={authorized:false};return sessionCache;}};
const auth={
 isSignedIn:async()=>Boolean((await loadSession()).authorized),
 signIn:async(_opts?:any)=>{location.href=API_BASE+'/api/auth/google?returnTo='+encodeURIComponent(location.href);},
 signOut:async()=>{await request('/api/auth/logout',{method:'POST'}).catch(()=>undefined);sessionCache={authorized:false};},
 getUser:async()=>{const u=await loadSession();return u.authorized?u:null;}
};
const invitesClient={getPendingCode:()=>new URLSearchParams(location.search).get('invite'),clearPendingCode:()=>{const u=new URL(location.href);u.searchParams.delete('invite');history.replaceState({},'',u);},buildJoinUrl:(code:string,{path='/' }:{path?:string}={})=>location.origin+path+'?invite='+encodeURIComponent(code)};


type Dash = {
  vehicles: number;
  active: number;
  repair: number;
  idle: number;
  trips: number;
  tons: number;
  fuel: number;
  alerts: Array<{ level: string; text: string }>;
  dataMode?: string;
  fleet: Array<{
    plate: string;
    driver: string;
    status: string;
    trips: number;
    tons: number;
    fuel: number;
  }>;
};
const app = document.querySelector<HTMLDivElement>('#app')!;
type Role = 'admin' | 'dispatcher' | 'mechanic';
let currentRole: Role = 'dispatcher';
let guestMode = false;
let siilenRecognition: any = null;
let siilenWakeMode = false;
let siilenAwake = false;
let siilenBusy = false;
let siilenQuestionParts: string[] = [];
let siilenQuestionTimer: number | null = null;
let siilenRestartTimer: number | null = null;
const roleName: Record<Role,string> = { admin:'Админ', dispatcher:'Диспетчер', mechanic:'Засварчин' };
type AccessRecord = { userId:string; email:string; name:string; role?:Role; count:number; firstAccess:string; lastAccess:string; status:'allowed'|'blocked'; reason?:string };
type UserDataSummary = { userId:string; email:string; name:string; role?:Role; status:'allowed'|'blocked'; lastAccess:string; accessCount:number; dataMode:'registered'|'demo'; total:number; counts:{vehicles:number;trips:number;fuel:number;maintenance:number;tires:number;documents:number;drivers:number} }; 
const accessTime = (value:string) => value ? new Date(value).toLocaleString('mn-MN') : '—';
const navItems = [{ label: '▦ Хяналтын самбар', view: 'dashboard' }, { label: '✦ AI Өдрийн илтгэл', view: 'dailybrief' }, { label: '◫ Машин', view: 'vehicles' }, { label: '⇄ Рейс', view: 'trips' }, { label: '◉ Түлш', view: 'fuel' }, { label: '⌁ Засвар', view: 'maintenance' }, { label: '◉ Дугуй', view: 'tires' }, { label: '◉ Жолооч', view: 'drivers' }, { label: '▤ Бичиг баримт', view: 'documents' }, { label: '▤ Тайлан', view: 'reports' }];
app.innerHTML = `<aside><div class='brand'><div class='logoMark'>C</div><div class='brandText'><b>COAL AI</b><small>Smart Fleet Command</small></div><button id='mobileMenu' class='mobileMenu' aria-label='Цэс нээх' aria-expanded='false'>☰</button></div><div class='sideLabel'>ҮНДСЭН УДИРДЛАГА</div><nav>${navItems.map((x, i) => `<button class='nav ${i === 0 ? 'active' : ''}' data-view='${x.view}'>${x.label}</button>`).join('')}</nav><div class='aiMini'><div class='aiOrb'>✦</div><div><b>AI диспетчер</b><small>Өгөгдөл дээр тулгуурласан туслах</small></div></div><div class='sideFooter'><span class='statusDot'></span><span>Систем хэвийн</span><small>v1.1</small></div></aside><main><header><div><div class='eyebrow'>COMMAND CENTER · 2026</div><h1>Өнөөдрийн үйл ажиллагаа</h1><p>Флот, рейс, түлш, засварын нэгдсэн хяналт</p></div><div class='headerActions'><div id='userRole' class='roleBadge'>Нэвтрээгүй</div><button id='signOut' class='authBtn'>Гарах</button><div class='live'><i></i> LIVE</div><button class='iconBtn' aria-label='Мэдэгдэл'>⌁</button></div></header><section class='overviewHero'><div><span class='heroTag'>AI OPERATIONS</span><h2>Тээврийн бүх урсгалыг нэг дэлгэцээс</h2><p>Өнөөдрийн тээвэр, машин ашиглалт, түлш ба эрсдэлийг AI нэгтгэн харуулна.</p><div class='heroMeta'><span>● GPS холболт: Demo</span><span>● Өгөгдөл: Шинэчлэгдсэн</span></div></div><div class='routeGraphic'><div class='terrain'></div><div class='routeLine'></div><div class='routeNode mine'><b>01</b><span>Уурхай</span></div><div class='routeNode check'><b>02</b><span>Шалган</span></div><div class='routeNode yard'><b>03</b><span>Буулгалт</span></div><div class='truckPin'>🚛</div></div></section><section class='dispatcherGrid'><div class='mapPanel'><div class='panelHead'><div><small>GPS DISPATCH MAP</small><h2>Флотын байршил ба рейсийн маршрут</h2></div><span class='demoPill'>Demo GPS · бодит байршил биш</span></div><div id='gpsMap' class='gpsMap'><div class='mapLoading'>Байршлын дүрслэл бэлтгэж байна...</div></div></div><div class='fuelPanel'><div class='panelHead'><div><small>FUEL ANALYTICS</small><h2>Түлшний 7 хоногийн хандлага</h2></div><span class='demoPill'>Demo telemetry</span></div><div id='fuelAnalytics'></div></div></section><section id='dash'><div class='loading'>Мэдээлэл уншиж байна...</div></section><section class='lower'><div class='panel fleetPanel'><div class='panelHead'><div><small>ФЛОТЫН ХЯНАЛТ</small><h2>Машинуудын төлөв</h2></div><span class='demoPill'>Өгөгдлийн төлөв</span></div><div id='fleet'></div></div><div class='panel aiPanel'><div class='aiTitle'><div class='aiOrb small'>✦</div><div><small>AI УДИРДЛАГЫН ТУСЛАХ</small><h2>Компанийн мэдээллээс асуу</h2></div></div><div id='chat'><div class='bot'>Сайн байна уу. Рейс, түлш, засвар, машины төлөвийн талаар асуугаарай.</div></div><div class='siilenVoice'><div><b>🎙️ Туслахаа Voice AI</b><small id='siilenStatus'>🎤 товчоор шууд асууж болно. Chrome/Edge дээр сэрээх үг ашиглаж болно.</small></div><div class='siilenVoiceActions'><button id='siilenTalk'>🎤 Ярих</button></div></div><div class='quick'><button data-q='Өнөөдрийн гол эрсдэлийг хэл'>Эрсдэл</button><button data-q='Түлшний зарцуулалтыг шинжил'>Түлш</button><button data-q='Засварт байгаа машинуудын талаар зөвлө'>Засвар</button></div><div class='ask'><input id='q' placeholder='Аль машинд анхаарах вэ?'><button id='ask'>✦ Асуу</button></div></div></section></main>`;
const money = (n: number) => new Intl.NumberFormat('mn-MN').format(n);
async function load() {
  try {
    const r = await api.get(guestMode ? '/api/demo-dashboard' : '/api/dashboard');
    const d = r.data as Dash;
    const utilization = Math.round((d.active / Math.max(1, d.vehicles)) * 100);
    document.querySelector('#dash')!.innerHTML =
      `<div class='stats'><div class='stat'><div class='statTop'><div class='statIcon blue'>▣</div><span class='trend up'>+ ${utilization}%</span></div><small>НИЙТ МАШИН</small><b>${d.vehicles}</b><em>${d.active} тээвэрт</em><div class='miniBar'><i style='width:${utilization}%'></i></div></div><div class='stat'><div class='statTop'><div class='statIcon amber'>⇄</div><span class='trend up'>LIVE</span></div><small>ӨНӨӨДРИЙН РЕЙС</small><b>${d.trips}</b><em>${money(d.tons)} тн нүүрс</em><div class='spark'><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class='stat'><div class='statTop'><div class='statIcon cyan'>◉</div><span class='trend neutral'>өдөр</span></div><small>ТҮЛШНИЙ ЗАРЦУУЛАЛТ</small><b>${money(d.fuel)}<small> L</small></b><em>Флотын нийт</em><div class='spark fuel'><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class='stat'><div class='statTop'><div class='statIcon red'>⌁</div><span class='trend danger'>анхаарах</span></div><small>ЗАСВАР / СУЛ</small><b>${d.repair} <small>/ ${d.idle}</small></b><em>Үйл ажиллагааны төлөв</em><div class='miniBar dangerBar'><i style='width:${Math.min(100, ((d.repair + d.idle) / Math.max(1, d.vehicles)) * 100)}%'></i></div></div></div><div class='visualRow'><div class='opsCard'><div class='panelHead'><div><small>ӨНӨӨДРИЙН ГҮЙЦЭТГЭЛ</small><h2>Тээврийн урсгал</h2></div><span class='demoPill'>${d.dataMode === 'registered' ? 'Бодит бүртгэл' : 'Demo overview'}</span></div><div class='flowMetrics'><div><span>Тээвэрт</span><b>${d.active}</b><div class='ring' style='--p:${utilization}'><i>${utilization}%</i></div></div><div><span>Тээвэрлэсэн</span><b>${money(d.tons)} тн</b><div class='metricLine'><i style='width:86%'></i></div></div><div><span>Рейс</span><b>${d.trips}</b><div class='metricLine amberLine'><i style='width:74%'></i></div></div></div></div><div class='alerts'><div class='panelHead'><div><small>AI MONITOR</small><h2>Анхааруулга</h2></div><span class='alertCount'>${d.alerts.length}</span></div>${d.alerts.map(a => `<div class='alert ${a.level}'><span class='alertDot'></span><div>${a.text}</div></div>`).join('')}</div></div>`;
    document.querySelector('#fleet')!.innerHTML =
      `<div class='table'><div class='tr th'><span>Улсын №</span><span>Жолооч</span><span>Төлөв</span><span>Рейс</span><span>Тн</span><span>Түлш</span></div>${d.fleet.map(v => `<div class='tr'><b>${v.plate}</b><span>${v.driver}</span><span class='status ${v.status === 'Тээвэрт' ? 'ok' : 'warn'}'>${v.status}</span><span>${v.trips}</span><span>${v.tons}</span><span>${v.fuel} L</span></div>`).join('')}</div>`;
    const activeFleet = d.fleet.filter(v => v.status === 'Тээвэрт');
    const positions = [
      { left: 15, top: 68 },
      { left: 38, top: 47 },
      { left: 61, top: 55 },
      { left: 78, top: 31 }
    ];
    document.querySelector('#gpsMap')!.innerHTML = `<div class='mapCanvas'><div class='routePhotoA11y' role='img' aria-label='Говийн засмал зам дээрх Demo рейсийн маршрут'></div></div><div id='vehicleFocus' class='vehicleFocus'><div><small>СОНГОСОН МАШИН</small><b>${activeFleet[0]?.plate || '—'}</b></div><span>${activeFleet[0]?.driver || 'Мэдээлэлгүй'} · ${activeFleet[0]?.trips || 0} рейс · ${activeFleet[0]?.fuel || 0} L</span></div>`;
    const focus = document.querySelector<HTMLElement>('#vehicleFocus')!;
    document.querySelectorAll<HTMLButtonElement>('.vehicleMarker').forEach(marker => marker.onclick = () => {
      document.querySelectorAll('.vehicleMarker').forEach(x => x.classList.remove('selected'));
      marker.classList.add('selected');
      const v = activeFleet[Number(marker.dataset.vehicle) || 0];
      if (v) focus.innerHTML = `<div><small>СОНГОСОН МАШИН</small><b>${v.plate}</b></div><span>${v.driver} · ${v.trips} рейс · ${v.tons} тн · ${v.fuel} L</span>`;
    });
    const fuelTrend = [16240, 17180, 16890, 18210, 17640, 18520, d.fuel];
    const maxFuel = Math.max(...fuelTrend);
    const points = fuelTrend.map((v, i) => `${i * 90 + 35},${180 - (v / maxFuel) * 135}`).join(' ');
    const avgFuel = Math.round(fuelTrend.reduce((s, v) => s + v, 0) / fuelTrend.length);
    document.querySelector('#fuelAnalytics')!.innerHTML = `<div class='fuelSummary'><div><small>ӨНӨӨДӨР</small><b>${money(d.fuel)} L</b></div><div><small>7 ХОНОГИЙН ДУНДАЖ</small><b>${money(avgFuel)} L</b></div></div><div class='chartWrap'><svg viewBox='0 0 600 210' class='fuelChart' role='img' aria-label='Түлшний 7 хоногийн demo график'><line x1='35' y1='45' x2='575' y2='45'/><line x1='35' y1='90' x2='575' y2='90'/><line x1='35' y1='135' x2='575' y2='135'/><line x1='35' y1='180' x2='575' y2='180'/><polyline class='fuelAreaLine' points='${points}'/>${fuelTrend.map((v, i) => `<circle class='fuelPoint' cx='${i * 90 + 35}' cy='${180 - (v / maxFuel) * 135}' r='4'/>`).join('')}</svg><div class='chartDays'>${['Дав','Мяг','Лха','Пүр','Баа','Бям','Өнөө'].map(x => `<span>${x}</span>`).join('')}</div></div><div class='fuelInsight'><span>✦</span><div><b>AI ажиглалт</b><small>Өнөөдрийн хэрэглээг рейс, ачаалал, сул зогсолттой хамт харьцуулж шалтгааныг AI-аас асууж болно.</small></div></div>`;
  } catch {
    document.querySelector('#dash')!.innerHTML =
      `<div class='alert high'>Мэдээлэл түр уншигдсангүй. Дахин ачаална уу.</div>`;
  }
}
function setDispatcherStatus(text: string) { const el=document.querySelector<HTMLElement>('#siilenStatus'); if(el)el.textContent=text; }
function resumeDispatcher() { setDispatcherStatus('🎤 Ярих товчийг дараад асуултаа хэлээрэй.'); }
async function speakDispatcher(text:string) { const fullText=text.trim(); if(!fullText)return; try{siilenRecognition?.stop();}catch{/* ignore */} setDispatcherStatus('🔊 Туслахаа бүтэн хариултаа бэлдэж байна…'); const sentences=fullText.match(/[^.!?。]+[.!?。]+|[^.!?。]+$/g)||[fullText];const chunks:string[]=[];let chunk='';for(const sentence of sentences){const clean=sentence.trim();if(!clean)continue;const next=(chunk+' '+clean).trim();if(next.length>450&&chunk){chunks.push(chunk);chunk=clean;}else{chunk=next;}}if(chunk)chunks.push(chunk);const browserSpeak=async(part:string)=>{if(!('speechSynthesis' in window))throw new Error('speech_unavailable');const fallbackParts=part.match(/[^.!?。]+[.!?。]+|[^.!?。]+$/g)||[part];for(const fallbackPart of fallbackParts){await new Promise<void>((resolve,reject)=>{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(fallbackPart.trim());u.lang='mn-MN';u.rate=0.95;const voice=window.speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('mn'));if(voice)u.voice=voice;u.onend=()=>resolve();u.onerror=()=>reject(new Error('speech_failed'));window.speechSynthesis.speak(u);});}};for(let index=0;index<chunks.length;index+=1){const part=chunks[index];setDispatcherStatus(`🔊 Хариултын ${index+1}/${chunks.length} хэсгийг бэлдэж байна…`);let played=false;for(let attempt=0;attempt<2&&!played;attempt+=1){try{const r=await api.post('/api/tts',{text:part});if(!r.data?.ok||!r.data?.audio)throw new Error('tts_failed');const binary=atob(String(r.data.audio));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);const audioUrl=URL.createObjectURL(new Blob([bytes],{type:r.data.mimeType||'audio/mpeg'}));await new Promise<void>((resolve,reject)=>{const audio=new Audio(audioUrl);audio.playbackRate=0.95;let settled=false;const done=(ok:boolean)=>{if(settled)return;settled=true;URL.revokeObjectURL(audioUrl);ok?resolve():reject(new Error('audio_failed'));};audio.onplay=()=>setDispatcherStatus(`🔊 Туслахаа хариулж байна — ${index+1}/${chunks.length}`);audio.onended=()=>done(true);audio.onerror=()=>done(false);audio.play().catch(()=>done(false));});played=true;}catch{/* retry once */}}if(!played){try{await browserSpeak(part);played=true;}catch{setDispatcherStatus(`Дууны ${index+1}/${chunks.length} хэсэг тоглогдсонгүй. Хариултыг дэлгэцээс бүтнээр нь уншина уу.`);return;}}}setDispatcherStatus('✅ Хариултыг бүтнээр нь хэлж дууслаа.');}
function startDispatcherWake() { const w=window as any; const Recognition=w.SpeechRecognition||w.webkitSpeechRecognition; const btn=document.querySelector<HTMLButtonElement>('#siilenWake'); if(!Recognition){siilenWakeMode=false;if(btn){btn.textContent='Сэрээх үг';btn.classList.remove('active');}setDispatcherStatus('Сэрээх горим энэ browser-д дэмжигдэхгүй байна. 🎤 Ярих товчийг ашиглана уу.');return;} try{siilenRecognition?.stop();}catch{/* ignore */} const r=new Recognition(); siilenRecognition=r; r.lang='mn-MN'; r.interimResults=false; r.continuous=true; const finish=()=>{if(!siilenAwake||siilenBusy)return;const q=siilenQuestionParts.join(' ').trim();if(!q)return;siilenQuestionParts=[];siilenAwake=false;try{r.stop();}catch{/* ignore */}void ask(q,true);}; const extend=()=>{if(siilenQuestionTimer!==null)window.clearTimeout(siilenQuestionTimer);siilenQuestionTimer=window.setTimeout(finish,6500);}; r.onresult=(e:any)=>{const heard=String(e.results[e.results.length-1][0].transcript||'').trim();if(!heard)return;const normalized=heard.toLowerCase().replace(/[,.!?]/g,' ');const wake=normalized.includes('туслахаа')||normalized.includes('туслах аа');if(!siilenAwake&&wake){siilenAwake=true;siilenQuestionParts=[];const command=heard.replace(/туслах\s*аа/iu,'').replace(/туслахаа/iu,'').trim();if(command)siilenQuestionParts.push(command);setDispatcherStatus('🟢 Туслахаа идэвхжлээ. Асуултаа хэлээд дуусгаарай.');extend();return;}if(siilenAwake&&!siilenBusy){siilenQuestionParts.push(heard);setDispatcherStatus('🎙️ Сонсож байна…');extend();}}; r.onend=()=>{if(siilenWakeMode&&!siilenBusy)resumeDispatcher();};r.onerror=(e:any)=>{const code=String(e?.error||'');if(code==='not-allowed'||code==='service-not-allowed'){siilenWakeMode=false;if(btn){btn.textContent='Сэрээх үг';btn.classList.remove('active');}setDispatcherStatus('Микрофоны зөвшөөрөл хаалттай байна. Browser Settings → Microphone → Allow хийнэ үү.');return;}if(siilenWakeMode&&!siilenBusy)resumeDispatcher();};try{r.start();if(btn){btn.textContent='✓ Туслахаа идэвхтэй';btn.classList.add('active');}setDispatcherStatus('🟢 Туслахаа идэвхтэй — “Туслахаа” гэж хэлээд асуултаа асуугаарай.');}catch{siilenWakeMode=false;if(btn){btn.textContent='Сэрээх үг';btn.classList.remove('active');}setDispatcherStatus('Микрофон эхэлсэнгүй. Зөвшөөрлөө шалгаад дахин идэвхжүүлнэ үү.');}}
function toggleDispatcherWake(){const btn=document.querySelector<HTMLButtonElement>('#siilenWake');if(siilenWakeMode){siilenWakeMode=false;siilenAwake=false;siilenQuestionParts=[];if(siilenQuestionTimer!==null)window.clearTimeout(siilenQuestionTimer);if(siilenRestartTimer!==null)window.clearTimeout(siilenRestartTimer);try{siilenRecognition?.stop();}catch{/* ignore */}siilenRecognition=null;if(btn){btn.textContent='Сэрээх үг';btn.classList.remove('active');}setDispatcherStatus('⚪ Туслахаа сэрээх горим унтарсан. 🎤 Ярих товчоор шууд асууж болно.');return;}siilenWakeMode=true;startDispatcherWake();}
async function talkDispatcher(){const btn=document.querySelector<HTMLButtonElement>('#siilenTalk');if(siilenBusy){setDispatcherStatus('Одоогийн хариулт дууссаны дараа дахин асууна уу.');return;}if(!navigator.mediaDevices?.getUserMedia){setDispatcherStatus('Энэ browser микрофон ашиглах боломжгүй. Chrome/Edge ашиглана уу.');return;}if(btn){btn.classList.add('active');btn.textContent='■ Дуусгах';btn.disabled=false;}setDispatcherStatus('🎙️ Микрофон нээж байна…');let finished=false;let mediaRecorder:MediaRecorder|null=null;let chunks:BlobPart[]=[];let stream:MediaStream|null=null;let listenTimer:number|null=null;const clearTimer=()=>{if(listenTimer!==null){window.clearTimeout(listenTimer);listenTimer=null;}};const restoreBtn=()=>{if(btn){btn.classList.remove('active');btn.textContent='🎤 Ярих';btn.disabled=false;btn.onclick=()=>{void talkDispatcher();};}};const reset=(message:string)=>{if(finished)return;finished=true;clearTimer();try{if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop();}catch{/* ignore */}stream?.getTracks().forEach(t=>t.stop());stream=null;mediaRecorder=null;restoreBtn();setDispatcherStatus(message);};const blobToBase64=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onloadend=()=>{const s=String(reader.result||'');const i=s.indexOf(',');resolve(i>=0?s.slice(i+1):s);};reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});const sendBlob=async(blob:Blob,mimeType:string)=>{if(btn){btn.textContent='…';btn.disabled=true;}setDispatcherStatus(`🧠 Gemini таниж байна… (${Math.round(blob.size/1024)} KB)`);try{const audio=await blobToBase64(blob);const r=await api.post('/api/stt',{audio,mimeType});const text=String(r.data?.text||'').trim();if(!r.data?.ok||!text){restoreBtn();finished=false;setDispatcherStatus(r.data?.message||'Яриа танигдсангүй. Илүү чанга, 4–8 сек ярина уу.');return;}const input=document.querySelector<HTMLInputElement>('#q');if(input)input.value=text;restoreBtn();setDispatcherStatus(`✅ Танигдсан: «${text.slice(0,80)}${text.length>80?'…':''}»`);void ask(text,true);}catch(e){restoreBtn();finished=false;setDispatcherStatus(e instanceof Error?e.message:'Gemini STT алдаа.');}};const finishAndSend=()=>{if(finished)return;finished=true;clearTimer();if(!mediaRecorder||mediaRecorder.state==='inactive'){restoreBtn();setDispatcherStatus('Бичлэг эхлээгүй. Дахин 🎤 Ярих дарна уу.');finished=false;return;}const mimeType=(mediaRecorder.mimeType||'audio/webm').split(';')[0];mediaRecorder.onstop=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;const blob=new Blob(chunks,{type:mimeType||'audio/webm'});chunks=[];const rec=mediaRecorder;mediaRecorder=null;if(blob.size<1500){restoreBtn();finished=false;setDispatcherStatus('Аудио хэт богино. 🎤 дарж 4–8 секунд тод ярина уу.');return;}void sendBlob(blob,mimeType);};try{mediaRecorder.requestData();mediaRecorder.stop();}catch{restoreBtn();finished=false;setDispatcherStatus('Бичлэг зогсоох үед алдаа.');}};try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});const mimeCandidates=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];const mime=mimeCandidates.find(m=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(m))||'';mediaRecorder=mime?new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:128000}):new MediaRecorder(stream);chunks=[];mediaRecorder.ondataavailable=(e)=>{if(e.data&&e.data.size>0)chunks.push(e.data);};mediaRecorder.onerror=()=>reset('Бичлэг алдаатай. Дахин оролдоно уу.');mediaRecorder.start(200);setDispatcherStatus('🎙️ Сонсож байна · 4–8 сек ТОД ярь · дараа нь ■ Дуусгах');if(btn)btn.onclick=()=>{finishAndSend();};listenTimer=window.setTimeout(()=>{finishAndSend();},15000);}catch(e){const msg=e instanceof Error?e.message:'';reset(/permission|notallowed|denied/i.test(msg)?'Микрофоны зөвшөөрөл хаалттай. 🔒 → Microphone → Allow.':'Микрофон нээгдсэнгүй. Зөвшөөрлөө шалгана уу.');}}
async function ask(q: string, fromVoice = false) {
  if (!q.trim() || siilenBusy) return;
  if (guestMode) { const chat=document.querySelector('#chat')!; chat.insertAdjacentHTML('beforeend', `<div class='me'>${q.replace(/[<>]/g,'')}</div><div class='bot'>Зочин Demo горимд бодит компанийн AI болон мэдээлэл хамгаалагдсан. Бодит AI туслах ашиглахын тулд “Google-ээр нэвтрэх” товчийг дарна уу.</div>`); chat.scrollTop=chat.scrollHeight; return; }
  if(fromVoice){siilenBusy=true;setDispatcherStatus('AI хариулж байна…');}
  const chat = document.querySelector('#chat')!;
  chat.insertAdjacentHTML(
    'beforeend',
    `<div class='me'>${q.replace(/[<>]/g, '')}</div>`
  );
  const wait = document.createElement('div');
  wait.className = 'bot';
  wait.textContent = 'AI шинжилж байна...';
  chat.appendChild(wait);
  try {
    const r = await api.post('/api/ai-manager', { question: q });
    wait.textContent = r.data.answer;
    if(fromVoice)await speakDispatcher(String(r.data.answer||''));
  } catch {
    wait.textContent = 'AI түр холбогдсонгүй. Дахин оролдоно уу.';
    if(fromVoice)setDispatcherStatus('Дууны хариулт ажилласангүй. Текст хариултыг дэлгэцээс харна уу.');
  } finally {
    if(fromVoice){siilenBusy=false;setDispatcherStatus('🎤 Дараагийн асуултаа Ярих товчоор асуугаарай.');}
  }
  chat.scrollTop = chat.scrollHeight;
}
(document.querySelector('#ask') as HTMLButtonElement).onclick = () => {
  const q = document.querySelector<HTMLInputElement>('#q')!;
  ask(q.value);
  q.value = '';
};
(document.querySelector('#q') as HTMLInputElement).onkeydown = e => {
  if (e.key === 'Enter')
    (document.querySelector('#ask') as HTMLButtonElement).click();
};
document
  .querySelectorAll<HTMLButtonElement>('[data-q]')
  .forEach(b => (b.onclick = () => ask(b.dataset.q || '')));
const main = document.querySelector<HTMLElement>('main')!;
const dashboardMarkup = main.innerHTML;
const demoViews: Record<string, { title: string; subtitle: string; cards: Array<[string, string, string]>; rows: string[][] }> = {
  vehicles: { title: 'Машины удирдлага', subtitle: 'Флотын ашиглалт, төлөв ба үндсэн үзүүлэлт', cards: [['Нийт машин','42','34 тээвэрт'],['Засварт','5','12%'],['Сул','3','Хуваарилах боломжтой']], rows: [['ӨМӨ 8214','Howo TX','Тээвэрт','152 тн'],['ӨМӨ 7741','Shacman X3000','Тээвэрт','114 тн'],['ӨМӨ 6108','Howo T7H','Засварт','0 тн'],['ӨМӨ 9320','Shacman X3000','Тээвэрт','148 тн']] },
  trips: { title: 'Рейсийн удирдлага', subtitle: 'Өнөөдрийн ачилт, замын төлөв, буулгалтын явц', cards: [['Нийт рейс','164','Өнөөдөр'],['Тээвэрлэсэн','6,420 тн','Нийт'],['Дундаж','39.1 тн','1 рейс']], rows: [['R-164','ӨМӨ 8214','Уурхай → Буулгалт','Замд'],['R-163','ӨМӨ 7741','Уурхай → Буулгалт','Буулгасан'],['R-162','ӨМӨ 9320','Уурхай → Буулгалт','Замд']] },
  fuel: { title: 'Түлшний хяналт', subtitle: 'Машин тус бүрийн хэрэглээ ба хэвийн бус зарцуулалт', cards: [['Өнөөдөр','18,730 L','Нийт'],['7 хоног дундаж','17,630 L','Өдөрт'],['AI анхааруулга','1 машин','Шалгах']], rows: [['ӨМӨ 9320','512 L','4 рейс','Өндөр'],['ӨМӨ 8214','438 L','4 рейс','Хэвийн'],['ӨМӨ 7741','321 L','3 рейс','Хэвийн']] },
  maintenance: { title: 'Засвар үйлчилгээ', subtitle: 'Засварын төлөв, төлөвлөгөөт үйлчилгээ, сэлбэгийн хяналт', cards: [['Засварт','5','Машин'],['Хүлээгдэж буй','2','Сэлбэг'],['Үйлчилгээ дөхсөн','4','Машин']], rows: [['ӨМӨ 6108','Хөдөлгүүрийн үзлэг','Засварт','Өнөөдөр'],['ӨМӨ 4451','Тос солих','Төлөвлөсөн','2 хоног'],['ӨМӨ 3012','Тоормосны үзлэг','Төлөвлөсөн','3 хоног']] },
  drivers: { title: 'Жолоочийн хяналт', subtitle: 'Рейс, тээвэрлэлтийн гүйцэтгэл ба ажлын төлөв', cards: [['Идэвхтэй','34','Жолооч'],['Өнөөдрийн рейс','164','Нийт'],['Ээлж амарсан','8','Жолооч']], rows: [['Б. Батсайхан','ӨМӨ 8214','4 рейс','152 тн'],['Д. Тэмүүлэн','ӨМӨ 7741','3 рейс','114 тн'],['Н. Энхбат','ӨМӨ 9320','4 рейс','148 тн']] },
  tires: { title: 'Дугуйн бүртгэл', subtitle: 'Дугуйн байрлал, ашиглалт, хээ, даралт ба солих хугацааны хяналт', cards: [['Хээний хяналт','мм','Элэгдлийг хянана'],['Даралт','PSI','Даралтын бүртгэл'],['Солих хугацаа','30 хоног','Урьдчилан сануулна']], rows: [] },
  documents: { title: 'Бичиг баримтын хяналт', subtitle: 'Гааль, зөвшөөрөл, даатгал, үзлэг, гэрээний хугацааны хяналт', cards: [['Хугацааны хяналт','30 хоног','Урьдчилан сануулна'],['Төлөв','Автомат','Өнгөөр ялгана'],['Хандалт','Хамгаалалттай','Эрхийн дагуу']], rows: [] },
  reports: { title: 'Удирдлагын тайлан', subtitle: 'Өдрийн гол үзүүлэлтүүдийг нэгтгэн харуулна', cards: [['Тээвэр','6,420 тн','Өнөөдөр'],['Рейс','164','Өнөөдөр'],['Түлш','18,730 L','Өнөөдөр']], rows: [['Флот ашиглалт','81%','34 / 42','Demo'],['Түлш / рейс','114.2 L','Дундаж','Demo'],['Тонн / рейс','39.1 тн','Дундаж','Demo']] }
};
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
async function renderRecords(view: string) {
  const list = document.querySelector<HTMLElement>('#realRecords');
  if (!list || !['vehicles','trips','fuel','maintenance','tires','drivers','documents'].includes(view)) return;
  try {
    const endpoint: Record<string,string> = { vehicles:'/api/vehicles', trips:'/api/trips', fuel:'/api/fuel', maintenance:'/api/maintenance', drivers:'/api/drivers', documents:'/api/documents', tires:'/api/tires' };
    const r = await api.get(endpoint[view]);
    const items = r.data.items || [];
    const row = (x: Record<string, unknown>) => {
      if (view === 'vehicles') return `<div class='moduleRow'><b>${esc(x.plate)}</b><span>${esc(x.model)}</span><span>${esc(x.driver || 'Жолоочгүй')}</span><span>${esc(x.status)}</span></div>`;
      if (view === 'trips') return `<div class='moduleRow'><b>${esc(x.plate)}</b><span>${esc(x.route)}</span><span>${esc(x.tons)} тн</span><span>${esc(x.status)}</span></div>`;
      if (view === 'fuel') return `<div class='moduleRow'><b>${esc(x.plate)}</b><span>${esc(x.liters)} L</span><span>${esc(x.odometer || 0)} км</span><span>${esc(x.note || '—')}</span></div>`;
      if (view === 'maintenance') return `<div class='moduleRow'><b>${esc(x.plate)}</b><span>${esc(x.type)}</span><span>${Number(x.cost || 0).toLocaleString()} ₮</span><span>${esc(x.status)}</span></div>`;
      if (view === 'tires') { const tread=Number(x.treadDepth||0); const tireState=tread>0&&tread<=3?'Хээ нимгэрсэн':esc(x.status||'Ашиглаж байгаа'); return `<div class='moduleRow tireRow'><b>${esc(x.plate)}</b><span>${esc(x.position)}</span><span>${esc(x.brand)} · ${esc(x.serial)}</span><span>${tread?`${tread} мм`:'—'}</span><span class='docState ${tread>0&&tread<=3?'expired':'valid'}'>${tireState}</span></div>`; }
      if (view === 'drivers') return `<div class='moduleRow'><b>${esc(x.name)}</b><span>${esc(x.employeeCode)}</span><span>${esc(x.plate || 'Машингүй')}</span><span>${esc(x.status)}</span></div>`;
      const days=Math.ceil((new Date(`${String(x.expiryDate)}T00:00:00`).getTime()-new Date().setHours(0,0,0,0))/86400000); const state=days<0?'Хугацаа дууссан':days<=30?`${days} хоног үлдсэн`:'Хэвийн'; const photo=x.fileUrl?`<a class='docPhoto' href='${esc(x.fileUrl)}' target='_blank' rel='noopener'>📷 Зураг харах</a>`:`<span class='noPhoto'>Зураггүй</span>`; return `<div class='moduleRow docRow'><b>${esc(x.type)}</b><span>${esc(x.name)}</span><span>${esc(x.expiryDate)}</span><span class='docState ${days<0?'expired':days<=30?'soon':'valid'}'>${esc(state)}</span>${photo}</div>`;
    };
    list.innerHTML = items.length ? items.map((x:any)=>`<div class='recordWrap'>${row(x)}${canDelete(view)?`<button class='deleteRecord' data-record-id='${esc(x.id)}' aria-label='Бүртгэл устгах'>Устгах</button>`:''}</div>`).join('') : `<div class='emptyRecords'>Одоогоор бодитоор бүртгэсэн мэдээлэл алга.</div>`;
    if(canDelete(view)) list.querySelectorAll<HTMLButtonElement>('.deleteRecord').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.recordId;if(!id)return;btn.disabled=true;try{await api.delete(endpoint[view]+'/'+encodeURIComponent(id));await renderRecords(view);}catch{btn.disabled=false;}});
  } catch { list.innerHTML = `<div class='formError'>Бүртгэл түр уншигдсангүй.</div>`; }
}
function canDelete(_view:string){return currentRole==='admin'||currentRole==='dispatcher';}
function canWrite(view: string) { if (currentRole === 'admin') return true; if (currentRole === 'mechanic') return ['maintenance','tires'].includes(view); return ['vehicles','trips','fuel','tires','drivers','documents'].includes(view); }
function recordsOnly(title:string) { return `<section class='panel moduleTable'><div class='panelHead'><div><small>УНШИХ ЭРХ</small><h2>${title}</h2></div><span class='demoPill'>Зөвхөн харах</span></div><div id='realRecords'></div></section>`; }
function registrationForm(view: string) {
  if (!canWrite(view)) return recordsOnly(view === 'maintenance' ? 'Засварын түүх' : 'Бүртгэл');
  if (view === 'vehicles') return `<section class='panel entryPanel'><div class='panelHead'><div><small>БОДИТ БҮРТГЭЛ</small><h2>+ Машин бүртгэх</h2></div><span class='realPill'>Database</span></div><div class='entryGrid'><input id='plate' placeholder='Улсын дугаар'><input id='model' placeholder='Машины загвар'><input id='driver' placeholder='Жолоочийн нэр'><select id='recordStatus'><option>Сул</option><option>Тээвэрт</option><option>Засварт</option></select><button id='saveRecord'>Машин хадгалах</button></div><div id='formMsg'></div></section><section class='panel moduleTable'><div class='panelHead'><div><small>ХАДГАЛАГДСАН МЭДЭЭЛЭЛ</small><h2>Бүртгэлтэй машинууд</h2></div></div><div id='realRecords'></div></section>`;
  if (view === 'trips') return `<section class='panel entryPanel'><div class='panelHead'><div><small>БОДИТ БҮРТГЭЛ</small><h2>+ Рейс бүртгэх</h2></div><span class='realPill'>Database</span></div><div class='entryGrid'><input id='plate' placeholder='Машины улсын дугаар'><input id='route' placeholder='Маршрут: Уурхай → Буулгалт'><input id='tons' type='number' min='0.1' step='0.1' placeholder='Ачаа, тонн'><select id='recordStatus'><option>Шинэ</option><option>Замд</option><option>Буулгасан</option></select><button id='saveRecord'>Рейс хадгалах</button></div><div id='formMsg'></div></section><section class='panel moduleTable'><div class='panelHead'><div><small>ХАДГАЛАГДСАН МЭДЭЭЛЭЛ</small><h2>Бүртгэлтэй рейсүүд</h2></div></div><div id='realRecords'></div></section>`;
  if (view === 'fuel') return `<section class='panel entryPanel'><div class='panelHead'><div><small>БОДИТ БҮРТГЭЛ</small><h2>+ Түлш бүртгэх</h2></div><span class='realPill'>Database</span></div><div class='entryGrid'><input id='plate' placeholder='Машины улсын дугаар'><input id='liters' type='number' min='0.1' step='0.1' placeholder='Түлш, литр'><input id='odometer' type='number' min='0' placeholder='Гүйлт, км'><input id='note' placeholder='Тайлбар'><button id='saveRecord'>Түлш хадгалах</button></div><div id='formMsg'></div></section><section class='panel moduleTable'><div class='panelHead'><div><small>ХАДГАЛАГДСАН МЭДЭЭЛЭЛ</small><h2>Түлшний түүх</h2></div></div><div id='realRecords'></div></section>`;
  if (view === 'maintenance') return `<section class='panel entryPanel'><div class='panelHead'><div><small>БОДИТ БҮРТГЭЛ</small><h2>+ Засвар бүртгэх</h2></div><span class='realPill'>Database</span></div><div class='entryGrid'><input id='plate' placeholder='Машины улсын дугаар'><input id='maintType' placeholder='Засвар / үйлчилгээний төрөл'><input id='cost' type='number' min='0' placeholder='Зардал, ₮'><select id='recordStatus'><option>Төлөвлөсөн</option><option>Засварт</option><option>Дууссан</option></select><button id='saveRecord'>Засвар хадгалах</button></div><div id='formMsg'></div></section><section class='panel moduleTable'><div class='panelHead'><div><small>ХАДГАЛАГДСАН МЭДЭЭЛЭЛ</small><h2>Засварын түүх</h2></div></div><div id='realRecords'></div></section>`;
  if (view === 'tires') return `<section class='panel entryPanel'><div class='panelHead'><div><small>ДУГУЙН ХЯНАЛТ</small><h2>+ Дугуй бүртгэх / солилтын түүх</h2></div><span class='realPill'>Tire control</span></div><div class='entryGrid tireGrid'><input id='tirePlate' placeholder='Машины улсын №'><select id='tirePosition'><option>Урд зүүн</option><option>Урд баруун</option><option>Хойд 1 зүүн гадна</option><option>Хойд 1 зүүн дотор</option><option>Хойд 1 баруун дотор</option><option>Хойд 1 баруун гадна</option><option>Хойд 2 зүүн гадна</option><option>Хойд 2 зүүн дотор</option><option>Хойд 2 баруун дотор</option><option>Хойд 2 баруун гадна</option><option>Нөөц</option></select><input id='tireBrand' placeholder='Брэнд'><input id='tireSerial' placeholder='Серийн №'><label>Тавьсан огноо<input id='tireInstall' type='date'></label><input id='tireMileage' type='number' min='0' placeholder='Явсан км'><input id='tireTread' type='number' min='0' step='0.1' placeholder='Хээ мм'><input id='tirePressure' type='number' min='0' step='0.1' placeholder='Даралт PSI'><label>Солих огноо<input id='tireReplace' type='date'></label><select id='tireStatus'><option>Ашиглаж байгаа</option><option>Солих шаардлагатай</option><option>Нөөц</option><option>Сольсон</option></select><input id='tireNote' placeholder='Тайлбар / солилтын шалтгаан'><button id='saveRecord'>Дугуй хадгалах</button></div><div id='formMsg'></div></section><section class='panel moduleTable'><div class='panelHead'><div><small>ДУГУЙН ТҮҮХ</small><h2>Бүртгэл ба төлөв</h2></div><span class='demoPill'>Хээ + хугацааны сануулга</span></div><div id='realRecords'></div></section>`;
  if (view === 'documents') return `<section class='panel entryPanel'><div class='panelHead'><div><small>ХУГАЦААНЫ ХЯНАЛТ</small><h2>+ Бичиг баримт зурагтай бүртгэх</h2></div><span class='realPill'>Image + Expiry</span></div><div class='docTypeHint'><b>Түлшний бичиг</b> болон <b>Гаалийн бичиг</b> тусдаа төрөл болсон.</div><div class='entryGrid docGrid'><select id='docType'><option>Түлшний бичиг</option><option>Гаалийн бичиг</option><option>Тээврийн зөвшөөрөл</option><option>Даатгал</option><option>Техникийн үзлэг</option><option>Гэрээ</option><option>Бусад</option></select><input id='docName' placeholder='Баримтын нэр'><input id='docNumber' placeholder='Дугаар'><label>Олгосон огноо<input id='issueDate' type='date'></label><label>Дуусах хугацаа<input id='expiryDate' type='date'></label><input id='docNote' placeholder='Тайлбар'><label class='filePick'>📷 Баримтын зураг<input id='docImage' type='file' accept='image/jpeg,image/png,image/webp' capture='environment'></label><button id='saveRecord'>Баримт хадгалах</button></div><div id='imagePreview' class='imagePreview'></div><div id='formMsg'></div></section><section class='panel moduleTable'><div class='panelHead'><div><small>ХАДГАЛАГДСАН БАРИМТ</small><h2>Хугацаа ба зураг</h2></div><span class='demoPill'>30 хоногийн сануулга</span></div><div id='realRecords'></div></section>`;
  if (view === 'drivers') return `<section class='panel entryPanel'><div class='panelHead'><div><small>БОДИТ БҮРТГЭЛ</small><h2>+ Жолооч бүртгэх</h2></div><span class='realPill'>Database</span></div><div class='entryGrid'><input id='driverName' placeholder='Жолоочийн нэр'><input id='employeeCode' placeholder='Ажилтны код'><input id='plate' placeholder='Хариуцсан машин'><select id='recordStatus'><option>Ажиллаж байна</option><option>Амралт</option><option>Чөлөө</option></select><button id='saveRecord'>Жолооч хадгалах</button></div><div id='formMsg'></div></section><section class='panel moduleTable'><div class='panelHead'><div><small>ХАДГАЛАГДСАН МЭДЭЭЛЭЛ</small><h2>Жолоочийн бүртгэл</h2></div></div><div id='realRecords'></div></section>`;
  return '';
}
function bindRegistration(view: string) {
  const save = document.querySelector<HTMLButtonElement>('#saveRecord');
  if (!save) return;
  if (view === 'documents') { const image=document.querySelector<HTMLInputElement>('#docImage'); const preview=document.querySelector<HTMLElement>('#imagePreview'); if(image&&preview) image.onchange=()=>{const f=image.files?.[0]; if(!f){preview.innerHTML='';return;} preview.innerHTML=`<span>📷 ${esc(f.name)}</span><small>${(f.size/1024/1024).toFixed(1)} MB</small>`;}; }
  save.onclick = async () => {
    const plate = (document.querySelector<HTMLInputElement>('#plate')?.value || '').trim();
    const status = (document.querySelector<HTMLSelectElement>('#recordStatus')?.value || '').trim();
    const msg = document.querySelector<HTMLElement>('#formMsg')!;
    let body: Record<string, unknown>;
    if (view === 'vehicles') body = { plate, model: document.querySelector<HTMLInputElement>('#model')?.value || '', driver: document.querySelector<HTMLInputElement>('#driver')?.value || '', status };
    else if (view === 'trips') body = { plate, route: document.querySelector<HTMLInputElement>('#route')?.value || '', tons: Number(document.querySelector<HTMLInputElement>('#tons')?.value || 0), status };
    else if (view === 'fuel') body = { plate, liters: Number(document.querySelector<HTMLInputElement>('#liters')?.value || 0), odometer: Number(document.querySelector<HTMLInputElement>('#odometer')?.value || 0), note: document.querySelector<HTMLInputElement>('#note')?.value || '' };
    else if (view === 'maintenance') body = { plate, type: document.querySelector<HTMLInputElement>('#maintType')?.value || '', cost: Number(document.querySelector<HTMLInputElement>('#cost')?.value || 0), status };
    else if (view === 'tires') body = { plate:document.querySelector<HTMLInputElement>('#tirePlate')?.value||'', position:document.querySelector<HTMLSelectElement>('#tirePosition')?.value||'', brand:document.querySelector<HTMLInputElement>('#tireBrand')?.value||'', serial:document.querySelector<HTMLInputElement>('#tireSerial')?.value||'', installDate:document.querySelector<HTMLInputElement>('#tireInstall')?.value||'', mileage:Number(document.querySelector<HTMLInputElement>('#tireMileage')?.value||0), treadDepth:Number(document.querySelector<HTMLInputElement>('#tireTread')?.value||0), pressure:Number(document.querySelector<HTMLInputElement>('#tirePressure')?.value||0), replaceDate:document.querySelector<HTMLInputElement>('#tireReplace')?.value||'', status:document.querySelector<HTMLSelectElement>('#tireStatus')?.value||'', note:document.querySelector<HTMLInputElement>('#tireNote')?.value||'' };
    else if (view === 'drivers') body = { name: document.querySelector<HTMLInputElement>('#driverName')?.value || '', employeeCode: document.querySelector<HTMLInputElement>('#employeeCode')?.value || '', plate, status };
    else { const file=document.querySelector<HTMLInputElement>('#docImage')?.files?.[0]; let fileData=''; if(file){ if(file.size>5000000){msg.innerHTML=`<div class='formError'>Зураг 5 MB-аас бага байх шаардлагатай.</div>`;return;} fileData=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);}); } body = { type:document.querySelector<HTMLSelectElement>('#docType')?.value || '', name:document.querySelector<HTMLInputElement>('#docName')?.value || '', number:document.querySelector<HTMLInputElement>('#docNumber')?.value || '', issueDate:document.querySelector<HTMLInputElement>('#issueDate')?.value || '', expiryDate:document.querySelector<HTMLInputElement>('#expiryDate')?.value || '', note:document.querySelector<HTMLInputElement>('#docNote')?.value || '', fileData, fileName:file?.name || '', fileType:file?.type || '' }; }
    const endpoint: Record<string,string> = { vehicles:'/api/vehicles', trips:'/api/trips', fuel:'/api/fuel', maintenance:'/api/maintenance', drivers:'/api/drivers', documents:'/api/documents', tires:'/api/tires' };
    save.disabled = true;
    try { const r = await api.post(endpoint[view], body); msg.innerHTML = `<div class='formSuccess'>✓ ${esc(r.data.message)}</div>`; await renderRecords(view); } catch { msg.innerHTML = `<div class='formError'>Мэдээллээ бүрэн зөв оруулаад дахин оролдоно уу.</div>`; }
    save.disabled = false;
  };
}
function showView(view: string) {
  if (view === 'dashboard') { main.innerHTML = dashboardMarkup; bindDashboard(); applySessionUI(); load(); return; }
  if (view === 'dailybrief') {
    main.innerHTML = `<header><div><div class='eyebrow'>AI DAILY OPERATIONS · 2026</div><h1>Өдрийн AI илтгэл</h1><p>Өнөөдрийн бүртгэлээс AI автоматаар нэгтгэсэн удирдлагын тайлан</p></div><button class='backDash'>← Самбар</button></header><section class='panel dailyBrief'><div class='panelHead'><div><small>ӨНӨӨДРИЙН МЭДЭЭЛЛИЙН САМБАР</small><h2>AI удирдлагын дүгнэлт</h2></div><div class='briefActions'><button id='sampleBrief' class='voiceBtn'>▶ Жишээ илтгэл</button><button id='speakBrief' class='voiceBtn' disabled>🔊 Монгол хэлээр уншуулах</button><button id='stopBrief' class='voiceBtn stopVoice' disabled>■ Зогсоох</button><button id='refreshBrief' class='backDash'>✦ Шинэчлэх</button></div></div><div id='voiceStatus' class='voiceStatus'>AI илтгэл бэлэн болмогц дуугаар уншуулж болно.</div><div id='briefContent' class='briefLoading'>AI өнөөдрийн бүртгэлийг шинжилж байна...</div></section>`;
    let reportText = '';
    let voiceBriefText = '';
    const sampleBtn = document.querySelector<HTMLButtonElement>('#sampleBrief')!;
    const speakBtn = document.querySelector<HTMLButtonElement>('#speakBrief')!;
    const stopBtn = document.querySelector<HTMLButtonElement>('#stopBrief')!;
    const voiceStatus = document.querySelector<HTMLElement>('#voiceStatus')!;
    let activeAudio: HTMLAudioElement | null = null;
    let activeAudioUrl = '';
    const releaseAudio = () => { if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; activeAudio = null; } if (activeAudioUrl) { URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = ''; } };
    const stopVoice = () => { releaseAudio(); stopBtn.disabled=true; speakBtn.disabled=!reportText; speakBtn.textContent='🔊 Монгол AI-аар уншуулах'; voiceStatus.textContent=reportText?'AI илтгэлийг Монгол AI дуугаар уншуулахад бэлэн.':'AI илтгэл бэлэн болмогц Монгол AI дуугаар уншуулж болно.'; };
    const speakVoice = async () => { if (!voiceBriefText && !reportText) return; releaseAudio(); speakBtn.disabled=true; stopBtn.disabled=false; speakBtn.textContent='🔊 Монгол AI дуу бэлдэж байна...'; const spokenText=voiceBriefText||reportText; const sentences=spokenText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[spokenText]; const chunks:string[]=[]; let chunk=''; for(const sentence of sentences){const next=(chunk+' '+sentence.trim()).trim();if(next.length>500&&chunk){chunks.push(chunk);chunk=sentence.trim();}else{chunk=next;}}if(chunk)chunks.push(chunk); try { for(let index=0;index<chunks.length;index+=1){if(stopBtn.disabled)break;voiceStatus.textContent=`Монгол AI илтгэлийн ${index+1}/${chunks.length} хэсгийн дууг бэлдэж байна...`;const r=await api.post('/api/tts',{text:chunks[index]});if(!r.data?.ok||!r.data?.audio)throw new Error(String(r.data?.message||'Монгол AI дуу үүсгэж чадсангүй.'));const binary=atob(String(r.data.audio));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);activeAudioUrl=URL.createObjectURL(new Blob([bytes],{type:r.data.mimeType||'audio/mpeg'}));await new Promise<void>((resolve,reject)=>{activeAudio=new Audio(activeAudioUrl);activeAudio.onplay=()=>{speakBtn.textContent='🔊 Монгол AI уншиж байна...';voiceStatus.textContent=`Өдрийн илтгэл ${index+1}/${chunks.length} — Монгол AI уншиж байна.`;};activeAudio.onended=()=>{releaseAudio();resolve();};activeAudio.onerror=()=>{releaseAudio();reject(new Error('Аудио тоглуулахад алдаа гарлаа.'));};activeAudio.play().catch(reject);});}speakBtn.disabled=false;stopBtn.disabled=true;speakBtn.textContent='🔊 Монгол AI-аар уншуулах';voiceStatus.textContent='Өдрийн дэлгэрэнгүй илтгэлийг бүтнээр нь уншиж дууслаа. Дахин уншуулах боломжтой.';} catch(e){releaseAudio();speakBtn.disabled=false;stopBtn.disabled=true;speakBtn.textContent='🔊 Монгол AI-аар уншуулах';voiceStatus.textContent=e instanceof Error?e.message:'Монгол AI дуу үүсгэж чадсангүй. Дахин оролдоно уу.';} };
    speakBtn.textContent='🔊 Монгол AI-аар уншуулах';
    speakBtn.onclick=speakVoice;
    stopBtn.onclick=stopVoice;
    const loadBrief = async () => {
      stopVoice();
      const box = document.querySelector<HTMLElement>('#briefContent')!;
      box.className = 'briefLoading';
      box.textContent = 'AI өнөөдрийн бүртгэлийг шинжилж байна...';
      try {
        const r = await api.get('/api/daily-brief');
        const d = r.data;
        const factsLine = `Нийт ${money(d.facts.vehicles)} машин бүртгэлтэй. Өнөөдөр ${money(d.facts.trips)} рейс, ${money(d.facts.tons)} тонн нүүрс, ${money(d.facts.fuelLiters)} литр түлш. Засвар ${money(d.facts.maintenanceRisk)}, дугуй ${money(d.facts.tireRisk)}, баримт ${money(d.facts.documentRisk)}.`;
        const reportFull = String(d.report || '').trim();
        reportText = `${factsLine} ${reportFull}`;
        const reportShort = reportFull.length > 500 ? reportFull.slice(0, 500).replace(/\s+\S*$/, '') + '.' : reportFull;
        voiceBriefText = `Сайн байна уу. Өнөөдрийн товч илтгэл. ${factsLine} ${reportShort}`.trim();
        speakBtn.disabled = !voiceBriefText;
        voiceStatus.textContent = voiceBriefText ? '🔊 Товч илтгэлийг Монгол AI дуугаар уншуулахад бэлэн (лимит хэмнэлттэй).' : 'Уншуулах тайлангийн текст алга.';
        box.className = 'briefBody';
        box.innerHTML = `<div class='briefMetrics'><div><small>МАШИН</small><b>${money(d.facts.vehicles)}</b></div><div><small>РЕЙС</small><b>${money(d.facts.trips)}</b></div><div><small>ТЭЭВЭР</small><b>${money(d.facts.tons)} тн</b></div><div><small>ТҮЛШ</small><b>${money(d.facts.fuelLiters)} L</b></div></div><div class='briefRisks'><span>⚙ Засвар: <b>${money(d.facts.maintenanceRisk)}</b></span><span>◉ Дугуй: <b>${money(d.facts.tireRisk)}</b></span><span>▤ Баримт: <b>${money(d.facts.documentRisk)}</b></span></div><article class='aiReportText'>${esc(d.report).replace(/\n/g,'<br>')}</article><small class='briefTime'>AI боловсруулсан: ${new Date(d.generatedAt).toLocaleString('mn-MN')}</small>`;
      } catch {
        reportText='';
        voiceBriefText='';
        speakBtn.disabled=true;
        stopBtn.disabled=true;
        voiceStatus.textContent='AI илтгэл гарсны дараа voice идэвхжинэ.';
        box.className = 'formError';
        box.textContent = 'AI илтгэл гаргаж чадсангүй. Шинэчлэх дээр дахин дарна уу.';
      }
    };
    document.querySelector<HTMLButtonElement>('.backDash')!.onclick=()=>activateNav('dashboard');
    document.querySelector<HTMLButtonElement>('#refreshBrief')!.onclick=loadBrief;
    sampleBtn.onclick=()=>{ stopVoice(); const box=document.querySelector<HTMLElement>('#briefContent')!; reportText='Нийт 24 машин бүртгэлтэй байна. Өнөөдөр 18 рейс хийж, 1260 тонн нүүрс тээвэрлэсэн байна. Нийт 2840 литр түлш зарцуулсан. Засварын анхааруулга 2, дугуйн анхааруулга 1, бичиг баримтын хугацааны анхааруулга 1 байна. Өнөөдрийн тээвэрлэлтийн гүйцэтгэл хэвийн байна. Хоёр автомашины засварын явцыг шалгаж, түлшний зарцуулалт өндөр байгаа нэг автомашинд оношилгоо хийхийг зөвлөж байна. Маргаашийн рейсийн хуваарилалтад сул байгаа гурван автомашиныг ашигласнаар тээвэрлэлтийн бүтээмжийг нэмэгдүүлэх боломжтой.'; voiceBriefText='Сайн байна уу. Өнөөдрийн товч илтгэл. Нийт 24 машин, 18 рейс, 1260 тонн нүүрс, 2840 литр түлш. Засвар 2, дугуй 1, баримт 1. Гүйцэтгэл хэвийн. Хоёр машины засварыг шалгаж, түлш өндөр нэг машинд оношилгоо хийнэ үү. Маргааш сул 3 машиныг рейсэд хуваарилбал бүтээмж нэмэгдэнэ.'; speakBtn.disabled=false; speakBtn.textContent='🔊 Монгол AI-аар уншуулах'; voiceStatus.textContent='🔊 Товч жишээ илтгэл уншуулахад бэлэн (лимит хэмнэлттэй).'; box.className='briefBody'; box.innerHTML=`<div class='briefMetrics'><div><small>МАШИН</small><b>24</b></div><div><small>РЕЙС</small><b>18</b></div><div><small>ТЭЭВЭР</small><b>1,260 тн</b></div><div><small>ТҮЛШ</small><b>2,840 L</b></div></div><div class='briefRisks'><span>⚙ Засвар: <b>2</b></span><span>◉ Дугуй: <b>1</b></span><span>▤ Баримт: <b>1</b></span></div><article class='aiReportText'><b>Жишээ AI илтгэл</b><br><br>Өнөөдрийн тээвэрлэлтийн гүйцэтгэл хэвийн байна. 18 рейсээр нийт 1,260 тонн нүүрс тээвэрлэж, 2,840 литр түлш зарцууллаа.<br><br>Анхаарах зүйл: 2 автомашины засварын явцыг шалгах, түлшний зарцуулалт өндөр байгаа 1 автомашинд оношилгоо хийх шаардлагатай. Маргааш сул байгаа 3 автомашиныг рейсэд хуваарилснаар бүтээмж нэмэгдэх боломжтой.</article><small class='briefTime'>Жишээ горим · OpenAI Монгол AI voice туршилт</small>`; };
    loadBrief();
    return;
  }
  if (view === 'admin' && currentRole === 'admin') { main.innerHTML = `<header><div><div class='eyebrow'>SECURITY · ADMIN</div><h1>Хэрэглэгч ба хандалт</h1><p>Урилга, эрх болон системд нэвтэрсэн хэрэглэгчдийн хандалтыг нэг дор хянана.</p></div><button class='backDash'>← Хяналтын самбар</button></header><section class='panel entryPanel'><div class='panelHead'><div><small>ХАНДАЛТЫН БҮРТГЭЛ</small><h2>Системд нэвтэрсэн хэрэглэгчид</h2></div><button id='refreshAccess' class='backDash'>↻ Шинэчлэх</button></div><div id='accessSummary' class='accessSummary'></div><div id='accessLog' class='accessLog'><div class='loading'>Хандалтын бүртгэл уншиж байна...</div></div></section><section class='panel entryPanel'><div class='panelHead'><div><small>ТУРШИЛТЫН ХЭРЭГЛЭГЧИД</small><h2>Хэрэглэгч бүрийн өгөгдлийн төлөв</h2></div><button id='refreshUserData' class='backDash'>↻ Шинэчлэх</button></div><p class='adminPrivacyNote'>Бүртгэлийн агуулгыг задлахгүй. Зөвхөн төрөл тус бүрийн тоо, Demo/Бодит төлөв болон сүүлийн хандалтыг харуулна.</p><div id='userDataSummary' class='accessLog'><div class='loading'>Хэрэглэгчдийн өгөгдлийн төлөв уншиж байна...</div></div></section><section class='panel entryPanel'><div class='panelHead'><div><small>ХЭРЭГЛЭГЧ УРИХ</small><h2>Урилгын холбоос</h2></div><span class='realPill'>7 хоног хүчинтэй</span></div><div class='entryGrid adminGrid'><input id='inviteEmail' type='email' placeholder='Хэрэглэгчийн Gmail'><select id='inviteRole'><option value='dispatcher'>Диспетчер</option><option value='mechanic'>Засварчин</option></select><button id='createInvite'>Урилга үүсгэх</button></div><div id='inviteResult'></div></section><section class='panel entryPanel'><div class='panelHead'><div><small>ЭРХ ОНООХ</small><h2>Хэрэглэгчийн ID</h2></div><span class='realPill'>Admin only</span></div><div class='entryGrid adminGrid'><input id='targetUserId' placeholder='Хэрэглэгчийн ID'><select id='targetRole'><option value='dispatcher'>Диспетчер</option><option value='mechanic'>Засварчин</option></select><button id='saveRole'>Эрх хадгалах</button></div><div id='formMsg'></div></section>`; const loadAccess=async()=>{const box=document.querySelector<HTMLElement>('#accessLog')!;const summary=document.querySelector<HTMLElement>('#accessSummary')!;box.innerHTML=`<div class='loading'>Хандалтын бүртгэл уншиж байна...</div>`;try{const r=await api.get('/api/admin/access-log');const items=(r.data.items||[]) as AccessRecord[];const total=items.reduce((sum,x)=>sum+Number(x.count||0),0);summary.innerHTML=`<div><small>ХЭРЭГЛЭГЧ</small><b>${money(items.length)}</b></div><div><small>НИЙТ ОРОЛДЛОГО</small><b>${money(total)}</b></div>`;box.innerHTML=items.length?items.map(x=>`<div class='accessRow'><div><b>${esc(x.name||'Нэргүй')}</b><small>${esc(x.email||'Имэйлгүй')}</small></div><span class='accessRole ${x.status==='blocked'?'blockedAccess':''}'>${x.status==='blocked'?'Хаагдсан':esc(x.role?roleName[x.role]: 'Зөвшөөрөгдсөн')}</span><span><small>Оролдлого</small><b>${money(Number(x.count||0))}</b></span><span><small>Шалтгаан</small>${esc(x.reason||'—')}</span><span><small>Сүүлд</small>${esc(accessTime(x.lastAccess))}</span></div>`).join(''):`<div class='emptyRecords'>Одоогоор бүртгэгдсэн хандалт алга.</div>`;}catch{summary.innerHTML='';box.innerHTML=`<div class='formError'>Хандалтын бүртгэл ачаалж чадсангүй. Дахин оролдоно уу.</div>`;}}; document.querySelector<HTMLButtonElement>('.backDash')!.onclick=()=>activateNav('dashboard');document.querySelector<HTMLButtonElement>('#refreshAccess')!.onclick=loadAccess;void loadAccess(); const loadUserData=async()=>{const box=document.querySelector<HTMLElement>('#userDataSummary')!;box.innerHTML=`<div class='loading'>Хэрэглэгчдийн өгөгдлийн төлөв уншиж байна...</div>`;try{const r=await api.get('/api/admin/user-data-summary');const items=(r.data.items||[]) as UserDataSummary[];box.innerHTML=items.length?items.map(x=>`<div class='accessRow userDataRow'><div><b>${esc(x.name||'Нэргүй')}</b><small>${esc(x.email||'Имэйлгүй')}</small></div><span class='accessRole ${x.dataMode==='registered'?'realDataMode':'demoDataMode'}'>${x.dataMode==='registered'?'Бодит дата':'Demo'}</span><span><small>Машин / Рейс</small><b>${money(x.counts.vehicles)} / ${money(x.counts.trips)}</b></span><span><small>Түлш / Засвар</small><b>${money(x.counts.fuel)} / ${money(x.counts.maintenance)}</b></span><span><small>Дугуй / Баримт / Жолооч</small><b>${money(x.counts.tires)} / ${money(x.counts.documents)} / ${money(x.counts.drivers)}</b></span><span><small>Нийт бүртгэл</small><b>${money(x.total)}</b></span><span><small>Сүүлд</small>${esc(accessTime(x.lastAccess))}</span></div>`).join(''):`<div class='emptyRecords'>Одоогоор туршилтын хэрэглэгч бүртгэгдээгүй байна.</div>`;}catch{box.innerHTML=`<div class='formError'>Хэрэглэгчдийн өгөгдлийн төлөв ачаалж чадсангүй.</div>`;}};document.querySelector<HTMLButtonElement>('#refreshUserData')!.onclick=loadUserData;void loadUserData(); document.querySelector<HTMLButtonElement>('#createInvite')!.onclick=async()=>{const out=document.querySelector<HTMLElement>('#inviteResult')!;const email=document.querySelector<HTMLInputElement>('#inviteEmail')!.value.trim();try{const r=await api.post('/api/admin/invites',{email,role:document.querySelector<HTMLSelectElement>('#inviteRole')!.value});const url=invitesClient.buildJoinUrl(r.data.code,{path:'/'});out.innerHTML=`<div class='formSuccess'>✓ Урилгын линк бэлэн. Автоматаар имэйл илгээгдэхгүй — доорх аргаар илгээнэ үү.</div><input id='inviteLink' readonly value='${esc(url)}'><button id='shareInvite'>Messenger / Share-аар илгээх</button><button id='emailInvite'>Email нээх</button><button id='copyInvite'>Холбоос хуулах</button>`;document.querySelector<HTMLButtonElement>('#copyInvite')!.onclick=async()=>{await navigator.clipboard.writeText(url);out.querySelector('.formSuccess')!.textContent='✓ Холбоос хуулагдлаа';};document.querySelector<HTMLButtonElement>('#shareInvite')!.onclick=async()=>{const text=`COAL AI системийн урилга: ${url}`;try{if(navigator.share){await navigator.share({title:'COAL AI системийн урилга',text,url});out.querySelector('.formSuccess')!.textContent='✓ Share цэс нээгдлээ';}else{await navigator.clipboard.writeText(text);out.querySelector('.formSuccess')!.textContent='✓ Share дэмжихгүй тул урилгын линк хуулагдлаа';}}catch{out.querySelector('.formSuccess')!.textContent='Урилгын линк бэлэн хэвээр байна.';}};document.querySelector<HTMLButtonElement>('#emailInvite')!.onclick=()=>{const subject=encodeURIComponent('COAL AI системийн урилга');const body=encodeURIComponent(`COAL AI системд нэвтрэх урилга:\n${url}\n\nЛинкийг Chrome эсвэл Safari-д нээгээд Google-ээр нэвтэрнэ үү.`);location.href=`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;};}catch{out.innerHTML=`<div class='formError'>Урилга үүссэнгүй. Gmail болон эрхээ шалгана уу.</div>`;}}; document.querySelector<HTMLButtonElement>('#saveRole')!.onclick=async()=>{const msg=document.querySelector<HTMLElement>('#formMsg')!;try{const r=await api.post('/api/admin/roles',{userId:document.querySelector<HTMLInputElement>('#targetUserId')!.value,role:document.querySelector<HTMLSelectElement>('#targetRole')!.value});msg.innerHTML=`<div class='formSuccess'>✓ ${esc(r.data.message)}</div>`;}catch{msg.innerHTML=`<div class='formError'>Эрх хадгалагдсангүй. ID-г шалгана уу.</div>`;}}; return; }
  const v = demoViews[view];
  if (!v) return;
  const realMode = ['vehicles','trips','fuel','maintenance','tires','drivers','documents'].includes(view);
  main.innerHTML = `<header><div><div class='eyebrow'>COAL AI · ${realMode ? 'OPERATIONS' : 'DEMO MODULE'}</div><h1>${v.title}</h1><p>${v.subtitle}</p></div><button class='backDash'>← Хяналтын самбар</button></header><section class='moduleHero'><span class='heroTag'>${realMode ? 'PERSISTENT REGISTRATION' : 'CUSTOMER TEST READY'}</span><h2>${v.title}</h2><p>${realMode ? 'Шинээр оруулсан мэдээлэл системийн өгөгдлийн санд хадгалагдана.' : `${v.subtitle}. Одоогоор demo өгөгдөл ашиглаж байна.`}</p></section><section class='moduleStats'>${v.cards.map(c => `<div class='stat'><small>${c[0]}</small><b>${c[1]}</b><em>${c[2]}</em></div>`).join('')}</section>${realMode ? registrationForm(view) : `<section class='panel moduleTable'><div class='panelHead'><div><small>ҮЙЛ АЖИЛЛАГААНЫ МЭДЭЭЛЭЛ</small><h2>Demo бүртгэл</h2></div><span class='demoPill'>Demo data</span></div>${v.rows.map(r => `<div class='moduleRow'>${r.map((x,i) => i === 0 ? `<b>${x}</b>` : `<span>${x}</span>`).join('')}</div>`).join('')}</section>`}`;
  document.querySelector<HTMLButtonElement>('.backDash')!.onclick = () => activateNav('dashboard');
  if (realMode) { bindRegistration(view); renderRecords(view); }
}
function activateNav(view: string) {
  document.querySelectorAll<HTMLButtonElement>('.nav').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  document.querySelector('aside')?.classList.remove('menuOpen');
  const menu=document.querySelector<HTMLButtonElement>('#mobileMenu');
  if(menu)menu.setAttribute('aria-expanded','false');
  showView(view);
}
function applySessionUI() { const badge=document.querySelector<HTMLElement>('#userRole'); if(badge) badge.textContent=roleName[currentRole]; const out=document.querySelector<HTMLButtonElement>('#signOut'); if(out) out.onclick=async()=>{await auth.signOut(); location.reload();}; document.querySelectorAll<HTMLButtonElement>('.nav').forEach(b=>{const v=b.dataset.view||''; b.style.display=currentRole==='mechanic'&&!['dashboard','dailybrief','vehicles','maintenance','tires','documents'].includes(v)?'none':'';}); if(currentRole==='admin'&&!document.querySelector('[data-view=admin]')){const b=document.createElement('button');b.className='nav';b.dataset.view='admin';b.textContent='⚙ Эрхийн удирдлага';b.onclick=()=>activateNav('admin');document.querySelector('nav')?.appendChild(b);} }
function showAuthGate(html: string) {
  document.querySelectorAll('.authGate').forEach(x => x.remove());
  const gate = document.createElement('div');
  gate.className = 'authGate';
  gate.innerHTML = html;
  document.body.appendChild(gate);
  return gate;
}

function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function bootstrap() {
  const userAgent = navigator.userAgent || '';
  const query = new URLSearchParams(location.search);
  const inAppBrowser = query.get('qa_inapp') === '1' || /FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(userAgent);
  if (false && inAppBrowser) {
    const externalUrl = location.href.replace(/([?&])qa_inapp=1(&|$)/, (_m, prefix, tail) => tail ? prefix : '').replace(/[?&]$/, '');
    const isAndroid = /Android/i.test(userAgent);
    const gate = showAuthGate(`<div class='authCard inAppCard'><div class='logoMark'>C</div><span class='heroTag'>MESSENGER BROWSER</span><h1>Chrome / Safari-д нээнэ үү</h1><p>Messenger болон Facebook-ийн дотоод browser Google нэвтрэлтийн popup-ийг найдвартай дэмждэггүй. Урилгын холбоосыг алдахгүйгээр гадаад browser-д нээгээд Google-ээр нэвтэрнэ үү.</p>${isAndroid ? `<button id='openChrome'>Chrome-д нээх</button>` : ''}<button id='copyExternal' class='secondaryAuth'>Холбоос хуулах</button><div class='browserHint'>Messenger-ийн ⋯ цэснээс “Open in browser” / “Open externally” сонгож болно.</div><div id='authMsg'></div></div>`);
    const msg = gate.querySelector<HTMLElement>('#authMsg')!;
    const copy = gate.querySelector<HTMLButtonElement>('#copyExternal')!;
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(externalUrl); msg.textContent = 'Холбоос хуулагдлаа. Chrome эсвэл Safari-д paste хийгээд нээнэ үү.'; }
      catch { msg.textContent = externalUrl; }
    };
    const openChrome = gate.querySelector<HTMLButtonElement>('#openChrome');
    if (openChrome) openChrome.onclick = () => {
      const u = new URL(externalUrl);
      location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
    };
    return;
  }

  const pendingInvite = invitesClient.getPendingCode();

  if (!(await auth.isSignedIn())) {
    guestMode = true;
    document.querySelectorAll('.authGate').forEach(x => x.remove());
    const badge=document.querySelector<HTMLElement>('#userRole'); if(badge) badge.textContent='Зочин · Demo';
    const login=document.querySelector<HTMLButtonElement>('#signOut'); if(login){ login.textContent='Google-ээр нэвтрэх'; login.onclick=async()=>{ try{ await auth.signIn({scope:'openid email profile offline_access'}); location.reload(); }catch{ alert('Google нэвтрэлт амжилтгүй. Дахин оролдоно уу.'); } }; }
    document.querySelectorAll<HTMLButtonElement>('.nav').forEach(b=>{ if((b.dataset.view||'')!=='dashboard') b.style.display='none'; });
    load();
    return;
  }

  showAuthGate(`<div class='authCard'><div class='logoMark'>C</div><span class='heroTag'>VERIFYING ACCESS</span><h1>Нэвтрэлтийг шалгаж байна</h1><p>Таны эрх болон урилгыг шалгаж байна...</p></div>`);

  let signedInUser;
  try {
    signedInUser = await withTimeout(auth.getUser());
  } catch {
    const gate = showAuthGate(`<div class='authCard'><div class='logoMark'>C</div><span class='heroTag'>AUTH TIMEOUT</span><h1>Нэвтрэлт удааширлаа</h1><p>Google нэвтрэлтийн шалгалт хэт удаж байна. Дахин шалгах эсвэл Google хаягаа сольж болно.</p><button id='retryAuth'>Дахин шалгах</button><button id='authSignOut'>Google хаягаа солих</button></div>`);
    gate.querySelector<HTMLButtonElement>('#retryAuth')!.onclick = () => location.reload();
    gate.querySelector<HTMLButtonElement>('#authSignOut')!.onclick = async () => { await auth.signOut().catch(() => undefined); location.reload(); };
    return;
  }
  if (!signedInUser) {
    await auth.signOut().catch(() => undefined);
    showAuthGate(`<div class='authCard'><div class='logoMark'>C</div><h1>Нэвтрэлт баталгаажаагүй</h1><p>Google нэвтрэлтийн мэдээлэл баталгаажаагүй байна.</p><button id='retrySignIn'>Дахин нэвтрэх</button></div>`);
    document.querySelector<HTMLButtonElement>('#retrySignIn')!.onclick = () => location.reload();
    return;
  }

  if (pendingInvite) {
    try {
      await withTimeout(api.post(`/api/invites/${encodeURIComponent(pendingInvite)}/join`, {}));
      invitesClient.clearPendingCode();
    } catch {
      const gate = showAuthGate(`<div class='authCard'><div class='logoMark'>C</div><span class='heroTag'>INVITE CHECK</span><h1>Урилгыг баталгаажуулж чадсангүй</h1><p>Урилгын шалгалт удааширсан эсвэл урилга энэ Google хаягт тохирохгүй байна. Урилгын код хадгалагдсан тул дахин шалгаж болно.</p><button id='retryInvite'>Дахин шалгах</button><button id='inviteSignOut'>Өөр Google хаягаар нэвтрэх</button></div>`);
      gate.querySelector<HTMLButtonElement>('#retryInvite')!.onclick = () => location.reload();
      gate.querySelector<HTMLButtonElement>('#inviteSignOut')!.onclick = async () => { invitesClient.clearPendingCode(); await auth.signOut(); location.reload(); };
      return;
    }
  }

  try {
    const r = await withTimeout(api.get('/api/me'));
    const access = r.data as { authorized?: boolean; role?: Role };
    if (!access.authorized) {
      const gate = showAuthGate(`<div class='authCard'><div class='logoMark'>C</div><span class='heroTag'>ACCESS REQUIRED</span><h1>Админы урилга шаардлагатай</h1><p>${esc(signedInUser.email || 'Энэ Google хаяг')} одоогоор системд бүртгэлгүй байна. Админаас урилгын холбоос аваад дахин нэвтэрнэ үү.</p><button id='blockedSignOut'>Өөр Google хаягаар нэвтрэх</button></div>`);
      gate.querySelector<HTMLButtonElement>('#blockedSignOut')!.onclick = async () => { await auth.signOut(); location.reload(); };
      return;
    }
    currentRole = access.role as Role;
    document.querySelectorAll('.authGate').forEach(x => x.remove());
    applySessionUI();
    load();
  } catch {
    const gate = showAuthGate(`<div class='authCard'><div class='logoMark'>C</div><span class='heroTag'>CHECK FAILED</span><h1>Нэвтрэлтийн шалгалт дууссангүй</h1><p>Сүлжээ эсвэл серверийн хариу удааширлаа. Энэ дэлгэц дээр гацахгүй, доорх товчоор дахин шалгана уу.</p><button id='retryAccess'>Дахин шалгах</button><button id='accessSignOut'>Google хаягаа солих</button></div>`);
    gate.querySelector<HTMLButtonElement>('#retryAccess')!.onclick = () => location.reload();
    gate.querySelector<HTMLButtonElement>('#accessSignOut')!.onclick = async () => { await auth.signOut().catch(() => undefined); location.reload(); };
  }
}
function bindDashboard() {
  const talk=document.querySelector<HTMLButtonElement>('#siilenTalk'); if(talk)talk.onclick=talkDispatcher;
  siilenWakeMode=false; siilenAwake=false;
  (document.querySelector('#ask') as HTMLButtonElement).onclick = () => { const q = document.querySelector<HTMLInputElement>('#q')!; ask(q.value); q.value = ''; };
  (document.querySelector('#q') as HTMLInputElement).onkeydown = e => { if (e.key === 'Enter') (document.querySelector('#ask') as HTMLButtonElement).click(); };
  document.querySelectorAll<HTMLButtonElement>('[data-q]').forEach(b => b.onclick = () => ask(b.dataset.q || ''));
}
bindDashboard();
document.querySelectorAll<HTMLButtonElement>('.nav').forEach(b => b.onclick = () => activateNav(b.dataset.view || 'dashboard'));
const mobileMenu=document.querySelector<HTMLButtonElement>('#mobileMenu');
if(mobileMenu)mobileMenu.onclick=()=>{const aside=document.querySelector('aside');const open=aside?.classList.toggle('menuOpen')||false;mobileMenu.setAttribute('aria-expanded',String(open));mobileMenu.textContent=open?'✕':'☰';};
bootstrap().catch((e) => { console.error('Bootstrap failed', e); const gate = showAuthGate(`<div class='authCard'><div class='logoMark'>C</div><span class='heroTag'>LOGIN ERROR</span><h1>Нэвтрэлтийг дуусгаж чадсангүй</h1><p>Хуудас хоосон үлдэхээс хамгаалж энэ дэлгэцийг харуулж байна. Дахин ачаалаад оролдоно уу.</p><button id='retryBootstrap'>Дахин ачаалах</button><button id='forceSignOut'>Google хаягаа солих</button></div>`); gate.querySelector<HTMLButtonElement>('#retryBootstrap')!.onclick = () => location.reload(); gate.querySelector<HTMLButtonElement>('#forceSignOut')!.onclick = async () => { await auth.signOut().catch(() => undefined); location.reload(); }; });
