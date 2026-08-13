/**
 * TrayPopover — compact menu-bar popover with cozy room + pet.
 */
window.BiumMini = (() => {
  const SPACE_ICON = {
    "mac-local": "💻",
    macbook: "💻",
    laptop: "💻",
    "windows-peer": "🖥",
    desktop: "🖥",
    gdrive: "☁",
    onedrive: "☁",
    gmail: "✉",
    "naver-mail": "✉",
    mail: "✉",
  };
  const BAR_COLOR = {
    "mac-local": "#7ecb8f",
    macbook: "#7ecb8f",
    "windows-peer": "#e8a86a",
    desktop: "#e8a86a",
    gdrive: "#7eb6e8",
    onedrive: "#7eb6e8",
    gmail: "#e89a9a",
    "naver-mail": "#e89a9a",
    mail: "#e89a9a",
  };

  /** @type {any} */
  let pet = null;
  /** @type {{ id: string, el: HTMLElement, pet: any, x: number, y: number, timer: any } | null} */
  let habitatSlot = null;
  let wanderOn = false;
  let scanning = false;
  let titleScanning = false;
  let lastScanAt = null;
  let foundCount = 0;
  /** @type {{ location?: string, away?: boolean, exploring?: boolean, statusLine?: string, label?: string } | null} */
  let locationState = null;

  function $(id) {
    return document.getElementById(id);
  }

  function fmtGb(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const v = Number(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function setStatus(line) {
    const el = $("miniLocStatus");
    if (!el) return;
    const text = (line || "").trim();
    // During scan, progress panel owns the copy
    if (scanning && $("miniScanProgress") && !$("miniScanProgress").hidden) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    // Hide idle home status — pet + tagline already say enough
    if (!text || /집에서 쉬는/.test(text)) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  let scanPct = 0;
  function setScanProgress(pct, label) {
    const wrap = $("miniScanProgress");
    const fill = $("miniScanBarFill");
    const lab = $("miniScanLabel");
    const habitat = $("miniHabitat");
    const btn = $("btnMiniScan");
    if (!wrap) return;
    if (pct != null && !Number.isNaN(Number(pct))) {
      scanPct = Math.max(scanPct, Math.max(0, Math.min(100, Number(pct))));
    }
    wrap.hidden = false;
    if (fill) fill.style.setProperty("--p", `${scanPct || 8}%`);
    if (lab && label) lab.textContent = label;
    habitat?.classList.add("is-scanning");
    if (btn) {
      btn.classList.add("is-scanning");
      btn.textContent = "탐색 중…";
      btn.hidden = false;
    }
    syncMiniWindowHeight();
  }

  function endScanProgress() {
    const wrap = $("miniScanProgress");
    const habitat = $("miniHabitat");
    const btn = $("btnMiniScan");
    if (wrap) wrap.hidden = true;
    habitat?.classList.remove("is-scanning");
    scanPct = 0;
    if (btn) {
      btn.classList.remove("is-scanning");
      btn.textContent = "🐾 탐색 시작";
      if (!locationState?.away) btn.hidden = false;
    }
    syncMiniWindowHeight();
  }

  function clearStatus() {
    setStatus("");
  }

  function applyAnim(name) {
    const state = name === "walk" ? "run" : name;
    pet?.setState?.(state);
    if (state === "found" || state === "happy" || state === "search") {
      pauseWanderBriefly(1600);
    } else if (state === "sleep" || state === "idle" || state === "run") {
      if (!locationState?.away && !scanning) startWander();
    }
  }

  function placePet(slot, x, y) {
    if (!slot) return;
    slot.x = x;
    slot.y = y;
    slot.el.style.setProperty("--x", `${x.toFixed(1)}%`);
    slot.el.style.setProperty("--y", `${y.toFixed(1)}%`);
  }

  function stopWander() {
    wanderOn = false;
    if (habitatSlot?.timer) {
      clearTimeout(habitatSlot.timer);
      habitatSlot.timer = null;
    }
  }

  function pauseWanderBriefly(ms) {
    stopWander();
    setTimeout(() => {
      if (!locationState?.away && !scanning) startWander();
    }, ms);
  }

  function scheduleWander(slot) {
    if (!wanderOn || !slot?.pet) return;
    const delay = 900 + Math.random() * 1600;
    slot.timer = setTimeout(() => stepWander(slot), delay);
  }

  function stepWander(slot) {
    if (!wanderOn || locationState?.away || scanning || !slot?.pet) return;
    const nextX = 4 + Math.random() * 68;
    const nextY = 2 + Math.random() * 12;
    const facing = nextX >= slot.x ? "right" : "left";
    // Facing first, then one state change — avoids double animation reset.
    slot.pet.setFacing?.(facing);
    slot.pet.setState?.("run");
    placePet(slot, nextX, nextY);

    const walkMs = 900;
    slot.timer = setTimeout(() => {
      if (!wanderOn) return;
      const rest = Math.random();
      if (rest < 0.35) slot.pet.setState?.("sleep");
      else if (rest < 0.7) slot.pet.setState?.("idle");
      else slot.pet.setState?.("search");
      scheduleWander(slot);
    }, walkMs);
  }

  function startWander() {
    if (locationState?.away || scanning) return;
    if (!habitatSlot?.pet) return;
    wanderOn = true;
    if (habitatSlot.timer) clearTimeout(habitatSlot.timer);
    habitatSlot.timer = setTimeout(
      () => stepWander(habitatSlot),
      200 + Math.random() * 500
    );
  }

  async function sizePetHost(el, instance) {
    await instance?.ensure?.();
    const atlas = instance?.atlas;
    if (atlas) {
      // Integer scale only — fractional scale misaligns atlas frames (stutter).
      const cellH = atlas.cellH || atlas.cell || 32;
      const targetH = atlas.softSprite ? cellH : cellH <= 32 ? 64 : cellH;
      const scale = Math.max(1, Math.round(targetH / cellH));
      atlas.scale = scale;
      atlas._applySize?.();
      atlas.paint?.();
      el.style.width = `${atlas.display}px`;
      el.style.height = `${atlas.displayH || atlas.display}px`;
      el.style.imageRendering = atlas.softSprite ? "auto" : "pixelated";
      return;
    }
    if (typeof instance?.setDisplaySize === "function") {
      const gifSize = instance.manifest?.type === "gif" ? 96 : 96;
      instance.setDisplaySize(gifSize);
      el.style.width = `${instance.size}px`;
      el.style.height = `${instance.size}px`;
      el.style.imageRendering = "auto";
      return;
    }
    el.style.width = "64px";
    el.style.height = "64px";
  }

  function discoveryGroupCount() {
    const data = window.DigitalHomeData;
    let n = 0;
    if ((data?.duplicate?.files?.length || 0) >= 2) n += 1;
    n += data?.candidates?.similarPhotos?.groups?.length || 0;
    n += data?.candidates?.similarDocs?.groups?.length || 0;
    n += data?.candidates?.coldStale?.groups?.length || 0;
    if (data?.mailCleanup?.groups?.length) n += 1;
    return n;
  }

  function applySummary(summary) {
    if (!summary || !window.DigitalHomeData) return;
    const s = window.DigitalHomeData.summary || (window.DigitalHomeData.summary = {});
    if (summary.cleanableGb != null) s.cleanableGb = Number(summary.cleanableGb) || 0;
    if (summary.findCount != null) s.findCount = Number(summary.findCount) || 0;
    if (summary.scannedFiles != null) s.scannedFiles = summary.scannedFiles;
    if (summary.totalReclaimBytes != null) s.totalReclaimBytes = summary.totalReclaimBytes;
    if (summary.usedGb != null) s.usedGb = summary.usedGb;
    if (summary.totalGb != null) s.totalGb = summary.totalGb;
  }

  function fillMetrics() {
    const data = window.DigitalHomeData;
    const clean = Number(data?.summary?.cleanableGb);
    const el = $("miniCleanable");
    if (el) {
      el.textContent =
        clean > 0 ? `${fmtGb(clean)}GB` : clean === 0 ? "0GB" : "—";
    }
    refreshFindCount();
  }

  function syncFindsButton(has) {
    const btn = $("btnMiniNewFinds");
    if (!btn) return;
    const on = !!has;
    btn.disabled = !on;
    btn.setAttribute("aria-disabled", on ? "false" : "true");
    btn.classList.toggle("is-live", on);
    btn.title = on
      ? "눌러서 동일·유사·잠재우기 후보 보기"
      : "아직 발견한 항목이 없어요";
  }

  function setFoundCount(n) {
    foundCount = Math.max(0, Number(n) || 0);
    const el = $("miniNewFinds");
    if (el) {
      el.dataset.count = String(foundCount);
      el.textContent = `${foundCount}건`;
    }
    syncFindsButton(foundCount > 0);
  }

  function refreshFindCount() {
    // Prefer live hub count (all exact groups + other tiers)
    if (typeof window.BiumApp?.computeFindCount === "function") {
      const n = window.BiumApp.computeFindCount();
      if (window.DigitalHomeData?.summary) {
        window.DigitalHomeData.summary.findCount = n;
      }
      setFoundCount(n);
      return n;
    }
    const summary = window.DigitalHomeData?.summary;
    if (summary && Object.prototype.hasOwnProperty.call(summary, "findCount")) {
      const n = Math.max(0, Number(summary.findCount) || 0);
      setFoundCount(n);
      return n;
    }
    const n = Math.max(foundCount, discoveryGroupCount());
    setFoundCount(n);
    return n;
  }

  function applyLocation(snap) {
    if (!snap) return;
    locationState = snap;
    const root = $("miniRoot");
    const habitat = $("miniHabitat");
    const awayEl = $("miniAway");
    const scanBtn = $("btnMiniScan");
    const summonBtn = $("btnMiniSummon");
    const away = !!snap.away;

    root?.classList.toggle("is-away", away);
    root?.classList.toggle("is-home", !away);
    habitat?.classList.toggle("is-away", away);
    habitat?.classList.toggle("is-sleep", !away && !scanning);
    if (awayEl) awayEl.hidden = !away;

    if (away) {
      stopWander();
      setStatus(
        snap.exploring
          ? `🐾 지금 ${snap.label || "다른 공간"}을 살펴보는 중...`
          : `🐾 ${snap.label || "다른 공간"}에 있어요`
      );
    } else if (scanning) {
      stopWander();
      setStatus(snap.statusLine || "🐾 탐색 준비 중...");
    } else {
      clearStatus();
      startWander();
    }

    // Keep CTA visible while scanning so "탐색 중…" is obvious
    if (scanBtn) scanBtn.hidden = scanning ? false : away;
    if (summonBtn) summonBtn.hidden = scanning ? true : !away;
  }

  function updateLastScanLabel() {
    const el = $("miniLastScan");
    if (!el) return;
    if (!lastScanAt) {
      el.textContent = "아직 탐색하지 않았어요";
      return;
    }
    const mins = Math.max(0, Math.round((Date.now() - lastScanAt) / 60000));
    el.textContent =
      mins < 1 ? "마지막 탐색 방금 전" : `마지막 탐색 ${mins}분 전`;
  }

  function fillSpaces() {
    const list = $("miniSpaceList");
    const data = window.DigitalHomeData;
    if (!list || !data?.spaces) return;

    const preferred = [
      "mac-local",
      "windows-peer",
      "gdrive",
      "naver-mail",
      "gmail",
      "onedrive",
    ];
    const byId = Object.fromEntries(data.spaces.map((s) => [s.id, s]));
    const extras = data.spaces.filter((s) => !preferred.includes(s.id));
    // Show connected spaces (+ Mac always)
    const rows = preferred
      .map((id) => byId[id])
      .concat(extras)
      .filter(Boolean)
      .filter((s) => s.id === "mac-local" || s.connected);

    list.innerHTML = rows
      .map((s) => {
        const hasQuota = s.used != null && s.total != null && Number(s.total) > 0;
        const on = !!s.connected && hasQuota && !s.demo;
        const total = Number(s.total) || 1;
        const used = Number(s.used) || 0;
        const pct = on ? Math.min(100, Math.round((used / total) * 100)) : 0;
        const totalLabel =
          total >= 1000 ? `${fmtGb(total / 1024)} TB` : `${fmtGb(total)} GB`;
        let size;
        if (s.demo && s.connected) size = "데모";
        else if (on) size = `${fmtGb(used)} / ${totalLabel}`;
        else if (s.connected) size = "연결됨";
        else size = "연결 안 됨";
        const bar = BAR_COLOR[s.id] || "#7ecb8f";
        const ico = SPACE_ICON[s.id] || "💾";
        const name = s.demo && s.connected ? `${s.name}` : s.name;
        return `
        <li class="${s.connected ? "" : "off"}">
          <span class="ico" aria-hidden="true">${ico}</span>
          <span class="meta">
            <span class="name">${name}</span>
            <span class="bar" style="--bar:${bar}"><i style="--p:${pct}"></i></span>
          </span>
          <span class="size">${size}</span>
        </li>`;
      })
      .join("");
  }

  async function refreshConnections() {
    if (!window.biumDesktop?.getConnections) return;
    try {
      const res = await window.biumDesktop.getConnections();
      if (res?.spaces?.length && window.DigitalHomeData) {
        window.DigitalHomeData.spaces = res.spaces.map((s) => ({
          id: s.id,
          name: s.name,
          used: s.used,
          total: s.total,
          connected: s.connected,
          demo: !!s.demo,
          icon:
            s.kind === "mail"
              ? "mail"
              : s.kind === "cloud"
                ? "cloud"
                : "device",
        }));
        const mac = res.spaces.find((s) => s.id === "mac-local");
        if (mac && window.DigitalHomeData.summary) {
          if (mac.used != null) window.DigitalHomeData.summary.usedGb = mac.used;
          if (mac.total != null) window.DigitalHomeData.summary.totalGb = mac.total;
        }
      }
      if (res?.summary) applySummary(res.summary);
      const groups = res?.groups || res?.candidates?.exact?.groups || [];
      if (groups.length) {
        window.BiumApp?.applyExactGroups?.(groups);
      }
      if (res?.mailCleanup) {
        window.BiumApp?.applyMailCleanup?.(res.mailCleanup);
      }
      window.BiumApp?.syncFindCountToSummary?.();
      fillStats();
    } catch {
      /* ignore */
    }
  }

  function openAddDeviceSheet() {
    if (!window.BiumApp?.openAddDevice) {
      // Fallback: connect Drive directly
      connectSpace("gdrive");
      return;
    }
    window.BiumApp.openAddDevice();
  }

  async function connectSpace(spaceId) {
    if (!window.biumDesktop?.connectSpace && !window.biumDesktop?.connectGoogle) {
      setStatus("🐾 앱에서만 연결할 수 있어요");
      return;
    }
    setStatus("🐾 연결하는 중...");
    try {
      const res = window.biumDesktop.connectSpace
        ? await window.biumDesktop.connectSpace(spaceId)
        : await window.biumDesktop.connectGoogle();
      await refreshConnections();
      if (res?.ok === false) {
        setStatus(`🐾 ${res.error || "연결하지 못했어요"}`);
        return;
      }
      setStatus(`🐾 ${res?.message || "연결했어요"}`);
    } catch (err) {
      setStatus(`🐾 ${err.message || "연결하지 못했어요"}`);
    }
  }

  function measureMiniContentHeight() {
    const root = $("miniRoot") || document.querySelector(".mini-root");
    if (!root) return 0;
    const style = getComputedStyle(root);
    const padY =
      (parseFloat(style.paddingTop) || 0) +
      (parseFloat(style.paddingBottom) || 0);
    let h = padY;
    for (const child of root.children) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.hidden) continue;
      const cs = getComputedStyle(child);
      if (cs.display === "none") continue;
      h += child.getBoundingClientRect().height;
      h += parseFloat(cs.marginTop) || 0;
      h += parseFloat(cs.marginBottom) || 0;
    }
    // title bar inset / traffic lights breathing room
    return Math.ceil(h + 2);
  }

  function syncMiniWindowHeight() {
    if (document.body?.dataset?.mode !== "mini") return;
    if (!window.biumDesktop?.fitMiniHeight) return;
    requestAnimationFrame(() => {
      const measured = measureMiniContentHeight();
      if (measured < 200) return;
      window.biumDesktop.fitMiniHeight(measured);
    });
  }

  function fillStats() {
    fillMetrics();
    fillSpaces();
    updateLastScanLabel();
    syncMiniWindowHeight();
  }

  function onScanProgress(e) {
    const p = e.detail || {};
    const label = (p.text || "").trim();
    if (
      p.phase === "start" ||
      p.phase === "walk" ||
      p.phase === "search" ||
      p.phase === "transfer" ||
      p.phase === "indexed" ||
      p.phase === "found"
    ) {
      scanning = true;
      const pct =
        p.progress != null
          ? Number(p.progress)
          : p.phase === "start"
            ? 6
            : p.phase === "indexed"
              ? 92
              : p.phase === "found"
                ? 96
                : undefined;
      setScanProgress(
        pct != null ? pct : undefined,
        label ? `🐾 ${label}` : "🐾 탐색 중…"
      );
      if (label) {
        applyLocation({
          ...(locationState || {}),
          location: p.agent || locationState?.location || "mac-local",
          label: p.label || locationState?.label,
          away: true,
          exploring: true,
          statusLine: `🐾 ${label}`,
        });
      }
    } else if (p.phase === "error") {
      scanning = false;
      endScanProgress();
      setStatus(`🐾 ${label || "탐색 중 문제가 생겼어요"}`);
    } else if (p.phase === "idle") {
      scanning = false;
      setScanProgress(100, label ? `🐾 ${label}` : "🐾 탐색 끝");
      setTimeout(() => endScanProgress(), 600);
      if (!locationState?.away && $("btnMiniScan")) {
        $("btnMiniScan").hidden = false;
      }
    }
  }

  async function startLiveScan() {
    if (!window.BiumScanSession || window.BiumScanSession.isRunning()) return;
    if (locationState?.away && scanning) return;
    scanning = true;
    setScanProgress(4, "🐾 일어나서 살펴볼게요…");
    applyAnim("run");
    applyLocation({
      location: "mac-local",
      label: "MacBook",
      away: true,
      exploring: true,
      statusLine: "🐾 지금 MacBook을 살펴보는 중...",
    });

    const res = await window.BiumScanSession.run();
    lastScanAt = Date.now();
    scanning = false;
    endScanProgress();

    try {
      const loc = await window.biumDesktop?.getPetLocation?.();
      if (loc) applyLocation(loc);
    } catch {
      /* ignore */
    }

    const files = res?.primary?.files?.length || 0;
    const summoned = !!res?.summoned;
    const candidates =
      res?.candidates || res?.result?.candidates || null;
    if (candidates) window.BiumApp?.applyCandidates?.(candidates);
    if (!summoned) {
      const groups = refreshFindCount();
      if (groups > 0 || files >= 2) {
        if (files >= 2) {
          setStatus(`🐾 같은 파일 ${files}개 · 비슷한 묶음도 챙겼어!`);
        } else {
          setStatus("🐾 비슷한 사진·문서 묶음을 찾았어!");
        }
        applyAnim("found");
        window.biumDesktop?.setTrayBadge?.(Math.max(files, groups));
      } else {
        setFoundCount(0);
        setStatus("🐾 지금은 깨끗한 편이에요");
        applyAnim("sleep");
        window.biumDesktop?.setTrayBadge?.(0);
        if ($("btnMiniScan")) $("btnMiniScan").hidden = false;
      }
    }
    fillStats();
  }

  async function summonHere() {
    if (!window.biumDesktop?.summonPet) return;
    setStatus("🐾 부르는 중...");
    try {
      const res = await window.biumDesktop.summonPet();
      if (res?.location) applyLocation(res.location);
      setStatus("🐾 왔어! 여기야");
      applyAnim("found");
      if ($("btnMiniScan")) $("btnMiniScan").hidden = false;
      setTimeout(() => {
        if (!locationState?.away) {
          clearStatus();
          applyAnim("sleep");
        }
      }, 1400);
    } catch (err) {
      setStatus(`🐾 ${err.message || "아직 못 들었어요"}`);
    }
  }

  function openFindings() {
    if (refreshFindCount() <= 0) {
      setStatus("🐾 아직 가져온 발견이 없어요");
      return;
    }
    if (window.BiumApp?.openFindingsHub) window.BiumApp.openFindingsHub();
    else window.BiumApp?.openDuplicateFromMini?.();
  }

  /** "새로 발견 N건" → 3-tier findings hub */
  function openNewFinds() {
    openFindings();
  }

  /** Fast secondary CTA: titles only, no Tika/SBERT/hash/cloud work. */
  async function scanSimilarTitles() {
    if (titleScanning || scanning) return;
    const button = $("btnFindOpen");
    titleScanning = true;
    if (button) button.disabled = true;
    setStatus("🐾 파일 제목만 빠르게 비교하는 중…");
    try {
      if (!window.biumDesktop?.scanTitles) {
        setStatus("🐾 제목 탐색은 데스크톱 앱에서 사용할 수 있어요");
        return;
      }
      const result = await window.biumDesktop.scanTitles({
        minSimilarity: 0.8,
      });
      const groups = result?.candidates?.similarDocs?.groups || [];
      window.BiumApp?.applyCandidates?.(result.candidates);
      fillStats();
      if (!groups.length) {
        setStatus(
          `🐾 ${Number(result?.scannedFiles || 0).toLocaleString()}개 제목을 봤지만 비슷한 파일은 없어요`
        );
        return;
      }
      setStatus(`🐾 제목이 비슷한 파일 ${groups.length}묶음을 찾았어요`);
      window.BiumApp?.openDocReviewModal?.(groups[0].id);
    } catch (error) {
      setStatus(`🐾 ${error.message || "제목 탐색에 실패했어요"}`);
    } finally {
      titleScanning = false;
      if (button) button.disabled = false;
    }
  }

  /** "정리 후보" → carbon + social cost estimates */
  function openCleanableImpact() {
    if (window.BiumApp?.openCleanableImpactFromMini) {
      window.BiumApp.openCleanableImpactFromMini();
      setStatus("🐾 정리하면 탄소·비용 부담을 줄일 수 있어요");
      return;
    }
    // Fallback if app.js not ready — still show numbers
    const gb = Number(window.DigitalHomeData?.summary?.cleanableGb) || 0;
    const carbonKg = gb * 0.04;
    const carbonLabel =
      carbonKg >= 1
        ? `${carbonKg.toFixed(1)} kgCO₂e`
        : `${Math.round(carbonKg * 1000)} gCO₂e`;
    const savingKrw = Math.round(
      (gb / 8.7) * (window.DigitalHomeData?.summary?.savingKrw || 36000)
    );
    const layer = $("modalLayer");
    const root = $("modalRoot");
    if (layer && root) {
      root.classList.add("is-util");
      root.innerHTML = `
        <div class="util-sheet">
          <h3 class="util-sheet-title">정리하면</h3>
          <p class="util-sheet-lead">후보 <strong>${gb}GB</strong>를 비웠을 때</p>
          <ul class="util-find-list">
            <li class="util-find-row">
              <div class="util-find-main">
                <strong>예상 탄소 절감</strong>
                <small>연간 추정</small>
              </div>
              <span class="util-find-size">약 ${carbonLabel}/년</span>
            </li>
            <li class="util-find-row">
              <div class="util-find-main">
                <strong>사회적 절감 비용</strong>
                <small>연간 추정</small>
              </div>
              <span class="util-find-size">약 ${savingKrw.toLocaleString()}원/년</span>
            </li>
          </ul>
          <button class="util-sheet-close" data-action="close" type="button">확인</button>
        </div>`;
      layer.classList.remove("hidden");
      root.querySelector("[data-action=close]")?.addEventListener("click", () => {
        layer.classList.add("hidden");
        root.classList.remove("is-util");
        root.innerHTML = "";
      });
    }
    setStatus(`🐾 약 ${carbonLabel}/년 · ${savingKrw.toLocaleString()}원/년`);
  }

  async function remountPet() {
    if (!window.BiumPet?.create) return;
    stopWander();
    habitatSlot = null;

    const el = $("miniPet");
    if (!el) return;

    el.innerHTML = "";
    el.removeAttribute("style");
    el.className = "mini-pet pet-atlas";
    el.hidden = false;

    // Settings에서 고른 펫 하나만 (neko | retriever)
    const petId = window.BiumPet.getId?.() || "retriever";
    pet = window.BiumPet.createForId
      ? await window.BiumPet.createForId(petId, el, el)
      : await window.BiumPet.create(el, el);
    await sizePetHost(el, pet);

    habitatSlot = {
      id: petId,
      el,
      pet,
      x: 38,
      y: 6,
      timer: null,
    };
    placePet(habitatSlot, habitatSlot.x, habitatSlot.y);
    pet.setFacing?.("right");
    pet.setState?.("sleep");

    if (!locationState?.away) startWander();
  }

  function setAgent(line) {
    setStatus(line);
  }
  function setMood(title) {
    setStatus(title);
  }
  function showFetchView() {}
  function showStatusView() {}

  function start() {
    fillStats();
  }

  function stop() {
    scanning = false;
    stopWander();
  }

  async function init() {
    fillStats();
    await remountPet();
    if (window.BiumMode?.getMode() === "mini") start();
    syncMiniWindowHeight();

    document.addEventListener("bium:mode", (e) => {
      if (e.detail?.mode === "mini") {
        start();
        syncMiniWindowHeight();
      } else stop();
    });
    document.addEventListener("bium:pet", () => {
      remountPet();
    });
    document.addEventListener("bium:scan-progress", onScanProgress);

    $("btnMiniScan")?.addEventListener("click", () => startLiveScan());
    $("btnMiniSummon")?.addEventListener("click", () => summonHere());
    $("btnFindOpen")?.addEventListener("click", () => scanSimilarTitles());
    $("btnMiniNewFinds")?.addEventListener("click", () => openNewFinds());
    $("btnMiniCleanable")?.addEventListener("click", () => openCleanableImpact());
    $("btnConnectSpace")?.addEventListener("click", () => openAddDeviceSheet());
    $("btnMiniSettings")?.addEventListener("click", () => {
      window.BiumApp?.openDisplaySettings?.();
    });

    refreshConnections();
    window.biumDesktop?.onConnections?.((payload) => {
      if (payload?.spaces?.length && window.DigitalHomeData) {
        window.DigitalHomeData.spaces = payload.spaces.map((s) => ({
          id: s.id,
          name: s.name,
          used: s.used,
          total: s.total,
          connected: s.connected,
          demo: !!s.demo,
          icon:
            s.kind === "mail"
              ? "mail"
              : s.kind === "cloud"
                ? "cloud"
                : "device",
        }));
      }
      if (payload?.summary) applySummary(payload.summary);
      if (payload?.mailCleanup) {
        window.BiumApp?.applyMailCleanup?.(payload.mailCleanup);
      }
      fillStats();
    });
    window.biumDesktop?.onPetLocation?.((snap) => applyLocation(snap));
    window.biumDesktop?.getPetLocation?.().then((snap) => {
      if (snap) applyLocation(snap);
    });
    window.biumDesktop?.onPetFound?.((payload) => {
      const n = payload?.primary?.files?.length || 2;
      if (payload?.primary && window.BiumScanMap) {
        const mapped = window.BiumScanMap.fromDietGroup(payload.primary, {
          groupCount: 1,
          engine: payload.primary.engine,
        });
        window.BiumScanMap.applyToData(mapped);
      }
      lastScanAt = Date.now();
      setFoundCount(n);
      applyLocation({
        location: "home",
        label: "집",
        away: false,
        exploring: false,
        statusLine: "집에서 쉬고 있어요",
      });
      setStatus(`🐾 이름은 다르지만 내용이 같은 파일 ${n}개를 찾았어!`);
      applyAnim("found");
      fillStats();
    });
    window.biumDesktop?.onOpenFetchView?.(() => openFindings());

    setInterval(() => {
      if (window.BiumMode?.getMode() !== "mini") return;
      updateLastScanLabel();
    }, 30000);
  }

  return {
    init,
    start,
    stop,
    setFoundCount,
    refreshFindCount,
    fillStats,
    remountPet,
    startLiveScan,
    setAgent,
    setMood,
    showFetchView,
    showStatusView,
    refreshConnections,
  };
})();
