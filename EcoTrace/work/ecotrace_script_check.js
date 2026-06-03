
// ─── STATE ──────────────────────────────────────────────────────────────────
let currentStep = 1;
let selectedDiet = 'vegan';
let userData = {};
let calcResult = {};
let donutChartInst, barChartInst;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_KEY_STORAGE = 'ecotrace_gemini_api_key';

// ─── EMISSION FACTORS ────────────────────────────────────────────────────────
const VEHICLE_EF = { car_petrol:0.21, car_diesel:0.17, car_ev:0.053, motorbike:0.11, bus:0.089, train:0.041, cycle:0 };
const DIET_EF    = { vegan:55, vegetarian:90, flexitarian:145, meat_heavy:230 }; // kg CO2/month
const ENERGY_EF  = { grid_india:0.82, grid_global:0.49, solar:0.05, mixed:0.25 }; // kg per kWh
const COOKING_EF = { lpg:0.21, natural_gas:0.2, electric:0.15, induction:0.05 }; // per meal
const AC_EF      = { none:0, low:15, medium:35, high:65 };
const FOOD_WASTE = { low:1.0, medium:1.15, high:1.3 };
const CLOTHING_EF = { minimal:10, average:28, frequent:65, heavy:120 };
const ELEC_EF    = { none:0, low:8, medium:25, high:60 };
const SHOPPING_EF_PER = 0.5; // kg CO2 per order

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function startForm() { currentStep=1; updateStep(); showPage('formPage'); }
function resetApp() { currentStep=1; updateStep(); showPage('formPage'); }

// ─── STEP LOGIC ──────────────────────────────────────────────────────────────
const STEP_META = [
  { title:'Transport & Mobility', sub:'How do you get around each week?' },
  { title:'Food & Diet', sub:'What does your plate look like?' },
  { title:'Home & Energy', sub:'Power consumption at home' },
  { title:'Shopping & Lifestyle', sub:'Consumption habits and household' },
];

function updateStep() {
  document.querySelectorAll('.step-body').forEach((s,i) => s.style.display = (i+1===currentStep)?'block':'none');
  document.getElementById('stepTitle').textContent = STEP_META[currentStep-1].title;
  document.getElementById('stepSub').textContent   = STEP_META[currentStep-1].sub;
  document.getElementById('stepCount').textContent = `Step ${currentStep} of 4`;
  document.getElementById('prevBtn').style.display = currentStep>1?'':'none';
  document.getElementById('nextBtn').textContent   = currentStep===4 ? 'Analyze →' : 'Next →';
  for(let i=1;i<=4;i++){
    const d=document.getElementById('sd'+i);
    d.className='step-dot'+(i<currentStep?' done':i===currentStep?' active':'');
  }
}

function nextStep() {
  if(currentStep<4){ currentStep++; updateStep(); }
  else { collectData(); runAnalysis(); }
}
function prevStep() {
  if(currentStep>1){ currentStep--; updateStep(); }
}
function selectDiet(el, diet) {
  document.querySelectorAll('.diet-option').forEach(d=>d.classList.remove('selected'));
  el.classList.add('selected'); selectedDiet=diet;
}

// ─── COLLECT DATA ─────────────────────────────────────────────────────────────
function collectData() {
  userData = {
    km: parseFloat(document.getElementById('kmInput').value)||0,
    vehicle: document.getElementById('vehicleType').value,
    flights: parseFloat(document.getElementById('flightsPerYear').value)||0,
    wfhDays: parseFloat(document.getElementById('wfh').value)||0,
    diet: selectedDiet,
    meals: parseFloat(document.getElementById('mealsInput').value)||0,
    foodWaste: document.getElementById('foodWaste').value,
    kwh: parseFloat(document.getElementById('kwhInput').value)||0,
    energySource: document.getElementById('energySource').value,
    cookingFuel: document.getElementById('cookingFuel').value,
    acUsage: document.getElementById('acUsage').value,
    shopping: parseFloat(document.getElementById('shoppingInput').value)||0,
    clothing: document.getElementById('clothing').value,
    electronics: document.getElementById('electronics').value,
    household: parseFloat(document.getElementById('household').value)||1,
    name: document.getElementById('userName').value.trim() || 'You',
  };
}

// ─── CARBON CALCULATION ───────────────────────────────────────────────────────
function calculate(ud) {
  const weeksInMonth = 4.33;
  const transport = ud.km * weeksInMonth * (VEHICLE_EF[ud.vehicle]||0.21)
    + (ud.flights * 180 / 12)        // avg flight = 180 kg CO2
    + (ud.wfhDays * 2 * weeksInMonth * 0.089); // commute saved days still counted partially
  const food = DIET_EF[ud.diet] * FOOD_WASTE[ud.foodWaste]
    + ud.meals * 0.8; // 0.8 kg per restaurant meal avg
  const energy = ud.kwh * ENERGY_EF[ud.energySource]
    + (ud.kwh * COOKING_EF[ud.cookingFuel] * 0.3)
    + AC_EF[ud.acUsage];
  const shopping = ud.shopping * SHOPPING_EF_PER
    + CLOTHING_EF[ud.clothing] / 12
    + ELEC_EF[ud.electronics] / 12;
  const total = (transport + food + energy + shopping) / ud.household;
  return { transport:Math.round(transport), food:Math.round(food), energy:Math.round(energy), shopping:Math.round(shopping), total:Math.round(total) };
}

// ─── RUN ANALYSIS ─────────────────────────────────────────────────────────────
async function runAnalysis() {
  showPage('loadingPage');
  calcResult = calculate(userData);
  await animateLoaderSteps();
  renderDashboard();
  showPage('dashboardPage');
  saveHistory(calcResult.total);
  renderHistory();
  fetchAIInsights();
}

async function animateLoaderSteps() {
  const steps = ['ls1','ls2','ls3','ls4','ls5'];
  for(let i=0;i<steps.length;i++){
    await sleep(600);
    document.getElementById(steps[i]).className='done';
    if(i+1<steps.length) document.getElementById(steps[i+1]).className='active';
  }
  await sleep(400);
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

// ─── RENDER DASHBOARD ─────────────────────────────────────────────────────────
function renderDashboard() {
  const { transport, food, energy, shopping, total } = calcResult;
  const INDIA_AVG = 1400, GLOBAL_AVG = 4700;

  // Greeting
  document.getElementById('dashGreeting').textContent = `${userData.name}'s Carbon Dashboard`;
  document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('recalcBtn').style.display='inline-block';

  // Meter
  const maxScore = 8000;
  const pct = Math.min(total/maxScore, 1);
  const circumference = 2*Math.PI*66;
  const fill = document.getElementById('meterFill');
  fill.style.strokeDashoffset = circumference;
  const meterColor = total < 1000 ? '#4ec44e' : total < 2500 ? '#f5a623' : '#e85555';
  fill.style.stroke = meterColor;
  setTimeout(()=>{ fill.style.strokeDashoffset = circumference*(1-pct); }, 100);

  // Animate score number
  let cur=0;
  const step=Math.ceil(total/60);
  const scoreEl=document.getElementById('scoreNum');
  scoreEl.style.color=meterColor;
  const iv=setInterval(()=>{ cur=Math.min(cur+step,total); scoreEl.textContent=cur.toLocaleString(); if(cur>=total)clearInterval(iv); },16);

  // Headline & badges
  let headline, badge;
  if(total<700){ headline='Excellent! You\'re a climate champion.'; badge='badge-green'; }
  else if(total<1400){ headline='Below India average — good work!'; badge='badge-green'; }
  else if(total<2500){ headline='Near India average. Room to improve.'; badge='badge-amber'; }
  else if(total<4700){ headline='Above average. Time to take action.'; badge='badge-amber'; }
  else{ headline='High footprint — significant action needed.'; badge='badge-red'; }
  document.getElementById('scoreHeadline').textContent=headline;
  document.getElementById('scoreBadges').innerHTML=`
    <span class="badge ${badge}">${total.toLocaleString()} kg CO₂/mo</span>
    <span class="badge badge-green">India avg: 1,400</span>
    <span class="badge badge-amber">Global avg: 4,700</span>`;

  // Metric cards
  const metrics=[
    {label:'Transport',val:transport,icon:'🚗',color:'#4ec44e',pct:Math.round(transport/total*100)},
    {label:'Food & Diet',val:food,icon:'🍽',color:'#f5a623',pct:Math.round(food/total*100)},
    {label:'Energy',val:energy,icon:'⚡',color:'#5bc4f0',pct:Math.round(energy/total*100)},
    {label:'Shopping',val:shopping,icon:'🛍',color:'#b47cf0',pct:Math.round(shopping/total*100)},
  ];
  // Only show 3 on metrics row (top 3 by value)
  const top3=[...metrics].sort((a,b)=>b.val-a.val).slice(0,3);
  document.getElementById('metricsRow').innerHTML=top3.map(m=>`
    <div class="metric-card">
      <div class="metric-icon" style="background:${m.color}20;">${m.icon}</div>
      <div class="metric-val" style="color:${m.color}">${m.val.toLocaleString()}</div>
      <div class="metric-lbl">kg CO₂/mo — ${m.label}</div>
      <div class="metric-pct" style="color:${m.color}">${m.pct}% of total</div>
    </div>`).join('');

  // Donut chart
  const labels=['Transport','Food','Energy','Shopping'];
  const values=[transport,food,energy,shopping];
  const colors=['#4ec44e','#f5a623','#5bc4f0','#b47cf0'];
  document.getElementById('donutLegend').innerHTML=labels.map((l,i)=>`
    <span style="display:flex;align-items:center;gap:5px;color:var(--text2);">
      <span style="width:9px;height:9px;border-radius:2px;background:${colors[i]};display:inline-block;"></span>${l} ${Math.round(values[i]/total*100)}%
    </span>`).join('');
  if(donutChartInst) donutChartInst.destroy();
  donutChartInst=new Chart(document.getElementById('donutChart'),{
    type:'doughnut',
    data:{ labels, datasets:[{ data:values, backgroundColor:colors, borderColor:'#111a11', borderWidth:3, hoverOffset:8 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{ legend:{display:false} } }
  });

  // Bar chart
  if(barChartInst) barChartInst.destroy();
  barChartInst=new Chart(document.getElementById('barChart'),{
    type:'bar',
    data:{
      labels:['You','India Avg','Global Avg'],
      datasets:[{ label:'kg CO₂/month', data:[total,INDIA_AVG,GLOBAL_AVG],
        backgroundColor:[meterColor+'bb','#f5a623bb','#e85555bb'],
        borderColor:[meterColor,'#f5a623','#e85555'], borderWidth:2, borderRadius:8 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#9ab89a'} },
        y:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#9ab89a'} }
      }
    }
  });

  // Achievements
  const achv=[
    { icon:'🌱', name:'Plant-Based', desc:'Low food footprint', locked: food>100 },
    { icon:'🚴', name:'Green Commuter', desc:'Low transport CO₂', locked: transport>200 },
    { icon:'💡', name:'Energy Saver', desc:'Low home energy', locked: energy>150 },
    { icon:'🌍', name:'Below Average', desc:'Under India avg', locked: total>1400 },
    { icon:'🏆', name:'Climate Hero', desc:'Under 700 kg/mo', locked: total>700 },
  ];
  document.getElementById('achievementsRow').innerHTML=achv.map(a=>`
    <div class="achieve${a.locked?' locked':''}">
      <div class="achieve-icon">${a.icon}</div>
      <div><div class="achieve-name">${a.name}</div><div class="achieve-desc">${a.locked?'Locked':'Unlocked!'}</div></div>
    </div>`).join('');

  showToast(total<1400?'Great score! Below India average 🌱':'Analysis complete. See your AI insights below.');
}

// ─── AI INSIGHTS ──────────────────────────────────────────────────────────────
async function fetchAIInsights() {
  const apiKey = localStorage.getItem(GEMINI_API_KEY_STORAGE);
  if(!apiKey) {
    showToast('Add your Gemini API key in AI Settings for live insights.');
    renderInsightsFallback();
    return;
  }

  const { transport, food, energy, shopping, total } = calcResult;
  const highest = [
    {name:'Transport',val:transport},{name:'Food',val:food},
    {name:'Energy',val:energy},{name:'Shopping',val:shopping}
  ].sort((a,b)=>b.val-a.val)[0].name;

  const prompt = `You are EcoTrace, an expert carbon footprint AI analyst. A user has completed their carbon footprint assessment.

USER PROFILE:
- Name: ${userData.name}
- Vehicle: ${userData.vehicle}, ${userData.km} km/week
- Diet: ${userData.diet}
- Electricity: ${userData.kwh} kWh/month (${userData.energySource})
- Shopping orders/month: ${userData.shopping}

CARBON RESULTS:
- Transport: ${transport} kg CO2/month
- Food: ${food} kg CO2/month
- Energy: ${energy} kg CO2/month
- Shopping: ${shopping} kg CO2/month
- TOTAL: ${total} kg CO2/month
- Highest source: ${highest}
- India average: 1,400 kg/month | Global average: 4,700 kg/month

Respond ONLY with valid JSON (no markdown, no preamble) with exactly these 5 keys:
{
  "explanation": "2-3 sentence explanation of their carbon score and what it means",
  "highest_source": "2-3 sentences identifying their biggest emission source and why it matters",
  "reduction_plan": "A concrete 30-day plan with 4-5 specific actionable steps they can start this week",
  "comparison": "2-3 sentences comparing their score to India and global averages with context",
  "motivation": "An inspiring 2-sentence personalized motivational message addressing ${userData.name} by name"
}`;

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json'
        }
      })
    });

    if(!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Gemini request failed: ${resp.status} ${errorText}`);
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
    const clean = text.replace(/```json|```/g,'').trim();
    const insights = JSON.parse(clean);
    renderInsights(insights);
    showToast('Live Gemini insights generated.');
  } catch(e) {
    console.error(e);
    showToast('Gemini request failed. Showing local fallback insights.');
    renderInsightsFallback();
  }
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function renderInsights(ins) {
  const cards = [
    { icon:'📊', label:'Score Explanation', text: ins.explanation },
    { icon:'🔥', label:'Highest Emission Source', text: ins.highest_source },
    { icon:'📅', label:'30-Day Reduction Plan', text: ins.reduction_plan },
    { icon:'🌐', label:'Global Comparison', text: ins.comparison },
    { icon:'💪', label:'Motivation', text: ins.motivation },
  ];
  document.getElementById('insightsGrid').innerHTML = cards.map(c=>`
    <div class="insight-card">
      <div class="insight-icon">${c.icon}</div>
      <div class="insight-label">${c.label}</div>
      <div class="insight-text">${escapeHTML(c.text)}</div>
    </div>`).join('');
}

function renderInsightsFallback() {
  const { transport, food, energy, shopping, total } = calcResult;
  const highest = [
    {name:'Transport',val:transport},{name:'Food',val:food},
    {name:'Energy',val:energy},{name:'Shopping',val:shopping}
  ].sort((a,b)=>b.val-a.val)[0];
  const pct = Math.round(highest.val/total*100);
  renderInsights({
    explanation: `Your monthly carbon footprint of ${total.toLocaleString()} kg CO₂ reflects your current lifestyle choices. ${total<1400?'You\'re doing better than the India average of 1,400 kg/month — great work!':'You\'re above the India average of 1,400 kg/month, but there\'s plenty of opportunity to reduce.'} Every kilogram saved contributes to a healthier planet.`,
    highest_source: `Your biggest emission category is ${highest.name} at ${highest.val.toLocaleString()} kg CO₂/month (${pct}% of your total). Targeting this single area could significantly reduce your overall footprint. Small changes in this category can have outsized impact.`,
    reduction_plan: `Week 1: Audit your ${highest.name.toLowerCase()} habits and identify 3 easy swaps. Week 2: Try reducing by 20% — e.g., fewer car trips or one more plant-based day. Week 3: Track your progress and adjust your approach. Week 4: Lock in the savings and build a new habit. Month-end goal: aim for a 15% reduction in your top emission source.`,
    comparison: `At ${total.toLocaleString()} kg CO₂/month, you're ${total<1400?'below':'above'} India's average of 1,400 kg/month and ${total<4700?'well below':'approaching'} the global average of 4,700 kg/month. ${total<1400?'You\'re in the top tier globally.':'Reaching the India average would save '+(total-1400).toLocaleString()+' kg CO₂ per month.'}`,
    motivation: `${userData.name}, every step you take toward a lower carbon lifestyle makes a real difference. You have the power to inspire others around you — start today and watch your impact grow!`,
  });
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
function saveHistory(score) {
  const h = JSON.parse(localStorage.getItem('ecotrace_history')||'[]');
  h.unshift({ date: new Date().toISOString(), score, name: userData.name });
  localStorage.setItem('ecotrace_history', JSON.stringify(h.slice(0,20)));
}

function renderHistory() {
  const h = JSON.parse(localStorage.getItem('ecotrace_history')||'[]');
  const el = document.getElementById('historyList');
  if(!h.length){ el.innerHTML='<div class="history-empty">No past records yet.</div>'; return; }
  const max = Math.max(...h.map(x=>x.score));
  el.innerHTML = h.map(x=>{
    const pct = Math.round(x.score/max*100);
    const col = x.score<1400?'var(--green)':x.score<4700?'var(--amber)':'var(--red)';
    return `<div class="history-item">
      <div>
        <div class="history-date">${new Date(x.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
        <div style="font-size:12px;color:var(--text3);">${x.name}</div>
      </div>
      <div class="history-bar-wrap"><div class="history-bar" style="width:${pct}%;background:${col}"></div></div>
      <div class="history-score" style="color:${col}">${x.score.toLocaleString()}<span style="font-size:12px;color:var(--text3);font-family:'DM Sans';font-weight:400"> kg</span></div>
    </div>`;
  }).join('');
}

function openGeminiSettings() {
  const input = document.getElementById('geminiApiKeyInput');
  input.value = localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
  document.getElementById('geminiOverlay').classList.add('open');
  setTimeout(()=>input.focus(), 50);
}
function closeGeminiSettings(e) { if(e.target===document.getElementById('geminiOverlay')) closeGeminiSettingsModal(); }
function closeGeminiSettingsModal() { document.getElementById('geminiOverlay').classList.remove('open'); }
function saveGeminiSettings() {
  const key = document.getElementById('geminiApiKeyInput').value.trim();
  if(!key) { showToast('Paste a Gemini API key first.'); return; }
  localStorage.setItem(GEMINI_API_KEY_STORAGE, key);
  closeGeminiSettingsModal();
  showToast('Gemini API key saved locally.');
  if(calcResult && calcResult.total != null) fetchAIInsights();
}
function clearGeminiSettings() {
  localStorage.removeItem(GEMINI_API_KEY_STORAGE);
  document.getElementById('geminiApiKeyInput').value = '';
  showToast('Gemini API key cleared.');
}
function showHistory() {
  const h = JSON.parse(localStorage.getItem('ecotrace_history')||'[]');
  const el = document.getElementById('overlayHistoryList');
  if(!h.length){ el.innerHTML='<p style="color:var(--text3);font-size:14px;">No records yet. Complete your first analysis!</p>'; }
  else {
    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">'+h.map(x=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border-radius:8px;">
        <div style="font-size:13px;color:var(--text2);">${new Date(x.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} · ${x.name}</div>
        <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:${x.score<1400?'var(--green)':x.score<4700?'var(--amber)':'var(--red)'};">${x.score.toLocaleString()} kg</div>
      </div>`).join('')+'</div>';
  }
  document.getElementById('historyOverlay').classList.add('open');
}
function closeHistory(e) { if(e.target===document.getElementById('historyOverlay')) closeHistoryModal(); }
function closeHistoryModal() { document.getElementById('historyOverlay').classList.remove('open'); }

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportReport() {
  const { transport, food, energy, shopping, total } = calcResult;
  const content = `EcoTrace Carbon Report
====================
Name: ${userData.name}
Date: ${new Date().toLocaleDateString()}

RESULTS
-------
Transport : ${transport.toLocaleString()} kg CO2/month
Food      : ${food.toLocaleString()} kg CO2/month
Energy    : ${energy.toLocaleString()} kg CO2/month
Shopping  : ${shopping.toLocaleString()} kg CO2/month
TOTAL     : ${total.toLocaleString()} kg CO2/month

India Average : 1,400 kg/month
Global Average: 4,700 kg/month

Generated by EcoTrace – AI Carbon Footprint Analyzer`;
  const blob = new Blob([content],{type:'text/plain'});
  const a = document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`EcoTrace_Report_${userData.name}_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  showToast('Report downloaded!');
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3200);
}
