/**
 * Pet appearance: neko (classic) | pawpal (golden puppy GIFs)
 */
window.BiumPet = (() => {
  const KEY = "bium.petId";
  /** Default dog (PawPal); switch to Neko in Settings → Pet */
  const DEFAULT = "pawpal";

  const CATALOG = {
    neko: {
      id: "neko",
      label: "Neko",
      kind: "atlas",
      base: "assets/pets/neko",
      blurb: "고전 데스크탑 고양이",
    },
    pawpal: {
      id: "pawpal",
      label: "Golden Puppy",
      kind: "gif",
      base: "assets/pets/pawpal-puppy",
      blurb: "PawPal 금모 퍼피",
    },
  };

  function read() {
    try {
      const v = localStorage.getItem(KEY);
      return CATALOG[v] ? v : DEFAULT;
    } catch {
      return DEFAULT;
    }
  }

  function write(id) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }

  function getId() {
    return read();
  }

  function getMeta(id = read()) {
    return CATALOG[id] || CATALOG[DEFAULT];
  }

  async function create(el, root) {
    const meta = getMeta();
    if (meta.kind === "gif") {
      const res = await fetch(`${meta.base}/pet.json?v=paw1`);
      const manifest = await res.json();
      return new window.GifPet(el, root, manifest, meta.base);
    }
    // Neko atlas via RetrieverSprite (loads its own manifest)
    return new window.RetrieverSprite(el, root);
  }

  function setId(id) {
    if (!CATALOG[id]) return getId();
    write(id);
    document.dispatchEvent(
      new CustomEvent("bium:pet", { detail: { petId: id } })
    );
    return id;
  }

  return { KEY, DEFAULT, CATALOG, read, getId, getMeta, setId, create };
})();
