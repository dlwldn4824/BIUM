(() => {
  const data = window.DigitalHomeData;
  const $ = (id) => document.getElementById(id);

  const state = {
    selectedKeep: null,
    tourTimer: null,
  };

  const sprite = new window.CatSprite($("catAgent"));
  const agent = new window.CatAgent({
    root: $("catAgent"),
    sprite,
    speechEl: $("catSpeech"),
    statusEl: $("catStatusText"),
    carryEl: $("carryProp"),
    rooms: data.rooms,
  });

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
    $("spaceList").innerHTML = data.spaces
      .map((s) => {
        const p = Math.round((s.used / s.total) * 100);
        return `
          <li>
            <i class="px-icon ${s.icon}"></i>
            <div class="meta">
              <span>${s.name}</span>
              <b>${s.used}GB / ${s.total}GB</b>
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

  function openModal(html) {
    $("modalRoot").innerHTML = html;
    $("modalLayer").classList.remove("hidden");
  }

  function closeModal() {
    $("modalLayer").classList.add("hidden");
    $("modalRoot").innerHTML = "";
    state.selectedKeep = null;
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
        status: `${data.rooms[room].label} 둘러보는 중`,
      });
      if (agent.busy || !$("modalLayer").classList.contains("hidden")) return;
      agent.sprite.setState("idle");
    };
    step();
    state.tourTimer = setInterval(step, 3400);
  }

  async function runDuplicateFlow() {
    stopTour();
    const ok = await agent.exploreAndFetch(["desktop", "laptop", "cloud"]);
    if (!ok) return;

    const files = data.duplicate.files
      .map(
        (f) => `
      <div class="file-row">
        <div>
          <strong>${f.name}</strong>
          <small>${f.place}<br>${f.size}</small>
        </div>
        <div class="match-badge">일치<br>100%</div>
      </div>
    `
      )
      .join("");

    openModal(`
      <div class="dialog-head">
        <div class="dialog-cat" aria-hidden="true"></div>
        <div>
          <h3 class="dialog-title">똑같은 파일을 찾았어요!</h3>
          <p class="dialog-sub">파일 이름은 다르지만 실제 내용은 완전히 동일해요.</p>
        </div>
      </div>
      <div class="file-list">${files}</div>
      <p class="modal-note">파일 내용 일치 <strong>100%</strong></p>
      <p class="modal-note">하나만 남기면 <span class="gain">+${data.duplicate.reclaimMb}MB</span></p>
      <div class="modal-actions row">
        <button class="px-btn accent" data-action="keep-one" type="button">하나만 남기기</button>
        <button class="px-btn ghost" data-action="close" type="button">파일 위치 보기</button>
        <button class="px-btn ghost" data-action="close" type="button">그대로 두기</button>
      </div>
    `);
  }

  function openKeepWhere() {
    const options = data.duplicate.files
      .map((f) => {
        const rec = f.recommended ? `<span class="rec">추천</span>` : "";
        return `
          <button class="keep-option" type="button" data-keep="${f.keepId}">
            <div>
              <strong>${f.keepLabel}</strong>
              <small>${f.keepDesc}</small>
            </div>
            ${rec}
          </button>
        `;
      })
      .join("");

    openModal(`
      <h3 class="dialog-title">어디에 남길까요?</h3>
      <p class="dialog-sub">추천은 참고용이에요. 직접 선택해 주세요.</p>
      <div class="keep-options">${options}</div>
      <p class="modal-note" id="keepReason">위치를 고르면 나머지 사본을 정리할 수 있어요.</p>
      <div class="modal-actions row">
        <button class="px-btn accent" data-action="confirm-keep" type="button">이 위치에 남기기</button>
        <button class="px-btn ghost" data-action="back-dup" type="button">뒤로</button>
        <button class="px-btn ghost" data-action="close" type="button">취소</button>
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

  function onModalClick(e) {
    const keep = e.target.closest("[data-keep]");
    if (keep) {
      state.selectedKeep = keep.dataset.keep;
      $("modalRoot").querySelectorAll(".keep-option").forEach((el) => {
        el.classList.toggle("selected", el === keep);
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
      agent.idle();
      startTour();
    }
    if (action === "close-result") {
      closeModal();
      agent.idle(data.speeches.happy);
      startTour();
    }
    if (action === "keep-one") openKeepWhere();
    if (action === "back-dup") {
      // reopen find dialog without replaying roam
      const files = data.duplicate.files
        .map(
          (f) => `
        <div class="file-row">
          <div>
            <strong>${f.name}</strong>
            <small>${f.place}<br>${f.size}</small>
          </div>
          <div class="match-badge">일치<br>100%</div>
        </div>
      `
        )
        .join("");
      openModal(`
        <div class="dialog-head">
          <div class="dialog-cat" aria-hidden="true"></div>
          <div>
            <h3 class="dialog-title">똑같은 파일을 찾았어요!</h3>
            <p class="dialog-sub">파일 이름은 다르지만 실제 내용은 완전히 동일해요.</p>
          </div>
        </div>
        <div class="file-list">${files}</div>
        <p class="modal-note">하나만 남기면 <span class="gain">+${data.duplicate.reclaimMb}MB</span></p>
        <div class="modal-actions row">
          <button class="px-btn accent" data-action="keep-one" type="button">하나만 남기기</button>
          <button class="px-btn ghost" data-action="close" type="button">파일 위치 보기</button>
          <button class="px-btn ghost" data-action="close" type="button">그대로 두기</button>
        </div>
      `);
    }
    if (action === "confirm-keep") {
      if (!state.selectedKeep) {
        const reason = $("keepReason");
        if (reason) reason.textContent = "먼저 남길 위치를 선택해 주세요.";
        return;
      }
      finishCleanup();
    }
  }

  function bind() {
    $("btnExplore").addEventListener("click", () => runDuplicateFlow());
    $("btnReviewOne").addEventListener("click", () => runDuplicateFlow());

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

  renderSpaces();
  renderFinds();
  renderHud();
  bind();
  document.querySelectorAll(".bang").forEach((b) => {
    b.hidden = true;
    b.style.display = "none";
  });
  agent.idle();
  startTour();
})();
