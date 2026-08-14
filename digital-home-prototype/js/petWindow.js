/**
 * Transparent Desktop Pet — grab to move when at home.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  /** @type {any} */
  let pet = null;
  let currentPetId = null;
  let lastView = null;
  let dragging = false;
  let moved = false;

  async function mount(requestedPetId) {
    const el = $("petSprite");
    if (!el || !window.BiumPet) return;
    const petId = requestedPetId === "neko" ? "neko" : "retriever";
    if (pet && currentPetId === petId) return;
    pet?.destroy?.();
    el.innerHTML = "";
    el.removeAttribute("style");
    el.className = "pet-sprite pet-atlas";
    pet = window.BiumPet.createForId
      ? await window.BiumPet.createForId(petId, el, el)
      : await window.BiumPet.create(el, el);
    currentPetId = petId;
    pet.setDisplaySize?.(96);
    if (pet.size) {
      pet.size = 96;
      if (pet.img) {
        pet.img.style.width = "96px";
        pet.img.style.height = "96px";
      }
    }
    if (pet.atlas) {
      pet.atlas.scale = Math.max(1, Math.round(96 / (pet.atlas.cell || 32)));
      pet.atlas._applySize?.();
    }
    if (lastView) applyView(lastView);
    else {
      pet.setState("sleep");
      pet.setFacing("left");
    }
  }

  function applyView(view) {
    if (!view) return;
    lastView = view;
    const bubble = $("petBubble");
    const bang = $("petBang");
    const carry = $("petCarry");
    const device = $("petDevice");
    const shell = $("petShell");

    if (bubble) {
      if (view.speech) {
        bubble.hidden = false;
        bubble.textContent = view.speech;
      } else {
        bubble.hidden = true;
        bubble.textContent = "";
      }
    }

    if (bang) bang.hidden = view.state !== "found";
    if (carry) carry.hidden = !view.carry;
    if (device) {
      device.hidden = view.device !== "windows";
      device.textContent = view.device === "windows" ? "WIN" : "MAC";
    }

    shell?.classList.toggle("is-clickable", !!view.clickable);
    shell?.classList.toggle("is-draggable", !!view.draggable);
    shell?.classList.toggle(
      "is-sleep",
      (view.state || "sleep") === "sleep" || (view.state || "") === "idle"
    );

    if (!pet) return;
    if (view.facing) pet.setFacing(view.facing);
    const anim = view.state || "sleep";
    if (anim === "walk") pet.setState("run");
    else pet.setState(anim);
  }

  function bind() {
    window.biumPet?.onView?.(applyView);
    window.biumPet?.onAppearance?.((petId) => {
      mount(petId).catch(() => {});
    });
    window.biumPet?.ready?.();

    const shell = $("petShell");

    $("petBubble")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (moved) return;
      window.biumPet?.clicked?.();
    });

    shell?.addEventListener("pointerdown", (e) => {
      if (!shell.classList.contains("is-draggable")) {
        if (shell.classList.contains("is-clickable")) {
          window.biumPet?.clicked?.();
        }
        return;
      }
      dragging = true;
      moved = false;
      shell.classList.add("is-dragging");
      try {
        shell.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      window.biumPet?.dragBegin?.(e.screenX, e.screenY);
      e.preventDefault();
    });

    shell?.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      moved = true;
      window.biumPet?.dragMove?.(e.screenX, e.screenY);
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      shell?.classList.remove("is-dragging");
      window.biumPet?.dragEnd?.();
      if (!moved && shell?.classList.contains("is-clickable")) {
        window.biumPet?.clicked?.();
      }
      moved = false;
      if (e?.pointerId != null) {
        try {
          shell?.releasePointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };

    shell?.addEventListener("pointerup", endDrag);
    shell?.addEventListener("pointercancel", endDrag);
  }

  (async () => {
    const petId = await window.biumPet?.getAppearance?.();
    await mount(petId);
    bind();
  })();
})();
