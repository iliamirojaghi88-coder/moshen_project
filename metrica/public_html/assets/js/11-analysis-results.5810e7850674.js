/* assets/js/analysis/results.js */
/* assets/js/analysis/results.js
   METRICA — «آنالیز ساخت»: loading → results, moved from the reference script#metrica-results-app.
   Unchanged except: the root comes from form.js (a page view, not a <dialog>), the values come from
   MetricaAnalysisData.getEstimateResults() (demo-data.js), and the reference Estedad is loaded under its renamed family. The loading screen stays for MIN_LOADING_MS (5 s). */
(function(){
'use strict';
const dlg=window.MetricaAnalysis&&window.MetricaAnalysis.root,schema=window.MetricaResultsSchema;
const root=dlg&&dlg.querySelector('.md-results');
if(!root||!schema)return;
const load=dlg.querySelector('.md-loading'),sections=root.querySelector('.mr-sections');
const MIN_LOADING_MS=5000;
const numberFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pick=(obj,key)=>obj==null?undefined:obj[key];
const icon=name=>`<svg aria-hidden="true" class="mr-svg" focusable="false"><use href="#mr-i-${name}"></use></svg>`;
/* Value + unit; a missing value renders as a dash, never as a guessed number. */
function Value(v,unit){
 const ok=typeof v==='number'&&Number.isFinite(v);
 return `<bdi class="mr-num" dir="ltr">${ok?numberFormat.format(v):'—'}</bdi>${ok?`<span class="mr-unit">${esc(schema.units[unit])}</span>`:''}`;
}
function MetricTile(label,v,unit,mod=''){
 return `<div class="mr-tile${mod?' '+mod:''}">${label?`<span class="mr-label">${esc(label)}</span>`:''}${Value(v,unit)}</div>`;
}
/* Shared sub-group: violation (gold) and owner/contractor/method groups (blue). Its title is a heading only, never a value. */
function SubGroup(group,values,variant){
 const items=group.items.map(it=>`<div class="mr-sub-item"><span class="mr-label">${esc(it.label)}</span>${Value(pick(values,it.key),it.unit)}</div>`).join('');
 return `<section class="mr-sub mr-sub--${variant}"${group.title?` aria-label="${esc(group.title)}"`:''}>`
  +(group.title?`<h5 class="mr-sub-head">${group.icon?icon(group.icon):''}<span>${esc(group.title)}</span></h5>`:'')
  +(group.caption?`<p class="mr-sub-caption">${esc(group.caption)}</p>`:'')
  +`<div class="mr-sub-body" data-n="${group.items.length}" style="--n:${group.items.length}">${items}</div></section>`;
}
function ViolationGroup(values){
 return SubGroup({title:'متراژ تخلف',items:[{key:'upTo20',label:'تا ۲۰ درصد',unit:'m2'},{key:'over20',label:'بیش از ۲۰ درصد',unit:'m2'}]},values,'gold');
}
function Card(output,body,mod){
 return `<article class="mr-card${mod?' '+mod:''}" data-output="${output.id}" aria-labelledby="mr-o-${output.id}">`
  +`<header class="mr-head"><div class="mr-head-main"><div class="mr-head-inner"><span class="mr-icon">${icon(output.icon)}</span>`
  +`<h4 class="mr-head-title" id="mr-o-${output.id}">${esc(output.title)}</h4></div></div>`
  +`<svg aria-hidden="true" class="mr-head-cap" focusable="false" preserveAspectRatio="none" viewBox="0 0 100 100"><use href="#mr-cap"></use></svg></header>`
  +`<div class="mr-body">${body}</div></article>`;
}
function BuildingAreaCard(output,v){
 v=v||{};
 return Card(output,`<div class="mr-row mr-row--building">${MetricTile('مصوب',v.approved,'m2')}${MetricTile('اجرایی',v.executed,'m2')}${ViolationGroup(v.violation)}</div>`);
}
function TilesCard(output,v){
 return Card(output,`<div class="mr-row mr-row--n${output.items.length}">${output.items.map(it=>MetricTile(it.label,pick(v,it.key),it.unit)).join('')}</div>`);
}
function ViolationTotalCard(output,v){
 return Card(output,SubGroup({items:output.items},v,'gold'));
}
function FinancialMetricCard(output,v,variant){
 const mod=['mr-card--metric',variant&&'mr-card--'+variant,output.variant&&'mr-card--'+output.variant].filter(Boolean).join(' ');
 return Card(output,MetricTile('',v,output.unit,'mr-tile--solo'),mod);
}
function OwnerContractorGroup(output,v){
 return Card(output,`<div class="mr-parties">${output.groups.map(g=>SubGroup(g,pick(v,g.key),'blue')).join('')}</div>`);
}
function InflationAnalysisGroup(output,v){return TilesCard(output,v)}
const renderers={building:BuildingAreaCard,tiles:TilesCard,violationTotal:ViolationTotalCard,parties:OwnerContractorGroup,inflation:InflationAnalysisGroup};
function renderOutput(output,values,variant){
 return output.type==='metric'?FinancialMetricCard(output,values[output.id],variant):renderers[output.type](output,values[output.id]);
}
/* Consecutive single-value outputs share one grid; every other output is a full-width card. */
function ResultSection(section,model){
 const outputs=section.outputs;
 const parts=[];let run=[];
 const flush=()=>{if(!run.length)return;const n=run.length;
  parts.push(`<div class="mr-grid" data-count="${n}" data-odd="${n%2}" data-rest="${n>3?n%3:0}">${run.join('')}</div>`);run=[]};
 for(const output of outputs){
  const html=renderOutput(output,model.values,section.variant);
  if(output.type==='metric')run.push(html);else{flush();parts.push(html)}
 }
 flush();
 return `<section class="mr-section" aria-labelledby="mr-s-${section.id}"><h3 class="mr-section-title" id="mr-s-${section.id}">${esc(section.title)}</h3><div class="mr-stack">${parts.join('')}</div></section>`;
}
function ResultsPage(model){return schema.sections.map(s=>ResultSection(s,model)).join('')}
/* Central data model. The default source is the DEMO data (assets/js/analysis/demo-data.js); a backend source can replace it later. */
let dataSource=payload=>window.MetricaAnalysisData.getEstimateResults(payload);
function buildModel(payload,values){
 return {values,isMock:dataSource===mockSource};
}
const mockSource=dataSource;
/* Loading → results: at least five seconds, one timer per run, stale runs are ignored. */
let run=0,timer=0;
const headline=load.querySelector('h2'),subline=load.querySelector('p'),loadingText=[headline.textContent,subline.textContent];
function resetLoadingText(){headline.textContent=loadingText[0];subline.textContent=loadingText[1]}
function cancel(){run++;clearTimeout(timer);timer=0}
function hideResults(){
 cancel();
 root.hidden=true;root.classList.remove('is-entering');dlg.classList.remove('is-results');
 resetLoadingText();
}
function ResultsLoadingTransition(payload){
 cancel();
 const id=run;
 resetLoadingText();
 const minimum=new Promise(resolve=>{timer=setTimeout(resolve,MIN_LOADING_MS)});
 const prepared=Promise.resolve()
  .then(()=>dataSource(payload))
  .then(values=>{const html=ResultsPage(buildModel(payload,values));
   const fonts=document.fonts?Promise.all(['400 16px "MA Estedad"','800 26px "MA Estedad"'].map(f=>document.fonts.load(f))).catch(()=>{}):null;
   return Promise.resolve(fonts).then(()=>html)});
 Promise.all([prepared,minimum]).then(([html])=>{
  if(id!==run||!dlg.hasAttribute('open'))return;
  timer=0;
  sections.innerHTML=html;
  load.hidden=true;
  dlg.classList.add('is-results');
  root.hidden=false;root.scrollTop=0;
  root.classList.remove('is-entering');void root.offsetWidth;root.classList.add('is-entering');
  root.querySelector('#mr-title').focus({preventScroll:true});
 },error=>{
  if(id!==run)return;
  headline.textContent='آماده‌سازی نتایج انجام نشد';
  subline.textContent='لطفاً به فرم بازگردید و دوباره تلاش کنید.';
  console.error(error);
 });
}
dlg.addEventListener('metrica:demo-submit',e=>ResultsLoadingTransition(e.detail&&e.detail.data));
dlg.addEventListener('metrica:stage-rendered',hideResults);
dlg.addEventListener('close',hideResults);
root.querySelector('.mr-back').addEventListener('click',()=>{if(typeof dlg.mdShowForm==='function')dlg.mdShowForm()});
window.MetricaResults={render:ResultsPage,setDataSource(fn){dataSource=fn}};
})();

