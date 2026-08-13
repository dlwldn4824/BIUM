/**
 * Pet appearance: neko (classic) | retriever (PawPal white golden puppy GIFs)
 */
window.BiumPet = (() => {
  const KEY = "bium.petId";
  const DEFAULT = "retriever";

  const CATALOG = {
    neko: {
      id: "neko",
      label: "Neko",
      kind: "atlas",
      base: "assets/pets/neko",
      cacheBust: "neko3",
      blurb: "고전 데스크탑 고양이",
    },
    retriever: {
      id: "retriever",
      label: "강아지",
      kind: "gif",
      base: "assets/pets/pawpal-puppy",
      cacheBust: "paw2",
      blurb: "하얀 금모 퍼피",
    },
  };

  function normalize(id) {
    if (id === "pawpal") return "retriever";
    return CATALOG[id] ? id : DEFAULT;
  }

  function read() {
    try {
      return normalize(localStorage.getItem(KEY));
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
    return CATALOG[normalize(id)] || CATALOG[DEFAULT];
  }

  async function createForId(id, el, root) {
    const meta = getMeta(id);
    const bust = meta.cacheBust || "v1";
    if (meta.kind === "gif") {
      const res = await fetch(`${meta.base}/pet.json?v=${bust}`);
      const manifest = await res.json();
      manifest.displayName = meta.label || manifest.displayName;
      const pet = new window.GifPet(el, root, manifest, meta.base);
      pet.cacheBust = bust;
      return pet;
    }
    if (meta.kind === "frames") {
      const res = await fetch(`${meta.base}/pet.json?v=${bust}`);
      const manifest = await res.json();
      return new window.FramePet(el, root, manifest, meta.base);
    }
    return new window.RetrieverSprite(el, root, {
      base: meta.base,
      petKey: meta.id,
      cacheBust: bust,
    });
  }

  async function create(el, root) {
    return createForId(getId(), el, root);
  }

  function setId(id) {
    const next = normalize(id);
    if (!CATALOG[next]) return getId();
    write(next);
    document.dispatchEvent(
      new CustomEvent("bium:pet", { detail: { petId: next } })
    );
    return next;
  }

  return {
    KEY,
    DEFAULT,
    CATALOG,
    read,
    getId,
    getMeta,
    setId,
    create,
    createForId,
  };
})();
