/* Arcade start menu over an empty MyCube. Keeps the existing login form
   and every start-flow action reachable without changing post-login views. */
import { createEmptyRoomBackdrop } from "./isoRoom.js";

const OPTIONS = [
  { id: "start", label: "PRESS START", title: "ENTER YOUR NAME", hint: "Jump into your cube." },
  { id: "signin", label: "SIGN IN", title: "SIGN IN", hint: "Welcome back. Enter your username." },
  { id: "new", label: "NEW AVATAR", title: "CREATE YOUR CHARACTER", hint: "Pick a username, then build your look." },
  { id: "about", label: "ABOUT", title: "ABOUT MYCUBE", hint: "" },
];

export function initStartMenu() {
  const roomEl = document.getElementById("start-room");
  const menuEl = document.getElementById("start-menu");
  const aboutEl = document.getElementById("start-about");
  const formEl = document.getElementById("start-form");
  const formTitle = document.getElementById("start-form-title");
  const formHint = document.getElementById("start-form-hint");
  const nameInput = document.getElementById("username-input");
  const optionsEl = document.getElementById("start-options");
  if (!roomEl || !menuEl || !optionsEl) {
    return { show() {}, hide() {}, dispose() {} };
  }

  let index = 0;
  let panel = "menu";
  let room = null;
  let ro = null;

  function optionEls() {
    return [...optionsEl.querySelectorAll("[data-action]")];
  }

  function paintCursor() {
    optionEls().forEach((el, i) => {
      const on = i === index && panel === "menu";
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    const sel = optionEls()[index];
    if (sel) optionsEl.dataset.selected = sel.dataset.action || "";
  }

  function showPanel(name) {
    panel = name;
    menuEl.classList.toggle("hidden", name !== "menu");
    aboutEl?.classList.toggle("hidden", name !== "about");
    formEl?.classList.toggle("hidden", name !== "form");
    paintCursor();
    if (name === "menu") {
      menuEl.focus({ preventScroll: true });
    } else if (name === "form" && nameInput) {
      setTimeout(() => nameInput.focus(), 40);
    } else if (name === "about") {
      aboutEl?.querySelector("[data-testid='start-about-back']")?.focus();
    }
  }

  function openForm(actionId) {
    const opt = OPTIONS.find((o) => o.id === actionId) || OPTIONS[0];
    if (formTitle) formTitle.textContent = opt.title;
    if (formHint) formHint.textContent = opt.hint;
    if (nameInput && opt.id === "signin") {
      const remembered = sessionStorage.getItem("hearthUser");
      if (remembered && !nameInput.value) nameInput.value = remembered;
    }
    showPanel("form");
  }

  function choose(i) {
    index = ((i % OPTIONS.length) + OPTIONS.length) % OPTIONS.length;
    paintCursor();
    const opt = OPTIONS[index];
    if (opt.id === "about") showPanel("about");
    else openForm(opt.id);
  }

  function move(dir) {
    if (panel !== "menu") return;
    index = (index + dir + OPTIONS.length) % OPTIONS.length;
    paintCursor();
  }

  function onKey(e) {
    if (document.body.dataset.view !== "login") return;
    const tag = (e.target && e.target.tagName) || "";
    const typing = tag === "INPUT" || tag === "TEXTAREA";
    if (e.key === "Escape") {
      if (panel !== "menu") {
        e.preventDefault();
        showPanel("menu");
      }
      return;
    }
    if (panel === "menu") {
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter" || e.key === " " || e.key === "Start") {
        e.preventDefault();
        choose(index);
      }
      return;
    }
    if (panel === "about" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      showPanel("menu");
      return;
    }
    if (typing) return;
  }

  function onOptionClick(e) {
    const li = e.target.closest("[data-action]");
    if (!li) return;
    const i = optionEls().indexOf(li);
    if (i < 0) return;
    choose(i);
  }

  function onOptionHover(e) {
    if (window.matchMedia && !window.matchMedia("(hover: hover)").matches) return;
    const li = e.target.closest("[data-action]");
    if (!li || panel !== "menu") return;
    const i = optionEls().indexOf(li);
    if (i < 0 || i === index) return;
    index = i;
    paintCursor();
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

  function show() {
    mountRoom();
    showPanel("menu");
    requestAnimationFrame(() => room?.resize?.());
  }

  function hide() {
    disposeRoom();
  }

  optionsEl.addEventListener("click", onOptionClick);
  optionsEl.addEventListener("pointerover", onOptionHover);
  document.addEventListener("keydown", onKey);
  document.getElementById("start-form-back")?.addEventListener("click", () => showPanel("menu"));
  document.querySelector("[data-testid='start-about-back']")?.addEventListener("click", () => showPanel("menu"));
  window.addEventListener("resize", () => {
    if (document.body.dataset.view === "login") room?.resize?.();
  });
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      if (document.body.dataset.view === "login") room?.resize?.();
    });
    ro.observe(roomEl);
  }

  paintCursor();

  window.__startMenu = {
    options: OPTIONS.map((o) => o.id),
    index: () => index,
    panel: () => panel,
    move,
    choose,
    openForm,
    showMenu: () => showPanel("menu"),
  };

  return { show, hide, dispose: hide };
}

export default { initStartMenu };
