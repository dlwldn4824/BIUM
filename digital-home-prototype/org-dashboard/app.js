/**
 * BIUM Org KPI dashboard (hackathon web prototype).
 * Formulas aligned with mini/app impact estimates.
 */

const KRW_PER_GB_YEAR = 36000 / 8.7;
const KG_PER_GB_YEAR = 0.04;

const $ = (id) => document.getElementById(id);

function fmtGb(n) {
  const v = Number(n) || 0;
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} GB`;
}

function fmtKrw(n) {
  return `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
}

function fmtCarbon(gb) {
  const kg = Math.max(0, Number(gb) || 0) * KG_PER_GB_YEAR;
  if (kg >= 1) return `${kg.toFixed(1)} kgCO₂e`;
  return `${Math.round(kg * 1000)} gCO₂e`;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

function savingFromGb(gb) {
  return Math.round((Number(gb) || 0) * KRW_PER_GB_YEAR);
}

function setMeter(el, value) {
  if (!el) return;
  el.style.setProperty("--p", `${Math.max(0, Math.min(100, value))}%`);
}

function renderHero(data) {
  const s = data.summary;
  const t = data.kpiTargets;
  const reclaimed = Number(s.reclaimedGb) || 0;
  const money = savingFromGb(reclaimed);
  const adoption = pct(s.activeUsers, s.seats);
  const reclaimPct = pct(reclaimed, t.monthlyReclaimedGb);

  $("kpiReclaimed").textContent = fmtGb(reclaimed);
  $("kpiReclaimedSub").textContent = `목표 ${fmtGb(t.monthlyReclaimedGb)} · 달성 ${reclaimPct}%`;
  setMeter($("meterReclaimed"), reclaimPct);

  $("kpiMoney").textContent = fmtKrw(money);
  $("kpiMoneySub").textContent = `잔여 후보 ${fmtGb(s.cleanableRemainingGb)} · ${fmtKrw(
    savingFromGb(s.cleanableRemainingGb)
  )} 여지`;

  $("kpiCarbon").textContent = `${fmtCarbon(reclaimed)}/년`;
  $("kpiUsers").textContent = `${s.activeUsers} / ${s.seats}`;
  $("kpiUsersSub").textContent = `도입률 ${adoption}% · 목표 ${t.adoptionPct}%`;
  setMeter($("meterAdoption"), adoption);

  const updated = data.org?.updatedAt
    ? new Date(data.org.updatedAt).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  $("updatedAt").textContent = `${data.org?.name || "Org"} · 업데이트 ${updated}`;
}

function renderForecast(data) {
  const f = data.forecastNextMonth;
  const midMoney = f.savingKrwMid ?? savingFromGb(f.reclaimedGbMid);
  $("forecastLead").textContent = `약 ${fmtGb(f.reclaimedGbMid)} · ${fmtKrw(midMoney)}/년 환산`;
  $("forecastConfidence").textContent = `신뢰도 ${Math.round((f.confidence || 0) * 100)}%`;

  $("forecastRange").innerHTML = [
    ["낮음", f.reclaimedGbLow, ""],
    ["기준", f.reclaimedGbMid, "is-mid"],
    ["높음", f.reclaimedGbHigh, ""],
  ]
    .map(
      ([label, gb, cls]) => `
      <div class="range-card ${cls}">
        <span>${label}</span>
        <strong>${fmtGb(gb)}</strong>
      </div>`
    )
    .join("");

  $("forecastDrivers").innerHTML = (f.drivers || [])
    .map((d) => `<li>${escapeHtml(d)}</li>`)
    .join("");
}

function renderScores(data) {
  const s = data.summary;
  const t = data.kpiTargets;
  const money = savingFromGb(s.reclaimedGb);
  const cleanupRate = pct(
    s.actionsCompleted,
    Math.max(s.actionsCompleted, s.scansThisMonth * 2)
  );
  const rows = [
    {
      label: "월간 데이터 절감",
      value: `${pct(s.reclaimedGb, t.monthlyReclaimedGb)}%`,
      p: pct(s.reclaimedGb, t.monthlyReclaimedGb),
    },
    {
      label: "비용 절감 KPI",
      value: `${pct(money, t.monthlySavingKrw)}%`,
      p: pct(money, t.monthlySavingKrw),
    },
    {
      label: "도입률",
      value: `${pct(s.activeUsers, s.seats)}%`,
      p: pct(s.activeUsers, s.seats),
    },
    {
      label: "정리 실행률(추정)",
      value: `${Math.min(cleanupRate, t.cleanupRatePct + 20)}%`,
      p: Math.min(cleanupRate, 100),
    },
  ];

  $("scoreList").innerHTML = rows
    .map(
      (r) => `
      <li>
        <div class="score-row">
          <span>${escapeHtml(r.label)}</span>
          <strong>${escapeHtml(r.value)}</strong>
        </div>
        <div class="bar" aria-hidden="true"><i style="--p:${r.p}%"></i></div>
      </li>`
    )
    .join("");
}

function renderDepartments(data) {
  const rows = [...(data.departments || [])].sort(
    (a, b) => b.reclaimedGb - a.reclaimedGb
  );
  $("deptBody").innerHTML = rows
    .map((d) => {
      const p = pct(d.reclaimedGb, d.targetGb);
      return `
        <tr>
          <td>${escapeHtml(d.name)}</td>
          <td>${d.activeUsers}/${d.seats}</td>
          <td>
            <div class="dept-progress">
              <span>${fmtGb(d.reclaimedGb)}</span>
              <div class="bar" aria-hidden="true"><i style="--p:${p}%"></i></div>
            </div>
          </td>
          <td>${fmtGb(d.cleanableGb)}</td>
          <td>${fmtGb(d.targetGb)} · ${p}%</td>
        </tr>`;
    })
    .join("");
}

function drawTrend(weekly) {
  const canvas = $("trendCanvas");
  if (!canvas || !weekly?.length) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = 220;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = { t: 18, r: 16, b: 32, l: 36 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;
  const maxGb = Math.max(...weekly.map((x) => x.reclaimedGb), 1) * 1.15;
  const maxUsers = Math.max(...weekly.map((x) => x.activeUsers), 1) * 1.2;

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);

  // grid
  ctx.strokeStyle = "#e4e9ef";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.t + (h * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
  }

  const xAt = (i) => pad.l + (w * i) / Math.max(1, weekly.length - 1);
  const yGb = (v) => pad.t + h - (h * v) / maxGb;
  const yUser = (v) => pad.t + h - (h * v) / maxUsers;

  // users line
  ctx.strokeStyle = "#3a7ca5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  weekly.forEach((pt, i) => {
    const x = xAt(i);
    const y = yUser(pt.activeUsers);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // gb bars
  const barW = Math.min(28, w / weekly.length - 10);
  weekly.forEach((pt, i) => {
    const x = xAt(i) - barW / 2;
    const y = yGb(pt.reclaimedGb);
    const bh = pad.t + h - y;
    ctx.fillStyle = "rgba(15, 143, 123, 0.85)";
    ctx.fillRect(x, y, barW, bh);
  });

  ctx.fillStyle = "#5b6b7c";
  ctx.font = "11px IBM Plex Sans KR, sans-serif";
  ctx.textAlign = "center";
  weekly.forEach((pt, i) => {
    ctx.fillText(pt.week, xAt(i), cssH - 10);
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadData() {
  const res = await fetch("./data/sample.json", { cache: "no-store" });
  if (!res.ok) throw new Error("sample.json load failed");
  return res.json();
}

async function boot() {
  try {
    const data = await loadData();
    renderHero(data);
    renderForecast(data);
    renderScores(data);
    renderDepartments(data);
    drawTrend(data.weekly || []);
    window.addEventListener("resize", () => drawTrend(data.weekly || []));
  } catch (err) {
    console.error(err);
    $("kpiReclaimed").textContent = "데이터 로드 실패";
  }
}

boot();
