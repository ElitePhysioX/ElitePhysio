/* ═══════════════════════════════════════
   ElitePhysio — app.js v3
   All application logic and rendering
═══════════════════════════════════════ */

// ── App State ──
var APW = ""; // password verified server-side
var SK  = "ep12";
var AI_KEY = "";
var pts = [], lng = "he", auth = null, cur = null, ctab = "ex", ptab = "ex", stmr = null, mmode = "";
var deletedPatients = []; // recycle bin for patients
var deletedExercises = []; // recycle bin for exercises
var appts = [];
var calWeekOffset = 0;
var calDrag = null;
var calSH = 28; // slot height px, updated on each render
var fuReadMap = {}; // {patientId: latestSeenNoteId} — tracks which follow-up notes admin has read

function loadFuRead(){ try{ fuReadMap=JSON.parse(localStorage.getItem("ep_furead")||"{}"); }catch(e){ fuReadMap={}; } }
function saveFuRead(){ try{ localStorage.setItem("ep_furead",JSON.stringify(fuReadMap)); }catch(e){} }
function hasNewNote(p){
  var fus=p.followUps||[]; if(!fus.length) return false;
  var latest=fus[0].id; // followUps are stored newest-first
  return fuReadMap[p.id] !== latest;
}
function markNotesRead(id){
  var p=pts.find(function(x){ return x.id===id; }); if(!p) return;
  var fus=p.followUps||[]; if(!fus.length) return;
  fuReadMap[id]=fus[0].id; saveFuRead();
}

function loadRecycleBin(){
  try{
    var raw=JSON.parse(localStorage.getItem("ep_del_pts")||"[]");
    var sevenDays=7*24*60*60*1000;
    deletedPatients=raw.filter(function(x){ return x.deletedAt && (Date.now()-new Date(x.deletedAt).getTime())<sevenDays; });
  }catch(e){ deletedPatients=[]; }
  try{
    var rawEx=JSON.parse(localStorage.getItem("ep_del_ex")||"[]");
    var sevenDays=7*24*60*60*1000;
    deletedExercises=rawEx.filter(function(x){ return x.deletedAt && (Date.now()-new Date(x.deletedAt).getTime())<sevenDays; });
  }catch(e){ deletedExercises=[]; }
}
function saveRecycleBin(){
  try{ localStorage.setItem("ep_del_pts", JSON.stringify(deletedPatients.slice(0,20))); }catch(e){}
  try{ localStorage.setItem("ep_del_ex", JSON.stringify(deletedExercises.slice(0,50))); }catch(e){}
}

// ── Helpers ──
function L(){ return T[lng]; }
function g(id){ return document.getElementById(id); }
function av(n,s){ s=s||38; var i=(n||"?").split(" ").map(function(x){return x[0];}).join("").slice(0,2); return '<div class="av" style="width:'+s+'px;height:'+s+'px;font-size:'+(s>44?17:13)+'px">'+i+'</div>'; }
function bdg(t,c){ c=c||"#2B6CC4"; return '<span class="bdg" style="background:'+c+'15;color:'+c+';border:1px solid '+c+'40">'+t+'</span>'; }
function sbdg(s){ return bdg(s||"Active",SC[s]||"#2B6CC4"); }
function waLink(p){ return p.phone?'<a href="https://wa.me/972'+p.phone.replace(/^0/,"").replace(/-/g,"")+'\" target="_blank" onclick="event.stopPropagation()" style="font-size:12px;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 8px;text-decoration:none;font-weight:600">'+L().wa+'</a>':""; }
function ytUrl(n){ return "https://www.youtube.com/results?search_query="+encodeURIComponent((n||"exercise")+" physical therapy technique"); }

// ── Secure API ──
var ADMIN_TOKEN = "";
var SB_URL = "https://akovtufhkfnjrzqvzdyv.supabase.co";
var SB_KEY = ""; // loaded from worker at runtime

function apiCall(path, method, body, cb){
  var opts = { method: method||"GET", headers: { "Content-Type":"application/json" } };
  if(ADMIN_TOKEN) opts.headers["Authorization"] = "Bearer "+ADMIN_TOKEN;
  if(body) opts.body = JSON.stringify(body);
  fetch("/api/"+path, opts)
    .then(function(r){ return r.json(); })
    .then(function(d){ if(cb) cb(null,d); })
    .catch(function(e){ if(cb) cb(e); });
}

function toRow(p){
  return {
    id:p.id, name:p.name||"", name_he:p.nameHe||"", sport:p.sport||"",
    age:p.age||"", phone:p.phone||"", injury:p.injury||"", pin:p.pin||"0000",
    status:p.status||"Active", notes:p.notes||"", sessions:p.sessions||0,
    start_date:p.startDate||"", exercises:p.exercises||[],
    follow_ups:p.followUps||[], eval:p.eval||"",
    workout_history:p.workoutHistory||[],
    workout_plans:p.workoutPlans||[],
    avatar_id:p.avatarId||0,
    first_login_done:p.firstLoginDone||false
  };
}
function fromRow(r){
  var p = {
    id:r.id, name:r.name||"", nameHe:r.name_he||"", sport:r.sport||"",
    age:r.age||"", phone:r.phone||"", injury:r.injury||"", pin:r.pin||"0000",
    status:r.status||"Active", notes:r.notes||"", sessions:r.sessions||0,
    startDate:r.start_date||"", exercises:r.exercises||[],
    followUps:r.follow_ups||[], files:[], eval:r.eval||"",
    workoutHistory:r.workout_history||[],
    workoutPlans:r.workout_plans||[],
    avatarId:r.avatar_id||0,
    firstLoginDone:r.first_login_done||false
  };
  // Migrate old flat exercises into default plan if no plans exist
  if(p.workoutPlans.length===0 && p.exercises && p.exercises.length>0){
    p.workoutPlans=[{
      id: Date.now(),
      name:"Main Program", nameHe:"תכנית מרכזית",
      type:"repeating",
      days:[{id:Date.now()+1, name:"Day A", nameHe:"יום א", exercises:p.exercises}]
    }];
  }
  return p;
}

function sbLoad(cb){
  if(!SB_KEY){ if(cb) cb(); return; }
  fetch(SB_URL+"/rest/v1/patients?select=*&order=id.asc&id=neq.0", { headers: sbHeaders() })
    .then(function(r){ return r.json(); })
    .then(function(rows){
      if(Array.isArray(rows)){
        pts = rows.filter(function(r){ return r.name!=="__system__"; }).map(fromRow);
        try{ localStorage.setItem(SK, JSON.stringify(pts)); }catch(e){}
      }
      if(cb) cb();
    })
    .catch(function(){ if(cb) cb(); });
}

function sbHeaders(){
  return { "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":"Bearer "+SB_KEY };
}


function sbSave(p){
  if(!SB_KEY) return;
  fetch(SB_URL+"/rest/v1/patients", {
    method:"POST",
    headers: Object.assign({}, sbHeaders(), {"Prefer":"resolution=merge-duplicates"}),
    body: JSON.stringify(toRow(p))
  }).catch(function(){});
}

function sbDelete(id){
  if(!SB_KEY) return;
  fetch(SB_URL+"/rest/v1/patients?id=eq."+id, {
    method:"DELETE", headers: sbHeaders()
  }).catch(function(){});
}

// ── Storage ──
function lsave(){ try{ localStorage.setItem(SK, JSON.stringify(pts)); }catch(e){} }
function lload(){ try{ var d=localStorage.getItem(SK); if(d) return JSON.parse(d); }catch(e){} return null; }

var sbSaveTimer = null;
function sv(){
  clearTimeout(stmr);
  clearTimeout(sbSaveTimer);
  lsave();
  stmr = setTimeout(function(){
    var svi=g("svi"); if(svi) svi.style.display="flex";
    setTimeout(function(){ var svi=g("svi"); if(svi) svi.style.display="none"; },700);
  },300);
  sbSaveTimer = setTimeout(function(){
    var toSync = cur ? [cur] : pts;
    toSync.forEach(function(p){ sbSave(p); });
  },500);
}

function dp(id){
  var p = pts.find(function(x){ return x.id===id; });
  if(!p) return;
  var name = pn(p);
  if(!confirm("Delete patient \""+name+"\"?\n\nThey will be moved to the Recycle Bin and can be restored.")) return;
  deletedPatients.unshift({patient: JSON.parse(JSON.stringify(p)), deletedAt: new Date().toISOString()});
  saveRecycleBin();
  pts = pts.filter(function(x){ return x.id!==id; });
  lsave();
  apiCall("patients/"+id,"DELETE");
  cm(); rpl(); gv("p");
}


// ── Language ──
function setL(l){
  lng = l;
  // Apply direction only to content, never headers
  var dir = l === "he" ? "rtl" : "ltr";
  document.body.style.direction = dir;
  // Force headers to always stay LTR
  document.querySelectorAll("header").forEach(function(h){ h.style.direction="ltr"; });
  // Flags - highlight active language correctly
  var fle=g("fle"),flh=g("flh");
  if(fle&&flh){
    fle.style.background = l==="en" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.1)";
    fle.style.border = l==="en" ? "2.5px solid #fff" : "2px solid rgba(255,255,255,0.25)";
    fle.style.boxShadow = l==="en" ? "0 2px 10px rgba(0,0,0,0.3)" : "none";
    fle.style.color = l==="en" ? "#1a3a6e" : "#fff";
    flh.style.background = l==="he" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.1)";
    flh.style.border = l==="he" ? "2.5px solid #fff" : "2px solid rgba(255,255,255,0.25)";
    flh.style.boxShadow = l==="he" ? "0 2px 10px rgba(0,0,0,0.3)" : "none";
    flh.style.color = l==="he" ? "#1a3a6e" : "rgba(255,255,255,0.9)";
  }
  var afle=g("afle"),aflh=g("aflh");
  if(afle&&aflh){
    afle.style.background = l==="en" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.12)";
    afle.style.border = l==="en" ? "2px solid #fff" : "2px solid rgba(255,255,255,0.25)";
    afle.style.color = l==="en" ? "#1a3a6e" : "rgba(255,255,255,0.9)";
    aflh.style.background = l==="he" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.12)";
    aflh.style.border = l==="he" ? "2px solid #fff" : "2px solid rgba(255,255,255,0.25)";
    aflh.style.color = l==="he" ? "#1a3a6e" : "rgba(255,255,255,0.9)";
  }
  var pfle=g("pfle"),pflh=g("pflh");
  if(pfle&&pflh){
    pfle.style.background = l==="en" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.12)";
    pfle.style.border = l==="en" ? "2px solid #fff" : "2px solid rgba(255,255,255,0.25)";
    pfle.style.color = l==="en" ? "#1a3a6e" : "rgba(255,255,255,0.9)";
    pflh.style.background = l==="he" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.12)";
    pflh.style.border = l==="he" ? "2px solid #fff" : "2px solid rgba(255,255,255,0.25)";
    pflh.style.color = l==="he" ? "#1a3a6e" : "rgba(255,255,255,0.9)";
  }

  var Lx = L();
  // Login page text
  var lt=g("l-tagline"); if(lt) lt.textContent=Lx.tagline;
  var lw=g("l-welcome"); if(lw) lw.textContent=Lx.welcome;
  var li=g("l-intro"); if(li) li.textContent=Lx.intro;
  var lep=g("l-enter"); if(lep) lep.textContent=Lx.enterplan;
  var lab=g("l-admin-btn"); if(lab) lab.textContent=Lx.adminlink;
  var lal=g("l-al"); if(lal) lal.textContent=Lx.al;
  var lyn=g("l-yn"); if(lyn) lyn.textContent=Lx.yn;
  var lyp=g("l-yp"); if(lyp) lyp.textContent=Lx.yp;
  var pnm=g("pnm"); if(pnm) pnm.placeholder=l==="he"?"\u05e9\u05dd \u05de\u05dc\u05d0":"Full name"; // v2
  var ppi=g("ppi"); if(ppi) ppi.placeholder=l==="he"?"\u05e7\u05d5\u05d3 \u05d0\u05d1\u05d8\u05d7\u05d4":"PIN code"; // v2
  // Header taglines
  var hta=g("hdr-tag-a"); if(hta) hta.textContent=Lx.tagline;
  var htp=g("hdr-tag-p"); if(htp) htp.textContent=Lx.tagline;
  // Nav buttons
  var ids={svt:"sv",alo:"lo",plo:"lo",pnb:"np",pbk:"bk",nbd:"dash",nbp:"pats",nbs:"stats"};
  for(var id in ids){ var el=g(id); if(el&&Lx[ids[id]]) el.textContent=Lx[ids[id]]; }
  var psr=g("psr"); if(psr) psr.placeholder=Lx.sr;
  // Re-render current view
  if(auth==="admin"){
    if(g("vd")&&!g("vd").classList.contains("hid")) rd();
    else if(g("vp")&&!g("vp").classList.contains("hid")) rpl();
    else if(g("vs")&&!g("vs").classList.contains("hid")) rs();
    else if(g("vpat")&&!g("vpat").classList.contains("hid")) rpd();
  } else if(auth) rpv();
}

// ── Auth ──
function toggleAdmin(){ var box=g("admin-box"); box.classList.toggle("hid"); if(!box.classList.contains("hid")) g("apw").focus(); }
function ss2(s){ g("LS").classList.toggle("hid",s!=="l"); g("AS").classList.toggle("hid",s!=="a"); g("PS").classList.toggle("hid",s!=="p"); }
function alog(){
  var pw = g("apw").value;
  apiCall("admin-login","POST",{password:pw},function(err,d){
    if(!err && d && d.ok){
      ADMIN_TOKEN = pw;
      SB_KEY = d.sbKey||"";
      auth="admin"; g("apw").value="";
      setL("he");
      sessionStorage.setItem("ep_session", JSON.stringify({auth:"admin", token:pw, sbKey:SB_KEY, lng:"he"}));
      loadFuRead();
      syncCustomLib();
      ss2("a");
      sbLoad(function(){
        var local=lload();
        if(local && local.length>0){
          local.forEach(function(lp){
            if(!pts.find(function(p){return p.id===lp.id;})){
              pts.push(lp); sbSave(lp);
            }
          });
          lsave();
        }
        gv("d");
      });
    } else {
      g("le1").textContent="Incorrect password.";
      g("le1").style.display="block";
    }
  });
}
function plog(){
  var name=g("pnm").value.trim(), pin=g("ppi").value.trim();
  if(!name||!pin) return;
  apiCall("patient-login","POST",{name:name,pin:pin},function(err,d){
    if(!err && d && d.ok && d.patient){
      var p=fromRow(d.patient);
      pts=[p]; lsave();
      auth=p.id; cur=p; ptab="ex"; g("ppi").value="";
      sessionStorage.setItem("ep_session", JSON.stringify({auth:p.id, ptab:"ex", lng:lng}));
      ss2("p"); rpv();
    } else {
      g("le2").textContent=L().le; g("le2").style.display="block";
    }
  });
}
function dout(){ auth=null; cur=null; ADMIN_TOKEN=""; SB_KEY=""; sessionStorage.removeItem("ep_session"); ss2("l"); g("le2").style.display="none"; g("le1").style.display="none"; }

// ── Navigation ──
function gv(v){
  ["d","p","s","pat"].forEach(function(x){ g("v"+(x==="pat"?"pat":x)).classList.add("hid"); });
  g("v"+(v==="pat"?"pat":v)).classList.remove("hid");
  ["d","p","s"].forEach(function(x){ var nb=g("nb"+x); if(nb) nb.classList.toggle("on",x===v||(x==="p"&&v==="pat")); });
  if(v==="d") rd();
  else if(v==="p") rpl();
  else if(v==="s") rs();
}

// ── Calendar ──
function calWeekStart(offset){
  var d=new Date(); var day=d.getDay(); d.setHours(0,0,0,0); d.setDate(d.getDate()-day+(offset*7)); return d;
}
function calDays(offset){
  var ws=calWeekStart(offset);
  return [0,1,2,3,4,5,6].map(function(i){ var d=new Date(ws); d.setDate(d.getDate()+i); return d; });
}
function fmtDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtDayLabel(d){
  var mob=window.innerWidth<700;
  var nHe=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  var nEn=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var dayName=lng==="he"?nHe[d.getDay()]:nEn[d.getDay()];
  return '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px">'+
         '<div style="font-size:'+(mob?'13':'16')+'px;font-weight:800;line-height:1">'+d.getDate()+'</div>'+
         '<div style="font-size:'+(mob?'7':'9')+'px;font-weight:500;opacity:.75;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52px">'+dayName+'</div>'+
         '</div>';
}
function loadAppts(cb){
  if(!ADMIN_TOKEN){ appts=[]; cb(); return; }
  apiCall("appts","GET",null,function(err,data){
    if(!err&&Array.isArray(data)){ appts=data; }
    else{ appts=[]; }
    cb();
  });
}
function addAppt(a){
  if(!ADMIN_TOKEN) return;
  if(!a.id) a.id = Math.floor(Date.now() / 1000); // Unix seconds fits in INT4 until 2038
  appts.push(a); renderCal(); // show immediately
  apiCall("appts","POST",a,function(err,d){
    loadAppts(function(){ renderCal(); }); // sync real ids from server
  });
}
function deleteAppt(id){
  if(!ADMIN_TOKEN) return;
  var a=appts.find(function(x){return x.id==id;});
  var p=a?pts.find(function(x){return x.id==(a.patient_id||a.patientId);}):null;
  var nm=p?pn(p):(a&&a.patientName||"?");
  var info=a?(nm+' &mdash; '+a.date+' '+a.time+(a.end_time?' – '+a.end_time:'')):'';
  g("MC").innerHTML=
    '<div style="padding:8px 0;text-align:center">'+
    '<div style="font-size:28px;margin-bottom:10px">&#128465;</div>'+
    '<div style="font-size:16px;font-weight:800;color:#1a3a6e;margin-bottom:8px">'+(lng==="he"?"למחוק את התור?":"Delete appointment?")+'</div>'+
    '<div style="font-size:12px;color:#4a6a8a;margin-bottom:22px">'+info+'</div>'+
    '<div style="display:flex;gap:10px">'+
    '<button class="btn" style="flex:1;background:#e74c3c;color:#fff;padding:12px;font-size:14px" onclick="confirmDeleteAppt('+id+')">'+(lng==="he"?"כן, מחק":"Yes, delete")+'</button>'+
    '<button class="btn" style="flex:1;background:#f1f5f9;color:#1a3a6e;padding:12px;font-size:14px" onclick="cm()">'+(lng==="he"?"ביטול":"Cancel")+'</button>'+
    '</div></div>';
  g("MB").classList.add("on");
}
function confirmDeleteAppt(id){
  cm();
  if(!ADMIN_TOKEN) return;
  apiCall("appts/"+id,"DELETE",null,function(err){
    if(!err){ appts=appts.filter(function(a){ return a.id!=id; }); renderCal(); }
  });
}
function timeToSlotIdx(t){ var p=(t||"07:00").split(':'),h=parseInt(p[0]),m=parseInt(p[1]||0); return (h-7)*2+(m>=30?1:0); }
function slotIdxToTime(i){ var h=7+Math.floor(i/2),m=i%2===0?'00':'30'; return String(h).padStart(2,'0')+':'+m; }
function addMinutes(t,mins){ var p=(t||"00:00").split(':'),h=parseInt(p[0]),m=parseInt(p[1]||0)+mins; h+=Math.floor(m/60); m=m%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }
function calBodyClick(e,date){ if(calDrag) return; var r=e.currentTarget.getBoundingClientRect(); var idx=Math.max(0,Math.min(Math.floor((e.clientY-r.top)/calSH),24)); openNewApptAt(date,slotIdxToTime(idx)); }

function buildCalHTML(){
  var mob=window.innerWidth<700;
  var SH=mob?16:28; calSH=SH;
  var N=26, HDR=mob?36:44, TCOL=mob?28:38, gridH=N*SH;
  var days=calDays(calWeekOffset);
  var todayStr=fmtDate(new Date());
  var ws=days[0],we=days[6];
  var lo=lng==="he"?"he-IL":"en-US";
  var wLabel=ws.toLocaleDateString(lo,{month:"short",day:"numeric"})+" – "+we.toLocaleDateString(lo,{month:"short",day:"numeric",year:"numeric"});
  // Time labels (hours only)
  var tL=""; for(var i=0;i<N;i+=2){ tL+='<div style="position:absolute;top:'+(i*SH-5)+'px;right:3px;font-size:9px;color:#9aabcf;line-height:1">'+String(7+i/2).padStart(2,'0')+':00</div>'; }
  var H='<div class="card cal-card" style="padding:0;overflow:hidden;margin-bottom:24px">';
  // Header bar
  H+='<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;flex-wrap:wrap;gap:6px">';
  H+='<div style="display:flex;align-items:center;gap:6px">';
  H+='<button class="btn" style="padding:3px 11px;font-size:15px;background:#fff;border:1px solid #d1d9e0;color:#1a3a6e" onclick="calWeekOffset--;renderCal()">&#8249;</button>';
  H+='<span style="font-size:12px;font-weight:700;color:#1a3a6e;min-width:150px;text-align:center">'+wLabel+'</span>';
  H+='<button class="btn" style="padding:3px 11px;font-size:15px;background:#fff;border:1px solid #d1d9e0;color:#1a3a6e" onclick="calWeekOffset++;renderCal()">&#8250;</button>';
  if(calWeekOffset!==0) H+='<button class="btn" style="padding:3px 8px;font-size:11px;background:#e8f0fe;color:#2B6CC4;border:none" onclick="calWeekOffset=0;renderCal()">'+(lng==="he"?"היום":"Today")+'</button>';
  H+='</div>';
  H+='<button class="btn" style="font-size:12px;padding:4px 12px;background:#2B6CC4;color:#fff" onclick="openNewAppt()">'+(lng==="he"?"+ תור חדש":"+ New Appt")+'</button>';
  H+='</div>';
  // Grid container — always RTL so Sunday is on the right (Israeli layout)
  H+='<div style="overflow-x:auto"><div style="display:flex;min-width:480px;direction:rtl">';
  // Time column
  H+='<div style="width:'+TCOL+'px;flex-shrink:0;direction:ltr"><div style="height:'+HDR+'px;background:#f8fafc;border-bottom:2px solid #e2e8f0;border-left:1px solid #e2e8f0"></div>';
  H+='<div style="position:relative;height:'+gridH+'px;background:#fafbfd;border-left:1px solid #e2e8f0">'+tL+'</div></div>';
  // Day columns
  days.forEach(function(d){
    var ds=fmtDate(d); var it=ds===todayStr;
    var da=appts.filter(function(a){ return a.date===ds; });
    H+='<div style="flex:1;min-width:56px;border-right:1px solid #f0f4f8">';
    H+='<div style="height:'+HDR+'px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;text-align:center;color:'+(it?"#2B6CC4":"#1a3a6e")+';background:'+(it?"#e8f0fe":"#f8fafc")+';border-bottom:2px solid #e2e8f0">'+fmtDayLabel(d)+'</div>';
    H+='<div class="cal-day-body" data-date="'+ds+'" style="position:relative;height:'+gridH+'px;background:'+(it?"#f5f8ff":"#fff")+'" onclick="calBodyClick(event,\''+ds+'\')">';
    // Grid lines: bold at hour starts (:30→:00 boundary), dashed at half-hours
    for(var i=0;i<N;i++){ H+='<div style="position:absolute;top:'+(i*SH)+'px;left:0;right:0;height:'+SH+'px;border-bottom:'+(i%2===1?'1px solid #b8c8da':'1px dashed #e8ecf2')+'"></div>'; }
    // Appointment blocks
    da.forEach(function(a){
      var p=pts.find(function(x){ return x.id==(a.patient_id||a.patientId); });
      var nm=p?pn(p):(a.patientName||"?");
      var si=Math.max(0,Math.min(timeToSlotIdx(a.time),N-1));
      var ei=a.end_time?Math.max(si+1,Math.min(timeToSlotIdx(a.end_time),N)):si+2;
      var ht=(ei-si)*SH-3;
      var endLabel=a.end_time||addMinutes(a.time,60);
      H+='<div style="position:absolute;top:'+(si*SH+1)+'px;left:2px;right:2px;height:'+ht+'px;background:#2B6CC418;border-left:3px solid #2B6CC4;border-radius:4px;padding:3px 18px 2px 5px;font-size:10px;font-weight:600;color:#1a4a90;overflow:hidden;cursor:grab;box-sizing:border-box;z-index:2;touch-action:none;user-select:none" ';
      H+='onclick="event.stopPropagation();'+(p?'op('+p.id+')':'')+'" ';
      H+='onpointerdown="calDragStart(event,'+a.id+')" ';
      H+='title="'+nm+(a.notes?' — '+a.notes:'')+'">';
      var calDot=(auth==="admin"&&p&&hasNewNote(p))?'<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#f97316;vertical-align:middle;margin-right:3px;flex-shrink:0"></span>':'';
      H+='<div style="display:flex;align-items:center;gap:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3">'+calDot+'<span style="overflow:hidden;text-overflow:ellipsis">'+nm+'</span></div>';
      H+='<div style="font-size:9px;opacity:.6;margin-top:1px">'+a.time+' – '+endLabel+'</div>';
      H+='<span style="position:absolute;right:3px;top:3px;font-size:9px;opacity:.4;cursor:pointer;touch-action:none" onclick="event.stopPropagation();deleteAppt('+a.id+')">&#x2715;</span>';
      H+='</div>';
    });
    H+='</div></div>'; // day-body + day-col
  });
  H+='</div></div></div>'; // flex + overflow + card
  return H;
}
function renderCal(){ var s=g("cal-section"); if(s) s.innerHTML=buildCalHTML(); }

// Drag-and-drop
function calDragStart(e,apptId){
  if(e.button!==undefined&&e.button!==0) return;
  e.preventDefault(); e.stopPropagation();
  var a=appts.find(function(x){return x.id==apptId;}); if(!a) return;
  var p=pts.find(function(x){return x.id==(a.patient_id||a.patientId);});
  var nm=p?pn(p):(a.patientName||"?");
  var el=e.currentTarget, rect=el.getBoundingClientRect();
  var ghost=document.createElement('div');
  ghost.style.cssText='position:fixed;z-index:9999;pointer-events:none;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;background:#2B6CC428;border-left:3px solid #2B6CC4;border-radius:4px;padding:3px 5px;font-size:10px;font-weight:600;color:#1a4a90;box-shadow:0 4px 18px rgba(43,108,196,0.35);box-sizing:border-box;opacity:.9;transform:scale(1.04)';
  ghost.innerHTML='<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+nm+'</div><div style="font-size:9px;opacity:.6;margin-top:1px">'+a.time+' – '+addMinutes(a.time,60)+'</div>';
  document.body.appendChild(ghost);
  el.style.opacity='.25';
  el.setPointerCapture(e.pointerId);
  calDrag={id:apptId,el:el,ghost:ghost,ox:e.clientX-rect.left,oy:e.clientY-rect.top,pid:e.pointerId,origDate:a.date,origTime:a.time};
  el.addEventListener('pointermove',calOnMove);
  el.addEventListener('pointerup',calOnUp);
  el.addEventListener('pointercancel',calOnCancel);
}
function calOnMove(e){
  if(!calDrag) return;
  calDrag.ghost.style.left=(e.clientX-calDrag.ox)+'px';
  calDrag.ghost.style.top=(e.clientY-calDrag.oy)+'px';
}
function calOnUp(e){
  if(!calDrag) return;
  calDrag.el.removeEventListener('pointermove',calOnMove);
  calDrag.el.removeEventListener('pointerup',calOnUp);
  calDrag.el.removeEventListener('pointercancel',calOnCancel);
  try{ calDrag.el.releasePointerCapture(calDrag.pid); }catch(err){}
  calDrag.el.style.opacity='';
  document.body.removeChild(calDrag.ghost);
  var newDate=null,newTime=null;
  var bodies=document.querySelectorAll('.cal-day-body');
  for(var i=0;i<bodies.length;i++){
    var r=bodies[i].getBoundingClientRect();
    if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){
      newDate=bodies[i].dataset.date;
      newTime=slotIdxToTime(Math.max(0,Math.min(Math.floor((e.clientY-r.top)/calSH),24)));
      break;
    }
  }
  var drag=calDrag; calDrag=null;
  if(newDate&&newTime&&(newDate!==drag.origDate||newTime!==drag.origTime)){
    updateApptDateTime(drag.id,newDate,newTime);
  } else { renderCal(); }
}
function calOnCancel(e){
  if(!calDrag) return;
  calDrag.el.removeEventListener('pointermove',calOnMove);
  calDrag.el.removeEventListener('pointerup',calOnUp);
  calDrag.el.removeEventListener('pointercancel',calOnCancel);
  try{ calDrag.el.releasePointerCapture(calDrag.pid); }catch(err){}
  calDrag.el.style.opacity='';
  document.body.removeChild(calDrag.ghost);
  calDrag=null; renderCal();
}
function updateApptDateTime(id,date,time){
  var a=appts.find(function(x){return x.id==id;}); if(!a) return;
  var dur=60;
  if(a.end_time){ var si=timeToSlotIdx(a.time),ei=timeToSlotIdx(a.end_time); dur=Math.max(30,(ei-si)*30); }
  a.date=date; a.time=time; a.end_time=addMinutes(time,dur);
  if(ADMIN_TOKEN) apiCall("appts/"+id,"PATCH",{date:date,time:time,end_time:a.end_time},function(){});
  renderCal();
}
function caTimeChanged(){
  var st=g("ca-time"),et=g("ca-etime"); if(!st||!et) return;
  var opts=et.options;
  for(var i=0;i<opts.length;i++){ if(opts[i].value===st.value){ et.selectedIndex=Math.min(i+2,opts.length-1); break; } }
}
function openNewAppt(){ openNewApptAt("",""); }
function openNewApptAt(date,time,preselectId){
  var td=fmtDate(new Date());
  var pO=pts.map(function(p){ return '<option value="'+p.id+'"'+(p.id===preselectId?' selected':'')+'>'+pn(p)+'</option>'; }).join("");
  if(!pO) pO='<option value="">'+( lng==="he"?"אין מטופלים":"No patients")+'</option>';
  var tO=""; for(var h=7;h<20;h++){ var hs=String(h).padStart(2,"0"); tO+='<option value="'+hs+':00">'+hs+':00</option><option value="'+hs+':30">'+hs+':30</option>'; }
  var iS='style="width:100%;padding:9px 10px;border:1px solid #d1d9e0;border-radius:8px;font-size:14px;margin-bottom:14px;background:#f8fafc;box-sizing:border-box"';
  var d64=encodeURIComponent(date||""), t64=encodeURIComponent(time||"");
  g("MC").innerHTML=
    '<div style="padding:4px 0">'+
    '<div style="font-size:18px;font-weight:800;color:#1a3a6e;margin-bottom:18px">'+(lng==="he"?"תור חדש":"New Appointment")+'</div>'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">'+
    '<label style="font-size:12px;color:#4a6a8a;font-weight:600">'+(lng==="he"?"מטופל":"Patient")+'</label>'+
    '<span style="font-size:11px;color:#2B6CC4;cursor:pointer;font-weight:600" onclick="openQuickNewPatient(\''+d64+'\',\''+t64+'\')">+ '+(lng==="he"?"מטופל חדש":"New patient")+'</span>'+
    '</div>'+
    '<select id="ca-pat" '+iS+'>'+pO+'</select>'+
    '<label style="font-size:12px;color:#4a6a8a;font-weight:600;display:block;margin-bottom:5px">'+(lng==="he"?"תאריך":"Date")+'</label>'+
    '<input id="ca-date" type="date" value="'+(date||td)+'" '+iS+'>'+
    '<label style="font-size:12px;color:#4a6a8a;font-weight:600;display:block;margin-bottom:6px">'+(lng==="he"?"שעת התחלה וסיום":"Start &amp; end time")+'</label>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px">'+
    '<div style="flex:1"><div style="font-size:10px;color:#6a8aaa;margin-bottom:3px">'+(lng==="he"?"התחלה":"Start")+'</div>'+
    '<select id="ca-time" style="width:100%;padding:8px 6px;border:1px solid #d1d9e0;border-radius:8px;font-size:13px;background:#f8fafc;box-sizing:border-box" onchange="caTimeChanged()">'+tO+'</select></div>'+
    '<div style="flex:1"><div style="font-size:10px;color:#6a8aaa;margin-bottom:3px">'+(lng==="he"?"סיום":"End")+'</div>'+
    '<select id="ca-etime" style="width:100%;padding:8px 6px;border:1px solid #d1d9e0;border-radius:8px;font-size:13px;background:#f8fafc;box-sizing:border-box">'+tO+'</select></div>'+
    '</div>'+
    '<label style="font-size:12px;color:#4a6a8a;font-weight:600;display:block;margin-bottom:5px">'+(lng==="he"?"הערות":"Notes")+'</label>'+
    '<input id="ca-notes" type="text" placeholder="'+(lng==="he"?"הערות...":"Notes...")+'" '+iS+'>'+
    '<div style="display:flex;gap:10px;margin-top:6px">'+
    '<button class="btn" style="flex:1;background:#2B6CC4;color:#fff;padding:11px;font-size:14px" onclick="saveNewAppt()">'+(lng==="he"?"שמור":"Save")+'</button>'+
    '<button class="btn" style="flex:1;background:#f1f5f9;color:#1a3a6e;padding:11px;font-size:14px" onclick="cm()">'+(lng==="he"?"ביטול":"Cancel")+'</button>'+
    '</div></div>';
  if(!preselectId){
    var ts=g("ca-time"); if(ts&&time){ ts.value=time; }
    var te=g("ca-etime"); if(te){ te.value=addMinutes(time||"08:00",60); }
  }
  g("MB").classList.add("on");
}
function saveNewAppt(){
  var ep=g("ca-pat"),ed=g("ca-date"),et=g("ca-time"),ee=g("ca-etime"),en=g("ca-notes");
  if(!ep||!ed||!et||!ep.value||!ed.value||!et.value) return;
  var endT=ee&&ee.value&&ee.value>et.value?ee.value:addMinutes(et.value,60);
  addAppt({patient_id:parseInt(ep.value),date:ed.value,time:et.value,end_time:endT,notes:en?en.value:""});
  cm();
}
function openQuickNewPatient(d64,t64){
  var date=decodeURIComponent(d64), time=decodeURIComponent(t64);
  var iS='style="width:100%;padding:9px 10px;border:1px solid #d1d9e0;border-radius:8px;font-size:14px;margin-bottom:14px;background:#f8fafc;box-sizing:border-box"';
  g("MC").innerHTML=
    '<div style="padding:4px 0">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">'+
    '<span style="font-size:20px;cursor:pointer;color:#2B6CC4;line-height:1" onclick="openNewApptAt(\''+date+'\',\''+time+'\')">&#8592;</span>'+
    '<div style="font-size:18px;font-weight:800;color:#1a3a6e">'+(lng==="he"?"מטופל חדש":"New Patient")+'</div>'+
    '</div>'+
    '<label style="font-size:12px;color:#4a6a8a;font-weight:600;display:block;margin-bottom:5px">'+(lng==="he"?"שם (אנגלית)":"Name (English)")+'</label>'+
    '<input id="qp-name" type="text" placeholder="Full name" '+iS+'>'+
    '<label style="font-size:12px;color:#4a6a8a;font-weight:600;display:block;margin-bottom:5px">'+(lng==="he"?"שם (עברית)":"Name (Hebrew - optional)")+'</label>'+
    '<input id="qp-nhe" type="text" placeholder="שם בעברית" '+iS+'>'+
    '<label style="font-size:12px;color:#4a6a8a;font-weight:600;display:block;margin-bottom:5px">'+(lng==="he"?"קוד PIN (4 ספרות)":"PIN code (4 digits)")+'</label>'+
    '<input id="qp-pin" type="number" maxlength="4" placeholder="0000" '+iS+'>'+
    '<label style="font-size:12px;color:#4a6a8a;font-weight:600;display:block;margin-bottom:5px">'+(lng==="he"?"טלפון (אופציונלי)":"Phone (optional)")+'</label>'+
    '<input id="qp-phone" type="tel" placeholder="05X-XXXXXXX" '+iS+'>'+
    '<div style="display:flex;gap:10px;margin-top:6px">'+
    '<button class="btn" style="flex:1;background:#2B6CC4;color:#fff;padding:11px;font-size:14px" onclick="saveQuickPatient(\''+date+'\',\''+time+'\')">'+(lng==="he"?"צור ובחר":"Create & Select")+'</button>'+
    '<button class="btn" style="flex:1;background:#f1f5f9;color:#1a3a6e;padding:11px;font-size:14px" onclick="openNewApptAt(\''+date+'\',\''+time+'\')">'+(lng==="he"?"חזור":"Back")+'</button>'+
    '</div></div>';
}
function saveQuickPatient(date,time){
  var name=(g("qp-name")||{}).value||"";
  var nameHe=(g("qp-nhe")||{}).value||"";
  var pin=String((g("qp-pin")||{}).value||"").padStart(4,"0");
  var phone=(g("qp-phone")||{}).value||"";
  if(!name){ var el=g("qp-name"); if(el){ el.style.borderColor="#e74c3c"; el.focus(); } return; }
  var newP={id:Date.now(),name:name,nameHe:nameHe,pin:pin,phone:phone,sport:"",injury:"",age:"",
            status:"Active",notes:"",sessions:0,exercises:[],followUps:[],workoutPlans:[],
            workoutHistory:[],avatarId:0,firstLoginDone:false,startDate:new Date().toISOString().slice(0,10)};
  pts.push(newP);
  lsave();
  apiCall("patients","POST",toRow(newP),function(){});
  openNewApptAt(date,time,newP.id);
}

// ── Dashboard ──
function rd(){
  var tx=pts.reduce(function(a,p){ return a+(p.exercises||[]).length; },0);
  var sc={}; pts.forEach(function(p){ sc[p.sport]=(sc[p.sport]||0)+1; });
  var ts=Object.entries(sc).sort(function(a,b){ return b[1]-a[1]; })[0];
  var fc=pts.reduce(function(a,p){ return a+(p.followUps||[]).length; },0);
  g("vd").innerHTML=
    '<div style="margin-bottom:12px"><div style="font-size:20px;font-weight:800;color:#1a3a6e">Good day, ElitePhysio &#128075;</div>'+
    '<div style="font-size:12px;color:#4a6a8a;margin-top:2px">'+L().sub+'</div></div>'+
    '<div class="g2" style="margin-bottom:16px">'+
    [["#2B6CC4",pts.length,L().to],["#00a86b",tx,L().ex],["#d97706",ts?ts[0]:"—","Top Sport"],["#7c3aed",fc,L().fu]].map(function(x){
      return '<div class="stat-card" style="padding:10px 14px"><div class="accent-bar" style="background:linear-gradient(90deg,'+x[0]+','+x[0]+'80)"></div>'+
        '<div style="font-size:22px;font-weight:800;color:'+x[0]+'">'+x[1]+'</div>'+
        '<div style="font-size:10px;color:#4a6a8a;text-transform:uppercase;letter-spacing:.8px;margin-top:2px">'+x[2]+'</div></div>';
    }).join("")+'</div>'+
    '<div style="font-size:13px;font-weight:700;color:#1a3a6e;margin-bottom:8px">'+(lng==="he"?"לוח תורים":"Appointment Calendar")+'</div>'+
    '<div id="cal-section"><div style="text-align:center;padding:20px;color:#4a6a8a;font-size:13px">Loading...</div></div>'+
    '<div class="row"><span class="st">'+L().rp2+'</span>'+
    '<div style="display:flex;gap:8px">'+
    '<button class="btn" style="font-size:12px;background:#fff3f3;color:#e74c3c;border:1px solid rgba(231,76,60,0.3)" onclick="omRecycleBin()">🗑 Recycle Bin '+(deletedPatients.length+deletedExercises.length>0?'('+( deletedPatients.length+deletedExercises.length)+')':'')+'</button>'+
    '<button class="btn" style="font-size:12px" onclick="gv(\'p\')">'+L().va+'</button></div></div>'+
    pts.slice(0,4).map(function(p){
      var dn=pn(p);
      return '<div class="card" onclick="op('+p.id+')"><div style="display:flex;align-items:center;justify-content:space-between">'+
        '<div style="display:flex;align-items:center;gap:13px">'+av(dn)+
        '<div><div class="pat-name">'+dn+'</div><div class="pat-sub">'+(p.injury||"—")+'</div></div></div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'+bdg(p.sport)+' '+sbdg(p.status)+'</div></div></div>';
    }).join("");
  loadAppts(renderCal);
}

// ── Patient List ──
// ── Bilingual sports list ──
var SP_HE = ["ריצה","קרוספיט","שחייה","רכיבה על אופניים","כדורגל","כדורסל","טניס","כדורעף","אומנויות לחימה","התעמלות","הרמת משקולות","יוגה","פילאטיס","גולף","איגרוף","חתירה","הוקי","בייסבול","סקי","אחר"];

function getCustomSports(){ try{ return JSON.parse(localStorage.getItem("ep_sports")||"[]"); }catch(e){ return []; } }
function saveCustomSports(arr){ try{ localStorage.setItem("ep_sports",JSON.stringify(arr)); }catch(e){} }
function getAllSports(){ return SP.concat(getCustomSports().map(function(s){return s.en;})); }
function getAllSportsHe(){ return SP_HE.concat(getCustomSports().map(function(s){return s.he||s.en;})); }

function spName(s){
  var all=getAllSports(), allHe=getAllSportsHe();
  if(lng==="he"){ var i=all.indexOf(s); return (i>=0&&allHe[i])?allHe[i]:s; }
  if(lng==="en"){ var i=allHe.indexOf(s); return (i>=0&&all[i])?all[i]:s; }
  return s;
}
function pn(p){ return (lng==="he"&&p.nameHe)?p.nameHe:(p.name||p.nameHe||""); }
function rpl(){
  var q=(g("psr").value||"").toLowerCase();
  var list=pts.filter(function(p){
    return (p.name||"").toLowerCase().includes(q)||(p.nameHe||"").toLowerCase().includes(q)||(p.sport||"").toLowerCase().includes(q)||(p.injury||"").toLowerCase().includes(q)||(spName(p.sport)||"").toLowerCase().includes(q);
  });
  list.sort(function(a,b){ return pn(a).localeCompare(pn(b), lng==="he"?"he":"en"); });
  var binCount = deletedPatients.length+deletedExercises.length;
  g("ptit").textContent=L().pats+" ("+pts.length+")";
  // Update recycle bin button count
  var rbtn=g("rbtn_pts"); if(rbtn) rbtn.innerHTML='🗑 '+(lng==="he"?"סל מחזור":"Recycle Bin")+(binCount>0?' ('+binCount+')':'');
  var npBtn=g("pnb"); if(npBtn) npBtn.textContent='+ '+(lng==="he"?"מטופל חדש":"New Patient");
  g("pls").innerHTML=list.length?list.map(function(p){
    var dn=pn(p);
    var avHtml = p.avatarId ? '<div style="width:38px;height:50px;flex-shrink:0">'+legoSVG(AVATARS.find(function(a){return a.id===p.avatarId;})||AVATARS[0],38)+'</div>' : av(dn);
    var dotHtml = hasNewNote(p) ? '<div style="width:10px;height:10px;border-radius:50%;background:#f97316;flex-shrink:0;box-shadow:0 0 0 2px #fff,0 0 0 3px #f97316" title="New note"></div>' : '';
    return '<div class="card" onclick="op('+p.id+')"><div style="display:flex;align-items:center;justify-content:space-between">'+
      '<div style="display:flex;align-items:center;gap:13px">'+avHtml+
      '<div><div class="pat-name" style="display:flex;align-items:center;gap:7px">'+dn+dotHtml+'</div><div class="pat-sub">'+(p.injury||"—")+' &middot; '+(p.age||"—")+'</div></div></div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'+bdg(spName(p.sport))+' '+sbdg(p.status)+'</div></div></div>';
  }).join(""):'<div style="color:#4a6a8a;text-align:center;padding:32px 0;font-size:14px">No patients found</div>';
}

// ── Analytics ──
function rs(){
  var act=pts.filter(function(p){ return p.status==="Active"; });
  var drp=pts.filter(function(p){ return p.status==="Dropped"; });
  var lds=pts.filter(function(p){ return p.status==="New Lead"; });
  var tx=pts.reduce(function(a,p){ return a+(p.exercises||[]).length; },0);
  var html=
    '<div style="font-size:24px;font-weight:800;margin-bottom:20px;color:#1a3a6e">'+L().stats+'</div>'+
    '<div class="g2" style="margin-bottom:16px">'+
    [["#2B6CC4",pts.length,L().to],["#00a86b",act.length,L().ac],["#c0392b",drp.length,L().dr],["#7c3aed",lds.length,L().nl]].map(function(x){
      return '<div class="stat-card"><div class="accent-bar" style="background:linear-gradient(90deg,'+x[0]+','+x[0]+'80)"></div>'+
        '<div style="font-size:28px;font-weight:800;color:'+x[0]+'">'+x[1]+'</div>'+
        '<div style="font-size:11px;color:#4a6a8a;text-transform:uppercase;letter-spacing:.8px;margin-top:3px">'+x[2]+'</div></div>';
    }).join("")+'</div>'+
    '<div class="panel"><div class="st" style="margin-bottom:13px">'+L().sb+'</div>'+
    ST.map(function(s){
      var c=pts.filter(function(p){ return p.status===s; }).length;
      var pct=pts.length?Math.round(c/pts.length*100):0;
      return '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px">'+
        '<span style="font-size:14px;font-weight:600;color:#1a2535">'+s+'</span>'+
        '<span style="font-size:12px;color:#4a6a8a">'+c+' ('+pct+'%)</span></div>'+
        '<div class="bar"><div style="width:'+pct+'%;background:'+(SC[s]||"#2B6CC4")+';height:100%;border-radius:4px;transition:width .6s"></div></div></div>';
    }).join("")+'</div>'+
    '<div class="panel"><div class="st" style="margin-bottom:10px">'+L().ins+'</div>'+
    '<div style="font-size:14px;color:#1a2535;line-height:2.4">'+
    '<div>&#128202; '+L().rt+': <strong style="color:#00a86b">'+(pts.length?Math.round(act.length/pts.length*100):0)+'%</strong></div>'+
    '<div>&#128203; '+L().ax+': <strong style="color:#2B6CC4">'+(pts.length?(tx/pts.length).toFixed(1):0)+'</strong></div>'+
    '<div>&#127939; Sports: <strong style="color:#d97706">'+Object.keys(pts.reduce(function(a,p){ a[p.sport]=1; return a; },{})).length+'</strong></div></div></div>'+
    '<div class="panel"><div class="st" style="margin-bottom:10px">'+L().fl+'</div>'+
    ([].concat(lds,drp)).map(function(p){
      var dn=pn(p);
      return '<div class="xcard" style="cursor:pointer" onclick="op('+p.id+')"><div style="display:flex;align-items:center;justify-content:space-between">'+
        '<div style="display:flex;align-items:center;gap:10px">'+av(dn)+
        '<div><div class="pat-name">'+dn+'</div><div class="pat-sub">'+p.sport+' &middot; '+(p.sessions||0)+' sessions</div></div></div>'+
        '<div style="display:flex;gap:6px;align-items:center">'+sbdg(p.status)+' '+waLink(p)+'</div></div></div>';
    }).join("")+(([].concat(lds,drp)).length===0?'<div style="color:#4a6a8a;font-size:14px">No follow-ups needed.</div>':"")+
    '<div style="background:rgba(43,108,196,0.07);border:1px solid rgba(43,108,196,0.2);border-radius:9px;padding:13px 16px;margin-top:12px;font-size:13px;color:#1a2535;line-height:2.2">'+
    L().t1+'<br>'+L().t2+'<br>'+L().t3+'</div></div>';
  g("vs").innerHTML=html;
}

// ── Open Patient ──
function op(id){
  cur=pts.find(function(p){ return p.id===id; }); ctab="ex"; gv("pat"); rpd();
  if(auth==="admin"){ markNotesRead(id); rpl(); }
  // Fetch fresh data from Supabase in background to get latest workout history
  apiCall("patient-login-by-id","POST",{id:id},function(err,d){
    if(!err && d && d.ok && d.patient){
      var fresh=fromRow(d.patient);
      pts=pts.map(function(p){ return p.id===id?fresh:p; });
      cur=fresh; lsave(); rpd();
      if(auth==="admin"){ markNotesRead(id); rpl(); }
    }
  });
}

// ── Patient Detail (Admin) ──
function rpd(){
  var p=cur; if(!p) return;
  g("pbk").textContent=L().bk;
  g("phd").innerHTML=
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">'+
    '<div style="display:flex;align-items:center;gap:15px">'+adminPatientAv(p,54)+'<div>'+
    '<div style="font-size:22px;font-weight:800;color:#1a3a6e">'+pn(p)+'</div>'+
    '<div style="display:flex;align-items:center;gap:7px;margin-top:6px;flex-wrap:wrap">'+bdg(p.sport)+' '+sbdg(p.status)+
    (p.age?'<span style="font-size:12px;color:#4a6a8a">'+p.age+'y</span>':"")+
    '<span style="font-size:11px;color:#4a6a8a;border:1px solid rgba(43,108,196,0.25);border-radius:4px;padding:2px 8px">PIN: '+p.pin+'</span>'+
    waLink(p)+'</div></div></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn" style="font-size:12px;background:#f0f5ff;color:#2B6CC4;border:1px solid rgba(43,108,196,0.3)" onclick="omWorkoutHistory('+p.id+')">📋 '+(lng==="he"?"היסטוריה":"History")+' ('+(p.workoutHistory||[]).length+')</button>'+
    '<button class="btn" style="font-size:12px" onclick="dprint('+p.id+')">'+L().pdf+'</button>'+
    '<button class="btn" style="font-size:12px" onclick="om(\'ep\')">'+L().ed+'</button>'+
    '<button class="btn btnd" style="font-size:12px" onclick="dp('+p.id+')">'+L().dl+'</button></div></div>'+
    (p.injury?'<div style="margin-top:13px;background:rgba(43,108,196,0.08);border-radius:8px;padding:11px 15px;border-left:3px solid #2B6CC4"><div style="font-size:11px;color:#2B6CC4;font-weight:700;text-transform:uppercase;margin-bottom:3px">'+L().ij+'</div><div style="font-size:14px;color:#1a2535">'+p.injury+'</div></div>':"")+
    (p.notes?'<div style="margin-top:8px;background:rgba(0,168,107,0.07);border-radius:8px;padding:11px 15px;border-left:3px solid #00a86b"><div style="font-size:11px;color:#00a86b;font-weight:700;text-transform:uppercase;margin-bottom:3px">'+(lng==="he"?"המטרה שלי":"My Goal")+'</div><div style="font-size:14px;color:#1a2535">'+p.notes+'</div></div>':"");
  g("ptbs").innerHTML=[["ex",L().ex,(p.exercises||[]).length],["fu",L().fu,(p.followUps||[]).length],["cl",L().cl,null]].map(function(t){
    return '<button class="nb'+(ctab===t[0]?" on":"")+'" onclick="sct(\''+t[0]+'\')">'+t[1]+(t[2]!==null?' <span style="background:rgba(255,255,255,0.25);border-radius:9px;padding:1px 7px;font-size:11px">'+t[2]+'</span>':"")+' </button>';
  }).join("");
  rex(); rfu(); rcl();
  ["ex","fu","cl"].forEach(function(t,i){ g(["pet","pft","pct"][i]).classList.toggle("hid",ctab!==t); });
}

function sct(t){
  ctab=t;
  document.querySelectorAll("#ptbs .nb").forEach(function(b,i){ b.classList.toggle("on",["ex","fu","cl"][i]===t); });
  ["ex","fu","cl"].forEach(function(x,i){ g(["pet","pft","pct"][i]).classList.toggle("hid",x!==t); });
}

// ── Workout Plans System ──

// State for current plan/day being viewed in admin
var curPlanId = null;
var curDayId = null;

// Get current plan and day objects
function getCurPlan(){ return (cur.workoutPlans||[]).find(function(p){ return p.id===curPlanId; }); }
function getCurDay(){ var pl=getCurPlan(); return pl?(pl.days||[]).find(function(d){ return d.id===curDayId; }):null; }

// Main plans overview for admin
function rplans(){
  var plans = cur.workoutPlans||[];
  var isHe = lng==="he";
  g("pet").innerHTML =
    '<div class="row" style="margin-bottom:14px">'+
    '<span class="st">'+(isHe?"תוכניות אימון":"Workout Programs")+'</span>'+
    '<div style="display:flex;gap:6px">'+
    '<button class="btn" style="font-size:12px;background:#fff8e8;color:#e67e22;border:1px solid rgba(230,126,34,0.3)" onclick="omTemplates()">📋 '+(isHe?"תבניות":"Templates")+'</button>'+
    '<button class="btn" style="font-size:12px" onclick="omNewPlan()">+ '+(isHe?"תוכנית חדשה":"New Program")+'</button></div></div>'+
    (plans.length===0?
      '<div style="color:#4a6a8a;padding:20px;text-align:center;font-size:14px;background:#f8fbff;border-radius:10px;border:2px dashed #c8d8ee">'+(isHe?"צור תוכנית אימון ראשונה":"Create your first workout program!")+'</div>' :
      plans.map(function(plan){
        var typeBadge = plan.type==="periodized"?
          '<span style="background:#f0f5ff;color:#2B6CC4;border-radius:5px;padding:2px 7px;font-size:11px;font-weight:700">📅 '+(isHe?"מחזורי":"Periodized")+'</span>':
          '<span style="background:#f0fff5;color:#00a86b;border-radius:5px;padding:2px 7px;font-size:11px;font-weight:700">🔁 '+(isHe?"קבוע":"Repeating")+'</span>';
        var phases = plan.type==="periodized"?(plan.phases||[]):[{days:plan.days||[]}];
        var totalDays = phases.reduce(function(a,ph){ return a+(ph.days||[]).length; },0);
        var totalEx = phases.reduce(function(a,ph){ return a+(ph.days||[]).reduce(function(b,d){ return b+(d.exercises||[]).length; },0); },0);
        return '<div class="xcard" style="cursor:pointer;margin-bottom:10px" onclick="openPlan('+plan.id+')">'+
          '<div style="display:flex;justify-content:space-between;align-items:flex-start">'+
          '<div style="flex:1">'+
          '<div style="font-size:16px;font-weight:800;color:#1a3a6e;margin-bottom:5px">'+(isHe&&plan.nameHe?plan.nameHe:plan.name)+'</div>'+
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">'+typeBadge+
          (plan.type==="periodized"?'<span style="font-size:12px;color:#4a6a8a">'+(plan.phases||[]).length+' '+(isHe?"שלבים":"phases")+'</span>':'')+
          '<span style="font-size:12px;color:#4a6a8a">'+totalDays+' '+(isHe?"ימי אימון":"workout days")+'</span>'+
          '<span style="font-size:12px;color:#4a6a8a">'+totalEx+' '+(isHe?"תרגילים":"exercises")+'</span></div>'+
          '</div>'+
          '<div style="display:flex;gap:6px">'+
          '<button class="btn" style="font-size:11px;padding:4px 8px" onclick="event.stopPropagation();omEditPlan('+plan.id+')">✏️</button>'+
          '<button class="btn btnd" style="font-size:11px;padding:4px 8px" onclick="event.stopPropagation();deletePlan('+plan.id+')">✕</button>'+
          '</div></div>'+
          // Show day tabs
          '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">'+
          phases.map(function(ph,pi){
            var phLabel = plan.type==="periodized"?'<div style="font-size:10px;color:#4a6a8a;margin-bottom:3px">'+(isHe&&ph.nameHe?ph.nameHe:ph.name||("Phase "+(pi+1)))+'</div>':'';
            return phLabel+(ph.days||[]).map(function(d){
              return '<span onclick="event.stopPropagation();openPlanDay('+plan.id+','+(plan.type==="periodized"?pi:0)+','+d.id+')" '+
                'style="background:#e8f0fb;color:#2B6CC4;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer" '+
                'onmouseover="this.style.background=\'#2B6CC4\';this.style.color=\'#fff\'" '+
                'onmouseout="this.style.background=\'#e8f0fb\';this.style.color=\'#2B6CC4\'">'+(isHe&&d.nameHe?d.nameHe:d.name)+'</span>';
            }).join("");
          }).join("")+
          '</div></div>';
      }).join("")
    );
}

// Open a plan's day for editing exercises
function openPlanDay(planId, phaseIdx, dayId){
  curPlanId = planId; curDayId = dayId;
  var plan = (cur.workoutPlans||[]).find(function(p){ return p.id===planId; });
  if(!plan) return;
  var days = plan.type==="periodized" ? ((plan.phases||[])[phaseIdx]||{}).days||[] : plan.days||[];
  var day = days.find(function(d){ return d.id===dayId; });
  if(!day) return;
  var isHe=lng==="he";
  // Store phaseIdx on day for reference
  day._phaseIdx = phaseIdx;
  cur._editingDay = {planId:planId, phaseIdx:phaseIdx, dayId:dayId};
  rex();
}

// New program modal
function omNewPlan(){
  var isHe=lng==="he";
  var c=g("MC");
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">+ '+(isHe?"תוכנית אימון חדשה":"New Workout Program")+'</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">✕</button></div>'+
    '<div class="g2" style="gap:10px;margin-bottom:12px">'+
    '<div style="grid-column:1/-1"><label class="lbl">Program Name (EN)</label><input class="inp" id="pln_en" placeholder="e.g. Strength Phase 1"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">שם התוכנית (עברית)</label><input class="inp" id="pln_he" dir="rtl" placeholder="שם התוכנית"></div>'+
    '</div>'+
    '<label class="lbl">Program Type</label>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'+
    '<div id="type_rep" onclick="selPlanType(\'repeating\')" style="padding:12px;border:2px solid #2B6CC4;border-radius:10px;cursor:pointer;background:rgba(43,108,196,0.07);text-align:center">'+
    '<div style="font-size:20px;margin-bottom:4px">🔁</div>'+
    '<div style="font-weight:700;font-size:13px;color:#1a3a6e">'+(isHe?"קבוע":"Repeating")+'</div>'+
    '<div style="font-size:11px;color:#4a6a8a">'+(isHe?"A-B-C שבועי":"Weekly A-B-C")+'</div></div>'+
    '<div id="type_per" onclick="selPlanType(\'periodized\')" style="padding:12px;border:2px solid #ddd;border-radius:10px;cursor:pointer;text-align:center">'+
    '<div style="font-size:20px;margin-bottom:4px">📅</div>'+
    '<div style="font-weight:700;font-size:13px;color:#1a3a6e">'+(isHe?"מחזורי":"Periodized")+'</div>'+
    '<div style="font-size:11px;color:#4a6a8a">'+(isHe?"שלבים לאורך זמן":"Long-term phases")+'</div></div></div>'+
    '<div id="plan_extra"></div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end">'+
    '<button class="btn btnd" onclick="cm()">'+(isHe?"ביטול":"Cancel")+'</button>'+
    '<button class="btn" onclick="savePlan()">'+(isHe?"צור תוכנית":"Create Program")+'</button></div>';
  g("MB").classList.add("on");
  selPlanType("repeating");
}

function selPlanType(t){
  g("type_rep").style.border=t==="repeating"?"2px solid #2B6CC4":"2px solid #ddd";
  g("type_rep").style.background=t==="repeating"?"rgba(43,108,196,0.07)":"";
  g("type_per").style.border=t==="periodized"?"2px solid #2B6CC4":"2px solid #ddd";
  g("type_per").style.background=t==="periodized"?"rgba(43,108,196,0.07)":"";
  g("type_rep").dataset.sel=t==="repeating"?"1":"";
  g("type_per").dataset.sel=t==="periodized"?"1":"";
  var isHe=lng==="he";
  var ex=g("plan_extra");
  if(t==="repeating"){
    ex.innerHTML='<label class="lbl">'+(isHe?"מספר ימי אימון בשבוע":"Number of workout days per week")+'</label>'+
      '<div style="display:flex;gap:8px;margin-bottom:12px">'+
      [1,2,3,4,5,6].map(function(n){
        return '<button onclick="selDayCount('+n+')" id="dc_'+n+'" style="width:38px;height:38px;border-radius:8px;border:2px solid '+(n===3?'#2B6CC4':'#ddd')+';background:'+(n===3?'rgba(43,108,196,0.1)':'#fff')+';font-weight:700;cursor:pointer;font-size:14px">'+n+'</button>';
      }).join("")+'</div>'+
      '<div id="day_names_wrap"></div>';
    selDayCount(3);
  } else {
    ex.innerHTML='<div class="g2" style="gap:10px;margin-bottom:12px">'+
      '<div><label class="lbl">'+(isHe?"מספר שלבים":"Number of phases")+'</label>'+
      '<input class="inp" id="num_phases" type="number" min="1" max="12" value="2" oninput="renderPhaseInputs()"></div>'+
      '<div><label class="lbl">'+(isHe?"ימי אימון לשבוע":"Training days/week")+'</label>'+
      '<input class="inp" id="days_per_week" type="number" min="1" max="6" value="3"></div></div>'+
      '<div id="phase_inputs"></div>';
    renderPhaseInputs();
  }
}

function selDayCount(n){
  [1,2,3,4,5,6].forEach(function(i){
    var b=g("dc_"+i); if(!b) return;
    b.style.border=i===n?"2px solid #2B6CC4":"2px solid #ddd";
    b.style.background=i===n?"rgba(43,108,196,0.1)":"#fff";
  });
  var isHe=lng==="he";
  var wrap=g("day_names_wrap"); if(!wrap) return;
  var letters=["A","B","C","D","E","F"];
  wrap.innerHTML='<label class="lbl">'+(isHe?"שמות ימי האימון":"Workout day names")+'</label>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'+
    Array.from({length:n},function(_,i){
      return '<div><input class="inp" id="dn_en_'+i+'" value="Day '+letters[i]+'" placeholder="Day '+letters[i]+'">'+
        '<input class="inp" id="dn_he_'+i+'" dir="rtl" value="יום '+letters[i]+'" placeholder="יום '+letters[i]+'" style="margin-top:4px"></div>';
    }).join("")+'</div>';
  g("day_names_wrap").dataset.count=n;
}

function renderPhaseInputs(){
  var n=parseInt(g("num_phases")?g("num_phases").value:2)||2;
  var isHe=lng==="he";
  var wrap=g("phase_inputs"); if(!wrap) return;
  wrap.innerHTML=Array.from({length:n},function(_,i){
    return '<div style="background:#f8fbff;border-radius:8px;padding:10px;margin-bottom:8px">'+
      '<div style="font-size:12px;font-weight:700;color:#2B6CC4;margin-bottom:6px">'+(isHe?"שלב":"Phase")+' '+(i+1)+'</div>'+
      '<div class="g2" style="gap:8px">'+
      '<div style="grid-column:1/-1"><input class="inp" id="ph_en_'+i+'" placeholder="Phase name EN e.g. Base Strength"></div>'+
      '<div style="grid-column:1/-1"><input class="inp" id="ph_he_'+i+'" dir="rtl" placeholder="שם שלב בעברית"></div>'+
      '<div><label class="lbl">'+(isHe?"שבועות":"Weeks")+'</label><input class="inp" id="ph_wk_'+i+'" type="number" value="'+(i===0?6:4)+'" min="1"></div>'+
      '<div><label class="lbl">'+(isHe?"ימים/שבוע":"Days/week")+'</label><input class="inp" id="ph_dw_'+i+'" type="number" value="3" min="1" max="6"></div></div></div>';
  }).join("");
}

function savePlan(){
  var isHe=lng==="he";
  var name=g("pln_en")?g("pln_en").value.trim():"";
  var nameHe=g("pln_he")?g("pln_he").value.trim():"";
  if(!name&&!nameHe){ alert(isHe?"הכנס שם לתוכנית":"Enter a program name"); return; }
  var type=g("type_per")&&g("type_per").dataset.sel?"periodized":"repeating";
  var plan={id:Date.now(), name:name||nameHe, nameHe:nameHe||name, type:type};
  var letters=["A","B","C","D","E","F"];
  if(type==="repeating"){
    var n=parseInt(g("day_names_wrap")?g("day_names_wrap").dataset.count:3)||3;
    plan.days=Array.from({length:n},function(_,i){
      var dn=g("dn_en_"+i)?g("dn_en_"+i).value.trim():"Day "+letters[i];
      var dnhe=g("dn_he_"+i)?g("dn_he_"+i).value.trim():"יום "+letters[i];
      return {id:Date.now()+i+1, name:dn, nameHe:dnhe, exercises:[]};
    });
    plan.schedule={};
  } else {
    var np=parseInt(g("num_phases")?g("num_phases").value:2)||2;
    var dpw=parseInt(g("days_per_week")?g("days_per_week").value:3)||3;
    plan.phases=Array.from({length:np},function(_,pi){
      var pname=g("ph_en_"+pi)?g("ph_en_"+pi).value.trim():"Phase "+(pi+1);
      var pnameHe=g("ph_he_"+pi)?g("ph_he_"+pi).value.trim():"שלב "+(pi+1);
      var weeks=parseInt(g("ph_wk_"+pi)?g("ph_wk_"+pi).value:6)||6;
      var dw=parseInt(g("ph_dw_"+pi)?g("ph_dw_"+pi).value:dpw)||dpw;
      return {
        id:Date.now()+pi*100, name:pname, nameHe:pnameHe, weeks:weeks,
        days:Array.from({length:dw},function(_,di){
          return {id:Date.now()+pi*100+di+1, name:"Day "+letters[di], nameHe:"יום "+letters[di], exercises:[]};
        })
      };
    });
  }
  if(!cur.workoutPlans) cur.workoutPlans=[];
  cur.workoutPlans.push(plan);
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; });
  sv(); cm(); rplans();
}

function omEditPlan(planId){
  var plan=(cur.workoutPlans||[]).find(function(p){ return p.id===planId; });
  if(!plan) return;
  var isHe=lng==="he";
  var letters=["A","B","C","D","E","F","G"];
  var c=g("MC");
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">✏️ '+(isHe?"ערוך תוכנית":"Edit Program")+'</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">✕</button></div>'+
    '<div class="g2" style="gap:10px;margin-bottom:14px">'+
    '<div style="grid-column:1/-1"><label class="lbl">Program Name (EN)</label><input class="inp" id="ep_name_en" value="'+plan.name+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">שם (עברית)</label><input class="inp" id="ep_name_he" dir="rtl" value="'+(plan.nameHe||'')+'"></div></div>'+
    '<div style="font-size:12px;font-weight:700;color:#1a3a6e;text-transform:uppercase;margin-bottom:8px">'+(isHe?"ימי אימון":"Workout Days")+'</div>'+
    (plan.type==="repeating"?
      '<div id="ep_days_wrap">'+
      (plan.days||[]).map(function(d,i){
        return '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">'+
          '<input class="inp" id="ep_dn_en_'+i+'" value="'+d.name+'" style="flex:1">'+
          '<input class="inp" id="ep_dn_he_'+i+'" dir="rtl" value="'+(d.nameHe||'')+'" style="flex:1">'+
          '<button onclick="removeEditDay('+i+')" style="background:#fff0f0;border:1px solid #ffd0d0;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:13px;color:#e74c3c;flex-shrink:0">✕</button>'+
          '</div>';
      }).join("")+'</div>'+
      '<button onclick="addEditDay()" style="background:#f0f5ff;border:1px dashed #2B6CC4;border-radius:8px;padding:8px;width:100%;cursor:pointer;color:#2B6CC4;font-weight:600;font-size:13px;margin-bottom:12px">+ '+(isHe?"הוסף יום":"Add Day")+'</button>'
    :
    (plan.phases||[]).map(function(ph,pi){
      return '<div style="background:#f8fbff;border-radius:8px;padding:8px;margin-bottom:8px">'+
        '<div style="font-size:11px;font-weight:700;color:#2B6CC4;margin-bottom:5px">'+(isHe&&ph.nameHe?ph.nameHe:ph.name)+(ph.weeks?' ('+ph.weeks+' '+(isHe?"שבועות":"weeks")+')':'')+'</div>'+
        (ph.days||[]).map(function(d,di){
          return '<div style="display:flex;gap:8px;margin-bottom:5px">'+
            '<input class="inp" id="ep_pd_en_'+pi+'_'+di+'" value="'+d.name+'" style="flex:1">'+
            '<input class="inp" id="ep_pd_he_'+pi+'_'+di+'" dir="rtl" value="'+(d.nameHe||'')+'" style="flex:1">'+
            '</div>';
        }).join("")+'</div>';
    }).join(""))+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">'+
    '<button class="btn btnd" onclick="cm()">'+(isHe?"ביטול":"Cancel")+'</button>'+
    '<button class="btn" onclick="saveEditPlan('+planId+')">'+(isHe?"שמור":"Save")+'</button></div>';
  g("MB").classList.add("on");
  // Store plan days count for add/remove
  g("ep_days_wrap") && (g("ep_days_wrap").dataset.count=(plan.days||[]).length);
}

function addEditDay(){
  var wrap=g("ep_days_wrap"); if(!wrap) return;
  var n=parseInt(wrap.dataset.count)||0;
  var letters=["A","B","C","D","E","F","G"];
  var div=document.createElement("div");
  div.style="display:flex;gap:8px;margin-bottom:6px;align-items:center";
  div.innerHTML='<input class="inp" id="ep_dn_en_'+n+'" value="Day '+(letters[n]||n+1)+'" style="flex:1">'+
    '<input class="inp" id="ep_dn_he_'+n+'" dir="rtl" value="יום '+(letters[n]||n+1)+'" style="flex:1">'+
    '<button onclick="removeEditDay('+n+')" style="background:#fff0f0;border:1px solid #ffd0d0;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:13px;color:#e74c3c;flex-shrink:0">✕</button>';
  wrap.appendChild(div);
  wrap.dataset.count=n+1;
}

function removeEditDay(i){
  var inp_en=g("ep_dn_en_"+i), inp_he=g("ep_dn_he_"+i);
  if(inp_en) inp_en.parentElement.style.display="none";
  if(inp_en) inp_en.value="__DELETED__";
}

function saveEditPlan(planId){
  var plan=(cur.workoutPlans||[]).find(function(p){ return p.id===planId; });
  if(!plan) return;
  plan.name=g("ep_name_en")?g("ep_name_en").value.trim():plan.name;
  plan.nameHe=g("ep_name_he")?g("ep_name_he").value.trim():plan.nameHe;
  if(plan.type==="repeating"){
    var wrap=g("ep_days_wrap");
    var total=wrap?parseInt(wrap.dataset.count)||plan.days.length:plan.days.length;
    var letters=["A","B","C","D","E","F","G"];
    var newDays=[];
    for(var i=0;i<total;i++){
      var en_inp=g("ep_dn_en_"+i), he_inp=g("ep_dn_he_"+i);
      if(!en_inp||en_inp.value==="__DELETED__") continue;
      var existing=plan.days&&plan.days[i];
      newDays.push({
        id:existing?existing.id:Date.now()+i,
        name:en_inp?en_inp.value.trim():"Day "+letters[i],
        nameHe:he_inp?he_inp.value.trim():"יום "+letters[i],
        exercises:existing?existing.exercises:[]
      });
    }
    if(newDays.length>0) plan.days=newDays;
  } else {
    (plan.phases||[]).forEach(function(ph,pi){
      (ph.days||[]).forEach(function(d,di){
        if(g("ep_pd_en_"+pi+"_"+di)) d.name=g("ep_pd_en_"+pi+"_"+di).value.trim();
        if(g("ep_pd_he_"+pi+"_"+di)) d.nameHe=g("ep_pd_he_"+pi+"_"+di).value.trim();
      });
    });
  }
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; });
  sv(); cm(); rplans();
}

function deletePlan(planId){
  var plan=(cur.workoutPlans||[]).find(function(p){ return p.id===planId; });
  var isHe=lng==="he";
  var name=plan?(isHe&&plan.nameHe?plan.nameHe:plan.name):"this program";
  if(!confirm((isHe?"מחק תוכנית":"Delete program")+" \""+name+"\"?")) return;
  cur.workoutPlans=(cur.workoutPlans||[]).filter(function(p){ return p.id!==planId; });
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; });
  sv(); rplans();
}

// Open a specific plan (show its days/phases)
function openPlan(planId){
  curPlanId=planId;
  var plan=(cur.workoutPlans||[]).find(function(p){ return p.id===planId; });
  if(!plan) return;
  var days=plan.type==="periodized"?null:(plan.days||[]);
  // Auto-open first day
  if(days&&days.length>0){ openPlanDay(planId,0,days[0].id); }
  else if(plan.phases&&plan.phases[0]&&plan.phases[0].days&&plan.phases[0].days[0]){
    openPlanDay(planId,0,plan.phases[0].days[0].id);
  }
}

// ── Exercises (overridden to use workout plans) ──
function rex(){
  var p=cur;
  // Check if we're editing a specific day
  var editDay=cur._editingDay;
  var plan=editDay?(cur.workoutPlans||[]).find(function(x){ return x.id===editDay.planId; }):null;
  var days=plan?(plan.type==="periodized"?((plan.phases||[])[editDay.phaseIdx]||{}).days||(plan.days||[]):plan.days||[]):null;
  var day=days?days.find(function(d){ return d.id===editDay.dayId; }):null;

  if(!plan||!day){
    // Always show plans overview (which has + New Program button)
    rplans();
    return;
  }

  var isHe=lng==="he";
  var planName=isHe&&plan.nameHe?plan.nameHe:plan.name;
  var dayName=isHe&&day.nameHe?day.nameHe:day.name;
  var exercises=day.exercises||[];

  g("pet").innerHTML=
    // Breadcrumb
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+
    '<button onclick="cur._editingDay=null;rplans()" style="background:#f0f5ff;color:#2B6CC4;border:1px solid rgba(43,108,196,0.3);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer">← '+(isHe?"תוכניות":"Programs")+'</button>'+
    '<span style="color:#4a6a8a;font-size:13px">›</span>'+
    '<span style="font-size:13px;color:#2B6CC4;font-weight:600">'+planName+'</span>'+
    '<span style="color:#4a6a8a;font-size:13px">›</span>'+
    '<span style="font-size:13px;font-weight:700;color:#1a3a6e">'+dayName+'</span>'+
    '</div>'+
    // Day tabs
    '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">'+
    (plan.type==="periodized"?(plan.phases||[]).map(function(ph,pi){
      var phN=isHe&&ph.nameHe?ph.nameHe:ph.name;
      return '<div><div style="font-size:10px;color:#4a6a8a;margin-bottom:2px;text-align:center">'+phN+(ph.weeks?' ('+ph.weeks+'w)':'')+'</div>'+
        (ph.days||[]).map(function(d){
          var active=d.id===editDay.dayId;
          return '<button onclick="openPlanDay('+plan.id+','+pi+','+d.id+')" style="padding:5px 10px;border-radius:7px;border:2px solid '+(active?'#2B6CC4':'#ddd')+';background:'+(active?'#2B6CC4':'#fff')+';color:'+(active?'#fff':'#1a3a6e')+';font-size:12px;font-weight:700;cursor:pointer;margin-right:4px;margin-bottom:4px">'+(isHe&&d.nameHe?d.nameHe:d.name)+'</button>';
        }).join("")+'</div>';
    }).join(""):
    (plan.days||[]).map(function(d){
      var active=d.id===editDay.dayId;
      return '<button onclick="openPlanDay('+plan.id+',0,'+d.id+')" style="padding:5px 12px;border-radius:7px;border:2px solid '+(active?'#2B6CC4':'#ddd')+';background:'+(active?'#2B6CC4':'#fff')+';color:'+(active?'#fff':'#1a3a6e')+';font-size:13px;font-weight:700;cursor:pointer">'+(isHe&&d.nameHe?d.nameHe:d.name)+'</button>';
    }).join(""))+'</div>'+
    // Exercises header
    '<div class="row"><span class="st">'+L().ex+' — '+dayName+'</span>'+
    '<div style="display:flex;gap:8px">'+
    '<button class="btn btnpu" style="font-size:12px" onclick="aisPlan()">'+L().ai+'</button>'+
    '<button class="btn" style="font-size:12px;background:#f0f5ff;color:#2B6CC4;border:1px solid rgba(43,108,196,0.2)" onclick="omLib()">📚 Library</button>'+
    '<button class="btn" style="font-size:12px" onclick="om(\'ae\')">'+L().ae+'</button></div></div>'+
    (exercises.length===0?'<div style="color:#4a6a8a;font-size:14px;padding:14px 0">'+L().nx+'</div>':"")+
    exercises.map(function(e,i){
      // Always follow page language if translation exists, fall back to displayLng
      var isHeE;
      if(lng==="he" && e.nameHe) isHeE=true;
      else if(lng==="en" && e.name) isHeE=false;
      else isHeE=e.displayLng==="he"||(!e.name&&e.nameHe);
      var eName=isHeE&&e.nameHe?e.nameHe:(e.name||e.nameHe);
      var eDesc=isHeE&&e.descHe?e.descHe:(e.desc||e.descHe);
      var eTips=isHeE&&e.tipsHe?e.tipsHe:(e.tips||e.tipsHe);
      var lngBadge=isHeE?'<span style="font-size:10px;background:#e8f0ff;color:#2B6CC4;border-radius:4px;padding:1px 5px;margin-left:4px">🇮🇱</span>':
        '<span style="font-size:10px;background:#f0f5e8;color:#2a7a3a;border-radius:4px;padding:1px 5px;margin-left:4px">🇺🇸</span>';
      var setsReps='<span style="font-weight:600;color:#2B6CC4">'+e.sets+'</span> &times; <span style="font-weight:600;color:#2B6CC4">'+e.reps+'</span>';
      return '<div class="xcard" data-ex-idx="'+i+'" id="excard_'+i+'" style="direction:'+(isHeE?"rtl":"ltr")+';transition:all 0.2s">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">'+
        '<div style="flex:1">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">'+bdg("#"+(i+1))+
        '<span style="font-weight:700;font-size:15px;color:#1a3a6e">'+eName+'</span>'+lngBadge+
        '<span style="font-size:11px;color:#c8d8ee;margin-left:4px;cursor:grab" title="Hold to drag">⠿</span></div>'+
        '<div style="font-size:13px;color:#4a6a8a;margin-bottom:4px">'+setsReps+' reps</div>'+
        (eDesc?'<div style="font-size:13px;color:#1a2535;margin-bottom:3px">'+eDesc+'</div>':"")+
        (eTips?'<div style="font-size:13px;color:#00a86b;margin-bottom:6px">&#128161; '+eTips+'</div>':"")+
        '<a href="'+ytUrl(eName)+'" target="_blank" style="font-size:12px;color:#6d28d9;border:1px solid rgba(109,40,217,0.3);border-radius:5px;padding:4px 11px;text-decoration:none;font-weight:600">'+L().wv+'</a></div>'+
        '<div style="display:flex;flex-direction:column;gap:4px;margin-'+(isHeE?'right':'left')+':8px">'+
        '<button class="btn btnd" style="padding:4px 9px;font-size:12px" onclick="dePlan('+e.id+')">&#10005;</button>'+
        '<button class="btn" style="padding:4px 9px;font-size:12px;background:#f0f5ff" onclick="om(\'ae\','+e.id+')">✏️</button>'+
        '</div></div></div>';
    }).join("");
  // Init drag listeners after render
  setTimeout(function(){
    exercises.forEach(function(_,i){
      var el=document.getElementById("excard_"+i);
      if(el && window.initDrag) initDrag(el,i,editDay.planId,editDay.phaseIdx,editDay.dayId);
    });
  },100);
}

// ── Delete exercise from current plan day ──
function dePlan(eid){
  var ed=cur._editingDay; if(!ed) return;
  var plan=(cur.workoutPlans||[]).find(function(p){ return p.id===ed.planId; });
  if(!plan) return;
  var days=plan.type==="periodized"?((plan.phases||[])[ed.phaseIdx]||{}).days||[]:plan.days||[];
  var day=days.find(function(d){ return d.id===ed.dayId; });
  if(!day) return;
  var e=(day.exercises||[]).find(function(x){ return Number(x.id)===Number(eid); });
  if(!e) return;
  var eName=(lng==="he"&&e.nameHe)?e.nameHe:(e.name||"exercise");
  if(!confirm("Delete \""+eName+"\"?")) return;
  day.exercises=(day.exercises||[]).filter(function(x){ return Number(x.id)!==Number(eid); });
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); rex();
}

// AI suggest for current plan day
function aisPlan(){
  var ed=cur._editingDay;
  if(ed){ cur._aisTarget="plan"; } ais();
}

// Override se2 to save to current plan day if editing one
var _origSe2 = null;

// Old admin exercise list (used when no plans, or as fallback)
function rexFlat(){
  var p=cur;
  g("pet").innerHTML=
    '<div class="row"><span class="st">'+L().ex+'</span><div style="display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn btnpu" style="font-size:12px" onclick="ais()">'+L().ai+'</button>'+
    '<button class="btn" style="font-size:12px;background:#f0f5ff;color:#2B6CC4;border:1px solid rgba(43,108,196,0.3)" onclick="omLib()">📚 Library</button>'+
    '<button class="btn" style="font-size:12px" onclick="om(\'ae\')">'+L().ae+'</button></div></div>'+
    (!(p.exercises||[]).length?'<div style="color:#4a6a8a;font-size:14px;padding:14px 0">'+L().nx+'</div>':"")+
    (p.exercises||[]).map(function(e,i){
      var isHe;
      if(lng==="he" && e.nameHe) isHe=true;
      else if(lng==="en" && e.name) isHe=false;
      else isHe = e.displayLng==="he" || (!e.name && e.nameHe);
      var eName = isHe&&e.nameHe ? e.nameHe : (e.name||e.nameHe);
      var eDesc = isHe&&e.descHe ? e.descHe : (e.desc||e.descHe);
      var eTips = isHe&&e.tipsHe ? e.tipsHe : (e.tips||e.tipsHe);
      var lngBadge = isHe ? '<span style="font-size:10px;background:#e8f0ff;color:#2B6CC4;border-radius:4px;padding:1px 5px;margin-left:4px">🇮🇱 HE</span>' :
                            '<span style="font-size:10px;background:#f0f5e8;color:#2a7a3a;border-radius:4px;padding:1px 5px;margin-left:4px">🇺🇸 EN</span>';
      var setsReps = '<span style="font-weight:600;color:#2B6CC4">'+e.sets+'</span> &times; <span style="font-weight:600;color:#2B6CC4">'+e.reps+'</span>';
      return '<div class="xcard" style="direction:'+(isHe?"rtl":"ltr")+'">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">'+
        '<div style="flex:1">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">'+bdg("#"+(i+1))+
        '<span style="font-weight:700;font-size:15px;color:#1a3a6e">'+eName+'</span>'+lngBadge+'</div>'+
        '<div style="font-size:13px;color:#4a6a8a;margin-bottom:6px">'+setsReps+' reps</div>'+
        (eDesc?'<div style="font-size:13px;color:#1a2535;margin-bottom:6px;line-height:1.5">'+eDesc+'</div>':"")+
        (eTips?'<div style="font-size:13px;color:#00a86b;margin-bottom:8px;line-height:1.5">&#128161; '+eTips+'</div>':"")+
        '<a href="'+ytUrl(eName)+'" target="_blank" style="font-size:12px;color:#6d28d9;border:1px solid rgba(109,40,217,0.3);border-radius:5px;padding:4px 11px;text-decoration:none;font-weight:600;display:inline-block">'+L().wv+'</a></div>'+
        '<div style="display:flex;flex-direction:column;gap:4px;margin-'+(isHe?'right':'left')+':8px">'+
        '<button class="btn btnd" style="padding:4px 9px;font-size:12px" onclick="de('+e.id+')">&#10005;</button>'+
        '<button class="btn" style="padding:4px 9px;font-size:12px;background:#f0f5ff" onclick="om(\'ae\','+e.id+')">✏️</button>'+
        '</div></div></div>';
    }).join("");
}

// ── Follow-ups ──
function rfu(){
  var p=cur;
  g("pft").innerHTML=
    '<div class="row"><span class="st">'+L().fu+'</span>'+
    '<button class="btn" style="font-size:12px" onclick="om(\'af\')">'+L().an+'</button></div>'+
    (!(p.followUps||[]).length?'<div style="color:#4a6a8a;font-size:14px;padding:14px 0">'+L().nf+'</div>':"")+
    (p.followUps||[]).map(function(f){
      return '<div class="xcard"><div style="font-size:12px;color:#2B6CC4;font-weight:600;margin-bottom:4px">'+f.date+'</div>'+
        '<div style="font-size:14px;color:#1a2535;line-height:1.7">'+f.note+'</div></div>';
    }).join("");
}

// ── Clinical Tab ──
function rcl(){
  var p=cur;
  g("pct").innerHTML=
    '<div class="row"><span class="st">'+L().cl+'</span>'+
    '<button class="btn" style="font-size:12px" onclick="document.getElementById(\'fi\').click()">'+L().up+'</button></div>'+
    (!(p.files||[]).length?'<div style="color:#4a6a8a;font-size:14px;margin-bottom:14px">'+L().nfi+'</div>':"")+
    ((p.files||[]).length?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:16px">'+
    (p.files||[]).map(function(f){
      return '<div style="background:rgba(255,255,255,0.85);border:1px solid rgba(43,108,196,0.2);border-radius:9px;padding:8px;text-align:center;position:relative">'+
        (f.type&&f.type.startsWith("image/")?'<img src="'+f.data+'" style="width:100%;height:78px;object-fit:cover;border-radius:6px;margin-bottom:5px">':
        '<div style="height:78px;display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:5px">&#128196;</div>')+
        '<div style="font-size:10px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1a2535">'+f.name+'</div>'+
        '<div style="font-size:9px;color:#4a6a8a">'+f.date+'</div>'+
        '<button onclick="dfile('+f.id+')" style="position:absolute;top:4px;right:4px;background:#fff;border:1px solid rgba(192,57,43,0.3);border-radius:3px;width:18px;height:18px;cursor:pointer;font-size:9px;color:#c0392b">&#10005;</button></div>';
    }).join("")+'</div>':"")+'<div style="background:rgba(109,40,217,0.07);border:1.5px solid rgba(167,139,250,0.3);border-radius:13px;padding:18px 20px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">'+
    '<div><div style="font-size:14px;font-weight:700;color:#6d28d9">'+L().aie+'</div>'+
    '<div style="font-size:11px;color:#4a6a8a;margin-top:2px">'+L().ah+'</div></div>'+
    '<button class="btn btnpu" style="font-size:12px" id="evb" onclick="aiev()">'+L().aie+'</button></div>'+
    (p.eval?'<div style="font-size:13px;color:#1a2535;line-height:1.9;white-space:pre-wrap;background:rgba(255,255,255,0.8);border-radius:9px;padding:15px 17px;border:1px solid rgba(167,139,250,0.25)">'+p.eval+'</div>':
    '<div style="color:#4a6a8a;font-size:13px;font-style:italic">No evaluation yet. Click "'+L().aie+'" to generate.</div>')+'</div>';
}

// ── Patient View (patient login) ──
function rpv(){
  var p=pts.find(function(x){ return x.id===auth; }); if(!p){ dout(); return; } cur=p;
  // Show welcome screen only on first login ever
  if(!p.firstLoginDone){
    renderPatientView(p);
    setTimeout(function(){ showFirstTimeWelcome(p); },300);
  } else {
    renderPatientView(p);
  }
}

function saveWelcome(){
  var isHe=lng==="he";
  var nhe=g("wn_he")?g("wn_he").value.trim():"";
  var nen=g("wn_en")?g("wn_en").value.trim():"";
  if(!nhe&&!nen){alert(isHe?"הכנס שם":"Enter your name");return;}
  cur.name=nen||nhe; cur.nameHe=nhe||nen;
  cur.age=g("w_age")?g("w_age").value:"";
  var wSportSel=g("w_sport_sel"); var wSportOther=g("w_sport_other");
  cur.sport = (wSportSel&&wSportSel.value&&wSportSel.value!=="__other__") ? wSportSel.value : (wSportOther?wSportOther.value.trim():"");
  cur.injury=g("w_injury")?g("w_injury").value.trim():"";
  cur.notes=g("w_goal")?g("w_goal").value.trim():"";
  cur.firstLoginDone=true;
  pts=pts.map(function(p){return p.id===cur.id?cur:p;});
  // Persist in session so avatar survives refresh
  try{
    var sess=JSON.parse(sessionStorage.getItem("ep_session")||"{}");
    sess.avatarId=cur.avatarId; sess.firstLoginDone=true;
    sessionStorage.setItem("ep_session",JSON.stringify(sess));
  }catch(e){}
  lsave();
  apiCall("patient-save-profile","POST",{
    id:cur.id, name:cur.name, nameHe:cur.nameHe,
    age:cur.age, sport:cur.sport, injury:cur.injury,
    notes:cur.notes, avatarId:cur.avatarId, firstLoginDone:true
  },function(){});
  cm(); rpv();
}

var workoutMode = false;
var exChecked = {};
var activeTimer = null;
var workoutStartTime = null;

// ── Avatar System ──
var AVATAR_BG=["#f87171","#fb923c","#fbbf24","#34d399","#22d3ee","#60a5fa","#a78bfa","#f472b6","#4ade80","#2dd4bf","#38bdf8","#818cf8","#fb7185","#facc15","#86efac","#f97316","#10b981","#0ea5e9","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#6366f1","#ef4444","#06b6d4","#84cc16","#e879f9","#f43f5e","#0891b2","#7c3aed"];
function eyeColorFor(hc){try{var r=parseInt(hc.slice(1,3),16),g=parseInt(hc.slice(3,5),16),b=parseInt(hc.slice(5,7),16),lum=r*0.299+g*0.587+b*0.114;return lum>175?"#5b8dd9":lum>105?"#7a6544":"#4a2c0a";}catch(e){return "#4a2c0a";}}
// (legacy name kept for any references)
var AVATARS = [
  {id:1,label:"Young Man",skin:"#f4a47c",hair:"short",hairC:"#3d2200",shirt:"#2B6CC4",pants:"#1a3a6e",hat:"",extra:""},
  {id:2,label:"Young Woman",skin:"#f4a47c",hair:"long",hairC:"#8b4513",shirt:"#e84393",pants:"#6b21a8",hat:"",extra:""},
  {id:3,label:"Boy",skin:"#f4a47c",hair:"short",hairC:"#1a1a1a",shirt:"#f97316",pants:"#1d4ed8",hat:"cap",extra:""},
  {id:4,label:"Girl",skin:"#f4a47c",hair:"pigtail",hairC:"#c084fc",shirt:"#ec4899",pants:"#7c3aed",hat:"",extra:"bow"},
  {id:5,label:"Older Man",skin:"#e8956d",hair:"short",hairC:"#aaaaaa",shirt:"#64748b",pants:"#374151",hat:"",extra:""},
  {id:6,label:"Older Woman",skin:"#e8956d",hair:"bun",hairC:"#9ca3af",shirt:"#7c3aed",pants:"#4b5563",hat:"",extra:""},
  {id:7,label:"Bodybuilder",skin:"#c87941",hair:"short",hairC:"#1a1a1a",shirt:"#dc2626",pants:"#111827",hat:"",extra:"muscle"},
  {id:8,label:"Weightlifter",skin:"#f4a47c",hair:"short",hairC:"#4a3000",shirt:"#16a34a",pants:"#064e3b",hat:"",extra:"muscle"},
  {id:9,label:"Runner",skin:"#d4956a",hair:"ponytail",hairC:"#1a1a1a",shirt:"#f59e0b",pants:"#7c3aed",hat:"",extra:""},
  {id:10,label:"Cyclist",skin:"#f4a47c",hair:"short",hairC:"#5a3e00",shirt:"#0ea5e9",pants:"#1e40af",hat:"helmet",extra:""},
  {id:11,label:"Swimmer",skin:"#e0a070",hair:"short",hairC:"#2563eb",shirt:"#0284c7",pants:"#0c4a6e",hat:"goggle",extra:""},
  {id:12,label:"Soccer Player",skin:"#d4956a",hair:"short",hairC:"#1a1a1a",shirt:"#16a34a",pants:"#f9fafb",hat:"",extra:""},
  {id:13,label:"Tattooed Guy",skin:"#f4a47c",hair:"mohawk",hairC:"#1a1a1a",shirt:"#111827",pants:"#1f2937",hat:"",extra:"tattoo"},
  {id:14,label:"Pierced Girl",skin:"#f4a47c",hair:"long",hairC:"#7c3aed",shirt:"#6d28d9",pants:"#1f2937",hat:"",extra:"pierce"},
  {id:15,label:"Bearded Man",skin:"#c87941",hair:"short",hairC:"#3d2200",shirt:"#92400e",pants:"#78350f",hat:"",extra:"beard"},
  {id:16,label:"Curly Hair",skin:"#8b5e3c",hair:"curly",hairC:"#1a1a1a",shirt:"#2563eb",pants:"#1d4ed8",hat:"",extra:""},
  {id:17,label:"Baseball Cap",skin:"#f4a47c",hair:"short",hairC:"#4a3000",shirt:"#f97316",pants:"#374151",hat:"baseball",extra:""},
  {id:18,label:"Beanie",skin:"#e8956d",hair:"short",hairC:"#5a3e00",shirt:"#7c3aed",pants:"#4b5563",hat:"beanie",extra:""},
  {id:19,label:"Ninja",skin:"#f4a47c",hair:"none",hairC:"#1a1a1a",shirt:"#111827",pants:"#111827",hat:"ninja",extra:""},
  {id:20,label:"Doctor",skin:"#f4a47c",hair:"short",hairC:"#374151",shirt:"#f8fafc",pants:"#cbd5e1",hat:"",extra:"stethoscope"},
  {id:21,label:"Chef",skin:"#e8956d",hair:"short",hairC:"#6b7280",shirt:"#f8fafc",pants:"#374151",hat:"chef",extra:""},
  {id:22,label:"Artist",skin:"#f4a47c",hair:"messy",hairC:"#7c3aed",shirt:"#fbbf24",pants:"#1f2937",hat:"beret",extra:""},
  {id:23,label:"Surfer",skin:"#c8965a",hair:"long",hairC:"#d4a017",shirt:"#06b6d4",pants:"#0e7490",hat:"",extra:""},
  {id:24,label:"Gamer",skin:"#f4a47c",hair:"short",hairC:"#1a1a1a",shirt:"#6d28d9",pants:"#1f2937",hat:"headset",extra:""},
  {id:25,label:"Yoga Lady",skin:"#e8956d",hair:"bun",hairC:"#b45309",shirt:"#10b981",pants:"#065f46",hat:"",extra:""},
  {id:26,label:"Skater",skin:"#f4a47c",hair:"shaggy",hairC:"#78350f",shirt:"#f43f5e",pants:"#374151",hat:"backwards",extra:""},
  {id:27,label:"Martial Artist",skin:"#d4956a",hair:"none",hairC:"#1a1a1a",shirt:"#f8fafc",pants:"#f8fafc",hat:"",extra:"belt"},
  {id:28,label:"Hipster",skin:"#f4a47c",hair:"pompadour",hairC:"#92400e",shirt:"#064e3b",pants:"#374151",hat:"",extra:"glasses"},
  {id:29,label:"Grandpa",skin:"#e0b090",hair:"bald",hairC:"#d1d5db",shirt:"#94a3b8",pants:"#64748b",hat:"",extra:"glasses"},
  {id:30,label:"Grandma",skin:"#e0b090",hair:"curly",hairC:"#e5e7eb",shirt:"#f0abfc",pants:"#7c3aed",hat:"",extra:""}
];

function legoSVG(av,size){
  size=size||60;
  var s=av.skin, h=av.hairC, sh=av.shirt, p=av.pants;
  var bg=AVATAR_BG[(av.id-1)%AVATAR_BG.length];
  var ec=eyeColorFor(h);
  var bc=shadeColor(h,-10);
  var svg='<svg viewBox="0 0 80 80" width="'+size+'" height="'+size+'" xmlns="http://www.w3.org/2000/svg">';

  // ── Vibrant background ────────────────────────────────────────
  svg+='<circle cx="40" cy="40" r="38" fill="'+bg+'"/>';

  // ── BODY / SHOULDERS ─────────────────────────────────────────
  svg+='<rect x="16" y="58" width="48" height="26" rx="10" fill="'+sh+'"/>';
  svg+='<ellipse cx="18" cy="60" rx="11" ry="7" fill="'+sh+'"/>';
  svg+='<ellipse cx="62" cy="60" rx="11" ry="7" fill="'+sh+'"/>';
  svg+='<path d="M33,59 Q40,65 47,59" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.45)" stroke-width="1.3" stroke-linecap="round" fill-opacity="0.22"/>';

  // ── NECK ──────────────────────────────────────────────────────
  svg+='<rect x="35" y="47" width="10" height="14" rx="4" fill="'+s+'"/>';

  // ── HAIR back layer ───────────────────────────────────────────
  svg+=renderHair(av.hair, h, av.hat);

  // ── EARS ──────────────────────────────────────────────────────
  svg+='<ellipse cx="25" cy="30" rx="4.5" ry="5.5" fill="'+s+'"/>';
  svg+='<ellipse cx="55" cy="30" rx="4.5" ry="5.5" fill="'+s+'"/>';
  svg+='<ellipse cx="25" cy="30" rx="2.3" ry="3.3" fill="'+shadeColor(s,-18)+'"/>';
  svg+='<ellipse cx="55" cy="30" rx="2.3" ry="3.3" fill="'+shadeColor(s,-18)+'"/>';

  // ── FACE OVAL ─────────────────────────────────────────────────
  svg+='<ellipse cx="40" cy="30" rx="15" ry="18" fill="'+s+'"/>';

  // ── EYEBROWS ──────────────────────────────────────────────────
  svg+='<path d="M27.5,21 Q32,18 36,20" stroke="'+bc+'" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  svg+='<path d="M44,20 Q48,18 52.5,21" stroke="'+bc+'" stroke-width="2.2" fill="none" stroke-linecap="round"/>';

  // ── EYES ──────────────────────────────────────────────────────
  svg+='<ellipse cx="32" cy="27" rx="5" ry="4.5" fill="#fff"/>';
  svg+='<circle cx="32" cy="27" r="3.2" fill="'+ec+'"/>';
  svg+='<circle cx="32" cy="27" r="1.8" fill="#1a1a2e"/>';
  svg+='<circle cx="33.3" cy="25.5" r="1.1" fill="rgba(255,255,255,0.9)"/>';
  svg+='<path d="M27,25.5 Q32,22.5 37,25.5" stroke="'+shadeColor(s,-28)+'" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
  svg+='<ellipse cx="48" cy="27" rx="5" ry="4.5" fill="#fff"/>';
  svg+='<circle cx="48" cy="27" r="3.2" fill="'+ec+'"/>';
  svg+='<circle cx="48" cy="27" r="1.8" fill="#1a1a2e"/>';
  svg+='<circle cx="49.3" cy="25.5" r="1.1" fill="rgba(255,255,255,0.9)"/>';
  svg+='<path d="M43,25.5 Q48,22.5 53,25.5" stroke="'+shadeColor(s,-28)+'" stroke-width="1.5" fill="none" stroke-linecap="round"/>';

  // ── NOSE ──────────────────────────────────────────────────────
  svg+='<path d="M38,34 Q36,37 37.5,38.5 Q40,39.5 42.5,38.5 Q44,37 42,34" stroke="'+shadeColor(s,-22)+'" stroke-width="1.5" fill="none" stroke-linecap="round"/>';

  // ── LIPS ──────────────────────────────────────────────────────
  var lc=shadeColor(s,-32);
  svg+='<path d="M33,42 Q36.5,40.5 40,41.5 Q43.5,40.5 47,42" stroke="'+lc+'" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
  svg+='<path d="M33,42 Q40,47 47,42" stroke="'+lc+'" stroke-width="1.5" fill="rgba(0,0,0,0.07)" stroke-linecap="round"/>';

  // Cheek blush
  svg+='<ellipse cx="24" cy="37" rx="5" ry="3" fill="rgba(255,100,80,0.16)"/>';
  svg+='<ellipse cx="56" cy="37" rx="5" ry="3" fill="rgba(255,100,80,0.16)"/>';

  // ── HAIR front layer ──────────────────────────────────────────
  svg+=renderHairFront(av.hair, h, av.hat);

  // ── HAT ───────────────────────────────────────────────────────
  svg+=renderHat(av.hat, h);

  // ── EXTRAS ────────────────────────────────────────────────────
  svg+=renderExtra(av.extra, h, sh, s);

  // ── FRAME ─────────────────────────────────────────────────────
  svg+='<circle cx="40" cy="40" r="38" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="2"/>';

  svg+='</svg>';
  return svg;
}

function shadeColor(hex, pct){
  try{
    var n=parseInt(hex.replace('#',''),16);
    var r2=Math.min(255,Math.max(0,((n>>16)&255)+pct));
    var g2=Math.min(255,Math.max(0,((n>>8)&255)+pct));
    var b2=Math.min(255,Math.max(0,(n&255)+pct));
    return '#'+((1<<24)+(r2<<16)+(g2<<8)+b2).toString(16).slice(1);
  }catch(e){return hex;}
}

function renderHair(hair, h, hat){
  // Back layer — drawn before face oval so it appears behind the face.
  // Face oval: cx=40, cy=30, rx=15, ry=18 → top y=12, sides x=25/55
  if(hat==="ninja"||hat==="chef") return "";
  if(hair==="bald"||hair==="none") return "";
  var svg="";
  if(hair==="short"){
    svg+='<path d="M25,30 Q25,9 40,9 Q55,9 55,30 Q52,18 40,17 Q28,18 25,30 Z" fill="'+h+'"/>';
  } else if(hair==="long"){
    svg+='<path d="M22,34 Q20,9 40,8 Q60,9 58,34 Q53,18 40,17 Q27,18 22,34 Z" fill="'+h+'"/>';
    svg+='<path d="M22,28 Q14,36 13,58 Q15,63 19,61 Q17,46 22,30 Z" fill="'+h+'"/>';
    svg+='<path d="M58,28 Q66,36 67,58 Q65,63 61,61 Q63,46 58,30 Z" fill="'+h+'"/>';
  } else if(hair==="shaggy"){
    svg+='<path d="M22,34 Q20,9 40,8 Q60,9 58,34 Q53,18 40,17 Q27,18 22,34 Z" fill="'+h+'"/>';
    svg+='<path d="M22,27 Q13,35 12,56 Q14,62 18,60 Q16,44 22,29 Z" fill="'+h+'"/>';
    svg+='<path d="M58,27 Q67,35 68,56 Q66,62 62,60 Q64,44 58,29 Z" fill="'+h+'"/>';
    svg+='<path d="M22,20 Q17,13 22,11 Q21,17 23,22 Z" fill="'+h+'"/>';
    svg+='<path d="M58,20 Q63,13 58,11 Q59,17 57,22 Z" fill="'+h+'"/>';
  } else if(hair==="curly"){
    svg+='<ellipse cx="40" cy="11" rx="19" ry="12" fill="'+h+'"/>';
    svg+='<circle cx="23" cy="20" r="10" fill="'+h+'"/>';
    svg+='<circle cx="57" cy="20" r="10" fill="'+h+'"/>';
    svg+='<rect x="22" y="20" width="36" height="11" fill="'+h+'"/>';
  } else if(hair==="bun"){
    svg+='<path d="M25,30 Q25,9 40,9 Q55,9 55,30 Q52,18 40,17 Q28,18 25,30 Z" fill="'+h+'"/>';
    svg+='<circle cx="40" cy="7" r="8" fill="'+h+'"/>';
  } else if(hair==="pigtail"){
    svg+='<path d="M25,30 Q25,9 40,9 Q55,9 55,30 Q52,18 40,17 Q28,18 25,30 Z" fill="'+h+'"/>';
    svg+='<path d="M25,26 Q15,31 14,47 Q15,55 19,53 Q17,41 22,28 Z" fill="'+h+'"/>';
    svg+='<path d="M55,26 Q65,31 66,47 Q65,55 61,53 Q63,41 58,28 Z" fill="'+h+'"/>';
    svg+='<circle cx="15" cy="51" r="4.5" fill="'+shadeColor(h,-22)+'"/>';
    svg+='<circle cx="65" cy="51" r="4.5" fill="'+shadeColor(h,-22)+'"/>';
  } else if(hair==="ponytail"){
    svg+='<path d="M25,30 Q25,9 40,9 Q55,9 55,30 Q52,18 40,17 Q28,18 25,30 Z" fill="'+h+'"/>';
    svg+='<path d="M54,18 Q66,22 65,42 Q64,51 60,49 Q61,35 58,20 Z" fill="'+h+'"/>';
  } else if(hair==="mohawk"){
    svg+='<path d="M36,22 Q37,3 40,1 Q43,3 44,22 Q42,10 40,10 Q38,10 36,22 Z" fill="'+h+'"/>';
  } else if(hair==="pompadour"){
    svg+='<path d="M25,30 Q25,9 40,9 Q55,9 55,30 Q52,18 40,17 Q28,18 25,30 Z" fill="'+h+'"/>';
    svg+='<path d="M27,18 Q33,4 40,3 Q47,4 54,15 Q46,9 40,9 Q34,9 27,18 Z" fill="'+shadeColor(h,28)+'"/>';
  } else if(hair==="messy"){
    svg+='<path d="M25,30 Q25,9 40,9 Q55,9 55,30 Q52,18 40,17 Q28,18 25,30 Z" fill="'+h+'"/>';
    svg+='<path d="M27,18 Q24,9 30,8 Q29,14 28,21 Z" fill="'+h+'"/>';
    svg+='<path d="M37,9 Q39,1 43,3 Q41,11 38,12 Z" fill="'+h+'"/>';
    svg+='<path d="M51,10 Q55,2 59,6 Q55,14 52,13 Z" fill="'+h+'"/>';
  }
  return svg;
}

function renderHairFront(hair, h, hat){
  // Front layer — drawn after face for natural overlap on long styles.
  if(hat==="ninja"||hat==="chef") return "";
  if(hair==="bald"||hair==="none") return "";
  var svg="";
  if(hair==="long"||hair==="shaggy"){
    svg+='<path d="M27,23 Q23,30 22,44" stroke="'+h+'" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.65"/>';
    svg+='<path d="M53,23 Q57,30 58,44" stroke="'+h+'" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.65"/>';
  } else if(hair==="curly"){
    svg+='<circle cx="25" cy="26" r="6.5" fill="'+h+'"/>';
    svg+='<circle cx="55" cy="26" r="6.5" fill="'+h+'"/>';
  }
  return svg;
}

function renderHat(hat, h){
  // Face oval top: y=12. Hats sit above and on the head.
  var svg="";
  if(hat==="cap"||hat==="baseball"){
    svg+='<path d="M25,28 Q25,9 40,9 Q55,9 55,28 Q52,17 40,17 Q28,17 25,28 Z" fill="#dc2626"/>';
    svg+='<path d="M25,26 Q13,25 9,31 Q13,36 25,31 Z" fill="#b91c1c"/>';
    svg+='<rect x="25" y="24" width="30" height="5" rx="2" fill="rgba(0,0,0,0.2)"/>';
  } else if(hat==="backwards"){
    svg+='<path d="M25,28 Q25,9 40,9 Q55,9 55,28 Q52,17 40,17 Q28,17 25,28 Z" fill="#f43f5e"/>';
    svg+='<path d="M55,26 Q67,25 71,31 Q67,36 55,31 Z" fill="#e11d48"/>';
  } else if(hat==="beanie"){
    svg+='<path d="M25,30 Q25,7 40,7 Q55,7 55,30 Q52,15 40,15 Q28,15 25,30 Z" fill="'+h+'"/>';
    svg+='<rect x="24" y="26" width="32" height="7" rx="3.5" fill="'+shadeColor(h,-22)+'"/>';
    svg+='<circle cx="40" cy="7" r="5" fill="'+shadeColor(h,28)+'"/>';
  } else if(hat==="helmet"){
    svg+='<path d="M22,28 Q22,7 40,7 Q58,7 58,28 Q55,13 40,13 Q25,13 22,28 Z" fill="#0ea5e9"/>';
    svg+='<rect x="22" y="24" width="36" height="7" rx="3.5" fill="#0284c7"/>';
    svg+='<rect x="30" y="11" width="20" height="5" rx="2.5" fill="rgba(255,255,255,0.5)"/>';
  } else if(hat==="chef"){
    svg+='<rect x="28" y="21" width="24" height="8" rx="4" fill="#e2e8f0"/>';
    svg+='<path d="M30,25 Q30,7 40,7 Q50,7 50,25 Z" fill="#f8fafc"/>';
    svg+='<circle cx="40" cy="6" r="7" fill="#f8fafc"/>';
  } else if(hat==="beret"){
    svg+='<ellipse cx="43" cy="15" rx="19" ry="11" fill="'+h+'"/>';
    svg+='<circle cx="54" cy="10" r="4" fill="'+shadeColor(h,-15)+'"/>';
    svg+='<rect x="33" y="22" width="14" height="5" rx="2.5" fill="'+shadeColor(h,-10)+'"/>';
  } else if(hat==="headset"){
    svg+='<path d="M22,24 Q22,7 40,7 Q58,7 58,24" stroke="#1f2937" stroke-width="5" fill="none" stroke-linecap="round"/>';
    svg+='<rect x="14" y="22" width="10" height="14" rx="5" fill="#374151"/>';
    svg+='<rect x="56" y="22" width="10" height="14" rx="5" fill="#374151"/>';
    svg+='<path d="M24,32 Q28,39 32,40" stroke="#374151" stroke-width="2" fill="none" stroke-linecap="round"/>';
    svg+='<circle cx="32" cy="40" r="2.5" fill="#1f2937"/>';
  } else if(hat==="ninja"){
    svg+='<path d="M20,50 Q20,6 40,6 Q60,6 60,50 Q60,34 40,32 Q20,34 20,50 Z" fill="#111827" opacity="0.95"/>';
    svg+='<rect x="24" y="27" width="32" height="9" rx="2" fill="#1f2937"/>';
    svg+='<rect x="24" y="28" width="32" height="5" rx="2" fill="#2d3748" opacity="0.5"/>';
  } else if(hat==="goggle"){
    svg+='<rect x="23" y="22" width="14" height="11" rx="5.5" fill="#0284c7" opacity="0.92"/>';
    svg+='<rect x="43" y="22" width="14" height="11" rx="5.5" fill="#0284c7" opacity="0.92"/>';
    svg+='<rect x="37" y="24" width="6" height="7" fill="#075985"/>';
    svg+='<rect x="17" y="25" width="6" height="4" rx="2" fill="#374151"/>';
    svg+='<rect x="57" y="25" width="6" height="4" rx="2" fill="#374151"/>';
  }
  return svg;
}

function renderExtra(extra, h, sh, s){
  // Face oval: cx=40,cy=30,rx=15,ry=18 → chin at y=48. Shoulders: y=58+
  var svg="";
  if(extra==="beard"){
    svg+='<path d="M26,37 Q28,51 35,55 Q40,57 45,55 Q52,51 54,37 Q46,44 40,44 Q34,44 26,37 Z" fill="'+h+'" opacity="0.9"/>';
  } else if(extra==="glasses"){
    svg+='<rect x="24" y="23" width="12" height="9" rx="4.5" fill="rgba(200,230,255,0.4)" stroke="#374151" stroke-width="1.8"/>';
    svg+='<rect x="44" y="23" width="12" height="9" rx="4.5" fill="rgba(200,230,255,0.4)" stroke="#374151" stroke-width="1.8"/>';
    svg+='<line x1="36" y1="27.5" x2="44" y2="27.5" stroke="#374151" stroke-width="1.8"/>';
    svg+='<line x1="18" y1="27.5" x2="24" y2="27.5" stroke="#374151" stroke-width="1.8"/>';
    svg+='<line x1="56" y1="27.5" x2="62" y2="27.5" stroke="#374151" stroke-width="1.8"/>';
  } else if(extra==="pierce"){
    svg+='<circle cx="22" cy="32" r="2.8" fill="#c084fc"/>';
    svg+='<circle cx="58" cy="27" r="2.2" fill="#a78bfa"/>';
    svg+='<circle cx="40" cy="39" r="1.8" fill="#e2e2e2"/>';
  } else if(extra==="tattoo"){
    svg+='<path d="M20,67 Q22,59 24,67 Q25,73 23,77" stroke="#6b7280" stroke-width="2" fill="none" stroke-linecap="round"/>';
    svg+='<path d="M20,61 Q23,55 25,61" stroke="#6b7280" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
  } else if(extra==="muscle"){
    svg+='<ellipse cx="29" cy="68" rx="5" ry="5.5" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>';
    svg+='<ellipse cx="51" cy="68" rx="5" ry="5.5" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>';
  } else if(extra==="stethoscope"){
    svg+='<path d="M35,61 Q28,72 31,78" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
    svg+='<circle cx="31" cy="78" r="4" fill="#64748b"/>';
    svg+='<circle cx="31" cy="78" r="2" fill="#cbd5e1"/>';
    svg+='<line x1="35" y1="60" x2="45" y2="60" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>';
  } else if(extra==="belt"){
    svg+='<rect x="22" y="72" width="36" height="5" rx="2.5" fill="#1f2937"/>';
    svg+='<rect x="37" y="71" width="6" height="7" rx="1.5" fill="#f59e0b"/>';
    svg+='<circle cx="40" cy="74.5" r="1.5" fill="#1f2937"/>';
  } else if(extra==="bow"){
    svg+='<path d="M30,9 Q35,3 40,9 Q35,15 30,9 Z" fill="'+h+'"/>';
    svg+='<path d="M40,9 Q45,3 50,9 Q45,15 40,9 Z" fill="'+h+'"/>';
    svg+='<circle cx="40" cy="9" r="3.5" fill="'+shadeColor(h,-22)+'"/>';
  }
  return svg;
}



function showAvatarPicker(onSelect){
  var c=g("MC"); var isHe=lng==="he";
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">🧱 '+(isHe?"בחר אווטאר":"Pick Your Avatar")+'</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">✕</button></div>'+
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;max-height:460px;overflow-y:auto;padding:2px">'+
    AVATARS.map(function(av){
      var sel=cur&&cur.avatarId===av.id;
      return '<div onclick="selectAvatar('+av.id+')" style="text-align:center;padding:6px 2px;border-radius:10px;cursor:pointer;border:2px solid '+(sel?'#2B6CC4':'transparent')+';background:'+(sel?'#e8f2ff':'#f8fbff')+'" onmouseover="this.style.background=\'#e8f2ff\'" onmouseout="this.style.background=\''+(sel?'#e8f2ff':'#f8fbff')+'\'">'+
        legoSVG(av,42)+'<div style="font-size:8px;color:#4a6a8a;margin-top:2px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+av.label+'</div></div>';
    }).join("")+'</div>';
  g("MB").classList.add("on");
  window._avatarOnSelect=onSelect;
}

function selectAvatar(id){
  if(cur) cur.avatarId=id;
  if(window._avatarOnSelect) window._avatarOnSelect(id);
  cm();
}

function toggleWelcomeSport(v){
  var other=g("w_sport_other"); if(other) other.style.display=v==="__other__"?"block":"none";
}

function showFirstTimeWelcome(p){
  var isHe=lng==="he";
  if(!cur.avatarId) cur.avatarId=Math.floor(Math.random()*30)+1;
  var c=g("MC");
  c.innerHTML=
    '<div style="text-align:center;margin-bottom:18px">'+
    '<div style="font-size:38px;margin-bottom:8px">👋</div>'+
    '<div style="font-size:20px;font-weight:800;color:#1a3a6e;margin-bottom:4px">'+(isHe?"ברוך הבא!":"Welcome!")+'</div>'+
    '<div style="font-size:13px;color:#4a6a8a">'+(isHe?"נגדיר את הפרופיל שלך":"Let\'s set up your profile")+'</div></div>'+
    '<div style="text-align:center;margin-bottom:16px">'+
    '<div style="font-size:11px;font-weight:700;color:#1a3a6e;text-transform:uppercase;margin-bottom:8px">'+(isHe?"האווטאר שלך":"Your Avatar")+'</div>'+
    '<div id="av_preview" onclick="showAvatarPicker(function(id){renderAvatarPreview();})" style="display:inline-block;cursor:pointer;padding:8px;border-radius:12px;border:2px solid #2B6CC4;background:#e8f2ff">'+
    legoSVG(AVATARS.find(function(a){return a.id===cur.avatarId;})||AVATARS[0],64)+
    '<div style="font-size:11px;color:#2B6CC4;font-weight:600;margin-top:4px">'+(isHe?"לחץ לשינוי":"Tap to change")+'</div></div></div>'+
    '<div class="g2" style="gap:10px;margin-bottom:14px">'+
    '<div style="grid-column:1/-1"><label class="lbl">'+(isHe?"שם מלא בעברית":"שם מלא בעברית")+'</label><input class="inp" id="wn_he" dir="rtl" placeholder="שם בעברית" value="'+(p.nameHe||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">Full Name in English</label><input class="inp" id="wn_en" placeholder="English name" value="'+(p.name||'')+'"></div>'+
    '<div><label class="lbl">'+(isHe?"גיל":"Age")+'</label><input class="inp" id="w_age" type="number" value="'+(p.age||'')+'"></div>'+
    '<div><label class="lbl">'+(isHe?"ספורט":"Sport")+'</label>'+
    '<select class="inp" id="w_sport_sel" onchange="toggleWelcomeSport(this.value)">'+
    '<option value="">-- '+(isHe?"בחר ספורט":"Select sport")+' --</option>'+
    getAllSports().map(function(s,i){ var allHe=getAllSportsHe(); var label=isHe&&allHe[i]?allHe[i]:s; return '<option value="'+s+'"'+(p.sport===s?" selected":"")+'>'+label+'</option>'; }).join("")+
    '<option value="__other__">'+(isHe?"אחר (הכנס ידנית)":"Other (type manually)")+'</option>'+
    '</select>'+
    '<input class="inp" id="w_sport_other" placeholder="'+(isHe?"כתוב ספורט...":"Type sport...")+'" value="'+(getAllSports().indexOf(p.sport)<0?p.sport:'')+'" style="margin-top:5px;display:'+(getAllSports().indexOf(p.sport)<0&&p.sport?'block':'none')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">'+(isHe?"פציעות/מצב":"Injuries/Condition")+'</label><input class="inp" id="w_injury" value="'+(p.injury||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">'+(isHe?"המטרה שלי":"My Goal")+'</label><input class="inp" id="w_goal" value="'+(p.notes||'')+'"></div>'+
    '</div>'+
    '<button class="btn" style="width:100%;padding:12px;font-size:15px;font-weight:700" onclick="saveWelcome()">'+
    (isHe?"כניסה לתוכנית שלי ➜":"Enter My Program ➜")+'</button>';
  g("MB").classList.add("on");
}

function renderAvatarPreview(){
  var prev=g("av_preview"); if(!prev||!cur) return;
  var av=AVATARS.find(function(a){return a.id===cur.avatarId;})||AVATARS[0];
  var isHe=lng==="he";
  prev.innerHTML=legoSVG(av,64)+'<div style="font-size:11px;color:#2B6CC4;font-weight:600;margin-top:4px">'+(isHe?"לחץ לשינוי":"Tap to change")+'</div>';
}


function adminPatientAv(p,size){
  size=size||54;
  var avObj=AVATARS.find(function(a){return a.id===(p.avatarId||0);})||null;
  var initials=(pn(p)||"?").split(" ").map(function(x){return x[0]||"";}).join("").slice(0,2).toUpperCase();
  if(avObj){
    var yShirt=Math.round(size*0.55);
    var fSize=Math.round(size*0.18);
    return '<div onclick="adminChangeAvatar('+p.id+')" style="cursor:pointer;position:relative;width:'+size+'px;display:inline-block" title="Change avatar">'+
      '<div style="position:relative;display:inline-block;border-radius:50%;overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,0.15)">'+
      legoSVG(avObj,size)+
      '<div style="position:absolute;top:'+yShirt+'px;left:0;right:0;text-align:center;font-size:'+fSize+'px;font-weight:900;color:rgba(255,255,255,0.90);letter-spacing:1px;line-height:1;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,0.4)">'+initials+'</div>'+
      '</div>'+
      '<div style="position:absolute;bottom:-2px;right:-2px;background:#2B6CC4;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;border:2px solid #fff">✏️</div>'+
      '</div>';
  }
  return '<div onclick="adminChangeAvatar('+p.id+')" style="cursor:pointer;position:relative;display:inline-block" title="Change avatar">'+
    av(pn(p),size)+
    '<div style="position:absolute;bottom:-2px;right:-2px;background:#2B6CC4;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;border:2px solid #fff">✏️</div>'+
    '</div>';
}

function adminChangeAvatar(patientId){
  var p=pts.find(function(x){return x.id===patientId;}); if(!p) return;
  cur=p;
  showAvatarPicker(function(id){
    p.avatarId=id; cur=p;
    pts=pts.map(function(x){return x.id===patientId?p:x;});
    sv(); rpd(); // refresh admin patient detail
  });
}

function legoAv(p,size){
  size=size||52;
  var avObj=AVATARS.find(function(a){return a.id===(p.avatarId||0);})||null;
  var initials=(pn(p)||"?").split(" ").map(function(x){return x[0]||"";}).join("").slice(0,2).toUpperCase();
  if(avObj){
    var yShirt=Math.round(size*0.55); // shirt area in square avatar
    var fSize=Math.round(size*0.18);
    return '<div onclick="showPatientProfile()" style="cursor:pointer;position:relative;width:'+size+'px;display:inline-block" title="My Profile">'+
      '<div style="position:relative;display:inline-block;border-radius:50%;overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,0.15)">'+
      legoSVG(avObj,size)+
      '<div style="position:absolute;top:'+yShirt+'px;left:0;right:0;text-align:center;font-size:'+fSize+'px;font-weight:900;color:rgba(255,255,255,0.90);letter-spacing:1px;line-height:1;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,0.4)">'+initials+'</div>'+
      '</div>'+
      '<div style="position:absolute;bottom:-2px;right:-2px;background:#2B6CC4;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;border:2px solid #fff">✏️</div>'+
      '</div>';
  }
  return '<div onclick="showPatientProfile()" style="cursor:pointer;position:relative;display:inline-block" title="My Profile">'+
    av(pn(p),size)+
    '<div style="position:absolute;bottom:-2px;right:-2px;background:#2B6CC4;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;border:2px solid #fff">✏️</div>'+
    '</div>';
}

function showPatientProfile(){
  var p=cur; if(!p) return;
  var isHe=lng==="he";
  var av=AVATARS.find(function(a){return a.id===(p.avatarId||0);})||AVATARS[0];
  var c=g("MC");
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">👤 '+(isHe?"הפרופיל שלי":"My Profile")+'</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">✕</button></div>'+
    // Avatar
    '<div style="text-align:center;margin-bottom:16px">'+
    '<div id="pp_av_prev" onclick="showAvatarPicker(function(id){renderPPAvatar();})" style="display:inline-block;cursor:pointer;padding:8px;border-radius:12px;border:2px solid #2B6CC4;background:#e8f2ff">'+
    legoSVG(av,72)+
    '<div style="font-size:11px;color:#2B6CC4;font-weight:600;margin-top:4px">'+(isHe?"שנה אווטאר":"Change Avatar")+'</div></div></div>'+
    // Profile fields
    '<div class="g2" style="gap:10px;margin-bottom:14px">'+
    '<div style="grid-column:1/-1"><label class="lbl">'+(isHe?"שם בעברית":"שם בעברית")+'</label>'+
    '<input class="inp" id="pp_nhe" dir="rtl" value="'+(p.nameHe||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">English Name</label>'+
    '<input class="inp" id="pp_nen" value="'+(p.name||'')+'"></div>'+
    '<div><label class="lbl">'+(isHe?"גיל":"Age")+'</label>'+
    '<input class="inp" id="pp_age" type="number" value="'+(p.age||'')+'"></div>'+
    '<div><label class="lbl">'+(isHe?"ספורט":"Sport")+'</label>'+
    '<select class="inp" id="pp_sport_sel" onchange="var o=document.getElementById(\'pp_sport_other\');o.style.display=this.value===\'__other__\'?\'block\':\'none\'">'+
    '<option value="">-- '+(isHe?"בחר":"Select")+' --</option>'+
    getAllSports().map(function(s,i){ var allHe=getAllSportsHe(); var label=isHe&&allHe[i]?allHe[i]:s; return '<option value="'+s+'"'+(p.sport===s?" selected":"")+'>'+label+'</option>'; }).join("")+
    '<option value="__other__">'+(isHe?"אחר (כתוב)":"Other (type)")+'</option>'+
    '</select>'+
    '<input class="inp" id="pp_sport" placeholder="'+(isHe?"כתוב ספורט":"Type sport")+'" value="'+(getAllSports().indexOf(p.sport)<0&&p.sport?p.sport:'')+'" style="margin-top:5px;display:'+(getAllSports().indexOf(p.sport)<0&&p.sport?'block':'none')+'" id="pp_sport_other"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">'+(isHe?"פציעה/מצב":"Injury/Condition")+'</label>'+
    '<input class="inp" id="pp_injury" value="'+(p.injury||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">'+(isHe?"המטרה שלי":"My Goal")+'</label>'+
    '<input class="inp" id="pp_goal" value="'+(p.notes||'')+'"></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px">'+
    '<button class="btn btnd" onclick="cm()" style="flex:1">'+(isHe?"ביטול":"Cancel")+'</button>'+
    '<button class="btn" onclick="savePatientProfile()" style="flex:2">💾 '+(isHe?"שמור פרופיל":"Save Profile")+'</button>'+
    '</div>';
  g("MB").classList.add("on");
}

function renderPPAvatar(){
  var prev=g("pp_av_prev"); if(!prev||!cur) return;
  var av=AVATARS.find(function(a){return a.id===cur.avatarId;})||AVATARS[0];
  var isHe=lng==="he";
  prev.innerHTML=legoSVG(av,72)+'<div style="font-size:11px;color:#2B6CC4;font-weight:600;margin-top:4px">'+(isHe?"שנה אווטאר":"Change Avatar")+'</div>';
}

function savePatientProfile(){
  var isHe=lng==="he";
  var nhe=g("pp_nhe")?g("pp_nhe").value.trim():"";
  var nen=g("pp_nen")?g("pp_nen").value.trim():"";
  if(!nhe&&!nen){alert(isHe?"הכנס שם":"Enter your name");return;}
  var newPin=g("pp_pin")?g("pp_pin").value.trim():"";
  cur.name=nen||nhe; cur.nameHe=nhe||nen;
  cur.age=g("pp_age")?g("pp_age").value:"";
  var sportSel=g("pp_sport_sel"); var sportOther=g("pp_sport_other")||g("pp_sport");
  cur.sport = (sportSel&&sportSel.value&&sportSel.value!=="__other__") ? sportSel.value : (sportOther?sportOther.value.trim():"");
  cur.injury=g("pp_injury")?g("pp_injury").value.trim():"";
  cur.notes=g("pp_goal")?g("pp_goal").value.trim():"";
  pts=pts.map(function(p){return p.id===cur.id?cur:p;});
  lsave();
  apiCall("patient-save-profile","POST",{
    id:cur.id, name:cur.name, nameHe:cur.nameHe,
    age:cur.age, sport:cur.sport, injury:cur.injury,
    notes:cur.notes, avatarId:cur.avatarId,
    firstLoginDone:true
  },function(){});
  cm(); rpv();
}

// ── Patient-side plan/day selection state ──
var patientCurPlanId = null;
var patientCurDayId = null;
var patientCurPhaseIdx = 0;

function patientSelectPlan(planId){
  patientCurPlanId=planId; patientCurDayId=null;
  renderPatientView(cur);
}
function patientSelectDay(planId, phaseIdx, dayId){
  patientCurPlanId=planId; patientCurPhaseIdx=phaseIdx; patientCurDayId=dayId;
  renderPatientView(cur);
}

function renderWorkoutExercises(exercises, plan, day, isHe){
  if(!exercises||!exercises.length) return '<div style="color:#4a6a8a;font-size:14px;padding:14px 0">'+L().nx+'</div>';
  var html='';
  // Start/End program bar
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  if(!workoutMode){
    html += '<button onclick="startWorkout()" style="background:linear-gradient(135deg,#00a86b,#00c47d);color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,168,107,0.3)">▶ '+(isHe?"התחל תוכנית":"Start Program")+'</button>';
  } else {
    var done=(exercises||[]).filter(function(_,idx){ return exChecked[idx]; }).length;
    html += '<div style="font-size:14px;font-weight:700;color:#00a86b">✓ '+done+' / '+exercises.length+' '+(isHe?"הושלמו":"done")+'</div>';
    html += '<button onclick="endWorkout()" style="background:#e74c3c;color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer">■ '+(isHe?"סיים":"Finish")+'</button>';
  }
  html += '</div>';

  html += exercises.map(function(e,i){
    var eIsHe;
    if(lng==="he"&&e.nameHe) eIsHe=true;
    else if(lng==="en"&&e.name) eIsHe=false;
    else eIsHe=e.displayLng==="he"||(!e.name&&e.nameHe);
    var eName=eIsHe&&e.nameHe?e.nameHe:(e.name||e.nameHe);
    var eDesc=eIsHe&&e.descHe?e.descHe:(e.desc||e.descHe);
    var eTips=eIsHe&&e.tipsHe?e.tipsHe:(e.tips||e.tipsHe);
    var checked=workoutMode&&exChecked[i];
    var cardStyle='direction:'+(eIsHe?"rtl":"ltr")+';transition:all 0.2s ease;';
    if(checked) cardStyle+='background:#f0fff8;border-color:#00a86b;opacity:0.8;';
    var card='<div class="xcard" style="'+cardStyle+'">';
    if(workoutMode){
      card+='<div style="display:flex;align-items:flex-start;gap:12px">';
      card+='<div onclick="toggleCheck('+i+')" style="width:28px;height:28px;border-radius:50%;border:2.5px solid '+(checked?'#00a86b':'#2B6CC4')+';background:'+(checked?'#00a86b':'transparent')+';display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-top:2px;transition:all 0.2s">'+(checked?'<span style="color:#fff;font-size:16px">✓</span>':'')+'</div>';
      card+='<div style="flex:1">';
    } else {
      card+='<div onclick="showExDetail('+i+')" style="cursor:pointer" onmouseover="this.parentElement.style.background=\'#e8f2ff\';this.parentElement.style.transform=\'translateY(-2px)\'" onmouseout="this.parentElement.style.background=\'\';this.parentElement.style.transform=\'\'">';
    }
    card+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'+bdg("#"+(i+1))+
      '<span style="font-weight:700;font-size:15px;color:'+(checked?'#00a86b':'#1a3a6e')+'">'+eName+'</span>';
    if(!workoutMode) card+='<span style="font-size:11px;color:#4a6a8a;margin-left:auto">tap for details →</span>';
    card+='</div>';
    card+='<div style="font-size:13px;color:#4a6a8a;margin-bottom:4px"><span style="font-weight:600;color:#2B6CC4">'+e.sets+'</span> &times; <span style="font-weight:600;color:#2B6CC4">'+e.reps+'</span> reps</div>';
    if(eDesc) card+='<div style="font-size:13px;color:#1a2535;margin-bottom:3px">'+eDesc+'</div>';
    if(eTips) card+='<div style="font-size:13px;color:#00a86b;margin-bottom:6px">💡 '+eTips+'</div>';
    if(workoutMode){
      var totalSets=parseInt(e.sets)||1;
      var doneKey="sets_"+i, timeKey="time_"+i;
      if(!exChecked[doneKey]) exChecked[doneKey]=0;
      if(!exChecked[timeKey]) exChecked[timeKey]=(e.timerSecs&&parseInt(e.timerSecs)>0)?e.timerSecs:30;
      var doneSets=exChecked[doneKey]||0, savedTime=exChecked[timeKey]||30;
      var tMin=Math.floor(savedTime/60), tSec=savedTime%60;
      card+='<div style="display:flex;justify-content:space-between;align-items:center;flex-direction:'+(eIsHe?'row-reverse':'row')+';gap:10px;flex-wrap:wrap;border-top:1px solid #f0f0f0;padding-top:10px">';
      card+='<div style="display:flex;align-items:center;gap:8px">'+
        '<div style="font-size:24px;font-weight:800;color:'+(doneSets>=totalSets?'#00a86b':'#2B6CC4')+'">'+doneSets+'/'+totalSets+'</div>'+
        '<div style="font-size:11px;color:#4a6a8a;line-height:1.3">'+(isHe?"סטים<br>הושלמו":"sets<br>done")+'</div>'+
        '<button onclick="exChecked[\'sets_'+i+'\']=Math.min('+totalSets+',(exChecked[\'sets_'+i+'\']||0)+1);renderPatientView(cur)" style="background:#00a86b;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:700;cursor:pointer">+'+(isHe?" סט":" Set")+'</button>'+
        (doneSets>0?'<button onclick="exChecked[\'sets_'+i+'\']=Math.max(0,(exChecked[\'sets_'+i+'\']||0)-1);renderPatientView(cur)" style="background:rgba(0,0,0,0.06);border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:13px">↩</button>':'')+'</div>';
      card+='<div style="display:flex;flex-direction:column;align-items:'+(eIsHe?'flex-start':'flex-end')+';gap:4px">'+
        '<button onclick="startTimer('+i+',((parseInt(document.getElementById(\'tmin'+i+'\').value)||0)*60)+(parseInt(document.getElementById(\'tsec'+i+'\').value)||0),'+i+')" id="tbtn'+i+'" style="background:#e67e22;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">⏱ '+(isHe?"טיימר":"Timer")+'</button>'+
        '<div style="display:flex;align-items:center;gap:3px;direction:ltr">'+
        '<input id="tmin'+i+'" type="number" min="0" max="60" value="'+tMin+'" onchange="exChecked[\'time_'+i+'\']=((parseInt(this.value)||0)*60)+(parseInt(document.getElementById(\'tsec'+i+'\').value)||0)" style="width:44px;padding:4px 5px;border:1.5px solid #e67e22;border-radius:7px;font-size:13px;font-weight:700;color:#e67e22;text-align:center">'+
        '<span style="color:#e67e22;font-weight:800;font-size:15px">:</span>'+
        '<input id="tsec'+i+'" type="number" min="0" max="59" value="'+tSec+'" onchange="exChecked[\'time_'+i+'\']=((parseInt(document.getElementById(\'tmin'+i+'\').value)||0)*60)+(parseInt(this.value)||0)" style="width:44px;padding:4px 5px;border:1.5px solid #e67e22;border-radius:7px;font-size:13px;font-weight:700;color:#e67e22;text-align:center">'+
        '</div>'+
        '<div id="tdisp'+i+'" style="font-size:24px;font-weight:800;color:#e67e22;display:none;min-width:60px;text-align:center"></div>'+
        '</div></div>';
    }
    card+='<a href="'+ytUrl(eName)+'" target="_blank" onclick="event.stopPropagation()" style="font-size:12px;color:#6d28d9;border:1px solid rgba(109,40,217,0.3);border-radius:5px;padding:4px 11px;text-decoration:none;font-weight:600;display:inline-block'+(workoutMode?';margin-top:8px':'')+'">'+(isHe?"צפה בסרטון":"Watch Video")+'</a>';
    card+='</div>';
    if(workoutMode) card+='</div>';
    card+='</div>';
    return card;
  }).join("");
  return html;
}

function renderPatientView(p){
  g("psh").innerHTML=
    '<div style="display:flex;align-items:center;gap:15px;margin-bottom:14px">'+legoAv(p,52)+
    '<div><div style="font-size:21px;font-weight:800;color:#1a3a6e">'+pn(p)+'</div>'+
    '<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+
    bdg(spName(p.sport))+
    (p.age?'<span style="background:#f0f5ff;color:#2B6CC4;border-radius:5px;padding:2px 8px;font-size:12px;font-weight:600;border:1px solid rgba(43,108,196,0.2)">'+(lng==="he"?"גיל":"Age")+' '+p.age+'</span>':"")+
    '</div></div></div>'+
    (p.injury?'<div style="background:rgba(43,108,196,0.08);border-radius:8px;padding:11px 15px;border-left:3px solid #2B6CC4;margin-bottom:8px">'+
    '<div style="font-size:11px;color:#2B6CC4;font-weight:700;text-transform:uppercase;margin-bottom:3px">'+L().ij+'</div>'+
    '<div style="font-size:14px;color:#1a2535">'+p.injury+'</div></div>':"")+
    (p.notes?'<div style="background:rgba(0,168,107,0.07);border-radius:8px;padding:11px 15px;border-left:3px solid #00a86b">'+
    '<div style="font-size:11px;color:#00a86b;font-weight:700;text-transform:uppercase;margin-bottom:3px">'+(lng==="he"?"המטרה שלי":"My Goal")+'</div>'+
    '<div style="font-size:14px;color:#1a2535">'+p.notes+'</div></div>':"");
  var isHe = lng==="he";
  var plans = p.workoutPlans||[];
  var totalPrograms = plans.length;
  // Also count flat exercises (legacy)
  var hasFlat = (p.exercises||[]).length>0 && plans.length===0;

  g("pstb").innerHTML=[
    ["ex", isHe?"תוכניות":"Programs", totalPrograms||(hasFlat?1:0)],
    ["fu",L().mn,(p.followUps||[]).length],
    ["hi",isHe?"היסטוריה":"History",(p.workoutHistory||[]).length],
    ["ap",isHe?"תורים":"Sessions",""]
  ].map(function(t){
    return '<button class="nb'+(ptab===t[0]?" on":"")+'" onclick="spt(\''+t[0]+'\')">'+t[1]+
      (t[2]!==''?' <span style="background:rgba(255,255,255,0.25);border-radius:9px;padding:1px 7px;font-size:11px">'+t[2]+'</span>':'')+
      '</button>';
  }).join("");

  // Build exercise/program HTML
  var exHtml = '';
  if(plans.length>0){
    // Show plan selector if no plan selected yet or if multiple plans
    var selPlan = plans.find(function(pl){ return pl.id===patientCurPlanId; })||plans[0];
    var selDay = null;
    var selPhaseIdx = 0;

    // Find selected day
    if(patientCurDayId && selPlan){
      if(selPlan.type==="periodized"){
        (selPlan.phases||[]).forEach(function(ph,pi){
          var found=(ph.days||[]).find(function(d){ return d.id===patientCurDayId; });
          if(found){ selDay=found; selPhaseIdx=pi; }
        });
      } else {
        selDay=(selPlan.days||[]).find(function(d){ return d.id===patientCurDayId; });
      }
    }
    if(!selDay){
      // Default to first day of first plan
      if(selPlan.type==="periodized"){ selDay=((selPlan.phases||[])[0]||{}).days&&(selPlan.phases[0].days[0]); }
      else { selDay=(selPlan.days||[])[0]; }
    }

    // Plan tabs (if multiple plans)
    if(plans.length>1){
      exHtml += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+
        plans.map(function(pl){
          var active=pl.id===selPlan.id;
          var pName=isHe&&pl.nameHe?pl.nameHe:pl.name;
          return '<button onclick="patientSelectPlan('+pl.id+')" style="padding:6px 12px;border-radius:8px;border:2px solid '+(active?'#2B6CC4':'#ddd')+';background:'+(active?'#2B6CC4':'#fff')+';color:'+(active?'#fff':'#1a3a6e')+';font-size:12px;font-weight:700;cursor:pointer">'+pName+'</button>';
        }).join("")+'</div>';
    }

    // Day tabs
    var dayTabs = '';
    if(selPlan.type==="periodized"){
      (selPlan.phases||[]).forEach(function(ph,pi){
        var phName=isHe&&ph.nameHe?ph.nameHe:ph.name;
        dayTabs += '<div style="margin-bottom:6px"><div style="font-size:10px;color:#4a6a8a;font-weight:600;margin-bottom:3px">'+phName+(ph.weeks?' · '+ph.weeks+(isHe?"שב'":"wk"):'')+'</div>'+
          (ph.days||[]).map(function(d){
            var active=selDay&&d.id===selDay.id;
            return '<button onclick="patientSelectDay('+selPlan.id+','+pi+','+d.id+')" style="padding:5px 11px;border-radius:7px;border:2px solid '+(active?'#2B6CC4':'#ddd')+';background:'+(active?'#2B6CC4':'#fff')+';color:'+(active?'#fff':'#1a3a6e')+';font-size:12px;font-weight:700;cursor:pointer;margin-right:4px;margin-bottom:4px">'+(isHe&&d.nameHe?d.nameHe:d.name)+'</button>';
          }).join("")+'</div>';
      });
    } else {
      dayTabs = (selPlan.days||[]).map(function(d){
        var active=selDay&&d.id===selDay.id;
        return '<button onclick="patientSelectDay('+selPlan.id+',0,'+d.id+')" style="padding:6px 14px;border-radius:8px;border:2px solid '+(active?'#2B6CC4':'#ddd')+';background:'+(active?'#2B6CC4':'#fff')+';color:'+(active?'#fff':'#1a3a6e')+';font-size:13px;font-weight:700;cursor:pointer">'+
          (isHe&&d.nameHe?d.nameHe:d.name)+'</button>';
      }).join("");
    }
    exHtml += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">'+dayTabs+'</div>';

    // Show exercises for selected day
    var dayExercises = selDay?(selDay.exercises||[]):[];
    exHtml += renderWorkoutExercises(dayExercises, selPlan, selDay, isHe);

  } else if(hasFlat){
    // Legacy flat exercises
    exHtml += renderWorkoutExercises(p.exercises||[], null, null, isHe);
  } else {
    exHtml = '<div style="color:#4a6a8a;font-size:14px;padding:20px;text-align:center">'+(isHe?"אין תוכניות אימון עדיין":"No workout programs yet")+'</div>';
  }

  g("psex").innerHTML = exHtml;

  g("psfu").innerHTML=(p.followUps||[]).length?(p.followUps||[]).map(function(f){
    return '<div class="xcard"><div style="font-size:12px;color:#2B6CC4;font-weight:600;margin-bottom:4px">'+f.date+'</div>'+
      '<div style="font-size:14px;color:#1a2535;line-height:1.7">'+f.note+'</div></div>';
  }).join(""):'<div style="color:#4a6a8a;font-size:14px;padding:14px 0">'+L().nf+'</div>';

  // History tab
  var hist = p.workoutHistory||[];
  g("pshi").innerHTML=hist.length?hist.map(function(h,i){
    var exRows = (h.exercises||[]).map(function(e){
      var n = isHe&&e.nameHe?e.nameHe:(e.name||e.nameHe||"");
      return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid #f5f5f5">'+
        '<span style="color:#1a2535">'+n+'</span>'+
        '<span style="color:#2B6CC4;font-weight:600">'+e.sets+' × '+e.reps+'</span></div>';
    }).join("");
    return '<div class="xcard" style="margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
      '<div style="font-size:14px;font-weight:700;color:#1a3a6e">'+h.date+'</div>'+
      '<div style="font-size:13px;color:#e67e22;font-weight:600">⏱ '+h.time+'</div></div>'+
      exRows+
      (h.note?'<div style="font-size:12px;color:#4a6a8a;margin-top:8px;font-style:italic">💬 '+h.note+'</div>':'')+
      '</div>';
  }).join(""):'<div style="color:#4a6a8a;font-size:14px;padding:14px 0;text-align:center">'+(isHe?"אין היסטוריה עדיין — סיים את האימון הראשון שלך!":"No history yet — complete your first workout!")+'</div>';

  spt(ptab);
}

function startWorkout(){
  workoutMode=true; exChecked={}; workoutStartTime=Date.now();
  renderPatientView(cur);
}

function endWorkout(){
  workoutMode=false; exChecked={};
  if(activeTimer){ clearInterval(activeTimer); activeTimer=null; }
  renderPatientView(cur);
}

function toggleCheck(i){
  exChecked[i] = !exChecked[i];
  // Get current exercises being worked on
  var exercises = getCurPatientExercises();
  var total = exercises.length;
  var done = exercises.filter(function(_,idx){ return exChecked[idx]; }).length;
  if(done === total && total > 0){
    renderPatientView(cur);
    setTimeout(function(){ showWorkoutComplete(exercises); }, 400);
  } else {
    renderPatientView(cur);
  }
}

function getCurPatientExercises(){
  var plans=cur.workoutPlans||[];
  if(plans.length>0){
    var plan=plans.find(function(p){ return p.id===patientCurPlanId; })||plans[0];
    if(plan){
      var days=plan.type==="periodized"?((plan.phases||[])[patientCurPhaseIdx]||{}).days||[]:plan.days||[];
      var day=days.find(function(d){ return d.id===patientCurDayId; })||days[0];
      return day?(day.exercises||[]):[];
    }
  }
  return cur.exercises||[];
}

function showWorkoutComplete(exercises){
  exercises = exercises || getCurPatientExercises();
  var isHe = lng==="he";
  var elapsed = workoutStartTime ? Math.round((Date.now()-workoutStartTime)/1000) : 0;
  var mins = Math.floor(elapsed/60), secs = elapsed%60;
  var timeStr = mins+"m "+secs+"s";
  var p = cur;
  var exList = exercises;
  var totalSets = exList.reduce(function(a,e){ return a+(parseInt(e.sets)||0); },0);
  var today = new Date().toLocaleDateString(isHe?"he-IL":"en-GB",{day:"2-digit",month:"short",year:"numeric"});

  // Build summary rows
  var rows = exList.map(function(e,i){
    var eName = isHe&&e.nameHe?e.nameHe:(e.name||e.nameHe);
    var doneSets = exChecked["sets_"+i]||parseInt(e.sets)||0;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f0f0f0;font-size:13px">'+
      '<span style="color:#1a2535;font-weight:600">'+eName+'</span>'+
      '<span style="color:#2B6CC4;font-weight:700">'+doneSets+' × '+e.reps+'</span>'+
      '</div>';
  }).join("");

  var c = g("MC");
  c.innerHTML =
    '<div style="text-align:center;padding:10px 0 16px">'+
    '<div style="font-size:52px;margin-bottom:8px">🎉</div>'+
    '<div style="font-size:22px;font-weight:800;color:#1a3a6e;margin-bottom:6px">'+
    (isHe?"כל הכבוד! סיימת את האימון!":"Great job! Workout complete!")+'</div>'+
    '<div style="font-size:14px;color:#4a6a8a;margin-bottom:16px">'+
    (isHe?"המשך לעבוד קשה — הגוף שלך מודה לך!":"Keep it up — your body thanks you!")+'</div>'+
    '</div>'+

    // Stats row
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">'+
    '<div style="background:#f0f5ff;border-radius:10px;padding:12px;text-align:center">'+
    '<div style="font-size:22px;font-weight:800;color:#2B6CC4">'+exList.length+'</div>'+
    '<div style="font-size:11px;color:#4a6a8a;text-transform:uppercase;font-weight:600">'+(isHe?"תרגילים":"Exercises")+'</div></div>'+
    '<div style="background:#fff0f5;border-radius:10px;padding:12px;text-align:center">'+
    '<div style="font-size:22px;font-weight:800;color:#e67e22">'+totalSets+'</div>'+
    '<div style="font-size:11px;color:#4a6a8a;text-transform:uppercase;font-weight:600">'+(isHe?"סטים":"Sets")+'</div></div>'+
    '<div style="background:#f0fff5;border-radius:10px;padding:12px;text-align:center">'+
    '<div style="font-size:18px;font-weight:800;color:#00a86b">'+timeStr+'</div>'+
    '<div style="font-size:11px;color:#4a6a8a;text-transform:uppercase;font-weight:600">'+(isHe?"זמן":"Time")+'</div></div>'+
    '</div>'+

    // Exercise summary
    '<div style="background:#f8fbff;border-radius:10px;padding:12px;margin-bottom:16px">'+
    '<div style="font-size:12px;font-weight:700;color:#1a3a6e;text-transform:uppercase;margin-bottom:8px">'+(isHe?"סיכום תרגילים":"Exercise Summary")+'</div>'+
    rows+'</div>'+

    // Motivational note input
    '<div style="margin-bottom:14px">'+
    '<label style="font-size:12px;font-weight:700;color:#4a6a8a;text-transform:uppercase;display:block;margin-bottom:5px">'+(isHe?"הערה אישית (אופציונלי)":"Personal note (optional)")+'</label>'+
    '<textarea id="workout_note" class="inp" dir="'+(isHe?"rtl":"ltr")+'" style="height:52px" placeholder="'+(isHe?"איך הרגשת? כאבים? שיפורים?":"How did it feel? Any pain? Improvements?")+'"></textarea>'+
    '</div>'+

    '<div style="display:flex;gap:8px">'+
    '<button class="btn btnd" onclick="cm();endWorkout()" style="flex:1">'+(isHe?"סגור":"Close")+'</button>'+
    '<button class="btn" onclick="saveWorkoutHistory()" style="flex:2;background:linear-gradient(135deg,#00a86b,#00c47d)">💾 '+(isHe?"שמור את האימון":"Save Workout")+'</button>'+
    '</div>';
  g("MB").classList.add("on");
}

function saveWorkoutHistory(){
  var isHe = lng==="he";
  var elapsed = workoutStartTime ? Math.round((Date.now()-workoutStartTime)/1000) : 0;
  var mins = Math.floor(elapsed/60), secs = elapsed%60;
  var p = cur;
  var note = g("workout_note")?g("workout_note").value.trim():"";
  var today = new Date().toISOString().split("T")[0];
  var exercises = getCurPatientExercises();
  var plans=p.workoutPlans||[];
  var planName="", dayName="";
  if(plans.length>0){
    var plan=plans.find(function(x){ return x.id===patientCurPlanId; })||plans[0];
    if(plan){
      planName=isHe&&plan.nameHe?plan.nameHe:plan.name;
      var days=plan.type==="periodized"?((plan.phases||[])[patientCurPhaseIdx]||{}).days||[]:plan.days||[];
      var day=days.find(function(d){ return d.id===patientCurDayId; })||days[0];
      if(day) dayName=isHe&&day.nameHe?day.nameHe:day.name;
    }
  }
  var entry = {
    date: today,
    time: mins+"m "+secs+"s",
    planName: planName,
    dayName: dayName,
    exercises: exercises.map(function(e,i){
      return { name:e.name, nameHe:e.nameHe, sets:exChecked["sets_"+i]||e.sets, reps:e.reps };
    }),
    note: note
  };
  if(!p.workoutHistory) p.workoutHistory=[];
  p.workoutHistory.unshift(entry);
  if(p.workoutHistory.length>50) p.workoutHistory=p.workoutHistory.slice(0,50);
  pts=pts.map(function(x){ return x.id===p.id?p:x; });
  lsave();
  // Save workout history via dedicated patient route (works without admin token)
  apiCall("patient-save-history","POST",{id:p.id, workoutHistory:p.workoutHistory},function(){});
  cm(); endWorkout();
  setTimeout(function(){
    var c=g("MC");
    c.innerHTML='<div style="text-align:center;padding:20px">'+
      '<div style="font-size:48px;margin-bottom:10px">✅</div>'+
      '<div style="font-size:18px;font-weight:800;color:#00a86b;margin-bottom:8px">'+(isHe?"האימון נשמר!":"Workout saved!")+'</div>'+
      '<div style="font-size:13px;color:#4a6a8a;margin-bottom:16px">'+(isHe?"תוכל לראות היסטוריה בלשונית ההיסטוריה":"You can view history in the History tab")+'</div>'+
      '<button class="btn" onclick="cm()" style="width:100%">OK</button></div>';
    g("MB").classList.add("on");
  },100);
}
function startTimer(idx, secs, exIdx){
  if(activeTimer){ clearInterval(activeTimer); activeTimer=null; }
  var s = parseInt(secs); if(!s||s<=0) s=30;
  // Save the patient's chosen time so it persists
  exChecked["time_"+exIdx] = s;
  var disp=g("tdisp"+idx), btn=g("tbtn"+idx);
  if(!disp) return;
  disp.style.display="block"; disp.style.color="#e67e22";
  if(btn){ btn.textContent="⏹ "+(lng==="he"?"עצור":"Stop"); btn.style.background="#e74c3c"; }
  var stopFn=function(){
    clearInterval(activeTimer); activeTimer=null; disp.style.display="none";
    if(btn){ btn.textContent="⏱ "+(lng==="he"?"טיימר":"Timer"); btn.style.background="#e67e22";
      btn.onclick=function(){ startTimer(idx,((parseInt(g("tmin"+idx)?g("tmin"+idx).value:0)||0)*60)+(parseInt(g("tsec"+idx)?g("tsec"+idx).value:0)||0),exIdx); }; }
  };
  if(btn) btn.onclick=stopFn;
  var tick=function(){
    var m=Math.floor(s/60), sec=s%60;
    disp.textContent=m+":"+(sec<10?"0":"")+sec;
    if(s<=0){
      clearInterval(activeTimer); activeTimer=null;
      disp.textContent="✓ "+(lng==="he"?"סיום!":"Done!");
      disp.style.color="#00a86b";
      var dk="sets_"+exIdx; if(!exChecked[dk]) exChecked[dk]=0; exChecked[dk]++;
      try{ var ctx=new (window.AudioContext||window.webkitAudioContext)(); for(var b=0;b<3;b++){ var osc=ctx.createOscillator(),gain=ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value=880; gain.gain.value=0.3; osc.start(ctx.currentTime+b*0.3); osc.stop(ctx.currentTime+b*0.3+0.2); } }catch(e2){}
      setTimeout(function(){ renderPatientView(cur); }, 1200);
      return;
    }
    s--;
  };
  tick(); activeTimer=setInterval(tick,1000);
}

function spt(t){
  ptab=t;
  document.querySelectorAll("#pstb .nb").forEach(function(b,i){ b.classList.toggle("on",["ex","fu","hi","ap"][i]===t); });
  g("psex").classList.toggle("hid",t!=="ex");
  g("psfu").classList.toggle("hid",t!=="fu");
  g("pshi").classList.toggle("hid",t!=="hi");
  g("psap").classList.toggle("hid",t!=="ap");
  if(t==="ap") renderPatientAppts();
}
function renderPatientAppts(){
  var sec=g("psap"); if(!sec) return;
  var isHe=lng==="he";
  var today=fmtDate(new Date());
  function doRender(list){
    var future=list.filter(function(a){ return a.date>=today; }).sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });
    var past=list.filter(function(a){ return a.date<today; }).sort(function(a,b){ return (b.date+b.time).localeCompare(a.date+a.time); });
    if(!future.length&&!past.length){
      sec.innerHTML='<div style="text-align:center;padding:40px 0;color:#4a6a8a;font-size:14px">'+(isHe?"אין תורים קרובים":"No upcoming sessions")+'</div>';
      return;
    }
    function row(a,dim){
      var lo=isHe?"he-IL":"en-US";
      var dt=new Date(a.date+"T00:00:00");
      var dLabel=dt.toLocaleDateString(lo,{weekday:"long",day:"numeric",month:"long"});
      var end=a.end_time||addMinutes(a.time,60);
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px 15px;border-radius:10px;margin-bottom:8px;background:'+(dim?"#f9fafb":"#f0f6ff")+';border:1px solid '+(dim?"#e8ecf0":"#dbeafe")+(a.date===today?";box-shadow:0 0 0 2px #2B6CC440":"")+'">'
        +'<div style="width:44px;height:44px;border-radius:10px;background:'+(dim?"#e2e8f0":"#2B6CC4")+';display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">'
        +'<div style="font-size:16px;font-weight:800;color:'+(dim?"#6a8aaa":"#fff")+';line-height:1">'+dt.getDate()+'</div>'
        +'<div style="font-size:9px;font-weight:600;color:'+(dim?"#8aaabf":"rgba(255,255,255,0.8)")+';line-height:1">'+dt.toLocaleDateString(lo,{month:"short"})+'</div>'
        +'</div>'
        +'<div style="flex:1">'
        +'<div style="font-size:13px;font-weight:700;color:'+(dim?"#6a8aaa":"#1a3a6e")+'">'+dLabel+'</div>'
        +'<div style="font-size:12px;color:'+(dim?"#8aaabf":"#2B6CC4")+';margin-top:2px;font-weight:600">'+a.time+' – '+end+'</div>'
        +(a.notes?'<div style="font-size:11px;color:#6a8aaa;margin-top:2px">'+a.notes+'</div>':"")
        +'</div>'
        +(a.date===today?'<div style="font-size:10px;font-weight:700;color:#fff;background:#2B6CC4;border-radius:5px;padding:2px 7px">'+(isHe?"היום":"Today")+'</div>':"")
        +'</div>';
    }
    var html='';
    if(future.length){
      html+='<div style="font-size:11px;font-weight:700;color:#2B6CC4;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">'+(isHe?"תורים קרובים":"Upcoming Sessions")+'</div>';
      html+=future.map(function(a){ return row(a,false); }).join("");
    }
    if(past.length){
      html+='<div style="font-size:11px;font-weight:700;color:#9aabbf;text-transform:uppercase;letter-spacing:.8px;margin:16px 0 8px">'+(isHe?"ביקורים קודמים":"Past Sessions")+'</div>';
      html+=past.map(function(a){ return row(a,true); }).join("");
    }
    sec.innerHTML=html;
  }
  // Admin has appts already loaded; patient needs to fetch their own
  if(auth==="admin" && cur){
    doRender(appts.filter(function(a){ return a.patient_id==cur.id||a.patientId==cur.id; }));
  } else if(cur){
    sec.innerHTML='<div style="text-align:center;padding:30px;color:#4a6a8a;font-size:13px">'+(isHe?"טוען...":"Loading...")+'</div>';
    apiCall("patient-appts","POST",{patientId:cur.id},function(err,data){
      doRender(Array.isArray(data)?data:[]);
    });
  }
}

// ── Modals ──
function om(m, editId){
  mmode=m; var c=g("MC"); var Lx=L();
  if(m==="ap"||m==="ep"){
    var p=m==="ep"?cur:{};
    c.innerHTML='<div style="font-size:17px;font-weight:800;margin-bottom:18px;color:#1a3a6e">'+(m==="ap"?Lx.npt:Lx.ept)+'</div>'+
      '<div class="g2" style="gap:11px;margin-bottom:11px">'+
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.nm+'</label><input class="inp" id="fn" value="'+(p.name||"")+'"></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.nmhe+'</label><input class="inp" id="fnhe" value="'+(p.nameHe||"")+'" dir="rtl" placeholder="\u05e9\u05dd \u05d1\u05e2\u05d1\u05e8\u05d9\u05ea"></div>'+
      '<div><label class="lbl">'+Lx.ag+'</label><input class="inp" id="fa" type="number" value="'+(p.age||"")+'"></div>'+
      '<div><label class="lbl">'+Lx.ph+'</label><input class="inp" id="fph" value="'+(p.phone||"")+'"></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.ij+'</label><input class="inp" id="fij" value="'+(p.injury||"")+'"></div>'+
      '<div><label class="lbl">'+Lx.pi+'</label><input class="inp" id="fpi" maxlength="4" value="'+(p.pin||"")+'" placeholder="1234"></div>'+
      '<div><label class="lbl">'+Lx.st+'</label><select class="inp" id="fst">'+ST.map(function(s){ return '<option'+(p.status===s?" selected":"")+'>'+s+'</option>'; }).join("")+'</select></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.sp+'</label><select class="inp" id="fsp"><option value="">'+Lx.ss+'</option>'+getAllSports().map(function(s,i){ var allHe=getAllSportsHe(); var label=lng==="he"&&allHe[i]?allHe[i]:s; return '<option value="'+s+'"'+(p.sport===s?" selected":"")+'>'+label+'</option>'; }).join("")+'</select>'+
      '<div style="margin-top:5px"><button type="button" onclick="omManageSports()" style="font-size:11px;color:#2B6CC4;background:none;border:none;cursor:pointer;text-decoration:underline">⚙️ '+(lng==="he"?"נהל רשימת ספורט":"Manage sports list")+'</button></div></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">'+(lng==="he"?"המטרה שלי / My Goal":"My Goal / המטרה שלי")+'</label><textarea class="inp" id="fno" style="height:68px">'+(p.notes||"")+'</textarea></div></div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btnd" onclick="cm()">'+Lx.ca+'</button><button class="btn" onclick="sp2()">'+Lx.sa+'</button></div>';
  } else if(m==="ae"){
    // Find exercise in plan day first, then flat exercises
    var editEx = null;
    if(editId){
      var ed=cur._editingDay;
      if(ed){
        var pl=(cur.workoutPlans||[]).find(function(x){return x.id===ed.planId;});
        if(pl){
          var dys=pl.type==="periodized"?((pl.phases||[])[ed.phaseIdx]||{}).days||[]:pl.days||[];
          var dy=dys.find(function(d){return d.id===ed.dayId;});
          if(dy) editEx=(dy.exercises||[]).find(function(e){return Number(e.id)===Number(editId);});
        }
      }
      if(!editEx) editEx=(cur.exercises||[]).find(function(e){return Number(e.id)===Number(editId);});
    }
    c.innerHTML='<div style="font-size:17px;font-weight:800;margin-bottom:14px;color:#1a3a6e">'+(editEx?"✏️ Edit Exercise / ערוך תרגיל":Lx.ae)+'</div>'+
      '<div style="margin-bottom:10px;position:relative">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
      '<label class="lbl" style="margin:0">🔍 Search / חפש תרגיל</label>'+
      '<button onclick="g(\'fexlist\').innerHTML=\'\';g(\'fexsearch\').value=\'\'" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:13px;line-height:1;color:#666">✕</button>'+
      '</div>'+
      '<input class="inp" id="fexsearch" placeholder="e.g. dumbbell, squat, כתף..." oninput="filterEx(this.value)" autocomplete="off">'+
      '<div id="fexlist" style="max-height:180px;overflow-y:auto;border:1px solid rgba(43,108,196,0.2);border-radius:8px;margin-top:4px;background:#fff"></div>'+
      '</div>'+
      '<div class="g2" style="gap:10px;margin-bottom:11px">'+
      '<div style="grid-column:1/-1"><label class="lbl">Exercise Name (EN)</label><input class="inp" id="fen" placeholder="English name" value="'+(editEx?editEx.name:'')+'"></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">שם תרגיל (עברית)</label><input class="inp" id="fenhe" dir="rtl" placeholder="שם בעברית" value="'+(editEx&&editEx.nameHe?editEx.nameHe:'')+'"></div>'+
      '<div><label class="lbl">'+Lx.se+'</label><input class="inp" id="fse" value="'+(editEx?editEx.sets:'')+'"></div>'+
      '<div><label class="lbl">'+Lx.rp+' (or 0 for timer)</label><input class="inp" id="frp" value="'+(editEx?editEx.reps:'')+'"></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">⏱ Timer per set (seconds, 0 = use reps)</label><input class="inp" id="ftimer" type="number" min="0" placeholder="e.g. 30" value="'+(editEx&&editEx.timerSecs?editEx.timerSecs:'0')+'"></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">⚖️ Weight / Load (EN)</label><input class="inp" id="fde" placeholder="e.g. 20kg, bodyweight, resistance band" value="'+(editEx?editEx.desc:'')+'"></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">⚖️ משקל / עומס (עברית)</label><input class="inp" id="fdehe" dir="rtl" placeholder="לדוג׳ 20 ק״ג, משקל גוף" value="'+(editEx&&editEx.descHe?editEx.descHe:'')+'"></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">Tips (EN)</label><textarea class="inp" id="fti" style="height:44px">'+(editEx?editEx.tips:'')+'</textarea></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">טיפים (עברית)</label><textarea class="inp" id="ftihe" dir="rtl" style="height:44px">'+(editEx&&editEx.tipsHe?editEx.tipsHe:'')+'</textarea></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">Show patient in / הצג למטופל ב</label>'+
      '<div style="display:flex;gap:8px;margin-top:4px">'+
      '<button id="lng-en" onclick="setExLng(\'en\')" style="flex:1;padding:8px;border-radius:8px;border:2px solid '+((!editEx||editEx.displayLng!=='he')?'#2B6CC4':'#ddd')+';background:'+((!editEx||editEx.displayLng!=='he')?'rgba(43,108,196,0.1)':'#fff')+';cursor:pointer;font-weight:600;color:#1a3a6e">🇺🇸 English</button>'+
      '<button id="lng-he" onclick="setExLng(\'he\')" style="flex:1;padding:8px;border-radius:8px;border:2px solid '+(editEx&&editEx.displayLng==='he'?'#2B6CC4':'#ddd')+';background:'+(editEx&&editEx.displayLng==='he'?'rgba(43,108,196,0.1)':'#fff')+';cursor:pointer;font-weight:600;color:#1a3a6e">🇮🇱 עברית</button>'+
      '</div><input type="hidden" id="fdlng" value="'+(editEx&&editEx.displayLng?editEx.displayLng:'en')+'"></div></div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btnd" onclick="cm()">'+Lx.ca+'</button>'+
      '<button class="btn" onclick="se2('+(editEx?editEx.id:'null')+')">'+Lx.sa+'</button></div>';
    g("_eid") || (function(){ var h=document.createElement("input"); h.type="hidden"; h.id="_eid"; h.value=editId||""; c.appendChild(h); })();
  } else if(m==="af"){
    var td=new Date().toISOString().split("T")[0];
    c.innerHTML='<div style="font-size:17px;font-weight:800;margin-bottom:18px;color:#1a3a6e">'+Lx.an+'</div>'+
      '<label class="lbl" style="margin-bottom:5px">'+Lx.dt+'</label><input class="inp" id="fdt" type="date" value="'+td+'" style="margin-bottom:14px">'+
      '<label class="lbl" style="margin-bottom:5px">'+Lx.nt+'</label><textarea class="inp" id="fnt" style="height:100px" placeholder="'+Lx.np2+'"></textarea>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button class="btn btnd" onclick="cm()">'+Lx.ca+'</button><button class="btn" onclick="sfu()">'+Lx.sa+'</button></div>';
  }
  g("MB").classList.add("on");
}
function cm(){ g("MB").classList.remove("on"); }

// ── Bilingual Exercise Library ──
var EX_LIB = [
  // CORE
  {name:"Dead Bug",nameHe:"חרק מת",desc:"Lie on back, arms up, legs at 90°. Lower opposite arm/leg keeping core stable.",descHe:"שכב על הגב, ידיים למעלה, רגליים ב-90°. הורד יד ורגל מנוגדות תוך שמירה על יציבות הליבה.",tips:"Keep lower back pressed to floor.",tipsHe:"שמור גב תחתון לחוץ לרצפה."},
  {name:"Plank",nameHe:"פלאנק",desc:"Hold push-up position on forearms, body in straight line.",descHe:"החזק עמדת שכיבה סומך על אמות, גוף בקו ישר.",tips:"Breathe steadily, don't hold breath.",tipsHe:"נשום בקביעות, אל תחסום נשימה."},
  {name:"Side Plank",nameHe:"פלאנק צידי",desc:"Support body on forearm and side of foot, keep body straight.",descHe:"תמוך בגוף על האמה וצד כף הרגל, שמור גוף ישר.",tips:"Don't let hips drop.",tipsHe:"אל תתן לירכיים לרדת."},
  {name:"Bird Dog",nameHe:"ציפור-כלב",desc:"On hands and knees, extend opposite arm and leg simultaneously.",descHe:"על ידיים וברכיים, הרחב יד ורגל מנוגדות בו זמנית.",tips:"Keep back flat, move slowly.",tipsHe:"שמור גב שטוח, זוז לאט."},
  {name:"Pallof Press",nameHe:"לחיצת פאלוף",desc:"Anti-rotation core exercise with band or cable.",descHe:"תרגיל ליבה נגד סיבוב עם גומייה או כבל.",tips:"Keep hips square, press straight out.",tipsHe:"שמור ירכיים ישרות, לחץ ישר קדימה."},
  {name:"Hollow Body Hold",nameHe:"החזקת גוף חלול",desc:"Lie on back, press lower back down, raise arms and legs slightly off floor.",descHe:"שכב על הגב, לחץ גב תחתון למטה, הרם ידיים ורגליים מעט.",tips:"If too hard, bend knees slightly.",tipsHe:"אם קשה מדי, כופף ברכיים מעט."},
  {name:"Russian Twist",nameHe:"סיבוב רוסי",desc:"Sit with knees bent, lean back slightly, rotate torso side to side.",descHe:"שב עם ברכיים כפופות, הישען מעט אחורה, סובב גוף מצד לצד.",tips:"Keep chest tall throughout.",tipsHe:"שמור חזה גבוה לאורך כל התרגיל."},
  {name:"Ab Wheel Rollout",nameHe:"גלגל בטן",desc:"Kneel with wheel, roll forward slowly keeping core tight.",descHe:"כרע עם הגלגל, גלגל קדימה לאט תוך שמירה על ליבה מכווצת.",tips:"Don't let hips sag.",tipsHe:"אל תתן לירכיים להתכופף."},
  // LOWER BODY
  {name:"Squat",nameHe:"סקוואט",desc:"Feet shoulder-width, lower as if sitting on a chair.",descHe:"רגליים ברוחב כתפיים, רד כאילו יושב על כיסא.",tips:"Knees over toes, chest up.",tipsHe:"ברכיים מעל אצבעות, חזה למעלה."},
  {name:"Barbell Back Squat",nameHe:"סקוואט עם מוט על הגב",desc:"Bar on upper back, squat to parallel or below.",descHe:"מוט על הגב העליון, רד לעד מקביל לרצפה.",tips:"Keep bar over mid-foot.",tipsHe:"שמור מוט מעל אמצע כף הרגל."},
  {name:"Goblet Squat",nameHe:"סקוואט גביע",desc:"Hold dumbbell at chest, squat keeping elbows inside knees.",descHe:"אחוז משקולת בחזה, רד לסקוואט תוך שמירה על מרפקים מבפנים לברכיים.",tips:"Great for beginners and mobility.",tipsHe:"מצוין למתחילים ולגמישות."},
  {name:"Lunge",nameHe:"לאנג'",desc:"Step forward, lower back knee toward floor, return to start.",descHe:"צעד קדימה, הורד ברך אחורית לכיוון הרצפה, חזור.",tips:"Keep front knee behind toe.",tipsHe:"שמור ברך קדמית מאחורי בוהן."},
  {name:"Reverse Lunge",nameHe:"לאנג' הפוך",desc:"Step backward into lunge, return to standing.",descHe:"צעד אחורה ללאנג', חזור לעמידה.",tips:"Easier on the knees than forward lunge.",tipsHe:"קל יותר על הברכיים מלאנג' קדימה."},
  {name:"Bulgarian Split Squat",nameHe:"סקוואט בולגרי",desc:"Rear foot elevated on bench, squat down on front leg.",descHe:"רגל אחורית מורמת על ספסל, רד על רגל קדמית.",tips:"Keep torso upright.",tipsHe:"שמור גו זקוף."},
  {name:"Glute Bridge",nameHe:"גשר ישבן",desc:"Lie on back, feet flat, push hips up squeezing glutes.",descHe:"שכב על הגב, כפות רגליים שטוחות, דחוף ירכיים למעלה.",tips:"Hold 2 seconds at top.",tipsHe:"החזק 2 שניות בראש."},
  {name:"Hip Thrust",nameHe:"דחיפת ירכיים",desc:"Shoulders on bench, bar on hips, thrust hips upward.",descHe:"כתפיים על ספסל, מוט על ירכיים, דחוף ירכיים למעלה.",tips:"Squeeze glutes hard at top.",tipsHe:"כווץ ישבן חזק בראש התנועה."},
  {name:"Clamshell",nameHe:"צדפה",desc:"Side lying knees bent, open top knee like a clamshell.",descHe:"שכיבה על הצד ברכיים כפופות, פתח ברך עליונה.",tips:"Keep feet together.",tipsHe:"שמור כפות רגליים יחד."},
  {name:"Hip Hinge",nameHe:"ציר ירך",desc:"Hinge forward from hips keeping spine neutral.",descHe:"כופף מהירכיים תוך שמירה על עמוד שדרה ניטרלי.",tips:"Push hips back, not down.",tipsHe:"דחוף ירכיים אחורה, לא למטה."},
  {name:"Romanian Deadlift",nameHe:"דדליפט רומני",desc:"Hold weights, hinge at hips lowering weights along legs.",descHe:"אחוז במשקולות, כופף בירכיים תוך הורדת משקולות לאורך הרגליים.",tips:"Feel hamstring stretch.",tipsHe:"הרגש מתיחה בירך אחורית."},
  {name:"Dumbbell Romanian Deadlift",nameHe:"דדליפט רומני עם משקולות",desc:"Same as RDL but with dumbbells for more range of motion.",descHe:"כמו דדליפט רומני אבל עם משקולות לטווח תנועה גדול יותר.",tips:"Let dumbbells travel close to legs.",tipsHe:"תן למשקולות לנסוע קרוב לרגליים."},
  {name:"Conventional Deadlift",nameHe:"דדליפט קונבנציונלי",desc:"Lift barbell from floor, drive hips forward to standing.",descHe:"הרם מוט מהרצפה, דחוף ירכיים קדימה לעמידה.",tips:"Keep bar close to body.",tipsHe:"שמור מוט קרוב לגוף."},
  {name:"Sumo Deadlift",nameHe:"דדליפט סומו",desc:"Wide stance, grip inside legs, lift with hips and legs.",descHe:"עמידה רחבה, אחיזה בין הרגליים, הרם עם ירכיים ורגליים.",tips:"Push knees out over toes.",tipsHe:"דחוף ברכיים החוצה מעל אצבעות."},
  {name:"Step Up",nameHe:"עלייה על מדרגה",desc:"Step up onto platform leading with one foot.",descHe:"עלה על פלטפורמה עם רגל אחת.",tips:"Drive through the heel.",tipsHe:"דחוף דרך העקב."},
  {name:"Wall Sit",nameHe:"ישיבת קיר",desc:"Slide down wall until thighs parallel to floor, hold.",descHe:"החלק גב על קיר עד שהירכיים מקבילות לרצפה, החזק.",tips:"Keep back flat against wall.",tipsHe:"שמור גב שטוח על הקיר."},
  {name:"Calf Raises",nameHe:"הרמות עגל",desc:"Rise up on toes, lower slowly.",descHe:"עלה על בהונות, רד לאט.",tips:"Full range up and down.",tipsHe:"טווח תנועה מלא."},
  {name:"Single Leg Calf Raise",nameHe:"הרמת עגל רגל אחת",desc:"Stand on one foot, raise and lower heel.",descHe:"עמוד על רגל אחת, הרם והורד עקב.",tips:"Hold wall for balance if needed.",tipsHe:"אחוז בקיר לשיווי משקל אם צריך."},
  {name:"Leg Press",nameHe:"לחיצת רגליים במכונה",desc:"Push platform away using legs on leg press machine.",descHe:"דחוף פלטפורמה עם הרגליים במכונת לחיצת רגליים.",tips:"Don't lock knees at top.",tipsHe:"אל תנעל ברכיים בראש התנועה."},
  {name:"Leg Extension",nameHe:"פשיטת רגל במכונה",desc:"Extend knees against resistance on machine.",descHe:"פשוט ברכיים כנגד התנגדות במכונה.",tips:"Slow lowering phase.",tipsHe:"הורדה איטית."},
  {name:"Hamstring Curl",nameHe:"כפיפת ירך אחורית",desc:"Curl heel toward glutes against resistance.",descHe:"כופף עקב לכיוון ישבן כנגד התנגדות.",tips:"Keep hips down.",tipsHe:"שמור ירכיים למטה."},
  {name:"Straight Leg Raise",nameHe:"הרמת רגל ישרה",desc:"Lie on back, raise straight leg to height of bent knee.",descHe:"שכב על הגב, הרם רגל ישרה לגובה ברך כפופה.",tips:"Tighten quad before lifting.",tipsHe:"כווץ ארבע-ראשי לפני ההרמה."},
  {name:"Quad Set",nameHe:"כיווץ ארבע ראשי",desc:"Sit with leg straight, tighten quad pushing knee down.",descHe:"שב עם רגל ישרה, כווץ ארבע-ראשי תוך לחיצת ברך למטה.",tips:"Hold 5 seconds each rep.",tipsHe:"החזק 5 שניות בכל חזרה."},
  {name:"Heel Slides",nameHe:"החלקות עקב",desc:"Lie on back, slide heel toward glutes bending knee.",descHe:"שכב על הגב, החלק עקב לכיוון ישבן תוך כפיפת ברך.",tips:"Slide slowly and controlled.",tipsHe:"החלק לאט ובשליטה."},
  {name:"Terminal Knee Extension",nameHe:"פשיטת ברך סופית",desc:"Band behind knee, straighten knee against resistance.",descHe:"גומייה מאחורי הברך, פשוט ברך כנגד התנגדות.",tips:"Great for knee rehab.",tipsHe:"מצוין לשיקום ברך."},
  {name:"Ankle Pumps",nameHe:"משאבות קרסול",desc:"Pump foot up and down at ankle to improve circulation.",descHe:"זוז עם כף הרגל למעלה ולמטה בקרסול לשיפור זרימת דם.",tips:"Do slowly and rhythmically.",tipsHe:"עשה לאט ובקצב."},
  // UPPER BODY - PUSH
  {name:"Push Up",nameHe:"שכיבות סמיכה",desc:"Lower chest to floor and push back up keeping body straight.",descHe:"הורד חזה לרצפה ודחוף חזרה למעלה תוך שמירה על גוף ישר.",tips:"Keep core tight throughout.",tipsHe:"שמור ליבה מכווצת לאורך כל התרגיל."},
  {name:"Incline Push Up",nameHe:"שכיבות סמיכה בשיפוע",desc:"Hands on elevated surface, perform push up.",descHe:"ידיים על משטח מורם, בצע שכיבות סמיכה.",tips:"Easier than regular push up.",tipsHe:"קל יותר משכיבות סמיכה רגילות."},
  {name:"Shoulder Press",nameHe:"לחיצת כתפיים",desc:"Press weights overhead from shoulder level.",descHe:"לחץ משקולות מעל הראש מגובה כתפיים.",tips:"Don't arch lower back.",tipsHe:"אל תכופף גב תחתון."},
  {name:"Dumbbell Shoulder Press",nameHe:"לחיצת כתפיים עם משקולות",desc:"Press dumbbells overhead from shoulder level.",descHe:"לחץ משקולות מעל הראש מגובה כתפיים.",tips:"Palms face forward.",tipsHe:"כפות ידיים פונות קדימה."},
  {name:"Barbell Overhead Press",nameHe:"לחיצת מוט מעל הראש",desc:"Press barbell from shoulders to overhead.",descHe:"לחץ מוט מהכתפיים למעל הראש.",tips:"Brace core, don't lean back.",tipsHe:"כווץ ליבה, אל תישען אחורה."},
  {name:"Lateral Raise",nameHe:"הרמה לצד",desc:"Raise dumbbells out to sides to shoulder height.",descHe:"הרם משקולות לצדדים לגובה הכתפיים.",tips:"Slight bend in elbow, lead with elbow.",tipsHe:"כפיפה קלה במרפק, הוביל עם מרפק."},
  {name:"Front Raise",nameHe:"הרמה קדמית",desc:"Raise dumbbells straight in front to shoulder height.",descHe:"הרם משקולות ישר קדימה לגובה הכתפיים.",tips:"Control the lowering phase.",tipsHe:"שלוט בשלב ההורדה."},
  {name:"Arnold Press",nameHe:"לחיצת ארנולד",desc:"Start with palms facing you, rotate out as you press up.",descHe:"התחל עם כפות ידיים פונות אליך, סובב החוצה תוך לחיצה למעלה.",tips:"Full rotation through range.",tipsHe:"סיבוב מלא דרך הטווח."},
  {name:"Chest Press",nameHe:"לחיצת חזה",desc:"Push resistance away from chest, extending arms.",descHe:"דחוף התנגדות מהחזה, הארך ידיים.",tips:"Control both directions.",tipsHe:"שלוט בשני הכיוונים."},
  {name:"Barbell Bench Press",nameHe:"לחיצת ספסל עם מוט",desc:"Lower bar to chest and press back up.",descHe:"הורד מוט לחזה ולחץ חזרה למעלה.",tips:"Feet flat, arch slightly, bar over nipples.",tipsHe:"רגליים שטוחות, קשת קלה, מוט מעל הפטמות."},
  {name:"Dumbbell Bench Press",nameHe:"לחיצת ספסל עם משקולות",desc:"Press dumbbells from chest to full arm extension.",descHe:"לחץ משקולות מהחזה לפשיטת זרוע מלאה.",tips:"Greater range of motion than barbell.",tipsHe:"טווח תנועה גדול יותר ממוט."},
  {name:"Incline Bench Press",nameHe:"לחיצת ספסל בשיפוע חיובי",desc:"Press at incline angle targeting upper chest.",descHe:"לחץ בזווית שיפוע המכוונת לחזה עליון.",tips:"30-45 degree incline.",tipsHe:"שיפוע 30-45 מעלות."},
  {name:"Dumbbell Flye",nameHe:"פרפר עם משקולות",desc:"Lie on bench, open arms wide and bring together over chest.",descHe:"שכב על ספסל, פתח ידיים רחב והבא אותם יחד מעל החזה.",tips:"Slight bend in elbows throughout.",tipsHe:"כפיפה קלה במרפקים לאורך כל התרגיל."},
  {name:"Cable Chest Flye",nameHe:"פרפר חזה בכבל",desc:"Pull cables from wide position to center of chest.",descHe:"משוך כבלים ממצב רחב למרכז החזה.",tips:"Squeeze at center, control return.",tipsHe:"כווץ במרכז, שלוט בחזרה."},
  {name:"Tricep Dips",nameHe:"מתח שלישיות",desc:"Lower and raise body using parallel bars or bench.",descHe:"הורד והרם גוף באמצעות מוטות מקבילים או ספסל.",tips:"Lean forward for chest, upright for triceps.",tipsHe:"הישען קדימה לחזה, זקוף לשלישיות."},
  {name:"Tricep Pushdown",nameHe:"לחיצת שלישיות למטה",desc:"Push cable bar down extending elbows.",descHe:"לחץ מוט כבל למטה תוך פשיטת מרפקים.",tips:"Keep elbows fixed at sides.",tipsHe:"שמור מרפקים קבועים בצדדים."},
  {name:"Skull Crusher",nameHe:"מרסק גולגולת",desc:"Lower barbell to forehead, extend arms back up.",descHe:"הורד מוט למצח, הארך ידיים חזרה למעלה.",tips:"Keep upper arms perpendicular to floor.",tipsHe:"שמור זרועות עליונות ניצבות לרצפה."},
  {name:"Overhead Tricep Extension",nameHe:"פשיטת שלישיות מעל הראש",desc:"Extend dumbbell overhead, lower behind head, press up.",descHe:"הארך משקולת מעל הראש, הורד מאחורי הראש, לחץ למעלה.",tips:"Keep elbows close to head.",tipsHe:"שמור מרפקים קרובים לראש."},
  // UPPER BODY - PULL
  {name:"Pull Up",nameHe:"מתח",desc:"Hang from bar, pull body up until chin over bar.",descHe:"תלה מהמוט, משוך גוף למעלה עד שסנטר מעל המוט.",tips:"Full dead hang to start each rep.",tipsHe:"תלייה מלאה בתחילת כל חזרה."},
  {name:"Lat Pulldown",nameHe:"משיכת לט",desc:"Pull bar down to upper chest squeezing lats.",descHe:"משוך מוט למטה לחזה עליון תוך כיווץ שרירי הגב.",tips:"Lean back slightly, pull with elbows.",tipsHe:"הישען מעט אחורה, משוך עם המרפקים."},
  {name:"Seated Cable Row",nameHe:"חתירה בכבל ישיבה",desc:"Pull cable to abdomen squeezing shoulder blades.",descHe:"משוך כבל לבטן תוך כיווץ שכמיות.",tips:"Keep torso upright, squeeze at end.",tipsHe:"שמור גו זקוף, כווץ בסוף."},
  {name:"Barbell Row",nameHe:"חתירה עם מוט",desc:"Bent over, pull barbell to lower chest/abdomen.",descHe:"כפוף קדימה, משוך מוט לחזה תחתון/בטן.",tips:"Keep back flat, squeeze shoulder blades.",tipsHe:"שמור גב שטוח, כווץ שכמיות."},
  {name:"Dumbbell Row",nameHe:"חתירה עם משקולת",desc:"One hand on bench, row dumbbell to hip.",descHe:"יד אחת על ספסל, משוך משקולת לירך.",tips:"Elbow close to body, squeeze at top.",tipsHe:"מרפק קרוב לגוף, כווץ בראש."},
  {name:"Cable Row",nameHe:"חתירה בכבל",desc:"Pull cable toward abdomen keeping torso stable.",descHe:"משוך כבל לכיוון הבטן תוך שמירה על יציבות הגו.",tips:"Don't lean back to pull.",tipsHe:"אל תישען אחורה כדי למשוך."},
  {name:"Face Pull",nameHe:"משיכת פנים",desc:"Pull rope attachment to face level, external rotate at end.",descHe:"משוך חיבור חבל לגובה הפנים, סובב חיצונית בסוף.",tips:"Great for shoulder health.",tipsHe:"מצוין לבריאות הכתף."},
  {name:"Bicep Curl",nameHe:"כפיפת מרפק דו-ראשי",desc:"Curl weights from hip to shoulder.",descHe:"כפוף משקולות מהירך לכתף.",tips:"Keep elbows fixed at sides.",tipsHe:"שמור מרפקים קבועים בצדדים."},
  {name:"Barbell Bicep Curl",nameHe:"כפיפת מרפק עם מוט",desc:"Curl barbell from thighs to shoulders.",descHe:"כפוף מוט מהירכיים לכתפיים.",tips:"Don't swing, strict form.",tipsHe:"אל תנדנד, טופס קפדני."},
  {name:"Dumbbell Bicep Curl",nameHe:"כפיפת מרפק עם משקולות",desc:"Curl dumbbells alternating or together.",descHe:"כפוף משקולות לסירוגין או יחד.",tips:"Supinate at top for full contraction.",tipsHe:"סובב כלפי חוץ בראש לכיווץ מלא."},
  {name:"Hammer Curl",nameHe:"כפיפת פטיש",desc:"Curl with neutral grip (palms facing each other).",descHe:"כפיפה עם אחיזה ניטרלית (כפות ידיים פונות זו לזו).",tips:"Works brachialis and brachioradialis.",tipsHe:"עובד על ברכיאליס וברכיורדיאליס."},
  {name:"Preacher Curl",nameHe:"כפיפת ספסל הכומר",desc:"Curl on angled pad isolating the bicep.",descHe:"כפיפה על כרית משופעת לבידוד הדו-ראשי.",tips:"Full stretch at bottom.",tipsHe:"מתיחה מלאה בתחתית."},
  {name:"Concentration Curl",nameHe:"כפיפת ריכוז",desc:"Seated, elbow on inner thigh, curl dumbbell.",descHe:"ישיבה, מרפק על ירך פנימי, כפוף משקולת.",tips:"Squeeze hard at top.",tipsHe:"כווץ חזק בראש."},
  // SHOULDER REHAB
  {name:"Theraband External Rotation",nameHe:"סיבוב חיצוני עם תרבנד",desc:"Elbow at side, rotate arm outward against band.",descHe:"מרפק בצד, סובב זרוע החוצה כנגד גומייה.",tips:"Keep elbow fixed at side.",tipsHe:"שמור מרפק קבוע בצד."},
  {name:"Theraband Internal Rotation",nameHe:"סיבוב פנימי עם תרבנד",desc:"Elbow at side, rotate arm inward against band.",descHe:"מרפק בצד, סובב זרוע פנימה כנגד גומייה.",tips:"Slow controlled movement.",tipsHe:"תנועה איטית ומבוקרת."},
  {name:"Shoulder External Rotation",nameHe:"סיבוב חיצוני כתף",desc:"90° abduction, rotate forearm upward.",descHe:"הרחקה ב-90°, סובב אמה למעלה.",tips:"Don't shrug shoulder.",tipsHe:"אל תרים כתף."},
  {name:"Wall Angels",nameHe:"מלאכי קיר",desc:"Stand against wall, raise and lower arms like snow angel.",descHe:"עמוד מול קיר, הרם והורד ידיים כמו מלאך שלג.",tips:"Keep back and wrists on wall.",tipsHe:"שמור גב ופרקי ידיים על הקיר."},
  {name:"Scapular Retraction",nameHe:"נסיגת שכמית",desc:"Squeeze shoulder blades together and hold.",descHe:"כווץ שכמיות יחד והחזק.",tips:"Hold 5 seconds, no shrugging.",tipsHe:"החזק 5 שניות, ללא הרמת כתפיים."},
  {name:"Prone Y-T-W",nameHe:"Y-T-W בשכיבה",desc:"Lie face down, raise arms in Y, T, and W positions.",descHe:"שכב פנים למטה, הרם ידיים בצורות Y, T ו-W.",tips:"Squeeze shoulder blades throughout.",tipsHe:"כווץ שכמיות לאורך כל התרגיל."},
  // KNEE REHAB
  {name:"Short Arc Quad",nameHe:"קשת קצרה ארבע-ראשי",desc:"Lie on back with roll under knee, extend knee to straight.",descHe:"שכב על הגב עם גליל מתחת לברך, פשוט ברך ישר.",tips:"Hold 5 seconds at top.",tipsHe:"החזק 5 שניות בראש."},
  {name:"Step Down",nameHe:"ירידה ממדרגה",desc:"Stand on step, slowly lower other foot to floor and back.",descHe:"עמוד על מדרגה, הורד רגל שנייה לאיטה לרצפה וחזור.",tips:"Control the descent.",tipsHe:"שלוט בירידה."},
  {name:"Terminal Knee Extension",nameHe:"פשיטת ברך סופית",desc:"Band behind knee, partial squat, fully straighten knee.",descHe:"גומייה מאחורי ברך, סקוואט חלקי, פשוט ברך לגמרי.",tips:"Focus on last 30° of extension.",tipsHe:"התמקד ב-30° האחרונות של פשיטה."},
  {name:"Knee CKC Extension",nameHe:"פשיטת ברך שרשרת סגורה",desc:"Squat partially against wall or with support.",descHe:"סקוואט חלקי מול קיר או עם תמיכה.",tips:"Pain-free range only.",tipsHe:"טווח ללא כאב בלבד."},
  {name:"Patellar Mobilization",nameHe:"גיוס פיקה",desc:"Gently move kneecap up, down and side to side.",descHe:"הזז פיקה בעדינות למעלה, למטה ומצד לצד.",tips:"Should not cause pain.",tipsHe:"לא אמור לגרום כאב."},
  // BACK REHAB
  {name:"Cat Cow",nameHe:"חתול-פרה",desc:"On hands and knees, alternate arching and rounding back.",descHe:"על ידיים וברכיים, חלופה בין קשת ועיגול הגב.",tips:"Move slowly with breathing.",tipsHe:"זוז לאט עם נשימה."},
  {name:"Child's Pose",nameHe:"תנוחת הילד",desc:"Kneel and stretch arms forward resting forehead on floor.",descHe:"כרע ומשוך ידיים קדימה תוך מנוחת מצח על הרצפה.",tips:"Hold 30-60 seconds.",tipsHe:"החזק 30-60 שניות."},
  {name:"McKenzie Extension",nameHe:"הארכת מקנזי",desc:"Lie face down, press up with arms leaving hips on floor.",descHe:"שכב פנים למטה, לחץ למעלה עם ידיים תוך השארת ירכיים על הרצפה.",tips:"For disc issues - check with physio.",tipsHe:"לבעיות דיסק - בדוק עם פיזיותרפיסט."},
  {name:"Knee to Chest Stretch",nameHe:"מתיחת ברך לחזה",desc:"Lie on back, pull one or both knees to chest.",descHe:"שכב על הגב, משוך ברך אחת או שתיהן לחזה.",tips:"Hold 30 seconds, breathe out.",tipsHe:"החזק 30 שניות, נשוף."},
  {name:"Lumbar Rotation Stretch",nameHe:"מתיחת סיבוב מותני",desc:"Lie on back, drop knees to one side, hold.",descHe:"שכב על הגב, הפל ברכיים לצד אחד, החזק.",tips:"Keep shoulders flat on floor.",tipsHe:"שמור כתפיים שטוחות על הרצפה."},
  {name:"Superman",nameHe:"סופרמן",desc:"Lie face down, raise arms and legs off floor simultaneously.",descHe:"שכב פנים למטה, הרם ידיים ורגליים בו זמנית.",tips:"Hold 2-3 seconds at top.",tipsHe:"החזק 2-3 שניות בראש."},
  // MOBILITY / FLEXIBILITY
  {name:"Hip Flexor Stretch",nameHe:"מתיחת כופף ירך",desc:"Lunge position, lower back knee, push hips forward.",descHe:"מצב לאנג', הורד ברך אחורית, דחוף ירכיים קדימה.",tips:"Hold 30 seconds each side.",tipsHe:"החזק 30 שניות כל צד."},
  {name:"Piriformis Stretch",nameHe:"מתיחת פיריפורמיס",desc:"Figure-4 stretch, cross ankle over knee, lean forward.",descHe:"מתיחת ספרה-4, הצלב קרסול מעל ברך, הישען קדימה.",tips:"Feel deep in glute.",tipsHe:"הרגש עמוק בישבן."},
  {name:"IT Band Stretch",nameHe:"מתיחת רצועת IT",desc:"Cross leg in front, lean to side.",descHe:"הצלב רגל קדימה, הישען לצד.",tips:"Hold 30 seconds.",tipsHe:"החזק 30 שניות."},
  {name:"Hamstring Stretch",nameHe:"מתיחת ירך אחורית",desc:"Lie on back, raise leg straight up, hold behind knee.",descHe:"שכב על הגב, הרם רגל ישרה למעלה, אחוז מאחורי הברך.",tips:"Don't force - breathe and relax.",tipsHe:"אל תכריח - נשום והרפה."},
  {name:"Calf Stretch",nameHe:"מתיחת שריר השוק",desc:"Stand at wall, one foot back, heel down, lean forward.",descHe:"עמוד ליד קיר, רגל אחת אחורה, עקב למטה, הישען קדימה.",tips:"Hold 30 seconds each side.",tipsHe:"החזק 30 שניות כל צד."},
  {name:"Thoracic Extension",nameHe:"הארכה חזית",desc:"Sit on chair or use foam roller to extend upper back.",descHe:"שב על כיסא או השתמש בגלגלת קצף להארכת גב עליון.",tips:"Keep head supported.",tipsHe:"שמור ראש נתמך."},
  {name:"Ankle Circles",nameHe:"עיגולי קרסול",desc:"Rotate foot in full circles at the ankle joint.",descHe:"סובב כף רגל בעיגולים מלאים במפרק הקרסול.",tips:"10 circles each direction.",tipsHe:"10 עיגולים בכל כיוון."},
  {name:"Foam Roll Quads",nameHe:"גלגול קצף לארבע-ראשי",desc:"Lie face down, roll front of thigh on foam roller.",descHe:"שכב פנים למטה, גלגל חלק קדמי ירך על גלגלת קצף.",tips:"Pause on tender spots 20-30 seconds.",tipsHe:"עצור על נקודות רגישות 20-30 שניות."},
  {name:"Foam Roll ITB",nameHe:"גלגול קצף לרצועת IT",desc:"Roll outer thigh from hip to knee.",descHe:"גלגל חלק חיצוני ירך מהירך לברך.",tips:"Go slowly.",tipsHe:"לאט לאט."},
  {name:"Foam Roll Upper Back",nameHe:"גלגול קצף לגב עליון",desc:"Lie on roller across upper back, support head, roll.",descHe:"שכב על גלגלת לרוחב הגב העליון, תמוך בראש, גלגל.",tips:"Arms crossed over chest.",tipsHe:"ידיים משולבות על החזה."},
  // BALANCE
  {name:"Single Leg Balance",nameHe:"איזון רגל אחת",desc:"Stand on one leg, maintain balance 30-60 seconds.",descHe:"עמוד על רגל אחת, שמור שיווי משקל 30-60 שניות.",tips:"Focus on a fixed point ahead.",tipsHe:"התמקד בנקודה קבועה קדימה."},
  {name:"Tandem Walking",nameHe:"הליכה טנדם",desc:"Walk in straight line placing heel directly in front of toe.",descHe:"הלך בקו ישר תוך הנחת עקב ישירות מול בוהן.",tips:"Arms out for balance.",tipsHe:"ידיים פרושות לשיווי משקל."},
  {name:"Bosu Ball Squat",nameHe:"סקוואט על כדור בוסו",desc:"Stand on flat side of Bosu, perform squat.",descHe:"עמוד על הצד השטוח של הבוסו, בצע סקוואט.",tips:"Start near wall for safety.",tipsHe:"התחל ליד קיר לבטיחות."},
  // CARDIO / FUNCTIONAL
  {name:"Walking",nameHe:"הליכה",desc:"Walk at comfortable pace, maintaining good posture.",descHe:"הלך בקצב נוח תוך שמירה על יציבה טובה.",tips:"Swing arms naturally.",tipsHe:"טלטל ידיים באופן טבעי."},
  {name:"Stationary Bike",nameHe:"אופניים נייחים",desc:"Cycle on stationary bike maintaining steady cadence.",descHe:"רכב על אופניים נייחים תוך שמירה על קצב קבוע.",tips:"Seat at hip height.",tipsHe:"מושב בגובה הירך."},
  {name:"Swimming",nameHe:"שחייה",desc:"Low impact full body exercise in water.",descHe:"פעילות גוף מלאה עם עומס נמוך במים.",tips:"Great for joint conditions.",tipsHe:"מצוין למצבי מפרקים."},
  {name:"Aqua Walking",nameHe:"הליכה במים",desc:"Walk in pool, water resistance reduces joint load.",descHe:"הלך בבריכה, התנגדות המים מפחיתה עומס מפרקים.",tips:"Water at waist level.",tipsHe:"מים ברמת המותניים."},
];

// ── Filter exercises for search ──
function filterEx(query){
  var q = query.toLowerCase().trim();
  var fullLib = EX_LIB.concat(loadCustomLib());
  var list = q ? fullLib.filter(function(e){
    return (e.name||"").toLowerCase().indexOf(q)>-1 ||
           (e.nameHe||"").indexOf(q)>-1 ||
           (e.desc||"").toLowerCase().indexOf(q)>-1 ||
           (e.descHe||"").indexOf(q)>-1;
  }) : fullLib;
  var box = g("fexlist");
  if(!box) return;
  if(!list.length){
    box.innerHTML='<div style="padding:8px;color:#999;font-size:13px">No results / אין תוצאות</div>';
    return;
  }
  box.innerHTML = list.map(function(e){
    var idx = EX_LIB.indexOf(e);
    var isCustom = idx===-1;
    if(isCustom){ idx = EX_LIB.length + loadCustomLib().indexOf(e); }
    return '<div onclick="selExFull('+JSON.stringify(e).replace(/"/g,"&quot;")+')" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:13px;display:flex;justify-content:space-between;align-items:center" '+
      'onmouseover="this.style.background=\'#f0f5fb\'" onmouseout="this.style.background=\'\'">'+
      '<span><span style="font-weight:600;color:#1a3a6e">'+e.name+'</span>'+
      '<span style="color:#888;margin:0 5px">/</span>'+
      '<span style="color:#4a6a8a">'+e.nameHe+'</span></span>'+
      (isCustom?'<span style="font-size:10px;background:#e8f0ff;color:#2B6CC4;border-radius:4px;padding:1px 5px">custom</span>':'')+
      '</div>';
  }).join("");
}

function selExFull(e){
  if(typeof e === "string") try{ e=JSON.parse(e); }catch(x){ return; }
  if(g("fen")) g("fen").value = e.name||"";
  if(g("fenhe")) g("fenhe").value = e.nameHe||"";
  if(g("fde")) g("fde").value = e.desc||"";
  if(g("fdehe")) g("fdehe").value = e.descHe||"";
  if(g("fti")) g("fti").value = e.tips||"";
  if(g("ftihe")) g("ftihe").value = e.tipsHe||"";
  var box = g("fexlist"); if(box) box.innerHTML="";
  var si = g("fexsearch"); if(si) si.value = (e.name||"")+" / "+(e.nameHe||"");
}
// ── Select exercise from library ──
function selEx(idx){
  var e = EX_LIB[idx];
  if(g("fen")) g("fen").value = e.name;
  if(g("fenhe")) g("fenhe").value = e.nameHe;
  if(g("fde")) g("fde").value = e.desc;
  if(g("fdehe")) g("fdehe").value = e.descHe;
  if(g("fti")) g("fti").value = e.tips;
  if(g("ftihe")) g("ftihe").value = e.tipsHe;
  // Hide dropdown after selection
  var box = g("fexlist");
  if(box) box.innerHTML="";
  var si = g("fexsearch");
  if(si) si.value = e.name+" / "+e.nameHe;
}

// ── Library Management ──
var CUSTOM_LIB_KEY = "ep_custom_lib";
function loadCustomLib(){ try{ return JSON.parse(localStorage.getItem(CUSTOM_LIB_KEY)||"[]"); }catch(e){ return []; } }
function saveCustomLib(arr){
  try{ localStorage.setItem(CUSTOM_LIB_KEY, JSON.stringify(arr)); }catch(e){}
  // Save to Supabase via worker - stored as a system setting, not a patient
  if(ADMIN_TOKEN) apiCall("save-custom-lib","POST",{lib:arr},function(){});
}
function getFullLib(){ return EX_LIB.concat(loadCustomLib()); }

// Load custom lib from Supabase on admin login (syncs across devices)
function syncCustomLib(){
  apiCall("load-custom-lib","GET",null,function(err,d){
    if(!err && d && d.lib && Array.isArray(d.lib) && d.lib.length>0){
      try{ localStorage.setItem(CUSTOM_LIB_KEY, JSON.stringify(d.lib)); }catch(e){}
    }
  });
}

function omLib(){
  var custom = loadCustomLib();
  var c = g("MC");
  c.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">📚 Exercise Library</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px;line-height:1">✕</button>'+
    '</div>'+
    '<div style="font-size:12px;color:#4a6a8a;margin-bottom:10px">Click any exercise to edit it. Changes save permanently.</div>'+
    '<button class="btn" style="width:100%;margin-bottom:12px;font-size:13px" onclick="omLibAdd(-1)">+ Add New Exercise to Library</button>'+
    // Custom exercises section
    (custom.length?'<div style="font-size:11px;font-weight:700;color:#2B6CC4;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">⭐ Your Custom Exercises ('+custom.length+')</div>'+
    custom.map(function(e,i){
      return '<div onclick="omLibEdit(\'custom\','+i+')" style="padding:9px 12px;background:#eef4ff;border:1px solid rgba(43,108,196,0.25);border-radius:8px;margin-bottom:5px;cursor:pointer;transition:background 0.2s" '+
        'onmouseover="this.style.background=\'#dbeafe\'" onmouseout="this.style.background=\'#eef4ff\'">'+
        '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<div><span style="font-weight:600;font-size:13px;color:#1a3a6e">'+e.name+'</span>'+
        (e.nameHe?'<span style="color:#888;margin:0 5px">/</span><span style="color:#4a6a8a;font-size:13px">'+e.nameHe+'</span>':'')+
        '</div><span style="font-size:11px;color:#2B6CC4">✏️ edit</span></div>'+
        (e.desc?'<div style="font-size:11px;color:#666;margin-top:3px">'+e.desc.substring(0,60)+(e.desc.length>60?'...':'')+'</div>':'')+
        '</div>';
    }).join(""):'') +
    // Built-in exercises section
    '<div style="font-size:11px;font-weight:700;color:#2a7a3a;margin:10px 0 6px;text-transform:uppercase;letter-spacing:0.5px">📋 Built-in Exercises ('+EX_LIB.length+')</div>'+
    '<div style="max-height:320px;overflow-y:auto">'+
    EX_LIB.map(function(e,i){
      return '<div onclick="omLibEdit(\'builtin\','+i+')" style="padding:8px 12px;background:#f8fbff;border:1px solid #e0eaf5;border-radius:8px;margin-bottom:4px;cursor:pointer;transition:background 0.2s" '+
        'onmouseover="this.style.background=\'#e8f0fb\'" onmouseout="this.style.background=\'#f8fbff\'">'+
        '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<div><span style="font-weight:600;font-size:13px;color:#1a3a6e">'+e.name+'</span>'+
        '<span style="color:#888;margin:0 5px">/</span><span style="color:#4a6a8a;font-size:13px">'+e.nameHe+'</span></div>'+
        '<span style="font-size:11px;color:#4a6a8a">✏️ edit</span></div>'+
        (e.desc?'<div style="font-size:11px;color:#666;margin-top:2px">'+e.desc.substring(0,55)+(e.desc.length>55?'...':'')+'</div>':'')+
        '</div>';
    }).join("")+
    '</div>';
  g("MB").classList.add("on");
}

// Edit any exercise in the library (builtin or custom)
function omLibEdit(type, idx){
  var e = type==="custom" ? loadCustomLib()[idx] : EX_LIB[idx];
  var c = g("MC");
  c.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:16px;font-weight:800;color:#1a3a6e">✏️ Edit Library Exercise</span>'+
    '<button onclick="omLib()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px;line-height:1">←</button>'+
    '</div>'+
    (type==="builtin"?'<div style="font-size:12px;color:#4a6a8a;background:#fff8e1;border-radius:6px;padding:8px 10px;margin-bottom:12px">Editing a built-in exercise. Changes apply to all patients who have this exercise.</div>':'')+
    '<div class="g2" style="gap:10px;margin-bottom:12px">'+
    '<div style="grid-column:1/-1"><label class="lbl">Name (EN)</label><input class="inp" id="lib_en" value="'+e.name+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">שם (עברית)</label><input class="inp" id="lib_he" dir="rtl" value="'+(e.nameHe||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">Description (EN)</label><textarea class="inp" id="lib_de" style="height:52px">'+(e.desc||'')+'</textarea></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">תיאור (HE)</label><textarea class="inp" id="lib_dhe" dir="rtl" style="height:52px">'+(e.descHe||'')+'</textarea></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">Tips (EN)</label><textarea class="inp" id="lib_ti" style="height:44px">'+(e.tips||'')+'</textarea></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">טיפים (HE)</label><textarea class="inp" id="lib_the" dir="rtl" style="height:44px">'+(e.tipsHe||'')+'</textarea></div></div>'+
    '<div style="display:flex;gap:8px;justify-content:space-between">'+
    '<button class="btn btnd" onclick="delLibEx2(\''+type+'\','+idx+')">🗑 Delete</button>'+
    '<div style="display:flex;gap:8px"><button class="btn btnd" onclick="omLib()">Cancel</button>'+
    '<button class="btn" onclick="saveLibEdit(\''+type+'\','+idx+')">Save Changes</button></div></div>';
}

function saveLibEdit(type, idx){
  var n=g("lib_en").value.trim(), nhe=g("lib_he").value.trim();
  if(!n&&!nhe){ alert("Enter at least one name."); return; }
  var updated={ name:n||nhe, nameHe:nhe||n, desc:g("lib_de").value.trim(), descHe:g("lib_dhe").value.trim(), tips:g("lib_ti").value.trim(), tipsHe:g("lib_the").value.trim() };
  if(type==="custom"){
    var custom=loadCustomLib(); custom[idx]=updated; saveCustomLib(custom);
  } else {
    // Override builtin exercise
    EX_LIB[idx]=Object.assign(EX_LIB[idx],updated);
  }
  // Propagate changes to ALL patients who have this exercise by name
  var origName = type==="custom" ? loadCustomLib()[idx]&&loadCustomLib()[idx].name : EX_LIB[idx].name;
  pts=pts.map(function(p){
    if(p.exercises){
      p.exercises=p.exercises.map(function(e){
        if(e.name===updated.name||e.name===origName||e.nameHe===updated.nameHe){
          return Object.assign({},e,{name:updated.name,nameHe:updated.nameHe,desc:updated.desc,descHe:updated.descHe,tips:updated.tips,tipsHe:updated.tipsHe});
        }
        return e;
      });
    }
    return p;
  });
  sv(); rex(); omLib();
}

function delLibEx2(type, idx){
  if(!confirm("Delete this exercise from the library?")) return;
  if(type==="custom"){ var c=loadCustomLib(); c.splice(idx,1); saveCustomLib(c); }
  // Can't delete built-in, just go back
  omLib();
}

function omLibAdd(customIdx){
  var custom = loadCustomLib();
  var ex = customIdx!==null ? custom[customIdx] : null;
  var c = g("MC");
  c.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:16px;font-weight:800;color:#1a3a6e">'+(ex?'✏️ Edit Exercise':'+ Add to Library')+'</span>'+
    '<button onclick="omLib()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px;line-height:1">←</button>'+
    '</div>'+
    '<div class="g2" style="gap:10px;margin-bottom:12px">'+
    '<div style="grid-column:1/-1"><label class="lbl">Name (English)</label><input class="inp" id="lib_en" value="'+(ex?ex.name:'')+'" placeholder="e.g. Bulgarian Split Squat"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">שם (עברית)</label><input class="inp" id="lib_he" dir="rtl" value="'+(ex?ex.nameHe:'')+'" placeholder="שם בעברית"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">Description (EN)</label><textarea class="inp" id="lib_de" style="height:52px">'+(ex?ex.desc:'')+'</textarea></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">תיאור (HE)</label><textarea class="inp" id="lib_dhe" dir="rtl" style="height:52px">'+(ex?ex.descHe:'')+'</textarea></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">Tips (EN)</label><textarea class="inp" id="lib_ti" style="height:44px">'+(ex?ex.tips:'')+'</textarea></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">טיפים (HE)</label><textarea class="inp" id="lib_the" dir="rtl" style="height:44px">'+(ex?ex.tipsHe:'')+'</textarea></div></div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end">'+
    '<button class="btn btnd" onclick="omLib()">Cancel</button>'+
    '<button class="btn" onclick="saveLibEx('+(customIdx!==null?customIdx:'null')+')">Save to Library</button></div>';
}

function saveLibEx(customIdx){
  var n=g("lib_en").value.trim(), nhe=g("lib_he").value.trim();
  if(!n&&!nhe){ alert("Enter at least one name."); return; }
  var e={ name:n||nhe, nameHe:nhe||n, desc:g("lib_de")?g("lib_de").value.trim():"", descHe:g("lib_dhe")?g("lib_dhe").value.trim():"", tips:g("lib_ti")?g("lib_ti").value.trim():"", tipsHe:g("lib_the")?g("lib_the").value.trim():"" };
  var custom = loadCustomLib();
  if(customIdx!==null && customIdx>=0){ custom[customIdx]=e; } else { custom.push(e); }
  saveCustomLib(custom);
  omLib();
}

function delLibEx(i){
  if(!confirm("Delete this custom exercise?")) return;
  var custom = loadCustomLib();
  custom.splice(i,1);
  saveCustomLib(custom);
  omLib();
}

// ── Exercise Detail Modal for Patient ──
function showExDetail(idx){
  var p = cur || pts.find(function(x){ return x.id===auth; });
  if(!p) return;
  var e = p.exercises[idx];
  if(!e) return;
  var isHe = (lng==="he" && e.nameHe) || (!e.name && e.nameHe);
  var eName = isHe ? (e.nameHe||e.name) : (e.name||e.nameHe);
  var eDesc = isHe ? (e.descHe||e.desc) : (e.desc||e.descHe);
  var eTips = isHe ? (e.tipsHe||e.tips) : (e.tips||e.tipsHe);
  var isFemale = Math.random() > 0.5;
  var skinColor = "#f4a47c";
  var hairColor = isFemale ? "#3d1f00" : "#2a2a2a";
  var shirtColor = "#2B6CC4";
  var pantsColor = "#1a3a6e";

  // Generate exercise-specific SVG animation
  var anim = getExerciseAnimation(e.name||e.nameHe||"", isFemale, skinColor, hairColor, shirtColor, pantsColor);

  var c = g("MC");
  c.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<span style="font-size:18px;font-weight:800;color:#1a3a6e">'+eName+'</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;flex-shrink:0">✕</button>'+
    '</div>'+
    // Animation + Muscle diagram side by side
    '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">'+
    '<div style="flex:1;min-width:160px;background:linear-gradient(135deg,#e8f2ff,#f0f8ff);border-radius:12px;padding:12px;text-align:center">'+
    '<div style="font-size:11px;font-weight:700;color:#2B6CC4;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Movement</div>'+
    anim+
    '</div>'+
    '<div style="flex:1;min-width:160px;background:linear-gradient(135deg,#fff0f0,#fff8f8);border-radius:12px;padding:12px;text-align:center">'+
    '<div style="font-size:11px;font-weight:700;color:#c0392b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Muscles Worked</div>'+
    getMuscleMap(e.name||e.nameHe||"")+
    '</div></div>'+
    // Details
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'+
    '<div style="background:#f0f5ff;border-radius:10px;padding:12px;text-align:center">'+
    '<div style="font-size:11px;color:#4a6a8a;text-transform:uppercase;font-weight:700">Sets × Reps</div>'+
    '<div style="font-size:22px;font-weight:800;color:#2B6CC4;margin-top:4px">'+e.sets+' × '+e.reps+'</div></div>'+
    '<div style="background:#f0fff5;border-radius:10px;padding:12px;text-align:center">'+
    '<div style="font-size:11px;color:#4a6a8a;text-transform:uppercase;font-weight:700">Difficulty</div>'+
    '<div style="font-size:18px;margin-top:4px">'+getExDifficulty(e.name||"")+'</div></div></div>'+
    (eDesc?'<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;color:#1a3a6e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">📋 How to perform</div>'+
    '<div style="font-size:13px;color:#1a2535;line-height:1.7;background:#f8fbff;padding:10px 13px;border-radius:8px;border-left:3px solid #2B6CC4">'+eDesc+'</div></div>':"")+
    (eTips?'<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;color:#00a86b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">💡 Tips</div>'+
    '<div style="font-size:13px;color:#1a2535;line-height:1.7;background:#f0fff5;padding:10px 13px;border-radius:8px;border-left:3px solid #00a86b">'+eTips+'</div></div>':"")+
    '<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;color:#2B6CC4;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">🎯 Benefits</div>'+
    '<div style="font-size:13px;color:#1a2535;line-height:1.7;background:#f8fbff;padding:10px 13px;border-radius:8px">'+getExBenefits(e.name||e.nameHe||"")+'</div></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'+
    '<div style="background:#fff8f0;border-radius:10px;padding:11px"><div style="font-size:11px;font-weight:700;color:#e67e22;text-transform:uppercase;margin-bottom:5px">✅ Good for</div>'+
    '<div style="font-size:12px;color:#1a2535;line-height:1.6">'+getExGoodFor(e.name||e.nameHe||"")+'</div></div>'+
    '<div style="background:#fff0f0;border-radius:10px;padding:11px"><div style="font-size:11px;font-weight:700;color:#e74c3c;text-transform:uppercase;margin-bottom:5px">⚠️ Avoid if</div>'+
    '<div style="font-size:12px;color:#1a2535;line-height:1.6">'+getExAvoid(e.name||e.nameHe||"")+'</div></div></div>'+
    '<div style="text-align:center"><a href="'+ytUrl(eName)+'" target="_blank" style="display:inline-block;background:#6d28d9;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">▶ Watch Video Tutorial</a></div>';

  g("MB").classList.add("on");
}

function getExDifficulty(name){
  var n=name.toLowerCase();
  if(n.includes("dead bug")||n.includes("ankle")||n.includes("heel slide")||n.includes("quad set")||n.includes("pump")) return "⭐ Beginner";
  if(n.includes("squat")||n.includes("lunge")||n.includes("bridge")||n.includes("plank")||n.includes("row")||n.includes("press")) return "⭐⭐ Intermediate";
  if(n.includes("deadlift")||n.includes("pull up")||n.includes("split")||n.includes("single")) return "⭐⭐⭐ Advanced";
  return "⭐⭐ Intermediate";
}

function getExBenefits(name){
  var n=name.toLowerCase();
  if(n.includes("squat")) return "Builds leg strength, improves knee stability, increases functional mobility for daily activities.";
  if(n.includes("deadlift")) return "Full posterior chain strength, hip hinge mechanics, real-world lifting patterns.";
  if(n.includes("plank")) return "Core stability, spinal protection, posture improvement, reduces back pain risk.";
  if(n.includes("bridge")||n.includes("thrust")) return "Glute activation, hip stability, lower back support, improved posture.";
  if(n.includes("lunge")) return "Single-leg strength, balance, hip flexibility, sport-specific movement.";
  if(n.includes("row")) return "Upper back strength, posture correction, shoulder blade stability.";
  if(n.includes("press")) return "Upper body pushing strength, shoulder stability, chest development.";
  if(n.includes("bird")||n.includes("dead bug")) return "Core stability, spinal alignment, coordination, injury prevention.";
  if(n.includes("calf")) return "Lower leg strength, ankle stability, pushoff power for walking and running.";
  if(n.includes("curl")) return "Muscle isolation, joint-specific strength, rehab progression.";
  return "Improves strength, stability, and movement quality in the target area.";
}

function getExGoodFor(name){
  var n=name.toLowerCase();
  if(n.includes("squat")||n.includes("lunge")) return "Knee rehab (late stage)\nLeg strengthening\nReturn to sport\nAthletes";
  if(n.includes("deadlift")) return "Back strengthening\nHip pain rehab\nStrength athletes\nPosture improvement";
  if(n.includes("plank")||n.includes("dead bug")||n.includes("bird")) return "Back pain prevention\nCore weakness\nAll fitness levels\nPost-surgery rehab";
  if(n.includes("bridge")||n.includes("clam")||n.includes("thrust")) return "Hip weakness\nKnee pain\nLower back rehab\nRunners & cyclists";
  if(n.includes("press")||n.includes("row")) return "Shoulder rehab\nPosture problems\nUpper body weakness\nOffice workers";
  if(n.includes("calf")||n.includes("ankle")) return "Ankle sprain rehab\nAchilles issues\nBalance training\nWalking improvement";
  return "General fitness\nRehab programs\nStrength building\nMovement improvement";
}

function getExAvoid(name){
  var n=name.toLowerCase();
  if(n.includes("squat")||n.includes("lunge")) return "Acute knee injury\nSevere arthritis\nRecent knee surgery (early stage)\nSevere hip pain";
  if(n.includes("deadlift")) return "Acute disc herniation\nRecent back surgery\nSevere osteoporosis\nWithout proper form";
  if(n.includes("plank")) return "Acute shoulder injury\nWrist problems\nHigh blood pressure (prolonged)\nPost-abdominal surgery";
  if(n.includes("bridge")||n.includes("thrust")) return "Acute hip injury\nSevere hip impingement\nRecent hip surgery";
  if(n.includes("press")) return "Acute shoulder impingement\nRotator cuff tear\nShoulder instability";
  if(n.includes("row")||n.includes("pull")) return "Acute shoulder injury\nElbow tendonitis\nWrist problems";
  return "Acute injury in target area\nSevere pain during movement\nWithout medical clearance";
}

function getMuscleMap(name){
  var n=name.toLowerCase();
  // Determine which muscles to highlight based on exercise
  var muscles={quads:false,hams:false,glutes:false,core:false,chest:false,back:false,shoulders:false,biceps:false,triceps:false,calves:false,hip:false};
  if(n.includes("squat")||n.includes("lunge")||n.includes("leg press")||n.includes("step")){ muscles.quads=true; muscles.glutes=true; muscles.core=true; }
  if(n.includes("deadlift")||n.includes("rdl")||n.includes("romanian")){ muscles.hams=true; muscles.glutes=true; muscles.back=true; muscles.core=true; }
  if(n.includes("bridge")||n.includes("thrust")||n.includes("clam")||n.includes("hip")){ muscles.glutes=true; muscles.hams=true; muscles.core=true; }
  if(n.includes("plank")||n.includes("dead bug")||n.includes("bird")||n.includes("pallof")||n.includes("hollow")||n.includes("russian")){ muscles.core=true; muscles.shoulders=true; }
  if(n.includes("press")&&(n.includes("bench")||n.includes("chest")||n.includes("push"))){ muscles.chest=true; muscles.triceps=true; muscles.shoulders=true; }
  if(n.includes("shoulder press")||n.includes("overhead")||n.includes("lateral")||n.includes("arnold")||n.includes("front raise")){ muscles.shoulders=true; muscles.triceps=true; }
  if(n.includes("row")||n.includes("pulldown")||n.includes("pull up")){ muscles.back=true; muscles.biceps=true; muscles.shoulders=true; }
  if(n.includes("curl")){ muscles.biceps=true; }
  if(n.includes("tricep")||n.includes("pushdown")||n.includes("dip")||n.includes("skull")){ muscles.triceps=true; }
  if(n.includes("calf")||n.includes("ankle")){ muscles.calves=true; }
  if(n.includes("hamstring")||n.includes("ham curl")){ muscles.hams=true; }
  if(n.includes("quad")||n.includes("straight leg")||n.includes("heel slide")||n.includes("quad set")){ muscles.quads=true; }
  if(n.includes("face pull")||n.includes("external")||n.includes("internal")||n.includes("y-t-w")||n.includes("wall angel")||n.includes("scapular")){ muscles.shoulders=true; muscles.back=true; }
  // If nothing matched, default to core
  if(!Object.values(muscles).some(Boolean)) muscles.core=true;

  var hi="#e74c3c", lo="#f8f8f8", outline="#ddd";
  return '<svg viewBox="0 0 160 280" width="140" height="220" xmlns="http://www.w3.org/2000/svg">'+
    // Body outline - front view simplified
    // Head
    '<ellipse cx="80" cy="22" rx="16" ry="18" fill="#f4a47c" stroke="#ccc" stroke-width="1"/>'+
    // Neck
    '<rect x="74" y="38" width="12" height="10" fill="#f4a47c"/>'+
    // Torso
    '<rect x="52" y="48" width="56" height="70" rx="8" fill="'+(muscles.core?hi:'#e0eaff')+'" stroke="'+outline+'" stroke-width="1"/>'+
    // Chest overlay
    (muscles.chest?'<ellipse cx="65" cy="62" rx="12" ry="10" fill="'+hi+'" opacity="0.7"/><ellipse cx="95" cy="62" rx="12" ry="10" fill="'+hi+'" opacity="0.7"/>':"")+
    // Shoulders
    '<ellipse cx="44" cy="58" rx="14" ry="12" fill="'+(muscles.shoulders?hi:'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    '<ellipse cx="116" cy="58" rx="14" ry="12" fill="'+(muscles.shoulders?hi:'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    // Upper arms / biceps+triceps
    '<rect x="28" y="66" width="18" height="44" rx="9" fill="'+(muscles.biceps?hi:muscles.triceps?"#f39c12":'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    '<rect x="114" y="66" width="18" height="44" rx="9" fill="'+(muscles.biceps?hi:muscles.triceps?"#f39c12":'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    // Forearms
    '<rect x="30" y="108" width="14" height="34" rx="7" fill="#f4a47c" stroke="'+outline+'" stroke-width="1"/>'+
    '<rect x="116" y="108" width="14" height="34" rx="7" fill="#f4a47c" stroke="'+outline+'" stroke-width="1"/>'+
    // Back label if back muscles
    (muscles.back?'<text x="80" y="80" text-anchor="middle" font-size="9" fill="'+hi+'" font-weight="bold">BACK</text>':"")+
    // Hips
    '<rect x="52" y="116" width="56" height="20" rx="5" fill="'+(muscles.hip||muscles.glutes?hi:'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    // Quads
    '<rect x="54" y="134" width="22" height="60" rx="11" fill="'+(muscles.quads?hi:'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    '<rect x="84" y="134" width="22" height="60" rx="11" fill="'+(muscles.quads?hi:'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    // Hamstrings (shown as knee area highlight)
    (muscles.hams?'<rect x="54" y="164" width="22" height="30" rx="8" fill="'+hi+'" opacity="0.6"/><rect x="84" y="164" width="22" height="30" rx="8" fill="'+hi+'" opacity="0.6"/>':"")+
    // Calves
    '<rect x="56" y="196" width="18" height="46" rx="9" fill="'+(muscles.calves?hi:'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    '<rect x="86" y="196" width="18" height="46" rx="9" fill="'+(muscles.calves?hi:'#c8daf0')+'" stroke="'+outline+'" stroke-width="1"/>'+
    // Feet
    '<ellipse cx="65" cy="244" rx="12" ry="6" fill="#f4a47c" stroke="'+outline+'" stroke-width="1"/>'+
    '<ellipse cx="95" cy="244" rx="12" ry="6" fill="#f4a47c" stroke="'+outline+'" stroke-width="1"/>'+
    // Legend
    '<rect x="10" y="254" width="10" height="10" fill="'+hi+'" rx="2"/><text x="23" y="263" font-size="9" fill="#1a2535">Active</text>'+
    '<rect x="70" y="254" width="10" height="10" fill="#c8daf0" rx="2"/><text x="83" y="263" font-size="9" fill="#1a2535">Supporting</text>'+
    '</svg>';
}

function getExerciseAnimation(name, isFemale, skin, hair, shirt, pants){
  var n=name.toLowerCase();
  var dur="1.2s";
  var sc=skin, ha=hair, sh=shirt, pa=pants;

  // Head shape (slightly different for female)
  var head = isFemale ?
    '<ellipse cx="80" cy="28" rx="13" ry="15" fill="'+sc+'"/>'+
    '<ellipse cx="80" cy="16" rx="14" ry="10" fill="'+ha+'"/>'+  // hair
    '<ellipse cx="67" cy="22" rx="5" ry="8" fill="'+ha+'"/>'+    // side hair L
    '<ellipse cx="93" cy="22" rx="5" ry="8" fill="'+ha+'"/>'+    // side hair R
    '<circle cx="75" cy="30" r="1.5" fill="#333"/>'+
    '<circle cx="85" cy="30" r="1.5" fill="#333"/>'+
    '<path d="M77 34 Q80 36 83 34" stroke="#333" stroke-width="1" fill="none"/>' :
    '<ellipse cx="80" cy="28" rx="13" ry="15" fill="'+sc+'"/>'+
    '<ellipse cx="80" cy="14" rx="13" ry="7" fill="'+ha+'"/>'+   // hair
    '<circle cx="75" cy="30" r="1.5" fill="#333"/>'+
    '<circle cx="85" cy="30" r="1.5" fill="#333"/>'+
    '<path d="M77 34 Q80 36 83 34" stroke="#333" stroke-width="1" fill="none"/>';

  // Squats/Goblet squat
  if(n.includes("squat")||n.includes("goblet")||n.includes("wall sit")){
    return '<svg viewBox="0 0 160 200" width="150" height="160" xmlns="http://www.w3.org/2000/svg">'+
    '<defs><animateTransform/></defs>'+
    '<g id="sq">'+head+
    '<rect x="67" y="42" width="26" height="42" rx="5" fill="'+sh+'"/>'+
    '<rect x="67" y="82" width="26" height="34" rx="4" fill="'+pa+'"/>'+
    // Left arm
    '<line x1="67" y1="50" x2="50" y2="70" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<line x1="50" y1="70" x2="50" y2="90" stroke="'+sc+'" stroke-width="7" stroke-linecap="round"/>'+
    // Right arm
    '<line x1="93" y1="50" x2="110" y2="70" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<line x1="110" y1="70" x2="110" y2="90" stroke="'+sc+'" stroke-width="7" stroke-linecap="round"/>'+
    // Legs - animated
    '<g><line x1="72" y1="116" x2="60" y2="145" stroke="'+pa+'" stroke-width="10" stroke-linecap="round"/>'+
    '<line x1="60" y1="145" x2="58" y2="165" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<line x1="88" y1="116" x2="100" y2="145" stroke="'+pa+'" stroke-width="10" stroke-linecap="round"/>'+
    '<line x1="100" y1="145" x2="102" y2="165" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<animateTransform attributeName="transform" type="translate" values="0,0;0,28;0,0" dur="'+dur+'" repeatCount="indefinite" additive="sum"/></g>'+
    '</g></svg>';
  }

  // Plank
  if(n.includes("plank")&&!n.includes("side")){
    return '<svg viewBox="0 0 200 120" width="180" height="100" xmlns="http://www.w3.org/2000/svg">'+
    '<ellipse cx="40" cy="55" rx="13" ry="13" fill="'+sc+'"/>'+
    '<rect x="52" y="48" width="90" height="20" rx="8" fill="'+sh+'"/>'+
    '<rect x="130" y="52" width="32" height="16" rx="6" fill="'+pa+'"/>'+
    '<line x1="40" y1="68" x2="42" y2="85" stroke="'+sc+'" stroke-width="6" stroke-linecap="round"/>'+
    '<line x1="42" y1="85" x2="55" y2="85" stroke="'+sc+'" stroke-width="5" stroke-linecap="round"/>'+
    '<line x1="160" y1="66" x2="162" y2="85" stroke="'+sc+'" stroke-width="7" stroke-linecap="round"/>'+
    '<line x1="162" y1="85" x2="175" y2="85" stroke="'+sc+'" stroke-width="5" stroke-linecap="round"/>'+
    '<line x1="52" y1="55" x2="42" y2="85" stroke="'+sc+'" stroke-width="7" stroke-linecap="round"/>'+
    '<rect x="38" y="83" width="140" height="4" rx="2" fill="#ccc"/>'+
    '<text x="100" y="105" text-anchor="middle" font-size="11" fill="#4a6a8a">Hold position</text>'+
    '</svg>';
  }

  // Glute bridge / hip thrust
  if(n.includes("bridge")||n.includes("thrust")){
    return '<svg viewBox="0 0 200 140" width="180" height="120" xmlns="http://www.w3.org/2000/svg">'+
    '<g><ellipse cx="25" cy="60" rx="13" ry="13" fill="'+sc+'"/>'+
    '<rect x="36" y="53" width="50" height="18" rx="6" fill="'+sh+'"/>'+
    '<rect x="80" y="53" width="46" height="18" rx="5" fill="'+pa+'"/>'+
    '<line x1="24" y1="73" x2="22" y2="93" stroke="'+sc+'" stroke-width="6" stroke-linecap="round"/>'+
    '<line x1="22" y1="93" x2="30" y2="93" stroke="'+sc+'" stroke-width="5" stroke-linecap="round"/>'+
    '<line x1="120" y1="58" x2="135" y2="80" stroke="'+pa+'" stroke-width="10" stroke-linecap="round"/>'+
    '<line x1="135" y1="80" x2="140" y2="100" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<line x1="142" y1="58" x2="155" y2="80" stroke="'+pa+'" stroke-width="10" stroke-linecap="round"/>'+
    '<line x1="155" y1="80" x2="160" y2="100" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<rect x="18" y="98" width="148" height="5" rx="2" fill="#ccc"/>'+
    '<animateTransform attributeName="transform" type="translate" values="0,0;0,-22;0,0" dur="1.4s" repeatCount="indefinite"/></g>'+
    '</svg>';
  }

  // Deadlift
  if(n.includes("deadlift")||n.includes("rdl")||n.includes("romanian")){
    return '<svg viewBox="0 0 160 220" width="140" height="180" xmlns="http://www.w3.org/2000/svg">'+
    '<g>'+head+
    '<rect x="67" y="42" width="26" height="38" rx="5" fill="'+sh+'"/>'+
    '<rect x="67" y="78" width="26" height="30" rx="4" fill="'+pa+'"/>'+
    '<line x1="72" y1="106" x2="68" y2="145" stroke="'+pa+'" stroke-width="10" stroke-linecap="round"/>'+
    '<line x1="68" y1="145" x2="68" y2="168" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<line x1="88" y1="106" x2="92" y2="145" stroke="'+pa+'" stroke-width="10" stroke-linecap="round"/>'+
    '<line x1="92" y1="145" x2="92" y2="168" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<line x1="50" y1="56" x2="40" y2="100" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<line x1="110" y1="56" x2="120" y2="100" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<rect x="28" y="98" width="24" height="8" rx="4" fill="#888"/>'+
    '<rect x="108" y="98" width="24" height="8" rx="4" fill="#888"/>'+
    '<animateTransform attributeName="transform" type="rotate" values="0 80 110;-25 80 110;0 80 110" dur="1.6s" repeatCount="indefinite"/></g>'+
    '</svg>';
  }

  // Default - generic standing curl / press animation
  return '<svg viewBox="0 0 160 220" width="140" height="180" xmlns="http://www.w3.org/2000/svg">'+
    '<g>'+head+
    '<rect x="67" y="42" width="26" height="42" rx="5" fill="'+sh+'"/>'+
    '<rect x="67" y="82" width="26" height="50" rx="4" fill="'+pa+'"/>'+
    // left arm animated
    '<line x1="67" y1="50" x2="50" y2="68" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<g><line x1="50" y1="68" x2="44" y2="95" stroke="'+sc+'" stroke-width="7" stroke-linecap="round"/>'+
    '<animateTransform attributeName="transform" type="rotate" values="0 50 68;-50 50 68;0 50 68" dur="'+dur+'" repeatCount="indefinite"/></g>'+
    // right arm animated
    '<line x1="93" y1="50" x2="110" y2="68" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<g><line x1="110" y1="68" x2="116" y2="95" stroke="'+sc+'" stroke-width="7" stroke-linecap="round"/>'+
    '<animateTransform attributeName="transform" type="rotate" values="0 110 68;50 110 68;0 110 68" dur="'+dur+'" repeatCount="indefinite"/></g>'+
    // legs
    '<line x1="72" y1="130" x2="68" y2="168" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '<line x1="88" y1="130" x2="92" y2="168" stroke="'+sc+'" stroke-width="8" stroke-linecap="round"/>'+
    '</g></svg>';
}

// ── Pre-built Exercise Templates ──
var TEMPLATE_KEY = "ep_templates";
function loadTemplates(){
  try{ return JSON.parse(localStorage.getItem(TEMPLATE_KEY)||"[]"); }catch(e){ return []; }
}
function saveTemplates(t){ try{ localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t)); }catch(e){} }

// Default starter templates
var DEFAULT_TEMPLATES = [
  { id:1, name:"Rotator Cuff Rehab", nameHe:"שיקום שרוול המסובבים", category:"Shoulder",
    exercises:[
      {name:"Theraband External Rotation",nameHe:"סיבוב חיצוני עם תרבנד",sets:"3",reps:"15",tips:"Keep elbow fixed",tipsHe:"שמור מרפק קבוע",desc:"",descHe:"",displayLng:"en"},
      {name:"Wall Angels",nameHe:"מלאכי קיר",sets:"3",reps:"10",tips:"Back flat on wall",tipsHe:"גב שטוח על הקיר",desc:"",descHe:"",displayLng:"en"},
      {name:"Scapular Retraction",nameHe:"נסיגת שכמית",sets:"3",reps:"15",tips:"Hold 5 seconds",tipsHe:"החזק 5 שניות",desc:"",descHe:"",displayLng:"en"},
      {name:"Prone Y-T-W",nameHe:"Y-T-W בשכיבה",sets:"3",reps:"10",tips:"Squeeze shoulder blades",tipsHe:"כווץ שכמיות",desc:"",descHe:"",displayLng:"en"}
    ]},
  { id:2, name:"Knee ACL Rehab Phase 1", nameHe:"שיקום ACL ברך שלב 1", category:"Knee",
    exercises:[
      {name:"Quad Set",nameHe:"כיווץ ארבע ראשי",sets:"3",reps:"15",tips:"Hold 5 sec",tipsHe:"החזק 5 שניות",desc:"",descHe:"",displayLng:"en"},
      {name:"Heel Slides",nameHe:"החלקות עקב",sets:"3",reps:"15",tips:"Slow and controlled",tipsHe:"לאט ובשליטה",desc:"",descHe:"",displayLng:"en"},
      {name:"Straight Leg Raise",nameHe:"הרמת רגל ישרה",sets:"3",reps:"15",tips:"Tighten quad first",tipsHe:"כווץ ארבע-ראשי קודם",desc:"",descHe:"",displayLng:"en"},
      {name:"Ankle Pumps",nameHe:"משאבות קרסול",sets:"3",reps:"20",tips:"Improve circulation",tipsHe:"שיפור זרימה",desc:"",descHe:"",displayLng:"en"}
    ]},
  { id:3, name:"Lower Back Pain", nameHe:"כאבי גב תחתון", category:"Back",
    exercises:[
      {name:"Cat Cow",nameHe:"חתול-פרה",sets:"3",reps:"10",tips:"Breathe with movement",tipsHe:"נשום עם התנועה",desc:"",descHe:"",displayLng:"en"},
      {name:"Bird Dog",nameHe:"ציפור-כלב",sets:"3",reps:"10",tips:"Keep back flat",tipsHe:"שמור גב שטוח",desc:"",descHe:"",displayLng:"en"},
      {name:"Glute Bridge",nameHe:"גשר ישבן",sets:"3",reps:"15",tips:"Hold 2 sec at top",tipsHe:"החזק 2 שניות בראש",desc:"",descHe:"",displayLng:"en"},
      {name:"Child's Pose",nameHe:"תנוחת הילד",sets:"3",reps:"1",tips:"Hold 30 seconds",tipsHe:"החזק 30 שניות",desc:"",descHe:"",displayLng:"en"}
    ]},
  { id:4, name:"Ankle Sprain Rehab", nameHe:"שיקום נקע קרסול", category:"Ankle",
    exercises:[
      {name:"Ankle Pumps",nameHe:"משאבות קרסול",sets:"3",reps:"20",tips:"Gentle range",tipsHe:"טווח עדין",desc:"",descHe:"",displayLng:"en"},
      {name:"Ankle Circles",nameHe:"עיגולי קרסול",sets:"3",reps:"10",tips:"Both directions",tipsHe:"שני כיוונים",desc:"",descHe:"",displayLng:"en"},
      {name:"Calf Raises",nameHe:"הרמות עקבים",sets:"3",reps:"15",tips:"Pain-free range only",tipsHe:"טווח ללא כאב",desc:"",descHe:"",displayLng:"en"},
      {name:"Single Leg Balance",nameHe:"איזון רגל אחת",sets:"3",reps:"1",tips:"30 seconds each",tipsHe:"30 שניות כל צד",desc:"",descHe:"",displayLng:"en"}
    ]}
];

function omTemplates(){
  var custom=loadTemplates();
  var all=DEFAULT_TEMPLATES.concat(custom);
  var isHe=lng==="he";
  var cats=[...new Set(all.map(function(t){return t.category||"General"}))];
  var c=g("MC");
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">📋 '+(isHe?"תוכניות מוכנות":"Exercise Templates")+'</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">✕</button></div>'+
    '<button class="btn" style="width:100%;margin-bottom:12px;font-size:13px" onclick="omNewTemplate()">+ '+(isHe?"תבנית חדשה":"New Template")+'</button>'+
    '<div style="max-height:480px;overflow-y:auto">'+
    cats.map(function(cat){
      var catItems=all.filter(function(t){return (t.category||"General")===cat;});
      return '<div style="font-size:10px;font-weight:700;color:#4a6a8a;text-transform:uppercase;letter-spacing:1px;margin:10px 0 6px">'+cat+'</div>'+
        catItems.map(function(t,i){
          var tName=isHe&&t.nameHe?t.nameHe:t.name;
          var isCustom=custom.indexOf(t)>=0;
          var custIdx=custom.indexOf(t);
          return '<div style="background:#f8fbff;border:1px solid #e0eaf5;border-radius:10px;padding:11px 14px;margin-bottom:8px">'+
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<span style="font-weight:700;font-size:14px;color:#1a3a6e">'+tName+'</span>'+
            '<div style="display:flex;gap:5px">'+
            '<button onclick="applyTemplate('+JSON.stringify(t).replace(/"/g,"&quot;")+',\''+tName+'\')" class="btn" style="font-size:11px;padding:4px 10px;background:#e8f8f0;color:#00a86b;border:1px solid rgba(0,168,107,0.3)">+ '+(isHe?"הוסף למטופל":"Apply")+'</button>'+
            '<button onclick="editAnyTemplate(\''+( isCustom?'custom':'builtin')+'\','+( isCustom?custIdx:DEFAULT_TEMPLATES.indexOf(t))+')" class="btn" style="font-size:11px;padding:4px 8px;background:#f0f5ff">✏️</button>'+
            (isCustom?'<button onclick="deleteTemplate('+custIdx+')" class="btn btnd" style="font-size:11px;padding:4px 8px">✕</button>':'')+'</div></div>'+
            '<div style="font-size:11px;color:#4a6a8a">'+(t.exercises||[]).length+' exercises: '+
            (t.exercises||[]).slice(0,3).map(function(e){return isHe&&e.nameHe?e.nameHe:e.name;}).join(", ")+
            ((t.exercises||[]).length>3?"...":"")+
            '</div></div>';
        }).join("");
    }).join("")+
    '</div>';
  g("MB").classList.add("on");
}

function applyTemplate(t, tName){
  if(typeof t==="string") try{t=JSON.parse(t);}catch(e){return;}
  var isHe=lng==="he";
  if(!confirm((isHe?"הוסף תבנית":"Apply template")+" \""+tName+"\" "+(isHe?"למטופל?":"to this patient?"))) return;
  // Add as a new workout plan day
  var ed=cur._editingDay;
  if(ed){
    var pl=(cur.workoutPlans||[]).find(function(x){return x.id===ed.planId;});
    if(pl){
      var dys=pl.type==="periodized"?((pl.phases||[])[ed.phaseIdx]||{}).days||[]:pl.days||[];
      var dy=dys.find(function(d){return d.id===ed.dayId;});
      if(dy){
        var toAdd=(t.exercises||[]).map(function(e){return Object.assign({},e,{id:Date.now()+Math.random()*1000|0});});
        dy.exercises=(dy.exercises||[]).concat(toAdd);
        pts=pts.map(function(p){return p.id===cur.id?cur:p;}); sv(); cm(); rex(); return;
      }
    }
  }
  // Create a new plan from template
  var newPlan={id:Date.now(), name:tName, nameHe:t.nameHe||tName, type:"repeating",
    days:[{id:Date.now()+1, name:"Day A", nameHe:"יום א",
      exercises:(t.exercises||[]).map(function(e){return Object.assign({},e,{id:Date.now()+Math.random()*1000|0});})}]};
  if(!cur.workoutPlans) cur.workoutPlans=[];
  cur.workoutPlans.push(newPlan);
  pts=pts.map(function(p){return p.id===cur.id?cur:p;}); sv(); cm(); rplans();
}

function omNewTemplate(){
  var isHe=lng==="he";
  var c=g("MC");
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:16px;font-weight:800;color:#1a3a6e">+ '+(isHe?"תבנית חדשה":"New Template")+'</span>'+
    '<button onclick="omTemplates()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">←</button></div>'+
    '<div class="g2" style="gap:10px;margin-bottom:12px">'+
    '<div style="grid-column:1/-1"><label class="lbl">Template Name (EN)</label><input class="inp" id="tp_name" placeholder="e.g. Hip Flexor Rehab"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">שם (עברית)</label><input class="inp" id="tp_namehe" dir="rtl"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">Category</label><input class="inp" id="tp_cat" placeholder="e.g. Hip, Shoulder, Back, Knee"></div>'+
    '</div>'+
    '<div style="font-size:12px;font-weight:700;color:#1a3a6e;margin-bottom:8px">Exercises (search & add)</div>'+
    '<div style="margin-bottom:8px">'+
    '<input class="inp" id="tp_exsearch" placeholder="Search exercises..." oninput="filterTpEx(this.value)">'+
    '<div id="tp_exlist" style="max-height:140px;overflow-y:auto;border:1px solid rgba(43,108,196,0.2);border-radius:8px;margin-top:4px;background:#fff"></div></div>'+
    '<div id="tp_selected" style="margin-bottom:12px"></div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end">'+
    '<button class="btn btnd" onclick="omTemplates()">'+(isHe?"ביטול":"Cancel")+'</button>'+
    '<button class="btn" onclick="saveNewTemplate()">'+(isHe?"שמור תבנית":"Save Template")+'</button></div>';
  g("tp_selected").dataset.exercises="[]";
  g("MB").classList.add("on");
}

function filterTpEx(q){
  var list=q?EX_LIB.filter(function(e){
    return (e.name||"").toLowerCase().includes(q.toLowerCase())||(e.nameHe||"").includes(q);
  }).slice(0,8):EX_LIB.slice(0,8);
  var box=g("tp_exlist"); if(!box) return;
  box.innerHTML=list.map(function(e){
    return '<div onclick="addTpEx('+JSON.stringify(e).replace(/"/g,"&quot;")+',\''+e.name+'\')" '+
      'style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:12px" '+
      'onmouseover="this.style.background=\'#f0f5fb\'" onmouseout="this.style.background=\'\'">'+
      '<span style="font-weight:600">'+e.name+'</span> / <span style="color:#4a6a8a">'+e.nameHe+'</span></div>';
  }).join("");
}

function addTpEx(e, eName){
  if(typeof e==="string") try{e=JSON.parse(e);}catch(x){return;}
  var sel=g("tp_selected"); if(!sel) return;
  var arr=[]; try{arr=JSON.parse(sel.dataset.exercises);}catch(x){}
  arr.push({name:e.name,nameHe:e.nameHe,sets:"3",reps:"10",tips:e.tips||"",tipsHe:e.tipsHe||"",desc:"",descHe:"",displayLng:"en"});
  sel.dataset.exercises=JSON.stringify(arr);
  sel.innerHTML='<div style="font-size:11px;font-weight:700;color:#1a3a6e;margin-bottom:5px">Selected ('+arr.length+'):</div>'+
    arr.map(function(ex,i){
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:#f0f5ff;border-radius:6px;margin-bottom:3px;font-size:12px">'+
        '<span>'+ex.name+'</span>'+
        '<button onclick="removeTpEx('+i+')" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:13px">✕</button></div>';
    }).join("");
}

function removeTpEx(i){
  var sel=g("tp_selected"); if(!sel) return;
  var arr=[]; try{arr=JSON.parse(sel.dataset.exercises);}catch(x){}
  arr.splice(i,1); sel.dataset.exercises=JSON.stringify(arr);
  addTpEx=addTpEx; // refresh display by re-calling add with dummy
  var sel2=g("tp_selected");
  sel2.innerHTML=arr.length?'<div style="font-size:11px;font-weight:700;color:#1a3a6e;margin-bottom:5px">Selected ('+arr.length+'):</div>'+
    arr.map(function(ex,j){
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:#f0f5ff;border-radius:6px;margin-bottom:3px;font-size:12px">'+
        '<span>'+ex.name+'</span>'+
        '<button onclick="removeTpEx('+j+')" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:13px">✕</button></div>';
    }).join(""):"";
}

function saveNewTemplate(){
  var n=g("tp_name")?g("tp_name").value.trim():"";
  var nhe=g("tp_namehe")?g("tp_namehe").value.trim():"";
  var cat=g("tp_cat")?g("tp_cat").value.trim():"General";
  if(!n&&!nhe){alert("Enter a template name.");return;}
  var sel=g("tp_selected"); var arr=[]; if(sel) try{arr=JSON.parse(sel.dataset.exercises);}catch(x){}
  if(!arr.length){alert("Add at least one exercise.");return;}
  var custom=loadTemplates();
  custom.push({id:Date.now(),name:n||nhe,nameHe:nhe||n,category:cat,exercises:arr});
  saveTemplates(custom); omTemplates();
}

function editAnyTemplate(type, idx){
  var t = type==="custom" ? loadTemplates()[idx] : DEFAULT_TEMPLATES[idx];
  if(!t) return;
  var isHe=lng==="he";
  var c=g("MC");
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:16px;font-weight:800;color:#1a3a6e">✏️ '+(isHe?"ערוך תבנית":"Edit Template")+'</span>'+
    '<button onclick="omTemplates()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">←</button></div>'+
    '<div class="g2" style="gap:10px;margin-bottom:12px">'+
    '<div style="grid-column:1/-1"><label class="lbl">Name (EN)</label><input class="inp" id="ate_name_en" value="'+(t.name||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">שם (עברית)</label><input class="inp" id="ate_name_he" dir="rtl" value="'+(t.nameHe||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="lbl">Category</label><input class="inp" id="ate_cat" value="'+(t.category||'General')+'"></div></div>'+
    '<div style="font-size:12px;font-weight:700;color:#1a3a6e;margin-bottom:8px">Exercises</div>'+
    '<div id="ate_ex_list" data-exercises="'+JSON.stringify(t.exercises||[]).replace(/"/g,"&quot;")+'">'+
    (t.exercises||[]).map(function(e,ei){
      var eName=isHe&&e.nameHe?e.nameHe:e.name;
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#f0f5ff;border-radius:7px;margin-bottom:5px">'+
        '<div style="flex:1">'+
        '<div style="font-weight:600;font-size:13px">'+eName+'</div>'+
        '<div style="display:flex;gap:8px;margin-top:4px">'+
        '<input style="width:50px;padding:3px 6px;border:1px solid #c8d8ee;border-radius:5px;font-size:12px" id="ate_sets_'+ei+'" value="'+(e.sets||3)+'" placeholder="Sets">'+
        '<span style="color:#4a6a8a;font-size:12px;line-height:28px">×</span>'+
        '<input style="width:60px;padding:3px 6px;border:1px solid #c8d8ee;border-radius:5px;font-size:12px" id="ate_reps_'+ei+'" value="'+(e.reps||10)+'" placeholder="Reps">'+
        '<input style="flex:1;padding:3px 6px;border:1px solid #c8d8ee;border-radius:5px;font-size:12px" id="ate_tips_'+ei+'" value="'+(isHe&&e.tipsHe?e.tipsHe:e.tips||'')+'" placeholder="Tips">'+
        '</div></div>'+
        '<button onclick="removeAteEx('+ei+')" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:16px;margin-left:8px">✕</button>'+
        '</div>';
    }).join("")+
    '</div>'+
    '<div style="margin:8px 0"><input class="inp" id="ate_exsearch" placeholder="'+(isHe?"הוסף תרגיל...":"Add exercise...")+'" oninput="filterAteEx(this.value)">'+
    '<div id="ate_exlist" style="max-height:120px;overflow-y:auto;border:1px solid rgba(43,108,196,0.2);border-radius:8px;margin-top:4px;background:#fff"></div></div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">'+
    '<button class="btn btnd" onclick="omTemplates()">'+(isHe?"ביטול":"Cancel")+'</button>'+
    '<button class="btn" onclick="saveAnyTemplate(\''+type+'\','+idx+')">'+(isHe?"שמור":"Save")+'</button></div>';
  g("MB").classList.add("on");
}

function filterAteEx(q){
  var list=q?EX_LIB.filter(function(e){return (e.name||"").toLowerCase().includes(q.toLowerCase())||(e.nameHe||"").includes(q);}).slice(0,6):[];
  var box=g("ate_exlist"); if(!box) return;
  box.innerHTML=list.map(function(e){
    return '<div onclick="addAteEx(\''+e.name.replace(/'/g,"\\'")+'\',\''+e.nameHe.replace(/'/g,"\\'")+'\',\''+e.tips.replace(/'/g,"\\'")+'\',\''+e.tipsHe.replace(/'/g,"\\'")+'\');" '+
      'style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:12px" '+
      'onmouseover="this.style.background=\'#f0f5fb\'" onmouseout="this.style.background=\'\'">'+
      '<span style="font-weight:600">'+e.name+'</span> / <span style="color:#4a6a8a">'+e.nameHe+'</span></div>';
  }).join("");
}

function addAteEx(name,nameHe,tips,tipsHe){
  var list=g("ate_ex_list"); if(!list) return;
  var arr=[]; try{arr=JSON.parse(list.dataset.exercises.replace(/&quot;/g,'"'));}catch(x){}
  arr.push({name:name,nameHe:nameHe,sets:"3",reps:"10",tips:tips,tipsHe:tipsHe,desc:"",descHe:"",displayLng:"en"});
  list.dataset.exercises=JSON.stringify(arr).replace(/"/g,"&quot;");
  g("ate_exsearch").value=""; g("ate_exlist").innerHTML="";
  // Add row without full re-render
  var div=document.createElement("div");
  div.style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#f0f5ff;border-radius:7px;margin-bottom:5px";
  var ei=arr.length-1;
  div.innerHTML='<div style="flex:1"><div style="font-weight:600;font-size:13px">'+name+'</div>'+
    '<div style="display:flex;gap:8px;margin-top:4px">'+
    '<input style="width:50px;padding:3px 6px;border:1px solid #c8d8ee;border-radius:5px;font-size:12px" id="ate_sets_'+ei+'" value="3" placeholder="Sets">'+
    '<span style="color:#4a6a8a;font-size:12px;line-height:28px">×</span>'+
    '<input style="width:60px;padding:3px 6px;border:1px solid #c8d8ee;border-radius:5px;font-size:12px" id="ate_reps_'+ei+'" value="10" placeholder="Reps">'+
    '<input style="flex:1;padding:3px 6px;border:1px solid #c8d8ee;border-radius:5px;font-size:12px" id="ate_tips_'+ei+'" value="'+(tips||'')+'" placeholder="Tips">'+
    '</div></div>'+
    '<button onclick="removeAteEx('+ei+')" style="background:none;border:none;cursor:pointer;color:#e74c3c;font-size:16px;margin-left:8px">✕</button>';
  list.appendChild(div);
}

function removeAteEx(ei){
  var list=g("ate_ex_list"); if(!list) return;
  var arr=[]; try{arr=JSON.parse(list.dataset.exercises.replace(/&quot;/g,'"'));}catch(x){}
  arr.splice(ei,1); list.dataset.exercises=JSON.stringify(arr).replace(/"/g,"&quot;");
  list.children[ei] && list.children[ei].remove();
}

function saveAnyTemplate(type, idx){
  var name=g("ate_name_en")?g("ate_name_en").value.trim():"";
  var nameHe=g("ate_name_he")?g("ate_name_he").value.trim():"";
  var cat=g("ate_cat")?g("ate_cat").value.trim():"General";
  var list=g("ate_ex_list"); if(!list) return;
  var arr=[]; try{arr=JSON.parse(list.dataset.exercises.replace(/&quot;/g,'"'));}catch(x){}
  // Update sets/reps/tips from inputs
  arr=arr.map(function(e,ei){
    return Object.assign({},e,{
      sets:g("ate_sets_"+ei)?g("ate_sets_"+ei).value:e.sets,
      reps:g("ate_reps_"+ei)?g("ate_reps_"+ei).value:e.reps,
      tips:g("ate_tips_"+ei)?g("ate_tips_"+ei).value:e.tips
    });
  });
  var updated={name:name,nameHe:nameHe,category:cat,exercises:arr};
  if(type==="builtin"){
    // Override built-in template permanently
    DEFAULT_TEMPLATES[idx]=Object.assign(DEFAULT_TEMPLATES[idx],updated);
  } else {
    var custom=loadTemplates(); custom[idx]=Object.assign(custom[idx],updated); saveTemplates(custom);
  }
  omTemplates();
}

function deleteTemplate(i){
  if(!confirm("Delete this template?")) return;
  var custom=loadTemplates(); custom.splice(i,1); saveTemplates(custom); omTemplates();
}

// ── Recycle Bin ──
function omRecycleBin(){
  var c=g("MC");
  var pHtml = deletedPatients.length ?
    '<div style="font-size:12px;font-weight:700;color:#e74c3c;text-transform:uppercase;margin-bottom:8px">🗑 Deleted Patients ('+deletedPatients.length+')</div>'+
    deletedPatients.map(function(item,i){
      var p=item.patient;
      var d=item.deletedAt?item.deletedAt.split("T")[0]:"";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:#fff5f5;border:1px solid #ffd0d0;border-radius:8px;margin-bottom:6px">'+
        '<div><div style="font-weight:600;font-size:13px;color:#1a3a6e">'+(p.name||p.nameHe)+'</div>'+
        '<div style="font-size:11px;color:#4a6a8a">'+(p.sport||"")+(d?" · deleted "+d:"")+'</div></div>'+
        '<button class="btn" style="font-size:12px;background:#e8f8f0;color:#00a86b;border:1px solid rgba(0,168,107,0.3)" onclick="restorePatient('+i+')">↩ Restore</button>'+
        '</div>';
    }).join("") : '<div style="color:#4a6a8a;font-size:13px;padding:8px 0">No deleted patients</div>';

  var eHtml = deletedExercises.length ?
    '<div style="font-size:12px;font-weight:700;color:#e67e22;text-transform:uppercase;margin:12px 0 8px">🗑 Deleted Exercises ('+deletedExercises.length+')</div>'+
    deletedExercises.map(function(item,i){
      var e=item.exercise;
      var eName=(lng==="he"&&e.nameHe)?e.nameHe:(e.name||e.nameHe||"");
      var d=item.deletedAt?item.deletedAt.split("T")[0]:"";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:#fff8f0;border:1px solid #ffd8a8;border-radius:8px;margin-bottom:6px">'+
        '<div><div style="font-weight:600;font-size:13px;color:#1a3a6e">'+eName+'</div>'+
        '<div style="font-size:11px;color:#4a6a8a">from: '+item.patientName+(d?" · deleted "+d:"")+'</div></div>'+
        '<button class="btn" style="font-size:12px;background:#e8f8f0;color:#00a86b;border:1px solid rgba(0,168,107,0.3)" onclick="restoreExercise('+i+')">↩ Restore</button>'+
        '</div>';
    }).join("") : '<div style="color:#4a6a8a;font-size:13px;padding:8px 0">No deleted exercises</div>';

  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">🗑 Recycle Bin</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">✕</button></div>'+
    '<div style="max-height:420px;overflow-y:auto">'+pHtml+eHtml+'</div>'+
    '<div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">'+
    '<span style="font-size:11px;color:#4a6a8a">Items auto-clear after session</span>'+
    '<button class="btn btnd" style="font-size:12px" onclick="deletedPatients=[];deletedExercises=[];saveRecycleBin();cm();rd()">Clear All</button></div>';
  g("MB").classList.add("on");
}

function restorePatient(i){
  var item=deletedPatients[i];
  if(!item) return;
  pts.push(item.patient);
  lsave(); apiCall("patients","POST",toRow(item.patient));
  deletedPatients.splice(i,1);
  saveRecycleBin();
  rpl(); omRecycleBin();
}

function restoreExercise(i){
  var item=deletedExercises[i];
  if(!item) return;
  var p=pts.find(function(x){ return x.id===item.patientId; });
  if(!p){ alert("Patient not found — restore the patient first."); return; }
  if(!p.exercises) p.exercises=[];
  p.exercises.push(item.exercise);
  pts=pts.map(function(x){ return x.id===p.id?p:x; });
  if(cur&&cur.id===p.id) cur=p;
  lsave(); sv();
  deletedExercises.splice(i,1);
  saveRecycleBin();
  if(cur&&cur.id===p.id) rex();
  omRecycleBin();
}

// ── Workout History Admin View ──
function omWorkoutHistory(patientId){
  var p=pts.find(function(x){ return x.id===patientId; });
  if(!p) return;
  var hist=p.workoutHistory||[];
  var isHe=lng==="he";
  var c=g("MC");
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">📋 '+pn(p)+' — '+(isHe?"היסטוריית אימונים":"Workout History")+'</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">✕</button></div>'+
    (hist.length?
      '<div style="max-height:450px;overflow-y:auto">'+
      hist.map(function(h,i){
        return '<div class="xcard" style="margin-bottom:10px">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<div style="font-size:14px;font-weight:700;color:#1a3a6e">'+h.date+'</div>'+
          '<div style="display:flex;gap:8px;align-items:center">'+
          '<span style="font-size:13px;color:#e67e22;font-weight:600">⏱ '+h.time+'</span>'+
          '<button onclick="editHistoryNote('+patientId+','+i+')" style="background:#f0f5ff;border:1px solid #c8d8ee;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer">✏️ Note</button>'+
          '<button onclick="deleteHistoryEntry('+patientId+','+i+')" style="background:#fff0f0;border:1px solid #ffd0d0;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;color:#e74c3c">✕</button>'+
          '</div></div>'+
          (h.exercises||[]).map(function(e){
            var n=(isHe&&e.nameHe)?e.nameHe:(e.name||"");
            return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:#4a6a8a">'+
              '<span>'+n+'</span><span style="font-weight:600;color:#2B6CC4">'+e.sets+' × '+e.reps+'</span></div>';
          }).join("")+
          (h.note?'<div style="font-size:12px;color:#4a6a8a;margin-top:6px;padding:6px 8px;background:#f8f8f8;border-radius:6px;font-style:italic">💬 '+h.note+'</div>':'')+
          '</div>';
      }).join("")+'</div>'
      :'<div style="color:#4a6a8a;padding:20px;text-align:center">'+(isHe?"אין היסטוריה עדיין":"No workout history yet")+'</div>'
    );
  g("MB").classList.add("on");
}

function editHistoryNote(patientId, idx){
  var p=pts.find(function(x){ return x.id===patientId; });
  if(!p||!p.workoutHistory||!p.workoutHistory[idx]) return;
  var current=p.workoutHistory[idx].note||"";
  var note=prompt("Edit note for workout on "+p.workoutHistory[idx].date+":", current);
  if(note===null) return; // cancelled
  p.workoutHistory[idx].note=note;
  pts=pts.map(function(x){ return x.id===patientId?p:x; });
  sv(); omWorkoutHistory(patientId);
}

function deleteHistoryEntry(patientId, idx){
  if(!confirm("Delete this workout entry? This cannot be undone.")) return;
  var p=pts.find(function(x){ return x.id===patientId; });
  if(!p||!p.workoutHistory) return;
  p.workoutHistory.splice(idx,1);
  pts=pts.map(function(x){ return x.id===patientId?p:x; });
  sv(); omWorkoutHistory(patientId);
}

function addCustomSport(){
  var en=prompt("Sport name in English:");
  if(!en||!en.trim()) return;
  var he=prompt("Sport name in Hebrew (optional):")||en;
  var custom=getCustomSports();
  custom.push({en:en.trim(),he:he.trim()});
  saveCustomSports(custom);
  // Refresh dropdown
  var sel=g("fsp"); if(!sel) return;
  var newOpt=document.createElement("option");
  newOpt.value=en.trim(); newOpt.textContent=lng==="he"?he+" / "+en:en;
  newOpt.selected=true;
  sel.appendChild(newOpt);
}

function omManageSports(){
  var isHe=lng==="he";
  var custom=getCustomSports();
  var c=g("MC");
  c.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<span style="font-size:17px;font-weight:800;color:#1a3a6e">⚽ '+(isHe?"ניהול ספורט":"Manage Sports")+'</span>'+
    '<button onclick="cm()" style="background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">✕</button></div>'+
    '<div style="font-size:11px;font-weight:700;color:#4a6a8a;text-transform:uppercase;margin-bottom:8px">'+(isHe?"רשימת ברירת מחדל":"Default Sports (read-only)")+'</div>'+
    '<div style="max-height:160px;overflow-y:auto;margin-bottom:12px;background:#f8fbff;border-radius:8px;padding:8px">'+
    SP.map(function(s,i){ return '<div style="font-size:12px;padding:4px 6px;color:#4a6a8a">'+(isHe&&SP_HE[i]?SP_HE[i]+' / ':'')+s+'</div>'; }).join("")+
    '</div>'+
    '<div style="font-size:11px;font-weight:700;color:#1a3a6e;text-transform:uppercase;margin-bottom:8px">'+(isHe?"ספורט מותאם אישית":"Custom Sports")+'</div>'+
    '<div id="custom_sports_list">'+
    (custom.length===0?'<div style="color:#4a6a8a;font-size:12px;padding:8px">'+(isHe?"אין ספורט מותאם":"No custom sports yet")+'</div>':
    custom.map(function(s,i){
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#f0f5ff;border-radius:8px;margin-bottom:5px">'+
        '<div id="sport_view_'+i+'">'+
        '<span style="font-weight:600;font-size:13px">'+(s.he||s.en)+'</span>'+
        (s.he&&s.he!==s.en?'<span style="color:#4a6a8a;font-size:11px;margin-left:6px">/ '+s.en+'</span>':'')+
        '</div>'+
        '<div style="display:flex;gap:6px">'+
        '<button onclick="editCustomSport('+i+')" style="background:#e8f2ff;border:1px solid #c8d8ee;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px">✏️</button>'+
        '<button onclick="deleteCustomSport('+i+')" style="background:#fff0f0;border:1px solid #ffd0d0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;color:#e74c3c">✕</button>'+
        '</div></div>';
    }).join(""))+'</div>'+
    '<div style="display:flex;gap:8px;margin-top:10px">'+
    '<input class="inp" id="new_sport_en" placeholder="English name" style="flex:1">'+
    '<input class="inp" id="new_sport_he" dir="rtl" placeholder="שם בעברית" style="flex:1">'+
    '<button class="btn" onclick="addSportFromModal()">+ '+(isHe?"הוסף":"Add")+'</button>'+
    '</div>';
  g("MB").classList.add("on");
}

function addSportFromModal(){
  var en=g("new_sport_en")?g("new_sport_en").value.trim():"";
  var he=g("new_sport_he")?g("new_sport_he").value.trim():"";
  if(!en&&!he) return;
  var custom=getCustomSports();
  custom.push({en:en||he, he:he||en});
  saveCustomSports(custom);
  omManageSports();
}

function editCustomSport(i){
  var custom=getCustomSports(); var s=custom[i]; if(!s) return;
  var isHe=lng==="he";
  var newEn=prompt("English name:", s.en||"");
  if(newEn===null) return;
  var newHe=prompt("Hebrew name:", s.he||"");
  if(newHe===null) return;
  custom[i]={en:newEn.trim()||s.en, he:newHe.trim()||s.he};
  saveCustomSports(custom);
  omManageSports();
}

function deleteCustomSport(i){
  if(!confirm("Delete this sport?")) return;
  var custom=getCustomSports();
  custom.splice(i,1);
  saveCustomSports(custom);
  omManageSports();
}

// ── Save patient / exercise / follow-up ──
function sp2(){
  var nm=g("fn")?g("fn").value.trim():"";
  var nhe=g("fnhe")?g("fnhe").value.trim():"";
  if(!nm&&!nhe){
    var fn=g("fn")||g("fnhe"); if(fn){ fn.style.border="2px solid #e74c3c"; setTimeout(function(){ fn.style.border=""; },2000); }
    return;
  }
  var sp=g("fsp")?g("fsp").value||"General":"General";
  var d={name:nm||(nhe),nameHe:nhe||(nm),sport:sp,age:g("fa")?g("fa").value:"",phone:g("fph")?g("fph").value:"",injury:g("fij")?g("fij").value:"",pin:g("fpi")?g("fpi").value||"0000":"0000",status:g("fst")?g("fst").value:"Active",notes:g("fno")?g("fno").value:""};
  if(mmode==="ep"&&cur){ Object.assign(cur,d); pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); }
  else{ pts.push(Object.assign({},d,{id:Date.now(),sessions:0,startDate:new Date().toISOString().split("T")[0],exercises:[],followUps:[],files:[],eval:""})); }
  sv(); cm(); rpl(); if(mmode==="ep") rpd();
}
function setExLng(l){
  g("fdlng").value=l;
  g("lng-en").style.border=l==="en"?"2px solid #2B6CC4":"2px solid #ddd";
  g("lng-en").style.background=l==="en"?"rgba(43,108,196,0.1)":"#fff";
  g("lng-he").style.border=l==="he"?"2px solid #2B6CC4":"2px solid #ddd";
  g("lng-he").style.background=l==="he"?"rgba(43,108,196,0.1)":"#fff";
}
function se2(editId){
  var n=g("fen").value.trim(), nhe=g("fenhe")?g("fenhe").value.trim():"";
  if(!n&&!nhe) return;
  var dlng=g("fdlng")?g("fdlng").value:"en";
  var finalName = n || nhe;
  var finalNameHe = nhe || n;
  var e={
    id: editId ? Number(editId) : Date.now(),
    name: finalName, nameHe: finalNameHe,
    sets: g("fse").value, reps: g("frp").value,
    timerSecs: g("ftimer")?parseInt(g("ftimer").value)||0:0,
    desc: g("fde")?g("fde").value.trim():"",
    descHe: g("fdehe")?g("fdehe").value.trim():"",
    tips: g("fti")?g("fti").value.trim():"",
    tipsHe: g("ftihe")?g("ftihe").value.trim():"",
    displayLng: dlng
  };
  // Save to plan day if currently editing one
  var ed=cur._editingDay;
  if(ed){
    var plan=(cur.workoutPlans||[]).find(function(p){ return p.id===ed.planId; });
    if(plan){
      var days=plan.type==="periodized"?((plan.phases||[])[ed.phaseIdx]||{}).days||[]:plan.days||[];
      var day=days.find(function(d){ return d.id===ed.dayId; });
      if(day){
        if(!day.exercises) day.exercises=[];
        if(editId){ day.exercises=day.exercises.map(function(x){ return Number(x.id)===Number(editId)?e:x; }); }
        else { day.exercises.push(e); }
        pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); cm(); rex(); return;
      }
    }
  }
  // Fall back to flat exercises list
  if(!cur.exercises) cur.exercises=[];
  if(editId){ cur.exercises=cur.exercises.map(function(x){ return Number(x.id)===Number(editId)?e:x; }); }
  else { cur.exercises.push(e); }
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); cm(); rex();
  var sp=document.querySelectorAll("#ptbs .nb"); if(sp[0]&&sp[0].querySelector("span")) sp[0].querySelector("span").textContent=cur.exercises.length;
}
function de(eid){
  var e = (cur.exercises||[]).find(function(x){ return Number(x.id)===Number(eid); });
  if(!e) return;
  var eName = (lng==="he"&&e.nameHe)?e.nameHe:(e.name||e.nameHe||"exercise");
  if(!confirm("Delete exercise \""+eName+"\"?\n\nYou can restore it from the Recycle Bin.")) return;
  deletedExercises.unshift({exercise: JSON.parse(JSON.stringify(e)), patientId: cur.id, patientName: pn(cur), deletedAt: new Date().toISOString()});
  saveRecycleBin();
  cur.exercises=(cur.exercises||[]).filter(function(x){ return Number(x.id)!==Number(eid); });
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); rex();
}
function sfu(){
  var nt=g("fnt").value.trim(); if(!nt) return;
  var f={id:Date.now(),date:g("fdt").value,note:nt};
  if(!cur.followUps) cur.followUps=[];
  cur.followUps.unshift(f);
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); cm(); rfu();
}

// ── File upload ──
function hf(e){
  Array.from(e.target.files).forEach(function(file){
    var r=new FileReader(); r.onload=function(ev){
      var fo={id:Date.now()+Math.random(),name:file.name,type:file.type,data:ev.target.result,date:new Date().toISOString().split("T")[0]};
      if(!cur.files) cur.files=[];
      cur.files.push(fo);
      pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); rcl();
    }; r.readAsDataURL(file);
  }); e.target.value="";
}
function dfile(fid){ cur.files=(cur.files||[]).filter(function(f){ return f.id!==fid; }); pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); rcl(); }

// ── Auto-translate exercises to Hebrew ──
function autoTranslateExercises(p, cb){
  // Translation requires API key - just call cb immediately
  if(cb) cb();
}

function callClaude(prompt, maxTokens, cb){
  fetch("https://api.anthropic.com/v1/messages",{method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":AI_KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTokens||800,messages:[{role:"user",content:prompt}]})
  }).then(function(r){ return r.json(); }).then(function(d){ cb(null,d.content.map(function(i){ return i.text||""; }).join("")); }).catch(function(e){ cb(e); });
}

function ais(){
  if(!cur) return;
  if(!AI_KEY){
    g("MC").innerHTML='<div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#1a3a6e">'+L().ai+'</div>'+
      '<div style="background:rgba(43,108,196,0.07);border:1px solid rgba(43,108,196,0.2);border-radius:10px;padding:16px;font-size:14px;color:#1a2535;line-height:1.9">'+
      'To enable AI, add your Anthropic API key to app.js:<br>Find: <code style="background:#f0f5fb;padding:2px 6px;border-radius:4px;color:#2B6CC4;font-size:12px">var AI_KEY="";</code><br>'+
      'Replace with your key.</div><div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn" onclick="cm()">OK</button></div>';
    g("MB").classList.add("on"); return;
  }
  g("MC").innerHTML='<div style="font-size:16px;font-weight:700;margin-bottom:4px;color:#1a3a6e">'+L().ai+'</div>'+
    '<div style="font-size:13px;color:#4a6a8a;margin-bottom:18px">'+cur.sport+' &middot; '+(cur.injury||"general")+'</div>'+
    '<div style="display:flex;align-items:center;justify-content:center;padding:32px;color:#4a6a8a;font-size:14px"><span class="spb"></span>'+L().gn+'</div>';
  g("MB").classList.add("on");
  callClaude("Sports physio expert. Patient sport:"+cur.sport+", injury:"+(cur.injury||"general")+", notes:"+(cur.notes||"none")+", current exercises:"+(cur.exercises||[]).map(function(e){ return e.name; }).join(",")||"none"+". Suggest 3 rehab exercises. ONLY JSON array no markdown: [{\"name\":\"\",\"sets\":3,\"reps\":\"\",\"desc\":\"\",\"tips\":\"\"}]",800,function(err,txt){
    if(err){ g("MC").innerHTML='<div style="color:#c0392b;padding:16px;font-size:14px;text-align:center">Could not generate. Check API key.</div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" onclick="cm()">OK</button></div>'; return; }
    try{
      var list=JSON.parse(txt.replace(/```json|```/g,"").trim());
      window._ail=list;
      g("MC").innerHTML='<div style="font-size:16px;font-weight:700;margin-bottom:4px;color:#1a3a6e">'+L().ai+'</div>'+
        '<div style="font-size:13px;color:#4a6a8a;margin-bottom:14px">'+cur.sport+' &middot; '+(cur.injury||"general")+'</div>'+
        list.map(function(e){ return '<div class="xcard" style="border-color:rgba(43,108,196,0.3)"><div style="font-weight:700;font-size:15px;color:#1a3a6e;margin-bottom:3px">'+e.name+'</div>'+
          '<div style="font-size:13px;color:#4a6a8a;margin-bottom:2px">'+e.sets+' sets &times; '+e.reps+'</div>'+
          (e.desc?'<div style="font-size:13px;color:#1a2535;margin-bottom:2px">'+e.desc+'</div>':"")+
          (e.tips?'<div style="font-size:13px;color:#00a86b">&#128161; '+e.tips+'</div>':"")+
          '</div>'; }).join("")+
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn btnd" onclick="cm()">'+L().ca+'</button><button class="btn" onclick="aall()">'+L().aa+'</button></div>';
    }catch(e2){ g("MC").innerHTML='<div style="color:#c0392b;padding:16px;font-size:14px">Parse error. Try again.</div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" onclick="cm()">OK</button></div>'; }
  });
}

function aall(){
  if(!window._ail) return;
  if(!cur.exercises) cur.exercises=[];
  window._ail.forEach(function(e){ cur.exercises.push(Object.assign({},e,{id:Date.now()+Math.random()})); });
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); cm(); rex();
  var sp=document.querySelectorAll("#ptbs .nb"); if(sp[0]&&sp[0].querySelector("span")) sp[0].querySelector("span").textContent=cur.exercises.length;
}

function aiev(){
  var btn=g("evb"); if(!cur) return;
  if(!AI_KEY){ if(btn) btn.textContent="Add API key first"; return; }
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="spb"></span>'+L().gn; }
  callClaude("Expert sports physiotherapist. Clinical evaluation:\nName:"+cur.name+", Sport:"+cur.sport+", Age:"+(cur.age||"?")+", Injury:"+(cur.injury||"none")+", Notes:"+(cur.notes||"none")+", Sessions:"+(cur.sessions||0)+"\nProvide:\n1. CLINICAL ASSESSMENT\n2. DIFFERENTIAL DIAGNOSIS\n3. REHAB PROTOCOL (Phase 1 Acute / Phase 2 Sub-acute / Phase 3 Functional / Phase 4 Return to Sport)\n4. MANUAL THERAPY\n5. RED FLAGS\n6. PROGNOSIS\n7. SPORT-SPECIFIC for "+cur.sport+"\nEvidence-based. Clear headers.",2000,function(err,txt){
    if(!err){ cur.eval=txt; pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); rcl(); }
    else if(btn){ btn.disabled=false; btn.textContent=L().aie; }
  });
}

// ── PDF Export ──
function dprint(id){
  var p=pts.find(function(x){ return x.id===id; }); if(!p) return;
  var today=new Date().toLocaleDateString("en-IL");
  var logoUrl=window.location.origin+"/ElitePhysioLogo.png";

  // Collect all exercises across plans
  var allExercises=[];
  var planSections="";
  if((p.workoutPlans||[]).length>0){
    (p.workoutPlans||[]).forEach(function(plan){
      var planName=plan.name;
      if(plan.type==="repeating"){
        (plan.days||[]).forEach(function(day){
          if((day.exercises||[]).length>0){
            planSections+='<div class="plan-section">'+
              '<div class="plan-header">'+planName+' — '+day.name+'</div>'+
              day.exercises.map(function(e,i){ return exRow(e,i); }).join("")+
            '</div>';
          }
        });
      } else {
        (plan.phases||[]).forEach(function(ph){
          (ph.days||[]).forEach(function(day){
            if((day.exercises||[]).length>0){
              planSections+='<div class="plan-section">'+
                '<div class="plan-header">'+planName+' › '+(ph.name||"")+(ph.weeks?' ('+ph.weeks+' wk)':'')+' › '+day.name+'</div>'+
                day.exercises.map(function(e,i){ return exRow(e,i); }).join("")+
              '</div>';
            }
          });
        });
      }
    });
  } else if((p.exercises||[]).length>0){
    planSections='<div class="plan-section">'+
      '<div class="plan-header">Exercise Plan</div>'+
      (p.exercises||[]).map(function(e,i){ return exRow(e,i); }).join("")+
    '</div>';
  }

  function exRow(e,i){
    var isHe=e.displayLng==="he"||(!e.displayLng&&!e.name&&e.nameHe);
    var eName=isHe&&e.nameHe?e.nameHe:(e.name||e.nameHe);
    var eDesc=isHe&&e.descHe?e.descHe:(e.desc||e.descHe);
    var eTips=isHe&&e.tipsHe?e.tipsHe:(e.tips||e.tipsHe);
    var dir=isHe?"direction:rtl;text-align:right":"";
    return '<div class="ex" style="'+dir+'">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline">'+
      '<span class="ex-name">'+(i+1)+'. '+eName+'</span>'+
      '<span class="ex-sets">'+e.sets+' × '+e.reps+'</span>'+
      '</div>'+
      (eDesc?'<div class="ex-desc">'+eDesc+'</div>':"")+
      (eTips?'<div class="ex-tips">'+eTips+'</div>':"")+
      '</div>';
  }

  var h='<!DOCTYPE html><html><head><meta charset="utf-8">'+
    '<title>ElitePhysio — '+p.name+'</title>'+
    '<style>'+
    '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap");'+
    '*{box-sizing:border-box;margin:0;padding:0}'+
    'body{font-family:"Inter",Arial,sans-serif;background:#fff;color:#1a2535;font-size:13px;line-height:1.5}'+
    '.page{max-width:780px;margin:0 auto;padding:40px 48px}'+
    // Header
    '.hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px;margin-bottom:28px;border-bottom:2px solid #1a3a6e}'+
    '.logo-wrap{display:flex;align-items:center;gap:14px}'+
    '.logo-wrap img{width:56px;height:56px;object-fit:contain}'+
    '.clinic-name{font-size:20px;font-weight:700;color:#1a3a6e;letter-spacing:-0.3px}'+
    '.clinic-sub{font-size:10px;color:#4a6a8a;text-transform:uppercase;letter-spacing:1.5px;margin-top:1px}'+
    '.doc-meta{text-align:right}'+
    '.doc-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#2B6CC4;margin-bottom:3px}'+
    '.doc-date{font-size:11px;color:#4a6a8a}'+
    // Patient card
    '.patient-card{background:#f5f8ff;border-radius:10px;padding:18px 22px;margin-bottom:26px;border-left:4px solid #2B6CC4;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}'+
    '.info-item label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#4a6a8a;display:block;margin-bottom:3px}'+
    '.info-item span{font-size:13px;font-weight:600;color:#1a2535}'+
    '.patient-name{grid-column:1/-1;border-bottom:1px solid #d0dae8;padding-bottom:12px;margin-bottom:4px}'+
    '.patient-name span{font-size:20px;font-weight:700;color:#1a3a6e}'+
    (p.notes?'.notes{background:#fff8e8;border-radius:8px;padding:12px 16px;margin-bottom:22px;font-size:12px;border-left:3px solid #e67e22;color:#1a2535}':'')+ 
    // Plan sections
    '.plan-section{margin-bottom:26px}'+
    '.plan-header{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2B6CC4;background:#eef4ff;border-radius:6px;padding:6px 12px;margin-bottom:10px}'+
    // Exercise rows
    '.ex{padding:10px 14px;margin-bottom:6px;border-radius:7px;border:1px solid #e0e8f5;background:#fff;display:block}'+
    '.ex:nth-child(even){background:#fafcff}'+
    '.ex-name{font-size:13px;font-weight:600;color:#1a3a6e}'+
    '.ex-sets{font-size:12px;font-weight:700;color:#2B6CC4;white-space:nowrap;margin-left:8px}'+
    '.ex-desc{font-size:11px;color:#4a6a8a;margin-top:3px}'+
    '.ex-tips{font-size:11px;color:#00875a;margin-top:2px;font-style:italic}'+
    // Notes/follow-ups
    '.fu{padding:9px 14px;margin-bottom:7px;border-radius:7px;border:1px solid #e0e8f5;background:#fafcff}'+
    '.fu-date{font-size:10px;color:#4a6a8a;font-weight:600;margin-bottom:3px}'+
    '.fu-note{font-size:12px;color:#1a2535}'+
    // Footer
    '.foot{margin-top:36px;padding-top:14px;border-top:1px solid #e0e8f5;display:flex;justify-content:space-between;align-items:center}'+
    '.foot-left{font-size:10px;color:#4a6a8a;line-height:1.7}'+
    '.foot-right{font-size:10px;color:#4a6a8a;text-align:right;line-height:1.7}'+
    '.confidential{display:inline-block;background:#fff0f0;color:#c0392b;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;border:1px solid #ffd0d0;margin-top:4px}'+
    '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:28px 36px}}'+
    '</style></head><body>'+
    '<div class="page">'+
    // Header with logo
    '<div class="hdr">'+
    '<div class="logo-wrap">'+
    '<img src="'+logoUrl+'" alt="ElitePhysio Logo" onerror="this.style.display=\'none\'">'+
    '<div><div class="clinic-name">ElitePhysio</div>'+
    '<div class="clinic-sub">Sports Physiotherapy Institute · Yoqneam</div></div></div>'+
    '<div class="doc-meta">'+
    '<div class="doc-title">Exercise Prescription</div>'+
    '<div class="doc-date">Date: '+today+'</div>'+
    '<div class="doc-date">Ref: EP-'+id+'</div>'+
    '</div></div>'+
    // Patient card
    '<div class="patient-card">'+
    '<div class="patient-name info-item"><label>Patient</label><span>'+(p.name||p.nameHe)+'</span></div>'+
    '<div class="info-item"><label>Sport / Activity</label><span>'+(p.sport||"—")+'</span></div>'+
    '<div class="info-item"><label>Age</label><span>'+(p.age||"—")+'</span></div>'+
    '<div class="info-item"><label>Status</label><span>'+(p.status||"Active")+'</span></div>'+
    '<div class="info-item"><label>Condition</label><span>'+(p.injury||"—")+'</span></div>'+
    '<div class="info-item"><label>Sessions</label><span>'+(p.sessions||0)+'</span></div>'+
    '</div>'+
    (p.notes?'<div class="notes"><strong>Clinical Notes:</strong> '+p.notes+'</div>':"")+
    // Exercise plans
    planSections+
    // Follow-ups
    ((p.followUps||[]).length?
    '<div style="margin-bottom:26px"><div class="plan-header">Progress Notes</div>'+
    (p.followUps||[]).map(function(f){
      return '<div class="fu"><div class="fu-date">'+f.date+'</div><div class="fu-note">'+f.note+'</div></div>';
    }).join("")+'</div>':"")+
    // Footer
    '<div class="foot">'+
    '<div class="foot-left"><strong>ElitePhysio</strong> — Sports Physiotherapy Institute<br>'+
    'מכון פיזיותרפיה לספורטאים · יקנעם עילית<br>'+
    '<span class="confidential">Confidential Medical Document</span></div>'+
    '<div class="foot-right">Generated: '+today+'<br>'+
    'This document is intended for the named patient only.<br>'+
    'ElitePhysio © '+new Date().getFullYear()+'</div>'+
    '</div>'+
    '</div>'+
    '<scr'+'ipt>window.onload=function(){window.print();}<\/scr'+'ipt></body></html>';

  var b=new Blob([h],{type:"text/html"}); var u=URL.createObjectURL(b);
  var a=document.createElement("a"); a.href=u; a.target="_blank"; document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(u); },1000);
}

// ── Init ──
pts = lload() || DM;
loadRecycleBin();
setL("he");
// Restore session on refresh
var _sess = null;
try{ _sess = JSON.parse(sessionStorage.getItem("ep_session")); }catch(e){}
if(_sess && _sess.auth){
  auth = _sess.auth;
  lng = _sess.lng || "he";
  if(auth === "admin"){
    ADMIN_TOKEN = _sess.token || "";
    SB_KEY = _sess.sbKey || "";
    ss2("a"); setL(lng); gv("d");
    if(SB_KEY) sbLoad(function(){ rd(); });
  } else {
    // Patient session - fetch fresh data from Supabase via worker
    ss2("p"); setL(lng);
    var _cachedP = pts.find(function(p){ return p.id === auth; });
    if(_cachedP){ cur=_cachedP; rpv(); }
    // Always fetch fresh from server to get latest exercises
    apiCall("patient-login-by-id","POST",{id:auth},function(err,d){
      if(!err && d && d.ok && d.patient){
        var p=fromRow(d.patient);
        // Restore avatarId from session if not yet saved to server
        if(!p.avatarId && _sess.avatarId) p.avatarId=_sess.avatarId;
        pts=[p]; lsave(); cur=p; rpv();
      } else if(!_cachedP){
        // No cache and no server data - back to login
        dout();
      }
    });
  }
} else {
  ss2("l");
  setL("he");
}
