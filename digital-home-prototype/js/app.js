(() => {
  const data = window.DigitalHomeData;
  const $ = (id) => document.getElementById(id);

  const state = {
    selectedKeep: null,
    /** @type {Set<string>} paths to keep when cleaning duplicates */
    selectedKeeps: new Set(),
    tourTimer: null,
  };

  /** @type {any} */
  let sprite = null;
  /** @type {any} */
  let agent = null;

  function resetAgentHost() {
    const el = $("agentSprite");
    if (!el) return el;
    el.innerHTML = "";
    el.removeAttribute("style");
    el.className = "cat-sprite agent-sprite pet-atlas";
    el.style.backgroundImage = "none";
    return el;
  }

  async function mountHomePet() {
    const el = resetAgentHost();
    sprite = await window.BiumPet.create(el, $("catAgent"));
    if (!agent) {
      agent = new window.CatAgent({
        root: $("catAgent"),
        sprite,
        speechEl: $("catSpeech"),
        statusEl: $("catStatusText"),
        carryEl: $("carryProp"),
        rooms: data.rooms,
      });
    } else {
      agent.sprite = sprite;
    }
    data.agentName = window.BiumPet.getMeta().label;
    sprite.setState("sleep");
    return sprite;
  }

  function setBar(el, p) {
    if (el) el.style.setProperty("--p", Math.max(0, Math.min(100, p)));
  }

  function animateCount(el, from, to, suffix = "", duration = 500) {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const val = from + (to - from) * t;
      if (typeof to === "number" && !Number.isInteger(to)) {
        el.textContent = `${val.toFixed(1)}${suffix}`;
      } else {
        el.textContent = `${Math.round(val)}${suffix}`;
      }
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function renderSpaces() {
    const list = $("spaceList");
    if (!list) return;
    list.innerHTML = data.spaces
      .map((s) => {
        const totalLabel =
          s.total >= 1000 ? `${(s.total / 1024).toFixed(0)}TB` : `${s.total}GB`;
        const p = Math.round((s.used / Math.max(1, s.total)) * 100);
        return `
          <li>
            <i class="px-icon ${s.icon}"></i>
            <div class="meta">
              <span>${s.name}</span>
              <b>${s.used}GB / ${totalLabel}</b>
              <div class="pixel-bar sky" style="--p:${p}"></div>
            </div>
          </li>
        `;
      })
      .join("");
  }

  function renderFinds() {
    $("findList").innerHTML = data.finds
      .map(
        (f) => `
      <li>
        <div class="left">
          <strong>${f.label}</strong>
          <small>${f.gb}GB · ${f.count}개</small>
        </div>
        <button class="view-btn" data-find="${f.id}" type="button">보기</button>
      </li>
    `
      )
      .join("");
    const total = data.finds.reduce((s, f) => s + f.gb, 0);
    $("findTotal").textContent = `${total.toFixed(1)}GB`;
  }

  function renderHud() {
    $("sumCleanable").textContent = `${data.summary.cleanableGb}GB`;
    $("sumSaving").textContent = `${data.summary.savingKrw.toLocaleString()}원`;
    $("overallClean").textContent = `${data.overallClean}%`;
    setBar($("overallBar"), data.overallClean);
    $("fxSpace").textContent = `${data.effects.spaceGb} GB`;
    $("fxCost").textContent = `${data.effects.costKrw.toLocaleString()}원`;
    $("fxFiles").textContent = `${data.effects.files}개`;

    Object.values(data.rooms).forEach((r) => {
      if (r.id === "mail") return;
      const clean = $(`${r.id}Clean`);
      const bar = $(`${r.id}Bar`);
      const gb = $(`${r.id}Gb`);
      if (clean) clean.textContent = `${r.clean}%`;
      if (bar) setBar(bar, r.clean);
      if (gb && r.total) gb.textContent = `${r.used} / ${r.total}GB`;
    });
  }

  function openModal(html, { util = false } = {}) {
    $("modalRoot").classList.toggle("is-util", !!util);
    $("modalRoot").innerHTML = html;
    $("modalLayer").classList.remove("hidden");
  }

  function closeModal() {
    $("modalLayer").classList.add("hidden");
    $("modalRoot").classList.remove("is-util");
    $("modalRoot").innerHTML = "";
    state.selectedKeep = null;
    state.selectedKeeps = new Set();
  }

  function isMiniMode() {
    return (window.BiumMode?.getMode() || "mini") === "mini";
  }

  function stopTour() {
    if (state.tourTimer) {
      clearInterval(state.tourTimer);
      state.tourTimer = null;
    }
  }

  function startTour() {
    stopTour();
    const path = ["desktop", "laptop", "phone", "cloud"];
    let i = 0;
    const step = async () => {
      if (agent.busy || !$("modalLayer").classList.contains("hidden")) return;
      const room = path[i % path.length];
      i += 1;
      await agent.go(room, {
        speech: data.speeches[room],
        status: `${data.rooms[room].label} 스캔 중...`,
      });
      if (agent.busy || !$("modalLayer").classList.contains("hidden")) return;
      // short pause as sleep between room hops (idle story beat)
      agent.sprite.setState("sleep");
      agent.setStatus("잠깐 쉼...");
    };
    step();
    state.tourTimer = setInterval(step, 3800);
  }

  function openDuplicateModal() {
    const files = data.duplicate.files;
    if (!files?.length) {
      if (isMiniMode()) {
        openModal(
          `
          <div class="util-sheet">
            <h3 class="util-sheet-title">발견한 항목</h3>
            <p class="util-sheet-note">지금은 내용이 같은 파일이 없어요.</p>
            <button class="util-sheet-close" data-action="close" type="button">확인</button>
          </div>
        `,
          { util: true }
        );
        return;
      }
      openModal(`
        <h3 class="dialog-title">지금은 깨끗해요</h3>
        <p class="dialog-sub">내용이 같은 중복 파일을 찾지 못했어요.</p>
        <div class="modal-actions">
          <button class="px-btn accent" data-action="close" type="button">확인</button>
        </div>
      `);
      return;
    }

    const reclaim = data.duplicate.reclaimMb;
    const reclaimLabel =
      reclaim >= 1024 ? `${(reclaim / 1024).toFixed(1)}GB` : `${reclaim}MB`;

    if (isMiniMode()) {
      const rows = files
        .map(
          (f) => `
        <li class="util-find-row">
          <div class="util-find-main">
            <strong>${escapeHtml(f.name)}</strong>
            <small>${escapeHtml(f.place || "")}</small>
          </div>
          <span class="util-find-size">${escapeHtml(f.size || "")}</span>
        </li>`
        )
        .join("");

      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">발견한 항목</h3>
          <p class="util-sheet-lead">이름은 다르지만 내용이 같은 파일 ${files.length}개</p>
          <ul class="util-find-list">${rows}</ul>
          <p class="util-sheet-note">남길 위치를 고르면 <strong>+${reclaimLabel}</strong>까지 확보할 수 있어요 · 여러 곳도 가능</p>
          <div class="util-sheet-actions">
            <button class="util-sheet-close" data-action="keep-one" type="button">남길 위치 고르기</button>
            <button class="util-sheet-ghost" data-action="close" type="button">나중에</button>
          </div>
        </div>
      `,
        { util: true }
      );
      return;
    }

    const matchNote =
      data.duplicate.matchNote || "파일 내용 일치 100%";
    const engineNote = data.duplicate.engine
      ? `엔진: ${data.duplicate.engine}`
      : "";
    const rows = files
      .map(
        (f) => `
      <div class="file-row">
        <div>
          <strong>${f.name}</strong>
          <small>✓ ${f.place}${f.path ? `<br><span class="path-hint">${escapeHtml(shortPath(f.path))}</span>` : ""}<br>${f.size}</small>
        </div>
        <div class="match-badge">HASH<br>MATCH</div>
      </div>
    `
      )
      .join("");

    const oneSize = files[0]?.size || "";
    const totalHeld = reclaim + (parseInt(String(oneSize), 10) || reclaim);

    openModal(`
      <div class="dialog-head">
        <div class="dialog-cat" aria-hidden="true"></div>
        <div>
          <h3 class="dialog-title">똑같은 파일을 ${files.length}곳에서 찾았어요!</h3>
          <p class="dialog-sub">이름은 달라도 내용 해시가 같습니다. 삭제 결정은 당신이 해요.</p>
        </div>
      </div>
      <div class="file-list">${rows}</div>
      <p class="modal-note">${matchNote}${engineNote ? ` · ${engineNote}` : ""}</p>
      <p class="modal-note">남길 위치를 고르면 <span class="gain">+${reclaim}MB</span>까지 확보 가능 · 여러 곳도 가능</p>
      <div class="modal-actions row">
        <button class="px-btn accent" data-action="keep-one" type="button">남길 위치 고르기</button>
        <button class="px-btn ghost" data-action="close" type="button">모두 유지</button>
        <button class="px-btn ghost" data-action="close" type="button">나중에</button>
      </div>
    `);
  }

  function shortPath(p) {
    const s = String(p || "");
    if (s.length <= 42) return s;
    return `…${s.slice(-40)}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function applyPrimary(primary) {
    if (!primary || !window.BiumScanMap) return;
    const mapped = window.BiumScanMap.fromDietGroup(primary, {
      groupCount: exactGroups().length || 1,
      engine: primary.engine,
    });
    window.BiumScanMap.applyToData(mapped);
  }

  function exactGroups() {
    return data.candidates?.exact?.groups || [];
  }

  /** Headline “N건” = reviewable groups/cards, not files inside one group */
  function computeFindCount() {
    const exact = exactGroups().length;
    const photos = photoGroups().length;
    const docs = docGroups().length;
    const cold = coldGroups().length;
    const mail = data.mailCleanup?.groups?.length ? 1 : 0;
    const dupFallback =
      exact === 0 && (data.duplicate?.files?.length || 0) >= 2 ? 1 : 0;
    return exact + dupFallback + photos + docs + cold + mail;
  }

  function syncFindCountToSummary() {
    if (!data.summary) return;
    const n = computeFindCount();
    data.summary.findCount = n;
    window.BiumMini?.setFoundCount?.(n);
    return n;
  }

  function applyExactGroups(groups) {
    if (!Array.isArray(groups)) return;
    data.candidates = data.candidates || {};
    data.candidates.exact = { groups };
    const findDup = data.finds?.find((f) => f.id === "duplicate");
    if (findDup) {
      findDup.count = groups.length;
      findDup.gb = +(
        groups.reduce((s, g) => s + (g.reclaimBytes || 0), 0) /
        1024 ** 3
      ).toFixed(1);
    }
    if (groups[0]) applyPrimary(groups[0]);
    syncFindCountToSummary();
  }

  function formatReclaim(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
    if (n >= 1024 ** 2) return `${Math.max(1, Math.round(n / 1024 ** 2))}MB`;
    return `${Math.max(1, Math.round(n / 1024))}KB`;
  }

  /** List every exact-duplicate group (fixes “43건” → only 3 files). */
  function openExactDupList() {
    const groups = [...exactGroups()].sort(
      (a, b) => (b.reclaimBytes || 0) - (a.reclaimBytes || 0)
    );
    if (!groups.length) {
      if ((data.duplicate?.files?.length || 0) >= 2) {
        openDuplicateModal();
        return;
      }
      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">똑같은 파일</h3>
          <p class="util-sheet-note">아직 내용이 같은 묶음이 없어요.</p>
          <button class="util-sheet-close" data-action="close" type="button">닫기</button>
        </div>
      `,
        { util: true }
      );
      return;
    }
    if (groups.length === 1) {
      applyPrimary(groups[0]);
      openDuplicateModal();
      return;
    }

    const rows = groups
      .slice(0, 40)
      .map((g, i) => {
        const n = g.files?.length || g.count || 0;
        const title = escapeHtml(g.title || g.files?.[0]?.name || `묶음 ${i + 1}`);
        const places = [
          ...new Set(
            (g.files || []).map((f) => f.deviceLabel || f.place || f.room).filter(Boolean)
          ),
        ]
          .slice(0, 3)
          .join(" · ");
        return `
          <button class="util-option" type="button" data-action="open-exact-group" data-group-id="${escapeHtml(String(g.id || i))}">
            <span class="util-option-ico" aria-hidden="true">⧉</span>
            <span class="util-option-text">
              <strong>${title}</strong>
              <small>${n}곳 · ${escapeHtml(places || g.reason || "내용 동일")} · ${formatReclaim(g.reclaimBytes)}</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>`;
      })
      .join("");
    const more =
      groups.length > 40
        ? `<p class="util-sheet-note">외 ${groups.length - 40}묶음은 다음 탐색에서 이어서 볼 수 있어요.</p>`
        : "";

    openModal(
      `
      <div class="util-sheet">
        <h3 class="util-sheet-title">똑같은 파일</h3>
        <p class="util-sheet-lead">내용이 같은 묶음 ${groups.length}개</p>
        <p class="util-sheet-note">하나씩 골라 어디에 남길지 정하면 돼요.</p>
        <div class="util-options">${rows}</div>
        ${more}
        <button class="util-sheet-ghost" data-action="open-findings-hub" type="button">← 발견한 항목</button>
        <button class="util-sheet-close" data-action="close" type="button">닫기</button>
      </div>
    `,
      { util: true }
    );
  }

  async function runDuplicateFlow() {
    stopTour();
    if (!agent) return;

    // Desktop Pet owns the walk on the real screen — Home only shows keep-one
    if (window.biumDesktop?.petScan) {
      agent.idle("바탕화면에서 탐색 중...");
      agent.setStatus("Desktop Pet이 Mac ↔ Desktop을 오가는 중");
      const res = await window.BiumScanSession.run();
      if (res?.primary) applyPrimary(res.primary);
      window.BiumMini?.fillStats?.();
      renderHud();
      renderFinds();
      const found = (data.duplicate?.files?.length || 0) >= 2;
      if (found) {
        agent.setSpeech("같은 파일을 물어왔어요!");
        agent.setStatus("중복 발견 · 결정해 주세요");
        agent.sprite?.setState("carry");
        agent.showCarry?.(true);
      } else {
        agent.idle("지금은 깨끗해요");
      }
      openDuplicateModal();
      return;
    }

    if (!window.BiumScanSession) return;
    const scanPromise = window.BiumScanSession.run();
    const outcome = await agent.exploreWithScan(scanPromise);
    if (!outcome || outcome.ok === false) return;
    window.BiumMini?.fillStats?.();
    renderHud();
    renderFinds();
    openDuplicateModal();
  }

  function fileBytes(f) {
    if (!f) return 0;
    if (Number(f.sizeBytes) > 0) return Number(f.sizeBytes);
    if (Number(f.size) > 0 && Number(f.size) > 1000) return Number(f.size);
    const m = String(f.size || "").match(/([\d.]+)\s*(GB|MB|KB|B)/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const u = m[2].toUpperCase();
    if (u === "GB") return n * 1024 ** 3;
    if (u === "MB") return n * 1024 ** 2;
    if (u === "KB") return n * 1024;
    return n;
  }

  function formatKeepReclaim(bytes) {
    const b = Number(bytes) || 0;
    if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)}GB`;
    if (b >= 1024 ** 2) return `${Math.max(1, Math.round(b / 1024 ** 2))}MB`;
    if (b >= 1024) return `${Math.max(1, Math.round(b / 1024))}KB`;
    return `${b}B`;
  }

  function seedSelectedKeeps() {
    const files = data.duplicate?.files || [];
    state.selectedKeeps = new Set();
    const recommended = files.filter((f) => f.recommended && f.path);
    if (recommended.length) {
      recommended.forEach((f) => state.selectedKeeps.add(f.path));
    } else if (files[0]?.path) {
      state.selectedKeeps.add(files[0].path);
    }
    state.selectedKeep = [...state.selectedKeeps][0] || null;
  }

  function pathForKeepIdx(idx) {
    const files = data.duplicate?.files || [];
    return files[Number(idx)]?.path || null;
  }

  function updateKeepSelectionUi() {
    const root = $("modalRoot");
    if (!root) return;
    root.querySelectorAll("[data-keep-idx]").forEach((el) => {
      const p = pathForKeepIdx(el.dataset.keepIdx);
      const on = !!(p && state.selectedKeeps.has(p));
      el.classList.toggle("selected", on);
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const files = data.duplicate?.files || [];
    const keepN = state.selectedKeeps.size;
    const trashBytes = files
      .filter((f) => f.path && !state.selectedKeeps.has(f.path))
      .reduce((s, f) => s + fileBytes(f), 0);
    const labels = files
      .filter((f) => f.path && state.selectedKeeps.has(f.path))
      .map((f) => f.keepLabel || f.place || f.name)
      .filter(Boolean);
    const reason = $("keepReason");
    const confirmBtn = root.querySelector("[data-action='confirm-keep']");
    if (!keepN) {
      if (reason) {
        reason.textContent =
          "남길 위치를 하나 이상 골라 주세요. 여러 곳도 가능해요.";
      }
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }
    if (confirmBtn) confirmBtn.disabled = false;
    if (keepN >= files.length) {
      if (reason) {
        reason.textContent = "모든 위치를 남기면 정리할 사본이 없어요.";
      }
      if (confirmBtn) confirmBtn.textContent = "모두 유지";
      return;
    }
    if (confirmBtn) {
      confirmBtn.textContent =
        keepN === 1 ? "이 위치에 남기기" : `${keepN}곳에 남기고 정리`;
    }
    if (reason) {
      reason.innerHTML = `<strong>${escapeHtml(labels.join(" · "))}</strong>에 남기고 나머지 사본을 정리해요 · 확보 약 <strong>+${formatKeepReclaim(trashBytes)}</strong>`;
    }
  }

  function openKeepWhere() {
    const files = data.duplicate?.files || [];
    const hero = files[0];
    seedSelectedKeeps();

    if (isMiniMode()) {
      const options = files
        .map((f, i) => {
          const on = f.path && state.selectedKeeps.has(f.path);
          return `
          <button class="util-option util-option-multi ${f.recommended ? "is-rec" : ""} ${on ? "is-on selected" : ""}" type="button" data-keep-idx="${i}" aria-pressed="${on ? "true" : "false"}">
            <span class="util-option-ico" aria-hidden="true">📁</span>
            <span class="util-option-text">
              <strong>${escapeHtml(f.keepLabel || f.name)}${f.recommended ? " · 추천" : ""}</strong>
              <small>${escapeHtml(f.place || "")}<br>${escapeHtml(f.keepDesc || f.size || "")}</small>
            </span>
            <span class="util-check util-check-multi" aria-hidden="true"></span>
          </button>`;
        })
        .join("");

      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">어디에 남길까요?</h3>
          <p class="util-sheet-lead">${hero ? `${escapeHtml(hero.name)} · ${escapeHtml(hero.size || "")}` : "남길 사본을 고르세요"}<br><small>여러 위치를 선택할 수 있어요. 고르지 않은 곳만 정리해요.</small></p>
          <div class="util-options" id="keepOptions">${options}</div>
          <p class="util-sheet-note" id="keepReason"></p>
          <div class="util-sheet-actions">
            <button class="util-sheet-close" data-action="confirm-keep" type="button">남기고 정리</button>
            <button class="util-sheet-ghost" data-action="back-dup" type="button">뒤로</button>
          </div>
        </div>
      `,
        { util: true }
      );
      updateKeepSelectionUi();
      return;
    }

    const options = files
      .map((f, i) => {
        const on = f.path && state.selectedKeeps.has(f.path);
        const rec = f.recommended ? `<span class="rec">추천</span>` : "";
        return `
          <button class="keep-option ${on ? "selected" : ""}" type="button" data-keep-idx="${i}" aria-pressed="${on ? "true" : "false"}">
            <div>
              <strong>${escapeHtml(f.keepLabel || f.name)}</strong>
              <small>${escapeHtml(f.place || "")}<br>${escapeHtml(f.keepDesc || "")}</small>
            </div>
            ${rec}
          </button>
        `;
      })
      .join("");

    openModal(`
      <h3 class="dialog-title">어디에 남겨둘까요?</h3>
      <p class="dialog-sub">${hero ? `${escapeHtml(hero.name)} · ${escapeHtml(hero.size || "")}` : "남길 사본을 고르세요."}<br>여러 위치를 선택할 수 있어요. 고르지 않은 곳만 정리해요.</p>
      <div class="keep-options">${options}</div>
      <p class="modal-note" id="keepReason"></p>
      <div class="modal-actions row">
        <button class="px-btn accent" data-action="confirm-keep" type="button">남기고 정리</button>
        <button class="px-btn ghost" data-action="back-dup" type="button">뒤로</button>
        <button class="px-btn ghost" data-action="close" type="button">모두 유지</button>
      </div>
    `);
    updateKeepSelectionUi();
  }

  async function finishCleanup() {
    const gainGb = +(data.duplicate.reclaimMb / 1024).toFixed(2);
    const room = data.rooms.desktop;
    const from = room.clean;
    const to = Math.min(96, from + 5);

    closeModal();
    await agent.clean("desktop");

    // remove clutter visuals for confirmed duplicates
    document.querySelectorAll('[data-clutter="desktop"] [data-item="dup"], [data-clutter="cloud"] [data-item="cloud-dup"]').forEach((el) => {
      el.classList.add("gone");
    });
    document.querySelectorAll(".bang").forEach((b) => {
      b.hidden = true;
    });

    room.clean = to;
    data.overallClean = Math.min(99, data.overallClean + 5);
    data.summary.cleanableGb = Math.max(0, +(data.summary.cleanableGb - gainGb).toFixed(1));
    data.finds[0].gb = Math.max(0, +(data.finds[0].gb - gainGb).toFixed(1));
    data.finds[0].count = Math.max(0, data.finds[0].count - 2);

    const prevSpace = data.effects.spaceGb;
    const prevFiles = data.effects.files;
    data.effects.spaceGb = +(data.effects.spaceGb + gainGb).toFixed(2);
    data.effects.files += 2;
    // cost only updates when cloud cleanup mock is involved
    data.effects.costKrw = 0;

    renderHud();
    renderFinds();
    animateCount($("fxSpace"), prevSpace, data.effects.spaceGb, " GB");
    animateCount($("fxFiles"), prevFiles, data.effects.files, "개");
    animateCount($("overallClean"), data.overallClean - 5, data.overallClean, "%");
    setBar($("overallBar"), data.overallClean);
    if ($("desktopClean")) $("desktopClean").textContent = `${room.clean}%`;

    if (isMiniMode()) {
      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">정리 완료</h3>
          <ul class="util-find-list">
            <li class="util-find-row">
              <div class="util-find-main"><strong>확보한 공간</strong></div>
              <span class="util-find-size">+${data.duplicate.reclaimMb}MB</span>
            </li>
            <li class="util-find-row">
              <div class="util-find-main"><strong>정리한 중복</strong></div>
              <span class="util-find-size">2개</span>
            </li>
          </ul>
          <button class="util-sheet-close" data-action="close-result" type="button">확인</button>
        </div>
      `,
        { util: true }
      );
      return;
    }

    openModal(`
      <h3 class="dialog-title">정리 완료!</h3>
      <div class="result-lines">
        <div class="hud-box"><span>확보 공간</span><strong class="gain">+${data.duplicate.reclaimMb}MB</strong></div>
        <div class="hud-box"><span>Desktop 청결도</span><strong>${from}% → ${to}%</strong></div>
        <div class="hud-box"><span>정리한 중복</span><strong>2개</strong></div>
      </div>
      <div class="modal-actions">
        <button class="px-btn accent" data-action="close-result" type="button">집으로 돌아가기</button>
      </div>
    `);
  }

  function formatReclaim(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
    if (n >= 1024 ** 2) return `${Math.max(1, Math.round(n / 1024 ** 2))}MB`;
    return `${Math.max(1, Math.round(n / 1024))}KB`;
  }

  /** Order-of-magnitude estimates for hackathon demo (not measured CO₂). */
  function estimateCleanupImpact(cleanableGb) {
    const gb = Math.max(0, Number(cleanableGb) || 0);
    // ~0.04 kgCO₂e / GB·year (public estimate order — see docs/README)
    const carbonKg = gb * 0.04;
    // Scale mock social/cloud burden from base 8.7GB → ₩36,000/yr
    const savingKrw = Math.round((gb / 8.7) * (data.summary.savingKrw || 36000));
    return {
      gb,
      carbonKg,
      carbonLabel:
        carbonKg >= 1
          ? `${carbonKg.toFixed(1)} kgCO₂e`
          : `${Math.round(carbonKg * 1000)} gCO₂e`,
      savingKrw,
      savingLabel: `${savingKrw.toLocaleString()}원`,
    };
  }

  function openCleanableImpactModal() {
    const impact = estimateCleanupImpact(data.summary.cleanableGb ?? 8.7);
    openModal(
      `
      <div class="util-sheet">
        <p class="util-tier-badge util-tier-cold">절감 효과</p>
        <h3 class="util-sheet-title">정리하면</h3>
        <p class="util-sheet-lead">
          후보 <strong>${impact.gb}GB</strong>를 비웠을 때 기대할 수 있는 효과예요
        </p>
        <ul class="util-find-list">
          <li class="util-find-row util-impact-row">
            <div class="util-find-main">
              <strong>예상 탄소 절감</strong>
              <small>클라우드 방치 데이터 감소 · 연간 추정</small>
            </div>
            <span class="util-find-size util-impact-num">약 ${impact.carbonLabel}/년</span>
          </li>
          <li class="util-find-row util-impact-row">
            <div class="util-find-main">
              <strong>사회적 절감 비용</strong>
              <small>구독·용량 부담 완화 규모 · 연간 추정</small>
            </div>
            <span class="util-find-size util-impact-num">약 ${impact.savingLabel}/년</span>
          </li>
        </ul>
        <p class="util-sheet-note">
          탄소·비용은 <strong>공개 추정치의 오더</strong>예요. 개인별 실측값이 아닙니다.
        </p>
        <button class="util-sheet-close" data-action="close" type="button">확인</button>
      </div>
    `,
      { util: true }
    );
  }

  function applyMailCleanup(cleanup) {
    const mailFind = data.finds.find((f) => f.id === "mail");

    // Live UI never shows invented demo mail counts
    if (!cleanup || cleanup.demo || cleanup.source === "demo") {
      data.mailCleanup = null;
      if (mailFind) {
        mailFind.label = "메일 정리";
        mailFind.count = 0;
        mailFind.gb = 0;
      }
      renderFinds();
      window.BiumMini?.fillStats?.();
      return;
    }

    data.mailCleanup = cleanup;
    if (mailFind) {
      if (!cleanup.groups?.length) {
        mailFind.label = "메일함 깨끗";
        mailFind.count = 0;
        mailFind.gb = 0;
      } else {
        mailFind.label = "스팸·오래된 안읽음";
        mailFind.count = cleanup.groups.reduce(
          (s, g) => s + (g.count || 0),
          0
        );
        mailFind.gb = +((cleanup.reclaimBytes || 0) / 1024 ** 3).toFixed(1);
      }
    }
    const mailGb = mailFind?.gb || 0;
    if (mailGb > 0) {
      const prev = Number(data.summary.cleanableGb) || 0;
      data.summary.cleanableGb = +Math.max(prev, mailGb).toFixed(1);
    }
    if (data.summary.findCount != null && mailFind?.count) {
      data.summary.findCount = Math.max(
        Number(data.summary.findCount) || 0,
        1
      );
    }
    renderFinds();
    window.BiumMini?.fillStats?.();
  }

  function openMailCleanupModal() {
    const cleanup = data.mailCleanup;
    if (!cleanup) {
      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">메일 정리</h3>
          <p class="util-sheet-lead">Gmail을 연결하면 스팸·90일+ 안읽음을 실제로 봐요</p>
          <p class="util-sheet-note">기기 추가 → Gmail, 또는 설정에서 Google 로그인 후 Gmail을 연결하세요. Cloud Console에 Gmail API가 켜져 있어야 해요.</p>
          <button class="util-sheet-ghost" data-action="open-add-device" type="button">기기 추가</button>
          <button class="util-sheet-close" data-action="close" type="button">닫기</button>
        </div>
      `,
        { util: true }
      );
      return;
    }

    if (!cleanup.groups?.length) {
      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">메일함 상태</h3>
          <p class="util-sheet-lead">${
            cleanup.email
              ? escapeHtml(cleanup.email) + " · "
              : ""
          }스팸·90일+ 안읽음이 거의 없어요</p>
          <p class="util-sheet-note">Gmail API로 확인한 실제 결과예요.</p>
          <button class="util-sheet-close" data-action="close" type="button">확인</button>
        </div>
      `,
        { util: true }
      );
      return;
    }

    const srcNote = cleanup.demo
      ? "데모 수치예요. Gmail을 다시 연결하면 실제 건수로 바뀌어요."
      : cleanup.email
        ? `Gmail · ${escapeHtml(cleanup.email)} · 통수·용량은 API 추정이에요.`
        : "Gmail API로 확인한 실제 추천이에요. 메일은 바로 지우지 않아요.";

    const rows = cleanup.groups
      .map(
        (g) => `
      <li class="util-find-row">
        <div class="util-find-main">
          <strong>${escapeHtml(g.title)}${g.recommended ? " · 추천" : ""}</strong>
          <small>${escapeHtml(g.reason || "")}</small>
        </div>
        <span class="util-find-size">${formatReclaim(g.reclaimBytes)} · ${(g.count || 0).toLocaleString()}통</span>
      </li>`
      )
      .join("");

    openModal(
      `
      <div class="util-sheet">
        <h3 class="util-sheet-title">메일 정리 추천</h3>
        <p class="util-sheet-lead">스팸과 90일+ 안 읽은 메일을 비우면 <strong>+${formatReclaim(cleanup.reclaimBytes)}</strong> 정도 확보할 수 있어요</p>
        <ul class="util-find-list">${rows}</ul>
        <p class="util-sheet-note">${srcNote}</p>
        <div class="util-sheet-actions">
          <button class="util-sheet-close" data-action="mail-clean-ack" type="button">확인했어요</button>
          <button class="util-sheet-ghost" data-action="close" type="button">나중에</button>
        </div>
      </div>
    `,
      { util: true }
    );
  }

  function photoGroups() {
    return data.candidates?.similarPhotos?.groups || [];
  }

  function docGroups() {
    return data.candidates?.similarDocs?.groups || [];
  }

  function coldGroups() {
    return data.candidates?.coldStale?.groups || [];
  }

  function applyCandidates(candidates) {
    if (!candidates || !data) return;
    data.candidates = {
      similarPhotos:
        candidates.similarPhotos ||
        data.candidates?.similarPhotos ||
        { groups: [] },
      similarDocs:
        candidates.similarDocs ||
        data.candidates?.similarDocs ||
        { groups: [] },
      exact: candidates.exact || data.candidates?.exact || { groups: [] },
      coldStale:
        candidates.coldStale ||
        data.candidates?.coldStale || { groups: [] },
    };
    const exact = exactGroups();
    const findDup = data.finds?.find((f) => f.id === "duplicate");
    if (findDup) {
      findDup.count = exact.length;
      findDup.gb = +(
        exact.reduce((s, g) => s + (g.reclaimBytes || 0), 0) /
        1024 ** 3
      ).toFixed(1);
    }
    if (exact[0] && (data.duplicate?.files?.length || 0) < 2) {
      applyPrimary(exact[0]);
    }
    const photos = photoGroups();
    const docs = docGroups();
    const colds = coldGroups();
    const findPhoto = data.finds?.find((f) => f.id === "similar-photos");
    if (findPhoto) {
      findPhoto.count = photos.reduce(
        (s, g) => s + (g.count || g.files?.length || 0),
        0
      );
      findPhoto.gb = +(
        photos.reduce((s, g) => s + (g.reclaimBytes || 0), 0) /
        1024 ** 3
      ).toFixed(2);
    }
    const findDoc = data.finds?.find((f) => f.id === "similar-docs");
    if (findDoc) {
      findDoc.count = docs.reduce(
        (s, g) => s + (g.count || g.files?.length || 0),
        0
      );
    }
    const findCold = data.finds?.find((f) => f.id === "cold-stale");
    if (findCold) {
      findCold.count = colds.reduce(
        (s, g) => s + (g.count || g.files?.length || 0),
        0
      );
      findCold.gb = +(
        colds.reduce((s, g) => s + (g.reclaimBytes || 0), 0) /
        1024 ** 3
      ).toFixed(1);
      findCold.label = "오래 안 연 폴더";
    }
    syncFindCountToSummary();
    renderFinds();
    window.BiumMini?.fillStats?.();
  }

  function openPhotoStackModal(groupId) {
    const groups = photoGroups();
    const group =
      groups.find((g) => g.id === groupId) || groups[0] || null;
    if (!group) {
      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">비슷한 사진</h3>
          <p class="util-sheet-note">아직 비슷한 사진 묶음이 없어요.</p>
          <button class="util-sheet-close" data-action="close" type="button">확인</button>
        </div>
      `,
        { util: true }
      );
      return;
    }
    const rows = (group.files || [])
      .map(
        (f) => `
      <li class="util-find-row">
        <div class="util-find-main">
          <strong>${escapeHtml(f.name)}</strong>
          <small>${escapeHtml(f.place || "")}</small>
        </div>
        <span class="util-find-size">${escapeHtml(f.size || "")}</span>
      </li>`
      )
      .join("");
    const hint = group.pickHint || {};
    openModal(
      `
      <div class="util-sheet">
        <p class="util-tier-badge util-tier-high">높은 유사도</p>
        <h3 class="util-sheet-title">${escapeHtml(group.title || "비슷한 사진")}</h3>
        <p class="util-sheet-lead">${escapeHtml(group.reason || "")}</p>
        <ul class="util-find-list util-stack-list">${rows}</ul>
        <p class="util-sheet-note">
          해상도·용량 추천 · ${escapeHtml(hint.highestRes || hint.sharpest || "—")}<br>
          ${
            hint.eyesOpen == null
              ? `지각 해시 차이 · ${hint.maxDifference != null ? hint.maxDifference : "—"} (낮을수록 더 닮음)`
              : `눈 감음 ${hint.eyesOpen === false ? "있음" : "없음"} · 선명도 · ${escapeHtml(hint.sharpest || "—")}`
          }
        </p>
        ${group.explain ? `<p class="util-sheet-note">${escapeHtml(group.explain)}</p>` : ""}
        <p class="util-sheet-note">추천: <strong>1장 남기기</strong> · 확보 가능 <strong>+${formatReclaim(group.reclaimBytes)}</strong></p>
        <div class="util-sheet-actions">
          <button class="util-sheet-close" data-action="photo-keep" data-keep-n="1" type="button">1장 남기기</button>
          <button class="util-sheet-ghost" data-action="photo-keep" data-keep-n="3" type="button">3장 남기기</button>
          <button class="util-sheet-ghost" data-action="photo-keep" data-keep-n="all" type="button">모두 보기</button>
          <button class="util-sheet-ghost" data-action="open-findings-hub" type="button">뒤로</button>
        </div>
      </div>
    `,
      { util: true }
    );
  }

  function openDocReviewModal(groupId) {
    const groups = docGroups();
    const group =
      groups.find((g) => g.id === groupId) || groups[0] || null;
    if (!group) {
      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">비슷한 문서</h3>
          <p class="util-sheet-note">아직 재확인 후보가 없어요.</p>
          <button class="util-sheet-close" data-action="close" type="button">확인</button>
        </div>
      `,
        { util: true }
      );
      return;
    }
    const pct = Math.round((group.similarity || 0) * 100);
    const similarityLabel =
      group.matchBasis === "filename" ? "제목 유사도" : "본문 유사도";
    const rows = (group.files || [])
      .map(
        (f) => `
      <li class="util-find-row">
        <div class="util-find-main">
          <strong>${escapeHtml(f.name)}</strong>
          <small>${escapeHtml(f.place || "")}${f.modified ? ` · ${escapeHtml(f.modified)}` : ""}</small>
        </div>
        <span class="util-find-size">${escapeHtml(f.size || "")}</span>
      </li>`
      )
      .join("");
    openModal(
      `
      <div class="util-sheet">
        <p class="util-tier-badge util-tier-review">재확인 필요</p>
        <h3 class="util-sheet-title">${escapeHtml(group.title || "비슷한 문서")}</h3>
        <p class="util-sheet-lead">${similarityLabel}: <strong>${pct}%</strong></p>
        <ul class="util-find-list">${rows}</ul>
        <p class="util-sheet-note">${escapeHtml(group.reason || "완전히 같은 파일은 아니에요. 버전 파일일 가능성이 높아요.")}</p>
        ${group.explain ? `<p class="util-sheet-note">${escapeHtml(group.explain)}</p>` : ""}
        <div class="util-sheet-actions">
          <button class="util-sheet-close" data-action="doc-compare" type="button">내용 비교</button>
          <button class="util-sheet-ghost" data-action="doc-gather" type="button">한 폴더에 모으기</button>
          <button class="util-sheet-ghost" data-action="close" type="button">그대로 두기</button>
          <button class="util-sheet-ghost" data-action="open-findings-hub" type="button">뒤로</button>
        </div>
      </div>
    `,
      { util: true }
    );
  }

  function openHibernateModal(groupId) {
    const groups = coldGroups();
    const group =
      groups.find((g) => g.id === groupId) || groups[0] || null;
    if (!group) {
      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">잠재우기</h3>
          <p class="util-sheet-note">오래 안 쓴 데이터 후보가 아직 없어요.</p>
          <button class="util-sheet-close" data-action="close" type="button">확인</button>
        </div>
      `,
        { util: true }
      );
      return;
    }
    const gb = (Number(group.reclaimBytes) || 0) / 1024 ** 3;
    const impact = estimateCleanupImpact(gb);
    const countLabel = (group.count || group.files?.length || 0).toLocaleString();
    const rows = (group.files || [])
      .slice(0, 6)
      .map(
        (f) => `
      <li class="util-find-row">
        <div class="util-find-main">
          <strong>${escapeHtml(f.name)}</strong>
          <small>${escapeHtml(f.place || "")}${
            f.lastOpened ? ` · 마지막 ${escapeHtml(f.lastOpened)}` : ""
          }</small>
        </div>
        <span class="util-find-size">${escapeHtml(f.size || "")}</span>
      </li>`
      )
      .join("");
    openModal(
      `
      <div class="util-sheet">
        <p class="util-tier-badge util-tier-cold">오래 안 연 폴더</p>
        <h3 class="util-sheet-title">${escapeHtml(group.title || "오래 안 쓴 데이터")}</h3>
        <p class="util-sheet-lead">${escapeHtml(
          group.reason ||
            "오래 열지 않은 데이터예요. 지우기 불안하면 잠재워 둘까요?"
        )}</p>
        <p class="util-sheet-note util-cold-meta">
          <strong>${formatReclaim(group.reclaimBytes)}</strong>
          · ${escapeHtml(group.place || "클라우드")}
          · ${countLabel}개
          ${group.idleLabel ? ` · ${escapeHtml(group.idleLabel)}` : ""}
        </p>
        <ul class="util-find-list">${rows}</ul>
        ${
          group.explain
            ? `<p class="util-sheet-note">${escapeHtml(group.explain)}</p>`
            : ""
        }
        <p class="util-sheet-note">
          잠재우면 Standard 대신 저빈도 보관으로 분류해요.
          급하지 않은 이동은 <strong>전력이 더 친환경적인 시간</strong>에 처리할 수 있어요.
          (연간 추정 여지 약 ${impact.carbonLabel})
        </p>
        <div class="util-sheet-actions util-cold-actions">
          <button class="util-sheet-ghost" data-action="cold-leave" type="button">그대로 두기</button>
          <button class="util-sheet-close" data-action="cold-hibernate" type="button">잠재우기</button>
          <button class="util-sheet-ghost" data-action="cold-clean" type="button">정리하기</button>
          <button class="util-sheet-ghost" data-action="open-findings-hub" type="button">뒤로</button>
        </div>
      </div>
    `,
      { util: true }
    );
  }

  /** Open the highest-priority actionable candidate, skipping the hub. */
  function openTopFinding() {
    if (photoGroups().length) {
      openPhotoStackModal();
      return;
    }
    if (docGroups().length) {
      openDocReviewModal();
      return;
    }
    if (
      exactGroups().length ||
      (data.duplicate?.files?.length || 0) >= 2
    ) {
      openExactDupList();
      return;
    }
    if (data.mailCleanup?.groups?.length) {
      openMailCleanupModal();
      return;
    }
    if (coldGroups().length) {
      openHibernateModal();
      return;
    }
    openFindingsHub();
  }

  function openFindingsHub() {
    const exact = exactGroups();
    const hasDup =
      exact.length > 0 || (data.duplicate?.files?.length || 0) >= 2;
    const photos = photoGroups();
    const docs = docGroups();
    const colds = coldGroups();
    const hasPhotos = photos.length > 0;
    const hasDocs = docs.length > 0;
    const hasCold = colds.length > 0;
    const hasMail = !!(data.mailCleanup?.groups?.length);
    syncFindCountToSummary();

    if (!hasDup && !hasPhotos && !hasDocs && !hasCold && !hasMail) {
      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">발견한 항목</h3>
          <p class="util-sheet-note">아직 가져온 발견이 없어요. 탐색을 시작해 보세요.</p>
          <button class="util-sheet-close" data-action="close" type="button">확인</button>
        </div>
      `,
        { util: true }
      );
      return;
    }

    const dupN = exact.length || (hasDup ? 1 : 0);
    const dupFiles = exact.reduce(
      (s, g) => s + (g.files?.length || 0),
      0
    ) || data.duplicate?.files?.length || 0;
    const photoN = photos.reduce((s, g) => s + (g.count || g.files?.length || 0), 0);
    const docN = docs.reduce((s, g) => s + (g.count || g.files?.length || 0), 0);
    const coldGb = +(
      colds.reduce((s, g) => s + (g.reclaimBytes || 0), 0) /
      1024 ** 3
    ).toFixed(1);
    const coldN = colds.reduce(
      (s, g) => s + (g.count || g.files?.length || 0),
      0
    );
    const mailN = hasMail
      ? data.mailCleanup.groups.reduce((s, g) => s + (g.count || 0), 0)
      : 0;

    // Priority: similar photos → docs → exact → cold → mail
    const options = [
      hasPhotos
        ? `
          <button class="util-option is-on" type="button" data-action="open-photo-find">
            <span class="util-option-ico" aria-hidden="true">🖼</span>
            <span class="util-option-text">
              <strong>비슷한 사진</strong>
              <small>거의 같은 컷 ${photoN}장 · 대표만 남겨볼까요</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>`
        : "",
      hasDocs
        ? `
          <button class="util-option" type="button" data-action="open-doc-find">
            <span class="util-option-ico" aria-hidden="true">📄</span>
            <span class="util-option-text">
              <strong>비슷한 문서</strong>
              <small>최종·수정본 같아요 · ${docN}개 · 같이 확인해 주세요</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>`
        : "",
      hasDup
        ? `
          <button class="util-option" type="button" data-action="open-dup-find">
            <span class="util-option-ico" aria-hidden="true">⧉</span>
            <span class="util-option-text">
              <strong>똑같은 파일</strong>
              <small>내용이 같은 묶음 ${dupN}개 · 파일 ${dupFiles}개</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>`
        : "",
      hasCold
        ? `
          <button class="util-option" type="button" data-action="open-cold-find">
            <span class="util-option-ico" aria-hidden="true">☾</span>
            <span class="util-option-text">
              <strong>오래 안 연 폴더</strong>
              <small>${coldGb}GB · ${coldN.toLocaleString()}개 · 지우기 전에 잠재울 수도 있어요</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>`
        : "",
      hasMail
        ? `
          <button class="util-option" type="button" data-action="open-mail-find">
            <span class="util-option-ico" aria-hidden="true">✉</span>
            <span class="util-option-text">
              <strong>메일 정리</strong>
              <small>스팸·오래된 안 읽은 메일 ${mailN.toLocaleString()}통</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>`
        : "",
    ]
      .filter(Boolean)
      .join("");

    openModal(
      `
      <div class="util-sheet">
        <h3 class="util-sheet-title">이거 한번 봐줄래요?</h3>
        <p class="util-sheet-lead">확실한 것부터, 천천히 골라보면 돼요</p>
        <div class="util-options">${options}</div>
        <button class="util-sheet-ghost" data-action="close" type="button">닫기</button>
      </div>
    `,
      { util: true }
    );
  }

  function openSimpleFind(kind) {
    if (kind === "mail") {
      openMailCleanupModal();
      return;
    }
    if (kind === "similar-photos" || kind === "photos") {
      openPhotoStackModal();
      return;
    }
    if (kind === "similar-docs" || kind === "docs") {
      openDocReviewModal();
      return;
    }
    if (kind === "cold-stale" || kind === "stale" || kind === "hibernate") {
      openHibernateModal();
      return;
    }
    if (kind === "duplicate") {
      openDuplicateModal();
      return;
    }
    const map = {
      old: {
        title: "오래된 파일 상자",
        body: "2년 이상 열지 않은 파일이 있어요. 오래됐다는 이유만으로 지우지 않아요.",
        gb: "12.4GB",
        count: "851개",
      },
      large: {
        title: "큰 파일 더미",
        body: "오랫동안 사용하지 않은 큰 파일을 발견했어요.",
        gb: "10.2GB",
        count: "56개",
      },
    };
    const item = map[kind];
    if (!item) return;
    openModal(`
      <h3 class="dialog-title">${item.title}</h3>
      <p class="dialog-sub">${item.body}</p>
      <p class="modal-note">${item.gb} · ${item.count}</p>
      <div class="modal-actions row">
        <button class="px-btn accent" data-action="close" type="button">파일 확인</button>
        <button class="px-btn ghost" data-action="close" type="button">나중에 보기</button>
        <span></span>
      </div>
    `);
  }

  function resumeHomeChrome() {
    if (window.BiumMode?.getMode() === "home") {
      agent.idle();
      startTour();
    } else {
      stopTour();
    }
  }

  function onModalClick(e) {
    const connectSpace = e.target.closest("[data-connect-space]");
    if (connectSpace && !connectSpace.disabled) {
      const id = connectSpace.dataset.connectSpace;
      closeModal();
      (async () => {
        try {
          if (id === "gmail" || id === "mail") {
            window.BiumMini?.setAgent?.(
              "🐾 Gmail 권한을 확인하는 중… 브라우저 로그인이 열릴 수 있어요"
            );
          }
          const res = await window.biumDesktop?.connectSpace?.(id);
          window.BiumMini?.fillStats?.();

          if (res?.needClientId || res?.needClientSecret) {
            window.BiumMini?.setAgent?.(
              `🐾 ${res.error || "Google Client ID가 필요해요"}`
            );
            openGoogleClientSettings();
            return;
          }

          if (window.BiumMini?.setAgent) {
            window.BiumMini.setAgent(
              res?.ok === false
                ? `🐾 ${res.error || "연결 실패"}`
                : `🐾 ${res?.message || "연결했어요"}`
            );
          }
          if (res?.ok === false) return;

          // refresh from IPC broadcast / getConnections
          const con = await window.biumDesktop?.getConnections?.();
          if (con?.spaces?.length && window.DigitalHomeData) {
            window.DigitalHomeData.spaces = con.spaces.map((s) => ({
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
            window.BiumMini?.fillStats?.();
          }
          if (res?.mailCleanup) applyMailCleanup(res.mailCleanup);
          else if (con?.mailCleanup) applyMailCleanup(con.mailCleanup);
          if (id === "gmail" || id === "mail") {
            openMailCleanupModal();
          }
        } catch (err) {
          window.BiumMini?.setAgent?.(
            `🐾 ${err.message || "연결하지 못했어요"}`
          );
        }
      })();
      return;
    }

    const modePick = e.target.closest("[data-mode-pick]");
    if (modePick) {
      const mode = modePick.dataset.modePick;
      window.BiumMode?.setMode(mode);
      closeModal();
      resumeHomeChrome();
      return;
    }

    const petPick = e.target.closest("[data-pet-pick]");
    if (petPick) {
      window.BiumPet?.setId(petPick.dataset.petPick);
      closeModal();
      return;
    }

    const deskToggle = e.target.closest("[data-pet-desktop-toggle]");
    if (deskToggle) {
      const next = !deskToggle.classList.contains("is-on");
      deskToggle.classList.toggle("is-on", next);
      deskToggle.setAttribute("aria-checked", next ? "true" : "false");
      window.biumDesktop?.petVisible?.(next);
      return;
    }

    const themePick = e.target.closest("[data-theme-pick]");
    if (themePick) {
      const theme = themePick.dataset.themePick;
      applyTheme(theme);
      window.biumDesktop?.setConfig?.({ theme });
      $("modalRoot")
        ?.querySelectorAll("[data-theme-pick]")
        .forEach((el) => {
          el.classList.toggle("is-on", el === themePick);
        });
      return;
    }

    const keepToggle = e.target.closest("[data-keep-idx]");
    if (keepToggle) {
      const p = pathForKeepIdx(keepToggle.dataset.keepIdx);
      if (!p) return;
      if (state.selectedKeeps.has(p)) {
        // Don't allow clearing the last keep target via toggle — user can pick another first
        if (state.selectedKeeps.size <= 1) {
          updateKeepSelectionUi();
          const reason = $("keepReason");
          if (reason) {
            reason.textContent =
              "최소 한 곳은 남겨야 해요. 다른 곳을 켠 뒤 끌 수 있어요.";
          }
          return;
        }
        state.selectedKeeps.delete(p);
      } else {
        state.selectedKeeps.add(p);
      }
      state.selectedKeep = [...state.selectedKeeps][0] || null;
      updateKeepSelectionUi();
      return;
    }

    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "close") {
      closeModal();
      resumeHomeChrome();
    }
    if (action === "open-dup-find") {
      openExactDupList();
      return;
    }
    if (action === "open-exact-group") {
      const id = e.target.closest("[data-group-id]")?.dataset?.groupId;
      const groups = exactGroups();
      const group =
        groups.find((g) => String(g.id) === String(id)) ||
        groups[Number(id)] ||
        null;
      if (group) applyPrimary(group);
      openDuplicateModal();
      return;
    }
    if (action === "open-photo-find") {
      openPhotoStackModal();
      return;
    }
    if (action === "open-doc-find") {
      openDocReviewModal();
      return;
    }
    if (action === "open-cold-find") {
      openHibernateModal();
      return;
    }
    if (action === "open-findings-hub") {
      openFindingsHub();
      return;
    }
    if (action === "cold-leave") {
      window.BiumMini?.setAgent?.("🐾 그대로 둘게. 필요할 때 다시 볼게");
      closeModal();
      resumeHomeChrome();
      return;
    }
    if (action === "cold-hibernate") {
      window.BiumMini?.setAgent?.(
        "🐾 잠재워 둘게. 급하지 않아서 저탄소 시간에 옮길게"
      );
      closeModal();
      resumeHomeChrome();
      return;
    }
    if (action === "cold-clean") {
      window.BiumMini?.setAgent?.(
        "🐾 정리 후보로 표시해 둘게. 지우기 전에 한 번 더 확인하자"
      );
      closeModal();
      resumeHomeChrome();
      return;
    }
    if (action === "photo-keep") {
      const n = e.target.closest("[data-action]")?.dataset.keepN || "1";
      if (n === "all") {
        window.BiumMini?.setAgent?.("🐾 사진 스택을 모두 남겨둘게요");
      } else {
        window.BiumMini?.setAgent?.(
          `🐾 비슷한 사진 중 ${n}장만 남기도록 추천했어요`
        );
      }
      closeModal();
      resumeHomeChrome();
      return;
    }
    if (action === "doc-compare") {
      window.BiumMini?.setAgent?.(
        "🐾 완전히 같다고 단정하지 않고 비교만 추천해요"
      );
      closeModal();
      resumeHomeChrome();
      return;
    }
    if (action === "doc-gather") {
      window.BiumMini?.setAgent?.("🐾 버전 후보를 한곳에 모아두라고 표시했어요");
      closeModal();
      resumeHomeChrome();
      return;
    }
    if (action === "open-mail-find" || action === "mail-clean-ack") {
      if (action === "mail-clean-ack") {
        window.BiumMini?.setAgent?.("🐾 메일 정리 추천을 확인했어요");
        window.BiumMini?.refreshFindCount?.();
      }
      if (action === "open-mail-find") {
        openMailCleanupModal();
        return;
      }
      closeModal();
      resumeHomeChrome();
      return;
    }
    if (action === "close-result") {
      closeModal();
      if (window.BiumMode?.getMode() === "home") {
        agent.sprite.setState("happy");
        agent.setSpeech(data.speeches.happy);
        agent.setStatus("정리 완료!");
        setTimeout(() => {
          agent.idle();
          startTour();
        }, 1200);
      }
    }
    if (action === "open-add-device") {
      openAddDevice();
      return;
    }
    if (action === "connect-gmail") {
      closeModal();
      (async () => {
        try {
          window.BiumMini?.setAgent?.(
            "🐾 Gmail 권한을 확인하는 중… 브라우저 로그인이 열릴 수 있어요"
          );
          const res = await window.biumDesktop?.connectSpace?.("gmail");
          if (res?.needClientId || res?.needClientSecret) {
            window.BiumMini?.setAgent?.(
              `🐾 ${res.error || "Google Client ID가 필요해요"}`
            );
            openGoogleClientSettings();
            return;
          }
          window.BiumMini?.setAgent?.(
            res?.ok === false
              ? `🐾 ${res.error || "Gmail 연결 실패"}`
              : `🐾 ${res?.message || "Gmail을 연결했어요"}`
          );
          if (res?.ok === false) return;
          if (res?.mailCleanup) applyMailCleanup(res.mailCleanup);
          openMailCleanupModal();
        } catch (err) {
          window.BiumMini?.setAgent?.(
            `🐾 ${err.message || "Gmail 연결 실패"}`
          );
        }
      })();
      return;
    }
    if (action === "open-google-client") {
      openGoogleClientSettings();
      return;
    }
    if (action === "clear-google-client") {
      (async () => {
        try {
          await window.biumDesktop?.setConfig?.({
            googleClientId: "",
            googleClientSecret: "",
          });
          try {
            await window.biumDesktop?.disconnectSpace?.("gdrive");
          } catch {
            /* ignore */
          }
          window.BiumMini?.setAgent?.(
            "🐾 Google OAuth 정보를 지웠어요. Drive는 데모로 연결돼요"
          );
          closeModal();
        } catch (err) {
          window.BiumMini?.setAgent?.(
            `🐾 ${err.message || "삭제에 실패했어요"}`
          );
        }
      })();
      return;
    }
    if (action === "save-google-client") {
      const idInput = $("googleClientIdInput");
      const secretInput = $("googleClientSecretInput");
      const id = (idInput?.value || "").trim();
      const secret = (secretInput?.value || "").trim();
      const keepExistingId = idInput?.dataset?.keepExisting === "1";
      const keepExistingSecret =
        secretInput?.dataset?.keepExisting === "1";
      (async () => {
        try {
          if (!id && !keepExistingId) {
            window.BiumMini?.setAgent?.(
              "🐾 Client ID를 붙여넣은 뒤 저장해 주세요"
            );
            return;
          }
          if (!secret && !keepExistingSecret) {
            window.BiumMini?.setAgent?.(
              "🐾 Desktop OAuth Client Secret도 붙여넣어 주세요"
            );
            return;
          }
          const nextConfig = {};
          if (id) nextConfig.googleClientId = id;
          if (secret) nextConfig.googleClientSecret = secret;
          if (Object.keys(nextConfig).length) {
            await window.biumDesktop?.setConfig?.(nextConfig);
          }
          if (idInput) {
            idInput.value = "";
            idInput.dataset.keepExisting = "1";
          }
          if (secretInput) {
            secretInput.value = "";
            secretInput.dataset.keepExisting = "1";
          }
          closeModal();
          window.BiumMini?.setAgent?.(
            "🐾 OAuth 정보를 저장했어요. Google 로그인 창에서 권한을 승인해 주세요"
          );
          try {
            await window.biumDesktop?.disconnectSpace?.("gdrive");
          } catch {
            /* ignore */
          }
          const res = await window.biumDesktop?.connectSpace?.("gdrive");
          if (res?.ok === false) {
            window.BiumMini?.setAgent?.(
              `🐾 ${res.error || "Google 로그인을 시작하지 못했어요"}`
            );
            return;
          }
          window.BiumMini?.setAgent?.(
            `🐾 ${res?.message || "Google Drive를 연결했어요"}`
          );
          window.BiumMini?.fillStats?.();
        } catch (err) {
          window.BiumMini?.setAgent?.(
            `🐾 ${err.message || "저장에 실패했어요"}`
          );
        }
      })();
      return;
    }
    if (action === "save-naver-mail") {
      const email = ($("naverEmailInput")?.value || "").trim();
      const appPassword = ($("naverAppPasswordInput")?.value || "").trim();
      (async () => {
        try {
          if (!email || !appPassword) {
            window.BiumMini?.setAgent?.(
              "🐾 네이버 이메일과 애플리케이션 비밀번호를 넣어 주세요"
            );
            return;
          }
          const res = await window.biumDesktop?.saveNaverCredentials?.({
            email,
            appPassword,
          });
          if (res?.ok === false) {
            window.BiumMini?.setAgent?.(
              `🐾 ${res.error || "저장에 실패했어요"}`
            );
            return;
          }
          window.BiumMini?.setAgent?.(
            res?.tested
              ? "🐾 네이버 IMAP 연결됐어요. 탐색하면 첨부를 맞춰 봐요"
              : `🐾 ${res?.warning || "저장했어요. IMAP 설정을 확인해 주세요"}`
          );
          closeModal();
        } catch (err) {
          window.BiumMini?.setAgent?.(
            `🐾 ${err.message || "저장에 실패했어요"}`
          );
        }
      })();
      return;
    }
    if (action === "keep-one") openKeepWhere();
    if (action === "back-dup") {
      if (exactGroups().length > 1) openExactDupList();
      else openDuplicateModal();
    }
    if (action === "confirm-keep") {
      const keepPaths = [...state.selectedKeeps].filter(Boolean);
      const files = data.duplicate?.files || [];
      const reason = $("keepReason");
      if (!keepPaths.length) {
        if (reason) {
          reason.textContent = "먼저 남길 위치를 하나 이상 선택해 주세요.";
        }
        return;
      }
      if (keepPaths.length >= files.length) {
        window.BiumMini?.setAgent?.("🐾 모든 위치를 남겨둘게요");
        closeModal();
        resumeHomeChrome();
        return;
      }
      if (reason) {
        reason.textContent = `${keepPaths.length}곳에 남기고 사본을 정리하는 중…`;
      }
      (async () => {
        try {
          const res = await window.biumDesktop?.keepOne?.({
            keepPaths,
            keepPath: keepPaths[0],
            files,
          });
          if (res && res.ok === false && res.error) {
            if (reason) reason.textContent = res.error;
            window.BiumMini?.setAgent?.(
              `🐾 ${res.error || "일부 사본을 정리하지 못했어요"}`
            );
            if (!res.trashed?.length) return;
          }
          const n = res?.trashed?.length || 0;
          const skipped = res?.skipped?.length || 0;
          const keptN = res?.kept?.length || keepPaths.length;
          window.BiumMini?.setAgent?.(
            n
              ? `🐾 ${keptN}곳 남기고 ${n}개 사본 정리${skipped ? ` · ${skipped}개 건너뜀` : ""}`
              : `🐾 ${res?.message || "정리했어요"}`
          );
          await finishCleanup();
        } catch (err) {
          if (reason) {
            reason.textContent =
              err.message || "정리에 실패했어요. 권한·연결을 확인해 주세요.";
          }
          window.BiumMini?.setAgent?.(
            `🐾 ${err.message || "정리에 실패했어요"}`
          );
        }
      })();
    }
  }

  async function openAddDevice() {
    try {
      const con = await window.biumDesktop?.getConnections?.();
      if (con?.spaces?.length && window.DigitalHomeData) {
        window.DigitalHomeData.spaces = con.spaces.map((s) => ({
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
      }
      if (con?.mailCleanup) applyMailCleanup(con.mailCleanup);
    } catch {
      /* ignore */
    }

    const spaces = window.DigitalHomeData?.spaces || [];
    const byId = Object.fromEntries(spaces.map((s) => [s.id, s]));
    const catalog = [
      {
        id: "windows-peer",
        name: "Windows Desktop",
        desc: "같은 네트워크의 PC",
        ico: "🖥",
      },
      {
        id: "gdrive",
        name: "Google Drive",
        desc: "클라우드 저장소",
        ico: "☁",
      },
      {
        id: "naver-mail",
        name: "네이버 메일",
        desc: "IMAP · 오래된 첨부·교차 중복",
        ico: "✉",
      },
      {
        id: "gmail",
        name: "Gmail",
        desc: "실제 스팸 · 90일+ 안읽음 (Gmail API)",
        ico: "✉",
      },
      {
        id: "onedrive",
        name: "OneDrive",
        desc: "클라우드 저장소",
        ico: "☁",
      },
    ];

    const options = catalog
      .map((c) => {
        const cur = byId[c.id];
        const on = !!cur?.connected;
        return `
          <button class="util-option ${on ? "is-on" : ""}" type="button" data-connect-space="${c.id}" ${on ? "disabled" : ""}>
            <span class="util-option-ico" aria-hidden="true">${c.ico}</span>
            <span class="util-option-text">
              <strong>${c.name}${on ? " · 연결됨" : ""}</strong>
              <small>${c.desc}</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>`;
      })
      .join("");

    openModal(
      `
      <div class="util-sheet">
        <h3 class="util-sheet-title">기기 추가</h3>
        <p class="util-sheet-lead">탐색에 포함할 공간을 연결하세요</p>
        <div class="util-options">${options}</div>
        <button class="util-sheet-ghost" data-action="close" type="button">닫기</button>
      </div>
    `,
      { util: true }
    );
  }

  function normalizeTheme(theme) {
    return theme === "noir" ? "noir" : "cozy";
  }

  function applyTheme(theme) {
    const t = normalizeTheme(theme);
    document.documentElement.dataset.theme = t;
    document.body.dataset.theme = t;
    try {
      localStorage.setItem("bium-theme", t);
    } catch {
      /* ignore */
    }
    return t;
  }

  async function loadTheme() {
    let theme = "cozy";
    try {
      const saved = localStorage.getItem("bium-theme");
      if (saved) theme = saved;
    } catch {
      /* ignore */
    }
    try {
      const cfg = await window.biumDesktop?.getConfig?.();
      if (cfg?.theme) theme = cfg.theme;
    } catch {
      /* browser prototype */
    }
    return applyTheme(theme);
  }

  function googleGIconSvg() {
    return `<svg class="btn-google-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>`;
  }

  function googleSignInButton({ action = "save-google-client", label = "Google로 로그인" } = {}) {
    return `
      <button class="btn-google" data-action="${escapeHtml(action)}" type="button">
        ${googleGIconSvg()}
        <span class="btn-google-label">${escapeHtml(label)}</span>
      </button>`;
  }

  function naverConnectButton({
    action = "save-naver-mail",
    label = "네이버로 연결",
  } = {}) {
    return `
      <button class="btn-naver" data-action="${escapeHtml(action)}" type="button">
        <span class="btn-naver-mark" aria-hidden="true">N</span>
        <span class="btn-naver-label">${escapeHtml(label)}</span>
      </button>`;
  }

  async function openGoogleClientSettings() {
    let hasId = false;
    let hasSecret = false;
    let hint = "";
    try {
      const cfg = await window.biumDesktop?.getConfig?.();
      hasId = !!cfg?.hasGoogleClientId;
      hasSecret = !!cfg?.hasGoogleClientSecret;
      hint = cfg?.googleClientIdHint || "";
    } catch {
      /* browser prototype */
    }
    openModal(
      `
      <div class="util-sheet">
        <h3 class="util-sheet-title">Google Drive 연결</h3>
        <p class="util-sheet-lead">${hasId && hasSecret ? "저장된 OAuth 정보로 로그인" : "Desktop OAuth 정보 입력 후 로그인"}</p>
        <p class="util-sheet-note">${
          hasId && hasSecret
            ? `ID 저장됨 · <span class="util-secret">${escapeHtml(hint)}</span> · Secret도 암호화되어 있어요.`
            : hasId
              ? `ID 저장됨 · <span class="util-secret">${escapeHtml(hint)}</span> · 아래에 Client Secret을 추가해 주세요.`
              : "Google Cloud Console의 Desktop 앱 Client ID와 Client Secret을 붙여넣으세요."
        }</p>
        <p class="util-sheet-note">Client ID</p>
        <input
          class="util-input"
          id="googleClientIdInput"
          type="password"
          spellcheck="false"
          autocomplete="new-password"
          data-keep-existing="${hasId ? "1" : "0"}"
          placeholder="${hasId ? "바꾸려면 새 Client ID 붙여넣기" : "xxxx.apps.googleusercontent.com"}"
          value=""
        />
        <p class="util-sheet-note">Client Secret</p>
        <input
          class="util-input"
          id="googleClientSecretInput"
          type="password"
          spellcheck="false"
          autocomplete="new-password"
          data-keep-existing="${hasSecret ? "1" : "0"}"
          placeholder="${hasSecret ? "저장됨 · 바꾸려면 새 Secret 붙여넣기" : "GOCSPX-..."}"
          value=""
        />
        ${googleSignInButton({
          action: "save-google-client",
          label:
            hasId && hasSecret
              ? "Google로 로그인"
              : "저장하고 Google로 로그인",
        })}
        ${
          hasId || hasSecret
            ? `<button class="util-sheet-ghost" data-action="clear-google-client" type="button">OAuth 정보 삭제</button>`
            : ""
        }
        <button class="util-sheet-ghost" data-action="close" type="button">닫기</button>
      </div>
    `,
      { util: true }
    );
    requestAnimationFrame(() => {
      $("googleClientIdInput")?.focus();
    });
  }

  async function openDisplaySettings() {
    const petId = window.BiumPet?.getId() || "neko";
    let petOnDesktop = true;
    let theme = normalizeTheme(document.documentElement.dataset.theme || "cozy");
    let hasGoogleId = false;
    let googleHint = "";
    let naverEmail = "";
    let hasNaver = false;
    try {
      const st = await window.biumDesktop?.scanStatus?.();
      if (typeof st?.desktopPet === "boolean") petOnDesktop = st.desktopPet;
      else if (typeof st?.petVisible === "boolean") petOnDesktop = st.petVisible;
      const cfg = await window.biumDesktop?.getConfig?.();
      if (cfg?.theme) theme = normalizeTheme(cfg.theme);
      hasGoogleId = !!cfg?.hasGoogleClientId;
      googleHint = cfg?.googleClientIdHint || "";
      if (cfg?.naverEmail) naverEmail = cfg.naverEmail;
      if (cfg?.hasNaverCredentials) hasNaver = true;
    } catch {
      /* browser prototype */
    }
    openModal(
      `
      <div class="util-sheet">
        <h3 class="util-sheet-title">설정</h3>
        <p class="util-sheet-label">테마</p>
        <div class="util-options">
          <button class="util-option ${theme === "cozy" ? "is-on" : ""}" type="button" data-theme-pick="cozy">
            <span class="util-theme-swatch" data-swatch="cozy" aria-hidden="true"></span>
            <span class="util-option-text">
              <strong>Cozy Home</strong>
              <small>따뜻한 크림 톤</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>
          <button class="util-option ${theme === "noir" ? "is-on" : ""}" type="button" data-theme-pick="noir">
            <span class="util-theme-swatch" data-swatch="noir" aria-hidden="true"></span>
            <span class="util-option-text">
              <strong>Midnight</strong>
              <small>블루 · 블랙 모던</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>
        </div>
        <p class="util-sheet-label">바탕화면</p>
        <div class="util-options">
          <button
            class="util-toggle ${petOnDesktop ? "is-on" : ""}"
            type="button"
            role="switch"
            aria-checked="${petOnDesktop ? "true" : "false"}"
            data-pet-desktop-toggle
          >
            <span class="util-option-text">
              <strong>노트북에서 돌아다니기</strong>
              <small>바탕화면에 펫을 보여요</small>
            </span>
            <span class="util-switch" aria-hidden="true"><i></i></span>
          </button>
        </div>
        <p class="util-sheet-label">Pet</p>
        <div class="util-options">
          <button class="util-option ${petId === "neko" ? "is-on" : ""}" type="button" data-pet-pick="neko">
            <span class="util-option-ico" aria-hidden="true">🐈</span>
            <span class="util-option-text">
              <strong>Neko</strong>
              <small>고전 데스크탑 고양이</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>
          <button class="util-option ${petId === "retriever" ? "is-on" : ""}" type="button" data-pet-pick="retriever">
            <span class="util-option-ico" aria-hidden="true">🐕</span>
            <span class="util-option-text">
              <strong>강아지</strong>
              <small>하얀 금모 퍼피</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>
        </div>
        <p class="util-sheet-label">Google 연결</p>
        <p class="util-sheet-note">${
          hasGoogleId
            ? `저장됨 · <span class="util-secret">${escapeHtml(googleHint)}</span>`
            : "Drive를 쓰려면 Google 계정으로 연결하세요."
        }</p>
        ${googleSignInButton({
          action: "open-google-client",
          label: hasGoogleId ? "Google로 로그인" : "Google로 계속하기",
        })}
        ${
          hasGoogleId
            ? `<button class="util-sheet-ghost" data-action="open-google-client" type="button">Client ID 변경</button>`
            : ""
        }
        <p class="util-sheet-label">Gmail 정리</p>
        <p class="util-sheet-note">같은 Google 계정으로 스팸함·90일 이상 안 읽은 메일 건수를 불러와요. Cloud Console에서 Gmail API를 켜 두세요.</p>
        <button class="btn-google" data-action="connect-gmail" type="button">
          ${googleGIconSvg()}
          <span class="btn-google-label">Gmail 연결 · 정리 추천</span>
        </button>
        <p class="util-sheet-label">네이버 메일 (IMAP)</p>
        <p class="util-sheet-note">메일 설정에서 IMAP 사용함 + 2단계 인증 앱 비밀번호가 필요해요. 일반 비밀번호는 저장하지 않아요.${hasNaver ? " · 저장됨" : ""}</p>
        <input
          class="util-input"
          id="naverEmailInput"
          type="email"
          spellcheck="false"
          autocomplete="username"
          placeholder="example@naver.com"
          value="${escapeHtml(naverEmail)}"
        />
        <input
          class="util-input"
          id="naverAppPasswordInput"
          type="password"
          autocomplete="new-password"
          placeholder="애플리케이션 비밀번호"
          value=""
        />
        <div class="util-sheet-actions">
          ${naverConnectButton({
            action: "save-naver-mail",
            label: hasNaver ? "네이버 연결 업데이트" : "네이버로 연결",
          })}
          <button class="util-sheet-close" data-action="close" type="button">닫기</button>
        </div>
      </div>
    `,
      { util: true }
    );
  }

  function bind() {
    $("btnExplore").addEventListener("click", () => runDuplicateFlow());
    $("btnReviewOne").addEventListener("click", () => runDuplicateFlow());
    $("btnSettings")?.addEventListener("click", () => openDisplaySettings());
    $("btnHelp")?.addEventListener("click", () => {
      openModal(`
        <h3 class="dialog-title">도움말</h3>
        <p class="dialog-sub">메뉴바 Mini는 관리용 상태 화면, 둘러보기는 픽셀 디지털 집이에요.</p>
        <p class="modal-note">Desktop Pet이 실제 바탕화면을 돌아다니며 중복을 찾아옵니다.</p>
        <div class="modal-actions">
          <button class="px-btn accent" data-action="close" type="button">확인</button>
        </div>
      `);
    });
    $("btnBackMini")?.addEventListener("click", () => {
      stopTour();
      closeModal();
      window.BiumMode?.setMode("mini");
    });

    document.addEventListener("bium:mini-open-find", (e) => {
      const id = e.detail?.id;
      if (!id) return;
      if (id === "duplicate") {
        openDuplicateModal();
        return;
      }
      openSimpleFind(id === "large" ? "large" : id);
    });

    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const tool = btn.dataset.tool;
        stopTour();
        if (tool === "duplicate") {
          runDuplicateFlow();
          return;
        }
        const room = tool === "mail" ? "mail" : tool === "large" ? "desktop" : "laptop";
        await agent.go(room, { speech: data.speeches[room], status: "도구로 탐색 중" });
        await agent.search(room);
        openSimpleFind(tool);
      });
    });

    document.querySelectorAll(".room-pane, .mailbox-row").forEach((el) => {
      el.addEventListener("click", async () => {
        if (agent.busy) return;
        stopTour();
        const id = el.dataset.room;
        await agent.go(id, { speech: data.speeches[id], status: `${data.rooms[id].label}` });
        agent.idle(`${data.rooms[id].label}에 있어요`);
        startTour();
      });
    });

    $("findList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-find]");
      if (!btn) return;
      const id = btn.dataset.find;
      if (id === "duplicate") runDuplicateFlow();
      else openSimpleFind(id);
    });

    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (btn.dataset.nav !== "home") {
          agent.setStatus(`${btn.textContent.trim()} 화면은 준비 중`);
        }
      });
    });

    $("modalRoot").addEventListener("click", onModalClick);
    $("modalLayer").addEventListener("click", (e) => {
      if (e.target === $("modalLayer")) {
        closeModal();
        startTour();
      }
    });
  }

  window.BiumApp = {
    openDisplaySettings,
    openGoogleClientSettings,
    openAddDevice,
    applyMailCleanup,
    openMailCleanupModal,
    openFindingsHub,
    openTopFinding,
    openExactDupList,
    applyCandidates,
    applyExactGroups,
    syncFindCountToSummary,
    computeFindCount,
    openPhotoStackModal,
    openDocReviewModal,
    openHibernateModal,
    openDuplicatesFromMini: () => {
      // Keep Mini open — show which files are duplicates
      openDuplicateModal();
    },
    openCleanableImpactFromMini: () => {
      openCleanableImpactModal();
    },
    openDuplicateFromMini: () => {
      // Keep Mini open — modal overlays the popover (no rescan)
      openFindingsHub();
    },
    openHome: () => window.BiumMode?.setMode("home"),
    openMini: () => {
      stopTour();
      closeModal();
      return window.BiumMode?.setMode("mini");
    },
  };

  async function boot() {
    await loadTheme();
    await window.biumDesktop?.setConfig?.({
      petId: window.BiumPet?.getId?.() || "retriever",
    });
    renderSpaces();
    renderFinds();
    renderHud();
    await mountHomePet();
    bind();
    document.querySelectorAll(".bang").forEach((b) => {
      b.hidden = true;
      b.style.display = "none";
    });

    await window.BiumMode?.boot?.();
    await window.BiumMini?.init?.();
    window.biumDesktop?.onConfig?.((cfg) => {
      if (cfg?.theme) applyTheme(cfg.theme);
    });

    window.biumDesktop?.onOpenGoogleSettings?.(() => {
      openGoogleClientSettings();
    });

    document.addEventListener("bium:mode", (e) => {
      if (e.detail?.mode === "home") {
        agent.idle();
        startTour();
        window.BiumMini?.fillStats?.();
      } else {
        stopTour();
        closeModal();
      }
    });

    document.addEventListener("bium:pet", async (e) => {
      await window.biumDesktop?.setConfig?.({
        petId: e.detail?.petId || window.BiumPet?.getId?.() || "retriever",
      });
      const wasHome = window.BiumMode?.getMode() === "home";
      stopTour();
      await mountHomePet();
      await window.BiumMini?.remountPet?.();
      if (wasHome) {
        agent.idle();
        startTour();
      } else {
        agent.idle();
      }
    });

    // Click Desktop Pet bubble → open keep-one with the found group
    window.biumDesktop?.onPetFound?.((payload) => {
      if (payload?.primary) applyPrimary(payload.primary);
      window.BiumMini?.fillStats?.();
      renderHud();
      renderFinds();
      stopTour();
      openDuplicateModal();
    });

    if (window.BiumMode?.getMode() === "home") {
      agent.idle();
      startTour();
    } else {
      agent.idle("Mini Mode");
    }
  }

  boot();
})();
