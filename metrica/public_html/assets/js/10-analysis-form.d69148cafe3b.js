/* assets/js/analysis/form.js */
/* assets/js/analysis/form.js
   METRICA — «آنالیز ساخت»: the six-stage input form, moved from the reference
   «METRICA_DESKTOP_SINGLE_FLOW_SMOOTH_WEBP_HIGH_QUALITY (1).html»:
     script#metrica-demo-steps-script          stages, validation, entry guards, dependent fields, choice panel, payload
     script#metrica-demo-percent-entry-guard   percent entry guard
     script#metrica-entrance-motion-js-v2      field entrance (form part only)
   The reference code is kept as it was; the changes are limited to what the move needs:
   the root is a full-screen page view instead of a <dialog>, and stage changes go through the app URL
   (see "app integration" below). Exposes window.MetricaAnalysis = {root, mount, update, unmount} for the router. */
window.MetricaAnalysis=(function(){
const ROUTE='#/features/analysis',RESULTS=ROUTE+'/results',stepHash=i=>i?`${ROUTE}/${i+1}`:ROUTE;
/* One persistent view built from <template id="tpl-analysis">: as with the reference dialog,
   entered values stay when the page is left and opened again. */
const dlg=document.importNode(document.getElementById('tpl-analysis').content.firstElementChild,true);
const stages=[...dlg.querySelectorAll('.md-stage')],scroller=dlg.querySelector('.md-scroll'),load=dlg.querySelector('.md-loading'),total=stages.length;
let step=0,loading=false;
const toAscii=s=>String(s).replace(/[۰-۹٠-٩]/g,c=>{let n='۰۱۲۳۴۵۶۷۸۹'.indexOf(c);return n>=0?String(n):String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))});
const toFa=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const reducedMotion=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
/* Persian decimal separator (٫) and the common slash form (۰/۸) both mean a decimal point. */
function raw(v){return toAscii(v).replace(/[,٬،\s]/g,'').replace(/[٫\/]/g,'.')}
const fieldOf=el=>el.closest('.md-field');
const isActive=field=>!!field&&field.dataset.active!=='false';
const labelOf=field=>(field.querySelector('label')||{}).textContent||'';
function check(input){const rule=input.dataset.rule,opt=JSON.parse(input.dataset.options||'{}'),v=raw(input.value);if(!v)return 'این فیلد را پر کنید';if(rule==='plain')return '';if(!/^(?:\d+\.?\d*|\.\d+)$/.test(v))return 'عدد معتبر وارد کنید';const n=Number(v);if(!Number.isFinite(n))return 'عدد معتبر وارد کنید';if((rule==='integer'||rule==='money')&&!/^\d+$/.test(v))return 'عدد صحیح وارد کنید';if(opt.maxValue!=null&&n>opt.maxValue)return 'حداکثر '+toFa(opt.maxValue)+' مجاز است';if(rule==='percent'&&n>100)return 'حداکثر ۱۰۰٪ مجاز است';if(opt.digits&&v.replace(/\D/g,'').length>opt.digits)return 'تعداد رقم بیش از حد مجاز است';if(rule==='percent'||rule==='decimal'){const parts=v.split('.'),maxInt=rule==='percent'?3:(opt.maxInt||8),maxDec=rule==='percent'?2:(opt.maxDecimal||2);if(parts[0].length>maxInt||((parts[1]||'').length>maxDec))return 'تعداد رقم بیش از حد مجاز است';}if(opt.positive&&n<=0)return 'مقدار باید بیشتر از صفر باشد';if(opt.min!=null&&n<opt.min)return 'حداقل '+toFa(opt.min)+' مجاز است';if(opt.notAbove){const other=dlg.querySelector(`.md-field[data-key="${opt.notAbove}"]`),otherInput=other&&other.querySelector('input');if(otherInput&&!check(otherInput)&&n>Number(raw(otherInput.value)))return 'نباید از '+labelOf(other)+' بیشتر باشد';}return ''}
function choicesOf(btn){try{return JSON.parse(btn.dataset.choices||'[]')}catch(e){return []}}
function choiceValue(btn){let v=null;try{v=JSON.parse(btn.dataset.value||'null')}catch(e){}return btn.dataset.mode==='multi'?(Array.isArray(v)?v:[]):v}
function checkChoice(btn){if(!choicesOf(btn).length)return '';const v=choiceValue(btn);if(btn.dataset.mode==='multi')return v.length?'':'حداقل یک مورد را انتخاب کنید';return v===null?'یک گزینه را انتخاب کنید':''}
const validate=control=>control.classList.contains('md-select')?checkChoice(control):check(control);
function displayMoney(input){if(input.dataset.rule!=='money')return;const start=input.selectionStart,old=input.value,rawBefore=raw(old.slice(0,start)).length;let value=raw(old);if(!/^\d*$/.test(value))return;input.value=value.replace(/\B(?=(\d{3})+(?!\d))/g,',');let pos=0,count=0;while(pos<input.value.length&&count<rawBefore){if(/\d/.test(input.value[pos]))count++;pos++}input.setSelectionRange(pos,pos)}
function mark(input,message){let f=input.closest('.md-field');f.classList.toggle('invalid',!!message);f.querySelector('.md-error').textContent=message;input.setAttribute('aria-invalid',message?'true':'false')}
const controlsOf=root=>[...root.querySelectorAll('.md-field input,.md-field .md-select')].filter(el=>!el.disabled&&isActive(fieldOf(el)));
/* Numeric entry guard: only characters that can still form a valid value are accepted. */
function entryPattern(input){const rule=input.dataset.rule,opt=JSON.parse(input.dataset.options||'{}');if(rule==='money')return v=>/^\d*$/.test(raw(v))&&raw(v).length<=(opt.digits||15);const norm=v=>toAscii(v).replace(/[٫\/]/g,'.');if(rule==='integer')return v=>new RegExp(`^\\d{0,${opt.digits||6}}$`).test(norm(v));if(rule==='decimal'){const re=new RegExp(`^\\d{0,${opt.maxInt||8}}(?:\\.\\d{0,${opt.maxDecimal||2}})?$`);return v=>re.test(norm(v))}return null}
function guardEntry(input){const ok=entryPattern(input);if(!ok)return;let accepted=input.value;input.addEventListener('beforeinput',e=>{if(e.isComposing||!e.cancelable||!e.inputType.startsWith('insert'))return;const data=e.data!=null?e.data:(e.dataTransfer&&e.dataTransfer.getData('text/plain'));if(data==null)return;const a=input.selectionStart??input.value.length,b=input.selectionEnd??a;if(!ok(input.value.slice(0,a)+data+input.value.slice(b)))e.preventDefault()},true);input.addEventListener('input',()=>{if(ok(input.value)){accepted=input.value;return}const position=Math.min(input.selectionStart??accepted.length,accepted.length);input.value=accepted;try{input.setSelectionRange(position,position)}catch(e){}},true)}
for(const input of dlg.querySelectorAll('.md-field input')){guardEntry(input);input.setAttribute('enterkeyhint','next');input.addEventListener('input',()=>{displayMoney(input);if(input.closest('.md-field').classList.contains('invalid'))mark(input,check(input));const stage=input.closest('.md-stage');for(const other of stage.querySelectorAll('.md-field.invalid input'))if(other!==input)mark(other,check(other));applyDependencies(true)});input.addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.isComposing)return;
 e.preventDefault();
 const stage=input.closest('.md-stage');
 const ordered=controlsOf(stage);
 const index=ordered.indexOf(input);
 if(index>=0&&index<ordered.length-1){
  const next=ordered[index+1];
  next.focus({preventScroll:true});
  next.scrollIntoView({block:'nearest',behavior:'smooth'});
 }else{input.blur();goNext();}
})}
/* Dependent fields: shown only while their parent condition holds; inactive values never reach the payload. */
const dependents=[...dlg.querySelectorAll('.md-field[data-show-if]')];
function keyValue(key){const f=dlg.querySelector(`.md-field[data-key="${key}"]`);if(!isActive(f))return null;const sel=f.querySelector('.md-select');if(sel)return choiceValue(sel);const input=f.querySelector('input');return input?raw(input.value):null}
function holds(condition){const m=/^([\w.]+)(=|>)(.+)$/.exec(condition.trim());if(!m)return false;const value=keyValue(m[1]);if(value===null||value==='')return false;if(m[2]==='=')return String(value)===m[3];return /^\d+(?:\.\d+)?$/.test(String(value))&&Number(value)>Number(m[3])}
function setShown(field,show,animate){
 if((field.dataset.active!=='false')===show&&field.dataset.active!==undefined)return;
 field.dataset.active=String(show);
 clearTimeout(field._mdTimer);
 field.classList.remove('md-reveal','md-leaving');
 if(show){field.hidden=false;if(animate&&!reducedMotion()){void field.offsetWidth;field.classList.add('md-reveal')}return}
 field.querySelectorAll('input,.md-select').forEach(control=>mark(control,''));
 if(animate&&!reducedMotion()){field.classList.add('md-leaving');field._mdTimer=setTimeout(()=>{field.hidden=true;field.classList.remove('md-leaving')},150)}
 else field.hidden=true;
}
function applyDependencies(animate){for(const field of dependents)setShown(field,field.dataset.showIf.split('&').every(holds),animate)}
/* Mini-panel: one shared panel for every choice field; single choice closes on pick, multi choice commits on «تأیید». */
const shell=dlg.querySelector('.md-shell'),scrim=dlg.querySelector('.md-picker-scrim'),panel=dlg.querySelector('.md-picker'),panelTitle=panel.querySelector('#md-picker-title'),list=panel.querySelector('.md-picker-list'),empty=panel.querySelector('.md-picker-empty'),foot=panel.querySelector('.md-picker-foot');
let picker=null,pickerTimer=0;
function showChoice(btn){const opts=choicesOf(btn),v=choiceValue(btn),labels=(btn.dataset.mode==='multi'?v:(v===null?[]:[v])).map(x=>(opts.find(o=>o.value===x)||{}).label).filter(Boolean);btn.querySelector('.md-select-value').textContent=labels.length?labels.join('، '):'انتخاب کنید';btn.classList.toggle('is-empty',!labels.length)}
function setChoice(btn,value){btn.dataset.value=JSON.stringify(value);showChoice(btn);mark(btn,'');applyDependencies(true)}
function syncOptions(){const chosen=picker.multi?picker.draft:new Set([choiceValue(picker.btn)]);list.querySelectorAll('.md-opt').forEach(o=>o.setAttribute('aria-checked',String(chosen.has(JSON.parse(o.dataset.value)))))}
function placePicker(){
 if(!picker)return;
 const host=shell.getBoundingClientRect(),r=picker.btn.getBoundingClientRect(),margin=12,gap=8;
 const width=Math.min(Math.max(r.width,260),380,host.width-margin*2);
 const ltr=getComputedStyle(panel).direction==='ltr',left=Math.min(Math.max((ltr?r.left:r.right-width)-host.left,margin),host.width-width-margin);
 panel.style.width=width+'px';panel.style.left=left+'px';panel.style.maxHeight='none';
 const height=panel.offsetHeight,below=host.bottom-r.bottom-gap-margin,above=r.top-host.top-gap-margin,down=height<=below||below>=above;
 const room=Math.max(down?below:above,120);
 panel.style.maxHeight=room+'px';
 panel.style.top=(down?r.bottom-host.top+gap:r.top-host.top-gap-Math.min(height,room))+'px';
 panel.classList.toggle('from-bottom',!down);
}
function openPicker(btn){
 if(picker)closePicker(false,true);
 const opts=choicesOf(btn),multi=btn.dataset.mode==='multi',field=fieldOf(btn);
 picker={btn,multi,draft:multi?new Set(choiceValue(btn)):null};
 panelTitle.textContent=labelOf(field);
 list.textContent='';list.setAttribute('role',multi?'group':'radiogroup');list.classList.toggle('md-picker-wide',opts.length>4);
 for(const o of opts){const b=document.createElement('button');b.type='button';b.className='md-opt';b.setAttribute('role',multi?'checkbox':'radio');b.dataset.value=JSON.stringify(o.value);b.innerHTML='<span aria-hidden="true" class="md-opt-mark"></span><span class="md-opt-label"></span>';b.lastChild.textContent=o.label;list.append(b)}
 list.hidden=!opts.length;empty.hidden=!!opts.length;foot.hidden=!(multi&&opts.length);
 syncOptions();
 btn.scrollIntoView({block:'nearest'});
 clearTimeout(pickerTimer);
 btn.setAttribute('aria-expanded','true');field.classList.add('md-open');
 scrim.hidden=false;panel.hidden=false;placePicker();
 void panel.offsetWidth;scrim.classList.add('is-open');panel.classList.add('is-open');
 (list.querySelector('.md-opt[aria-checked="true"]')||list.querySelector('.md-opt')||panel.querySelector('.md-picker-back')).focus({preventScroll:true});
}
function closePicker(restoreFocus=true,instant=false){
 if(!picker)return;
 const {btn}=picker;picker=null;
 btn.setAttribute('aria-expanded','false');fieldOf(btn).classList.remove('md-open');
 scrim.classList.remove('is-open');panel.classList.remove('is-open');
 const hide=()=>{if(!picker){panel.hidden=true;scrim.hidden=true}};
 clearTimeout(pickerTimer);
 if(instant||reducedMotion())hide();else pickerTimer=setTimeout(hide,170);
 if(restoreFocus)btn.focus({preventScroll:true});
}
dlg.querySelectorAll('.md-select').forEach(btn=>{showChoice(btn);btn.addEventListener('click',()=>picker&&picker.btn===btn?closePicker():openPicker(btn))});
list.addEventListener('click',e=>{const option=e.target.closest('.md-opt');if(!option||!picker)return;const value=JSON.parse(option.dataset.value);if(picker.multi){picker.draft.has(value)?picker.draft.delete(value):picker.draft.add(value);syncOptions();return}const btn=picker.btn;setChoice(btn,value);syncOptions();closePicker()});
panel.querySelector('.md-picker-ok').addEventListener('click',()=>{if(!picker)return;const btn=picker.btn,order=choicesOf(btn).map(o=>o.value);setChoice(btn,order.filter(v=>picker.draft.has(v)));closePicker()});
panel.querySelector('.md-picker-back').addEventListener('click',()=>closePicker());
scrim.addEventListener('click',()=>closePicker());
panel.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePicker();return}
 const focusable=[...panel.querySelectorAll('button')].filter(b=>!b.closest('[hidden]'));
 const i=focusable.indexOf(document.activeElement);
 if(e.key==='Tab'){e.preventDefault();focusable[(i+(e.shiftKey?-1:1)+focusable.length)%focusable.length].focus();return}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){const options=[...list.querySelectorAll('.md-opt')],j=options.indexOf(document.activeElement);if(!options.length)return;e.preventDefault();options[(j+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus()}
});
dlg.addEventListener('close',()=>closePicker(false,true));
window.addEventListener('resize',placePicker,{passive:true});
if(window.visualViewport)visualViewport.addEventListener('resize',placePicker,{passive:true});
function setPath(target,key,value){const parts=key.split('.'),last=parts.pop();let node=target;for(const p of parts)node=node[p]||(node[p]={});node[last]=value}
/* Backend-ready payload: nested keys from data-key, numbers as numbers, inactive dependents omitted. */
function collect(){const data={};for(const field of dlg.querySelectorAll('.md-field[data-key]')){if(!isActive(field))continue;const sel=field.querySelector('.md-select');if(sel){setPath(data,field.dataset.key,choiceValue(sel));continue}const v=raw(field.querySelector('input').value);setPath(data,field.dataset.key,v===''?null:Number(v))}return data}
dlg.collectDemoData=collect;
dlg.mdShowForm=()=>back(stepHash(total-1));
function render(){loading=false;load.hidden=true;dlg.querySelector('.md-head').hidden=false;dlg.querySelector('.md-progress').hidden=false;scroller.hidden=false;dlg.querySelector('.md-footer').hidden=false;closePicker(false,true);dlg.querySelectorAll('.md-reveal,.md-leaving').forEach(f=>{f.classList.remove('md-reveal','md-leaving');if(!isActive(f))f.hidden=true});stages.forEach((s,i)=>s.classList.toggle('active',i===step));dlg.querySelector('#md-step-count').textContent=`مرحله ${toFa(step+1)} از ${toFa(total)}`;dlg.querySelector('#md-progress-percent').textContent=`${toFa(Math.round((step+1)/total*100))}٪`;dlg.querySelector('#md-track-fill').style.width=`${(step+1)/total*100}%`;dlg.querySelectorAll('.md-step-dot').forEach((dot,i)=>{dot.classList.toggle('active',i===step);dot.classList.toggle('done',i<step)});dlg.querySelector('.md-prev').disabled=step===0;dlg.querySelector('.md-next').innerHTML=step===total-1?'محاسبه برآورد <span>←</span>':'مرحله بعدی <span>←</span>';dlg.querySelector('.md-next').disabled=false;scroller.scrollTop=0;dlg.dispatchEvent(new CustomEvent('metrica:stage-rendered',{detail:{step}}))}
function showLoading(){loading=true;dlg.querySelector('.md-head').hidden=true;dlg.querySelector('.md-progress').hidden=true;scroller.hidden=true;dlg.querySelector('.md-footer').hidden=true;load.hidden=false;const el=dlg.querySelector('#md-lottie');if(window.lottie&&!el.dataset.loaded){try{window.lottie.loadAnimation({container:el,renderer:'svg',loop:true,autoplay:true,animationData:window.metricaOriginalLoading});el.dataset.loaded='1'}catch(e){}}}
function goNext(){if(loading)return;const controls=controlsOf(stages[step]);let first=null;controls.forEach(control=>{let message=validate(control);mark(control,message);if(message&&!first)first=control});if(first){first.scrollIntoView({block:'center',behavior:'smooth'});first.focus({preventScroll:true});return}go(step<total-1?stepHash(step+1):RESULTS)}
function submit(){dlg.dispatchEvent(new CustomEvent('metrica:demo-submit',{detail:{data:collect()}}));showLoading()}
dlg.querySelector('.md-exit').addEventListener('click',()=>back('#/features'));dlg.querySelector('.md-prev').addEventListener('click',()=>{if(step>0)back(stepHash(step-1))});dlg.querySelector('.md-next').addEventListener('click',goNext);dlg.querySelector('.md-loading-back').addEventListener('click',dlg.mdShowForm);
applyDependencies(false);
render();

/* ---------- app integration (new): stages and results are history entries of the app router ----------
   #/features/analysis        stage 1      #/features/analysis/2 … /6  stages 2–6
   #/features/analysis/results  loading (5 s) → results
   Forward moves add an entry; backward buttons reuse the entry they came from, so the in-page
   buttons and the browser Back button walk the same path and entered values are never lost. */
function go(hash){const from=location.hash;location.hash=hash;history.replaceState({maFrom:from},'')}
function back(hash){if(history.state&&history.state.maFrom===hash)history.back();else location.replace(hash)}
/* Called by the router on every hash change inside this route. A stage (or the results) opens only
   when every earlier stage is valid; otherwise the first incomplete stage opens (e.g. after a reload). */
function update(){
 const m=/^#\/features\/analysis(?:\/([1-9]\d*|results))?$/.exec(location.hash);
 if(!m){location.replace(ROUTE);return}
 const target=m[1]==='results'?total:Number(m[1]||1)-1;
 if(target>total){location.replace(stepHash(total-1));return}
 for(let i=0;i<target;i++)if(controlsOf(stages[i]).some(validate)){location.replace(stepHash(i));return}
 if(target===total){step=total-1;submit();return}
 step=target;render();
}
function mount(){dlg.setAttribute('open','');return dlg}
function unmount(){if(!dlg.hasAttribute('open'))return;dlg.removeAttribute('open');dlg.dispatchEvent(new Event('close'))}
/* «امکانات»: the whole «آنالیز ساخت» card (its arrow disc included) opens this view */
document.addEventListener('click',e=>{if(e.target.closest('.mt-tool--anal'))go(ROUTE)});

/* ---------- reference script#metrica-demo-percent-entry-guard ---------- */
(function(){
const norm=s=>String(s).replace(/[۰-۹٠-٩]/g,c=>{const p='۰۱۲۳۴۵۶۷۸۹'.indexOf(c);return String(p<0?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):p)}).replace(/[٫\/]/g,'.');
const valid=s=>{const v=norm(s);if(v==='')return true;if(!/^\d{0,3}(?:\.\d{0,2})?$/.test(v))return false;const whole=v.split('.')[0];return whole.length<3||whole==='100'&&(!v.includes('.')||Number(v)<=100)};
for(const input of dlg.querySelectorAll('input[data-rule="percent"]')){
 let accepted=input.value;
 input.addEventListener('beforeinput',e=>{
  if(e.isComposing||!e.cancelable||!e.inputType.startsWith('insert')||e.data==null)return;
  const a=input.selectionStart??input.value.length,b=input.selectionEnd??a;
  const proposed=input.value.slice(0,a)+e.data+input.value.slice(b);
  if(!valid(proposed))e.preventDefault();
 },true);
 input.addEventListener('input',()=>{
  if(valid(input.value)){accepted=input.value;return;}
  const position=input.selectionStart??input.value.length;
  input.value=accepted;
  try{input.setSelectionRange(Math.min(position,accepted.length),Math.min(position,accepted.length))}catch(e){}
 },true);
 input.addEventListener('blur',()=>{if(valid(input.value))accepted=input.value;});
}
})();

/* ---------- reference script#metrica-entrance-motion-js-v2 (the form-field part; the root is not a <dialog>, so `open` is an attribute) ---------- */
(function(){
if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
const demo=dlg;
let fieldObserver=null,lastStage=null;
function fieldRun(){
 if(!demo||!demo.hasAttribute('open'))return;
 const stage=demo.querySelector('.md-stage.active');if(!stage)return;
 if(fieldObserver){fieldObserver.disconnect();fieldObserver=null;}
 /* Nested modal scrollport may never deliver an intersection event.
    Fields must always remain visible and interactive. */
 const fields=[...stage.querySelectorAll('.md-field')];
 fields.forEach((field,i)=>{
  field.classList.remove('mx-visible');
  field.style.setProperty('--mx-delay',Math.min(i,7)*95+'ms');
 });
 // Force a style boundary so CSS animation restarts on every render path.
 void stage.offsetHeight;
 fields.forEach(field=>field.classList.add('mx-visible'));
 lastStage=stage;
}
new MutationObserver(()=>{if(demo.hasAttribute('open'))requestAnimationFrame(fieldRun)}).observe(demo,{attributes:true,attributeFilter:['open']});
demo.addEventListener('metrica:stage-rendered',()=>requestAnimationFrame(fieldRun));
demo.addEventListener('close',()=>{if(fieldObserver)fieldObserver.disconnect();lastStage=null;demo.querySelectorAll('.md-field').forEach(f=>f.classList.remove('mx-visible'))});
})();

return {root:dlg,mount,update,unmount};
})();

