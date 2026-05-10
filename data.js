/* ═══════════════════════════════════════
   ElitePhysio — data.js
   Translations, static lists, demo patients
═══════════════════════════════════════ */

// ── UI Text translations (English & Hebrew) ──
var T = {
  en: {
    tagline:"Sports Institute for Athletes", sub:"Sports PT · Yoqneam Ilit",
    dash:"Dashboard", pats:"Patients", stats:"Analytics", lo:"Log Out",
    ap:"ADMIN PASSWORD", yn:"YOUR NAME", yp:"PIN CODE",
    le:"Name or PIN not found. Please try again.",
    welcome:"Welcome", intro:"Enter your name and PIN to access your plan",
    enterplan:"Enter My Plan", adminlink:"Admin access", al:"Admin Login",
    bk:"\u2190 Back", ed:"Edit", dl:"Delete", pdf:"Export PDF", wa:"WhatsApp",
    np:"+ New Patient", sr:"Search...", ex:"Exercises", fu:"Follow-Ups", cl:"Clinical",
    ae:"+ Add Exercise", ai:"\u2756 AI Suggest", an:"+ Add Note", up:"+ Upload File",
    nx:"No exercises yet.", nf:"No notes yet.", nfi:"No files yet.",
    sv:"Saving...", ca:"Cancel", sa:"Save", aa:"Add All", wv:"\u25b6 Watch Video",
    aie:"\u2756 AI Evaluation", ah:"Admin only \u2014 hidden from patient",
    nm:"Full Name (EN)", nmhe:"Full Name (\u05e2\u05d1\u05e8\u05d9\u05ea)", ag:"Age",
    ph:"Phone", sp:"Sport", ss:"Select sport...", no:"Notes", ij:"Injury / Condition",
    pi:"PIN (4 digits)", st:"Status", se:"Sets", rp:"Reps / Duration",
    de:"Description", ti:"Tips for Patient", en2:"Exercise Name",
    dt:"Date", nt:"Session Note", np2:"Pain, progress, observations...",
    npt:"New Patient", ept:"Edit Patient", to:"Total", ac:"Active", dr:"Dropped",
    nl:"New Leads", rt:"Retention", ax:"Avg Exercises", fl:"Follow-Up List",
    ins:"Insights", t1:"\u{1F4A1} Add a 2-week check-in to reduce early dropout.",
    t2:"\u{1F4A1} Aim for 3+ exercises per patient for adherence.",
    t3:"\u{1F4A1} WhatsApp 'On Hold' patients \u2014 they often return.",
    rp2:"Recent Patients", va:"View all \u2192", sb:"Status Breakdown", gn:"Generating...",
    mp:"My Plan", mn:"My Notes"
  },
  he: {
    tagline:"\u05de\u05db\u05d5\u05df \u05e4\u05d9\u05d6\u05d9\u05d5\u05ea\u05e8\u05e4\u05d9\u05d4 \u05dc\u05e1\u05e4\u05d5\u05e8\u05d8\u05d0\u05d9\u05dd",
    sub:"\u05e4\u05d9\u05d6\u05d9\u05d5\u05ea\u05e8\u05e4\u05d9\u05d4 \u05e1\u05e4\u05d5\u05e8\u05d8\u05d9\u05d1\u05d9\u05ea \u00b7 \u05d9\u05e7\u05e0\u05e2\u05dd \u05e2\u05d9\u05dc\u05d9\u05ea",
    dash:"\u05dc\u05d5\u05d7 \u05d1\u05e7\u05e8\u05d4", pats:"\u05de\u05d8\u05d5\u05e4\u05dc\u05d9\u05dd", stats:"\u05e0\u05d9\u05ea\u05d5\u05d7", lo:"\u05d4\u05ea\u05e0\u05ea\u05e7",
    ap:"\u05e1\u05d9\u05e1\u05de\u05ea \u05de\u05e0\u05d4\u05dc", yn:"\u05d4\u05e9\u05dd \u05e9\u05dc\u05da", yp:"\u05e7\u05d5\u05d3 PIN",
    le:"\u05e9\u05dd \u05d0\u05d5 PIN \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0\u05d5. \u05e0\u05e1\u05d4 \u05e9\u05e0\u05d9\u05ea.",
    welcome:"\u05d1\u05e8\u05d5\u05da \u05d4\u05d1\u05d0",
    intro:"\u05d4\u05d6\u05df \u05e9\u05dd \u05d5\u05e7\u05d5\u05d3 PIN \u05dc\u05d2\u05d9\u05e9\u05d4 \u05dc\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05e9\u05dc\u05da",
    enterplan:"\u05db\u05e0\u05e1 \u05dc\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05e9\u05dc\u05d9",
    adminlink:"\u05db\u05e0\u05d9\u05e1\u05ea \u05de\u05e0\u05d4\u05dc", al:"\u05db\u05e0\u05d9\u05e1\u05ea \u05de\u05e0\u05d4\u05dc",
    bk:"\u05d7\u05d6\u05e8\u05d4 \u2190", ed:"\u05e2\u05e8\u05d9\u05db\u05d4", dl:"\u05de\u05d7\u05e7", pdf:"\u05d9\u05d9\u05e6\u05d0 PDF",
    wa:"\u05d5\u05d0\u05d5\u05d8\u05e1\u05d0\u05e4", np:"+ \u05de\u05d8\u05d5\u05e4\u05dc \u05d7\u05d3\u05e9",
    sr:"\u05d7\u05d9\u05e4\u05d5\u05e9...", ex:"\u05ea\u05e8\u05d2\u05d9\u05dc\u05d9\u05dd", fu:"\u05de\u05e2\u05e7\u05d1", cl:"\u05e7\u05dc\u05d9\u05e0\u05d9",
    ae:"+ \u05d4\u05d5\u05e1\u05e3 \u05ea\u05e8\u05d2\u05d9\u05dc", ai:"\u2756 AI \u05d4\u05e6\u05e2\u05d5\u05ea",
    an:"+ \u05d4\u05d5\u05e1\u05e3 \u05d4\u05e2\u05e8\u05d4", up:"+ \u05d4\u05e2\u05dc\u05d4 \u05e7\u05d5\u05d1\u05e5",
    nx:"\u05d0\u05d9\u05df \u05ea\u05e8\u05d2\u05d9\u05dc\u05d9\u05dd.", nf:"\u05d0\u05d9\u05df \u05d4\u05e2\u05e8\u05d5\u05ea.", nfi:"\u05d0\u05d9\u05df \u05e7\u05d1\u05e6\u05d9\u05dd.",
    sv:"\u05e9\u05d5\u05de\u05e8...", ca:"\u05d1\u05d9\u05d8\u05d5\u05dc", sa:"\u05e9\u05de\u05d5\u05e8",
    aa:"\u05d4\u05d5\u05e1\u05e3 \u05d4\u05db\u05dc", wv:"\u25b6 \u05e6\u05e4\u05d4 \u05d1\u05e1\u05e8\u05d8\u05d5\u05df",
    aie:"\u2756 \u05d4\u05e2\u05e8\u05db\u05d4 \u05e7\u05dc\u05d9\u05e0\u05d9\u05ea",
    ah:"\u05dc\u05de\u05e0\u05d4\u05dc \u05d1\u05dc\u05d1\u05d3",
    nm:"\u05e9\u05dd \u05de\u05dc\u05d0 (\u05d0\u05e0\u05d2\u05dc\u05d9\u05ea)", nmhe:"\u05e9\u05dd \u05de\u05dc\u05d0 (\u05e2\u05d1\u05e8\u05d9\u05ea)",
    ag:"\u05d2\u05d9\u05dc", ph:"\u05d8\u05dc\u05e4\u05d5\u05df", sp:"\u05e2\u05e0\u05e3",
    ss:"\u05d1\u05d7\u05e8 \u05e2\u05e0\u05e3...", no:"\u05d4\u05e2\u05e8\u05d5\u05ea", ij:"\u05e4\u05e6\u05d9\u05e2\u05d4",
    pi:"PIN (4 \u05e1\u05e4\u05e8\u05d5\u05ea)", st:"\u05e1\u05d8\u05d0\u05d8\u05d5\u05e1",
    se:"\u05e1\u05d8\u05d9\u05dd", rp:"\u05d7\u05d6\u05e8\u05d5\u05ea", de:"\u05ea\u05d9\u05d0\u05d5\u05e8", ti:"\u05d8\u05d9\u05e4\u05d9\u05dd",
    en2:"\u05e9\u05dd \u05ea\u05e8\u05d2\u05d9\u05dc", dt:"\u05ea\u05d0\u05e8\u05d9\u05da",
    nt:"\u05d4\u05e2\u05e8\u05ea \u05d8\u05d9\u05e4\u05d5\u05dc", np2:"\u05db\u05d0\u05d1, \u05d4\u05ea\u05e7\u05d3\u05de\u05d5\u05ea...",
    npt:"\u05de\u05d8\u05d5\u05e4\u05dc \u05d7\u05d3\u05e9", ept:"\u05e2\u05e8\u05d9\u05db\u05ea \u05de\u05d8\u05d5\u05e4\u05dc",
    to:"\u05e1\u05d4\u05f4\u05db", ac:"\u05e4\u05e2\u05d9\u05dc\u05d9\u05dd", dr:"\u05e0\u05e9\u05e8\u05d5", nl:"\u05dc\u05d9\u05d3\u05d9\u05dd",
    rt:"\u05e9\u05d9\u05de\u05d5\u05e8", ax:"\u05de\u05de\u05d5\u05e6\u05e2", fl:"\u05e8\u05e9\u05d9\u05de\u05ea \u05de\u05e2\u05e7\u05d1",
    ins:"\u05ea\u05d5\u05d1\u05e0\u05d5\u05ea",
    t1:"\u05d4\u05d5\u05e1\u05e3 \u05e6'\u05e7-\u05d0\u05d9\u05df \u05d1\u05e9\u05d1\u05d5\u05e2\u05d9\u05d9\u05dd.",
    t2:"3 \u05ea\u05e8\u05d2\u05d9\u05dc\u05d9\u05dd+ \u05dc\u05db\u05dc \u05de\u05d8\u05d5\u05e4\u05dc.",
    t3:"\u05e9\u05dc\u05d7 \u05d5\u05d5\u05d0\u05d8\u05e1\u05d0\u05e4 \u05dc\u05de\u05d8\u05d5\u05e4\u05dc\u05d9\u05dd '\u05d1\u05d4\u05de\u05ea\u05e0\u05d4'.",
    rp2:"\u05de\u05d8\u05d5\u05e4\u05dc\u05d9\u05dd \u05d0\u05d7\u05e8\u05d5\u05e0\u05d9\u05dd",
    va:"\u05d4\u05e6\u05d2 \u05d4\u05db\u05dc \u2190", sb:"\u05e4\u05d9\u05dc\u05d5\u05d7 \u05e1\u05d8\u05d0\u05d8\u05d5\u05e1",
    gn:"\u05de\u05d9\u05d9\u05e6\u05e8...",
    mp:"\u05d4\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05e9\u05dc\u05d9", mn:"\u05d4\u05e2\u05e8\u05d5\u05ea"
  }
};

// ── Sport & Status options ──
var SP = ["Motocross","Basketball","Volleyball","Running","Weightlifting","CrossFit","Powerlifting","Bodybuilding","Cycling","Marathon","Swimming","Tennis","Soccer","Other"];
var ST = ["Active","New Lead","On Hold","Discharged","Dropped"];

// ── Status colors ──
var SC = {Active:"#00a86b","New Lead":"#7c3aed","On Hold":"#d97706",Discharged:"#2B6CC4",Dropped:"#c0392b"};

// ── Demo patients (shown on first load) ──
var DM = [
  {id:1,name:"Oren Levi",nameHe:"\u05d0\u05d5\u05e8\u05df \u05dc\u05d5\u05d9",sport:"CrossFit",age:28,injury:"Lower back strain",phone:"052-1234567",notes:"Competing in 3 months.",pin:"1234",status:"Active",sessions:6,startDate:"2025-02-10",exercises:[{id:11,name:"Dead Bug",sets:3,reps:"10",desc:"Maintain neutral spine",tips:"Exhale at top"},{id:12,name:"Pallof Press",sets:3,reps:"12 each side",desc:"Anti-rotation core",tips:"Keep hips square"}],followUps:[{id:13,date:"2025-04-10",note:"Pain 2/10. Good progress."}],files:[],eval:""},
  {id:2,name:"Maya Cohen",nameHe:"\u05de\u05d0\u05d9\u05d4 \u05db\u05d4\u05df",sport:"Running",age:34,injury:"IT Band Syndrome",phone:"054-9876543",notes:"Half marathon in 6 weeks.",pin:"5678",status:"Active",sessions:4,startDate:"2025-03-01",exercises:[{id:21,name:"Glute Bridge",sets:3,reps:"15",desc:"Glute activation",tips:"Hold 2 sec"}],followUps:[{id:22,date:"2025-04-08",note:"Overpronation noted."}],files:[],eval:""},
  {id:3,name:"Tal Shapira",nameHe:"\u05d8\u05dc \u05e9\u05e4\u05d9\u05e8\u05d0",sport:"Motocross",age:22,injury:"Shoulder impingement",phone:"050-1112233",notes:"Race season soon.",pin:"9012",status:"New Lead",sessions:1,startDate:"2025-04-20",exercises:[],followUps:[],files:[],eval:""},
  {id:4,name:"Noa Peretz",nameHe:"\u05e0\u05d5\u05e2\u05d4 \u05e4\u05e8\u05e5",sport:"Swimming",age:19,injury:"Rotator cuff tendinopathy",phone:"054-7788990",notes:"Competitive swimmer.",pin:"5566",status:"Dropped",sessions:2,startDate:"2025-03-10",exercises:[],followUps:[{id:51,date:"2025-03-20",note:"Stopped after 2nd session."}],files:[],eval:""}
];
