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
    mail: "#e89a9a",
  };

  /** @type {any} */
  let pet = null;
  let scanning = false;
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
    // Hide idle home status — pet + tagline already say enough
    if (!text || /집에서 쉬는/.test(text)) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function clearStatus() {
    setStatus("");
  }

  function applyAnim(name) {
    if (!pet) return;
    if (name === "walk") pet.setState("run");
    else pet.setState(name);
  }

  function discoveryGroupCount() {
    const data = window.DigitalHomeData;
    let n = 0;
    if ((data?.duplicate?.files?.length || 0) >= 2) n += 1;
    n += data?.candidates?.similarPhotos?.groups?.length || 0;
    n += data?.candidates?.similarDocs?.groups?.length || 0;
    if (data?.mailCleanup?.groups?.length) n += 1;
    return n;
  }

  function fillMetrics() {
    const data = window.DigitalHomeData;
    const clean = data?.summary?.cleanableGb ?? 8.7;
    if ($("miniCleanable")) $("miniCleanable").textContent = `${fmtGb(clean)}GB`;
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
      ? "눌러서 완전 동일·비슷한 사진·문서 보기"
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
      setStatus(
        snap.exploring
          ? `🐾 지금 ${snap.label || "다른 공간"}을 살펴보는 중...`
          : `🐾 ${snap.label || "다른 공간"}에 있어요`
      );
    } else if (scanning) {
      setStatus(snap.statusLine || "🐾 탐색 준비 중...");
    } else {
      clearStatus();
      applyAnim("sleep");
    }

    if (scanBtn) scanBtn.hidden = away || scanning;
    if (summonBtn) summonBtn.hidden = !away;
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
      "gmail",
      "onedrive",
    ];
    const byId = Object.fromEntries(data.spaces.map((s) => [s.id, s]));
    // Show connected spaces (+ Mac always)
    const rows = preferred
      .map((id) => byId[id])
      .filter(Boolean)
      .filter((s) => s.id === "mac-local" || s.connected);

    list.innerHTML = rows
      .map((s) => {
        const on = !!s.connected && s.used != null;
        const total = s.total || 1;
        const pct = on ? Math.round((s.used / total) * 100) : 0;
        const totalLabel =
          total >= 1000 ? `${fmtGb(total / 1024)} TB` : `${fmtGb(total)} GB`;
        const size = on
          ? `${fmtGb(s.used)} / ${totalLabel}`
          : s.connected
            ? "연결됨"
            : "연결 안 됨";
        const bar = BAR_COLOR[s.id] || "#7ecb8f";
        const ico = SPACE_ICON[s.id] || "💾";
        return `
        <li class="${on || s.connected ? "" : "off"}">
          <span class="ico" aria-hidden="true">${ico}</span>
          <span class="meta">
            <span class="name">${s.name}</span>
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
          icon:
            s.kind === "mail"
              ? "mail"
              : s.kind === "cloud"
                ? "cloud"
                : "device",
        }));
        fillSpaces();
      }
      if (res?.mailCleanup) {
        window.BiumApp?.applyMailCleanup?.(res.mailCleanup);
      }
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

  function fillStats() {
    fillMetrics();
    fillSpaces();
    updateLastScanLabel();
  }

  function onScanProgress(e) {
    const p = e.detail || {};
    if (p.phase === "start" || p.phase === "walk" || p.phase === "search") {
      scanning = true;
      if ($("btnMiniScan")) $("btnMiniScan").hidden = true;
    } else if (p.phase === "error") {
      scanning = false;
    } else if (p.phase === "idle") {
      scanning = false;
      if (!locationState?.away && $("btnMiniScan")) {
        $("btnMiniScan").hidden = false;
      }
    }
  }

  async function startLiveScan() {
    if (!window.BiumScanSession || window.BiumScanSession.isRunning()) return;
    if (locationState?.away) return;
    scanning = true;
    if ($("btnMiniScan")) $("btnMiniScan").hidden = true;
    setStatus("🐾 일어나서 살펴볼게요...");
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

  /** "정리 후보" → carbon + social cost estimates */
  function openCleanableImpact() {
    if (window.BiumApp?.openCleanableImpactFromMini) {
      window.BiumApp.openCleanableImpactFromMini();
      return;
    }
    setStatus("🐾 정리하면 탄소·비용 부담을 줄일 수 있어요");
  }

  async function remountPet() {
    const el = $("miniPet");
    if (!el || !window.BiumPet) return;
    el.innerHTML = "";
    el.removeAttribute("style");
    el.className = "mini-pet pet-atlas";
    pet = await window.BiumPet.create(el, el);
    // Integer scale only: 64px
    if (pet.atlas) {
      pet.atlas.scale = Math.max(1, Math.round(64 / (pet.atlas.cell || 32)));
      pet.atlas._applySize?.();
    } else if (pet.size) {
      pet.size = 64;
      if (pet.img) {
        pet.img.style.width = "64px";
        pet.img.style.height = "64px";
      }
    }
    el.style.width = "64px";
    el.style.height = "64px";
    el.style.setProperty("--mini-x", "38%");
    pet.setFacing("right");
    pet.setState("sleep");
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
  }

  async function init() {
    fillStats();
    await remountPet();
    if (window.BiumMode?.getMode() === "mini") start();

    document.addEventListener("bium:mode", (e) => {
      if (e.detail?.mode === "mini") start();
      else stop();
    });
    document.addEventListener("bium:scan-progress", onScanProgress);

    $("btnMiniScan")?.addEventListener("click", () => startLiveScan());
    $("btnMiniSummon")?.addEventListener("click", () => summonHere());
    $("btnFindOpen")?.addEventListener("click", () => openFindings());
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
          icon:
            s.kind === "mail"
              ? "mail"
              : s.kind === "cloud"
                ? "cloud"
                : "device",
        }));
        fillSpaces();
      } else {
        refreshConnections();
      }
      if (payload?.mailCleanup) {
        window.BiumApp?.applyMailCleanup?.(payload.mailCleanup);
        const mailGroups = payload.mailCleanup.groups?.length || 0;
        if (mailGroups) setFoundCount(Math.max(foundCount, mailGroups));
      }
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
  };
})();
