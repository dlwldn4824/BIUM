(() => {
  const data = window.DigitalHomeData;
  const $ = (id) => document.getElementById(id);

  const state = {
    selectedKeep: null,
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
          <p class="util-sheet-note">하나만 남기면 <strong>+${reclaimLabel}</strong> 확보할 수 있어요</p>
          <div class="util-sheet-actions">
            <button class="util-sheet-close" data-action="keep-one" type="button">어디에 남길까요?</button>
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
      <p class="modal-note">하나만 유지하면 <span class="gain">+${reclaim}MB</span> 확보 가능${totalHeld ? ` · 현재 ${files.length}곳 점유` : ""}</p>
      <div class="modal-actions row">
        <button class="px-btn accent" data-action="keep-one" type="button">어디에 남길까요?</button>
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
      groupCount: 1,
      engine: primary.engine,
    });
    window.BiumScanMap.applyToData(mapped);
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

  function openKeepWhere() {
    const hero = data.duplicate.files[0];

    if (isMiniMode()) {
      const options = data.duplicate.files
        .map(
          (f) => `
          <button class="util-option ${f.recommended ? "is-rec" : ""}" type="button" data-keep="${f.keepId}">
            <span class="util-option-ico" aria-hidden="true">📁</span>
            <span class="util-option-text">
              <strong>${escapeHtml(f.keepLabel)}${f.recommended ? " · 추천" : ""}</strong>
              <small>${escapeHtml(f.place || "")}<br>${escapeHtml(f.keepDesc || "")}</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>`
        )
        .join("");

      openModal(
        `
        <div class="util-sheet">
          <h3 class="util-sheet-title">어디에 남길까요?</h3>
          <p class="util-sheet-lead">${hero ? `${escapeHtml(hero.name)} · ${escapeHtml(hero.size || "")}` : "한 곳만 남깁니다"}</p>
          <div class="util-options" id="keepOptions">${options}</div>
          <p class="util-sheet-note" id="keepReason">위치를 고르면 나머지 사본을 정리할 수 있어요</p>
          <div class="util-sheet-actions">
            <button class="util-sheet-close" data-action="confirm-keep" type="button">이 위치에 남기기</button>
            <button class="util-sheet-ghost" data-action="back-dup" type="button">뒤로</button>
          </div>
        </div>
      `,
        { util: true }
      );
      return;
    }

    const options = data.duplicate.files
      .map((f) => {
        const rec = f.recommended ? `<span class="rec">추천</span>` : "";
        return `
          <button class="keep-option" type="button" data-keep="${f.keepId}">
            <div>
              <strong>${f.keepLabel}</strong>
              <small>${f.place}<br>${f.keepDesc}</small>
            </div>
            ${rec}
          </button>
        `;
      })
      .join("");

    openModal(`
      <h3 class="dialog-title">어디에 남겨둘까요?</h3>
      <p class="dialog-sub">${hero ? `${hero.name} · ${hero.size}` : "선택한 사본만 남깁니다."}<br>나머지는 정리 후보가 됩니다. 강아지/고양이는 발견만 해요.</p>
      <div class="keep-options">${options}</div>
      <p class="modal-note" id="keepReason">위치를 고르면 나머지 사본을 정리할 수 있어요.</p>
      <div class="modal-actions row">
        <button class="px-btn accent" data-action="confirm-keep" type="button">이 위치에 남기기</button>
        <button class="px-btn ghost" data-action="back-dup" type="button">뒤로</button>
        <button class="px-btn ghost" data-action="close" type="button">모두 유지</button>
      </div>
    `);
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

  function openSimpleFind(kind) {
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
      mail: {
        title: "오래된 메일 첨부",
        body: "우편함 근처의 오래된 첨부 후보예요. 확인 후 결정해 주세요.",
        gb: "6.0GB",
        count: "412개",
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
          const res = await window.biumDesktop?.connectSpace?.(id);
          window.BiumMini?.fillStats?.();
          if (window.BiumMini?.setAgent) {
            window.BiumMini.setAgent(
              res?.ok === false
                ? `🐾 ${res.error || "연결 실패"}`
                : `🐾 ${res?.message || "연결했어요"}`
            );
          }
          // refresh from IPC broadcast / getConnections
          const con = await window.biumDesktop?.getConnections?.();
          if (con?.spaces?.length && window.DigitalHomeData) {
            window.DigitalHomeData.spaces = con.spaces.map((s) => ({
              id: s.id,
              name: s.name,
              used: s.used,
              total: s.total,
              connected: s.connected,
              icon: s.kind === "cloud" ? "cloud" : "device",
            }));
            window.BiumMini?.fillStats?.();
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

    const keep = e.target.closest("[data-keep]");
    if (keep) {
      state.selectedKeep = keep.dataset.keep;
      $("modalRoot").querySelectorAll(".keep-option, .util-option[data-keep]").forEach((el) => {
        const on = el === keep;
        el.classList.toggle("selected", on);
        el.classList.toggle("is-on", on);
      });
      const file = data.duplicate.files.find((f) => f.keepId === state.selectedKeep);
      const reason = $("keepReason");
      if (reason) {
        reason.textContent = file?.reason || `${file.keepLabel}에 남기고 나머지 사본을 정리합니다.`;
      }
      return;
    }

    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "close") {
      closeModal();
      resumeHomeChrome();
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
    if (action === "keep-one") openKeepWhere();
    if (action === "back-dup") openDuplicateModal();
    if (action === "confirm-keep") {
      if (!state.selectedKeep) {
        const reason = $("keepReason");
        if (reason) reason.textContent = "먼저 남길 위치를 선택해 주세요.";
        return;
      }
      finishCleanup();
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
          icon: s.kind === "cloud" ? "cloud" : "device",
        }));
      }
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

  function openDisplaySettings() {
    const petId = window.BiumPet?.getId() || "neko";
    openModal(
      `
      <div class="util-sheet">
        <h3 class="util-sheet-title">설정</h3>
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
          <button class="util-option ${petId === "pawpal" ? "is-on" : ""}" type="button" data-pet-pick="pawpal">
            <span class="util-option-ico" aria-hidden="true">🐕</span>
            <span class="util-option-text">
              <strong>Golden Puppy</strong>
              <small>금모 리트리버</small>
            </span>
            <span class="util-check" aria-hidden="true"></span>
          </button>
        </div>
        <button class="util-sheet-close" data-action="close" type="button">닫기</button>
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
    openAddDevice,
    openDuplicateFromMini: () => {
      // Keep Mini open — modal overlays the popover (no rescan)
      openDuplicateModal();
    },
    openHome: () => window.BiumMode?.setMode("home"),
    openMini: () => {
      stopTour();
      closeModal();
      return window.BiumMode?.setMode("mini");
    },
  };

  async function boot() {
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

    document.addEventListener("bium:pet", async () => {
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
