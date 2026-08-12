/* ACORD Auto-Fill — frontend logic.
   Templates are served from /templates/*.pdf. Extraction goes through /api/extract
   (serverless) so the Anthropic key stays on the server. Saved data uses localStorage. */

const TEMPLATE_URL = {
  "25":"/templates/acord-25.pdf", "28":"/templates/acord-28.pdf",
  "126":"/templates/acord-126.pdf", "140":"/templates/acord-140.pdf",
  "127":"/templates/acord-127.pdf", "130":"/templates/acord-130.pdf",
  "70":"/templates/acord-70.pdf", "71":"/templates/acord-71.pdf",
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

/* Forms: acro = real fillable fields; overlay = text printed onto a flat scan. */
const FORMS = [
  { id:"25",  name:"ACORD 25", title:"Certificate of Liability Insurance", mode:"acro" },
  { id:"28",  name:"ACORD 28", title:"Evidence of Commercial Property", mode:"overlay" },
  { id:"70",  name:"ACORD 70", title:"Personal Policy Change Request (Except Auto)", mode:"acro" },
  { id:"126", name:"ACORD 126", title:"Commercial General Liability", mode:"acro" },
  { id:"140", name:"ACORD 140", title:"Property Section", mode:"acro" },
  { id:"127", name:"ACORD 127", title:"Business Auto Section", mode:"overlay" },
  { id:"130", name:"ACORD 130", title:"Workers Compensation Application", mode:"overlay" },
  { id:"71",  name:"ACORD 71", title:"Personal Auto Policy Change Request", mode:"overlay" },
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
};

/* ---- Field UI ---- */
const REQUEST_SECTIONS = [
  { title:"Insured", fields:[
    ["namedInsured","Named Insured",true],["insStreet","Street",true],
    ["insCity","City"],["insState","State"],["insZip","ZIP"],
  ]},
  { title:"Policy", fields:[
    ["policyNumber","Policy number"],["effectiveDate","Effective date"],["expirationDate","Expiration date"],
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
let autoKeys=new Set(), agencyKeys=new Set(), currentAgency=null;
let selected=new Set(["25"]);

/* Render request fields */
const fieldsWrap=document.getElementById("fields");
REQUEST_SECTIONS.forEach(sec=>{
  const t=document.createElement("div");t.className="sec-title";t.textContent=sec.title;fieldsWrap.appendChild(t);
  const g=document.createElement("div");g.className="fgrid";
  sec.fields.forEach(f=>{
    const [key,label,full,area]=f;
    const cell=document.createElement("div");cell.className="f"+(full?" full":"");
    const lab=document.createElement("label");lab.id="lab-"+key;lab.textContent=label;
    const el=document.createElement(area?"textarea":"input");el.className="in";el.id="fld-"+key;
    el.addEventListener("input",()=>{ if(autoKeys.has(key)){autoKeys.delete(key);badge(key);} });
    cell.appendChild(lab);cell.appendChild(el);g.appendChild(cell);
  });
  fieldsWrap.appendChild(g);
});

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
  cb.addEventListener("change",()=>{cb.checked?selected.add(fm.id):selected.delete(fm.id);});
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
  if(autoKeys.has(key)){ if(!ex){const b=document.createElement("span");b.className="badge";b.textContent="from email";lab.appendChild(b);} fld.classList.add("g"); }
  else{ if(ex)ex.remove(); fld.classList.remove("g"); }
}
function markAgency(key,on){
  const lab=document.getElementById("lab-"+key), fld=document.getElementById("fld-"+key);
  if(!lab)return; const ex=lab.querySelector(".badge.ag");
  if(on){ autoKeys.delete(key); const g=lab.querySelector(".badge:not(.ag)"); if(g)g.remove(); fld.classList.remove("g");
    if(!ex){const b=document.createElement("span");b.className="badge ag";b.textContent="my agency";lab.appendChild(b);}
    fld.classList.add("a"); agencyKeys.add(key);
  }else{ if(ex)ex.remove(); fld.classList.remove("a"); agencyKeys.delete(key); }
}
const val=k=>{const e=document.getElementById("fld-"+k);return e?e.value.trim():"";};
const setVal=(k,v)=>{const e=document.getElementById("fld-"+k);if(e)e.value=v;};
function cityLine(){ return [val("insCity"),val("insState"),val("insZip")].filter(Boolean).join(" "); }
function insAddr(){ return [val("insStreet"), cityLine()].filter(Boolean).join(", "); }

/* ---- Step 1: extraction via serverless proxy ---- */
function schemaHint(){
  const r=REQUEST_SECTIONS.flatMap(s=>s.fields.map(f=>'"'+f[0]+'"')).join(", ");
  const a=AGENCY_FIELDS.map(f=>'"'+f[0]+'"').join(", ");
  return "Request keys: "+r+"\nAgency keys (only if the email states the agency): "+a;
}
async function readEmail(){
  const raw=document.getElementById("paste").value.trim();
  const msg=document.getElementById("readMsg");
  if(!raw){msg.className="msg err";msg.textContent="Paste the client's email first.";return;}
  const btn=document.getElementById("readBtn");btn.disabled=true;btn.textContent="Reading…";msg.className="";msg.textContent="";
  const system=
    "You are an insurance submission intake assistant. Read the pasted client/insured email and extract everything you "+
    "recognize into ONE JSON object using ONLY these exact keys:\n"+schemaHint()+
    "\nRules: return ONLY the JSON object (no markdown, no code fences, no commentary). Use \"\" for anything not stated. "+
    "Money as digits with commas ($1M -> 1,000,000; 2 million -> 2,000,000). Dates MM/DD/YYYY. "+
    "namedInsured = the business being insured (not the agency). insurerA = the insurance carrier/company. "+
    "Put the certificate holder into holder* keys. Building square footage -> propBuildingArea.";
  try{
    const resp=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:raw,system})});
    const data=await resp.json();
    if(!resp.ok) throw new Error(data && data.error ? data.error : "extraction failed");
    let text=(data.text||"").replace(/```json|```/g,"").trim();
    const parsed=JSON.parse(text);
    autoKeys=new Set(); let n=0;
    REQUEST_KEYS.forEach(k=>{ const v=parsed[k]; if(v!=null&&String(v).trim()!==""){setVal(k,String(v).trim());autoKeys.add(k);n++;} else setVal(k,""); badge(k); });
    if(currentAgency){ applyAgency(currentAgency); }
    else { AGENCY_KEYS.forEach(k=>{ const v=parsed[k]; if(v!=null&&String(v).trim()!==""){setVal(k,String(v).trim());} }); }
    msg.className="msg ok";
    msg.textContent="Filled "+n+" field"+(n===1?"":"s")+" from the email (highlighted green). Review Step 2, then download in Step 3.";
  }catch(e){
    msg.className="msg err";
    msg.textContent="Couldn't read that: "+(e.message||e)+". If this says the API key isn't set, add ANTHROPIC_API_KEY in your Vercel project settings.";
  }
  finally{ btn.disabled=false; btn.textContent="Read email & fill"; }
}
function clearRequest(){
  REQUEST_KEYS.forEach(k=>{setVal(k,"");}); autoKeys=new Set(); REQUEST_KEYS.forEach(badge);
  document.getElementById("paste").value="";
  const msg=document.getElementById("readMsg");msg.className="msg ok";msg.textContent="Cleared the request. Your saved agency stays.";
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
async function fillForm(formId){
  const {PDFDocument,StandardFonts,rgb}=PDFLib;
  const doc=await PDFDocument.load(await loadTemplate(formId),{ignoreEncryption:true});
  const meta=FORMS.find(f=>f.id===formId);

  if(meta.mode==="overlay"){
    const font=await doc.embedFont(StandardFonts.Helvetica);
    const ink=rgb(0.03,0.12,0.32);
    const map=OVERLAY[formId]; const page=doc.getPages()[map._page||0]; let wrote=0;
    for(const key of Object.keys(map)){
      if(key.startsWith("_"))continue;
      let v = key==="cityLine" ? cityLine() : val(key);
      if(!v)continue;
      const [x,y,size,mw]=map[key]; let t=String(v);
      if(mw){ while(t.length&&font.widthOfTextAtSize(t,size)>mw) t=t.slice(0,-1); }
      page.drawText(t,{x,y,size,font,color:ink}); wrote++;
    }
    return {bytes:await doc.save(), wrote};
  }

  const form=doc.getForm();
  const map=CROSSWALK[formId]; const forceFont=map._fontSize||null; let wrote=0;
  for(const key of Object.keys(map)){
    if(key.startsWith("_"))continue;
    let v = key==="insAddr" ? insAddr() : val(key);
    if(!v)continue;
    try{ const tf=form.getTextField(map[key]); if(forceFont){try{tf.setFontSize(forceFont);}catch(e){}} tf.setText(v); wrote++; }catch(e){}
  }
  if(map._checks){ for(const cond of Object.keys(map._checks)){ if(val(cond)){ for(const cf of map._checks[cond]){ try{form.getCheckBox(cf).check();}catch(e){} } } } }
  try{form.updateFieldAppearances();}catch(e){}
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
  autoKeys=new Set();
  REQUEST_KEYS.forEach(k=>{setVal(k,d[k]||"");badge(k);});
  if(Array.isArray(d._forms)){ selected=new Set(d._forms); FORMS.forEach(f=>{const cb=document.getElementById("form-"+f.id);if(cb)cb.checked=selected.has(f.id);}); }
  if(currentAgency)applyAgency(currentAgency);
  const m=document.getElementById("reqMsg");m.style.color="var(--green)";m.textContent='Loaded "'+name+'".';
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
loadAgency(); refreshReqList();
