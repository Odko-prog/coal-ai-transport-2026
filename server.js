import express from 'express';
import pg from 'pg';
import crypto from 'crypto';
const {Pool}=pg;
const app=express();const PORT=Number(process.env.PORT||3000);
app.use(express.json({limit:'2mb'}));
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin',process.env.FRONTEND_ORIGIN||'https://coal-ai-github-staging.onrender.com');res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next();});
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
const ADMIN_EMAIL=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const parseCookies=(req)=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [decodeURIComponent(i<0?x:x.slice(0,i)),decodeURIComponent(i<0?'':x.slice(i+1))];}));
const SESSION_SECRET=process.env.SESSION_SECRET||'';
const sign=(value)=>SESSION_SECRET?crypto.createHmac('sha256',SESSION_SECRET).update(value).digest('base64url'):'';
const makeSession=(email)=>{const payload=Buffer.from(JSON.stringify({email:String(email).toLowerCase(),exp:Date.now()+7*86400000})).toString('base64url');return payload+'.'+sign(payload);};
const readSession=(req)=>{const token=parseCookies(req).coal_session||'';const [payload,sig]=token.split('.');if(!payload||!sig||!SESSION_SECRET)return '';const expected=sign(payload);if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return '';try{const x=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return x.exp>Date.now()?String(x.email||'').toLowerCase():'';}catch{return '';}};
const setSession=(res,email)=>res.setHeader('Set-Cookie','coal_session='+encodeURIComponent(makeSession(email))+'; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=604800');
const clearSession=(res)=>res.setHeader('Set-Cookie','coal_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0');
const sessionUser=async(req)=>{
  const devEmail=process.env.NODE_ENV!=='production'?String(req.headers['x-coal-user']||'').trim().toLowerCase():'';
  const email=devEmail||readSession(req)||'';
  if(!email)return null;
  if(!pool)return {userId:email,email,name:email.split('@')[0],role:email===ADMIN_EMAIL?'admin':'dispatcher',status:'allowed'};
  const q=await pool.query('select user_id,email,name,role,status from company_users where lower(email)=lower($1) limit 1',[email]);
  if(!q.rows[0])return null;
  const u=q.rows[0]; return {userId:u.user_id,email:u.email,name:u.name,role:u.role,status:u.status};
};
const requireAuth=async(req,res,next)=>{try{const u=await sessionUser(req);if(!u||u.status==='blocked')return res.status(401).json({message:'Нэвтрэх шаардлагатай'});req.user=u;next();}catch{return res.status(500).json({message:'Auth шалгалт амжилтгүй'});}};
const requireRole=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({message:'Эрх хүрэлцэхгүй'});

app.post('/api/auth/logout',(_req,res)=>{clearSession(res);res.json({ok:true});});
app.get('/api/auth/google',(req,res)=>{
 const clientId=process.env.GOOGLE_CLIENT_ID||''; const redirectUri=process.env.GOOGLE_REDIRECT_URI||'';
 if(!clientId||!redirectUri||!SESSION_SECRET)return res.status(503).json({message:'Google login тохиргоо хүлээгдэж байна'});
 const state=Buffer.from(JSON.stringify({returnTo:String(req.query.returnTo||process.env.FRONTEND_ORIGIN||'/'),nonce:crypto.randomBytes(16).toString('hex')})).toString('base64url');
 const signedState=state+'.'+sign(state);
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.searchParams.set('client_id',clientId);u.searchParams.set('redirect_uri',redirectUri);u.searchParams.set('response_type','code');u.searchParams.set('scope','openid email profile');u.searchParams.set('state',signedState);res.redirect(u.toString());
});

const RECORD_KINDS=new Set(['vehicles','trips','fuel','maintenance','tires','documents','drivers']);
const ensureDb=(res)=>{if(pool)return true;res.status(503).json({message:'Database тохируулагдаагүй'});return false;};
const validBody=(body)=>body&&typeof body==='object'&&!Array.isArray(body);
app.get('/api/:kind(vehicles|trips|fuel|maintenance|tires|documents|drivers)',requireAuth,async(req,res)=>{
  if(!ensureDb(res))return;
  try{
    const q=await pool.query('select id,data,created_at from fleet_records where user_id=$1 and kind=$2 order by created_at desc',[req.user.userId,req.params.kind]);
    res.json({items:q.rows.map(r=>({id:r.id,...r.data,createdAt:r.created_at}))});
  }catch{res.status(500).json({message:'Өгөгдөл уншихад алдаа гарлаа'});}
});
app.post('/api/:kind(vehicles|trips|fuel|maintenance|tires|documents|drivers)',requireAuth,requireRole('admin','dispatcher','mechanic'),async(req,res)=>{
  if(!ensureDb(res))return;
  if(!validBody(req.body))return res.status(400).json({message:'Буруу өгөгдөл'});
  try{
    const q=await pool.query('insert into fleet_records(user_id,kind,data) values($1,$2,$3::jsonb) returning id,data,created_at',[req.user.userId,req.params.kind,JSON.stringify(req.body)]);
    const r=q.rows[0];res.status(201).json({message:'Амжилттай бүртгэлээ',item:{id:r.id,...r.data,createdAt:r.created_at}});
  }catch{res.status(500).json({message:'Бүртгэл хадгалахад алдаа гарлаа'});}
});
app.delete('/api/:kind(vehicles|trips|fuel|maintenance|tires|documents|drivers)/:id',requireAuth,requireRole('admin','dispatcher'),async(req,res)=>{
  if(!ensureDb(res))return;
  try{
    const q=await pool.query('delete from fleet_records where id=$1 and user_id=$2 and kind=$3 returning id',[req.params.id,req.user.userId,req.params.kind]);
    if(!q.rowCount)return res.status(404).json({message:'Бүртгэл олдсонгүй'});
    res.json({ok:true});
  }catch{res.status(500).json({message:'Устгахад алдаа гарлаа'});}
});

const fleet=[{plate:'ӨМӨ 8214',driver:'Б. Батсайхан',status:'Тээвэрт',trips:4,tons:152,fuel:438},{plate:'ӨМӨ 7741',driver:'Д. Тэмүүлэн',status:'Тээвэрт',trips:3,tons:114,fuel:321},{plate:'ӨМӨ 6108',driver:'Г. Мөнхтөр',status:'Засварт',trips:0,tons:0,fuel:0},{plate:'ӨМӨ 9320',driver:'Н. Энхбат',status:'Тээвэрт',trips:4,tons:148,fuel:512},{plate:'ӨМӨ 5582',driver:'С. Батзориг',status:'Сул',trips:0,tons:0,fuel:0}];
const demo=()=>({vehicles:42,active:34,repair:5,idle:3,trips:164,tons:6420,fuel:18730,alerts:[{level:'medium',text:'Demo: 5 машин засварын төлөвтэй.'},{level:'low',text:'Demo GPS · бодит байршил биш.'}],dataMode:'demo',fleet});
app.get('/api/health',async(_q,res)=>{let database='not-configured';try{if(pool){await pool.query('select 1');database='connected';}}catch{database='error';}res.json({ok:true,service:'COAL AI Render API',version:'3.0.0',database});});
app.get('/api/demo-dashboard',(_q,res)=>res.json(demo()));
app.get('/api/dashboard',requireAuth,async(req,res)=>{try{const d=demo();if(pool){const q=await pool.query('select count(*)::int as total from fleet_records where user_id=$1',[req.user.userId]);if(Number(q.rows[0]?.total||0)>0)d.dataMode='registered';}res.json(d);}catch{res.status(500).json({message:'Database query failed'});}});
app.get('/api/me',async(req,res)=>{try{const u=await sessionUser(req);if(!u||u.status==='blocked')return res.status(401).json({authorized:false});res.json({authorized:true,userId:u.userId,email:u.email,name:u.name,role:u.role,migration:true});}catch{res.status(500).json({authorized:false,message:'Auth шалгалт амжилтгүй'});}});
app.listen(PORT,'0.0.0.0',()=>console.log('COAL AI Render API listening on '+PORT));
