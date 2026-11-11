/* Arcade character-creator shell over the empty MyCube backdrop.
   Does not change avatar drawing or the draft data model — it only
   tabs and restyles the existing option rows, name field, and save/back. */
import { createEmptyRoomBackdrop } from "./isoRoom.js";

const TABS = [
  { id: "body", label: "BODY" },
  { id: "hair", label: "HAIR" },
  { id: "face", label: "FACE" },
  { id: "top", label: "TOP" },
  { id: "bottom", label: "BOTTOM" },
  { id: "shoes", label: "SHOES" },
];

export function initCreatorMenu({ onShow } = {}) {
  const roomEl = document.getElementById("creator-room");
  const viewEl = document.getElementById("view-creator");
  const tabsEl = document.getElementById("creator-tabs");
  const previewEl = document.getElementById("creator-preview");
  if (!roomEl || !viewEl || !tabsEl) {
    return { show() {}, hide() {} };
  }

  let tabIndex = 0;
  let optIndex = 0;
  let room = null;
  let ro = null;

  function tabButtons() {
    return [...tabsEl.querySelectorAll("[data-tab]")];
  }

  function panelEl(id) {
    return document.querySelector(`[data-panel="${id}"]`);
  }

  function currentId() {
    return TABS[tabIndex]?.id || "body";
  }

  function optionButtons(panel) {
    if (!panel) return [];
    return [...panel.querySelectorAll("button.swatch, button.choice, input[type='checkbox']")]
      .filter((el) => !el.closest(".hidden"));
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
    paintOptionCursor();
  }

  function paintOptionCursor() {
    const opts = optionButtons(panelEl(currentId()));
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
    paintTabs();
  }

  function setTabById(id) {
    const i = TABS.findIndex((t) => t.id === id);
    if (i >= 0) setTab(i);
  }

  function moveOption(dir) {
    const opts = optionButtons(panelEl(currentId()));
    if (!opts.length) return;
    optIndex = (optIndex + dir + opts.length) % opts.length;
    paintOptionCursor();
    const el = opts[optIndex];
    el?.scrollIntoView?.({ block: "nearest" });
  }

  function activateOption() {
    const opts = optionButtons(panelEl(currentId()));
    const el = opts[optIndex];
    if (!el) return;
    if (el.matches("input[type='checkbox']")) {
      el.click();
    } else {
      el.click();
    }
    requestAnimationFrame(paintOptionCursor);
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
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveOption(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveOption(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      if (e.target && e.target.closest && e.target.closest("#save-avatar, #creator-back")) return;
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

  function mountRoom() {
    if (room) {
      room.resize?.();
      return;
    }
    room = createEmptyRoomBackdrop(roomEl);
    room.setStyle?.("paint-cream", "wood");
    room.setGridSize?.(6);
    room.setLights?.(true);
    room.clear?.();
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
    mountRoom();
    viewEl.classList.add("is-open");
    paintTabs();
    popPreview();
    requestAnimationFrame(() => {
      room?.resize?.();
      onShow?.();
    });
  }

  function hide() {
    viewEl.classList.remove("is-open");
    previewEl?.classList.remove("creator-pop");
    disposeRoom();
  }

  tabsEl.addEventListener("click", onTabClick);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", () => {
    if (document.body.dataset.view === "creator") {
      room?.resize?.();
      onShow?.();
    }
  });
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      if (document.body.dataset.view === "creator") {
        room?.resize?.();
        onShow?.();
      }
    });
    ro.observe(roomEl);
    const stage = document.querySelector(".creator-hero");
    if (stage) ro.observe(stage);
  }

  // After paintCreator rebuilds swatches, keep the cursor in sync.
  const panels = document.getElementById("creator-tab-panels");
  if (panels && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => {
      if (document.body.dataset.view === "creator") paintOptionCursor();
    }).observe(panels, { childList: true, subtree: true });
  }

  paintTabs();

  window.__creatorMenu = {
    tabs: TABS.map((t) => t.id),
    tab: () => currentId(),
    setTab: setTabById,
    moveOption,
    activateOption,
  };

  return { show, hide, setTab: setTabById };
}

export default { initCreatorMenu };
