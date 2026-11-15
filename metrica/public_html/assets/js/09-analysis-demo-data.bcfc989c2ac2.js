/* assets/js/analysis/demo-data.js */
/* assets/js/analysis/demo-data.js
   «آنالیز ساخت» — where the results come from. The only data source today is DEMO.

   DEMO_RESULTS are the display values of the reference file (script#metrica-results-mock), unchanged.
   They are NOT calculation results and do not depend on the form inputs.
   When the METRICA backend exists, replace getEstimateResults() with the real call: it receives the
   nested form payload (see form.js collect()) and must resolve to values keyed by output id
   (see results-schema.js). Nothing else in the app reads DEMO_RESULTS. */
window.MetricaAnalysisData = (() => {
  'use strict';
  const DEMO_RESULTS = {
 "_note":"Demo values for layout only. They are not calculation results and must be replaced by the backend output.",
 "total_construction_area":{"approved":2400,"executed":2680,"violation":{"upTo20":200,"over20":80}},
 "pilot_area":{"approved":480,"executed":520,"violation":{"upTo20":40,"over20":0}},
 "basement_area":{"approved":600,"executed":720,"violation":{"upTo20":120,"over20":0}},
 "above_ground_area":{"approved":48000,"executed":85000,"violation":{"upTo20":9600,"over20":27400}},
 "usable_area":{"residential":1850,"commercial":320,"office":410},
 "violation_total":{"total":37440,"upTo20":9960,"over20":27480},
 "construction_cost_total":85000,
 "utility_connections_total":4200,
 "completion_and_permit_cost":6750,
 "capital_idle_cost":12300,
 "contract_management_fee":7650,
 "land_value":54000,
 "penalty_cost":1250,
 "residential_sales_revenue":96500,
 "office_sales_revenue":18400,
 "owner_builder_profit":{"profit":24850,"profitPercent":18.5},
 "contract_management_profit":{"profit":9750,"profitPercent":12},
 "partnership_profit":{"owner":{"contribution":54000,"profitPercent":45,"profit":11200},"contractor":{"contribution":41300,"profitPercent":55,"profit":13650}},
 "area_by_party":{"owner":{"residential":980,"office":210,"commercial":160},"contractor":{"residential":870,"office":200,"commercial":160}},
 "unit_division":{"byAgreement":{"ownerFloorsArea":1190,"contractorFloorsArea":1230},"byFloorQuality":{"ownerShare":8,"contractorShare":6}},
 "inflation_adjusted_spending":98400,
 "inflation_adjusted_revenue":121300,
 "instant_profit_no_inflation":22600,
 "inflation_cost_price":{"builderExpected":86900,"generalIndex":91250,"productionInputsIndex":94700},
 "total_fines":2450,
 "property_renewal_education_costs":3180,
 "final_profit_percent":17.5
};

  return {
    isDemo: true,
    // payload is unused while the values are DEMO
    getEstimateResults(payload) {
      return Promise.resolve(JSON.parse(JSON.stringify(DEMO_RESULTS)));
    },
  };
})();

