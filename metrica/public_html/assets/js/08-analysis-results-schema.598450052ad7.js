/* assets/js/analysis/results-schema.js */
/* assets/js/analysis/results-schema.js — unchanged from the reference (script#metrica-results-schema). */
/* METRICA results schema: every output has a stable id, title, icon and unit.
   Adding an output means adding an entry here, never copying markup. */
window.MetricaResultsSchema=(function(){
const m2='m2',toman='toman',percent='percent';
const profitItems=[{key:'profit',label:'سود',unit:toman},{key:'profitPercent',label:'درصد سود',unit:percent}];
const party=(role,label,icon)=>({key:role,title:label,icon,items:[
 {key:'contribution',label:'آورده '+label,unit:toman},
 {key:'profitPercent',label:'درصد سود '+label,unit:percent},
 {key:'profit',label:'میزان سود '+label,unit:toman}]});
const areaParty=(role,label,icon)=>({key:role,title:label,icon,items:[
 {key:'residential',label:'مسکونی',unit:m2},{key:'office',label:'اداری',unit:m2},{key:'commercial',label:'تجاری',unit:m2}]});
return {
 units:{m2:'متر مربع',toman:'تومان',percent:'درصد'},
 sections:[
  {id:'building',title:'متراژهای ساختمانی',outputs:[
   {id:'total_construction_area',no:1,type:'building',title:'کل بنای ساخت',icon:'building'},
   {id:'pilot_area',no:2,type:'building',title:'کل بنای پیلوت',icon:'car'},
   {id:'basement_area',no:3,type:'building',title:'بنای طبقات منفی',icon:'layers'},
   {id:'above_ground_area',no:4,type:'building',title:'بنای طبقات مثبت',icon:'floors'},
   {id:'usable_area',no:5,type:'tiles',title:'میزان متراژ مفید',icon:'ruler',items:[
    {key:'residential',label:'مسکونی',unit:m2},{key:'commercial',label:'تجاری',unit:m2},{key:'office',label:'اداری',unit:m2}]},
   {id:'violation_total',no:6,type:'violationTotal',title:'جمع کل متراژ تخلف',icon:'warning',items:[
    {key:'total',label:'کل',unit:m2},{key:'upTo20',label:'تا ۲۰ درصد',unit:m2},{key:'over20',label:'بیش از ۲۰ درصد',unit:m2}]}
  ]},
  {id:'costs',title:'هزینه‌ها',outputs:[
   {id:'construction_cost_total',no:7,type:'metric',title:'هزینه ساخت کل',icon:'coins',unit:toman},
   {id:'utility_connections_total',no:8,type:'metric',title:'هزینه انشعابات کل',icon:'plug',unit:toman},
   {id:'completion_and_permit_cost',no:9,type:'metric',title:'هزینه پایان کار + پروانه',icon:'certificate',unit:toman},
   {id:'capital_idle_cost',no:10,type:'metric',title:'هزینه خواب سرمایه',icon:'hourglass',unit:toman},
   {id:'contract_management_fee',no:11,type:'metric',title:'مبلغ مدیریت پیمان',icon:'briefcase',unit:toman},
   {id:'land_value',no:12,type:'metric',title:'ارزش ریالی زمین',icon:'land',unit:toman},
   {id:'penalty_cost',no:13,type:'metric',title:'هزینه جریمه',icon:'gavel',unit:toman}
  ]},
  {id:'revenue',title:'درآمد فروش',variant:'revenue',outputs:[
   {id:'residential_sales_revenue',no:14,type:'metric',title:'درآمد حاصل از فروش واحدهای مسکونی',icon:'house',unit:toman},
   {id:'office_sales_revenue',no:15,type:'metric',title:'درآمد حاصل از فروش واحدهای اداری',icon:'office',unit:toman}
  ]},
  /* All three construction models are always shown, each with its own outputs. */
  {id:'construction_models',title:'مدل‌های ساخت',outputs:[
   {id:'owner_builder_profit',type:'tiles',title:'مالک‌سازنده',icon:'user',items:profitItems},
   {id:'contract_management_profit',type:'tiles',title:'مدیریت پیمان',icon:'briefcase',items:profitItems},
   {id:'partnership_profit',type:'parties',title:'مشارکت در ساخت',icon:'users',groups:[party('owner','مالک','user'),party('contractor','عامل','helmet')]}
  ]},
  {id:'owner_contractor',title:'مالک و عامل',outputs:[
   {id:'area_by_party',type:'parties',title:'میزان متراژ',icon:'area',groups:[areaParty('owner','مالک','user'),areaParty('contractor','عامل','helmet')]},
   {id:'unit_division',type:'parties',title:'تقسیم نام واحدها',icon:'split',groups:[
    {key:'byAgreement',title:'روش اول — بر اساس توافق',items:[
     {key:'ownerFloorsArea',label:'متراژ طبقات مالک',unit:m2},{key:'contractorFloorsArea',label:'متراژ طبقات عامل',unit:m2}]},
    {key:'byFloorQuality',title:'روش دوم — بر اساس میزان مرغوبیت طبقات',caption:'درصد افزایش مرغوبیت طبقات',items:[
     {key:'ownerShare',label:'سهم مالک',unit:percent},{key:'contractorShare',label:'سهم عامل',unit:percent}]}]}
  ]},
  {id:'economic_analysis',title:'تحلیل اقتصادی',outputs:[
   {id:'inflation_adjusted_spending',no:16,type:'metric',title:'میزان هزینه‌کرد تقریبی بر اساس تورم',icon:'wallet',unit:toman},
   {id:'inflation_adjusted_revenue',no:17,type:'metric',title:'میزان درآمد تقریبی بر اساس تورم بخش مصرف‌کننده',icon:'trend',unit:toman},
   {id:'instant_profit_no_inflation',no:18,type:'metric',title:'سود لحظه‌ای بدون تورم',icon:'bars',unit:toman},
   {id:'inflation_cost_price',no:19,type:'inflation',title:'قیمت تمام‌شده بر اساس تورم در مدت زمان ساخت',icon:'trend',items:[
    {key:'builderExpected',label:'بر اساس تورم مدنظر سازنده',unit:toman},
    {key:'generalIndex',label:'بر اساس شاخص عمومی تورم',unit:toman},
    {key:'productionInputsIndex',label:'بر اساس شاخص نهاده‌های تولید',unit:toman}]},
   {id:'total_fines',no:20,type:'metric',title:'هزینه کل جرائم',icon:'alert-doc',unit:toman},
   {id:'property_renewal_education_costs',no:21,type:'metric',title:'هزینه دارایی، نوسازی، آموزش و پرورش و ...',icon:'receipt',unit:toman},
   {id:'final_profit_percent',no:22,type:'metric',variant:'highlight',title:'درصد سود نهایی',icon:'percent',unit:percent}
  ]}
 ]
};
})();

