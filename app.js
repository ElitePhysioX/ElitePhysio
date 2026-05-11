/* ═══════════════════════════════════════
   ElitePhysio — app.js
   All application logic and rendering
═══════════════════════════════════════ */

// ── App State ──
var APW = "elitephysio2024";   // Admin password
var SK  = "ep12";              // localStorage key
var AI_KEY = "";               // Set your Anthropic API key here
var pts = [], lng = "en", auth = null, cur = null, ctab = "ex", ptab = "ex", stmr = null, mmode = "";

// ── Helpers ──
function L(){ return T[lng]; }
function g(id){ return document.getElementById(id); }

function av(n, s){
  s = s || 38;
  var i = (n || "?").split(" ").map(function(x){ return x[0]; }).join("").slice(0, 2);
  return '<div class="av" style="width:'+s+'px;height:'+s+'px;font-size:'+(s>44?17:13)+'px">'+i+'</div>';
}
function bdg(t, c){ c = c || "#2B6CC4"; return '<span class="bdg" style="background:'+c+'15;color:'+c+';border:1px solid '+c+'40">'+t+'</span>'; }
function sbdg(s){ return bdg(s || "Active", SC[s] || "#2B6CC4"); }
function waLink(p){
  return p.phone ? '<a href="https://wa.me/972'+p.phone.replace(/^0/,"").replace(/-/g,"")
    +'" target="_blank" onclick="event.stopPropagation()" style="font-size:12px;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 8px;text-decoration:none;font-weight:600">'+L().wa+'</a>' : "";
}
function ytUrl(n){ return "https://www.youtube.com/results?search_query="+encodeURIComponent((n||"exercise")+" physical therapy technique"); }

// ── Storage ──
function lsave(){ try{ localStorage.setItem(SK, JSON.stringify(pts)); }catch(e){} }
function lload(){ try{ var d = localStorage.getItem(SK); if(d) return JSON.parse(d); }catch(e){} return null; }
function sv(){
  clearTimeout(stmr);
  stmr = setTimeout(function(){
    g("svi").style.display = "flex";
    lsave();
    setTimeout(function(){ g("svi").style.display = "none"; }, 700);
  }, 300);
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
  } else if(auth) {
    if(lng==="he" && cur){
      autoTranslateExercises(cur, function(){ renderPatientView(cur); });
    } else {
      rpv();
    }
  }
}

// ── Auth ──
function toggleAdmin(){ var box=g("admin-box"); box.classList.toggle("hid"); if(!box.classList.contains("hid")) g("apw").focus(); }
function ss2(s){ g("LS").classList.toggle("hid",s!=="l"); g("AS").classList.toggle("hid",s!=="a"); g("PS").classList.toggle("hid",s!=="p"); }
function alog(){
  if(g("apw").value===APW){ auth="admin"; g("apw").value=""; ss2("a"); gv("d"); }
  else{ g("le1").textContent="Incorrect password."; g("le1").style.display="block"; }
}
function normName(s){ return (s||"").trim().toLowerCase().replace(/\s+/g," "); }
function plog(){
  var entered=normName(g("pnm").value), pi=g("ppi").value.trim(), m=null;
  for(var i=0;i<pts.length;i++){
    var p=pts[i];
    if((normName(p.name)===entered||(p.nameHe&&normName(p.nameHe)===entered))&&p.pin===pi){ m=p; break; }
  }
  if(m){ auth=m.id; cur=m; ptab="ex"; g("ppi").value=""; ss2("p"); rpv(); }
  else{ g("le2").textContent=L().le; g("le2").style.display="block"; }
}
function dout(){ auth=null; cur=null; ss2("l"); g("le2").style.display="none"; g("le1").style.display="none"; }

// ── Navigation ──
function gv(v){
  ["d","p","s","pat"].forEach(function(x){ g("v"+(x==="pat"?"pat":x)).classList.add("hid"); });
  g("v"+(v==="pat"?"pat":v)).classList.remove("hid");
  ["d","p","s"].forEach(function(x){ var nb=g("nb"+x); if(nb) nb.classList.toggle("on",x===v||(x==="p"&&v==="pat")); });
  if(v==="d") rd();
  else if(v==="p") rpl();
  else if(v==="s") rs();
}

// ── Dashboard ──
function rd(){
  var tx=pts.reduce(function(a,p){ return a+(p.exercises||[]).length; },0);
  var sc={}; pts.forEach(function(p){ sc[p.sport]=(sc[p.sport]||0)+1; });
  var ts=Object.entries(sc).sort(function(a,b){ return b[1]-a[1]; })[0];
  var fc=pts.reduce(function(a,p){ return a+(p.followUps||[]).length; },0);
  g("vd").innerHTML=
    '<div style="margin-bottom:22px"><div style="font-size:24px;font-weight:800;color:#1a3a6e">Good day, ElitePhysio &#128075;</div>'+
    '<div style="font-size:13px;color:#4a6a8a;margin-top:3px">'+L().sub+'</div></div>'+
    '<div class="g2" style="margin-bottom:24px">'+
    [["#2B6CC4",pts.length,L().to],["#00a86b",tx,L().ex],["#d97706",ts?ts[0]:"—","Top Sport"],["#7c3aed",fc,L().fu]].map(function(x){
      return '<div class="stat-card"><div class="accent-bar" style="background:linear-gradient(90deg,'+x[0]+','+x[0]+'80)"></div>'+
        '<div style="font-size:28px;font-weight:800;color:'+x[0]+'">'+x[1]+'</div>'+
        '<div style="font-size:11px;color:#4a6a8a;text-transform:uppercase;letter-spacing:.8px;margin-top:3px">'+x[2]+'</div></div>';
    }).join("")+'</div>'+
    '<div class="row"><span class="st">'+L().rp2+'</span><button class="btn" style="font-size:12px" onclick="gv(\'p\')">'+L().va+'</button></div>'+
    pts.slice(0,4).map(function(p){
      return '<div class="card" onclick="op('+p.id+')"><div style="display:flex;align-items:center;justify-content:space-between">'+
        '<div style="display:flex;align-items:center;gap:13px">'+av(p.name)+
        '<div><div class="pat-name">'+p.name+'</div><div class="pat-sub">'+(p.injury||"—")+'</div></div></div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'+bdg(p.sport)+' '+sbdg(p.status)+'</div></div></div>';
    }).join("");
}

// ── Patient List ──
function rpl(){
  var q=(g("psr").value||"").toLowerCase();
  var list=pts.filter(function(p){ return p.name.toLowerCase().includes(q)||p.sport.toLowerCase().includes(q)||(p.injury||"").toLowerCase().includes(q); });
  g("ptit").textContent=L().pats+" ("+pts.length+")";
  g("pls").innerHTML=list.length?list.map(function(p){
    return '<div class="card" onclick="op('+p.id+')"><div style="display:flex;align-items:center;justify-content:space-between">'+
      '<div style="display:flex;align-items:center;gap:13px">'+av(p.name)+
      '<div><div class="pat-name">'+p.name+'</div><div class="pat-sub">'+(p.injury||"—")+' &middot; '+(p.age||"—")+'</div></div></div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'+bdg(p.sport)+' '+sbdg(p.status)+'</div></div></div>';
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
      return '<div class="xcard" style="cursor:pointer" onclick="op('+p.id+')"><div style="display:flex;align-items:center;justify-content:space-between">'+
        '<div style="display:flex;align-items:center;gap:10px">'+av(p.name)+
        '<div><div class="pat-name">'+p.name+'</div><div class="pat-sub">'+p.sport+' &middot; '+(p.sessions||0)+' sessions</div></div></div>'+
        '<div style="display:flex;gap:6px;align-items:center">'+sbdg(p.status)+' '+waLink(p)+'</div></div></div>';
    }).join("")+(([].concat(lds,drp)).length===0?'<div style="color:#4a6a8a;font-size:14px">No follow-ups needed.</div>':"")+
    '<div style="background:rgba(43,108,196,0.07);border:1px solid rgba(43,108,196,0.2);border-radius:9px;padding:13px 16px;margin-top:12px;font-size:13px;color:#1a2535;line-height:2.2">'+
    L().t1+'<br>'+L().t2+'<br>'+L().t3+'</div></div>';
  g("vs").innerHTML=html;
}

// ── Open Patient ──
function op(id){ cur=pts.find(function(p){ return p.id===id; }); ctab="ex"; gv("pat"); rpd(); }

// ── Patient Detail (Admin) ──
function rpd(){
  var p=cur; if(!p) return;
  g("pbk").textContent=L().bk;
  g("phd").innerHTML=
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">'+
    '<div style="display:flex;align-items:center;gap:15px">'+av(p.name,54)+'<div>'+
    '<div style="font-size:22px;font-weight:800;color:#1a3a6e">'+p.name+'</div>'+
    '<div style="display:flex;align-items:center;gap:7px;margin-top:6px;flex-wrap:wrap">'+bdg(p.sport)+' '+sbdg(p.status)+
    (p.age?'<span style="font-size:12px;color:#4a6a8a">'+p.age+'y</span>':"")+
    '<span style="font-size:11px;color:#4a6a8a;border:1px solid rgba(43,108,196,0.25);border-radius:4px;padding:2px 8px">PIN: '+p.pin+'</span>'+
    waLink(p)+'</div></div></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn" style="font-size:12px" onclick="dprint('+p.id+')">'+L().pdf+'</button>'+
    '<button class="btn" style="font-size:12px" onclick="om(\'ep\')">'+L().ed+'</button>'+
    '<button class="btn btnd" style="font-size:12px" onclick="dp('+p.id+')">'+L().dl+'</button></div></div>'+
    (p.injury?'<div style="margin-top:13px;background:rgba(43,108,196,0.08);border-radius:8px;padding:11px 15px;border-left:3px solid #2B6CC4"><div style="font-size:11px;color:#2B6CC4;font-weight:700;text-transform:uppercase;margin-bottom:3px">'+L().ij+'</div><div style="font-size:14px;color:#1a2535">'+p.injury+'</div></div>':"")+
    (p.notes?'<div style="margin-top:8px;background:rgba(0,168,107,0.07);border-radius:8px;padding:11px 15px;border-left:3px solid #00a86b"><div style="font-size:11px;color:#00a86b;font-weight:700;text-transform:uppercase;margin-bottom:3px">'+L().no+'</div><div style="font-size:14px;color:#1a2535">'+p.notes+'</div></div>':"");
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

// ── Exercises ──
function rex(){
  var p=cur;
  g("pet").innerHTML=
    '<div class="row"><span class="st">'+L().ex+'</span><div style="display:flex;gap:8px">'+
    '<button class="btn btnpu" style="font-size:12px" onclick="ais()">'+L().ai+'</button>'+
    '<button class="btn" style="font-size:12px" onclick="om(\'ae\')">'+L().ae+'</button></div></div>'+
    (!(p.exercises||[]).length?'<div style="color:#4a6a8a;font-size:14px;padding:14px 0">'+L().nx+'</div>':"")+
    (p.exercises||[]).map(function(e,i){
      return '<div class="xcard"><div style="display:flex;justify-content:space-between;align-items:flex-start">'+
        '<div style="flex:1"><div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'+bdg("#"+(i+1))+
        '<span style="font-weight:700;font-size:15px;color:#1a3a6e">'+e.name+'</span></div>'+
        '<div style="font-size:13px;color:#4a6a8a;margin-bottom:3px">'+e.sets+' sets &times; '+e.reps+'</div>'+
        (e.desc?'<div style="font-size:13px;color:#1a2535;margin-bottom:3px">'+e.desc+'</div>':"")+
        (e.tips?'<div style="font-size:13px;color:#00a86b;margin-bottom:8px">&#128161; '+e.tips+'</div>':"")+
        '<a href="'+ytUrl(e.name)+'" target="_blank" style="font-size:12px;color:#6d28d9;border:1px solid rgba(109,40,217,0.3);border-radius:5px;padding:4px 11px;text-decoration:none;font-weight:600;display:inline-block">'+L().wv+'</a></div>'+
        '<button class="btn btnd" style="padding:4px 9px;font-size:12px;margin-left:8px" onclick="de('+e.id+')">&#10005;</button></div></div>';
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
  // Auto-translate exercises if Hebrew is selected
  if(lng==="he"){
    autoTranslateExercises(p, function(){ renderPatientView(p); });
  } else {
    renderPatientView(p);
  }
}

function renderPatientView(p){
  g("psh").innerHTML=
    '<div style="display:flex;align-items:center;gap:15px;margin-bottom:14px">'+av(p.name,52)+
    '<div><div style="font-size:21px;font-weight:800;color:#1a3a6e">'+p.name+'</div>'+
    '<div style="margin-top:5px">'+bdg(p.sport)+'</div></div></div>'+
    (p.injury?'<div style="background:rgba(43,108,196,0.08);border-radius:8px;padding:11px 15px;border-left:3px solid #2B6CC4;margin-bottom:8px">'+
    '<div style="font-size:11px;color:#2B6CC4;font-weight:700;text-transform:uppercase;margin-bottom:3px">'+L().ij+'</div>'+
    '<div style="font-size:14px;color:#1a2535">'+p.injury+'</div></div>':"")+
    (p.notes?'<div style="background:rgba(0,168,107,0.07);border-radius:8px;padding:11px 15px;border-left:3px solid #00a86b">'+
    '<div style="font-size:11px;color:#00a86b;font-weight:700;text-transform:uppercase;margin-bottom:3px">'+L().no+'</div>'+
    '<div style="font-size:14px;color:#1a2535">'+p.notes+'</div></div>':"");
  g("pstb").innerHTML=[["ex",L().mp,(p.exercises||[]).length],["fu",L().mn,(p.followUps||[]).length]].map(function(t){
    return '<button class="nb'+(ptab===t[0]?" on":"")+'" onclick="spt(\''+t[0]+'\')">'+t[1]+
      ' <span style="background:rgba(255,255,255,0.25);border-radius:9px;padding:1px 7px;font-size:11px">'+t[2]+'</span></button>';
  }).join("");
  g("psex").innerHTML=(p.exercises||[]).length?(p.exercises||[]).map(function(e,i){
    var isHe=lng==="he";
    var eName = isHe&&e.nameHe ? e.nameHe : e.name;
    var eDesc = isHe&&e.descHe ? e.descHe : e.desc;
    var eTips = isHe&&e.tipsHe ? e.tipsHe : e.tips;
    return '<div class="xcard" style="direction:'+(isHe?"rtl":"ltr")+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'+bdg("#"+(i+1))+
      '<span style="font-weight:700;font-size:15px;color:#1a3a6e">'+eName+'</span></div>'+
      '<div style="font-size:13px;color:#4a6a8a;margin-bottom:3px">'+e.sets+' &times; '+e.reps+'</div>'+
      (eDesc?'<div style="font-size:13px;color:#1a2535;margin-bottom:3px">'+eDesc+'</div>':"")+
      (eTips?'<div style="font-size:13px;color:#00a86b;margin-bottom:8px">&#128161; '+eTips+'</div>':"")+
      '<a href="'+ytUrl(eName)+'" target="_blank" style="font-size:12px;color:#6d28d9;border:1px solid rgba(109,40,217,0.3);border-radius:5px;padding:4px 11px;text-decoration:none;font-weight:600;display:inline-block">'+L().wv+'</a></div>';
  }).join(""):'<div style="color:#4a6a8a;font-size:14px;padding:14px 0">'+L().nx+'</div>';
  g("psfu").innerHTML=(p.followUps||[]).length?(p.followUps||[]).map(function(f){
    return '<div class="xcard"><div style="font-size:12px;color:#2B6CC4;font-weight:600;margin-bottom:4px">'+f.date+'</div>'+
      '<div style="font-size:14px;color:#1a2535;line-height:1.7">'+f.note+'</div></div>';
  }).join(""):'<div style="color:#4a6a8a;font-size:14px;padding:14px 0">'+L().nf+'</div>';
  spt(ptab);
}
function spt(t){ ptab=t; document.querySelectorAll("#pstb .nb").forEach(function(b,i){ b.classList.toggle("on",["ex","fu"][i]===t); }); g("psex").classList.toggle("hid",t!=="ex"); g("psfu").classList.toggle("hid",t!=="fu"); }

// ── Modals ──
function om(m){
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
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.sp+'</label><select class="inp" id="fsp"><option value="">'+Lx.ss+'</option>'+SP.map(function(s){ return '<option'+(p.sport===s?" selected":"")+'>'+s+'</option>'; }).join("")+'</select></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.no+'</label><textarea class="inp" id="fno" style="height:68px">'+(p.notes||"")+'</textarea></div></div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btnd" onclick="cm()">'+Lx.ca+'</button><button class="btn" onclick="sp2()">'+Lx.sa+'</button></div>';
  } else if(m==="ae"){
    c.innerHTML='<div style="font-size:17px;font-weight:800;margin-bottom:18px;color:#1a3a6e">'+Lx.ae+'</div>'+
      '<div class="g2" style="gap:11px;margin-bottom:11px">'+
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.en2+'</label><input class="inp" id="fen"></div>'+
      '<div><label class="lbl">'+Lx.se+'</label><input class="inp" id="fse"></div>'+
      '<div><label class="lbl">'+Lx.rp+'</label><input class="inp" id="frp"></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.de+'</label><textarea class="inp" id="fde" style="height:56px"></textarea></div>'+
      '<div style="grid-column:1/-1"><label class="lbl">'+Lx.ti+'</label><textarea class="inp" id="fti" style="height:56px"></textarea></div></div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btnd" onclick="cm()">'+Lx.ca+'</button><button class="btn" onclick="se2()">'+Lx.sa+'</button></div>';
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

// ── Save patient / exercise / follow-up ──
function sp2(){
  var nm=g("fn").value.trim(), sp=g("fsp").value; if(!nm||!sp) return;
  var d={name:nm,nameHe:g("fnhe").value.trim(),sport:sp,age:g("fa").value,phone:g("fph").value,injury:g("fij").value,pin:g("fpi").value||"0000",status:g("fst").value,notes:g("fno").value};
  if(mmode==="ep"&&cur){ Object.assign(cur,d); pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); }
  else{ pts.push(Object.assign({},d,{id:Date.now(),sessions:0,startDate:new Date().toISOString().split("T")[0],exercises:[],followUps:[],files:[],eval:""})); }
  sv(); cm(); rpl(); if(mmode==="ep") rpd();
}
function dp(id){ pts=pts.filter(function(p){ return p.id!==id; }); sv(); gv("p"); }
function se2(){
  var n=g("fen").value.trim(); if(!n) return;
  var e={id:Date.now(),name:n,nameHe:g("fenhe")?g("fenhe").value.trim():"",sets:g("fse").value,reps:g("frp").value,desc:g("fde").value,descHe:g("fdehe")?g("fdehe").value.trim():"",tips:g("fti").value,tipsHe:g("ftihe")?g("ftihe").value.trim():""};
  if(!cur.exercises) cur.exercises=[];
  cur.exercises.push(e);
  pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); cm(); rex();
  var sp=document.querySelectorAll("#ptbs .nb"); if(sp[0]&&sp[0].querySelector("span")) sp[0].querySelector("span").textContent=cur.exercises.length;
}
function de(eid){ cur.exercises=(cur.exercises||[]).filter(function(e){ return e.id!==eid; }); pts=pts.map(function(p){ return p.id===cur.id?cur:p; }); sv(); rex(); }
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
  if(!AI_KEY){ cb(); return; }
  var needsTranslation = (p.exercises||[]).filter(function(e){
    return !e.nameHe || !e.descHe;
  });
  if(!needsTranslation.length){ cb(); return; }

  var list = needsTranslation.map(function(e){
    return {id:e.id, name:e.name, desc:e.desc||"", tips:e.tips||""};
  });

  callClaude(
    "You are a physical therapy translator. Translate these exercises to Hebrew. " +
    "Return ONLY a JSON array, no markdown, no explanation:\n" +
    JSON.stringify(list) + "\n" +
    "Format: [{\"id\":same_id,\"nameHe\":\"...\",\"descHe\":\"...\",\"tipsHe\":\"...\"}]",
    1000,
    function(err, txt){
      if(!err){
        try{
          var translated = JSON.parse(txt.replace(/```json|```/g,"").trim());
          translated.forEach(function(t){
            var ex = (p.exercises||[]).find(function(e){ return e.id===t.id; });
            if(ex){ ex.nameHe=t.nameHe; ex.descHe=t.descHe; ex.tipsHe=t.tipsHe; }
          });
          pts = pts.map(function(x){ return x.id===p.id?p:x; });
          sv();
        }catch(e2){}
      }
      cb();
    }
  );
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
  var h='<!DOCTYPE html><html><head><meta charset="utf-8"><title>ElitePhysio \u2014 '+p.name+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#fff;color:#1a2535;padding:36px}'+
    '.hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #2B6CC4;padding-bottom:16px;margin-bottom:24px}'+
    'h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2B6CC4;border-bottom:1px solid #c8d8ee;padding-bottom:7px;margin:20px 0 12px}'+
    '.ig{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}'+
    '.ii label{font-size:10px;text-transform:uppercase;color:#4a6a8a;display:block;margin-bottom:2px}.ii span{font-size:13px;font-weight:600}'+
    '.ex{border:1px solid #c8d8ee;border-radius:9px;padding:13px 16px;margin-bottom:9px;background:#f8fbff;border-left:3px solid #2B6CC4}'+
    '.fu{border-left:3px solid #2B6CC4;padding:9px 14px;margin-bottom:8px;background:#eef4ff;border-radius:0 7px 7px 0}'+
    '.foot{margin-top:32px;border-top:1px solid #c8d8ee;padding-top:14px;font-size:10px;color:#4a6a8a;text-align:center;line-height:2}'+
    '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'+
    '<div class="hdr"><div><div style="font-size:22px;font-weight:800;color:#2B6CC4">ElitePhysio</div>'+
    '<div style="font-size:10px;color:#4a6a8a;text-transform:uppercase;letter-spacing:1.2px">\u05de\u05db\u05d5\u05df \u05e4\u05d9\u05d6\u05d9\u05d5\u05ea\u05e8\u05e4\u05d9\u05d4 \u05dc\u05e1\u05e4\u05d5\u05e8\u05d8\u05d0\u05d9\u05dd &middot; Yoqneam Ilit</div></div>'+
    '<div style="text-align:right"><div style="font-size:18px;font-weight:700">'+p.name+'</div>'+
    '<div style="font-size:12px;color:#2B6CC4;font-weight:600;margin-top:2px">'+p.sport+'</div>'+
    '<div style="font-size:11px;color:#4a6a8a;margin-top:2px">'+today+'</div></div></div>'+
    '<h2>Patient Info</h2><div class="ig">'+
    '<div class="ii"><label>Sport</label><span>'+p.sport+'</span></div>'+
    '<div class="ii"><label>Age</label><span>'+(p.age||"\u2014")+'</span></div>'+
    '<div class="ii"><label>Phone</label><span>'+(p.phone||"\u2014")+'</span></div>'+
    '<div class="ii"><label>Condition</label><span>'+(p.injury||"\u2014")+'</span></div>'+
    '<div class="ii"><label>Status</label><span>'+(p.status||"\u2014")+'</span></div>'+
    '<div class="ii"><label>Sessions</label><span>'+(p.sessions||0)+'</span></div></div>'+
    (p.notes?'<div style="background:#eef4ff;border-radius:8px;padding:11px 15px;font-size:13px;color:#1a2535;margin-bottom:4px">'+p.notes+'</div>':"")+
    '<h2>Exercise Plan ('+( p.exercises||[]).length+')</h2>'+
    (p.exercises||[]).map(function(e,i){ return '<div class="ex"><div style="font-size:15px;font-weight:700;margin-bottom:4px">'+(i+1)+'. '+e.name+'</div>'+
      '<div style="font-size:12px;color:#4a6a8a;margin-bottom:3px">'+e.sets+' sets &times; '+e.reps+'</div>'+
      (e.desc?'<div style="font-size:12px;color:#1a2535;margin-bottom:3px">'+e.desc+'</div>':"")+
      (e.tips?'<div style="font-size:12px;color:#2B6CC4;font-weight:600">&#128161; '+e.tips+'</div>':"")+
      '</div>'; }).join("")||'<p style="color:#4a6a8a;font-size:13px">No exercises assigned yet.</p>'+
    ((p.followUps||[]).length?'<h2>Progress Notes</h2>'+(p.followUps||[]).map(function(f){ return '<div class="fu"><div style="font-size:10px;color:#4a6a8a;margin-bottom:3px">'+f.date+'</div><div style="font-size:13px">'+f.note+'</div></div>'; }).join(""):"")+
    '<div class="foot"><strong>ElitePhysio</strong> \u2014 \u05de\u05db\u05d5\u05df \u05e4\u05d9\u05d6\u05d9\u05d5\u05ea\u05e8\u05e4\u05d9\u05d4 \u05dc\u05e1\u05e4\u05d5\u05e8\u05d8\u05d0\u05d9\u05dd<br>'+
    '\u05e4\u05d9\u05d6\u05d9\u05d5\u05ea\u05e8\u05e4\u05d9\u05d4 \u05dc\u05e1\u05e4\u05d5\u05e8\u05d8\u05d0\u05d9\u05dd \u05e9\u05e8\u05d5\u05e6\u05d9\u05dd \u05dc\u05d4\u05d2\u05d9\u05e2 \u05dc\u05e7\u05e6\u05d4 \u05d4\u05d9\u05db\u05d5\u05dc\u05ea &middot; Yoqneam Ilit<br>Generated: '+today+'</div>'+
    '<scr'+'ipt>window.onload=function(){window.print();}<\/scr'+'ipt></body></html>';
  var b=new Blob([h],{type:"text/html"}); var u=URL.createObjectURL(b);
  var a=document.createElement("a"); a.href=u; a.target="_blank"; document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(u); },1000);
}

// ── Init ──
pts = lload() || DM;
ss2("l");
setL("en");
