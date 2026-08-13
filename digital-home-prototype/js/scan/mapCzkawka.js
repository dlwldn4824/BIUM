/**
 * Map Czkawka / Local Agent duplicate results → DigitalHomeData.duplicate.
 */
window.BiumScanMap = {
  placeFor(filePath, room) {
    const p = String(filePath || "");
    if (room === "cloud" || /GoogleDrive|Google Drive|CloudStorage|OneDrive|iCloud|Dropbox/i.test(p)) {
      return "Google Drive";
    }
    if (room === "desktop" || /\/Desktop\b/i.test(p)) return "Desktop";
    if (room === "laptop" || /Downloads/i.test(p)) return "MacBook / Downloads";
    if (/Documents/i.test(p)) return "MacBook / Documents";
    if (room === "mail") return "Mail";
    if (room === "phone") return "Phone";
    return p.split("/").slice(-2).join(" / ") || "Local";
  },

  keepIdFor(filePath, room, i) {
    if (room === "cloud" || /GoogleDrive|Google Drive|CloudStorage/i.test(filePath)) {
      return "gdrive";
    }
    if (room === "desktop" || /\/Desktop\b/i.test(filePath)) return "desktop";
    if (room === "laptop" || /Downloads|Documents/i.test(filePath)) return "laptop";
    if (room === "mail") return "mail";
    return `keep-${i}`;
  },

  keepMeta(keepId) {
    if (keepId === "gdrive") {
      return {
        keepLabel: "Google Drive",
        keepDesc: "클라우드 보관 · 데이터센터 부하 지속",
        recommended: false,
        reason:
          "Drive에 남기면 클라우드에 계속 쌓여요. 탄소 절감을 위해 로컬을 추천해요.",
      };
    }
    if (keepId === "desktop") {
      return {
        keepLabel: "Desktop",
        keepDesc: "로컬 Desktop · 클라우드보다 환경에 유리",
        recommended: true,
        reason:
          "Desktop에 남기면 Drive 복제를 줄여 탄소·구독 부담을 낮출 수 있어요.",
      };
    }
    if (keepId === "mail") {
      return {
        keepLabel: "Mail",
        keepDesc: "메일 첨부 보관",
        recommended: false,
      };
    }
    return {
      keepLabel: "MacBook",
      keepDesc: "로컬 MacBook · 클라우드보다 환경에 유리",
      recommended: false,
      reason:
        "로컬에 남기면 클라우드 복제를 줄여 탄소 절감에 도움이 돼요.",
    };
  },

  /** Prefer local Desktop/Mac over Drive — cloud copies cost energy. */
  preferLocalKeep(files) {
    if (!files?.length) return files;
    for (const f of files) {
      f.recommended = false;
      if (f.keepId === "gdrive" || f.deviceId === "gdrive") {
        f.keepDesc = "클라우드 보관 · 데이터센터 부하 지속";
        f.reason =
          "Drive에 남기면 클라우드에 계속 쌓여요. 탄소 절감을 위해 로컬을 추천해요.";
      }
    }
    const pick =
      files.find(
        (f) => f.keepId === "desktop" || f.deviceId === "windows-peer"
      ) ||
      files.find(
        (f) => f.keepId === "laptop" || f.deviceId === "mac-local"
      ) ||
      files.find(
        (f) => f.keepId !== "gdrive" && f.deviceId !== "gdrive" && f.keepId !== "mail"
      );
    if (pick) {
      pick.recommended = true;
      if (pick.keepId === "desktop" || pick.deviceId === "windows-peer") {
        pick.keepLabel = pick.keepLabel || "Desktop";
        pick.keepDesc = "로컬 Desktop · 클라우드보다 환경에 유리";
        pick.reason =
          "Desktop에 남기면 Drive 복제를 줄여 탄소·구독 부담을 낮출 수 있어요.";
      } else {
        pick.keepDesc = pick.keepDesc || "로컬 보관 · 클라우드보다 환경에 유리";
        pick.reason =
          "로컬에 남기면 클라우드 복제를 줄여 탄소 절감에 도움이 돼요.";
      }
    }
    return files;
  },

  /**
   * @param {object|string} raw Czkawka JSON (size-keyed groups)
   */
  fromCzkawkaJson(raw) {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const groups = [];

    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const value of Object.values(data)) {
        if (!Array.isArray(value)) continue;
        if (value[0] && typeof value[0].path === "string") {
          if (value.length >= 2) groups.push(value);
        } else {
          for (const inner of value) {
            if (Array.isArray(inner) && inner.length >= 2) groups.push(inner);
          }
        }
      }
    }

    groups.sort((a, b) => {
      const sa = (a[0] && a[0].size) || 0;
      const sb = (b[0] && b[0].size) || 0;
      return sb - sa;
    });

    const primary = groups[0] || [];
    return this.fromRawFiles(
      primary.map((f) => ({
        path: f.path,
        size: f.size,
        hash: f.hash,
        room: undefined,
      })),
      {
        groupCount: groups.length,
        engine: "czkawka",
        matchNote: "내용 일치 100% (BLAKE3)",
      }
    );
  },

  /**
   * Local Agent / diet group shape → modal duplicate.
   * @param {{ files: object[], reclaimBytes?: number, engine?: string, reason?: string }} group
   * @param {{ groupCount?: number, engine?: string }} meta
   */
  fromDietGroup(group, meta = {}) {
    if (!group?.files?.length) {
      return {
        reclaimMb: 0,
        files: [],
        groupCount: 0,
        engine: meta.engine || "none",
        matchNote: "중복 없음",
      };
    }
    return this.fromRawFiles(group.files, {
      groupCount: meta.groupCount || 1,
      engine: group.engine || meta.engine || "czkawka",
      matchNote:
        group.reason ||
        (String(group.engine || meta.engine || "").includes("node")
          ? "내용 일치 (부분 해시)"
          : "내용 일치 100% (BLAKE3)"),
      reclaimBytes: group.reclaimBytes,
    });
  },

  fromRawFiles(files, meta = {}) {
    const size = files[0]?.size || 0;
    const reclaim =
      meta.reclaimBytes != null
        ? meta.reclaimBytes
        : size * Math.max(0, files.length - 1);
    const reclaimMb = Math.max(1, Math.round(reclaim / (1024 * 1024)));

    const mappedFiles = files.map((f, i) => {
      const filePath = f.path || "";
      const name = f.name || filePath.split("/").pop() || "file";
      const room = f.room;
      const keepId = this.keepIdFor(filePath, room, i);
      const km = this.keepMeta(keepId);
      const mb = Math.max(
        1,
        Math.round((f.size || size) / (1024 * 1024))
      );
      const deviceLabel = f.deviceLabel || f.place;
      return {
        name,
        place: deviceLabel || this.placeFor(filePath, room),
        size: f.sizeLabel || `${mb}MB`,
        keepId:
          f.deviceId === "windows-peer"
            ? "desktop"
            : f.deviceId === "gdrive"
              ? "gdrive"
              : keepId,
        keepLabel:
          f.deviceId === "windows-peer"
            ? "Desktop"
            : f.deviceId === "gdrive"
              ? "Google Drive"
              : f.deviceId === "mac-local"
                ? "MacBook"
                : km.keepLabel,
        keepDesc: km.keepDesc,
        recommended: false,
        reason: km.reason,
        path: filePath,
        hash: f.hash,
        deviceId: f.deviceId,
        room:
          room ||
          (f.deviceId === "gdrive"
            ? "cloud"
            : f.deviceId === "windows-peer"
              ? "desktop"
              : keepId === "gdrive"
                ? "cloud"
                : keepId === "mail"
                  ? "mail"
                  : keepId),
      };
    });

    this.preferLocalKeep(mappedFiles);

    return {
      reclaimMb,
      files: mappedFiles,
      groupCount: meta.groupCount || 1,
      engine: meta.engine || "czkawka",
      matchNote: meta.matchNote || "내용 일치 100% (BLAKE3)",
    };
  },

  /** Apply mapped group onto DigitalHomeData.duplicate */
  applyToData(mapped) {
    if (!window.DigitalHomeData || !mapped) return;
    window.DigitalHomeData.isMock = false;
    window.DigitalHomeData.duplicate = {
      reclaimMb: mapped.reclaimMb,
      files: mapped.files,
      matchNote: mapped.matchNote,
      engine: mapped.engine,
    };
    if (mapped.groupCount && window.DigitalHomeData.finds) {
      const row = window.DigitalHomeData.finds.find((f) => f.id === "duplicate");
      if (row) {
        row.count = Math.max(row.count || 0, mapped.groupCount);
        row.gb = Math.max(row.gb || 0, +(mapped.reclaimMb / 1024).toFixed(1));
      }
    }
    if (mapped.reclaimMb && window.DigitalHomeData.summary) {
      const gb = +(mapped.reclaimMb / 1024).toFixed(1);
      window.DigitalHomeData.summary.cleanableGb = Math.max(
        window.DigitalHomeData.summary.cleanableGb || 0,
        gb
      );
    }
  },
};
