import { router, json, error, ai, db, storage, invites, isInviteError, requireAuth, requireAdminEmailAllowlist, secrets } from '@appdeploy/sdk';

type Fleet = {
  plate: string;
  driver: string;
  status: string;
  trips: number;
  tons: number;
  fuel: number;
};
const fleet: Fleet[] = [
  {
    plate: 'ӨМӨ 8214',
    driver: 'Б. Батсайхан',
    status: 'Тээвэрт',
    trips: 4,
    tons: 152,
    fuel: 438,
  },
  {
    plate: 'ӨМӨ 7741',
    driver: 'Д. Тэмүүлэн',
    status: 'Тээвэрт',
    trips: 3,
    tons: 114,
    fuel: 321,
  },
  {
    plate: 'ӨМӨ 6108',
    driver: 'Г. Мөнхтөр',
    status: 'Засварт',
    trips: 0,
    tons: 0,
    fuel: 0,
  },
  {
    plate: 'ӨМӨ 9320',
    driver: 'Н. Энхбат',
    status: 'Тээвэрт',
    trips: 4,
    tons: 148,
    fuel: 512,
  },
  {
    plate: 'ӨМӨ 5582',
    driver: 'С. Батзориг',
    status: 'Сул',
    trips: 0,
    tons: 0,
    fuel: 0,
  },
];
async function seed() {
  const x = await db.list('daily_ops', { limit: 1 });
  if (!x.items.length)
    await db.add('daily_ops', [
      {
        date: '2026-09-12',
        vehicles: 42,
        active: 34,
        repair: 5,
        idle: 3,
        trips: 164,
        tons: 6420,
        fuel: 18730,
      },
    ]);
}
const ADMIN_EMAILS = ['btvmentogoo@gmail.com'];
type Role = 'admin' | 'dispatcher' | 'mechanic';
async function getRole(user: { userId:string; email?:string }): Promise<Role> { if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return 'admin'; const member=(await db.list<{role:Role}>(userTable('company_membership',user.userId),{limit:1})).items[0]; if(member)return member.role; const { items } = await db.list<{ role:Role }>(`roles:${user.userId}`, { limit:1 }); return items[0]?.role || 'dispatcher'; }
function roleGuard(allowed: Role[]) { return async (ctx: { user?: { userId:string; email?:string } }) => { if (!ctx.user) return error('Нэвтрэх шаардлагатай.', 401); const role = await getRole(ctx.user); if (!allowed.includes(role)) return error('Энэ үйлдлийг хийх эрхгүй байна.', 403); }; }
const userTable = (base:string, userId:string) => `${base}:${userId}`;
const ACCESS_TABLE = 'access_log_all';
type AccessRecord = { userId:string; email:string; name:string; role?:Role; count:number; firstAccess:string; lastAccess:string; status:'allowed'|'blocked'; reason?:string };
async function recordAccess(user:{userId:string;email?:string;name?:string},status:'allowed'|'blocked',role?:Role,reason=''){const now=new Date().toISOString();const page=await db.list<AccessRecord>(ACCESS_TABLE,{limit:100});const existing=page.items.find(x=>x.userId===user.userId);const record:AccessRecord={userId:user.userId,email:user.email||'',name:user.name||'',role,count:(existing?.count||0)+1,firstAccess:existing?.firstAccess||now,lastAccess:now,status,reason};if(existing)await db.update(ACCESS_TABLE,[{id:existing.id,record}]);else await db.add(ACCESS_TABLE,[record]);}

async function buildDailyBrief(userId:string) {
  const [vehiclesPage,tripsPage,fuelsPage,maintenancePage,tiresPage,documentsPage] = await Promise.all([
    db.list<{plate:string;status:string}>(userTable('vehicles',userId),{limit:100}),
    db.list<{plate:string;tons:number;createdAt?:string}>(userTable('trips',userId),{limit:100}),
    db.list<{plate:string;liters:number;createdAt?:string}>(userTable('fuel_logs',userId),{limit:100}),
    db.list<{plate:string;status:string}>(userTable('maintenance',userId),{limit:100}),
    db.list<{plate:string;position:string;treadDepth:number;replaceDate:string}>(userTable('tires',userId),{limit:100}),
    db.list<{name:string;expiryDate:string}>(userTable('documents',userId),{limit:100}),
  ]);
  const today = new Date();
  today.setHours(0,0,0,0);
  const dayKey = today.toISOString().slice(0,10);
  const todayTrips = tripsPage.items.filter(x => !x.createdAt || x.createdAt.slice(0,10) === dayKey);
  const todayFuels = fuelsPage.items.filter(x => !x.createdAt || x.createdAt.slice(0,10) === dayKey);
  const tons = todayTrips.reduce((sum,x)=>sum+Number(x.tons||0),0);
  const liters = todayFuels.reduce((sum,x)=>sum+Number(x.liters||0),0);
  const repair = maintenancePage.items.filter(x=>x.status==='Засварт').length;
  const tireRisk = tiresPage.items.filter(x=>{const days=x.replaceDate?Math.ceil((new Date(`${x.replaceDate}T00:00:00`).getTime()-today.getTime())/86400000):9999;return (Number(x.treadDepth)>0&&Number(x.treadDepth)<=3)||days<=30;}).length;
  const documentRisk = documentsPage.items.filter(x=>{if(!x.expiryDate)return false;const days=Math.ceil((new Date(`${x.expiryDate}T00:00:00`).getTime()-today.getTime())/86400000);return days<=30;}).length;
  const facts = {date:dayKey,vehicles:vehiclesPage.items.length,active:vehiclesPage.items.filter(x=>x.status==='Тээвэрт').length,trips:todayTrips.length,tons,fuelLiters:liters,maintenanceRisk:repair,tireRisk,documentRisk};
  const generated = await ai.generate({system:'Та нүүрс тээврийн компанийн удирдлагад зориулсан Монгол хэлтэй ахлах үйл ажиллагааны шинжээч. Зөвхөн өгсөн тоон баримтад тулгуурла, баримт зохиохгүй. Өдрийн илтгэлийг дэлгэрэнгүй, удирдлагын хурал дээр 3-5 минут уншихад тохирох хэмжээтэй бич. 1. Өдрийн ерөнхий дүгнэлт 2. Гол үзүүлэлтүүдийн дэлгэрэнгүй тайлбар 3. Тээвэр ба флотын ашиглалт 4. Түлшний нөхцөл 5. Засвар, дугуй, бичиг баримтын эрсдэл 6. Удирдлагын анхаарах асуудлууд 7. Маргааш хийх 5 ажил гэсэн бүтэцтэй, бүтэн өгүүлбэрээр тайлагна. Өгөгдөл байхгүй үзүүлэлтийг байхгүй гэж тодорхой хэл.',prompt:`Өдрийн бүртгэлийн нэгтгэл: ${JSON.stringify(facts)}`,thinkingMode:'FAST',maxTokens:1800,temperature:0.2});
  return {facts,report:generated.text,generatedAt:new Date().toISOString()};
}
export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/demo-dashboard': [async () => json({ vehicles:42, active:34, repair:5, idle:3, trips:164, tons:6420, fuel:18730, dataMode:'demo', fleet, alerts:[{level:'high',text:'ӨМӨ 9320: demo түлшний зарцуулалт флотын дунджаас өндөр байна.'},{level:'medium',text:'ӨМӨ 6108: demo засварын төлөвтэй байна.'},{level:'medium',text:'3 demo машин сул байна.'}] })],
  'GET /api/me': [requireAuth(), async ({ user }) => { const isAdmin=Boolean(user!.email&&ADMIN_EMAILS.includes(user!.email.toLowerCase())); let membership=(await db.list<{role:Role}>(userTable('company_membership',user!.userId),{limit:1})).items[0]; const assigned=(await db.list<{role:Role}>(`roles:${user!.userId}`,{limit:1})).items[0]; if(!isAdmin&&!membership&&!assigned){const role:Role='dispatcher';await db.add(userTable('company_membership',user!.userId),[{role,joinedAt:new Date().toISOString(),source:'direct-signin'}]);membership={role};} const role:Role=isAdmin?'admin':(assigned?.role||membership?.role||'dispatcher'); await recordAccess(user!,'allowed',role,'Шууд Google нэвтрэлтээр амжилттай орсон'); return json({authorized:true,userId:user!.userId,email:user!.email,name:user!.name,role}); }],
  'GET /api/admin/access-log': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => { const page=await db.list<AccessRecord>(ACCESS_TABLE,{limit:100}); const items=page.items.sort((a,b)=>b.lastAccess.localeCompare(a.lastAccess)); return json({items}); }],
  'GET /api/admin/oyun-readonly': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => {
    const access=(await db.list<AccessRecord>(ACCESS_TABLE,{limit:100})).items;
    const users=await Promise.all(access.map(async x=>{
      const [vehicles,trips,fuels,maintenance,tires,documents,drivers]=await Promise.all([
        db.list(userTable('vehicles',x.userId),{limit:100}), db.list(userTable('trips',x.userId),{limit:100}), db.list(userTable('fuel_logs',x.userId),{limit:100}), db.list(userTable('maintenance',x.userId),{limit:100}), db.list(userTable('tires',x.userId),{limit:100}), db.list(userTable('documents',x.userId),{limit:100}), db.list(userTable('drivers',x.userId),{limit:100})
      ]);
      const counts={vehicles:vehicles.items.length,trips:trips.items.length,fuel:fuels.items.length,maintenance:maintenance.items.length,tires:tires.items.length,documents:documents.items.length,drivers:drivers.items.length};
      return {userId:x.userId,email:x.email,name:x.name,role:x.role,lastAccess:x.lastAccess,counts,total:Object.values(counts).reduce((s,n)=>s+n,0)};
    }));
    const totals=users.reduce((a,u)=>({users:a.users+1,vehicles:a.vehicles+u.counts.vehicles,trips:a.trips+u.counts.trips,fuelRecords:a.fuelRecords+u.counts.fuel,maintenance:a.maintenance+u.counts.maintenance,tires:a.tires+u.counts.tires,documents:a.documents+u.counts.documents,drivers:a.drivers+u.counts.drivers}),{users:0,vehicles:0,trips:0,fuelRecords:0,maintenance:0,tires:0,documents:0,drivers:0});
    return json({mode:'read-only',generatedAt:new Date().toISOString(),totals,users});
  }],
  'GET /api/admin/user-data-summary': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => {
    const access=(await db.list<AccessRecord>(ACCESS_TABLE,{limit:100})).items.sort((a,b)=>b.lastAccess.localeCompare(a.lastAccess));
    const items=await Promise.all(access.map(async x=>{
      const [vehicles,trips,fuels,maintenance,tires,documents,drivers]=await Promise.all([
        db.list(userTable('vehicles',x.userId),{limit:100}), db.list(userTable('trips',x.userId),{limit:100}), db.list(userTable('fuel_logs',x.userId),{limit:100}), db.list(userTable('maintenance',x.userId),{limit:100}), db.list(userTable('tires',x.userId),{limit:100}), db.list(userTable('documents',x.userId),{limit:100}), db.list(userTable('drivers',x.userId),{limit:100})
      ]);
      const counts={vehicles:vehicles.items.length,trips:trips.items.length,fuel:fuels.items.length,maintenance:maintenance.items.length,tires:tires.items.length,documents:documents.items.length,drivers:drivers.items.length};
      const total=Object.values(counts).reduce((sum,n)=>sum+n,0);
      return {userId:x.userId,email:x.email,name:x.name,role:x.role,status:x.status,lastAccess:x.lastAccess,accessCount:x.count,dataMode:total>0?'registered':'demo',counts,total};
    }));
    return json({items});
  }],
  'POST /api/admin/invites': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({ body, user }) => { const d=body as {email?:string;role?:Role}; if(!d.email?.trim()||!['dispatcher','mechanic'].includes(d.role||''))return error('Имэйл болон эрхээ зөв сонгоно уу.',400); try{const created=await invites.create({resourceType:'coal_company',authMode:'required',actor:user!,allowList:[d.email.trim().toLowerCase()],expiresInSec:604800,context:{role:d.role}});return json({code:created.code});}catch(err){if(isInviteError(err))return error(err.code,400);throw err;} }],
  'GET /api/invites/:code': [async ({ params }) => { try{return json(await invites.resolve({code:params.code}));}catch(err){if(isInviteError(err))return error(err.code,400);throw err;} }],
  'POST /api/invites/:code/join': [requireAuth(), async ({ params, user }) => { try{const joined=await invites.join({code:params.code,actor:user!});const role:Role=joined.context?.role==='mechanic'?'mechanic':'dispatcher';const table=userTable('company_membership',user!.userId);const current=(await db.list<{role:Role}>(table,{limit:1})).items[0];if(current)await db.update(table,[{id:current.id,record:{role,joinedAt:new Date().toISOString()}}]);else await db.add(table,[{role,joinedAt:new Date().toISOString()}]);await recordAccess(user!,'allowed',role,'Урилгаар амжилттай нэгдсэн');return json({message:'Компанийн системд амжилттай нэгдлээ.',role});}catch(err){if(isInviteError(err)){await recordAccess(user!,'blocked',undefined,`Урилгын алдаа: ${err.code}`);return error(err.code,400);}throw err;} }],
  'POST /api/admin/roles': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({ body }) => { const d = body as { userId?:string; role?:Role }; if (!d.userId?.trim() || !['dispatcher','mechanic'].includes(d.role || '')) return error('Хэрэглэгчийн ID болон зөв эрх сонгоно уу.',400); const table = `roles:${d.userId.trim()}`; const { items } = await db.list<{ role:Role }>(table,{limit:1}); if (items[0]) await db.update(table,[{id:items[0].id,record:{role:d.role}}]); else await db.add(table,[{role:d.role}]); return json({message:`Хэрэглэгчийн эрх ${d.role} боллоо.`}); }],
  'GET /api/daily-brief': [
    requireAuth(),
    roleGuard(['admin','dispatcher','mechanic']),
    async ({ user }) => {
      try {
        return json(await buildDailyBrief(user!.userId));
      } catch (e) {
        console.error('Daily AI brief failed',e);
        return error('AI өдрийн илтгэл түр гарсангүй. Дахин оролдоно уу.',503);
      }
    },
  ],
  'POST /api/tts': [
    requireAuth(),
    roleGuard(['admin','dispatcher','mechanic']),
    async ({ body }) => {
      const data = body as { text?: string };
      const text = data.text?.trim().slice(0, 900) || '';
      if (!text) return error('Уншуулах текст шаардлагатай.', 400);
      try {
        const names = await secrets.listSecretNames();
        if (!names.includes('OPENAI_API_KEY')) return error('Монгол AI voice тохируулагдаагүй байна.', 503);
        const apiKey = await secrets.readSecret('OPENAI_API_KEY');
        const voices = ['alloy', 'marin'];
        let lastStatus = 0;
        let lastCode = '';
        for (const voice of voices) {
          const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, instructions: 'Монгол хэлээр тод, байгалийн аялгатай, мэргэжлийн тайлан уншиж байгаа мэт тайван хурдаар унш. Тоо, нэгж, автомашины мэдээллийг ойлгомжтой дууд.' }),
          });
          if (response.ok) {
            const audio = Buffer.from(await response.arrayBuffer()).toString('base64');
            return json({ ok: true, audio, mimeType: 'audio/mpeg', voice });
          }
          lastStatus = response.status;
          try {
            const failure = await response.json() as { error?: { code?: string } };
            lastCode = failure.error?.code || '';
          } catch {
            lastCode = '';
          }
          console.error('OpenAI TTS failed', { status: lastStatus, code: lastCode, voice });
          if (lastStatus === 401 || lastStatus === 403 || lastStatus === 429) break;
        }
        const message = lastStatus === 401 ? 'OpenAI API key хүчингүй эсвэл цуцлагдсан байна.' : lastStatus === 403 ? 'OpenAI API key-д Speech ашиглах эрх алга байна.' : lastStatus === 429 ? 'OpenAI API-ийн төлбөр, кредит эсвэл хэрэглээний лимит хүрсэн байна.' : 'OpenAI Speech хүсэлт амжилтгүй боллоо. Model эсвэл voice тохиргоог шалгана уу.';
        return json({ ok: false, message, status: lastStatus, code: lastCode });
      } catch (e) {
        console.error('TTS route failed', e);
        return error('Монгол AI дуу түр ажиллахгүй байна.', 503);
      }
    },
  ],
  'POST /api/stt': [
    requireAuth(),
    roleGuard(['admin','dispatcher','mechanic']),
    async ({ body }) => {
      const data = body as { audio?: string; mimeType?: string };
      const audioB64 = (data.audio || '').replace(/\s/g, '');
      if (!audioB64 || audioB64.length < 200) return error('Аудио хоосон эсвэл хэт богино. 3+ секунд ярина уу.', 400);
      if (audioB64.length > 10_000_000) return error('Аудио хэт урт байна. Богинохон ярина уу.', 400);
      try {
        const names = await secrets.listSecretNames();
        if (!names.includes('GEMINI_API_KEY')) return error('Gemini STT тохируулагдаагүй. GEMINI_API_KEY secret нэмнэ үү.', 503);
        const apiKey = await secrets.readSecret('GEMINI_API_KEY');
        let mimeType = (data.mimeType || 'audio/webm').split(';')[0].trim().toLowerCase() || 'audio/webm';
        if (mimeType === 'audio/mp4') mimeType = 'audio/mp4';
        if (mimeType === 'video/webm') mimeType = 'audio/webm';
        const prompt = 'Transcribe the spoken words in this audio to Mongolian Cyrillic text. Output ONLY the transcript text, nothing else. If the speech is Mongolian, write it in Cyrillic. Do not add quotes, labels, or explanations.';
        const models = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.8-flash'];
        let lastErr = '';
        let lastBlock = '';
        for (const model of models) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const payloads = [
            { contents: [{ parts: [ { text: prompt }, { inlineData: { mimeType: mimeType, data: audioB64 } } ] }], generationConfig: { temperature: 0, maxOutputTokens: 1024 } },
            { contents: [{ role: 'user', parts: [ { text: prompt }, { inline_data: { mime_type: mimeType, data: audioB64 } } ] }], generationConfig: { temperature: 0, maxOutputTokens: 1024 } },
          ];
          for (const bodyJson of payloads) {
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
              body: JSON.stringify(bodyJson),
            });
            if (!response.ok) {
              const errBody = await response.text().catch(() => '');
              lastErr = `HTTP ${response.status}`;
              console.error('Gemini STT failed', model, response.status, errBody.slice(0, 400));
              if (response.status === 401 || response.status === 403) return error('Gemini API key хүчингүй эсвэл эрхгүй.', 401);
              if (response.status === 429) return error('Gemini quota хэтэрсэн. Түр хүлээгээд дахин оролдоно уу.', 429);
              continue;
            }
            const result = await response.json() as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
              promptFeedback?: { blockReason?: string };
            };
            if (result.promptFeedback?.blockReason) {
              lastBlock = result.promptFeedback.blockReason;
              continue;
            }
            const text = (result.candidates?.[0]?.content?.parts || []).map(p => (p.text || '')).join('').trim()
              .replace(/^["`'«»]+|["`'«»]+$/g, '')
              .replace(/^(transcript|transcription|текст|бичвэр)\s*[:：-]\s*/i, '')
              .trim();
            if (text && text.length > 0 && !/^(n\/?a|none|empty|silence|no speech|яриа байхгүй)/i.test(text)) {
              return json({ ok: true, text, model, mimeType, audioChars: audioB64.length });
            }
            lastErr = result.candidates?.[0]?.finishReason || 'empty_text';
          }
        }
        return json({ ok: false, text: '', message: `Яриа танигдсангүй (${lastErr || lastBlock || 'empty'}). Илүү чанга, тод, 3–8 сек ярина уу.`, audioChars: audioB64.length, mimeType });
      } catch (e) {
        console.error('STT route failed', e);
        return error('Дуу танилт түр ажиллахгүй байна.', 503);
      }
    },
  ],
  'GET /api/dashboard': [
    requireAuth(),
    async ({ user }) => {
      await seed();
      const d = (
        await db.list<{
          vehicles: number;
          active: number;
          repair: number;
          idle: number;
          trips: number;
          tons: number;
          fuel: number;
        }>('daily_ops', { limit: 1 })
      ).items[0];
      const vehicles = (await db.list<{ plate:string; model:string; driver:string; status:string }>(userTable('vehicles',user!.userId), { limit: 100 })).items;
      const trips = (await db.list<{ plate:string; route:string; tons:number; status:string }>(userTable('trips',user!.userId), { limit: 100 })).items;
      const fuels = (await db.list<{ plate:string; liters:number; odometer:number; note:string }>(userTable('fuel_logs',user!.userId), { limit: 100 })).items;
      const maintenance = (await db.list<{ plate:string; type:string; cost:number; status:string }>(userTable('maintenance',user!.userId), { limit: 100 })).items;
      const documents = (await db.list<{ type:string; name:string; expiryDate:string }>(userTable('documents',user!.userId), { limit: 100 })).items;
      const tires = (await db.list<{ plate:string; position:string; brand:string; serial:string; treadDepth:number; replaceDate:string; status:string }>(userTable('tires',user!.userId), { limit: 100 })).items;
      const today = new Date(); today.setHours(0,0,0,0);
      const expiringDocs = documents.map(x => ({...x, days:Math.ceil((new Date(`${x.expiryDate}T00:00:00`).getTime()-today.getTime())/86400000)})).filter(x => x.days <= 30).sort((a,b)=>a.days-b.days);
      const tireAlerts=tires.map(x=>{const days=x.replaceDate?Math.ceil((new Date(`${x.replaceDate}T00:00:00`).getTime()-today.getTime())/86400000):9999;return {...x,days};}).filter(x=>(x.treadDepth>0&&x.treadDepth<=3)||x.days<=30);
      const hasRealData = vehicles.length + trips.length + fuels.length + maintenance.length + documents.length + tires.length > 0;
      const active = vehicles.filter(v => v.status === 'Тээвэрт').length;
      const repair = vehicles.filter(v => v.status === 'Засварт').length;
      const idle = vehicles.filter(v => v.status === 'Сул').length;
      const realTons = trips.reduce((sum, x) => sum + Number(x.tons || 0), 0);
      const realFuel = fuels.reduce((sum, x) => sum + Number(x.liters || 0), 0);
      const fleetRows = vehicles.slice(0, 20).map(v => ({ plate:v.plate, driver:v.driver || 'Жолоочгүй', status:v.status, trips:trips.filter(t => t.plate === v.plate).length, tons:trips.filter(t => t.plate === v.plate).reduce((sum,t) => sum + Number(t.tons || 0), 0), fuel:fuels.filter(f => f.plate === v.plate).reduce((sum,f) => sum + Number(f.liters || 0), 0) }));
      const overdue = maintenance.filter(m => m.status === 'Засварт').length;
      return json({
        ...(hasRealData ? { vehicles:vehicles.length, active, repair, idle, trips:trips.length, tons:realTons, fuel:realFuel } : d),
        dataMode: hasRealData ? 'registered' : 'demo',
        fleet: hasRealData && fleetRows.length ? fleetRows : fleet,
        alerts: hasRealData ? [
          ...(overdue ? [{ level:'medium', text:`${overdue} засварын ажил үргэлжилж байна — явцыг шалгана уу.` }] : []),
          ...(idle ? [{ level:'medium', text:`${idle} машин сул байна — рейсийн хуваарилалтыг шалгах боломжтой.` }] : []),
          ...expiringDocs.slice(0,3).map(x => ({ level:x.days <= 7 ? 'high' : 'medium', text:x.days < 0 ? `${x.name}: хугацаа ${Math.abs(x.days)} хоногоор хэтэрсэн.` : `${x.name}: ${x.days} хоногийн дараа хугацаа дуусна.` })),
          ...tireAlerts.slice(0,3).map(x=>({level:x.treadDepth>0&&x.treadDepth<=3?'high':'medium',text:x.treadDepth>0&&x.treadDepth<=3?`${x.plate} ${x.position}: дугуйн хээ ${x.treadDepth} мм болсон.`:`${x.plate} ${x.position}: дугуй солих хугацаа ${x.days<0?`${Math.abs(x.days)} хоногоор хэтэрсэн`:`${x.days} хоног үлдсэн`}.`})),
          ...(fuels.length && trips.length ? [{ level:'low', text:`Бүртгэлээс ${realFuel.toLocaleString()} L түлш, ${trips.length} рейс нэгтгэгдлээ.` }] : [])
        ] : [
          {
            level: 'high',
            text: 'ӨМӨ 9320: рейсийн түлшний зарцуулалт флотын дунджаас өндөр байна — шалтгааныг шалгана уу.',
          },
          {
            level: 'medium',
            text: 'ӨМӨ 6108: засварт байна. Сэлбэг, дуусах хугацааг диспетчер баталгаажуулах шаардлагатай.',
          },
          {
            level: 'medium',
            text: '3 машин сул байна — дараагийн рейсийн хуваарилалтыг оновчлох боломжтой.',
          },
        ],
      });
    },
  ],
  'GET /api/vehicles': [requireAuth(), roleGuard(['admin','dispatcher','mechanic']), async ({ user }) => json(await db.list(userTable('vehicles',user!.userId), { limit: 50 }))],
  'POST /api/vehicles': [requireAuth(), roleGuard(['admin','dispatcher']), async ({ body, user }) => {
    const d = body as { plate?: string; model?: string; driver?: string; status?: string };
    if (!d.plate?.trim() || !d.model?.trim()) return error('Улсын дугаар болон машины загвар шаардлагатай.', 400);
    const [id] = await db.add(userTable('vehicles',user!.userId), [{ plate: d.plate.trim().slice(0, 30), model: d.model.trim().slice(0, 80), driver: (d.driver || '').trim().slice(0, 80), status: (d.status || 'Сул').trim().slice(0, 30), createdAt: new Date().toISOString() }]);
    if (!id) return error('Машин хадгалагдсангүй.', 503);
    return json({ id, message: 'Машин амжилттай бүртгэгдлээ.' });
  }],
  'GET /api/trips': [requireAuth(), roleGuard(['admin','dispatcher']), async ({ user }) => json(await db.list(userTable('trips',user!.userId), { limit: 50 }))],
  'POST /api/trips': [requireAuth(), roleGuard(['admin','dispatcher']), async ({ body, user }) => {
    const d = body as { plate?: string; route?: string; tons?: number; status?: string };
    const tons = Number(d.tons || 0);
    if (!d.plate?.trim() || !d.route?.trim() || tons <= 0) return error('Машин, маршрут, ачааны тонн шаардлагатай.', 400);
    const [id] = await db.add(userTable('trips',user!.userId), [{ plate: d.plate.trim().slice(0, 30), route: d.route.trim().slice(0, 120), tons, status: (d.status || 'Шинэ').trim().slice(0, 30), createdAt: new Date().toISOString() }]);
    if (!id) return error('Рейс хадгалагдсангүй.', 503);
    return json({ id, message: 'Рейс амжилттай бүртгэгдлээ.' });
  }],
  'GET /api/fuel': [requireAuth(), roleGuard(['admin','dispatcher']), async ({ user }) => json(await db.list(userTable('fuel_logs',user!.userId), { limit: 50 }))],
  'POST /api/fuel': [requireAuth(), roleGuard(['admin','dispatcher']), async ({ body, user }) => {
    const d = body as { plate?: string; liters?: number; odometer?: number; note?: string };
    const liters = Number(d.liters || 0);
    if (!d.plate?.trim() || liters <= 0) return error('Машин болон түлшний литр шаардлагатай.', 400);
    const [id] = await db.add(userTable('fuel_logs',user!.userId), [{ plate: d.plate.trim().slice(0, 30), liters, odometer: Number(d.odometer || 0), note: (d.note || '').trim().slice(0, 120), createdAt: new Date().toISOString() }]);
    if (!id) return error('Түлшний бүртгэл хадгалагдсангүй.', 503);
    return json({ id, message: 'Түлшний бүртгэл хадгалагдлаа.' });
  }],
  'GET /api/maintenance': [requireAuth(), roleGuard(['admin','dispatcher','mechanic']), async ({ user }) => json(await db.list(userTable('maintenance',user!.userId), { limit: 50 }))],
  'POST /api/maintenance': [requireAuth(), roleGuard(['admin','mechanic']), async ({ body, user }) => {
    const d = body as { plate?: string; type?: string; cost?: number; status?: string };
    if (!d.plate?.trim() || !d.type?.trim()) return error('Машин болон засварын төрөл шаардлагатай.', 400);
    const [id] = await db.add(userTable('maintenance',user!.userId), [{ plate: d.plate.trim().slice(0, 30), type: d.type.trim().slice(0, 100), cost: Math.max(0, Number(d.cost || 0)), status: (d.status || 'Төлөвлөсөн').trim().slice(0, 30), createdAt: new Date().toISOString() }]);
    if (!id) return error('Засварын бүртгэл хадгалагдсангүй.', 503);
    return json({ id, message: 'Засварын бүртгэл хадгалагдлаа.' });
  }],
  'GET /api/tires': [requireAuth(), roleGuard(['admin','dispatcher','mechanic']), async ({ user }) => json(await db.list(userTable('tires',user!.userId), { limit: 100 }))],
  'POST /api/tires': [requireAuth(), roleGuard(['admin','dispatcher','mechanic']), async ({ body, user }) => { const d=body as {plate?:string;position?:string;brand?:string;serial?:string;installDate?:string;mileage?:number;treadDepth?:number;pressure?:number;status?:string;replaceDate?:string;note?:string}; if(!d.plate?.trim()||!d.position?.trim()||!d.brand?.trim()||!d.serial?.trim()) return error('Машин, байрлал, брэнд, серийн дугаар шаардлагатай.',400); const mileage=Number(d.mileage||0), tread=Number(d.treadDepth||0), pressure=Number(d.pressure||0); if(mileage<0||tread<0||pressure<0)return error('Км, хээний гүн, даралт сөрөг байж болохгүй.',400); const [id]=await db.add(userTable('tires',user!.userId),[{plate:d.plate.trim().slice(0,20),position:d.position.trim().slice(0,40),brand:d.brand.trim().slice(0,60),serial:d.serial.trim().slice(0,80),installDate:(d.installDate||'').slice(0,10),mileage,treadDepth:tread,pressure,status:(d.status||'Ашиглаж байгаа').slice(0,40),replaceDate:(d.replaceDate||'').slice(0,10),note:(d.note||'').trim().slice(0,160),createdAt:new Date().toISOString()}]); if(!id)return error('Дугуйн бүртгэл хадгалагдсангүй.',503); return json({id,message:'Дугуйн бүртгэл хадгалагдлаа.'}); }],
  'GET /api/documents': [requireAuth(), roleGuard(['admin','dispatcher','mechanic']), async ({ user }) => { const page=await db.list<{type:string;name:string;number?:string;issueDate?:string;expiryDate:string;note?:string;filePath?:string;fileName?:string}>(userTable('documents',user!.userId),{limit:50}); const items=await Promise.all(page.items.map(async x=>{ if(!x.filePath)return {...x,fileUrl:''}; const [signed]=await storage.url([x.filePath]); return {...x,fileUrl:signed?.url||''}; })); return json({items,nextToken:page.nextToken}); }],
  'POST /api/documents': [requireAuth(), roleGuard(['admin','dispatcher']), async ({ body, user }) => { const d=body as {type?:string;name?:string;number?:string;issueDate?:string;expiryDate?:string;note?:string;fileData?:string;fileName?:string;fileType?:string}; if(!d.type?.trim()||!d.name?.trim()||!d.expiryDate?.trim()) return error('Баримтын төрөл, нэр, дуусах хугацаа шаардлагатай.',400); const expiry=new Date(`${d.expiryDate}T00:00:00`); if(Number.isNaN(expiry.getTime())) return error('Дуусах хугацаа буруу байна.',400); let filePath=''; if(d.fileData){ if(!d.fileType?.startsWith('image/'))return error('Зөвхөн зураг файл оруулна уу.',400); if(d.fileData.length>7000000)return error('Зургийн хэмжээ хэт том байна.',400); const ext=d.fileType==='image/png'?'png':d.fileType==='image/webp'?'webp':'jpg'; filePath=`documents/${user!.userId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`; const [ok]=await storage.write([{path:filePath,content:d.fileData,contentType:d.fileType}]); if(!ok)return error('Баримтын зураг хадгалагдсангүй.',503); } const [id]=await db.add(userTable('documents',user!.userId),[{type:d.type.trim().slice(0,60),name:d.name.trim().slice(0,120),number:(d.number||'').trim().slice(0,80),issueDate:(d.issueDate||'').trim().slice(0,10),expiryDate:d.expiryDate.trim().slice(0,10),note:(d.note||'').trim().slice(0,160),filePath,fileName:(d.fileName||'').trim().slice(0,120),createdAt:new Date().toISOString()}]); if(!id){if(filePath)await storage.delete([filePath]);return error('Баримт хадгалагдсангүй.',503);} return json({id,message:filePath?'Бичиг баримт зурагтайгаа хадгалагдлаа.':'Бичиг баримт амжилттай бүртгэгдлээ.'}); }],
  'GET /api/drivers': [requireAuth(), roleGuard(['admin','dispatcher']), async ({ user }) => json(await db.list(userTable('drivers',user!.userId), { limit: 50 }))],
  'POST /api/drivers': [requireAuth(), roleGuard(['admin','dispatcher']), async ({ body, user }) => {
    const d = body as { name?: string; employeeCode?: string; plate?: string; status?: string };
    if (!d.name?.trim() || !d.employeeCode?.trim()) return error('Жолоочийн нэр болон ажилтны код шаардлагатай.', 400);
    const [id] = await db.add(userTable('drivers',user!.userId), [{ name: d.name.trim().slice(0, 80), employeeCode: d.employeeCode.trim().slice(0, 40), plate: (d.plate || '').trim().slice(0, 30), status: (d.status || 'Ажиллаж байна').trim().slice(0, 30), createdAt: new Date().toISOString() }]);
    if (!id) return error('Жолоочийн бүртгэл хадгалагдсангүй.', 503);
    return json({ id, message: 'Жолооч амжилттай бүртгэгдлээ.' });
  }],
  'POST /api/ai-manager': [
    requireAuth(),
    roleGuard(['admin','dispatcher','mechanic']),
    async ({ body, user }) => {
      const data = body as { question?: string };
      if (!data.question?.trim()) return error('Асуултаа оруулна уу.', 400);
      await seed();
      const d = (await db.list('daily_ops', { limit: 1 })).items[0];
      const [vehicles,trips,fuels,maintenance,tires,documents,drivers]=await Promise.all([db.list(userTable('vehicles',user!.userId),{limit:100}),db.list(userTable('trips',user!.userId),{limit:100}),db.list(userTable('fuel_logs',user!.userId),{limit:100}),db.list(userTable('maintenance',user!.userId),{limit:100}),db.list(userTable('tires',user!.userId),{limit:100}),db.list(userTable('documents',user!.userId),{limit:100}),db.list(userTable('drivers',user!.userId),{limit:100})]);
      const companyData={vehicles:vehicles.items,trips:trips.items,fuel:fuels.items,maintenance:maintenance.items,tires:tires.items,documents:documents.items,drivers:drivers.items};
      try {
        const r = await ai.generate({
          system:
            'Та нүүрс тээврийн компанийн Монгол хэлтэй AI туслах. Хэрэглэгч тантай дуугаар эсвэл бичгээр ярьж болно. Нэгдүгээрт тухайн хэрэглэгчийн системд бүртгэсэн бодит машин, рейс, түлш, засвар, дугуй, бичиг баримт, жолоочийн мэдээлэлд тулгуурла; бодит бүртгэл байхгүй хэсэгт demo өгөгдлийг зөвхөн demo гэдгийг тодруулж ашигла. Тоо баримт зохиохгүй. Асуултад ярианы хэлээр ойлгомжтой, шаардлагатай хэмжээнд дэлгэрэнгүй Монгол хэлээр хариул. Хариултаа хэзээ ч өгүүлбэрийн дунд тасалж дуусгахгүй; заавал санаагаа бүрэн дуусгаж, хамгийн сүүлд богино дүгнэлтээр төгсгө. Хэрэв системд бодит мэдээлэл байхгүй бол ямар мэдээлэл байхгүйг бүтэн өгүүлбэрээр тайлбарла. Жолоочийг нотолгоогүйгээр буруутгахгүй. GPS/телематик бодит холболтгүй гэдгийг шаардлагатай үед тодруул. Аюултай жолоодлого, дүрэм зөрчихийг хэзээ ч зөвлөхгүй.',
          prompt: `Demo өдрийн өгөгдөл: ${JSON.stringify(d)}\nDemo флот: ${JSON.stringify(fleet)}\nХэрэглэгчийн бодит бүртгэл: ${JSON.stringify(companyData).slice(0,12000)}\nАсуулт: ${data.question.slice(0,1200)}`,
          thinkingMode: 'FAST',
          maxTokens: 1800,
        });
        return json({ answer: r.text });
      } catch (e) {
        console.error('AI manager failed', e);
        return error('AI туслах түр ажиллахгүй байна.', 503);
      }
    },
  ],
});
