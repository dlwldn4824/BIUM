/**
 * Scan session — bridges Local Agent IPC (or fixture fetch) to pet UI events.
 */
window.BiumScanSession = (() => {
  let unsub = null;
  let running = false;

  function desktop() {
    return window.biumDesktop;
  }

  function broadcast(payload) {
    document.dispatchEvent(
      new CustomEvent("bium:scan-progress", { detail: payload })
    );
  }

  /**
   * @param {{ onProgress?: (p: object) => void }} [opts]
   */
  async function run(opts = {}) {
    if (running) return { ok: false, error: "already-running" };
    running = true;
    const onProgress = (p) => {
      broadcast(p);
      opts.onProgress?.(p);
    };

    try {
      if (desktop()?.petScan || desktop()?.scanLocal) {
        unsub = desktop().onScanProgress?.(onProgress);
        // Desktop Pet path moves the real OS window; panel only receives results
        const res = desktop()?.petScan
          ? await desktop().petScan(opts.scanOptions || {})
          : await desktop().scanLocal(opts.scanOptions || {});
        const allGroups =
          res?.groups ||
          res?.candidates?.exact?.groups ||
          res?.result?.piles?.find((p) => p.id === "duplicates")?.groups ||
          [];
        if (allGroups.length && window.BiumApp?.applyExactGroups) {
          window.BiumApp.applyExactGroups(allGroups);
        } else if (res?.primary && window.BiumScanMap) {
          const mapped = window.BiumScanMap.fromDietGroup(res.primary, {
            groupCount: allGroups.length || 1,
            engine: res.primary.engine || "index",
          });
          window.BiumScanMap.applyToData(mapped);
        }
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
        }
        const summary = res?.summary || res?.result?.summary || null;
        if (summary && window.DigitalHomeData?.summary) {
          Object.assign(window.DigitalHomeData.summary, summary);
        }
        const mail =
          res?.mailCleanup || res?.result?.mailCleanup || null;
        if (mail) window.BiumApp?.applyMailCleanup?.(mail);
        const candidates =
          res?.candidates || res?.result?.candidates || null;
        if (candidates) {
          window.BiumApp?.applyCandidates?.({
            ...candidates,
            exact: { groups: allGroups.length ? allGroups : candidates.exact?.groups || [] },
          });
        }
        window.BiumApp?.syncFindCountToSummary?.();
        window.BiumMini?.fillStats?.();
        return res;
      }

      // Browser / no Electron: fixture story
      onProgress({ phase: "start", text: "데모 인덱스로 탐색..." });
      await wait(400);
      for (const room of [
        { room: "laptop", label: "MacBook / Downloads" },
        { room: "desktop", label: "Desktop" },
        { room: "cloud", label: "Google Drive" },
      ]) {
        onProgress({
          phase: "walk",
          room: room.room,
          label: room.label,
          text: `${room.label}(으)로 이동 중`,
        });
        await wait(700);
        onProgress({
          phase: "search",
          room: room.room,
          label: room.label,
          text: `${room.label} 탐색 중...`,
        });
        await wait(900);
      }
      const res = await fetch(
        "fixtures/czkawka-duplicates.sample.json?v=scan2"
      );
      const json = await res.json();
      const mapped = window.BiumScanMap.fromCzkawkaJson(json);
      window.BiumScanMap.applyToData(mapped);
      try {
        const [photos, docs, cold] = await Promise.all([
          fetch("fixtures/similar-photos.sample.json").then((r) => r.json()),
          fetch("fixtures/similar-docs.sample.json").then((r) => r.json()),
          fetch("fixtures/cold-stale.sample.json").then((r) => r.json()),
        ]);
        window.BiumApp?.applyCandidates?.({
          exact: { groups: [] },
          similarPhotos: { groups: photos.groups || [] },
          similarDocs: { groups: docs.groups || [] },
          coldStale: { groups: cold.groups || [] },
        });
        onProgress({
          phase: "search",
          room: "cloud",
          text: "급하지 않은 분류라 저탄소 시간에 맞춰 처리할게요...",
        });
        await wait(500);
      } catch {
        /* ignore */
      }
      onProgress({
        phase: "found",
        room: "cloud",
        text: `어? 똑같은 파일을 ${mapped.files.length}곳에서 봤어요`,
      });
      return {
        ok: true,
        usedFixture: true,
        roomsVisited: ["laptop", "desktop", "cloud"],
        primary: { files: mapped.files },
      };
    } finally {
      if (typeof unsub === "function") unsub();
      unsub = null;
      running = false;
    }
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  return { run, isRunning: () => running };
})();
