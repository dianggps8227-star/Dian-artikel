const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IS_VERCEL = Boolean(process.env.VERCEL);
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
// Di Vercel folder proyek bersifat read-only, hanya /tmp yang boleh ditulis.
const DATA_DIR = IS_VERCEL ? '/tmp/data' : path.join(__dirname, 'data');
const UPLOAD_DIR = IS_VERCEL ? '/tmp/uploads' : path.join(PUBLIC_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const authAttempts = new Map();
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) { console.error('Gagal membuat folder:', e.message); }

const starterArticles = [
  { id: crypto.randomUUID(), title: 'Selamat Datang di Ruang Artikel', category: 'Teknologi',
    excerpt: 'Ini adalah artikel contoh. Buat akun untuk mulai menulis.', cover: '',
    content: '<p>Selamat datang di Ruang Artikel. Buat akun untuk menulis dan membagikan artikel.</p>',
    tags: ['panduan','artikel'], status:'published', likes:2, reads:12, ownerId:null, author:'Ruang Artikel',
    comments:[{id:crypto.randomUUID(),author:'Admin',text:'Selamat membaca!',createdAt:new Date().toISOString(),status:'approved'}],
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
];

try {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ articles:starterArticles, users:[], sessions:[], bookmarks:[] }, null, 2));
} catch (e) { console.error('Gagal membuat database awal:', e.message); }
function readDB() {
  try {
    const d=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
    d.articles=Array.isArray(d.articles)?d.articles:[];
    d.users=Array.isArray(d.users)?d.users:[];
    d.sessions=Array.isArray(d.sessions)?d.sessions:[];
    d.bookmarks=Array.isArray(d.bookmarks)?d.bookmarks:[];
    d.articles.forEach(a=>{ if(!Array.isArray(a.comments)) a.comments=[]; a.comments.forEach(c=>{if(!c.status)c.status='approved';}); if(!a.ownerId && a.authorId) a.ownerId=a.authorId; });
    return d;
  } catch(e) { console.error('Database gagal dibaca:',e.message); return {articles:[],users:[],sessions:[],bookmarks:[]}; }
}
function writeDB(d){fs.writeFileSync(DB_FILE,JSON.stringify(d,null,2));}
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
function body(req, limit = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error('Payload terlalu besar.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON tidak valid.')); }
    });
    req.on('error', reject);
  });
}
const clean=(v,max=10000)=>String(v??'').trim().slice(0,max);
function cookie(req,name){const c=req.headers.cookie||'';const m=c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]*)'));return m?decodeURIComponent(m[1]):'';}
function setCookie(res,token,secure){res.setHeader('Set-Cookie',`ra_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure?'; Secure':''}`);}
function clearCookie(res,secure){res.setHeader('Set-Cookie',`ra_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`);}
function currentUser(db,req){const token=cookie(req,'ra_session');if(!token)return null;const hash=crypto.createHash('sha256').update(token).digest('hex');const s=db.sessions.find(x=>x.tokenHash===hash&&x.expiresAt>Date.now());return s?db.users.find(u=>u.id===s.userId)||null:null;}
function safeUser(u){return u?{id:u.id,username:u.username,role:u.role}:null;}
function hashPassword(pass,salt){return crypto.scryptSync(pass,salt,64).toString('hex');}
function passwordOkay(pass,salt,hash){try{return crypto.timingSafeEqual(Buffer.from(hashPassword(pass,salt),'hex'),Buffer.from(hash,'hex'));}catch{return false;}}
function validOrigin(req){const origin=req.headers.origin;if(!origin)return true;try{const u=new URL(origin);return u.host===req.headers.host||u.hostname==='localhost'||u.hostname==='127.0.0.1';}catch{return false;}}
function normalizeArticle(b,old={}) {
 const title=clean(b.title??old.title,120), content=clean(b.content??old.content,50000);
 const category=clean(b.category??old.category??'Umum',40)||'Umum',excerpt=clean(b.excerpt??old.excerpt,260);
 const cover=clean(b.cover??old.cover,1000), tagsSrc=b.tags??old.tags??[];
 const tags=Array.isArray(tagsSrc)?tagsSrc.map(t=>clean(t,24)).filter(Boolean).slice(0,8):String(tagsSrc).split(',').map(t=>clean(t,24)).filter(Boolean).slice(0,8);
 const status=['draft','published'].includes(b.status)?b.status:(old.status||'draft');
 if(!title||!content)throw new Error('Judul dan isi artikel wajib diisi.');
 if(cover && !(/^https:\/\//i.test(cover)||/^\/uploads\/[a-z0-9._-]+$/i.test(cover)))throw new Error('Cover harus HTTPS atau gambar upload lokal.');
 return {title,content,category,excerpt,cover,tags,status};
}
function readable(article){const approved=(article.comments||[]).filter(c=>c.status==='approved');return {...article,comments:approved};}
function ownerArticle(a,u){return Boolean(u&&u.role==='admin'||u&&a.ownerId===u.id);}
function secureReq(req){return Boolean(req.headers['x-forwarded-proto']==='https');}
async function api(req,res,url){
 const db=readDB(), p=url.pathname.split('/').filter(Boolean), user=currentUser(db,req);
 if(!validOrigin(req))return json(res,403,{error:'Origin tidak diizinkan.'});
 if(req.method==='GET'&&p[1]==='auth'&&p[2]==='me')return json(res,200,{user:safeUser(user)});
 if(req.method==='POST'&&p[1]==='auth'&&p[2]==='register'){
  try{const b=await body(req,8192),username=clean(b.username,24),password=String(b.password||'');
   if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))throw new Error('Username 3–24 karakter (huruf, angka, underscore).');
   if(password.length<8||password.length>128)throw new Error('Password minimal 8 karakter.');
   if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))throw new Error('Username sudah digunakan.');
   const salt=crypto.randomBytes(16).toString('hex'),first=db.users.length===0;
   const u={id:crypto.randomUUID(),username,salt,passwordHash:hashPassword(password,salt),role:first?'admin':'user',createdAt:new Date().toISOString()};
   db.users.push(u);const token=crypto.randomBytes(32).toString('hex');db.sessions.push({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),userId:u.id,expiresAt:Date.now()+604800000});writeDB(db);setCookie(res,token,secureReq(req));
   return json(res,201,{user:safeUser(u),firstAdmin:first});
  }catch(e){return json(res,400,{error:e.message});}
 }
 if(req.method==='POST'&&p[1]==='auth'&&p[2]==='login'){
  const ip=req.socket.remoteAddress||'unknown', entry=authAttempts.get(ip)||{count:0,until:0};
  if(entry.until>Date.now()&&entry.count>=8)return json(res,429,{error:'Terlalu banyak percobaan login. Coba lagi beberapa menit.'});
  if(entry.until<=Date.now()){entry.count=0;entry.until=Date.now()+10*60*1000;}

  try{const b=await body(req,8192),username=clean(b.username,24),password=String(b.password||''),u=db.users.find(x=>x.username.toLowerCase()===username.toLowerCase());
   if(!u||!passwordOkay(password,u.salt,u.passwordHash)){entry.count++;authAttempts.set(ip,entry);return json(res,401,{error:'Username atau password salah.'});}authAttempts.delete(ip);
   const token=crypto.randomBytes(32).toString('hex');db.sessions.push({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),userId:u.id,expiresAt:Date.now()+604800000});writeDB(db);setCookie(res,token,secureReq(req));return json(res,200,{user:safeUser(u)});
  }catch(e){return json(res,400,{error:e.message});}
 }
 if(req.method==='POST'&&p[1]==='auth'&&p[2]==='logout'){const t=cookie(req,'ra_session');const h=crypto.createHash('sha256').update(t).digest('hex');db.sessions=db.sessions.filter(s=>s.tokenHash!==h);writeDB(db);clearCookie(res,secureReq(req));return json(res,200,{ok:true});}
 if(req.method==='GET'&&p[1]==='articles'){
  const own=db.articles.filter(a=>a.status==='published'||(user&&ownerArticle(a,user))).map(a=>a.status==='published'?readable(a):a);
  return json(res,200,own);
 }
 if(req.method==='GET'&&p[1]==='bookmarks'){if(!user)return json(res,401,{error:'Login diperlukan.'});return json(res,200,db.bookmarks.filter(b=>b.userId===user.id).map(b=>b.articleId));}
 if(req.method==='POST'&&p[1]==='bookmarks'&&p[2]){if(!user)return json(res,401,{error:'Login diperlukan.'});const article=db.articles.find(a=>a.id===p[2]&&a.status==='published');if(!article)return json(res,404,{error:'Artikel tidak ditemukan.'});const ix=db.bookmarks.findIndex(b=>b.userId===user.id&&b.articleId===article.id);if(ix>=0)db.bookmarks.splice(ix,1);else db.bookmarks.push({userId:user.id,articleId:article.id,createdAt:new Date().toISOString()});writeDB(db);return json(res,200,{bookmarked:ix<0});}
 if(req.method==='POST'&&p[1]==='upload'){if(!user)return json(res,401,{error:'Login diperlukan untuk upload.'});try{const b=await body(req,4*1024*1024),data=String(b.data||''),m=data.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);if(!m)throw new Error('Format gambar tidak didukung.');const bytes=Buffer.from(m[2],'base64');if(bytes.length>2*1024*1024)throw new Error('Gambar maksimal 2 MB.');const ext={png:'png',jpeg:'jpg',webp:'webp',gif:'gif'}[m[1]],filename=`${user.id.slice(0,8)}-${crypto.randomUUID()}.${ext}`;fs.writeFileSync(path.join(UPLOAD_DIR,filename),bytes,{flag:'wx'});return json(res,201,{url:`/uploads/${filename}`});}catch(e){return json(res,400,{error:e.message});}}
 if(req.method==='GET'&&p[1]==='moderation'&&p[2]==='comments'){if(!user||user.role!=='admin')return json(res,403,{error:'Hanya admin yang dapat memoderasi.'});const list=[];db.articles.forEach(a=>(a.comments||[]).filter(c=>c.status==='pending').forEach(c=>list.push({articleId:a.id,articleTitle:a.title,comment:c})));return json(res,200,list);}
 if(req.method==='POST'&&p[1]==='moderation'&&p[2]==='comments'&&p[3]&&p[4]){
  if(!user||user.role!=='admin')return json(res,403,{error:'Hanya admin yang dapat memoderasi.'});
  const a=db.articles.find(x=>x.id===p[3]),c=a&&(a.comments||[]).find(x=>x.id===p[4]);if(!c)return json(res,404,{error:'Komentar tidak ditemukan.'});
  const b=await body(req,8192);if(b.action==='approve')c.status='approved';else if(b.action==='delete')a.comments=a.comments.filter(x=>x.id!==c.id);else return json(res,400,{error:'Aksi tidak dikenal.'});writeDB(db);return json(res,200,{ok:true});
 }
 if(req.method==='POST'&&p[1]==='articles'&&p.length===2){if(!user)return json(res,401,{error:'Login diperlukan untuk membuat artikel.'});try{const b=await body(req),f=normalizeArticle(b),now=new Date().toISOString(),a={id:crypto.randomUUID(),...f,ownerId:user.id,author:user.username,likes:0,reads:0,comments:[],createdAt:now,updatedAt:now};db.articles.unshift(a);writeDB(db);return json(res,201,a);}catch(e){return json(res,400,{error:e.message});}}
 if(p[1]==='articles'&&p[2]){
  const id=p[2],a=db.articles.find(x=>x.id===id);if(!a)return json(res,404,{error:'Artikel tidak ditemukan.'});
  if(req.method==='PUT'&&p.length===3){if(!user)return json(res,401,{error:'Login diperlukan.'});if(!ownerArticle(a,user))return json(res,403,{error:'Kamu hanya dapat mengedit artikel milikmu sendiri.'});try{const b=await body(req),f=normalizeArticle(b,a);Object.assign(a,f,{updatedAt:new Date().toISOString()});writeDB(db);return json(res,200,a);}catch(e){return json(res,400,{error:e.message});}}
  if(req.method==='DELETE'&&p.length===3){if(!user)return json(res,401,{error:'Login diperlukan.'});if(!ownerArticle(a,user))return json(res,403,{error:'Kamu hanya dapat menghapus artikel milikmu sendiri.'});db.articles=db.articles.filter(x=>x.id!==id);db.bookmarks=db.bookmarks.filter(b=>b.articleId!==id);writeDB(db);return json(res,200,{ok:true});}
  if(req.method==='POST'&&p[3]==='like'){a.likes=(Number(a.likes)||0)+1;writeDB(db);return json(res,200,{likes:a.likes});}
  if(req.method==='POST'&&p[3]==='read'){a.reads=(Number(a.reads)||0)+1;writeDB(db);return json(res,200,{reads:a.reads});}
  if(req.method==='POST'&&p[3]==='comments'){try{const b=await body(req,8192),author=user?user.username:clean(b.author,40),text=clean(b.text,500);if(!author||!text)throw new Error('Nama dan komentar wajib diisi.');const c={id:crypto.randomUUID(),author,text,createdAt:new Date().toISOString(),status:'pending'};a.comments=a.comments||[];a.comments.push(c);writeDB(db);return json(res,201,{...c,message:'Komentar dikirim untuk moderasi.'});}catch(e){return json(res,400,{error:e.message});}}
 }
 return json(res,404,{error:'Endpoint tidak ditemukan.'});
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml'};
function staticFile(req,res,url){let decoded;try{decoded=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);}catch{return res.writeHead(400).end('Bad request');}
let root=PUBLIC_DIR,rel=decoded;
if(IS_VERCEL&&decoded.startsWith('/uploads/')){root=UPLOAD_DIR;rel=decoded.slice('/uploads'.length);}
const fp=path.resolve(root,'.'+rel);
if(!fp.startsWith(root+path.sep)){res.writeHead(403);return res.end('Forbidden');}
fs.readFile(fp,(err,buf)=>{if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('File tidak ditemukan.');}
const ct=MIME[path.extname(fp).toLowerCase()]||'application/octet-stream';res.writeHead(200,{'Content-Type':ct,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(buf);});
}
const handler=async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/')){try{await api(req,res,url);}catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:'Server error.'});}return;}if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end('Method not allowed');}staticFile(req,res,url);};
module.exports=handler;
if(require.main===module)http.createServer(handler).listen(PORT,HOST,()=>{console.log('========================================');console.log('  RUANG ARTIKEL - SERVER AKTIF');console.log(`  Buka: http://127.0.0.1:${PORT}`);console.log('  Registrasi pertama akan menjadi admin.');console.log('  Tekan Ctrl + C untuk menghentikan server');console.log('========================================');});
