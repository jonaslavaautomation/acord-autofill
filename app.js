/* ACORD Auto-Fill — frontend logic.
   Templates are served from /templates/*.pdf. Extraction goes through /api/extract
   (serverless) so the Groq key stays on the server. Saved data uses localStorage.
   Declaration Page upload (PDF text via pdf.js, OCR fallback via Tesseract.js) runs
   entirely in the browser — only the extracted text is sent to /api/extract. */
if(window.pdfjsLib){
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";
}

const TEMPLATE_URL = {
  "25":"/templates/acord-25.pdf", "28":"/templates/acord-28.pdf",
  "126":"/templates/acord-126.pdf", "140":"/templates/acord-140.pdf",
  "127":"/templates/acord-127.pdf", "130":"/templates/acord-130.pdf",
  "70":"/templates/acord-70.pdf", "71":"/templates/acord-71.pdf",
  "35":"/templates/acord-35.pdf",
};
const _tplCache = {};
async function loadTemplate(id){
  if(_tplCache[id]) return _tplCache[id];
  const r = await fetch(TEMPLATE_URL[id]);
  if(!r.ok) throw new Error("template "+id+" not found");
  const bytes = new Uint8Array(await r.arrayBuffer());
  _tplCache[id] = bytes;
  return bytes;
}

/* Forms: "acro" gets tagged fillable in Step 3 (most/all of its data lands in real AcroForm
   fields); "overlay" gets tagged overlay (it's a flat scan, everything is drawn text). This
   tag is cosmetic only — fillForm() below fills from CROSSWALK and draws from OVERLAY for
   whichever maps exist for the form, so a form (like 35) can use both at once. */
const FORMS = [
  { id:"25",  name:"ACORD 25", title:"Certificate of Liability Insurance", mode:"acro" },
  { id:"28",  name:"ACORD 28", title:"Evidence of Commercial Property", mode:"overlay" },
  { id:"70",  name:"ACORD 70", title:"Personal Policy Change Request (Except Auto)", mode:"acro" },
  { id:"126", name:"ACORD 126", title:"Commercial General Liability", mode:"acro" },
  { id:"140", name:"ACORD 140", title:"Property Section", mode:"acro" },
  { id:"127", name:"ACORD 127", title:"Business Auto Section", mode:"overlay" },
  { id:"130", name:"ACORD 130", title:"Workers Compensation Application", mode:"overlay" },
  { id:"71",  name:"ACORD 71", title:"Personal Auto Policy Change Request", mode:"overlay" },
  { id:"35",  name:"ACORD 35", title:"Cancellation Request / Policy Release", mode:"acro" },
];

/* Real AcroForm field names (verified against each PDF). "insAddr" is a synthetic
   key composed from street + city/state/zip for single-line address boxes. */
const CROSSWALK = {
  "25":{
    producerName:"Producer_FullName_A", producerContact:"Producer_ContactPerson_FullName_A",
    producerPhone:"Producer_ContactPerson_PhoneNumber_A", producerFax:"Producer_FaxNumber_A",
    producerEmail:"Producer_ContactPerson_EmailAddress_A",
    namedInsured:"NamedInsured_FullName_A", insStreet:"NamedInsured_MailingAddress_LineOne_A",
    insCity:"NamedInsured_MailingAddress_CityName_A", insState:"NamedInsured_MailingAddress_StateOrProvinceCode_A",
    insZip:"NamedInsured_MailingAddress_PostalCode_A",
    insurerA:"Insurer_FullName_A", insurerAnaic:"Insurer_NAICCode_A",
    policyNumber:"Policy_GeneralLiability_PolicyNumberIdentifier_A",
    effectiveDate:"Policy_GeneralLiability_EffectiveDate_A", expirationDate:"Policy_GeneralLiability_ExpirationDate_A",
    glEachOcc:"GeneralLiability_EachOccurrence_LimitAmount_A", glGenAgg:"GeneralLiability_GeneralAggregate_LimitAmount_A",
    glProducts:"GeneralLiability_ProductsAndCompletedOperations_AggregateLimitAmount_A",
    glPersonalAdv:"GeneralLiability_PersonalAndAdvertisingInjury_LimitAmount_A",
    glFireDamage:"GeneralLiability_FireDamageRentedPremises_EachOccurrenceLimitAmount_A",
    glMedExp:"GeneralLiability_MedicalExpense_EachPersonLimitAmount_A",
    operations:"CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A",
    holderName:"CertificateHolder_FullName_A", holderStreet:"CertificateHolder_MailingAddress_LineOne_A",
    holderCity:"CertificateHolder_MailingAddress_CityName_A", holderState:"CertificateHolder_MailingAddress_StateOrProvinceCode_A",
    holderZip:"CertificateHolder_MailingAddress_PostalCode_A",
    _checks:{ glEachOcc:["GeneralLiability_OccurrenceIndicator_A","GeneralLiability_CoverageIndicator_A"] }
  },
  "126":{
    namedInsured:"F[0].P1[0].NamedInsured_FullName_A[0]", producerName:"F[0].P1[0].Producer_FullName_A[0]",
    policyNumber:"F[0].P1[0].Policy_PolicyNumberIdentifier_A[0]", effectiveDate:"F[0].P1[0].Policy_EffectiveDate_A[0]",
    glEachOcc:"F[0].P1[0].GeneralLiability_EachOccurrence_LimitAmount_A[0]",
    glGenAgg:"F[0].P1[0].GeneralLiability_GeneralAggregate_LimitAmount_A[0]",
    glProducts:"F[0].P1[0].GeneralLiability_ProductsAndCompletedOperations_AggregateLimitAmount_A[0]",
    glPersonalAdv:"F[0].P1[0].GeneralLiability_PersonalAndAdvertisingInjury_LimitAmount_A[0]",
    glFireDamage:"F[0].P1[0].GeneralLiability_FireDamageRentedPremises_EachOccurrenceLimitAmount_A[0]",
    glMedExp:"F[0].P1[0].GeneralLiability_MedicalExpense_EachPersonLimitAmount_A[0]",
    operations:"F[0].P1[0].GeneralLiabilityLineOfBusiness_RemarkText_A[0]"
  },
  "140":{
    namedInsured:"F[0].P1[0].NamedInsured_FullName_A[0]", insStreet:"F[0].P1[0].NamedInsured_MailingAddress_LineOne_A[0]",
    insCity:"F[0].P1[0].NamedInsured_MailingAddress_CityName_A[0]", insState:"F[0].P1[0].NamedInsured_MailingAddress_StateOrProvinceCode_A[0]",
    insZip:"F[0].P1[0].NamedInsured_MailingAddress_PostalCode_A[0]", producerName:"F[0].P1[0].Producer_FullName_A[0]",
    policyNumber:"F[0].P1[0].Policy_PolicyNumberIdentifier_A[0]", effectiveDate:"F[0].P1[0].Policy_EffectiveDate_A[0]",
    expirationDate:"F[0].P1[0].Policy_ExpirationDate_A[0]", propBuildingArea:"F[0].P2[0].Construction_BuildingArea_A[0]",
    operations:"F[0].P2[0].BuildingOccupancy_OperationsDescription_A[0]"
  },
  // ACORD 70 uses generic field names (Text#); mapped by position. Rendered at 8pt.
  "70":{
    _fontSize:8,
    producerName:"Text3", producerPhone:"Text1", producerFax:"Text2",
    insurerA:"Text16", insurerAnaic:"Text17", producerContact:"Text18",
    policyNumber:"Text19", namedInsured:"Text7", insAddr:"Text8",
    effectiveDate:"Text21", expirationDate:"Text23"
  },
  // ACORD 35: most boxes are real AcroForm fields, verified by name against the PDF.
  // The Producer / Company / Insured "name and address" boxes have no field behind them
  // at all (blank bordered boxes) — those are filled via OVERLAY["35"] below instead.
  "35":{
    producerPhone:"AC No Extl PHONE", insurerAnaic:"NAIC CODE", policyType:"POLICY TYPE",
    policyNumber:"POLICY NUMBER-0", cancellationDate:"CANCELLATION DATE", cancellationTime:"TIME",
    effectiveDate:"EFFECTIVE DATE", expirationDate:"EXPIRATION DATE",
    remarks:"REMARKS ACORD 101 Additional Remarks Schedule may",
    // POLICY TYPE's box auto-sizes to fill its (tall) height, which blows short text up huge.
    _fieldSizes:{ policyType:11 }
  }
};

/* Flat forms: draw text at measured PDF points (origin bottom-left). Verified by render. */
const OVERLAY = {
  "28":{ _page:0,
    producerName:[18,678,8,150], producerPhone:[180,680,7,110], producerFax:[55,628,7,90], producerEmail:[170,628,7,120],
    insurerA:[315,680,8,180], insurerAnaic:[550,680,8,58],
    namedInsured:[20,590,8,260], insStreet:[20,578,7,180], cityLine:[20,567,7,180],
    policyNumber:[478,590,8,120], effectiveDate:[315,563,8,90], expirationDate:[398,563,8,90], operations:[20,503,8,540],
  },
  "127":{ _page:0,
    producerName:[24,706,8,300], insurerA:[316,706,8,150], insurerAnaic:[550,706,8,58],
    policyNumber:[24,679,8,300], effectiveDate:[352,679,8,70], namedInsured:[432,679,8,160],
  },
  "130":{ _page:0,
    producerName:[24,731,8,300], insurerA:[398,739,8,210], namedInsured:[398,717,8,210],
    insStreet:[398,683,8,200], cityLine:[398,672,7,200],
    producerContact:[95,671,8,230], producerPhone:[95,655,7,230], producerEmail:[95,635,7,230],
    effectiveDate:[35,395,8,110], expirationDate:[220,395,8,110],
  },
  "71":{ _page:0,
    producerName:[24,716,8,300], producerPhone:[185,737,7,120], producerFax:[185,727,7,120],
    insurerA:[345,735,8,170], insurerAnaic:[505,735,8,70], producerContact:[342,687,8,240], policyNumber:[338,662,8,240],
    namedInsured:[95,640,8,210], insStreet:[26,606,8,270], cityLine:[26,595,7,270],
    effectiveDate:[315,606,8,88], expirationDate:[505,606,8,88],
  },
  // ACORD 35's Producer / Company / Insured boxes have no AcroForm field, so their text
  // is drawn here even though the rest of the form (CROSSWALK["35"]) is real fields.
  "35":{ _page:0,
    producerName:[20,712,8,140], producerContact:[20,698,7,140], producerEmail:[20,684,7,140],
    insurerA:[320,712,8,270],
    namedInsured:[20,628,8,270], insStreet:[20,614,7,270], cityLine:[20,600,7,270],
  },
};

/* Which atomic field keys a given form actually uses, derived straight from its
   CROSSWALK (acro) or OVERLAY (overlay) map — so the Step 2 dashboard always matches
   exactly what that ACORD form can hold, with no separate list to keep in sync. */
function formKeysFor(id){
  // A form can have a CROSSWALK entry, an OVERLAY entry, or (like ACORD 35) both — merge
  // whichever exist, since fillForm() below runs both passes when both are present.
  const keys = new Set();
  [CROSSWALK[id], OVERLAY[id]].forEach(map=>{
    if(!map) return;
    Object.keys(map).forEach(k=>{
      if(k.startsWith("_")) return;
      if(k==="insAddr"||k==="cityLine"){ ["insStreet","insCity","insState","insZip"].forEach(x=>keys.add(x)); }
      else keys.add(k);
    });
  });
  return keys;
}
/* Union of keys for every currently checked form (Step 3). Nothing checked -> show everything. */
function activeKeys(){
  const ids=[...selected];
  if(!ids.length) return new Set(REQUEST_KEYS);
  const s=new Set();
  ids.forEach(id=>formKeysFor(id).forEach(k=>s.add(k)));
  return s;
}

/* ---- Field UI ---- */
const REQUEST_SECTIONS = [
  { title:"Insured", fields:[
    ["namedInsured","Named Insured",true],["insStreet","Street",true],
    ["insCity","City"],["insState","State"],["insZip","ZIP"],
  ]},
  { title:"Policy", fields:[
    ["policyNumber","Policy number"],["effectiveDate","Effective date"],["expirationDate","Expiration date"],
  ]},
  { title:"Cancellation (ACORD 35)", fields:[
    ["policyType","Policy type"],["cancellationDate","Cancellation date"],["cancellationTime","Cancellation time"],
    ["remarks","Reason for cancellation / remarks",true,true],
  ]},
  { title:"Carrier (for the certificate)", fields:[
    ["insurerA","Insurer / carrier",true],["insurerAnaic","NAIC #"],
  ]},
  { title:"General Liability limits", fields:[
    ["glEachOcc","Each occurrence"],["glGenAgg","General aggregate"],
    ["glProducts","Products / completed ops"],["glPersonalAdv","Personal & adv injury"],
    ["glFireDamage","Damage to rented premises"],["glMedExp","Medical expense"],
  ]},
  { title:"Property", fields:[
    ["propBuildingArea","Building area / sq ft"],
  ]},
  { title:"Operations (shared across forms)", fields:[
    ["operations","Description of operations",true,true],
  ]},
  { title:"Certificate holder", fields:[
    ["holderName","Holder name",true],["holderStreet","Street",true],
    ["holderCity","City"],["holderState","State"],["holderZip","ZIP"],
  ]},
];
const AGENCY_FIELDS = [
  ["producerName","Agency name",true],["producerContact","Contact name",true],
  ["producerPhone","Phone"],["producerFax","Fax"],["producerEmail","Email",true],
];

const REQUEST_KEYS = REQUEST_SECTIONS.flatMap(s=>s.fields.map(f=>f[0]));
const AGENCY_KEYS = AGENCY_FIELDS.map(f=>f[0]);

const LS_AGENCY="acordAF.agency", LS_REQUESTS="acordAF.requests";
// autoKeys maps key -> source ("email" | "decpage"), so badge() can label + color each
// field by where it actually came from, and later sources know which fields are safe to
// overwrite (auto-filled) vs. must leave alone (user-typed or an agency value).
const SOURCE_LABEL = { email:{cls:"", text:"from email"}, decpage:{cls:"dp", text:"from dec page"} };
let autoKeys=new Map(), agencyKeys=new Set(), currentAgency=null;
let selected=new Set(["25"]);

/* Render request fields. Every field always exists in the DOM (so values/badges survive
   toggling forms) — refreshFieldsView() below just shows/hides cells per selected form. */
const fieldsWrap=document.getElementById("fields");
const fieldCells={}; const sectionEls=[];
REQUEST_SECTIONS.forEach(sec=>{
  const t=document.createElement("div");t.className="sec-title";t.textContent=sec.title;fieldsWrap.appendChild(t);
  const g=document.createElement("div");g.className="fgrid";
  const keys=[];
  sec.fields.forEach(f=>{
    const [key,label,full,area]=f;
    const cell=document.createElement("div");cell.className="f"+(full?" full":"");
    const lab=document.createElement("label");lab.id="lab-"+key;lab.textContent=label;
    const el=document.createElement(area?"textarea":"input");el.className="in";el.id="fld-"+key;
    el.addEventListener("input",()=>{ if(autoKeys.has(key)){autoKeys.delete(key);badge(key);} refreshMissingNote(); });
    cell.appendChild(lab);cell.appendChild(el);g.appendChild(cell);
    fieldCells[key]=cell; keys.push(key);
  });
  fieldsWrap.appendChild(g);
  sectionEls.push({t,g,keys});
});
/* Show only the fields the checked form(s) actually use, and label which form(s) that is. */
function refreshFieldsView(){
  const active=activeKeys();
  sectionEls.forEach(({t,g,keys})=>{
    let any=false;
    keys.forEach(k=>{
      const show=active.has(k); if(show)any=true;
      const cell=fieldCells[k]; if(cell) cell.style.display=show?"":"none";
    });
    t.style.display=any?"":"none"; g.style.display=any?"":"none";
  });
  const note=document.getElementById("fieldsNote");
  if(note){
    const ids=[...selected];
    if(!ids.length){ note.textContent="Check a form in Step 3 to narrow this to exactly the fields it uses."; }
    else{ const names=FORMS.filter(f=>selected.has(f.id)).map(f=>f.name); note.textContent="Showing fields used by "+names.join(", ")+"."; }
  }
  refreshMissingNote();
}
/* Flags empty "full" fields (the ones REQUEST_SECTIONS marks as important, e.g. Named
   Insured, Certificate holder) that the currently checked form(s) actually use — the
   closest thing to "ask the user for just what's missing" without a separate wizard. */
function refreshMissingNote(){
  const note=document.getElementById("missingNote"); if(!note)return;
  const ids=[...selected];
  if(!ids.length){ note.hidden=true; return; }
  const active=activeKeys();
  const missing=[];
  REQUEST_SECTIONS.forEach(sec=>sec.fields.forEach(f=>{
    const [key,label,full]=f;
    if(full && active.has(key) && val(key)==="") missing.push(label);
  }));
  if(!missing.length){ note.hidden=true; return; }
  const names=FORMS.filter(f=>selected.has(f.id)).map(f=>f.name).join(", ");
  note.hidden=false;
  note.textContent="Missing for "+names+": "+missing.join(", ")+".";
}

/* Render agency fields */
const agWrap=document.getElementById("agencyFields");
AGENCY_FIELDS.forEach(f=>{
  const [key,label,full]=f;
  const cell=document.createElement("div");cell.className="f"+(full?" full":"");
  const lab=document.createElement("label");lab.id="lab-"+key;lab.textContent=label;
  const el=document.createElement("input");el.className="in";el.id="fld-"+key;
  el.addEventListener("input",()=>{ if(agencyKeys.has(key))markAgency(key,false); });
  cell.appendChild(lab);cell.appendChild(el);agWrap.appendChild(cell);
});

/* Render form list */
const formList=document.getElementById("formList");
FORMS.forEach(fm=>{
  const row=document.createElement("div");row.className="form-row";
  const cb=document.createElement("input");cb.type="checkbox";cb.id="form-"+fm.id;
  cb.checked=selected.has(fm.id);
  cb.addEventListener("change",()=>{cb.checked?selected.add(fm.id):selected.delete(fm.id);refreshFieldsView();});
  const meta=document.createElement("div");meta.className="meta";
  meta.innerHTML='<div class="nm">'+fm.name+'</div><div class="ds">'+fm.title+'</div>';
  const tag=document.createElement("span");
  tag.className="tag "+(fm.mode==="acro"?"ready":"no");
  tag.textContent=fm.mode==="acro"?"fillable":"overlay";
  row.appendChild(cb);row.appendChild(meta);row.appendChild(tag);formList.appendChild(row);
});

/* Badges */
function badge(key){
  const lab=document.getElementById("lab-"+key), fld=document.getElementById("fld-"+key);
  if(!lab)return; const ex=lab.querySelector(".badge:not(.ag)");
  const src=autoKeys.get(key);
  if(src){
    const info=SOURCE_LABEL[src]||SOURCE_LABEL.email;
    const cls="badge"+(info.cls?" "+info.cls:"");
    if(!ex){ const b=document.createElement("span"); b.className=cls; b.textContent=info.text; lab.appendChild(b); }
    else{ ex.className=cls; ex.textContent=info.text; }
    fld.classList.remove("g","dp"); fld.classList.add(info.cls==="dp"?"dp":"g");
  }else{ if(ex)ex.remove(); fld.classList.remove("g","dp"); }
}
function markAgency(key,on){
  const lab=document.getElementById("lab-"+key), fld=document.getElementById("fld-"+key);
  if(!lab)return; const ex=lab.querySelector(".badge.ag");
  if(on){ autoKeys.delete(key); const g=lab.querySelector(".badge:not(.ag)"); if(g)g.remove(); fld.classList.remove("g","dp");
    if(!ex){const b=document.createElement("span");b.className="badge ag";b.textContent="my agency";lab.appendChild(b);}
    fld.classList.add("a"); agencyKeys.add(key);
  }else{ if(ex)ex.remove(); fld.classList.remove("a"); agencyKeys.delete(key); }
}
const val=k=>{const e=document.getElementById("fld-"+k);return e?e.value.trim():"";};
const setVal=(k,v)=>{const e=document.getElementById("fld-"+k);if(e)e.value=v;};
function cityLine(){ return [val("insCity"),val("insState"),val("insZip")].filter(Boolean).join(" "); }
function insAddr(){ return [val("insStreet"), cityLine()].filter(Boolean).join(", "); }

/* ---- Request -> ACORD form classifier (client-side, no AI call needed) ---- */
// Explicit "ACORD 25"-style mentions always win. Otherwise fall back to phrasing that
// implies a form without naming it (COI, cancellation, workers comp, etc).
const FORM_KEYWORDS = [
  { id:"25",  re:/certificate of liability|\bcoi\b/i },
  { id:"28",  re:/evidence of (commercial )?property/i },
  { id:"35",  re:/\bcancel(l?ed|l?ation)?\b/i },
  { id:"126", re:/general liability application|\bcgl\b/i },
  { id:"127", re:/business auto section|commercial auto/i },
  { id:"130", re:/workers'?\s*comp(ensation)?/i },
  { id:"140", re:/\bproperty section\b/i },
  { id:"71",  re:/personal auto (policy )?change|garage coverage/i },
  { id:"70",  re:/personal policy change/i },
];
function classifyForms(text){
  const explicit=new Set();
  for(const m of text.matchAll(/acord[\s#-]*(\d{2,3})/gi)){ if(TEMPLATE_URL[m[1]]) explicit.add(m[1]); }
  if(explicit.size) return explicit;
  const found=new Set();
  FORM_KEYWORDS.forEach(({id,re})=>{ if(re.test(text)) found.add(id); });
  return found;
}

/* ---- Step 1: extraction via serverless proxy ---- */
function schemaHint(){
  // Only hint at the keys the currently checked form(s) in Step 3 actually use, so the
  // model's attention (and the Step 2 dashboard) both track the exact ACORD form(s) picked.
  const active=activeKeys();
  const r=REQUEST_SECTIONS.flatMap(s=>s.fields.filter(f=>active.has(f[0])).map(f=>'"'+f[0]+'"')).join(", ");
  const a=AGENCY_FIELDS.map(f=>'"'+f[0]+'"').join(", ");
  return "Request keys: "+r+"\nAgency keys (only if the email states the agency): "+a;
}
function selectedFormsContext(){
  const ids=[...selected];
  if(!ids.length) return "";
  const names=FORMS.filter(f=>selected.has(f.id)).map(f=>f.name+" ("+f.title+")").join("; ");
  return "This extraction is for these exact ACORD forms: "+names+". Only pull data that form(s) would actually show — "+
    "read each requested key as that form's own field, not a generic guess. ";
}
async function readEmail(){
  const raw=document.getElementById("paste").value.trim();
  const msg=document.getElementById("readMsg");
  if(!raw){msg.className="msg err";msg.textContent="Paste the client's email first.";return;}
  const btn=document.getElementById("readBtn");btn.disabled=true;btn.textContent="Reading…";msg.className="";msg.textContent="";

  // Classify which ACORD form(s) this request needs BEFORE building the extraction prompt,
  // so schemaHint()/selectedFormsContext() below scope the AI call to the right form(s) too.
  // Silent (doesn't touch Step 3) when nothing in the text points at a form.
  let formNote="";
  const classified=classifyForms(raw);
  if(classified.size){
    selected=classified;
    FORMS.forEach(f=>{ const cb=document.getElementById("form-"+f.id); if(cb) cb.checked=selected.has(f.id); });
    refreshFieldsView();
    formNote=" Picked "+FORMS.filter(f=>selected.has(f.id)).map(f=>f.name).join(", ")+" in Step 3 based on the request.";
  }

  const system=
    "You are an insurance submission intake assistant. Read the pasted client/insured email and extract everything you "+
    "recognize into ONE JSON object using ONLY these exact keys:\n"+schemaHint()+
    "\n"+selectedFormsContext()+
    "\nRules: return ONLY the JSON object (no markdown, no code fences, no commentary). Use \"\" for anything not stated. "+
    "Money as digits with commas ($1M -> 1,000,000; 2 million -> 2,000,000). Dates MM/DD/YYYY. "+
    "namedInsured = the business being insured (not the agency). insurerA = the insurance carrier/company. "+
    "Put the certificate holder into holder* keys. Building square footage -> propBuildingArea. "+
    "cancellationDate is when the policy should be cancelled (MM/DD/YYYY); cancellationTime as HH:MM AM/PM if stated. "+
    "policyType is the line of business being cancelled (e.g. Auto, General Liability, Property, Package). "+
    "remarks = the stated reason for cancellation or any other cancellation-specific note.";
  try{
    const resp=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:raw,system})});
    const data=await resp.json();
    if(!resp.ok) throw new Error(data && data.error ? data.error : "extraction failed");
    let text=(data.text||"").replace(/```json|```/g,"").trim();
    const parsed=JSON.parse(text);
    autoKeys=new Map(); let n=0;
    REQUEST_KEYS.forEach(k=>{ const v=parsed[k]; if(v!=null&&String(v).trim()!==""){setVal(k,String(v).trim());autoKeys.set(k,"email");n++;} else setVal(k,""); badge(k); });
    if(currentAgency){ applyAgency(currentAgency); }
    else { AGENCY_KEYS.forEach(k=>{ const v=parsed[k]; if(v!=null&&String(v).trim()!==""){setVal(k,String(v).trim());} }); }
    msg.className="msg ok";
    msg.textContent="Filled "+n+" field"+(n===1?"":"s")+" from the email (highlighted green)."+formNote+" Review Step 2, then download in Step 3.";
    refreshMissingNote();
  }catch(e){
    msg.className="msg err";
    msg.textContent="Couldn't read that: "+(e.message||e)+". If this says the API key isn't set, add GROQ_API_KEY in your Vercel project settings.";
  }
  finally{ btn.disabled=false; btn.textContent="Read email & fill"; }
}
function clearRequest(){
  REQUEST_KEYS.forEach(k=>{setVal(k,"");}); autoKeys=new Map(); REQUEST_KEYS.forEach(badge);
  document.getElementById("paste").value="";
  const msg=document.getElementById("readMsg");msg.className="msg ok";msg.textContent="Cleared the request. Your saved agency stays.";
  refreshMissingNote();
}

/* ---- Declaration Page upload: pdf.js text extraction, OCR fallback, AI extraction ---- */
function showDecProgress(on){
  document.getElementById("decProgress").hidden=!on;
  if(on) setDecProgress(0,"");
}
function setDecProgress(frac,label){
  document.getElementById("decProgressFill").style.width=Math.round(Math.max(0,Math.min(1,frac))*100)+"%";
  document.getElementById("decProgressText").textContent=label||"";
}
// Renders a PDF page to a canvas and OCRs it client-side. Only called for pages with no
// extractable text (i.e. scanned/photographed pages) — a fresh Tesseract worker per page
// is simplest for a first version; it's slower than a persistent worker but needs no setup.
async function ocrPage(page){
  const viewport=page.getViewport({scale:2.2});
  const canvas=document.createElement("canvas");
  canvas.width=viewport.width; canvas.height=viewport.height;
  await page.render({canvasContext:canvas.getContext("2d"), viewport}).promise;
  const {data}=await Tesseract.recognize(canvas,"eng");
  return data.text||"";
}
// Extracts text per page via pdf.js; any page whose real text layer is too short to be
// useful (i.e. it's a scan, not a digital PDF) falls back to OCR instead.
async function extractPdfPages(file,onProgress){
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    let text=content.items.map(it=>it.str).join(" ").replace(/\s+/g," ").trim();
    if(text.length<20){
      onProgress&&onProgress(0.05+(i-1)/pdf.numPages*0.8,"Page "+i+" of "+pdf.numPages+" looks scanned — running OCR (can take a bit)…");
      text=await ocrPage(page);
    }else{
      onProgress&&onProgress(0.05+(i-1)/pdf.numPages*0.8,"Reading page "+i+" of "+pdf.numPages+"…");
    }
    pages.push(text);
  }
  return pages;
}
function decPageSystemPrompt(){
  const keys=REQUEST_KEYS.map(k=>'"'+k+'"').join(", ");
  return "You are an experienced insurance CSR reading a policy Declarations (\"Dec\") page — it may be digital or OCR'd from a scan, "+
    "so expect occasional OCR noise. Extract every value you can find into ONE JSON object using ONLY these exact keys: "+keys+
    ". Rules: return ONLY the JSON object (no markdown, no commentary). Use \"\" for anything not present. "+
    "namedInsured = the named insured on the policy (not the agency). insurerA = the carrier/insurance company name; insurerAnaic = its NAIC number if shown. "+
    "producerName/producerContact/producerPhone/producerFax/producerEmail = the AGENCY/producer of record printed on the page, if any — never the carrier. "+
    "policyNumber/effectiveDate/expirationDate = the policy's own number and term dates (MM/DD/YYYY). "+
    "For General Liability pages map limits to glEachOcc/glGenAgg/glProducts/glPersonalAdv/glFireDamage/glMedExp. "+
    "propBuildingArea is only a square-footage figure, never a dollar coverage limit — leave it blank if you don't see square feet. "+
    "This page may be Homeowners, Auto, Commercial Auto, General Liability, Workers Compensation, BOP, or Umbrella — use whichever "+
    "of the listed keys applies and skip the rest (do not invent new keys for coverages this list has no field for, e.g. vehicle "+
    "schedules or dwelling Coverage A-F — leaving those out is correct, not a mistake). "+
    "Also return \"_docType\" as your one-line best guess of the policy's line of business (e.g. \"Homeowners HO-3\", \"Commercial Auto\", "+
    "\"General Liability\", \"Workers Compensation\").";
}
async function readDecPage(file){
  const msg=document.getElementById("decMsg"); msg.className=""; msg.textContent="";
  showDecProgress(true);
  try{
    setDecProgress(0.02,"Opening PDF…");
    const pages=await extractPdfPages(file,setDecProgress);
    const text=pages.map((t,i)=>"--- Page "+(i+1)+" ---\n"+t).join("\n\n");
    if(!text.replace(/---.*?---/g,"").trim()) throw new Error("couldn't find any text on that PDF, even after OCR");
    setDecProgress(0.9,"Extracting policy data…");
    const resp=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text,system:decPageSystemPrompt()})});
    const data=await resp.json();
    if(!resp.ok) throw new Error(data&&data.error?data.error:"extraction failed");
    const raw=(data.text||"").replace(/```json|```/g,"").trim();
    const parsed=JSON.parse(raw);
    let n=0;
    REQUEST_KEYS.forEach(k=>{
      const v=parsed[k]; if(v==null||String(v).trim()==="")return;
      // Don't clobber a value the user typed by hand or that came from a saved agency —
      // only overwrite blanks or values that were themselves auto-filled (email/dec page).
      if(val(k)!==""&&!autoKeys.has(k))return;
      setVal(k,String(v).trim()); autoKeys.set(k,"decpage"); badge(k); n++;
    });
    setDecProgress(1,"Done.");
    const docType=parsed._docType?" Detected: "+parsed._docType+".":"";
    msg.className="msg ok";
    msg.textContent="Filled "+n+" field"+(n===1?"":"s")+" from the Dec Page (highlighted blue)."+docType+" Review Step 2.";
    refreshMissingNote();
  }catch(e){
    msg.className="msg err";
    msg.textContent="Couldn't read that PDF: "+(e.message||e)+". If this says the API key isn't set, add GROQ_API_KEY in your Vercel project settings.";
  }finally{
    setTimeout(()=>showDecProgress(false),900);
  }
}
function handleDecFile(file){
  if(file.type!=="application/pdf"&&!/\.pdf$/i.test(file.name)){
    const msg=document.getElementById("decMsg"); msg.className="msg err"; msg.textContent="Please drop a PDF file.";
    return;
  }
  readDecPage(file);
}
function wireDecUpload(){
  const drop=document.getElementById("decDrop"), fileInput=document.getElementById("decFile"), browseBtn=document.getElementById("decBrowseBtn");
  const openPicker=e=>{ e&&e.stopPropagation(); fileInput.click(); };
  browseBtn.addEventListener("click",openPicker);
  drop.addEventListener("click",openPicker);
  drop.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openPicker(); } });
  fileInput.addEventListener("change",()=>{ if(fileInput.files[0]) handleDecFile(fileInput.files[0]); fileInput.value=""; });
  ["dragenter","dragover"].forEach(evt=>drop.addEventListener(evt,e=>{ e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave","drop"].forEach(evt=>drop.addEventListener(evt,e=>{ e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop",e=>{ const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f)handleDecFile(f); });
}

/* ---- Agency (localStorage) ---- */
function applyAgency(d){ AGENCY_KEYS.forEach(k=>{const v=(d&&d[k])?String(d[k]):"";setVal(k,v);markAgency(k,v.trim()!=="");}); }
function agMsg(t,err){const el=document.getElementById("agencyMsg");el.textContent=t;el.style.color=err?"#a33":"var(--green)";}
function saveAgency(){
  const d={}; AGENCY_KEYS.forEach(k=>d[k]=val(k));
  if(!d.producerName){agMsg("Enter your agency name first.",true);return;}
  try{ localStorage.setItem(LS_AGENCY,JSON.stringify(d)); currentAgency=d; applyAgency(d);
    agMsg('Saved "'+d.producerName+'" — auto-fills every form.'); }catch(e){agMsg("Save failed.",true);}
}
function loadAgency(){
  try{ const s=localStorage.getItem(LS_AGENCY); if(s){ const d=JSON.parse(s); currentAgency=d; applyAgency(d);
    agMsg('"'+(d.producerName||"Agency")+'" is saved — auto-fills every form.'); return; } }catch(e){}
  agMsg("No agency saved yet. Fill the Producer fields and click Save my agency.",false);
}
function clearAgency(){ try{localStorage.removeItem(LS_AGENCY);}catch(e){} currentAgency=null;
  AGENCY_KEYS.forEach(k=>{setVal(k,"");markAgency(k,false);}); agMsg("Agency cleared.",false); }

/* ---- Fill one form ---- */
// Runs the acro pass (CROSSWALK) and the overlay pass (OVERLAY) — whichever map(s) exist
// for this form. Most forms only have one; ACORD 35 has both (real fields for most of the
// form, drawn text for the three "name and address" boxes that have no field behind them).
async function fillForm(formId){
  const {PDFDocument,StandardFonts,rgb}=PDFLib;
  const doc=await PDFDocument.load(await loadTemplate(formId),{ignoreEncryption:true});
  let wrote=0;

  const acroMap=CROSSWALK[formId];
  if(acroMap){
    const form=doc.getForm(); const forceFont=acroMap._fontSize||null; const fieldSizes=acroMap._fieldSizes||{};
    for(const key of Object.keys(acroMap)){
      if(key.startsWith("_"))continue;
      let v = key==="insAddr" ? insAddr() : val(key);
      if(!v)continue;
      const size=fieldSizes[key]||forceFont;
      try{ const tf=form.getTextField(acroMap[key]); if(size){try{tf.setFontSize(size);}catch(e){}} tf.setText(v); wrote++; }catch(e){}
    }
    if(acroMap._checks){ for(const cond of Object.keys(acroMap._checks)){ if(val(cond)){ for(const cf of acroMap._checks[cond]){ try{form.getCheckBox(cf).check();}catch(e){} } } } }
    try{form.updateFieldAppearances();}catch(e){}
  }

  const overlayMap=OVERLAY[formId];
  if(overlayMap){
    const font=await doc.embedFont(StandardFonts.Helvetica);
    const ink=rgb(0.03,0.12,0.32);
    const page=doc.getPages()[overlayMap._page||0];
    for(const key of Object.keys(overlayMap)){
      if(key.startsWith("_"))continue;
      let v = key==="cityLine" ? cityLine() : val(key);
      if(!v)continue;
      const [x,y,size,mw]=overlayMap[key]; let t=String(v);
      if(mw){ while(t.length&&font.widthOfTextAtSize(t,size)>mw) t=t.slice(0,-1); }
      page.drawText(t,{x,y,size,font,color:ink}); wrote++;
    }
  }

  return {bytes:await doc.save(), wrote};
}
function download(bytes,filename){
  const blob=new Blob([bytes],{type:"application/pdf"});const u=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),4000);
}
const insuredName=()=> (val("namedInsured")||"ACORD").replace(/[^\w -]/g,"").slice(0,40);
function selectedForms(){ return FORMS.filter(f=>selected.has(f.id)).map(f=>f.id); }

async function downloadEach(){
  const msg=document.getElementById("dlMsg"); const ids=selectedForms();
  if(!ids.length){msg.style.color="#a33";msg.textContent="Select at least one form.";return;}
  msg.style.color="var(--soft)";msg.textContent="Building…"; let total=0;
  try{
    for(const id of ids){ const {bytes,wrote}=await fillForm(id); total+=wrote; download(bytes,insuredName()+" - ACORD "+id+".pdf"); }
    msg.style.color="var(--green)";msg.textContent="Downloaded "+ids.length+" form"+(ids.length===1?"":"s")+" ("+total+" fields filled).";
  }catch(e){ msg.style.color="#a33"; msg.textContent="Build failed: "+(e.message||e); }
}
async function downloadPacket(){
  const msg=document.getElementById("dlMsg"); const ids=selectedForms();
  if(!ids.length){msg.style.color="#a33";msg.textContent="Select at least one form.";return;}
  msg.style.color="var(--soft)";msg.textContent="Building packet…";
  try{
    const {PDFDocument}=PDFLib; const packet=await PDFDocument.create(); let total=0;
    for(const id of ids){ const {bytes,wrote}=await fillForm(id); total+=wrote;
      const src=await PDFDocument.load(bytes,{ignoreEncryption:true});
      const pages=await packet.copyPages(src,src.getPageIndices()); pages.forEach(p=>packet.addPage(p)); }
    download(await packet.save(),insuredName()+" - ACORD packet.pdf");
    msg.style.color="var(--green)";msg.textContent="Packet ready — "+ids.length+" form"+(ids.length===1?"":"s")+", "+total+" fields filled.";
  }catch(e){ msg.style.color="#a33"; msg.textContent="Build failed: "+(e.message||e); }
}

/* ---- Saved requests (localStorage) ---- */
function readRequests(){ try{ return JSON.parse(localStorage.getItem(LS_REQUESTS)||"{}"); }catch(e){ return {}; } }
function refreshReqList(){
  const sel=document.getElementById("loadReq"); const all=readRequests();
  sel.querySelectorAll("option:not([disabled])").forEach(o=>o.remove());
  Object.keys(all).sort().forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o);});
}
function saveReq(){
  const msg=document.getElementById("reqMsg"); const name=val("namedInsured");
  if(!name){msg.style.color="#a33";msg.textContent="Add a Named Insured first.";return;}
  const d={}; REQUEST_KEYS.forEach(k=>d[k]=val(k)); d._forms=[...selected];
  const all=readRequests(); all[name]=d;
  try{ localStorage.setItem(LS_REQUESTS,JSON.stringify(all)); refreshReqList();
    msg.style.color="var(--green)";msg.textContent='Saved "'+name+'".'; }catch(e){msg.style.color="#a33";msg.textContent="Save failed.";}
}
function loadReq(name){
  if(!name)return; const all=readRequests(); const d=all[name]; if(!d)return;
  autoKeys=new Map();
  REQUEST_KEYS.forEach(k=>{setVal(k,d[k]||"");badge(k);});
  if(Array.isArray(d._forms)){ selected=new Set(d._forms); FORMS.forEach(f=>{const cb=document.getElementById("form-"+f.id);if(cb)cb.checked=selected.has(f.id);}); refreshFieldsView(); }
  if(currentAgency)applyAgency(currentAgency);
  const m=document.getElementById("reqMsg");m.style.color="var(--green)";m.textContent='Loaded "'+name+'".';
  refreshMissingNote();
}

/* ---- wire ---- */
document.getElementById("readBtn").addEventListener("click",readEmail);
document.getElementById("clearBtn").addEventListener("click",clearRequest);
document.getElementById("saveAgencyBtn").addEventListener("click",saveAgency);
document.getElementById("clearAgencyBtn").addEventListener("click",clearAgency);
document.getElementById("dlEach").addEventListener("click",downloadEach);
document.getElementById("dlPacket").addEventListener("click",downloadPacket);
document.getElementById("saveReqBtn").addEventListener("click",saveReq);
document.getElementById("loadReq").addEventListener("change",e=>loadReq(e.target.value));
loadAgency(); refreshReqList(); refreshFieldsView(); wireDecUpload();
