const GSC_SITE = "sc-domain:testbook.com"; // ← change to your exact GSC property

// ─── Helpers ─────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function show(...ids) { ids.forEach(id => $(id).classList.remove("hidden")); }
function hide(...ids) { ids.forEach(id => $(id).classList.add("hidden")); }

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function dateRange(daysBack) {
  const end = new Date();
  end.setDate(end.getDate() - 1); // GSC lags by 1 day
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

// ─── Extract exam slug from URL ───────────────────────────────────────────────

const ANTHROPIC_API_KEY = "sk-ant-YOUR_KEY_HERE"; // ← paste your Anthropic API key

async function getPageContent(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTENT" }, (res) => {
      resolve(res || {});
    });
  });
}

async function getExamIntelligence(pageData, url) {
  const prompt = `
You are an expert on Indian competitive exams. Analyze this webpage and return ONLY a JSON object, no markdown, no explanation.

URL: ${url}
Page Title: ${pageData.title}
H1: ${pageData.h1}
Meta Description: ${pageData.metaDesc}
Breadcrumb: ${pageData.breadcrumb}
Page Content Snippet: ${pageData.bodySnippet}

Return this exact JSON:
{
  "examName": "Full official exam name, e.g. SSC CGL 2025",
  "isExamPage": true or false,
  "tam": "Monthly search volume estimate like 2.4M or 800K or 120K",
  "tamNote": "one short phrase like 'High demand, Tier 1 exam' or 'State-level, moderate demand'",
  "upcomingEvent": "Next important date or event, e.g. 'Notification expected June 2025' or 'Admit Card releasing April 2025'",
  "insight": "One sharp SEO insight for this page in under 15 words"
}

Use your knowledge of Indian exam calendars and search trends for TAM and events. If not an exam page, set isExamPage to false and use null for other fields.
`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) throw new Error("Claude API error: " + res.status);
  const data = await res.json();
  const text = data.content[0].text.trim();
  return JSON.parse(text);
}

async function renderExam(url, tabId) {
  $("exam-name").textContent = "Analyzing page…";
  $("exam-tam").textContent = "…";
  $("exam-event").textContent = "…";

  try {
    const pageData = await getPageContent(tabId);
    const intel = await getExamIntelligence(pageData, url);

    if (!intel.isExamPage) {
      $("exam-name").textContent = "Not an exam page";
      $("exam-tam").textContent = "—";
      $("exam-tam-hint").textContent = "";
      $("exam-event").textContent = "—";
      return;
    }

    $("exam-name").textContent = intel.examName || "—";
    $("exam-tam").textContent = intel.tam || "—";
    $("exam-tam-hint").textContent = intel.tamNote || "";
    $("exam-event").textContent = intel.upcomingEvent || "—";

    // Show insight if present
    if (intel.insight) {
      const insightEl = document.createElement("div");
      insightEl.className = "exam-card";
      insightEl.innerHTML = `
        <div class="exam-label">SEO Insight</div>
        <div class="exam-value" style="font-size:12px;color:#1a73e8;">${intel.insight}</div>
      `;
      document.querySelector(".exam-section").appendChild(insightEl);
    }

  } catch (e) {
    $("exam-name").textContent = "Error: " + e.message;
  }
}

// ─── TAM lookup (hardcoded seed + AI fallback label) ─────────────────────────

const TAM_DATA = {
  "ssc-cgl": { volume: "2.4M", note: "Actual (internal)" },
  "upsc-ias": { volume: "1.8M", note: "Actual (internal)" },
  "ibps-po": { volume: "900K", note: "Actual (internal)" },
  "rrb-ntpc": { volume: "1.1M", note: "Actual (internal)" },
  "neet-ug": { volume: "3.2M", note: "Actual (internal)" },
  "jee-main": { volume: "2.1M", note: "Actual (internal)" },
  "cat": { volume: "400K", note: "Actual (internal)" },
};

function getTAM(slug) {
  const key = slug.toLowerCase();
  if (TAM_DATA[key]) return TAM_DATA[key];
  // Estimated based on slug category
  if (key.includes("upsc") || key.includes("ias")) return { volume: "~1.2M", note: "Estimated" };
  if (key.includes("ssc")) return { volume: "~800K", note: "Estimated" };
  if (key.includes("ibps") || key.includes("bank")) return { volume: "~600K", note: "Estimated" };
  if (key.includes("rrb") || key.includes("railway")) return { volume: "~700K", note: "Estimated" };
  if (key.includes("neet") || key.includes("jee")) return { volume: "~900K", note: "Estimated" };
  if (key.includes("state") || key.includes("psc")) return { volume: "~200K", note: "Estimated" };
  return { volume: "—", note: "Add to TAM_DATA in popup.js" };
}

// ─── Upcoming events lookup ───────────────────────────────────────────────────

const EXAM_EVENTS = {
  "ssc-cgl": "SSC CGL Tier 2 — June 2025",
  "upsc-ias": "UPSC Prelims — May 25, 2025",
  "ibps-po": "IBPS PO Notification — July 2025",
  "rrb-ntpc": "RRB NTPC CBT 2 — Expected Q3 2025",
  "neet-ug": "NEET UG — May 4, 2025",
  "jee-main": "JEE Main Session 2 — April 2025",
  "cat": "CAT 2025 — November 2025",
};

function getEvent(slug) {
  const key = slug.toLowerCase();
  for (const [k, v] of Object.entries(EXAM_EVENTS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return "No upcoming event found — add to EXAM_EVENTS in popup.js";
}

// ─── GSC API ──────────────────────────────────────────────────────────────────

async function getToken() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_AUTH_TOKEN" }, (res) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res.token);
    });
  });
}

async function gscQuery(token, pageUrl, days) {
  const { startDate, endDate } = dateRange(days);
  const body = {
    startDate,
    endDate,
    dimensions: ["query"],
    dimensionFilterGroups: [{
      filters: [{
        dimension: "page",
        operator: "equals",
        expression: pageUrl,
      }]
    }],
    rowLimit: 50,
    startRow: 0,
  };

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "GSC API error");
  }
  return res.json();
}

// ─── Render ───────────────────────────────────────────────────────────────────

let currentData = {};
let currentPeriod = 3;

function renderMetrics(data) {
  const rows = data.rows || [];
  const totals = rows.reduce((acc, r) => {
    acc.clicks += r.clicks;
    acc.impressions += r.impressions;
    acc.ctrSum += r.ctr;
    acc.posSum += r.position;
    acc.count++;
    return acc;
  }, { clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, count: 0 });

  $("metric-clicks").textContent = fmtNum(totals.clicks);
  $("metric-impressions").textContent = fmtNum(totals.impressions);
  $("metric-ctr").textContent = totals.count
    ? (totals.ctrSum / totals.count * 100).toFixed(1) + "%"
    : "—";
  $("metric-position").textContent = totals.count
    ? (totals.posSum / totals.count).toFixed(1)
    : "—";

  return totals;
}

function renderQueries(data, totals) {
  const rows = (data.rows || []).slice().sort((a, b) => b.clicks - a.clicks);
  const avgCtr = totals.count ? totals.ctrSum / totals.count : 0;

  // Top queries (top 8 by clicks)
  const topList = $("top-queries-list");
  topList.innerHTML = "";
  rows.slice(0, 8).forEach(r => {
    topList.innerHTML += `
      <div class="query-row">
        <div class="query-text">${r.keys[0]}</div>
        <div class="query-stats">
          <span class="badge badge-blue">${fmtNum(r.clicks)} clicks</span>
          <span class="badge badge-gray">${fmtNum(r.impressions)} imp</span>
        </div>
      </div>`;
  });
  if (!rows.length) topList.innerHTML = `<p class="muted">No data for this URL.</p>`;

  // Underperforming: impressions > 50 AND ctr < avgCtr
  const under = rows.filter(r => r.impressions > 50 && r.ctr < avgCtr)
                     .sort((a, b) => b.impressions - a.impressions)
                     .slice(0, 8);

  const underList = $("underperforming-list");
  underList.innerHTML = "";
  under.forEach(r => {
    const ctrPct = (r.ctr * 100).toFixed(1);
    const posFmt = r.position.toFixed(0);
    underList.innerHTML += `
      <div class="query-row">
        <div class="query-text">${r.keys[0]}</div>
        <div class="query-stats">
          <span class="badge badge-amber">${fmtNum(r.impressions)} imp</span>
          <span class="badge badge-red">CTR ${ctrPct}%</span>
          <span class="badge badge-gray">Pos ${posFmt}</span>
        </div>
      </div>`;
  });
  if (!under.length) underList.innerHTML = `<p class="muted">No underperforming queries. 🎉</p>`;
}

function renderExam(url) {
  const exam = detectExam(url);
  if (!exam) {
    $("exam-name").textContent = "Not a recognised exam page";
    $("exam-tam").textContent = "—";
    $("exam-event").textContent = "—";
    return;
  }

  $("exam-name").textContent = exam.name;

  const tam = getTAM(exam.slug);
  $("exam-tam").textContent = tam.volume;
  $("exam-tam-hint").textContent = tam.note;

  $("exam-event").textContent = getEvent(exam.slug);
}

// ─── Load data for a given period ────────────────────────────────────────────

async function loadData(token, pageUrl, period) {
  if (currentData[period]) {
    // Use cache
    const totals = renderMetrics(currentData[period]);
    renderQueries(currentData[period], totals);
    return;
  }
  const data = await gscQuery(token, pageUrl, period);
  currentData[period] = data;
  const totals = renderMetrics(data);
  renderQueries(data, totals);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  let token = null;
  let pageUrl = null;

  // Check if token already cached
  const stored = await chrome.storage.local.get("gsc_token");
  if (stored.gsc_token) token = stored.gsc_token;

  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageUrl = tab.url;
  $("url-strip").textContent = pageUrl.length > 60
    ? pageUrl.substring(0, 60) + "…"
    : pageUrl;

  function showAuth() {
    hide("loading-screen", "dashboard", "error-screen");
    show("auth-screen");
  }

 async function loadAll() {
    hide("auth-screen", "error-screen");
    show("loading-screen");
    try {
      currentData = {};
      await loadData(token, pageUrl, currentPeriod);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });  // ← NEW
      await renderExam(pageUrl, tab.id);                                              // ← CHANGED
      hide("loading-screen");
      show("dashboard");
    } catch (e) {
      hide("loading-screen");
      $("error-msg").textContent = e.message;
      show("error-screen");
    }
  }

  // Login button
  $("login-btn").addEventListener("click", async () => {
    try {
      token = await getToken();
      await chrome.storage.local.set({ gsc_token: token });
      await loadAll();
    } catch (e) {
      alert("Auth failed: " + e.message);
    }
  });

  // Retry button
  $("retry-btn").addEventListener("click", () => loadAll());

  // Period tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentPeriod = Number(btn.dataset.period);
      show("loading-screen");
      hide("dashboard");
      await loadData(token, pageUrl, currentPeriod);
      hide("loading-screen");
      show("dashboard");
    });
  });

  // Logout
  $("logout-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "REVOKE_TOKEN" });
    chrome.storage.local.remove("gsc_token");
    token = null;
    hide("dashboard");
    showAuth();
  });

  if (token) {
    await loadAll();
  } else {
    showAuth();
  }
});
