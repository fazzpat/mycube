/* Arcade character-creator shell over a fixed full-screen room.
   Does not change avatar drawing or the draft data model — it only
   tabs, restyles, and paginates the existing option rows. */
import { createEmptyRoomBackdrop } from "./isoRoom.js";

const TABS = [
  { id: "body", label: "BODY" },
  { id: "hair", label: "HAIR" },
  { id: "face", label: "FACE" },
  { id: "top", label: "TOP" },
  { id: "bottom", label: "BOTTOM" },
  { id: "shoes", label: "SHOES" },
];

/* Phone hook: Edit Character enlarges the in-game handset and mounts the
   option window inside it. The room and in-room avatar are left alone. */
let phoneApi = null;
export function openFromPhone() {
  return phoneApi?.openFromPhone?.() || false;
}
export function closeFromPhone() {
  return phoneApi?.closeFromPhone?.() || false;
}
export function isPhoneEditOpen() {
  return Boolean(phoneApi?.isOpen?.());
}

export function initCreatorMenu({ onShow, getBackdropRoom } = {}) {
  const roomEl = document.getElementById("creator-room");
  const viewEl = document.getElementById("view-creator");
  const tabsEl = document.getElementById("creator-tabs");
  const previewEl = document.getElementById("creator-preview");
  const windowEl = document.querySelector("[data-testid='creator-window']");
  const panelsEl = document.getElementById("creator-tab-panels");
  const prevBtn = document.getElementById("creator-page-prev");
  const nextBtn = document.getElementById("creator-page-next");
  const dotsEl = document.getElementById("creator-page-dots");
  if (!roomEl || !viewEl || !tabsEl) {
    return { show() {}, hide() {} };
  }

  let tabIndex = 0;
  let optIndex = 0;
  let pageIndex = 0;
  let pages = [[]];
  let room = null;
  let usingRoom = false;
  let paging = false;
  let phoneHomeParent = null;
  let phoneHomeNext = null;

  function overlayEl() {
    return document.getElementById("phone-overlay");
  }

  function phoneEditOpen() {
    return Boolean(overlayEl()?.classList.contains("is-character-edit"));
  }

  function editorActive() {
    return document.body.dataset.view === "creator" || phoneEditOpen();
  }

  let ro = null;
  let locked = { w: 0, h: 0 };

  function keyboardCovered() {
    const vv = window.visualViewport;
    return vv ? Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0)) : 0;
  }

  function freezeShell() {
    locked = { w: window.innerWidth, h: window.innerHeight };
    viewEl.style.position = "fixed";
    viewEl.style.left = "0px";
    viewEl.style.top = "0px";
    viewEl.style.width = locked.w + "px";
    viewEl.style.height = locked.h + "px";
    viewEl.style.maxHeight = "none";
  }

  function relockIfNeeded() {
    if (keyboardCovered() > 80) return false;
    const w = window.innerWidth, h = window.innerHeight;
    if (w !== locked.w || Math.abs(h - locked.h) > 40) {
      freezeShell();
      return true;
    }
    return false;
  }

  function tabButtons() {
    return [...tabsEl.querySelectorAll("[data-tab]")];
  }

  function panelEl(id) {
    return document.querySelector(`[data-panel="${id}"]`);
  }

  function currentId() {
    return TABS[tabIndex]?.id || "body";
  }

  function optionButtons(panel, onlyVisible) {
    if (!panel) return [];
    return [...panel.querySelectorAll("button.swatch, button.choice, input[type='checkbox']")]
      .filter((el) => !el.closest(".hidden") && (!onlyVisible || !el.classList.contains("creator-offpage") && !el.closest(".creator-offpage")));
  }

  function panelMetrics() {
    const box = panelsEl || panelEl(currentId());
    const phone = phoneEditOpen();
    const w = Math.max(phone ? 80 : 120, (box?.clientWidth || (phone ? 140 : 300)) - 4);
    const rawH = (box?.clientHeight || (phone ? 48 : 120)) - 2;
    const h = Math.max(phone ? 40 : 44, rawH);
    const tile = phone ? 42 : 52;
    const phoneCols = Math.max(3, Math.min(4, Math.floor((w + 2) / tile) || 3));
    const swatchPerRow = phone ? phoneCols : Math.max(3, Math.floor((w + 4) / 52));
    const choicePerRow = phone ? phoneCols : Math.max(3, Math.min(6, Math.floor((w + 4) / 56)));
    return { w, h, swatchPerRow, choicePerRow, headingH: phone ? 0 : 22, itemH: phone ? 42 : 48 };
  }

  function perRowFor(items) {
    const m = panelMetrics();
    const sample = items[0];
    if (sample && sample.classList && sample.classList.contains("check-row")) return 1;
    if (sample && sample.classList && sample.classList.contains("swatch")) return m.swatchPerRow;
    return m.choicePerRow;
  }

  function visibleGroups(panel) {
    const groups = [];
    if (!panel) return groups;
    const walk = (root) => {
      let pendingH = null;
      for (const child of root.children) {
        if (child.classList.contains("hidden")) {
          pendingH = null;
          continue;
        }
        if (child.matches("h3")) {
          pendingH = child;
        } else if (child.classList.contains("swatch-row")) {
          groups.push({ heading: pendingH, row: child, items: [...child.children] });
          pendingH = null;
        } else if (child.id === "headphone-color-field") {
          walk(child);
          pendingH = null;
        } else if (child.classList.contains("check-row")) {
          groups.push({ heading: pendingH, row: null, items: [child] });
          pendingH = null;
        }
      }
    };
    walk(panel);
    return groups;
  }

  function buildPages(panel) {
    const { h, headingH, itemH } = panelMetrics();
    const groups = visibleGroups(panel);
    const out = [];
    let cur = [];
    let usedH = 0;
    const flush = () => {
      if (cur.length) out.push(cur);
      cur = [];
      usedH = 0;
    };
    const addChunk = (chunkH) => {
      if (cur.length && usedH + chunkH > h) flush();
    };
    for (const g of groups) {
      const perRow = perRowFor(g.items);
      let offset = 0;
      while (offset < g.items.length) {
        const hasHeading = offset === 0 && g.heading;
        const chrome = hasHeading ? headingH : 0;
        const space = h - usedH - chrome;
        let rowsFit = Math.floor(space / itemH);
        if (rowsFit < 1) {
          if (cur.length) { flush(); continue; }
          rowsFit = 1;
        }
        const take = Math.min(rowsFit * perRow, g.items.length - offset);
        const rowsUsed = Math.max(1, Math.ceil(take / perRow));
        const chunkH = chrome + rowsUsed * itemH;
        addChunk(chunkH);
        // If flush happened, recompute once more for the new page.
        if (!cur.length) {
          const freshChrome = hasHeading ? headingH : 0;
          const freshRows = Math.max(1, Math.min(Math.floor((h - freshChrome) / itemH) || 1, Math.ceil((g.items.length - offset) / perRow)));
          const freshTake = Math.min(freshRows * perRow, g.items.length - offset);
          const freshH = freshChrome + Math.max(1, Math.ceil(freshTake / perRow)) * itemH;
          cur.push({
            heading: hasHeading ? g.heading : null,
            row: g.row,
            items: g.items.slice(offset, offset + freshTake),
          });
          usedH += freshH;
          offset += freshTake;
        } else {
          cur.push({
            heading: hasHeading ? g.heading : null,
            row: g.row,
            items: g.items.slice(offset, offset + take),
          });
          usedH += chunkH;
          offset += take;
        }
      }
    }
    flush();
    return out.length ? out : [[]];
  }

  function applyPage() {
    const panel = panelEl(currentId());
    if (!panel) return;
    paging = true;
    const allItems = [];
    const allHeadings = [];
    visibleGroups(panel).forEach((g) => {
      if (g.heading) allHeadings.push(g.heading);
      g.items.forEach((it) => allItems.push(it));
    });
    const page = pages[pageIndex] || [];
    const onItems = new Set(page.flatMap((g) => g.items));
    const onHeadings = new Set(page.map((g) => g.heading).filter(Boolean));
    allItems.forEach((el) => el.classList.toggle("creator-offpage", !onItems.has(el)));
    allHeadings.forEach((el) => el.classList.toggle("creator-offpage", !onHeadings.has(el)));
    panel.querySelectorAll(".swatch-row").forEach((row) => {
      const any = [...row.children].some((c) => !c.classList.contains("creator-offpage"));
      row.classList.toggle("creator-offpage", !any);
    });
    if (prevBtn) prevBtn.disabled = pageIndex <= 0;
    if (nextBtn) nextBtn.disabled = pageIndex >= pages.length - 1;
    if (dotsEl) {
      dotsEl.innerHTML = pages.map((_, i) => `<span class="${i === pageIndex ? "is-on" : ""}"></span>`).join("");
    }
    document.querySelector(".creator-pager")?.classList.toggle("is-needed", pages.length > 1);
    paging = false;
  }

  function paginate() {
    const panel = panelEl(currentId());
    const rebuild = () => {
      pages = buildPages(panel);
      if (pageIndex >= pages.length) pageIndex = Math.max(0, pages.length - 1);
      if (pageIndex < 0) pageIndex = 0;
    };
    rebuild();
    applyPage();
    // Pager show/hide changes panel height; rebuild once so a page never overflows.
    const before = pages.length;
    const beforeH = panel?.clientHeight;
    rebuild();
    if (pages.length !== before || panel?.clientHeight !== beforeH) applyPage();
    paintOptionCursor();
  }

  function setPage(i) {
    if (!pages.length) return;
    const next = Math.max(0, Math.min(pages.length - 1, i));
    if (next === pageIndex) return;
    pageIndex = next;
    optIndex = 0;
    applyPage();
    paintOptionCursor();
  }

  function showOption(testId) {
    const el = document.querySelector(`[data-testid="${testId}"]`);
    if (!el) return;
    for (let i = 0; i < pages.length; i++) {
      const hits = pages[i].some((g) => g.items.includes(el) || g.items.some((it) => it === el || it.contains?.(el)));
      if (hits) {
        setPage(i);
        return;
      }
    }
  }

  function paintTabs() {
    tabButtons().forEach((btn, i) => {
      const on = i === tabIndex;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    TABS.forEach((t, i) => {
      const panel = panelEl(t.id);
      if (panel) panel.classList.toggle("hidden", i !== tabIndex);
    });
    pageIndex = 0;
    paginate();
  }

  function paintOptionCursor() {
    const opts = optionButtons(panelEl(currentId()), true);
    if (!opts.length) {
      optIndex = 0;
      return;
    }
    if (optIndex >= opts.length) optIndex = 0;
    if (optIndex < 0) optIndex = opts.length - 1;
    opts.forEach((el, i) => el.classList.toggle("is-cursor", i === optIndex));
  }

  function setTab(i) {
    tabIndex = ((i % TABS.length) + TABS.length) % TABS.length;
    optIndex = 0;
    pageIndex = 0;
    paintTabs();
  }

  function setTabById(id) {
    const i = TABS.findIndex((t) => t.id === id);
    if (i >= 0) setTab(i);
  }

  function moveOption(dir) {
    const opts = optionButtons(panelEl(currentId()), true);
    if (!opts.length) return;
    const next = optIndex + dir;
    if (next < 0 && pageIndex > 0) {
      setPage(pageIndex - 1);
      const more = optionButtons(panelEl(currentId()), true);
      optIndex = Math.max(0, more.length - 1);
      paintOptionCursor();
      return;
    }
    if (next >= opts.length && pageIndex < pages.length - 1) {
      setPage(pageIndex + 1);
      return;
    }
    optIndex = (next + opts.length) % opts.length;
    paintOptionCursor();
  }

  function activateOption() {
    const opts = optionButtons(panelEl(currentId()), true);
    const el = opts[optIndex];
    if (!el) return;
    el.click();
    requestAnimationFrame(() => {
      paginate();
      paintOptionCursor();
    });
  }

  function onKey(e) {
    if (!editorActive()) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setTab(tabIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setTab(tabIndex - 1);
    } else if (e.key === "PageDown" || e.key === "]") {
      e.preventDefault();
      setPage(pageIndex + 1);
    } else if (e.key === "PageUp" || e.key === "[") {
      e.preventDefault();
      setPage(pageIndex - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveOption(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveOption(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      if (e.target && e.target.closest && e.target.closest("#save-avatar, #creator-back, #creator-page-prev, #creator-page-next")) return;
      e.preventDefault();
      activateOption();
    }
  }

  function onTabClick(e) {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    const i = tabButtons().indexOf(btn);
    if (i >= 0) setTab(i);
  }

  function applyBackdrop(snap) {
    if (!room) return;
    usingRoom = Boolean(snap);
    if (!snap) {
      room.setStyle?.("paint-cream", "wood");
      room.setGridSize?.(6);
      room.setLights?.(true);
      room.clear?.();
      room.syncPeople?.([]);
      return;
    }
    room.setGridSize?.(snap.size || snap.grid || 6);
    room.setStyle?.(snap.wallpaper || "paint-cream", snap.floorStyle || "wood");
    room.setLights?.(snap.lightsOn !== false);
    room.setFurniture?.(snap.furniture || []);
    room.setWallArt?.(snap.wallArt || []);
    room.setTvs?.(snap.tvs || {});
    room.setChessMap?.(snap.chess || {});
    room.setUses?.(snap.uses || {});
    room.setArcade?.(snap.arcade || {});
    room.syncPeople?.([]);
  }

  function mountRoom() {
    const snap = getBackdropRoom?.() || null;
    if (!room) room = createEmptyRoomBackdrop(roomEl);
    applyBackdrop(snap);
    room.resize?.();
  }

  function disposeRoom() {
    try { room?.dispose?.(); } catch {}
    room = null;
    roomEl.innerHTML = "";
  }

  function popPreview() {
    if (!previewEl) return;
    previewEl.classList.remove("creator-pop");
    void previewEl.offsetWidth;
    previewEl.classList.add("creator-pop");
  }

  function show() {
    freezeShell();
    mountRoom();
    viewEl.classList.add("is-open");
    paintTabs();
    popPreview();
    requestAnimationFrame(() => {
      paginate();
      room?.resize?.();
      onShow?.();
    });
  }

  function hide() {
    viewEl.classList.remove("is-open");
    previewEl?.classList.remove("creator-pop");
    viewEl.style.transform = "";
    viewEl.style.width = "";
    viewEl.style.height = "";
    viewEl.style.top = "";
    viewEl.style.left = "";
    viewEl.style.maxHeight = "";
    if (windowEl) windowEl.style.transform = "";
    disposeRoom();
  }

  function syncKeyboard() {
    const overlay = overlayEl();
    const covered = keyboardCovered();
    const open = covered > 80;
    const lift = open ? Math.min(0, -(covered - 8)) : 0;
    if (phoneEditOpen()) {
      overlay.classList.toggle("is-keyboard", open);
      overlay.style.setProperty("--creator-kb", `${lift}px`);
      // Never resize or translate the room when the phone editor is open.
      return;
    }
    if (!viewEl) return;
    if (document.body.dataset.view !== "creator") {
      viewEl.classList.remove("is-keyboard");
      viewEl.style.transform = "";
      viewEl.style.setProperty("--creator-kb", "0px");
      return;
    }
    const vv = window.visualViewport;
    // Keep the room pinned to the layout origin if the visual viewport shifts.
    const dx = vv ? -(vv.offsetLeft || 0) : 0;
    const dy = vv ? -(vv.offsetTop || 0) : 0;
    viewEl.style.transform = `translate(${dx}px, ${dy}px)`;
    viewEl.classList.toggle("is-keyboard", open);
    // Lift only the panel; do not resize the room or the character.
    viewEl.style.setProperty("--creator-kb", `${lift}px`);
  }

  function onLayout() {
    if (!editorActive()) return;
    syncKeyboard();
    if (phoneEditOpen()) {
      layoutPhoneAwayFromAvatar();
      paginate();
      return;
    }
    paginate();
    const relocked = relockIfNeeded();
    if (relocked && keyboardCovered() <= 80) {
      room?.resize?.();
      onShow?.();
    }
  }


  function compactEditViewport() {
    return window.innerWidth < 900;
  }

  function selfName() {
    return window.__avatarPose?.()?.name || window.__camState?.()?.follow || null;
  }

  function rectsOverlap(a, b, pad = 0) {
    if (!a || !b) return false;
    return a.x < b.x + b.w - pad && a.x + a.w > b.x + pad && a.y < b.y + b.h - pad && a.y + a.h > b.y + pad;
  }

  let dockedSlotId = null;
  let dockedViewport = "";

  function clearPhoneDock(overlay) {
    dockedSlotId = null;
    dockedViewport = "";
    overlay?.classList.remove("is-compact-edit");
    overlay?.classList.remove("is-short-edit");
    overlay?.style.removeProperty("--edit-phone-left");
    overlay?.style.removeProperty("--edit-phone-top");
    const device = overlay?.querySelector("[data-testid='phone-device']");
    if (device) {
      device.style.removeProperty("width");
      device.style.removeProperty("height");
      device.style.removeProperty("max-height");
      device.style.removeProperty("max-width");
    }
    window.HouseRoom3D?.setEditViewShift?.(0, 0);
  }

  function layoutPhoneAwayFromAvatar() {
    const overlay = overlayEl();
    const device = overlay?.querySelector("[data-testid='phone-device']");
    if (!overlay || !device || !phoneEditOpen()) return;
    // Keep the handset at the home-screen size and corner; the editor
    // scrolls inside. Do not enlarge, dock, or pan the room.
    clearPhoneDock(overlay);
    overlay.classList.remove("is-compact-edit");
    device.style.removeProperty("width");
    device.style.removeProperty("height");
    device.style.removeProperty("max-height");
    device.style.removeProperty("max-width");
    return;
    if (!compactEditViewport()) {
      clearPhoneDock(overlay);
      return;
    }
    overlay.classList.add("is-compact-edit");

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dockH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dock-h")) || 76;
    const safeL = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-left")) || 0;
    const safeR = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-right")) || 0;
    const safeT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-top")) || 0;
    const landscape = vw > vh || (vh - dockH - 8 - (64 + safeT)) < 320;
    const area = {
      left: 8 + safeL,
      top: (landscape ? 8 : 64) + safeT,
      right: vw - 8 - safeR,
      bottom: vh - dockH - 8,
    };
    area.w = Math.max(0, area.right - area.left);
    area.h = Math.max(0, area.bottom - area.top);

    const name = selfName();
    const box = name ? r3?.personBox?.(name) : null;
    const gap = 8;
    let pw = Math.max(1, landscape ? Math.min(300, area.w) : Math.min(188, area.w));
    let ph = Math.max(1, landscape ? Math.min(280, area.h) : Math.min(348, area.h));
    if (!landscape && box) {
      const needW = box.w + gap * 2;
      if (area.w - pw < needW) pw = Math.max(160, Math.min(pw, area.w - needW));
      // Keep the editor tall enough that tab pages don't scroll. If the
      // figure would be covered, setEditViewShift pans the room instead.
    }
    overlay.classList.toggle("is-short-edit", landscape);
    device.style.setProperty("width", `${Math.round(pw)}px`, "important");
    device.style.setProperty("height", `${Math.round(ph)}px`, "important");
    device.style.setProperty("max-width", `${Math.round(pw)}px`, "important");
    device.style.setProperty("max-height", `${Math.round(ph)}px`, "important");

    const slots = [
      { id: "br", x: area.right - pw, y: area.bottom - ph },
      { id: "bl", x: area.left, y: area.bottom - ph },
      { id: "tr", x: area.right - pw, y: area.top },
      { id: "tl", x: area.left, y: area.top },
    ];
    if (landscape) {
      // Prefer a side dock so a short viewport keeps vertical room for the avatar.
      slots.sort((a, b) => {
        const side = (s) => (s.id.endsWith("r") || s.id.endsWith("l") ? 0 : 1);
        return side(a) - side(b);
      });
    }
    if (box) {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const preferRight = cx < (area.left + area.right) / 2;
      const preferTop = cy > (area.top + area.bottom) / 2;
      slots.sort((a, b) => {
        const score = (s) => {
          let n = 0;
          if (preferRight ? s.x >= area.left + area.w / 2 - 1 : s.x <= area.left + 1) n += 2;
          if (preferTop ? s.y <= area.top + 1 : s.y >= area.bottom - ph - 1) n += 1;
          if (landscape && (s.id === "bl" || s.id === "br" || s.id === "tl" || s.id === "tr")) n += 0;
          return -n;
        };
        return score(a) - score(b);
      });
    }

    const pad = 8;
    const clampSlot = (s) => ({
      id: s.id,
      x: Math.min(Math.max(s.x, area.left), Math.max(area.left, area.right - pw)),
      y: Math.min(Math.max(s.y, area.top), Math.max(area.top, area.bottom - ph)),
    });
    const phoneAt = (s) => ({ x: s.x, y: s.y, w: pw, h: ph });
    const vpKey = `${vw}x${vh}`;
    let chosen = null;
    if (dockedViewport === vpKey && dockedSlotId) {
      const sticky = slots.find((s) => s.id === dockedSlotId);
      if (sticky) chosen = clampSlot(sticky);
    } else {
      r3?.setEditViewShift?.(0, 0);
    }
    if (!chosen) {
      chosen = slots.map(clampSlot).find((s) => !box || !rectsOverlap(box, phoneAt(s), pad));
    }
    if (!chosen) chosen = clampSlot(slots[0]);
    dockedSlotId = chosen.id;
    dockedViewport = vpKey;

    const ov = overlay.getBoundingClientRect();
    overlay.style.setProperty("--edit-phone-left", `${Math.round(chosen.x - ov.left)}px`);
    overlay.style.setProperty("--edit-phone-top", `${Math.round(chosen.y - ov.top)}px`);

    const phone = phoneAt(chosen);
    if (box && rectsOverlap(box, phone, pad) && r3?.setEditViewShift) {
      const regions = [
        { x: area.left, y: area.top, w: area.w, h: Math.max(0, phone.y - area.top) },
        { x: area.left, y: phone.y + phone.h, w: area.w, h: Math.max(0, area.bottom - (phone.y + phone.h)) },
        { x: area.left, y: area.top, w: Math.max(0, phone.x - area.left), h: area.h },
        { x: phone.x + phone.w, y: area.top, w: Math.max(0, area.right - (phone.x + phone.w)), h: area.h },
      ].filter((r) => r.w >= box.w + pad * 2 && r.h >= box.h + pad * 2);
      regions.sort((a, b) => b.w * b.h - a.w * a.h);
      const region = regions[0];
      if (region) {
        const tx = Math.min(Math.max(box.x, region.x + pad), region.x + region.w - pad - box.w);
        const ty = Math.min(Math.max(box.y, region.y + pad), region.y + region.h - pad - box.h);
        r3.setEditViewShift(tx - box.x, ty - box.y);
      }
    }
  }

  function openFromPhoneInner() {
    const overlay = overlayEl();
    const mount = document.querySelector("[data-testid='phone-character-editor']");
    const screen = document.getElementById("phone-screen-edit-character");
    if (!overlay || !mount || !windowEl || !screen) return false;
    if (windowEl.parentElement !== mount) {
      phoneHomeParent = windowEl.parentElement;
      phoneHomeNext = windowEl.nextSibling;
      mount.appendChild(windowEl);
    }
    document.getElementById("phone-home")?.classList.add("hidden");
    document.querySelectorAll(".phone-app-screen").forEach((el) => {
      el.classList.toggle("hidden", el !== screen);
    });
    screen.classList.remove("hidden");
    overlay.classList.add("is-character-edit");
    overlay.classList.remove("hidden");
    overlay.classList.remove("is-compact-edit");
    requestAnimationFrame(() => {
      pageIndex = 0;
      layoutPhoneAwayFromAvatar();
      paginate();
      requestAnimationFrame(() => {
        layoutPhoneAwayFromAvatar();
        paginate();
        setTimeout(() => {
          layoutPhoneAwayFromAvatar();
          paginate();
        }, 200);
      });
    });
    return true;
  }

  function closeFromPhoneInner() {
    const overlay = overlayEl();
    overlay?.classList.remove("is-character-edit");
    overlay?.classList.remove("is-keyboard");
    overlay?.classList.remove("is-compact-edit");
    overlay?.style.setProperty("--creator-kb", "0px");
    clearPhoneDock(overlay);
    const screen = document.getElementById("phone-screen-edit-character");
    screen?.classList.add("hidden");
    if (windowEl && phoneHomeParent && windowEl.parentElement !== phoneHomeParent) {
      if (phoneHomeNext && phoneHomeNext.parentElement === phoneHomeParent) {
        phoneHomeParent.insertBefore(windowEl, phoneHomeNext);
      } else {
        phoneHomeParent.appendChild(windowEl);
      }
    }
    phoneHomeParent = null;
    phoneHomeNext = null;
    return true;
  }

  tabsEl.addEventListener("click", onTabClick);
  prevBtn?.addEventListener("click", () => setPage(pageIndex - 1));
  nextBtn?.addEventListener("click", () => setPage(pageIndex + 1));
  document.addEventListener("keydown", onKey);

  let swipeX = 0;
  const swipeTarget = windowEl || panelsEl;
  swipeTarget?.addEventListener("touchstart", (e) => {
    swipeX = e.changedTouches[0]?.clientX || 0;
  }, { passive: true });
  swipeTarget?.addEventListener("touchend", (e) => {
    const x = e.changedTouches[0]?.clientX || 0;
    const dx = x - swipeX;
    if (dx > 40) setPage(pageIndex - 1);
    else if (dx < -40) setPage(pageIndex + 1);
  }, { passive: true });

  window.addEventListener("resize", onLayout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      syncKeyboard();
      // Keyboard must not reflow the room or character.
      if (keyboardCovered() <= 80) onLayout();
    });
    window.visualViewport.addEventListener("scroll", syncKeyboard);
  }
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      if (!editorActive()) return;
      if (keyboardCovered() > 80) return;
      if (phoneEditOpen()) layoutPhoneAwayFromAvatar();
      paginate();
    });
    ro.observe(panelsEl || windowEl || roomEl);
  }

  if (panelsEl && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => {
      if (paging) return;
      if (editorActive()) paginate();
    }).observe(panelsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  paintTabs();

  const phoneFns = {
    openFromPhone: openFromPhoneInner,
    closeFromPhone: closeFromPhoneInner,
    isOpen: phoneEditOpen,
  };
  phoneApi = phoneFns;

  window.__creatorMenu = {
    tabs: TABS.map((t) => t.id),
    tab: () => currentId(),
    setTab: setTabById,
    moveOption,
    activateOption,
    page: () => pageIndex,
    pages: () => pages.length,
    setPage,
    showOption,
    usingRoomBackdrop: () => usingRoom,
    furnitureCount: () => room?.getFurniture?.()?.length || 0,
    openFromPhone: openFromPhoneInner,
    closeFromPhone: closeFromPhoneInner,
    isPhoneEdit: phoneEditOpen,
  };

  return { show, hide, setTab: setTabById, ...phoneFns };
}

export default { initCreatorMenu };
