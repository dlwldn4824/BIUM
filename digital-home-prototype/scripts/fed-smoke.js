const path = require("path");
const { app } = require("electron");
app.whenReady().then(async () => {
  try {
    const { runFederatedScan } = require("../electron/orchestrator");
    const out = await runFederatedScan({
      engine: "fixture",
      send: (p) => console.log("PROG", p.phase, p.agent || "", p.text || ""),
    });
    console.log(
      "FILES",
      out.primary?.files?.map((f) => `${f.deviceLabel}|${f.name}`).join(" || ")
    );
    console.log("CROSS", out.primary?.crossDevice, "GROUPS", out.groups?.length);
    console.log(
      "SPACES",
      out.spaces?.map((s) => `${s.name}:${s.connected ? "on" : "off"}`).join(", ")
    );
  } catch (e) {
    console.error("ERR", e);
  } finally {
    app.quit();
  }
});
