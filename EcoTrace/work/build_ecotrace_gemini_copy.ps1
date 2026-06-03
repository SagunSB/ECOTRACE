$source = 'C:\SAGUN\PROJECTS\PROJECTS\EcoTrace\ecotrace.html'
$outDir = 'C:\Users\sagun\Documents\Codex\2026-06-03\files-mentioned-by-the-user-ecotrace\outputs'
$out = Join-Path $outDir 'ecotrace.html'
$html = [System.IO.File]::ReadAllText($source, [System.Text.Encoding]::UTF8)

$historyButton = @'
<button class="btn" onclick="showHistory()">History</button>
'@
$historyAndSettingsButtons = @'
<button class="btn" onclick="showHistory()">History</button>
        <button class="btn" onclick="openGeminiSettings()">AI Settings</button>
'@
$html = $html.Replace($historyButton, $historyAndSettingsButtons)
$html = $html.Replace('Claude AI is crunching the numbers', 'Gemini is generating live insights')
$html = $html.Replace('<div class="ai-badge">Claude AI</div>', '<div class="ai-badge">Gemini Live</div>')

$modalActionsCss = @'
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
'@
$extraCss = @'
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
  .api-note { padding: 12px 14px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; color: var(--text3); font-size: 12px; line-height: 1.6; margin-bottom: 16px; }
  .modal .field { margin-bottom: 16px; }
  .modal .field input { width: 100%; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 11px 14px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 14px; outline: none; }
  .modal .field input:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(78,196,78,0.12); }
'@
$html = $html.Replace($modalActionsCss, $extraCss)

$settingsOverlay = @'
<!-- GEMINI SETTINGS OVERLAY -->
<div class="overlay" id="geminiOverlay" onclick="closeGeminiSettings(event)">
  <div class="modal">
    <h3>Gemini API Settings</h3>
    <p>Add your Gemini API key to generate live personalized insights after each analysis.</p>
    <div class="api-note">For a classroom or demo project, the key can be stored in this browser. For a public website, use a backend endpoint so your API key is not exposed.</div>
    <div class="field">
      <label for="geminiApiKeyInput">Gemini API Key</label>
      <input type="password" id="geminiApiKeyInput" autocomplete="off" placeholder="Paste your Gemini API key">
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="clearGeminiSettings()">Clear</button>
      <button class="btn" onclick="closeGeminiSettingsModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveGeminiSettings()">Save</button>
    </div>
  </div>
</div>

'@
$html = $html.Replace('<!-- HISTORY OVERLAY -->', $settingsOverlay + '<!-- HISTORY OVERLAY -->')

$html = $html.Replace(
  'let donutChartInst, barChartInst;',
  "let donutChartInst, barChartInst;`r`nconst GEMINI_MODEL = 'gemini-2.5-flash';`r`nconst GEMINI_API_KEY_STORAGE = 'ecotrace_gemini_api_key';"
)

$newFetch = @'
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

'@
$start = $html.IndexOf('async function fetchAIInsights()')
$end = $html.IndexOf('function renderInsights(ins)', $start)
if($start -lt 0 -or $end -lt 0) { throw 'Could not find fetchAIInsights block.' }
$html = $html.Substring(0, $start) + $newFetch + $html.Substring($end)

$renderStart = @'
function renderInsights(ins) {
'@
$renderStartSafe = @'
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function renderInsights(ins) {
'@
$html = $html.Replace($renderStart, $renderStartSafe)
$html = $html.Replace('<div class="insight-text">${c.text}</div>', '<div class="insight-text">${escapeHTML(c.text)}</div>')

$settingsFunctions = @'
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

'@
$html = $html.Replace('function showHistory() {', $settingsFunctions + 'function showHistory() {')

[System.IO.Directory]::CreateDirectory($outDir) | Out-Null
[System.IO.File]::WriteAllText($out, $html, [System.Text.Encoding]::UTF8)
Write-Output $out
