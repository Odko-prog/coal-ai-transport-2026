import express from 'express';
import pg from 'pg';
const {Pool}=pg;
const app=express();const PORT=Number(process.env.PORT||3000);
app.use(express.json({limit:'2mb'}));
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin',process.env.FRONTEND_ORIGIN||'https://coal-ai-github-staging.onrender.com');res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next();});
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
const ADMIN_EMAIL=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const parseCookies=(req)=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [decodeURIComponent(i<0?x:x.slice(0,i)),decodeURIComponent(i<0?'':x.slice(i+1))];}));
const sessionUser=async(req)=>{
  const devEmail=process.env.NODE_ENV!=='production'?String(req.headers['x-coal-user']||'').trim().toLowerCase():'';
  const email=devEmail||parseCookies(req).coal_user||'';
  if(!email)return null;
  if(!pool)return {userId:email,email,name:email.split('@')[0],role:email===ADMIN_EMAIL?'admin':'dispatcher',status:'allowed'};
  const q=await pool.query('select user_id,email,name,role,status from company_users where lower(email)=lower($1) limit 1',[email]);
  if(!q.rows[0])return null;
  const u=q.rows[0]; return {userId:u.user_id,email:u.email,name:u.name,role:u.role,status:u.status};
};
const requireAuth=async(req,res,next)=>{try{const u=await sessionUser(req);if(!u||u.status==='blocked')return res.status(401).json({message:'Нэвтрэх шаардлагатай'});req.user=u;next();}catch{return res.status(500).json({message:'Auth шалгалт амжилтгүй'});}};
const requireRole=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({message:'Эрх хүрэлцэхгүй'});

const fleet=[{plate:'ӨМӨ 8214',driver:'Б. Батсайхан',status:'Тээвэрт',trips:4,tons:152,fuel:438},{plate:'ӨМӨ 7741',driver:'Д. Тэмүүлэн',status:'Тээвэрт',trips:3,tons:114,fuel:321},{plate:'ӨМӨ 6108',driver:'Г. Мөнхтөр',status:'Засварт',trips:0,tons:0,fuel:0},{plate:'ӨМӨ 9320',driver:'Н. Энхбат',status:'Тээвэрт',trips:4,tons:148,fuel:512},{plate:'ӨМӨ 5582',driver:'С. Батзориг',status:'Сул',trips:0,tons:0,fuel:0}];
const demo=()=>({vehicles:42,active:34,repair:5,idle:3,trips:164,tons:6420,fuel:18730,alerts:[{level:'medium',text:'Demo: 5 машин засварын төлөвтэй.'},{level:'low',text:'Demo GPS · бодит байршил биш.'}],dataMode:'demo',fleet});
app.get('/api/health',async(_q,res)=>{let database='not-configured';try{if(pool){await pool.query('select 1');database='connected';}}catch{database='error';}res.json({ok:true,service:'COAL AI Render API',version:'3.0.0',database});});
app.get('/api/demo-dashboard',(_q,res)=>res.json(demo()));
app.get('/api/dashboard',requireAuth,async(req,res)=>{try{const d=demo();if(pool){const q=await pool.query('select count(*)::int as total from fleet_records where user_id=$1',[req.user.userId]);if(Number(q.rows[0]?.total||0)>0)d.dataMode='registered';}res.json(d);}catch{res.status(500).json({message:'Database query failed'});}});
app.get('/api/me',async(req,res)=>{try{const u=await sessionUser(req);if(!u||u.status==='blocked')return res.status(401).json({authorized:false});res.json({authorized:true,userId:u.userId,email:u.email,name:u.name,role:u.role,migration:true});}catch{res.status(500).json({authorized:false,message:'Auth шалгалт амжилтгүй'});}});
app.listen(PORT,'0.0.0.0',()=>console.log('COAL AI Render API listening on '+PORT));
