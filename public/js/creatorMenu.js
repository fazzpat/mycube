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

/* Phone hook: Edit Character calls this; the client then shows the overlay
   via setView("creator"), which invokes show() without leaving the cube. */
export function openFromPhone() {
  return true;
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
    const w = Math.max(120, (box?.clientWidth || 300) - 4);
    const h = Math.max(44, (box?.clientHeight || 120) - 2);
    const swatchPerRow = Math.max(3, Math.floor((w + 4) / 52));
    const choicePerRow = Math.max(3, Math.min(6, Math.floor((w + 4) / 56)));
    return { w, h, swatchPerRow, choicePerRow, headingH: 22, itemH: 48 };
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
    paging = false;
  }

  function paginate() {
    const panel = panelEl(currentId());
    pages = buildPages(panel);
    if (pageIndex >= pages.length) pageIndex = pages.length - 1;
    if (pageIndex < 0) pageIndex = 0;
    applyPage();
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
    if (document.body.dataset.view !== "creator") return;
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
    const covered = keyboardCovered();
    const open = covered > 80;
    viewEl.classList.toggle("is-keyboard", open);
    // Lift only the panel; do not resize the room or the character.
    const lift = open ? Math.min(0, -(covered - 8)) : 0;
    viewEl.style.setProperty("--creator-kb", `${lift}px`);
  }

  function onLayout() {
    if (document.body.dataset.view !== "creator") return;
    syncKeyboard();
    const relocked = relockIfNeeded();
    paginate();
    if (relocked || keyboardCovered() <= 80) {
      if (relocked) {
        room?.resize?.();
        onShow?.();
      }
    }
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
      if (document.body.dataset.view !== "creator") return;
      if (keyboardCovered() > 80) return;
      paginate();
    });
    ro.observe(panelsEl || windowEl || roomEl);
  }

  if (panelsEl && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => {
      if (paging) return;
      if (document.body.dataset.view === "creator") paginate();
    }).observe(panelsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  paintTabs();

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
  };

  return { show, hide, setTab: setTabById };
}

export default { initCreatorMenu };
