import {freeMedia,MediaLimitError,MEDIA_CAP} from "../../../lib/free-media";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
type Role="admin"|"student";
type User={id:string;username:string;name:string;role:Role;active:number};
type Category="actividad"|"aprendizaje";
const COOKIE="jb_session";
const CAPS:Record<Category,number>={actividad:80,aprendizaje:10};
const LOGO_SLOTS:Record<string,string>={programa:"Programa",municipio:"Gobierno municipal",escuinapa:"Escuinapa",imju:"IMJU"};

function db(){if(!env.DB)throw new Error("La base de datos no está disponible.");return env.DB}
function bucket(){if(env.MEDIA_STORAGE==="d1")return freeMedia(db());if(!env.BUCKET)throw new Error("El espacio de archivos no está disponible.");return env.BUCKET}
function json(data:unknown,status=200,headers:HeadersInit={}){return Response.json(data,{status,headers:{"cache-control":"no-store",...Object.fromEntries(new Headers(headers))}})}
function fail(message:string,status=400){return json({error:message},status)}
function uid(){return crypto.randomUUID()}
function dateNow(){return new Date().toISOString()}
async function digest(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function passwordHash(password:string,salt=crypto.randomUUID()){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:100000,hash:"SHA-256"},key,256);return `${salt}:${[...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join("")}`}
async function verifyPassword(password:string,stored:string){const [salt,expected]=stored.split(":");if(!salt||!expected)return false;return (await passwordHash(password,salt)).split(":")[1]===expected}
async function body<T>(request:Request):Promise<T>{try{return await request.json() as T}catch{throw new Error("Revisa los datos enviados.")}}
async function current(request:Request):Promise<User|null>{const token=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);if(!token)return null;const d=db(),hash=await digest(decodeURIComponent(token)),expires=new Date().toISOString();const row=await d.prepare("SELECT s.id,'student' AS role,s.active,s.username,s.name FROM sessions x JOIN students s ON s.id=x.user_id WHERE x.token_hash=? AND x.role='student' AND x.expires_at>? AND s.active=1").bind(hash,expires).first<User>();if(row)return row;return d.prepare("SELECT a.id,'admin' AS role,1 AS active,a.username,a.name FROM sessions x JOIN admins a ON a.id=x.user_id WHERE x.token_hash=? AND x.role='admin' AND x.expires_at>?").bind(hash,expires).first<User>()}
function admin(user:User|null):user is User{return !!user&&user.role==="admin"}
function sessionCookie(token:string){return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600`}
async function makeSession(user:User){await db().prepare("DELETE FROM sessions WHERE expires_at<?").bind(dateNow()).run();const token=`${uid()}${uid().replaceAll("-","")}`;await db().prepare("INSERT INTO sessions (id,user_id,role,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)").bind(uid(),user.id,user.role,await digest(token),new Date(Date.now()+1000*60*60*24*14).toISOString(),dateNow()).run();return json({session:{role:user.role,name:user.name,username:user.username,studentId:user.role==="student"?user.id:undefined}},200,{"set-cookie":sessionCookie(token)})}
function validCategory(value:unknown):value is Category{return value==="actividad"||value==="aprendizaje"}
async function totalsFor(studentId:string,date:string){return db().prepare(`SELECT COALESCE(SUM(CASE WHEN category='actividad' THEN hours ELSE 0 END),0) AS activityHours,COALESCE(SUM(CASE WHEN category='aprendizaje' THEN hours ELSE 0 END),0) AS learningHours,COALESCE(SUM(hours),0) AS totalHours FROM (SELECT a.category,x.hours FROM attendance x JOIN activities a ON a.id=x.activity_id WHERE x.student_id=? AND x.status='presente' AND substr(a.date,1,7)=? UNION ALL SELECT category,hours FROM hour_entries WHERE student_id=? AND substr(assigned_at,1,7)=?)`).bind(studentId,date.slice(0,7),studentId,date.slice(0,7)).first<{activityHours:number;learningHours:number;totalHours:number}>()}
function limitMessage(category:Category,have:number,adding:number){const cap=CAPS[category],remaining=Math.max(0,cap-have);return `Este joven tiene ${remaining} horas disponibles del máximo de ${cap} en ${category==='actividad'?'actividades':'aprendizaje'}. (Se intentan asignar ${adding} h.)`}
async function checkCredit(studentId:string,category:Category,hours:number,date:string,oldCategory?:Category,oldHours=0){const totals=await totalsFor(studentId,date);const activity=(totals?.activityHours||0)-(oldCategory==="actividad"?oldHours:0)+(category==="actividad"?hours:0);const learning=(totals?.learningHours||0)-(oldCategory==="aprendizaje"?oldHours:0)+(category==="aprendizaje"?hours:0);const total=(totals?.totalHours||0)-oldHours+hours;if(activity>CAPS.actividad)return limitMessage("actividad",(totals?.activityHours||0)-(oldCategory==="actividad"?oldHours:0),hours);if(learning>CAPS.aprendizaje)return limitMessage("aprendizaje",(totals?.learningHours||0)-(oldCategory==="aprendizaje"?oldHours:0),hours);if(total>90)return "El total del programa no puede superar las 90 horas.";return null}
function mediaPath(key:string){return `/api/media?key=${encodeURIComponent(key)}`}
function imageType(file:File){return ["image/jpeg","image/png","image/webp"].includes(file.type)}
async function validImage(file:File){if(!imageType(file))return false;const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());if(file.type==="image/jpeg")return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;if(file.type==="image/png")return bytes.slice(0,8).join(",")==="137,80,78,71,13,10,26,10";return String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP"}

export async function GET(request:Request,context:{params:Promise<{path:string[]}>}){return route(request,context)}
export async function POST(request:Request,context:{params:Promise<{path:string[]}>}){return route(request,context)}
export async function PATCH(request:Request,context:{params:Promise<{path:string[]}>}){return route(request,context)}

async function route(request:Request,context:{params:Promise<{path:string[]}>}){
 try{
  const {path=[]}=await context.params,key=path.join("/"),d=db();
  if(key==="me"&&request.method==="GET"){const user=await current(request);return json({session:user?{role:user.role,name:user.name,username:user.username,studentId:user.role==="student"?user.id:undefined}:null})}
  if(key==="branding"&&request.method==="GET"){const logos=await d.prepare("SELECT slot,label,object_key AS objectKey FROM site_logos ORDER BY slot").all<{slot:string;label:string;objectKey:string}>();return json({logos:logos.results.map(x=>({...x,url:mediaPath(x.objectKey)}))})}
  if(key==="media"&&request.method==="GET"){
   const objectKey=new URL(request.url).searchParams.get("key")||"";if(!objectKey||objectKey.includes(".."))return fail("Archivo no válido.",400);if(!objectKey.startsWith("logos/")){const user=await current(request);if(!user)return fail("Inicia sesión para ver este archivo.",401);if(user.role!=="admin"&&objectKey.startsWith("profile/")){const own=await d.prepare("SELECT id FROM students WHERE id=? AND photo_key=?").bind(user.id,objectKey).first();if(!own)return fail("No tienes acceso a esta fotografía.",403)}}const object=await bucket().get(objectKey);if(!object)return fail("No se encontró el archivo.",404);return new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"application/octet-stream","cache-control":objectKey.startsWith("logos/")?"public, max-age=3600":"private, max-age=900","x-content-type-options":"nosniff"}})
  }
  if(key==="bootstrap"&&request.method==="POST"){
   const input=await body<{token:string;username:string;password:string;name:string}>(request);const count=await d.prepare("SELECT COUNT(*) AS count FROM admins").first<{count:number}>();const secret=env.BOOTSTRAP_TOKEN;if(!secret||count?.count)return fail("El acceso maestro ya fue configurado o falta habilitar la clave inicial.",403);if(!input.token||input.token!==secret)return fail("El código de activación no es válido.",403);if(!/^[a-zA-Z0-9._-]{3,32}$/.test(input.username)||input.password.length<10||input.password.length>128||input.name.trim().length<3||input.name.length>120)return fail("Usa un usuario de 3 a 32 caracteres, un nombre de hasta 120 caracteres y una contraseña de 10 a 128 caracteres.");const id=uid();await d.prepare("INSERT INTO admins (id,username,password_hash,name,created_at) VALUES (?,?,?,?,?)").bind(id,input.username.trim().toLowerCase(),await passwordHash(input.password),input.name.trim(),dateNow()).run();return json({ok:true});
  }
  if(key==="recover"&&request.method==="POST"){
   const input=await body<{username:string;code:string;password:string}>(request);
   if(!input.code||!input.username||!input.password||input.password.length<8||input.password.length>128)return fail("Revisa los campos. La contraseña debe tener entre 8 y 128 caracteres.");
   const row=await d.prepare("SELECT id,password_hash FROM students WHERE username=? AND active=1").bind(input.username.trim().toLowerCase()).first<{id:string;password_hash:string}>();
   if(!row||row.password_hash.split(":")[2]!==await digest(input.code.trim()))return fail("Usuario o código incorrectos.",403);
   const code=uid();
   const update=d.prepare("UPDATE students SET password_hash=? WHERE id=? AND password_hash=?").bind(await passwordHash(input.password)+":"+await digest(code)+":personal",row.id,row.password_hash);
   const [result]=await d.batch([update,d.prepare("DELETE FROM sessions WHERE user_id=? AND role='student'").bind(row.id)]);
   if(!result.meta.changes)return fail("El código ya fue utilizado.");
   return json({code});
  }
  if(key==="login"&&request.method==="POST"){
   const input=await body<{username:string;password:string;newPassword?:string}>(request);if(!input.username||!input.password)return fail("Escribe tu usuario y contraseña.");const username=input.username.trim().toLowerCase();let user=await d.prepare("SELECT id,username,name,'student' AS role,active,password_hash FROM students WHERE username=?").bind(username).first<User&{password_hash:string}>();if(!user)user=await d.prepare("SELECT id,username,name,'admin' AS role,1 AS active,password_hash FROM admins WHERE username=?").bind(username).first<User&{password_hash:string}>();if(!user||!user.active||input.password.length>128||!(await verifyPassword(input.password,user.password_hash)))return fail("Usuario o contraseña incorrectos.",401);if(user.role==="student"&&!user.password_hash.endsWith(":personal")){
    if(!input.newPassword)return json({choosePassword:true});
    if(input.newPassword.length<8||input.newPassword.length>128||input.newPassword===input.password)return fail("Elige una contraseña distinta de 8 a 128 caracteres.");
    const code=uid();
    const result=await d.prepare("UPDATE students SET password_hash=? WHERE id=? AND password_hash=? AND active=1").bind(await passwordHash(input.newPassword)+":"+await digest(code)+":personal",user.id,user.password_hash).run();
    if(!result.meta.changes)return fail("El acceso cambió. Vuelve a iniciar sesión.");
    return json({code});
   }
   return makeSession(user)
  }
  if(key==="logout"&&request.method==="POST"){const token=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);if(token)await d.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(decodeURIComponent(token))).run();return json({ok:true},200,{"set-cookie":`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`})}
  const user=await current(request);if(!user)return fail("Inicia sesión para continuar.",401);
  if(key==="dashboard"&&request.method==="GET"){
   const [activityRows,evidenceRows,logoRows]=await Promise.all([d.prepare("SELECT id,title,date,time,place,hours,description,category FROM activities ORDER BY date ASC,time ASC").all(),d.prepare("SELECT id,activity_id AS activityId,object_key AS objectKey,caption FROM activity_evidence ORDER BY created_at DESC").all<{id:string;activityId:string;objectKey:string;caption:string}>(),d.prepare("SELECT slot,label,object_key AS objectKey FROM site_logos ORDER BY slot").all<{slot:string;label:string;objectKey:string}>()]);
   const activities=activityRows.results.map((a:any)=>({...a,evidence:evidenceRows.results.filter(e=>e.activityId===a.id).map(e=>({...e,url:mediaPath(e.objectKey)}))}));const logos=logoRows.results.map(x=>({...x,url:mediaPath(x.objectKey)}));
   const month=new URL(request.url).searchParams.get("month");
   if(!month||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return fail("Selecciona un mes válido.");
   const isAdmin=user.role==="admin";
   const records=await d.prepare(`WITH records AS (
    SELECT x.student_id AS studentId,a.date,a.title AS activityTitle,x.status,x.hours,a.category,'activity' AS source,x.id,x.note FROM attendance x JOIN activities a ON a.id=x.activity_id
    UNION ALL SELECT student_id,substr(assigned_at,1,10),reason,'presente',hours,category,'manual',id,reason FROM hour_entries)
    SELECT * FROM records WHERE substr(date,1,7)=? AND (?=1 OR studentId=?) ORDER BY date DESC`).bind(month,Number(isAdmin),user.id).all<any>();
   const profiles=await d.prepare("SELECT id,name,username,community,cohort,phone,department,active,photo_key AS photoKey FROM students WHERE ?=1 OR id=? ORDER BY name").bind(Number(isAdmin),user.id).all<any>();
   const people=profiles.results.map(p=>{
    const rows=records.results.filter(r=>r.studentId===p.id);
    const sum=(category:string)=>rows.filter(r=>r.status==="presente"&&r.category===category).reduce((n,r)=>n+r.hours,0);
    const activityHours=sum("actividad"),learningHours=sum("aprendizaje"),hours=activityHours+learningHours;
    return {...p,activityHours,learningHours,hours,totalHours:hours,absences:rows.filter(r=>r.status==="falta").length,justified:rows.filter(r=>r.status==="justificada").length};
   });
   if(!isAdmin)return json({student:people[0],activities,logos,attendance:records.results});
   const totals=people.reduce((t,p)=>({students:t.students+Number(!!p.active),hours:t.hours+p.hours,absences:t.absences+p.absences,justified:t.justified+p.justified}),{students:0,hours:0,absences:0,justified:0});
   const hourEntries=records.results.filter(r=>r.source==="manual").map(r=>({...r,reason:r.activityTitle,studentName:people.find(p=>p.id===r.studentId)?.name}));
   return json({people,activities,logos,hourEntries,totals,records:records.results.map(r=>({...r,studentName:people.find(p=>p.id===r.studentId)?.name}))});
  }


  if(key==="storage"&&request.method==="GET"){
   if(!admin(user))return fail("Acceso no autorizado.",403);
   if(env.MEDIA_STORAGE!=="d1")return json({mode:"hosted"});
   const usage=await d.prepare("SELECT bytes FROM media_usage WHERE id=1").first<{bytes:number}>();
   return json({mode:"free",bytes:usage?.bytes||0,limit:MEDIA_CAP});
  }
  if(key==="evidence-delete"&&request.method==="POST"){
   if(!admin(user))return fail("Acceso no autorizado.",403);
   const input=await body<{id:string}>(request);
   const row=await d.prepare("SELECT object_key FROM activity_evidence WHERE id=?").bind(input.id).first<{object_key:string}>();
   if(!row)return fail("La evidencia ya no existe.",404);
   if(env.MEDIA_STORAGE==="d1")await d.batch([d.prepare("DELETE FROM activity_evidence WHERE id=?").bind(input.id),d.prepare("DELETE FROM media_files WHERE object_key=?").bind(row.object_key)]);
   else{await bucket().delete(row.object_key);await d.prepare("DELETE FROM activity_evidence WHERE id=?").bind(input.id).run()}
   return json({ok:true});
  }
  if(key==="qr-attendance"&&request.method==="POST"){
   if(!admin(user))return fail("Solo coordinación puede escanear credenciales.",403);
   const input=await body<{code:string;activityId:string;expectedHours:number;expectedDate:string;expectedCategory:string}>(request);
   if(typeof input.code!=="string"||!input.code.startsWith("IMJU-JB:1:")||input.code.length>160)return fail("Este QR no es una credencial del programa.");
   const studentId=input.code.slice(10);
   const student=await d.prepare("SELECT id,name,photo_key AS photoKey FROM students WHERE id=? AND active=1").bind(studentId).first();
   if(!student)return fail("Credencial no encontrada o participante inactivo.",404);
   const activity=await d.prepare("SELECT id,title,date,hours,category FROM activities WHERE id=?").bind(input.activityId).first<{id:string;title:string;date:string;hours:number;category:Category}>();
   if(!activity)return fail("Selecciona una actividad válida.");
   const parts=new Intl.DateTimeFormat("en",{timeZone:"America/Mazatlan",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
   const today=["year","month","day"].map(t=>parts.find(p=>p.type===t)?.value).join("-");
   if(activity.date>today)return fail("El escáner no registra actividades futuras.");
   if(activity.hours!==input.expectedHours||activity.date!==input.expectedDate||activity.category!==input.expectedCategory)return fail("La actividad cambió. Actualiza la página antes de escanear.",409);
   const existing=()=>d.prepare("SELECT status,hours FROM attendance WHERE student_id=? AND activity_id=?").bind(studentId,activity.id).first<{status:string;hours:number}>();
   const old=await existing();
   if(old)return json({student,activity,already:true,record:old});
   const stamp=dateNow(),id=uid(),month=activity.date.slice(0,7);
   const guard=d.prepare(`INSERT INTO attendance_batch_requests(id,fingerprint,valid,created_at)
    SELECT ?,'qr',CASE WHEN
     EXISTS(SELECT 1 FROM students WHERE id=? AND active=1) AND
     EXISTS(SELECT 1 FROM activities WHERE id=? AND date=? AND hours=? AND category=?) AND
     NOT EXISTS(SELECT 1 FROM attendance WHERE student_id=? AND activity_id=?) AND
     (SELECT COALESCE(SUM(x.hours),0) FROM attendance x JOIN activities a ON a.id=x.activity_id WHERE x.student_id=? AND x.status='presente' AND a.category=? AND substr(a.date,1,7)=?) +
     (SELECT COALESCE(SUM(hours),0) FROM hour_entries WHERE student_id=? AND category=? AND substr(assigned_at,1,7)=?) + ? <= ?
    THEN 1 ELSE 0 END,?`).bind(id,studentId,activity.id,activity.date,activity.hours,activity.category,studentId,activity.id,studentId,activity.category,month,studentId,activity.category,month,activity.hours,CAPS[activity.category],stamp);
   try{await d.batch([guard,d.prepare("INSERT INTO attendance(id,student_id,activity_id,status,hours,note,marked_at,marked_by) VALUES(?,?,?,'presente',?,'Registro con credencial QR',?,?)").bind(uid(),studentId,activity.id,activity.hours,stamp,user.id),d.prepare("DELETE FROM attendance_batch_requests WHERE id=?").bind(id)])}
   catch{const saved=await existing();if(saved)return json({student,activity,already:true,record:saved});return fail("No se registró: se alcanzó el límite mensual o cambió la actividad. Revisa el registro en Asistencia.",409)}
   return json({student,activity,already:false,record:{status:"presente",hours:activity.hours}});
  }
  if(key==="activity-roster"&&request.method==="GET"){
   if(!admin(user))return fail("Acceso no autorizado.",403);
   const activityId=new URL(request.url).searchParams.get("activityId");
   const activity=await d.prepare("SELECT id,title,date,category,hours FROM activities WHERE id=?").bind(activityId).first();
   if(!activity)return fail("No se encontró la actividad.",404);
   const people=await d.prepare(`SELECT s.id,s.name,s.active,s.community,s.photo_key AS photoKey,
    x.id AS attendanceId,x.status,x.hours,x.note,x.marked_at AS markedAt
    FROM students s LEFT JOIN attendance x ON x.student_id=s.id AND x.activity_id=?
    WHERE s.active=1 OR x.id IS NOT NULL ORDER BY s.name`).bind(activityId).all();
   return json({activity,people:people.results});
  }
  if(key==="attendance-batch"&&request.method==="POST"){
   if(!admin(user))return fail("Solo el acceso maestro puede pasar lista.",403);
   type Prior={id:string;status:string;hours:number;note:string;markedAt:string};
   type Change={studentId:string;status:string;hours:number;note:string;expected:Prior|null};
   const input=await body<{requestId:string;activityId:string;activityDate:string;activityCategory:Category;changes:Change[]}>(request);
   if(!/^[a-f0-9-]{36}$/.test(input.requestId)||!input.activityId||!Array.isArray(input.changes)||!input.changes.length||input.changes.length>500)return fail("Selecciona al menos un registro.");
   if(new Set(input.changes.map(r=>r.studentId)).size!==input.changes.length)return fail("Hay participantes repetidos.");
   const fingerprint=await digest(JSON.stringify(input));
   const receipt=()=>d.prepare("SELECT fingerprint FROM attendance_batch_requests WHERE id=?").bind(input.requestId).first<{fingerprint:string}>();
   const prior=await receipt();
   if(prior)return prior.fingerprint===fingerprint?json({ok:true,replayed:true}):fail("Solicitud duplicada con datos distintos.",409);
   const activity=await d.prepare("SELECT date,category FROM activities WHERE id=?").bind(input.activityId).first<{date:string;category:Category}>();
   if(!activity||activity.date!==input.activityDate||activity.category!==input.activityCategory)return fail("La actividad cambió. Recarga la lista.",409);
   const month=activity.date.slice(0,7);
   const commands=[d.prepare("INSERT INTO attendance_batch_requests (id,fingerprint,valid,created_at) VALUES (?,?,1,?)").bind(input.requestId,fingerprint,dateNow())];
   for(const row of input.changes){
    if(typeof row.studentId!=="string"||!["pending","presente","falta","justificada"].includes(row.status)||!Number.isInteger(row.hours)||row.hours<0||row.hours>24||typeof row.note!=="string"||row.note.length>240)return fail("Revisa los estados, horas (0–24) y observaciones.");
    const hours=row.status==="presente"?row.hours:0;
    const expected=row.expected;
    if(expected&&(!expected.id||!expected.markedAt||typeof expected.note!=="string"||!Number.isInteger(expected.hours)))return fail("Recarga el registro original.");
    const currentCheck=expected
     ?"EXISTS(SELECT 1 FROM attendance WHERE id=? AND student_id=? AND activity_id=? AND status=? AND hours=? AND note=? AND marked_at=?)"
     :"NOT EXISTS(SELECT 1 FROM attendance WHERE student_id=? AND activity_id=?)";
    const values=expected?[expected.id,row.studentId,input.activityId,expected.status,expected.hours,expected.note,expected.markedAt]:[row.studentId,input.activityId];
    const creditCheck=`(SELECT COALESCE(SUM(x.hours),0) FROM attendance x JOIN activities a ON a.id=x.activity_id WHERE x.student_id=? AND x.activity_id<>? AND x.status='presente' AND a.category=? AND substr(a.date,1,7)=?) +
     (SELECT COALESCE(SUM(hours),0) FROM hour_entries WHERE student_id=? AND category=? AND substr(assigned_at,1,7)=?) + ? <= ?`;
    const valid=`EXISTS(SELECT 1 FROM activities WHERE id=? AND date=? AND category=?) AND EXISTS(SELECT 1 FROM students WHERE id=?) AND (${currentCheck}) AND (${creditCheck})`;
    commands.push(d.prepare(`INSERT INTO attendance_batch_requests (id,fingerprint,valid,created_at) SELECT ?,'',CASE WHEN ${valid} THEN 1 ELSE 0 END,?`).bind(
     input.requestId+"/"+row.studentId,input.activityId,activity.date,activity.category,row.studentId,...values,
     row.studentId,input.activityId,activity.category,month,row.studentId,activity.category,month,hours,CAPS[activity.category],dateNow()));
    if(row.status==="pending"){
     commands.push(d.prepare("DELETE FROM attendance WHERE student_id=? AND activity_id=?").bind(row.studentId,input.activityId));
    }else{
     commands.push(d.prepare(`INSERT INTO attendance(id,student_id,activity_id,status,hours,note,marked_at,marked_by) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(student_id,activity_id) DO UPDATE SET status=excluded.status,hours=excluded.hours,note=excluded.note,marked_at=excluded.marked_at,marked_by=excluded.marked_by`).bind(uid(),row.studentId,input.activityId,row.status,hours,row.note,dateNow(),user.id));
    }
   }
   commands.push(d.prepare("DELETE FROM attendance_batch_requests WHERE id LIKE ? AND fingerprint=''").bind(input.requestId+"/%"));
   try{await d.batch(commands)}
   catch(error){
    const saved=await receipt();
    if(saved?.fingerprint===fingerprint)return json({ok:true,replayed:true});
    console.error("attendance-batch",error);
    return fail("No se guardó el lote: algún registro cambió o supera el límite mensual. Revisa las horas o recarga la lista.",409);
   }
   return json({ok:true,count:input.changes.length});
  }
  if(key==="record-correction"&&request.method==="POST"){
   if(!admin(user))return fail("Solo el acceso maestro puede corregir registros.",403);
   const input=await body<{id:string;source:string;action:string;hours:number;status:string;note:string;expectedHours:number;expectedStatus:string;expectedNote:string}>(request);
   if(!input.id||!["activity","manual"].includes(input.source)||!["update","delete"].includes(input.action))return fail("Registro inválido.");
   const manual=input.source==="manual";
   const old=manual
    ?await d.prepare("SELECT student_id AS studentId,category,substr(assigned_at,1,10) AS date,hours,'presente' AS status,reason AS note FROM hour_entries WHERE id=?").bind(input.id).first<{studentId:string;category:Category;date:string;hours:number;status:string;note:string}>()
    :await d.prepare("SELECT x.student_id AS studentId,a.category,a.date,x.hours,x.status,x.note FROM attendance x JOIN activities a ON a.id=x.activity_id WHERE x.id=?").bind(input.id).first<{studentId:string;category:Category;date:string;hours:number;status:string;note:string}>();
   if(!old)return fail("El registro ya no existe. Actualiza la lista.",404);
   if(old.hours!==input.expectedHours||old.status!==input.expectedStatus||old.note!==input.expectedNote)return fail("El registro cambió. Actualiza la lista antes de corregirlo.",409);
   const table=manual?"hour_entries":"attendance";
   const noteColumn=manual?"reason":"note";
   const statusWhere=manual?"":" AND status=?";
   const expected:Array<string|number>=[input.id,old.hours,old.note];
   if(!manual)expected.push(old.status);
   const where=`id=? AND hours=? AND ${noteColumn}=?${statusWhere}`;
   if(input.action==="delete"){
    const result=await d.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(...expected).run();
    if(!result.meta.changes)return fail("El registro cambió. Actualiza la lista.",409);
    return json({ok:true});
   }
   if(!Number.isInteger(input.hours)||input.hours<0||input.hours>24||typeof input.note!=="string"||input.note.length>240||(!manual&&!["presente","falta","justificada"].includes(input.status)))return fail("Revisa el estado, las horas (0 a 24) y la observación.");
   if(manual&&!input.note.trim())return fail("Escribe el motivo de las horas.");
   const status=manual?"presente":input.status;
   const hours=status==="presente"?input.hours:0;
   const credited=old.status==="presente"?old.hours:0;
   const error=await checkCredit(old.studentId,old.category,hours,old.date,old.category,credited);
   if(error)return fail(error);
   // Check the current month's balance again within the update.
   const cap=CAPS[old.category];
   const balance=`(SELECT COALESCE(SUM(x.hours),0) FROM attendance x JOIN activities a ON a.id=x.activity_id WHERE x.student_id=? AND x.status='presente' AND a.category=? AND substr(a.date,1,7)=?) + (SELECT COALESCE(SUM(h.hours),0) FROM hour_entries h WHERE h.student_id=? AND h.category=? AND substr(h.assigned_at,1,7)=?) - ? + ? <= ?`;
   const month=old.date.slice(0,7);
   const balanceValues=[old.studentId,old.category,month,old.studentId,old.category,month,credited,hours,cap];
   const set=manual?"hours=?,reason=?,assigned_by=?":"hours=?,note=?,marked_by=?,status=?,marked_at=?";
   const values:Array<string|number>=[hours,input.note.trim(),user.id];
   if(!manual)values.push(status,dateNow());
   const result=await d.prepare(`UPDATE ${table} SET ${set} WHERE ${where} AND (${balance})`).bind(...values,...expected,...balanceValues).run();
   if(!result.meta.changes)return fail("El registro o las horas del mes cambiaron. Actualiza la lista.",409);
   return json({ok:true});
  }
  if(key==="students"&&request.method==="POST"){
   if(!admin(user))return fail("Acceso no autorizado.",403);const input=await body<{name:string;username:string;password:string;community?:string;cohort?:string}>(request);if(input.name.trim().length<3||input.name.length>120||!/^[a-zA-Z0-9._-]{3,32}$/.test(input.username)||input.password.length<8||input.password.length>128||(input.community?.length||0)>100||(input.cohort?.length||0)>40)return fail("Completa los datos con un usuario de 3 a 32 caracteres y una contraseña de 8 a 128 caracteres.");const id=uid();await d.prepare("INSERT INTO students (id,username,password_hash,name,community,cohort,active,created_at) VALUES (?,?,?,?,?,?,1,?)").bind(id,input.username.trim().toLowerCase(),await passwordHash(input.password),input.name.trim(),input.community?.trim()||"",input.cohort?.trim()||"",dateNow()).run();return json({ok:true,id});
  }
  if(key==="students"&&request.method==="PATCH"){
   if(!admin(user))return fail("Acceso no autorizado.",403);const input=await body<{id:string;name:string;username:string;community?:string;cohort?:string;active:number;password?:string;phone?:string;department?:string}>(request);if(!input.id||input.name.trim().length<3||input.name.length>120||!/^[a-zA-Z0-9._-]{3,32}$/.test(input.username)||![0,1].includes(input.active)||(input.community?.length||0)>100||(input.cohort?.length||0)>40)return fail("Revisa los datos del participante.");if(input.password&&(input.password.length<8||input.password.length>128))return fail("La nueva contraseña debe tener entre 8 y 128 caracteres.");const fields=["name=?","username=?","community=?","cohort=?","active=?"];const values:Array<string|number>=[input.name.trim(),input.username.trim().toLowerCase(),input.community?.trim()||"",input.cohort?.trim()||"",input.active];if(input.password){fields.push("password_hash=?");values.push(await passwordHash(input.password))}if(input.phone!==undefined){if(typeof input.phone!=="string"||input.phone.length>30)return fail("Revisa el teléfono.");fields.push("phone=?");values.push(input.phone.trim())}
   if(input.department!==undefined){if(typeof input.department!=="string"||input.department.length>100)return fail("Revisa la dependencia.");fields.push("department=?");values.push(input.department.trim())}
   values.push(input.id);const update=d.prepare(`UPDATE students SET ${fields.join(",")} WHERE id=?`).bind(...values);
   if(input.password||!input.active)await d.batch([update,d.prepare("DELETE FROM sessions WHERE user_id=? AND role='student'").bind(input.id)]);else await update.run();return json({ok:true});
  }
  if(key==="activities"&&request.method==="POST"){
   if(!admin(user))return fail("Acceso no autorizado.",403);const input=await body<{title:string;date:string;time?:string;place?:string;hours:number;description?:string;category:Category}>(request);if(!input.title.trim()||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)||!Number.isInteger(input.hours)||input.hours<0||input.hours>24||!validCategory(input.category))return fail("Completa el nombre, fecha, tipo y horas válidas.");await d.prepare("INSERT INTO activities (id,title,date,time,place,hours,description,category,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(uid(),input.title.trim(),input.date,input.time||"",input.place?.trim()||"",input.hours,input.description?.trim()||"",input.category,dateNow()).run();return json({ok:true});
  }
  if(key==="activities"&&request.method==="PATCH"){
   if(!admin(user))return fail("Acceso no autorizado.",403);const input=await body<{id:string;title:string;date:string;time?:string;place?:string;hours:number;description?:string;category:Category}>(request);if(!input.id||!input.title.trim()||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)||!Number.isInteger(input.hours)||input.hours<0||input.hours>24||!validCategory(input.category))return fail("Completa el nombre, fecha, tipo y horas válidas.");const old=await d.prepare("SELECT category,date FROM activities WHERE id=?").bind(input.id).first<{category:Category;date:string}>();if(!old)return fail("No se encontró la actividad.",404);if(old.category!==input.category){const rows=await d.prepare("SELECT x.student_id,SUM(x.hours) AS hours FROM attendance x JOIN activities a ON a.id=x.activity_id WHERE a.category=? AND x.activity_id<>? AND x.status='presente' GROUP BY x.student_id").bind(input.category,input.id).all<{student_id:string;hours:number}>();const own=await d.prepare("SELECT student_id,hours FROM attendance WHERE activity_id=? AND status='presente'").bind(input.id).all<{student_id:string;hours:number}>();const balances=new Map(rows.results.map(r=>[r.student_id,r.hours]));const cap=CAPS[input.category];for(const row of own.results)if((balances.get(row.student_id)||0)+row.hours>cap)return fail(`No se puede cambiar el tipo: al menos un joven ya rebasa el límite de ${cap} horas en ${input.category}.`)}await d.prepare("UPDATE activities SET title=?,date=?,time=?,place=?,hours=?,description=?,category=? WHERE id=?").bind(input.title.trim(),input.date,input.time||"",input.place?.trim()||"",input.hours,input.description?.trim()||"",input.category,input.id).run();return json({ok:true});
  }
  if(key==="attendance"&&request.method==="POST"){
   if(!admin(user))return fail("Acceso no autorizado.",403);const input=await body<{studentId:string;activityId:string;status:string;hours:number;note?:string}>(request);if(!input.studentId||!input.activityId||!(["presente","falta","justificada"].includes(input.status))||!Number.isInteger(input.hours)||input.hours<0||input.hours>24)return fail("Revisa los datos de asistencia.");const activity=await d.prepare("SELECT category,date FROM activities WHERE id=?").bind(input.activityId).first<{category:Category;date:string}>();if(!activity)return fail("No se encontró la actividad.",404);const old=await d.prepare("SELECT hours FROM attendance WHERE student_id=? AND activity_id=? AND status='presente'").bind(input.studentId,input.activityId).first<{hours:number}>();const hours=input.status==="presente"?input.hours:0;const error=await checkCredit(input.studentId,activity.category,hours,activity.date,old?activity.category:undefined,old?.hours||0);if(error)return fail(error);await d.prepare("INSERT INTO attendance (id,student_id,activity_id,status,hours,note,marked_at,marked_by) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(student_id,activity_id) DO UPDATE SET status=excluded.status,hours=excluded.hours,note=excluded.note,marked_at=excluded.marked_at,marked_by=excluded.marked_by").bind(uid(),input.studentId,input.activityId,input.status,hours,input.note?.trim()||"",dateNow(),user.id).run();return json({ok:true});
  }
  if(key==="hour-entries"&&request.method==="POST"){
   if(!admin(user))return fail("Acceso no autorizado.",403);const input=await body<{studentId:string;category:Category;hours:number;reason:string;date?:string}>(request);if(!input.studentId||!validCategory(input.category)||!Number.isInteger(input.hours)||input.hours<1||input.hours>24||!input.reason.trim()||input.reason.length>240)return fail("Completa joven, tipo de horas, cantidad y motivo.");const student=await d.prepare("SELECT id FROM students WHERE id=? AND active=1").bind(input.studentId).first();if(!student)return fail("No se encontró al joven activo.",404);const error=await checkCredit(input.studentId,input.category,input.hours,input.date||dateNow());if(error)return fail(error);const assignedAt=input.date&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)?`${input.date}T12:00:00.000Z`:dateNow();await d.prepare("INSERT INTO hour_entries (id,student_id,category,hours,reason,assigned_at,assigned_by) VALUES (?,?,?,?,?,?,?)").bind(uid(),input.studentId,input.category,input.hours,input.reason.trim(),assignedAt,user.id).run();return json({ok:true});
  }
  if(key==="upload"&&request.method==="POST"){
   if(!admin(user))return fail("Solo coordinación puede subir fotografías.",403);
   const form=await request.formData(),kind=String(form.get("kind")||""),file=form.get("file");if(!(file instanceof File)||!await validImage(file))return fail("Sube una imagen JPG, PNG o WebP válida.");const max=env.MEDIA_STORAGE==="d1"?200000:(kind==="logo"?2*1024*1024:5*1024*1024);if(file.size>max)return fail(`La imagen no puede superar ${Math.round(max/1000)} KB.`);const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",store=bucket();
   if(kind==="profile"){
    const studentId=String(form.get("studentId")||"");if(!studentId)return fail("Falta seleccionar el perfil.");if(user.role!=="admin"&&studentId!==user.id)return fail("Solo puedes cambiar tu propia foto.",403);const exists=await d.prepare("SELECT id,photo_key FROM students WHERE id=?").bind(studentId).first<{id:string;photo_key:string|null}>();if(!exists)return fail("No se encontró el perfil.",404);const objectKey=`profile/${studentId}/${uid()}.${ext}`;await store.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type}});try{await d.prepare("UPDATE students SET photo_key=? WHERE id=?").bind(objectKey,studentId).run()}catch(error){await store.delete(objectKey);throw error}if(exists.photo_key)await store.delete(exists.photo_key);return json({ok:true,url:mediaPath(objectKey)});
   }
   if(!admin(user))return fail("Solo el acceso maestro puede subir evidencias o logos.",403);
   if(kind==="evidence"){
    const activityId=String(form.get("activityId")||""),caption=String(form.get("caption")||"").trim().slice(0,200);if(!activityId)return fail("Selecciona una actividad.");const exists=await d.prepare("SELECT id FROM activities WHERE id=?").bind(activityId).first();if(!exists)return fail("No se encontró la actividad.",404);const uploadId=String(form.get("uploadId")||uid());if(!/^[a-f0-9-]{36}$/.test(uploadId))return fail("Identificador de imagen inválido.");
    const existing=await d.prepare("SELECT object_key,activity_id,created_by FROM activity_evidence WHERE id=?").bind(uploadId).first<{object_key:string;activity_id:string;created_by:string}>();
    if(existing){if(existing.activity_id!==activityId||existing.created_by!==user.id)return fail("El archivo pertenece a otro registro.",409);return json({ok:true,url:mediaPath(existing.object_key)})}
    const objectKey=`evidence/${activityId}/${uploadId}.${ext}`;
    await store.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type}});
    await d.prepare("INSERT INTO activity_evidence (id,activity_id,object_key,caption,created_by,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(uploadId,activityId,objectKey,caption,user.id,dateNow()).run();
    return json({ok:true,url:mediaPath(objectKey)});
   }

   return fail("Tipo de carga no válido.");
  }
  if(key==="export"&&request.method==="GET"){
   if(!admin(user))return fail("Acceso no autorizado.",403);const rows=await d.prepare(`WITH records AS (SELECT s.name AS joven,s.username AS usuario,s.community AS comunidad,s.cohort AS generacion,a.title AS actividad,a.category AS tipo_horas,a.date AS fecha,x.status AS asistencia,x.hours AS horas,x.note AS observaciones,s.id AS student_id FROM students s LEFT JOIN attendance x ON x.student_id=s.id LEFT JOIN activities a ON a.id=x.activity_id UNION ALL SELECT s.name,s.username,s.community,s.cohort,h.reason,h.category,substr(h.assigned_at,1,10),'asignacion_manual',h.hours,h.reason,s.id FROM hour_entries h JOIN students s ON s.id=h.student_id),credits AS (SELECT s.id AS student_id,a.category,x.hours FROM attendance x JOIN activities a ON a.id=x.activity_id JOIN students s ON s.id=x.student_id WHERE x.status='presente' AND substr(a.date,1,7)=?1 UNION ALL SELECT student_id,category,hours FROM hour_entries WHERE substr(assigned_at,1,7)=?1),totals AS (SELECT student_id,SUM(CASE WHEN category='actividad' THEN hours ELSE 0 END) AS total_actividades,SUM(CASE WHEN category='aprendizaje' THEN hours ELSE 0 END) AS total_aprendizaje,SUM(hours) AS total_programa FROM credits GROUP BY student_id) SELECT r.joven,r.usuario,r.comunidad,r.generacion,s.phone AS telefono,s.department AS dependencia,r.actividad,r.tipo_horas,r.fecha,r.asistencia,r.horas,COALESCE(t.total_actividades,0) AS total_actividades_de_80,COALESCE(t.total_aprendizaje,0) AS total_aprendizaje_de_10,COALESCE(t.total_programa,0) AS total_programa_de_90,r.observaciones FROM records r JOIN students s ON s.id=r.student_id LEFT JOIN totals t ON t.student_id=r.student_id WHERE substr(r.fecha,1,7)=?1 ORDER BY r.joven,r.fecha`).bind(new URL(request.url).searchParams.get("month")).all<Record<string,unknown>>();const cols=["joven","usuario","comunidad","generacion","telefono","dependencia","actividad","tipo_horas","fecha","asistencia","horas","total_actividades_de_80","total_aprendizaje_de_10","total_programa_de_90","observaciones"];const escape=(v:unknown)=>{let value=String(v??"");if(/^[=+@\-\t\r]/.test(value))value=`'${value}`;return `"${value.replaceAll('"','""')}"`};const csv="\uFEFF"+[cols.join(","),...rows.results.map(r=>cols.map(c=>escape(r[c])).join(","))].join("\r\n");return new Response(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=\"jovenes-unen-al-barrio.csv\"","cache-control":"no-store"}})
  }
  return fail("Ruta no encontrada.",404)
 }catch(error){if(error instanceof MediaLimitError)return fail(error.message,413);console.error("program-api",error);return fail("No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.",500)}
}
