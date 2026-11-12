import { createRoom3D, createAvatarPreview } from "./isoRoom.js";
import { drawFurnitureSprite } from "./furnIso.js";
import { drawAvatarSprite, AV_W, AV_H, AV_HEAD_TOP, AV_GROUND_Y } from "./avatar3d.js";
import { initStartMenu } from "./startMenu.js";
import { initCreatorMenu, openFromPhone, closeFromPhone, isPhoneEditOpen } from "./creatorMenu.js";
import { CLOTHING_STOCK, PET_STOCK, PUBLIC_PLACES, clothingSlot, CLOTHING_SLOTS, HAIR_STYLES as CAT_HAIR_STYLES, HAIR_LABELS, TOP_LABELS, BOTTOM_LABELS, ACC_LABELS, BASE_TOPS, BASE_BOTTOMS, BASE_ACCESSORIES, TOPS as CAT_TOPS, BOTTOMS as CAT_BOTTOMS, ACCESSORIES as CAT_ACCESSORIES, HAT_ACCESSORIES, HATS, HAT_LABELS, HAT_COLORS, GLASSES_STYLES, GLASSES_LABELS, GLASSES_COLORS, NECKLACES, NECKLACE_LABELS, SHOE_COLORS, migrateAvatar } from "./storeCatalog.js";
import { DECOR_GROUPS, paintDecorThumb, normalizeDecor, DEFAULT_DECOR } from "./roomDecor.js";
import { canonHex } from "./hexColor.js";
import { openColorWheel, closeColorWheel, isColorWheelOpen } from "./colorWheel.js";
import { ART_PIECES, paintArtThumb, registerArtCatalog, installPaintings } from "./artPieces.js";
import { installWallLayout, switchFloorTile } from "./wallLayout.js";
import { installChessLayout } from "./chessTable.js";
import { startGame, move as cubicsMove, softDrop, hardDrop, tick as cubicsTick, snapshot as cubicsSnap, drawCubics, jokeAt } from "./cubics.js";
import { initChessUI } from "./chess-ui.js";
import {
  TYPE as RECORD_TYPE, VINYLS as RECORD_VINYLS,
  mountRecordPicker, openRecordPicker, closeRecordPicker, isRecordPickerOpen,
  paintRecordPicker, paintListenHint, syncRecordAudio, setRecordVolume, setRecordMuted,
  getRecordAudioState, unlockRecordAudio, playRecordVinyl, vinylById,
  syncRoomRecordAudio, stopRecordAudio,
} from "./recordPlayer.js";
import { paintFridgeThumbs, heldItemLabel } from "./heldItems.js";

(() => {
  const socket = io({ transports: ["websocket", "polling"] });
  const $ = (sel) => document.querySelector(sel);
  const SHOW = (el) => el && el.classList.remove("hidden");
  const HIDE = (el) => el && el.classList.add("hidden");

  const startMenu = initStartMenu();
  const creatorMenu = initCreatorMenu({
    onShow() { state.preview3d?.resize?.(); },
    getBackdropRoom() {
      if (state.creatorReturn === "room" && state.room) return state.room;
      return null;
    },
  });

  window.__lastSays = [];
  window.__joinResults = [];

  installPaintings(window.HouseIso);
  installWallLayout(window.HouseIso);
  installChessLayout(window.HouseIso);
  mountRecordPicker({
    onSelect(id, vinyl) {
      // play() is also invoked in the picker pointer handler; call it here too
      // so a programmatic select still starts audio in the same turn.
      playRecordVinyl(vinyl);
      socket.emit("selectRecordPlayer", { id, vinyl });
    },
    onStop(id) {
      socket.emit("selectRecordPlayer", { id, stop: true });
      syncRecordAudio({ on: false });
    },
    onListen(id) {
      const rec = state.room?.recordPlayers?.[id];
      if (rec?.on && rec.vinyl) playRecordVinyl(rec.vinyl);
      else unlockRecordAudio();
      paintRecordPicker(rec);
    },
    onVolume: setRecordVolume,
    onMute: setRecordMuted,
    getState(id) { return state.room?.recordPlayers?.[id]; },
    onClose() {},
  });
  registerArtCatalog(HouseIso);
  const CATALOG = Object.entries(HouseIso.CATALOG).map(([type, item]) => ({ type, ...item }));

  const state = {
    me: null,
    rooms: [],
    view: "login",
    draft: HearthAvatar.defaults(),
    room: null,
    people: new Map(),
    pendingPlace: null,
    pendingJoin: null,
    room3d: null,
    preview3d: null,
    facing: new Map(),
    creatorReturn: null,
    phoneApp: null,
    editMode: false,
    placeRot: 0,
    selectedFurnId: null,
    movingId: null,
    pendingArrive: null,
    chessId: null,
    chessSel: null,
    fridgeId: null,
    activityId: null,
    lastBoxing: new Map(),
    lastHits: new Map(),
    boxAutoTimer: null,
    gymAutoTimer: null,
    cubicsId: null,
    cubicsGame: null,
    cubicsTimer: null,
    wardId: null,
    wardPreview: null,
    movingWallId: null,
    places: [],
    voice: "speak",
    storeKind: null,
    storeSel: null,
    storePreview: null,
    chatFloats: [],
    chatQuietAt: 0,
  };

  const chessUI = initChessUI({ socket, state, $, SHOW, HIDE });
  const openChessPanel = (...args) => chessUI.openChessPanel(...args);
  const closeChessPanel = (...args) => chessUI.closeChessPanel(...args);


  function syncForeignInputs() {
    // Keep off-screen forms out of the iOS "next field" accessory so chat
    // is a one-step type-and-send, with no arrow hopping.
    const chat = document.getElementById("chat-input");
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      if (el === chat) {
        el.removeAttribute("tabindex");
        return;
      }
      const host = el.closest(".view, .modal, .sheet, .store-panel, .wardrobe-panel, .phone-overlay, #password-modal, #rewards-sheet");
      const buried = Boolean(el.closest(".hidden") || host?.classList.contains("hidden") || host?.inert);
      if (buried) {
        el.setAttribute("tabindex", "-1");
      } else {
        el.removeAttribute("tabindex");
      }
    });
  }

  function setView(name) {
    state.view = name;
    document.body.dataset.view = name;
    ["login", "creator", "lobby", "room"].forEach((v) => {
      const el = document.getElementById("view-" + v);
      if (v === name) {
        SHOW(el);
        if (el) el.inert = false;
      } else {
        HIDE(el);
        if (el) el.inert = true;
      }
    });
    syncForeignInputs();
    if (name === "login") startMenu.show();
    else startMenu.hide();
    if (name === "creator") creatorMenu.show();
    else creatorMenu.hide();
    if (name === "room") {
      lockPageScroll();
      syncAppShell();
    }
  }

  let lastTvToastKey = "";
  function maybeTvChannelToast(force) {
    const me = state.people.get(state.me?.username) || state.me;
    if (!me?.sitting) {
      lastTvToastKey = "";
      return;
    }
    const facing = me.facing || { x: 0, z: 1 };
    const tvs = state.room?.tvs || {};
    let best = null, bestScore = 0;
    for (const furn of state.room?.furniture || []) {
      if (furn.type !== "tv" && furn.type !== "holotv") continue;
      if (!tvs[furn.id]?.on) continue;
      const dx = (furn.x + 0.5) - (me.x ?? 0);
      const dy = (furn.y + 0.5) - (me.y ?? 0);
      const len = Math.hypot(dx, dy);
      if (len < 0.4 || len > 5.5) continue;
      const dot = (facing.x * dx + (facing.z || 0) * dy) / len;
      if (dot < 0.35) continue;
      const score = dot * 2 - len * 0.15;
      if (score > bestScore) { bestScore = score; best = furn; }
    }
    if (!best) return;
    const name = state.room3d?.tvChannelName?.(best.id) || "";
    if (!name) return;
    const key = best.id + ":" + name;
    if (!force && key === lastTvToastKey) return;
    lastTvToastKey = key;
    toast("Now playing · " + name);
  }

  function toast(message, actions, extraClass) {
    const el = document.createElement("div");
    el.className = extraClass ? `toast ${extraClass}` : "toast";
    el.innerHTML = `<div>${escapeHtml(message)}</div>`;
    if (actions?.length) {
      const row = document.createElement("div");
      row.className = "toast-actions";
      actions.forEach((a) => {
        const b = document.createElement("button");
        b.className = "btn small";
        b.textContent = a.label;
        b.dataset.testid = a.testId || "toast-action";
        b.addEventListener("click", () => {
          el.remove();
          a.onClick();
        });
        row.appendChild(b);
      });
      el.appendChild(row);
    }
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), actions ? 8000 : 3000);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function displayOf(person) {
    return person.avatar?.displayName || person.username;
  }

  /* ---------- login preview ---------- */
  function paintLoginPreview() {
    const row = $("#login-preview");
    if (!row) return;
    const samples = [
      { skin: "#f1c27d", hair: "bun", hairColor: "#6b3a2a", shirt: "#ff7a59" },
      { skin: "#c68642", hair: "curly", hairColor: "#2b1d16", shirt: "#6c7bff" },
      { skin: "#ffdfc4", hair: "spiky", hairColor: "#d4a017", shirt: "#7bc47f" },
    ];
    row.innerHTML = samples.map((a) => HearthAvatar.svg(a, { size: 78 })).join("");
  }

  /* ---------- creator ---------- */

  const optionThumbCache = new Map();
  function paintOptionThumb(canvas, kind, value, draft) {
    if (!canvas) return;
    const d = migrateAvatar(draft || {});
    const key = [kind, value, d.skin, d.hair, d.hairColor, d.top, d.shirt, d.bottom, d.bottomColor, d.shoes, d.shoeColor, d.accessory, d.hat, d.hatColor, d.glassesStyle, d.glassesColor, d.necklace].join("|");
    const ctx = canvas.getContext("2d");
    const w = canvas.width || 72, h = canvas.height || 72;
    ctx.imageSmoothingEnabled = false;
    const cached = optionThumbCache.get(key);
    if (cached) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(cached, 0, 0, w, h);
      return;
    }
    const av = migrateAvatar({ ...HearthAvatar.defaults(), ...d });
    if (kind === "hair") { av.hair = value; av.hat = "none"; if (HAT_ACCESSORIES.has(av.accessory)) av.accessory = "none"; }
    else if (kind === "hat") {
      av.hat = value;
      av.accessory = value === "none" ? (HAT_ACCESSORIES.has(av.accessory) ? "none" : av.accessory) : value;
      // Short hair so the hat silhouette is not buried in a bulky cut.
      if (value !== "none") av.hair = "short";
    }
    else if (kind === "glasses") { av.glassesStyle = value; av.glasses = value !== "none"; av.hat = "none"; }
    else if (kind === "necklace") { av.necklace = value; }
    else if (kind === "face") { av.accessory = value; }
    else if (kind === "top") av.top = value;
    else if (kind === "bottom") av.bottom = value;
    else if (kind === "shoes") av.shoes = value;
    const facing = { x: 0, z: 1 };
    const spr = drawAvatarSprite(av, { facing }, 0);
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const octx = off.getContext("2d");
    octx.imageSmoothingEnabled = false;
    octx.fillStyle = "#f7efe0";
    octx.fillRect(0, 0, w, h);
    let sx = 0, sy = 0, sw = spr.w, sh = spr.h;
    const midX = (wide) => { sx = Math.max(0, (spr.w - wide) / 2); sw = Math.min(wide, spr.w - sx); };
    if (kind === "hair") {
      // Hair plus enough face that the cut reads as a head, not a floating blob.
      sy = 0;
      sh = Math.min(spr.h, 48);
      midX(56);
    } else if (kind === "hat" || kind === "face") {
      // Full head so the actual hat sits on a face.
      sy = 0;
      sh = Math.min(spr.h, 50);
      midX(56);
    } else if (kind === "glasses") {
      // Eyes sit mid-face; include hairline to chin.
      sy = Math.max(0, AV_HEAD_TOP - 4);
      sh = Math.min(spr.h - sy, 46);
      midX(56);
    } else if (kind === "necklace") {
      // Chin to upper chest, tightly cropped so the gold chain or diamond reads.
      sy = Math.max(0, AV_HEAD_TOP + 22);
      sh = Math.min(spr.h - sy, 28);
      midX(44);
    } else if (kind === "shoes") {
      sy = Math.max(0, AV_GROUND_Y - 16);
      sh = Math.min(spr.h - sy, 20);
    } else if (kind === "bottom") {
      sy = Math.max(0, AV_HEAD_TOP + 28);
      sh = Math.min(spr.h - sy, 36);
    } else if (kind === "top") {
      sy = Math.max(0, AV_HEAD_TOP + 8);
      sh = Math.min(spr.h - sy, 38);
    }
    const scale = Math.max(1, Math.floor(Math.min((w - 2) / sw, (h - 2) / sh)));
    const dw = sw * scale, dh = sh * scale;
    octx.drawImage(spr.c, sx, sy, sw, sh, Math.floor((w - dw) / 2), Math.floor((h - dh) / 2), dw, dh);
    if (optionThumbCache.size > 400) optionThumbCache.clear();
    optionThumbCache.set(key, off);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(off, 0, 0, w, h);
  }

    function colorAvoidRects() {
      return [
        document.querySelector(".edit-char-preview-wrap"),
        document.querySelector("#creator-preview"),
        document.querySelector("#ward-preview"),
        document.querySelector(".room3d-root"),
        document.querySelector("#floor"),
      ];
    }
    function colorWithinEl() {
      return document.querySelector("#edit-char-overlay:not(.hidden), .edit-char-overlay:not(.hidden)")
        || document.querySelector("#edit-inventory:not(.hidden)")
        || document.querySelector(".wardrobe-panel:not(.hidden)")
        || document.body;
    }
    function rememberCustom(key, hex, kind) {
      const bag = kind === "decor" ? "customDecorColors" : "customColors";
      state[bag] = { ...(state[bag] || {}), [key]: hex };
    }
    function appendColorWheelSwatch(el, key, list, hooks = {}) {
      if (!el) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch color-wheel-swatch";
      b.dataset.testid = `${key}-wheel`;
      b.setAttribute("aria-label", "Custom color");
      const current = hooks.getValue ? hooks.getValue() : state.draft?.[key];
      const saved = canonHex((hooks.customBag === "decor" ? state.customDecorColors : state.customColors)?.[key]);
      const custom = (canonHex(current) && !(list || []).includes(current) ? canonHex(current) : null) || saved;
      if (custom) {
        b.classList.add("has-custom");
        b.style.setProperty("--custom-color", custom);
      }
      if (canonHex(current) && !(list || []).includes(current)) b.classList.add("selected");
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const start = canonHex(hooks.getValue ? hooks.getValue() : state.draft?.[key]) || custom || (list && list[0]) || "#ff4d6d";
        openColorWheel({
          anchor: b,
          color: start,
          avoid: colorAvoidRects(),
          within: colorWithinEl(),
          onLive(hex) {
            rememberCustom(key, hex, hooks.customBag);
            b.classList.add("has-custom", "selected");
            b.style.setProperty("--custom-color", hex);
            el.querySelectorAll(".swatch").forEach((s) => { if (s !== b) s.classList.remove("selected"); });
            hooks.onLive?.(hex, b);
          },
          onClose() { hooks.onClose?.(); },
        });
      });
      el.appendChild(b);
    }
    function paintCreator() {
    const box = $("#creator-preview");
    if (!state.preview3d) {
      box.innerHTML = "";
      state.preview3d = createAvatarPreview(box, { transparent: true, minScale: 3 });
    }
    state.draft = migrateAvatar(state.draft || {});
    state.preview3d.setAvatar(state.draft);
    if (isPhoneEditOpen()) applyDraftLive();
    paintPhoneEditPreview();
    $("#creator-user").textContent = state.me?.username || "";
    if (!$("#display-name").value) {
      $("#display-name").value = state.draft.displayName || state.me?.username || "";
    }

    const labelsFor = { hair: HAIR_LABELS, top: TOP_LABELS, bottom: BOTTOM_LABELS, accessory: ACC_LABELS, hat: HAT_LABELS, glassesStyle: GLASSES_LABELS, necklace: NECKLACE_LABELS, shoes: { white: "White", black: "Black", red: "Red", gum: "Gum", skate: "Skate", hightop: "High-top", boots: "Boots", checker: "Checker" } };
    const swatch = (list, key, el, asColor, thumbKind) => {
      if (!el) return;
      el.innerHTML = "";
      list.forEach((val, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = asColor ? "swatch" : "choice";
        const pretty = asColor
          ? `${key} ${val}`
          : (labelsFor[key]?.[val] || (typeof val === "string" ? val : String(val)));
        b.title = pretty;
        b.setAttribute("aria-label", pretty);
        b.dataset.testid = `${key}-${i}`;
        const field = key;
        if (asColor) {
          b.style.background = val;
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = 72;
          canvas.height = 72;
          canvas.setAttribute("aria-hidden", "true");
          b.appendChild(canvas);
          paintOptionThumb(canvas, thumbKind || key, val, state.draft);
        }
        if (state.draft[field] === val) b.classList.add("selected");
        b.addEventListener("click", () => {
          state.draft[field] = val;
          if (field === "hatColor") state.draft.headphoneColor = val;
          if (field === "glassesStyle") state.draft.glasses = val !== "none";
          if (field === "hat") state.draft.accessory = val === "none" ? (state.draft.accessory && !HAT_ACCESSORIES.has(state.draft.accessory) ? state.draft.accessory : "none") : val;
          paintCreator();
        });
        el.appendChild(b);
      });
      if (asColor) appendColorWheelSwatch(el, key, list, {
        onLive(hex) {
          state.draft[key] = hex;
          if (key === "hatColor") state.draft.headphoneColor = hex;
          state.preview3d?.setAvatar(state.draft);
          if (typeof isPhoneEditOpen === "function" && isPhoneEditOpen()) applyDraftLive();
          paintPhoneEditPreview();
        },
        onClose() { paintCreator(); },
      });
    };
    swatch(HearthAvatar.SKINS, "skin", $("#skin-choices"), true);
    swatch(HearthAvatar.HAIR_STYLES, "hair", $("#hair-choices"), false, "hair");
    swatch(HearthAvatar.HAIR_COLORS, "hairColor", $("#hair-color-choices"), true);
    swatch(HearthAvatar.SHIRTS, "shirt", $("#shirt-choices"), true);
    swatch(HearthAvatar.TOPS, "top", $("#top-choices"), false, "top");
    swatch(HearthAvatar.BOTTOMS, "bottom", $("#bottom-choices"), false, "bottom");
    swatch(HearthAvatar.BOTTOM_COLORS, "bottomColor", $("#bottom-color-choices"), true);
    swatch(HearthAvatar.SHOES, "shoes", $("#shoes-choices"), false, "shoes");
    swatch(SHOE_COLORS, "shoeColor", $("#shoe-color-choices"), true);
    swatch(HATS, "hat", $("#hat-choices"), false, "hat");
    swatch(HAT_COLORS, "hatColor", $("#hat-color-choices"), true);
    swatch(GLASSES_STYLES, "glassesStyle", $("#glasses-choices"), false, "glasses");
    swatch(GLASSES_COLORS, "glassesColor", $("#glasses-color-choices"), true);
    swatch(NECKLACES, "necklace", $("#necklace-choices"), false, "necklace");
    const gToggle = $("#glasses-toggle");
    if (gToggle) gToggle.checked = state.draft.glassesStyle && state.draft.glassesStyle !== "none";
  }

  /* ---------- lobby ---------- */
  function updateCoins() {
    const n = state.me?.coins ?? 50;
    const lobby = $("#lobby-coins");
    const room = $("#room-coins");
    if (lobby) lobby.textContent = n;
    if (room) room.textContent = n;
    const shop = $("#shop-panel-coins");
    if (shop) shop.textContent = `🪙 ${n}`;
    updatePhoneBadge();
    if (typeof coinsPanelOpen === "function" && coinsPanelOpen()) paintCoinsPanel();
  }

  function showAddSheet() {
    SHOW($("#add-sheet"));
  }
  function hideAddSheet() {
    HIDE($("#add-sheet"));
  }

  const GATHERING_COOLDOWN_MS = 5 * 60 * 1000;
  const gatheringNotices = new Map();
  let askedNotifPerm = false;

  function friendRank(f) {
    if (f.roomId) return 0;
    if (f.online) return 1;
    return 2;
  }

  function sortedFriends(friends) {
    return [...friends].sort((a, b) => {
      const d = friendRank(a) - friendRank(b);
      if (d) return d;
      const an = (a.displayName || a.username || "").toLowerCase();
      const bn = (b.displayName || b.username || "").toLowerCase();
      return an.localeCompare(bn);
    });
  }

  function friendGatherings(friends) {
    const byRoom = new Map();
    for (const f of friends) {
      if (!f.roomId) continue;
      if (!byRoom.has(f.roomId)) byRoom.set(f.roomId, []);
      byRoom.get(f.roomId).push(f);
    }
    return [...byRoom.entries()]
      .map(([roomId, people]) => ({
        roomId,
        people,
        roomName: people[0].roomName,
        locked: people[0].locked,
      }))
      .filter((g) => g.people.length >= 2);
  }

  function gatheringKey(g) {
    return `${g.roomId}:${g.people.map((p) => p.username).sort().join(",")}`;
  }

  function formatGathering(g) {
    const names = g.people.map((p) => p.displayName || p.username);
    const where = g.roomName || "a cube";
    let who;
    if (names.length === 2) who = `${names[0]} and ${names[1]}`;
    else if (names.length === 3) who = `${names[0]}, ${names[1]}, and ${names[2]}`;
    else who = `${names[0]}, ${names[1]}, and ${names.length - 2} others`;
    return `${who} are hanging out in ${where}`;
  }

  function notifyBrowser(text, roomId) {
    if (typeof Notification === "undefined") return;
    try {
      if (Notification.permission === "granted") {
        const n = new Notification("MyCube", { body: text, tag: `mycube-${roomId}` });
        n.onclick = () => {
          try { window.focus(); } catch {}
          tryJoin(roomId);
          n.close();
        };
      } else if (Notification.permission === "default" && !askedNotifPerm) {
        askedNotifPerm = true;
        Notification.requestPermission().catch(() => {});
      }
    } catch (_) {}
  }

  function maybeNotifyGatherings(gatherings) {
    if (state.view !== "lobby") return;
    const now = Date.now();
    const active = new Set(gatherings.map(gatheringKey));
    for (const [key, ts] of [...gatheringNotices]) {
      if (!active.has(key) && now - ts > GATHERING_COOLDOWN_MS) {
        gatheringNotices.delete(key);
      }
    }
    for (const g of gatherings) {
      if (state.room?.id === g.roomId) continue;
      const key = gatheringKey(g);
      if (gatheringNotices.has(key)) continue;
      gatheringNotices.set(key, now);
      const text = formatGathering(g);
      toast(text, [{ label: "Join", testId: "together-toast-join", onClick: () => tryJoin(g.roomId) }]);
      notifyBrowser(text, g.roomId);
    }
  }

  function paintTogetherBanner(gatherings) {
    const banner = $("#together-banner");
    if (!banner) return;
    const visible = gatherings.filter((g) => state.room?.id !== g.roomId);
    if (!visible.length) {
      HIDE(banner);
      banner.dataset.roomId = "";
      return;
    }
    const g = [...visible].sort((a, b) => b.people.length - a.people.length)[0];
    $("#together-banner-text").textContent = formatGathering(g);
    banner.dataset.roomId = g.roomId;
    SHOW(banner);
  }

  function ingestRooms(rooms) {
    const list = rooms || [];
    state.places = list.filter((r) => r.place);
    state.rooms = list.filter((r) => !r.place);
  }

  function paintPlaces() {
    const el = $("#places-list");
    const panel = $("#places-panel");
    if (!el) return;
    const places = (state.places || []).filter((r) => r && r.id);
    if (!places.length) {
      if (panel) HIDE(panel);
      el.innerHTML = "";
      return;
    }
    if (panel) SHOW(panel);
    el.innerHTML = places
      .map((r) => `<button type="button" class="place-card" data-testid="place-${r.id}" data-shop="${r.shop || ""}" data-join-place="${r.id}"><strong>${escapeHtml(r.name)}</strong><span>${r.occupantCount || 0} inside · tap to visit</span></button>`)
      .join("");
    el.querySelectorAll("[data-join-place]").forEach((btn) => {
      btn.addEventListener("click", () => tryJoin(btn.dataset.joinPlace));
    });
  }

  function paintLobby() {
    if (!state.me) return;
    $("#lobby-user").textContent = state.me.username;
    updateCoins();
    paintPlaces();

    const list = $("#room-list");
    if (!state.rooms.length) {
      list.innerHTML = `<div class="contact-empty" data-testid="rooms-empty">No public cubes right now. Start one above.</div>`;
    } else {
      list.innerHTML = state.rooms
        .map((r) => {
          return `
        <button type="button" class="contact-row" data-testid="room-item-${r.id}" data-join-room="${r.id}">
          <div class="contact-avatar"><div class="contact-fallback">${r.locked ? "🔒" : "Cube"}</div></div>
          <div class="contact-copy">
            <div class="contact-name">${escapeHtml(r.name)}</div>
            <div class="contact-sub">${r.occupantCount} inside · ${escapeHtml(r.owner)}${r.locked ? ' <span class="lock-icon">🔒</span>' : ""}</div>
          </div>
        </button>`;
        })
        .join("");
      list.querySelectorAll("[data-join-room]").forEach((btn) => {
        btn.addEventListener("click", () => tryJoin(btn.dataset.joinRoom));
      });
    }

    const allFriends = state.me.friends || [];
    const gatherings = friendGatherings(allFriends);
    paintTogetherBanner(gatherings);
    maybeNotifyGatherings(gatherings);

    const q = ($("#friend-search")?.value || "").trim().toLowerCase();
    const friends = sortedFriends(allFriends).filter((f) => {
      if (!q) return true;
      const hay = `${f.displayName || ""} ${f.username || ""} ${f.roomName || ""}`.toLowerCase();
      return hay.includes(q);
    });

    const fl = $("#friend-list");
    if (!allFriends.length) {
      fl.innerHTML = `<div class="contact-empty" data-testid="friends-empty">No friends yet. Tap + to add someone by username.</div>`;
    } else if (!friends.length) {
      fl.innerHTML = `<div class="contact-empty" data-testid="friends-empty">No friends match that search.</div>`;
    } else {
      fl.innerHTML = friends
        .map((f) => {
          const name = f.displayName || f.username;
          const group = gatherings.find((g) => g.roomId === f.roomId);
          const others = group ? group.people.filter((p) => p.username !== f.username) : [];
          const withNames = others.slice(0, 2).map((p) => escapeHtml(p.displayName || p.username)).join(" & ");
          let where;
          if (f.roomName) {
            where = `In ${escapeHtml(f.roomName)}${f.locked ? ' <span class="lock-icon" aria-label="locked">🔒</span>' : ""}`;
            if (withNames) where += ` · with ${withNames}`;
          } else if (f.online) {
            where = "Online";
          } else {
            where = "Offline";
          }
          const togetherChip = group
            ? ` <span class="together-chip" data-testid="together-chip">together</span>`
            : "";
          const thumb = f.avatar
            ? HearthAvatar.svg(f.avatar, { size: 64 })
            : `<div class="contact-fallback">${escapeHtml((name || "?")[0].toUpperCase())}</div>`;
          return `
          <button type="button" class="contact-row${f.roomId ? " in-cube" : " idle"}"
            data-testid="friend-item-${escapeHtml(f.username)}"
            data-join-friend="${escapeHtml(f.username)}"
            data-join-room="${f.roomId || ""}">
            <div class="contact-avatar">${thumb}${f.online ? '<span class="online-dot"></span>' : ""}</div>
            <div class="contact-copy">
              <div class="contact-name">${escapeHtml(name)}${togetherChip}</div>
              <div class="contact-sub" data-testid="friend-status-${escapeHtml(f.username)}">${where}</div>
            </div>
          </button>`;
        })
        .join("");
      fl.querySelectorAll(".contact-row").forEach((row) => {
        row.addEventListener("click", () => {
          if (row.dataset.joinRoom) tryJoin(row.dataset.joinRoom);
          else toast("They're not in a cube right now.");
        });
      });
    }
  }

  function tryJoin(roomId, password) {
    const room = (state.rooms || []).find((r) => r.id === roomId) || (state.places || []).find((r) => r.id === roomId) || PUBLIC_PLACES.find((r) => r.id === roomId);
    const invited = (state.me?.invites || []).some((i) => i.roomId === roomId);
    if (room?.locked && password == null && !invited && room.owner !== state.me?.username) {
      state.pendingJoin = roomId;
      $("#password-modal-copy").textContent = `“${room.name}” is locked. Enter the password, or wait for an invite.`;
      $("#join-password").value = "";
      SHOW($("#password-modal"));
      $("#join-password").focus();
      return;
    }
    socket.emit("joinRoom", { roomId, password });
  }

  /* ---------- 3D room helpers ---------- */
  function blockedNow() {
    return HouseIso.blockedSet(state.room?.furniture || []);
  }

  window.addEventListener("resize", () => {
    if (state.view === "room") {
      state.room3d?.resize();
      syncCamToggle();
    }
  });

  function furnitureSVG(type) {
    return HouseIso.furnitureSVG(type);
  }

  function personRecord(p) {
    const existing = state.people.get(p.username) || {};
    return {
      username: p.username,
      avatar: p.avatar,
      x: existing.x ?? p.x,
      y: existing.y ?? p.y,
      destX: p.x,
      destY: p.y,
      path: existing.path || null,
      sitting: p.sitting,
      lying: p.lying,
      lyingAt: p.lyingAt,
      walking: false,
      emote: p.emote ?? existing.emote ?? null,
      actionEmote: p.actionEmote ?? existing.actionEmote ?? null,
      actionEmoteAt: p.actionEmoteAt ?? existing.actionEmoteAt ?? null,
      usingPhone: p.usingPhone ?? existing.usingPhone ?? false,
      bubble: existing.bubble || null,
      bubbleUntil: existing.bubbleUntil || 0,
      bubbles: existing.bubbles || [],
      typing: existing.typing || false,
      typingAt: existing.typingAt || 0,
      talkAt: existing.talkAt || 0,
      talkText: existing.talkText || "",
      talkUntil: existing.talkUntil || 0,
      heldProp: p.heldProp ?? existing.heldProp ?? null,
      activePet: p.activePet ?? existing.activePet ?? null,
      heldItem: p.heldItem ?? existing.heldItem ?? null,
      boxing: p.boxing ?? existing.boxing ?? null,
      gym: p.gym ?? existing.gym ?? null,
      facing: p.facing ?? existing.facing ?? null,
      stationId: p.stationId ?? existing.stationId ?? null,
      dirX: existing.dirX,
      dirZ: existing.dirZ,
    };
  }

  function setPersonDest(p, x, y, sitting, lying) {
    p.destX = x;
    p.destY = y;
    p.sitting = sitting;
    if (lying != null) p.lying = Boolean(lying);
    if (sitting) p.lying = false;
    if (sitting || lying) {
      p.x = x;
      p.y = y;
      p.path = null;
      p.walking = false;
      return;
    }
    const path = HouseIso.pathfind({ x: p.x, y: p.y }, { x, y }, blockedNow(), state.room?.size || 6);
    p.path = path && path.length ? path : [{ x, y }];
  }

  function ensureRoom3D() {
    if (state.room3d) return state.room3d;
    const el = $("#floor");
    state.room3d = createRoom3D(el);
    window.HouseRoom3D = state.room3d;
    state.room3d.onTileClick(handleTileClick);
    state.room3d.onTileHover((tx, ty) => {
      if (state._grabbing) {
        if (state.pendingPet) updatePetPlaceHighlight(tx, ty);
        else if (state.pendingPlace || state.movingId) updatePlaceHighlight(tx, ty);
      }
    });
    state.room3d.onPetClick?.(handlePetClick);
    state.room3d.setFurnInteractive?.((type) => {
      if (state.editMode || state.pendingPlace || state.movingId) return true;
      if (state.room?.shop && isShopProp(type)) return true;
      return isUseableFurn(type);
    });
    state.room3d.onFurnitureClick(handleFurnitureClick);
    state.room3d.onGrabStart?.(handleGrabStart);
    state.room3d.onGrabMove?.(handleGrabMove);
    state.room3d.onGrabEnd?.(handleGrabEnd);
    const toggleLights = () => {
      const on = !(state.room?.lightsOn !== false);
      socket.emit("setLights", { on });
    };
    state.room3d.onSwitchClick(toggleLights);
    state.room3d.onSwitchTap?.(() => {
      const me = state.people.get(state.me?.username);
      const n = state.room?.size || 6;
      const dest = switchFloorTile(n);
      if (!me || Math.hypot(dest.x - me.x, dest.y - me.y) < 0.85) {
        toggleLights();
        return;
      }
      const blocked = blockedNow();
      let goal = dest;
      if (blocked.has(dest.x + "," + dest.y) || !inBoundsTile(dest.x, dest.y, n)) {
        const cands = [];
        for (const [dx, dy] of [[0, 1], [0, 0], [-1, 0], [1, 0], [0, -1]]) {
          const x = dest.x + dx, y = dest.y + dy;
          if (!inBoundsTile(x, y, n) || blocked.has(x + "," + y)) continue;
          cands.push({ x, y, d: Math.hypot(x - me.x, y - me.y) });
        }
        cands.sort((a, b) => a.d - b.d);
        if (!cands.length) { toggleLights(); return; }
        goal = cands[0];
      }
      if (Math.hypot(goal.x - me.x, goal.y - me.y) < 0.85) {
        toggleLights();
        return;
      }
      const path = HouseIso.pathfind({ x: me.x, y: me.y }, { x: goal.x, y: goal.y }, blocked, n);
      if (!path) { toggleLights(); return; }
      state.pendingArrive = { x: goal.x, y: goal.y, fn: toggleLights };
      state.room3d?.setMoveTarget?.(goal.x, goal.y);
      setPersonDest(me, goal.x, goal.y, false);
      socket.emit("move", { x: goal.x, y: goal.y });
    });
    state.room3d.onWallHover((wall, slot) => updateWallHighlight(wall, slot));
    state.room3d.onWallClick((wall, slot, art) => handleWallClick(wall, slot, art));
    return state.room3d;
  }

  function mountRoom(room) {
    state.room = room;
    state.people = new Map();
    state.chatFloats = [];
    state.chatQuietAt = 0;
    (room.people || []).forEach((p) => {
      const rec = personRecord(p);
      rec.x = p.x;
      rec.y = p.y;
      rec.destX = p.x;
      rec.destY = p.y;
      state.people.set(p.username, rec);
    });
    $("#room-title").textContent = "Cube: " + room.name;
    $("#room-meta").textContent = "Owner: " + room.owner;
    updatePhoneBadge();
    syncEditRoomButton();
    const r3 = ensureRoom3D();
    r3.setGridSize(room.size || 6);
    r3.setStyle(room.wallpaper || "paint-cream", room.floorStyle || "wood");
    r3.setDecor?.(normalizeDecor(room));
    r3.setFurniture(room.furniture || []);
    r3.setPlacedPets?.(room.pets || []);
    r3.setNpcs?.(room.npcs || []);
    r3.setLights(room.lightsOn !== false);
    r3.setUses(room.uses || {});
    r3.setChessMap(room.chess || {});
    r3.setTvs(room.tvs || {});
    r3.setRecordPlayers(room.recordPlayers || {});
    syncRoomRecordAudio(room.recordPlayers || {});
    r3.setWallArt(room.wallArt || []);
    r3.setArcade(room.arcade || {});
    r3.setServerTime(room.serverTime || Date.now());
    state.room.lightsOn = room.lightsOn !== false;
    state.room.uses = room.uses || {};
    state.room.chess = room.chess || {};
    state.room.tvs = room.tvs || {};
    state.room.recordPlayers = room.recordPlayers || {};
    state.room.wallArt = room.wallArt || [];
    state.room.seats = room.seats || {};
    state.room.arcade = room.arcade || {};
    state.room.pets = room.pets || [];
    hideAddSheet();
    setView("room");
    r3.setFollowName(state.me?.username || null);
    r3.resize();
    renderPeople();
    syncCamToggle();
    chessUI.restoreAfterMount();
  }

  function renderFloorStatic() {
    state.room3d?.setFurniture(state.room?.furniture || []);
    state.room3d?.setPlacedPets?.(state.room?.pets || []);
  }

  function addFurnitureEl(f) {
    state.room3d?.addFurniture(f);
  }

  function renderPeople() {
    if (state.room3d) state.room3d.syncPeople([...state.people.values()]);
    paintOverlays();
  }

  const NAME_TABS = [
    { bg: "#3a6fd8", fg: "#ffffff" },
    { bg: "#6b7d2a", fg: "#ffffff" },
    { bg: "#e6c84a", fg: "#1a1408" },
    { bg: "#d32f2f", fg: "#ffffff" },
  ];
  function nameTabOf(username) {
    let h = 0;
    const s = String(username || "");
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return NAME_TABS[Math.abs(h) % NAME_TABS.length];
  }
  function bubbleMarkup(p, text, fading) {
    const tab = nameTabOf(p.username);
    const fade = fading ? " fade" : "";
    return `<div class="speech-bubble${fade}"><span class="bubble-name" style="background:${tab.bg};color:${tab.fg}">${escapeHtml(displayOf(p))}</span><span class="bubble-text">${escapeHtml(text)}</span></div>`;
  }

  const CHAT_MAX = 120;
  const CHAT_ROW_H = 24;
  const CHAT_STACK_GAP = 6;
  const CHAT_RISE_STEP = 24;
  const CHAT_ROW_MS = 2250;
  function layoutChatRows(baseY, heights) {
    const list = state.chatFloats || [];
    if (!list.length) return;
    let y = baseY;
    for (let i = list.length - 1; i >= 0; i--) {
      const row = list.length - 1 - i;
      list[i].row = row;
      list[i].targetY = y;
      const h = Math.max(CHAT_ROW_H, heights?.[i] || list[i].height || CHAT_ROW_H);
      y -= h + CHAT_STACK_GAP;
    }
  }
  function pushChatFloat(p, text) {
    const layer = document.getElementById("bubble-layer");
    const W = layer?.clientWidth || 1;
    let x = W / 2, headY = 160;
    const pos = state.room3d?.projectHead?.(p.username);
    if (pos) {
      x = pos.x;
      // Just above the head (and the name tag that sits over it).
      headY = (pos.y || 160) - 22;
    }
    if (!state.chatFloats) state.chatFloats = [];
    state.chatFloats.push({
      id: p.username + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      username: p.username,
      text,
      x,
      targetY: headY,
      row: 0,
    });
    // Global rows: newest lowest at the speaker's head, older rows stacked above
    // it so a foreground speaker cannot sit below a newer line.
    layoutChatRows(headY);
    state.chatQuietAt = Date.now();
  }
  function stepChatRows() {
    if (!state.chatFloats) state.chatFloats = [];
    if (!state.chatFloats.length) return;
    for (const b of state.chatFloats) b.targetY -= CHAT_RISE_STEP;
    for (let i = 0; i < state.chatFloats.length; i++) {
      state.chatFloats[i].row = state.chatFloats.length - 1 - i;
    }
    state.chatQuietAt = Date.now();
  }

  function paintOverlays() {
    const layer = document.getElementById("bubble-layer");
    if (!layer || !state.room3d) return;
    const W = layer.clientWidth || 1;
    const H = layer.clientHeight || 1;
    const PAD = 10;
    const now = Date.now();
    const seen = new Set();
    for (const p of state.people.values()) {
      const pos = state.room3d.projectHead(p.username);
      if (!pos || !pos.visible) continue;
      let nameEl = layer.querySelector(`[data-name="${cssEscape(p.username)}"]`);
      if (!nameEl) {
        nameEl = document.createElement("div");
        nameEl.className = "person-name";
        nameEl.dataset.name = p.username;
        if (p.username === state.me?.username) nameEl.dataset.testid = "my-avatar";
        else nameEl.dataset.testid = "avatar-" + p.username;
        layer.appendChild(nameEl);
      }
      nameEl.textContent = displayOf(p);
      let nx = Math.min(Math.max(pos.x, 48), W - 48);
      // Names sit just above the head, on the overlay, so furniture never covers them.
      let ny = Math.min(Math.max(pos.y - 4, 22), H - 22);
      nameEl.style.left = nx + "px";
      nameEl.style.top = ny + "px";
      nameEl.style.zIndex = "8";
      seen.add("n:" + p.username);

      const active = (p.bubbles || []).filter((b) => now < b.until);
      if (!active.length && p.bubble && now < p.bubbleUntil) {
        active.push({ text: p.bubble, until: p.bubbleUntil, id: "live" });
      }
      p._activeBubbles = active;
      p._bubbleX = pos.x;

      if (p.emote) {
        let em = layer.querySelector(`[data-testid="emote-${cssEscape(p.username)}"]`);
        if (!em) {
          em = document.createElement("div");
          em.className = "emote-icon";
          em.dataset.testid = "emote-" + p.username;
          layer.appendChild(em);
        }
        em.textContent = p.emote === "eat" ? "🥪" : "🥤";
        em.style.left = nx + 26 + "px";
        em.style.top = (pos.y - 4) + "px";
        seen.add("e:" + p.username);
      }

      const isMe = p.username === state.me?.username;
      const draftOn = isMe && isChatOpen();
      const typingLive = draftOn || (Boolean(p.typing) && now - (p.typingAt || 0) < 4000);
      if (typingLive) {
        let typ = layer.querySelector(`[data-testid="typing-${cssEscape(p.username)}"]`);
        if (!typ) {
          typ = document.createElement("div");
          typ.className = "thinking-stack";
          typ.dataset.testid = "typing-" + p.username;
          layer.appendChild(typ);
        }
        const draft = draftOn ? (($("#chat-input")?.value || "").slice(0, CHAT_MAX)) : null;
        const sig = draftOn ? `d:${draft}` : "dots";
        if (typ.dataset.sig !== sig || !typ.firstChild) {
          typ.dataset.sig = sig;
          typ.replaceChildren();
          typ.classList.toggle("is-local-draft", draftOn);
          if (draftOn) {
            const bubble = document.createElement("div");
            bubble.className = "thinking-bubble draft-bubble";
            bubble.setAttribute("aria-label", "your typying");
            const text = document.createElement("div");
            text.className = "draft-text";
            text.dataset.testid = "typying-draft";
            text.textContent = draft;
            const count = document.createElement("span");
            count.className = "draft-count";
            count.dataset.testid = "typying-count";
            count.textContent = `${draft.length}/${CHAT_MAX}`;
            bubble.append(text, count);
            const tail = document.createElement("span");
            tail.className = "thought-tail";
            tail.setAttribute("aria-hidden", "true");
            tail.append(document.createElement("i"), document.createElement("i"));
            typ.append(bubble, tail);
          } else {
            typ.innerHTML = '<div class="thinking-bubble" aria-label="typing"><span class="think-dots" aria-hidden="true"><i></i><i></i><i></i></span></div><span class="thought-tail" aria-hidden="true"><i></i><i></i></span>';
          }
        }
        typ.classList.toggle("is-local-draft", draftOn);
        typ.classList.remove("is-flipped");
        typ.style.maxWidth = "150px";
        typ.style.left = "0px";
        typ.style.top = "0px";
        const typW = Math.max(typ.offsetWidth || 56, 40);
        const typH = typ.offsetHeight || 24;
        const nameW = nameEl.offsetWidth || 40;
        const nameH = nameEl.offsetHeight || 16;
        const nameL = nx - nameW / 2, nameR = nx + nameW / 2, nameT = ny - nameH, nameB = ny;
        const headX = pos.x;
        const headY = Number.isFinite(pos.footY) ? pos.y + Math.min(20, Math.max(10, (pos.footY - pos.y) * 0.22)) : pos.y + 14;
        const GAP = 8;
        const overlaps = (l, t) => l < nameR - 1 && l + typW > nameL + 1 && t < nameB - 1 && t + typH > nameT + 1;
        let flipped = false;
        let tx = headX - GAP - typW;
        let ty = headY - typH / 2;
        if (tx < PAD) {
          flipped = true;
          tx = headX + GAP;
        }
        if (flipped && tx + typW > W - PAD) {
          const leftOpt = headX - GAP - typW;
          if (leftOpt + typW / 2 >= PAD) { flipped = false; tx = leftOpt; }
        }
        tx = Math.min(Math.max(tx, PAD), W - typW - PAD);
        ty = Math.min(Math.max(ty, PAD), H - typH - PAD);
        if (overlaps(tx, ty)) {
          if (!flipped) {
            const pushed = nameL - typW - 4;
            if (pushed >= PAD) tx = pushed;
            else { flipped = true; tx = Math.min(Math.max(nameR + 4, headX + GAP), W - typW - PAD); }
          } else {
            const pushed = nameR + 4;
            if (pushed + typW <= W - PAD) tx = pushed;
          }
          tx = Math.min(Math.max(tx, PAD), W - typW - PAD);
        }
        if (overlaps(tx, ty)) {
          if (nameB + typH + PAD <= H) ty = nameB + 2;
          else ty = Math.max(PAD, nameT - typH - 2);
          ty = Math.min(Math.max(ty, PAD), H - typH - PAD);
        }
        typ.classList.toggle("is-flipped", flipped);
        typ.style.left = Math.round(tx) + "px";
        typ.style.top = Math.round(ty) + "px";
        typ.style.zIndex = "12";
        seen.add("t:" + p.username);
      }

      if (p.boxing && p.boxing.combo > 0) {
        let combo = layer.querySelector(`[data-testid="combo-${cssEscape(p.username)}"]`);
        if (!combo) {
          combo = document.createElement("div");
          combo.className = "combo-float";
          combo.dataset.testid = "combo-" + p.username;
          layer.appendChild(combo);
        }
        combo.textContent = p.boxing.combo + " HIT" + (p.boxing.combo > 1 ? "S" : "");
        combo.style.left = nx + "px";
        combo.style.top = (pos.y - 18) + "px";
        seen.add("c:" + p.username);
      }

      const prevBox = state.lastBoxing.get(p.username);
      const nowBox = Boolean(p.boxing);
      if (prevBox !== nowBox) {
        const poof = document.createElement("div");
        poof.className = "poof-float";
        poof.style.left = nx + "px";
        poof.style.top = (pos.y + 8) + "px";
        layer.appendChild(poof);
        setTimeout(() => poof.remove(), 450);
        state.lastBoxing.set(p.username, nowBox);
      }
    }
    // Habbo/MyCoke rows: newest just above head height; older bubbles stack
    // by their measured height plus a gap so long messages never overlap.
    const CHAT_FADE_TOP = 16;
    if (!state.chatFloats) state.chatFloats = [];
    if (state.chatFloats.length && state.chatQuietAt && now - state.chatQuietAt >= CHAT_ROW_MS) {
      stepChatRows();
    }
    const usedIds = new Set();
    const latestOf = new Map();
    for (const b of state.chatFloats) latestOf.set(b.username, b);
    const els = [];
    for (const b of state.chatFloats) {
      const p = state.people.get(b.username);
      if (p) {
        const pos = state.room3d.projectHead(p.username);
        if (pos) b.x = pos.x;
      }
      const isLatest = latestOf.get(b.username) === b;
      const testid = isLatest ? ("bubble-" + b.username) : ("bubble-" + b.username + "-" + b.id);
      usedIds.add(testid);
      let el = layer.querySelector(`[data-chat-id="${cssEscape(b.id)}"]`);
      if (!el) {
        el = document.createElement("div");
        el.className = "speech-stack";
        el.dataset.chatId = b.id;
        layer.appendChild(el);
      }
      el.dataset.testid = testid;
      el.dataset.row = String(b.row);
      const sig = b.id + ":" + b.text;
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.innerHTML = bubbleMarkup(p || { username: b.username, avatar: { displayName: b.username } }, b.text, false);
      }
      b.height = el.offsetHeight || b.height || CHAT_ROW_H;
      els.push({ b, el, testid });
    }
    if (state.chatFloats.length) {
      const newest = state.chatFloats[state.chatFloats.length - 1];
      layoutChatRows(newest.targetY, state.chatFloats.map((b) => b.height));
    }
    const remain = [];
    for (const { b, el } of els) {
      el.dataset.row = String(b.row);
      const w = el.offsetWidth || 80;
      const bx = Math.min(Math.max(b.x, PAD + w / 2), W - PAD - w / 2);
      const by = b.targetY;
      el.style.left = bx + "px";
      el.style.top = by + "px";
      const offTop = by < -8;
      const nearTop = by <= CHAT_FADE_TOP;
      el.classList.toggle("fade-top", nearTop);
      if (offTop) el.remove();
      else {
        remain.push(b);
        seen.add("b:" + b.username);
      }
    }
    state.chatFloats = remain;
    layer.querySelectorAll(".speech-stack").forEach((el) => {
      const id = el.dataset.testid || "";
      if (id.startsWith("typing-")) return;
      if (!el.dataset.chatId || !usedIds.has(id)) {
        if (!id.startsWith("typing-")) el.remove();
      }
    });
    // impact flashes on bags
    for (const [id, use] of Object.entries(state.room?.uses || {})) {
      if (use?.type !== "punchbag" || !use.lastHitAt) continue;
      const last = state.lastHits.get(id) || 0;
      if (use.lastHitAt <= last) continue;
      state.lastHits.set(id, use.lastHitAt);
      const mesh = state.room3d.findFurnMesh?.(id);
      if (!mesh) continue;
      const v = state.room3d.projectFurniture(id);
      if (!v) continue;
      const pow = document.createElement("div");
      pow.className = "pow-float";
      pow.textContent = use.move === "uppercut" ? "POW!" : (use.move === "hook" ? "WHAM" : "★");
      pow.style.left = v.x + "px";
      pow.style.top = (v.y - 20) + "px";
      layer.appendChild(pow);
      setTimeout(() => pow.remove(), 400);
    }
    layer.querySelectorAll(".speech-stack").forEach((el) => {
      const id = el.dataset.testid || "";
      if (id.startsWith("typing-")) return;
      const name = id.replace("bubble-", "").split("-")[0];
      if (!seen.has("b:" + name) && !id.startsWith("typing-")) {
        // kept messages are already pruned by usedIds above
        if (!id.startsWith("bubble-")) el.remove();
      }
    });
    layer.querySelectorAll(".emote-icon").forEach((el) => {
      const name = el.dataset.testid.replace("emote-", "");
      if (!seen.has("e:" + name)) el.remove();
    });
    layer.querySelectorAll("[data-name]").forEach((el) => {
      if (!state.people.has(el.dataset.name)) el.remove();
    });
    layer.querySelectorAll(".combo-float").forEach((el) => {
      const name = el.dataset.testid.replace("combo-", "");
      if (!seen.has("c:" + name)) el.remove();
    });
    layer.querySelectorAll(".thinking-stack[data-testid^='typing-']").forEach((el) => {
      const name = el.dataset.testid.replace("typing-", "");
      if (!seen.has("t:" + name)) el.remove();
    });
  }

  function cssEscape(s) {
    if (window.CSS?.escape) return CSS.escape(s);
    return s.replace(/"/g, '\\"');
  }

  let raf = 0;
  let lastTick = performance.now();
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (state.view !== "room") {
      lastTick = now;
      return;
    }
    const dt = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;
    let changed = false;
    const tnow = Date.now();
    for (const p of state.people.values()) {
      if (p.path && p.path.length) {
        const next = p.path[0];
        const dx = next.x - p.x;
        const dy = next.y - p.y;
        const dist = Math.hypot(dx, dy);
        const speed = 2.55;
        if (dist < 0.08) {
          p.x = next.x;
          p.y = next.y;
          p.path.shift();
          if (!p.path.length) {
            p.walking = false;
            maybeFireArrive(p);
          }
          changed = true;
        } else {
          p.x += (dx / dist) * speed * dt;
          p.y += (dy / dist) * speed * dt;
          p.walking = true;
          p.dirX = dx;
          p.dirZ = dy;
          p.facing = { x: dx, z: dy };
          changed = true;
        }
      }
      if (p.bubble && tnow >= p.bubbleUntil) {
        p.bubble = null;
      }
    }
    if (changed) renderPeople();
    else if (state.view === "room") paintOverlays();
    updateFurnActionPos();
    updatePlaceActionPos();
  }
  raf = requestAnimationFrame(tick);

  /* ---------- shop ---------- */
  function paintShopInventory() {
    const inv = $("#inventory-row");
    if (!inv) return;
    inv.classList.add("hidden");
    inv.innerHTML = "";
  }

  function paintShop() {
    if (storePanelOpen()) paintStorePanel();
  }

  function paintPhoneShopCatalog() {
    const kind = state.shopTab;
    if (kind === "clothes" && !state.shopSlot) state.shopSlot = "all";
    paintSlotTabs("phone-shop-slot-tabs", state.shopSlot || "all", (slot) => {
      state.shopSlot = slot;
      const list = storeStock("clothes", slot);
      const still = list.some((it) => (it.id || it.type) === state.shopSel);
      if (!still) state.shopSel = (list[0] && (list[0].id || list[0].type)) || null;
      paintPhoneShopCatalog();
    });
    const list = storeStock(kind, kind === "clothes" ? state.shopSlot : null);
    if (!state.shopSel || !list.some((s) => (s.id || s.type) === state.shopSel)) {
      state.shopSel = (list[0] && (list[0].id || list[0].type)) || null;
    }
    const prev = $("#phone-shop-preview");
    const grid = $("#phone-shop-grid");
    if (grid) {
      grid.innerHTML = list.map((s) => {
        const id = s.id || s.type;
        const label = s.label || s.name || s.type;
        const owned = ownsStoreItem(kind, s);
        const sel = state.shopSel === id ? " selected" : "";
        const thumb = (kind === "clothes" || kind === "pets" || kind === "art")
          ? `<canvas class="store-thumb" width="28" height="28" data-thumb-id="${id}" style="image-rendering:pixelated"></canvas>`
          : "";
        return `<button type="button" class="store-item${sel}" data-testid="store-item-${id}" data-shop-id="${id}">${thumb}<span class="meta">${escapeHtml(label)}${owned ? " · owned" : ""}</span><span class="price">${owned ? "✓" : s.price + "c"}</span></button>`;
      }).join("");
      grid.querySelectorAll("[data-shop-id]").forEach((b) => {
        b.addEventListener("click", () => {
          state.shopSel = b.dataset.shopId;
          paintPhoneShopCatalog();
        });
      });
      grid.querySelectorAll("canvas.store-thumb").forEach((c) => {
        const stock = list.find((s) => (s.id || s.type) === c.dataset.thumbId);
        if (!stock) return;
        if (kind === "art") paintArtThumb(c, stock.type || stock.id);
        else if (typeof window.__paintStoreThumb === "function") {
          window.__paintStoreThumb(c, kind, stock.item || stock, state.me?.avatar || {});
        }
      });
    }
    const stock = list.find((s) => (s.id || s.type) === state.shopSel);
    if (prev) {
      if (kind === "pets" && stock) {
        prev.innerHTML = `<canvas width="72" height="66" style="image-rendering:pixelated"></canvas>`;
        const c = prev.querySelector("canvas");
        if (c && window.__paintPetThumb) { c.width = 72; c.height = 66; window.__paintPetThumb(c, stock.item); }
      } else if (kind === "clothes" && stock && window.__paintStoreThumb) {
        prev.innerHTML = `<canvas width="56" height="56" style="image-rendering:pixelated"></canvas>`;
        const c = prev.querySelector("canvas");
        if (c) window.__paintStoreThumb(c, "clothes", stock.item, state.me?.avatar || {});
      } else if (kind === "art" && stock) {
        prev.innerHTML = `<canvas width="96" height="96" style="image-rendering:pixelated"></canvas><div style="padding:6px;text-align:center;font-weight:700">${escapeHtml(stock.name || stock.label || stock.type)}</div>`;
        const c = prev.querySelector("canvas");
        if (c) paintArtThumb(c, stock.type || stock.id);
      } else {
        prev.innerHTML = stock ? `<strong>${escapeHtml(stock.label || stock.name || stock.type)}</strong>` : "";
      }
    }
    const buy = $("#phone-shop-buy");
    const coins = state.me?.coins ?? 0;
    const owned = stock && ownsStoreItem(kind, stock);
    if (buy) {
      buy.disabled = !stock || owned || coins < (stock?.price || 0);
      buy.textContent = !stock ? "Buy" : owned ? "Owned" : `Buy · ${stock.price}c`;
    }
    const tryon = $("#phone-shop-tryon");
    if (tryon) {
      tryon.style.display = kind === "clothes" ? "" : (kind === "pets" ? "" : "none");
      tryon.textContent = kind === "pets" ? "Preview" : "Try on";
    }
  }

  function labelFor(type) {
    return HouseIso.CATALOG[type]?.name || type;
  }

  function startPlace(type) {
    state.pendingPlace = type;
    state.movingId = null;
    state.movingWallId = null;
    state.pendingPet = null;
    state.placeRot = state.placeRot || 0;
    const banner = $("#place-banner");
    if (banner && !state.editMode) {
      banner.innerHTML = `Tap a tile to place your ${escapeHtml(labelFor(type))} <button class="btn small secondary" id="cancel-place" type="button">Cancel</button>`;
      SHOW(banner);
      $("#cancel-place")?.addEventListener("click", (e) => {
        e.stopPropagation();
        cancelPlace();
      });
    } else if (banner) HIDE(banner);
    $("#floor").classList.add("placing");
    state.room3d?.setPlacing(type);
    if (state.phoneApp === "edit") paintEditRoom();
    if (state.editMode) paintEditInventory();
    if (HouseIso.isWallArt(type)) seedWallGhost();
    else seedPlaceGhost();
    showPlaceActions();
  }

  function cancelPlace() {
    if (state.pendingPet) cancelPlacePet();
    state.pendingPlace = null;
    state.movingId = null;
    HIDE($("#place-banner"));
    $("#floor").classList.remove("placing");
    if (!state.editMode) state.room3d?.setPlacing(null);
    state.room3d?.setGhost(null);
    state.room3d?.setWallGhost(null);
    state.movingWallId = null;
    const tools = $("#edit-place-tools");
    if (tools) HIDE(tools);
    hidePlaceActions();
  }

  function updatePlaceHighlight(tx, ty) {
    if (pendingWallType()) {
      state.room3d?.setGhost(null);
      return;
    }
    const type = state.pendingPlace || (state.movingId && (state.room?.furniture || []).find((f) => f.id === state.movingId)?.type);
    if (!type) {
      state.room3d?.setGhost(null);
      const chk = $("#confirm-place");
      if (chk) HIDE(chk);
      return;
    }
    const ignore = state.movingId || undefined;
    const ok = HouseIso.canPlace(state.room?.furniture || [], type, tx, ty, state.room?.size || 6, state.placeRot, ignore);
    state.room3d?.setGhost(type, tx, ty, ok, state.placeRot);
    const chk = $("#confirm-place");
    if (chk) {
      if (ok) SHOW(chk);
      else HIDE(chk);
    }
    const tools = $("#edit-place-tools");
    if (tools && (state.pendingPlace || state.movingId)) SHOW(tools);
    showPlaceActions();
  }


  function currentPlaceOk() {
    const g = state.room3d?.getGhost?.();
    const wg = state.room3d?.getWallGhost?.();
    const pg = state.room3d?.getPetGhost?.();
    if (pendingWallType()) return Boolean(wg && wg.ok);
    if (state.pendingPet) return Boolean(pg && pg.ok);
    return Boolean(g && g.ok);
  }
  function showPlaceActions() {
    HIDE($("#place-actions"));
    const bar = $("#place-actions");
    if (!bar) return;
    if (state.editMode) return;
    // Existing furniture uses the compact furn-actions bar (Rotate / Put away / Place).
    // New inventory placements use place-actions (Cancel / Rotate / Place).
    const furnBarOn = Boolean(state.movingId || state.movingWallId || (state.selectedFurnId && !$("#furn-actions")?.classList.contains("hidden")));
    if (furnBarOn) HIDE(bar);
    else if (state.pendingPlace || state.pendingPet) SHOW(bar);
    else HIDE(bar);
    const conf = $("#place-confirm");
    const ok = currentPlaceOk();
    if (conf) {
      conf.disabled = !ok;
      conf.classList.toggle("hidden", false);
      conf.classList.toggle("disabled", !ok);
    }
    const rot = $("#place-rotate");
    if (rot) rot.classList.toggle("hidden", Boolean(state.pendingPet));
    updatePlaceActionPos();
    const fp = $("#furn-place");
    if (fp) {
      fp.disabled = !ok;
      fp.classList.toggle("disabled", !ok);
    }
  }
  function updatePlaceActionPos() {
    const bar = $("#place-actions");
    if (!bar || bar.classList.contains("hidden")) return;
    let pos = null;
    const g = state.room3d?.getGhost?.();
    const pg = state.room3d?.getPetGhost?.();
    const wg = state.room3d?.getWallGhost?.();
    if (g) pos = state.room3d?.projectTile?.(g.tx, g.ty);
    else if (pg) pos = state.room3d?.projectTile?.(pg.tx, pg.ty);
    else if (wg && state.selectedFurnId) pos = state.room3d?.projectFurniture?.(state.selectedFurnId);
    else if (state.selectedFurnId) pos = state.room3d?.projectFurniture?.(state.selectedFurnId);
    if (pos && pos.visible) {
      bar.classList.add("in-room");
      const w = bar.offsetWidth || 168;
      const minX = 8 + w / 2;
      const maxX = Math.max(minX, window.innerWidth - 8 - w / 2);
      bar.style.left = Math.max(minX, Math.min(maxX, pos.x)) + "px";
      bar.style.top = Math.max(28, pos.y) + "px";
      bar.style.bottom = "auto";
      bar.style.transform = "translate(-50%, -120%)";
    } else {
      bar.classList.remove("in-room");
      bar.style.left = "";
      bar.style.top = "";
      bar.style.bottom = "";
      bar.style.transform = "";
    }
  }
  function hidePlaceActions() {
    HIDE($("#place-actions"));
  }
  function nearestFreeFloor(type, rot, ignoreId) {
    const size = state.room?.size || 6;
    const cx = (size - 1) / 2;
    const spots = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (HouseIso.canPlace(state.room?.furniture || [], type, x, y, size, rot || 0, ignoreId)) {
          spots.push({ x, y, d: Math.hypot(x - cx, y - cx) });
        }
      }
    }
    spots.sort((a, b) => a.d - b.d);
    return spots[0] || null;
  }
  function seedPlaceGhost() {
    const type = currentPlaceType();
    if (!type) return;
    if (HouseIso.isWallArt(type)) return;
    const spot = nearestFreeFloor(type, state.placeRot || 0, state.movingId || undefined);
    if (spot) updatePlaceHighlight(spot.x, spot.y);
    showPlaceActions();
  }
  function preferredWalls() {
    const size = state.room?.size || 6;
    const mid = Math.round((size - 1) / 2);
    const canvas = document.querySelector("#floor canvas, .room3d-root canvas");
    const rect = canvas?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 0;
    const cy = rect ? rect.top + rect.height / 2 : 0;
    const score = (wall) => {
      const pt = wall === "back"
        ? state.room3d?.projectTile?.(mid, 0)
        : state.room3d?.projectTile?.(0, mid);
      if (!pt) return 1e9;
      return (pt.visible ? 0 : 1000) + Math.hypot((pt.x ?? 0) - cx, (pt.y ?? 0) - cy);
    };
    return ["back", "left"].sort((a, b) => score(a) - score(b));
  }
  function slotsFromMiddle(size) {
    const mid = Math.round((size - 1) / 2);
    const out = [mid];
    for (let i = 1; i < size; i++) {
      if (mid - i >= 0) out.push(mid - i);
      if (mid + i < size) out.push(mid + i);
    }
    return out;
  }
  function seedWallGhost() {
    const type = pendingWallType();
    if (!type) return;
    const size = state.room?.size || 6;
    const ignore = state.movingWallId;
    for (const wall of preferredWalls()) {
      for (const slot of slotsFromMiddle(size)) {
        if (HouseIso.canPlaceWall(type, wall, slot, size)
            && !HouseIso.wallOccupied(state.room?.wallArt || [], wall, slot, ignore)) {
          updateWallHighlight(wall, slot);
          showPlaceActions();
          return;
        }
      }
    }
    showPlaceActions();
  }

  function pendingWallType() {
    if (state.pendingPlace && HouseIso.isWallArt(state.pendingPlace)) return state.pendingPlace;
    if (state.movingWallId) {
      const a = (state.room?.wallArt || []).find((x) => x.id === state.movingWallId);
      return a?.type || null;
    }
    return null;
  }

  function updateWallHighlight(wall, slot) {
    const type = pendingWallType();
    if (!type) {
      state.room3d?.setWallGhost(null);
      return;
    }
    const ok = HouseIso.canPlaceWall(type, wall, slot, state.room?.size || 6)
      && !HouseIso.wallOccupied(state.room?.wallArt || [], wall, slot, state.movingWallId);
    state.room3d?.setWallGhost(type, wall, slot, ok);
    const chk = $("#confirm-place");
    if (chk) {
      if (ok) SHOW(chk);
      else HIDE(chk);
    }
    const tools = $("#edit-place-tools");
    if (tools) SHOW(tools);
    showPlaceActions();
  }

  function confirmWallGhost() {
    const type = pendingWallType();
    const g = state.room3d?.getWallGhost?.();
    if (!type || !g || !g.ok) return false;
    if (state.movingWallId) {
      socket.emit("moveWallArt", { id: state.movingWallId, wall: g.wall, slot: g.slot });
      return true;
    }
    socket.emit("placeWallArt", { type, wall: g.wall, slot: g.slot });
    return true;
  }

  function handleWallClick(wall, slot, art) {
    const type = pendingWallType();
    if (type) {
      updateWallHighlight(wall, slot);
      return;
    }
    if (state.editMode) {
      const piece = art || (state.room?.wallArt || []).find((a) => a.wall === wall && a.slot === slot);
      if (!piece) return;
      if (isEditDoubleTap("wall:" + piece.id)) {
        state.selectedFurnId = piece.id;
        putAwaySelected();
        return;
      }
      selectWallArt(piece);
    }
  }

  function openCubics(id) {
    state.cubicsId = id;
    SHOW($("#cubics-panel"));
    paintCubicsScores();
    paintCubicsCanvas();
  }
  function closeCubics() {
    if (state.cubicsGame && !state.cubicsGame.over && state.cubicsId) {
      socket.emit("cubicsEnd", { id: state.cubicsId, score: state.cubicsGame.score || 0 });
    }
    stopCubicsLoop();
    state.cubicsGame = null;
    state.cubicsId = null;
    HIDE($("#cubics-panel"));
  }
  function paintCubicsScores() {
    const el = $("#cubics-scores");
    if (!el || !state.cubicsId) return;
    const scores = state.room?.arcade?.[state.cubicsId]?.scores || [];
    el.innerHTML = scores.length
      ? "<ol>" + scores.map((s, i) => `<li data-testid="cubics-score-${i}">${escapeHtml(s.name)} — ${s.score}</li>`).join("") + "</ol>"
      : "<div class='item-sub'>No high scores yet.</div>";
  }
  function paintCubicsCanvas() {
    const c = $("#cubics-canvas");
    if (!c) return;
    const ctx = c.getContext("2d");
    drawCubics(ctx, c.width, c.height, state.cubicsGame, Date.now() / 1000, state.room?.arcade?.[state.cubicsId]?.scores || []);
    const score = $("#cubics-score");
    if (score) score.textContent = String(state.cubicsGame?.score || 0);
    const joke = $("#cubics-joke");
    if (joke) joke.textContent = state.cubicsGame?.joke || jokeAt(0);
  }
  function stopCubicsLoop() {
    if (state.cubicsTimer) { cancelAnimationFrame(state.cubicsTimer); state.cubicsTimer = null; }
  }
  function runCubicsLoop(last) {
    if (!state.cubicsGame || state.cubicsGame.over) { stopCubicsLoop(); paintCubicsCanvas(); return; }
    state.cubicsTimer = requestAnimationFrame((now) => {
      const dt = Math.min(40, now - (last || now));
      cubicsTick(state.cubicsGame, dt);
      paintCubicsCanvas();
      if (Math.floor(now / 120) !== Math.floor((last || 0) / 120)) {
        socket.emit("cubicsState", { id: state.cubicsId, state: cubicsSnap(state.cubicsGame) });
      }
      if (state.cubicsGame.over) {
        socket.emit("cubicsEnd", { id: state.cubicsId, score: state.cubicsGame.score || 0 });
        stopCubicsLoop();
        paintCubicsScores();
        return;
      }
      runCubicsLoop(now);
    });
  }
  function startCubicsPlay() {
    if (!state.cubicsId) return;
    socket.emit("cubicsStart", { id: state.cubicsId });
    state.cubicsGame = startGame();
    socket.emit("cubicsState", { id: state.cubicsId, state: cubicsSnap(state.cubicsGame) });
    paintCubicsCanvas();
    stopCubicsLoop();
    runCubicsLoop(performance.now());
  }
  function cubicsInput(kind) {
    if (!state.cubicsGame || state.cubicsGame.over) return;
    if (kind === "left") cubicsMove(state.cubicsGame, -1);
    if (kind === "right") cubicsMove(state.cubicsGame, 1);
    if (kind === "down") softDrop(state.cubicsGame);
    if (kind === "drop") hardDrop(state.cubicsGame);
    paintCubicsCanvas();
    socket.emit("cubicsState", { id: state.cubicsId, state: cubicsSnap(state.cubicsGame) });
  }

  function openWardrobe(id) {
    state.wardId = id;
    state.draft = migrateAvatar({ ...HearthAvatar.defaults(), ...(state.me?.avatar || {}) });
    SHOW($("#wardrobe-panel"));
    paintWardrobe();
  }
  function closeWardrobe() {
    HIDE($("#wardrobe-panel"));
    state.wardId = null;
  }
  function paintWardrobe() {
    const box = $("#ward-preview");
    if (box) {
      if (!state.wardPreview) state.wardPreview = createAvatarPreview(box);
      state.wardPreview.setAvatar(state.draft);
    }
    const root = $("#ward-controls");
    if (!root) return;
    const swatch = (list, key, label, asColor, names) => {
      const row = document.createElement("div");
      row.innerHTML = `<h4>${label}</h4>`;
      const wrap = document.createElement("div");
      wrap.className = "swatch-row";
      list.forEach((val, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = asColor ? "swatch" : "choice";
        if (asColor) b.style.background = val;
        else b.textContent = (names && names[val]) || val;
        b.dataset.testid = `ward-${key}-${i}`;
        if (state.draft[key] === val) b.classList.add("selected");
        b.addEventListener("click", () => { state.draft[key] = val; paintWardrobe(); });
        wrap.appendChild(b);
      });
      if (asColor) appendColorWheelSwatch(wrap, key, list, {
        onLive(hex) {
          state.draft[key] = hex;
          if (key === "hatColor") state.draft.headphoneColor = hex;
          state.wardPreview?.setAvatar(state.draft);
          state.preview3d?.setAvatar(state.draft);
        },
        onClose() { paintWardrobe(); },
      });
      row.appendChild(wrap);
      return row;
    };
    root.innerHTML = "";
    const ownedClothes = state.me?.collection?.clothes || [];
    const merge = (base, field) => {
      const list = [...base];
      for (const it of ownedClothes) {
        const val = it?.item?.[field];
        if (val && !list.includes(val)) list.push(val);
      }
      if (state.draft?.[field] && !list.includes(state.draft[field])) list.push(state.draft[field]);
      return list;
    };
    root.appendChild(swatch(HearthAvatar.SKINS, "skin", "Skin", true));
    root.appendChild(swatch(CAT_HAIR_STYLES.length ? CAT_HAIR_STYLES : HearthAvatar.HAIR_STYLES, "hair", "Hair", false, HAIR_LABELS));
    root.appendChild(swatch(HearthAvatar.HAIR_COLORS, "hairColor", "Hair color", true));
    root.appendChild(swatch(HearthAvatar.SHIRTS, "shirt", "Shirt", true));
    root.appendChild(swatch(merge(BASE_TOPS, "top"), "top", "Top", false, TOP_LABELS));
    root.appendChild(swatch(merge(BASE_BOTTOMS, "bottom"), "bottom", "Bottoms", false, BOTTOM_LABELS));
    root.appendChild(swatch(HearthAvatar.BOTTOM_COLORS, "bottomColor", "Bottom color", true));
    const shoeList = merge(HearthAvatar.SHOES || [], "shoes");
    root.appendChild(swatch(shoeList, "shoes", "Shoes", false));
    root.appendChild(swatch(merge(BASE_ACCESSORIES, "accessory"), "accessory", "Accessory", false, ACC_LABELS));
  }

  function showEditPhoneScreen() {
    tickPhoneTime();
    updatePhoneBadge();
    SHOW($("#phone-overlay"));
    document.body.classList.add("phone-open");
    $("#phone-btn")?.setAttribute("aria-expanded", "true");
    HIDE($("#phone-home"));
    document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
    SHOW($("#phone-screen-edit"));
    state.phoneApp = "edit";
    setPhoneExpanded?.(true);
  }
  function syncEditRoomButton() {
    const btn = $("#edit-room-btn");
    if (!btn) return;
    const on = isOwner();
    btn.classList.toggle("hidden", !on);
    btn.setAttribute("aria-pressed", state.editMode ? "true" : "false");
    btn.classList.toggle("is-on", Boolean(state.editMode));
  }
  function toggleEditMode() {
    if (state.editMode) exitEditMode();
    else enterEditMode();
  }
  function enterEditMode() {
    if (!isOwner()) {
      toast("Only the cube owner can decorate.");
      return;
    }
    if (phoneOpen()) hidePhoneUI();
    endPhoneHoldIfIdle();
    if (isChatOpen?.()) closeChatComposer?.();
    state.editMode = true;
    state.editTab = state.editTab || "furniture";
    document.body.classList.add("edit-mode");
    SHOW($("#edit-inventory"));
    paintEditInventory();
    bindEditInvDrag();
    state.room3d?.setPlacing("edit");
    syncPutAwayBtn();
    state.room3d?.setPanLocked?.(false);
    syncEditRoomButton();
    syncAppShell();
  }

  function exitEditMode() {
    state.editMode = false;
    document.body.classList.remove("edit-mode");
    HIDE($("#edit-inventory"));
    $("#edit-inventory")?.classList.remove("putaway-hover");
    hideFurnActions();
    cancelPlace();
    syncPutAwayBtn();
    state.selectedFurnId = null;
    state.selectedPet = null;
    state.movingId = null;
    state.room3d?.highlightFurniture(null);
    state.room3d?.setPlacing(null);
    state.room3d?.setPanLocked?.(false);
    syncEditRoomButton();
    syncAppShell();
  }

  function setEditTab(tab) {
    state.editTab = tab || "furniture";
    if (tab !== "room") state.decorSection = state.decorSection || "floor";
    paintEditInventory();
  }
  function currentDecor() {
    return normalizeDecor(state.room || {});
  }
  let decorPersistTimer = 0;
  let pendingDecor = null;
  function previewDecorPatch(patch, { persist = true, repaint = true } = {}) {
    const next = normalizeDecor({ ...currentDecor(), ...patch });
    state.room = Object.assign(state.room || {}, next);
    state.room3d?.setDecor?.(next);
    pendingDecor = next;
    if (persist) {
      socket.emit("setRoomStyle", next);
      pendingDecor = null;
    }
    if (repaint) paintEditInventory();
  }
  function scheduleDecorPersist() {
    clearTimeout(decorPersistTimer);
    decorPersistTimer = setTimeout(flushDecorPersist, 120);
  }
  function flushDecorPersist() {
    clearTimeout(decorPersistTimer);
    if (!pendingDecor) return;
    socket.emit("setRoomStyle", pendingDecor);
    pendingDecor = null;
  }
  function applyDecorPatch(patch) {
    previewDecorPatch(patch, { persist: true, repaint: true });
  }
  function decorColorHex(key, id) {
    if (canonHex(id)) return canonHex(id);
    const group = DECOR_GROUPS.find((g) => g.colorKey === key);
    const item = group?.colors?.find((c) => c.id === id);
    return item?.hex || "#e0b068";
  }
  function paintEditInventory() {
    const box = $("#edit-inv-items");
    if (!box) return;
    const tab = state.editTab || "furniture";
    document.querySelectorAll("#edit-inv-tabs [data-tab]").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    const chips = $("#edit-decor-chips");
    if (chips) chips.classList.toggle("hidden", tab !== "room");
    box.classList.toggle("is-decor-stack", tab === "room");
    box.classList.toggle("is-item-row", tab !== "room");
    if (tab === "room") {
      paintDecorTab(box);
      afterPaintInventory();
      return;
    }
    if (tab === "upgrade") {
      paintUpgradeTab(box);
      afterPaintInventory();
      return;
    }
    const counts = {};
    for (const t of state.me?.inventory || []) counts[t] = (counts[t] || 0) + 1;
    const types = Object.keys(counts);
    const pets = (state.me?.collection?.pets || []).filter((c) => !placedPetFor(c.item) || state.me?.activePet === c.item);
    const bits = [];
    for (const typ of types) {
      const sel = state.pendingPlace === typ && !state.movingId ? " selected" : "";
      bits.push(`<button type="button" class="edit-inv-item${sel}" data-testid="edit-item-${typ}" data-place="${typ}">
              ${typeof furnitureSVG === "function" ? furnitureSVG(typ) : ""}
              <span>${escapeHtml(labelFor(typ))}</span>
              ${counts[typ] > 1 ? `<span class="count">${counts[typ]}</span>` : ""}
            </button>`);
    }
    for (const c of pets) {
      const sel = state.pendingPet === c.item ? " selected" : "";
      bits.push(`<button type="button" class="edit-inv-item${sel}" data-testid="edit-item-pet-${c.item}" data-pet-place="${c.item}">
              <span class="edit-inv-pet">🐾</span>
              <span>${escapeHtml(c.label || c.item)}</span>
            </button>`);
    }
    box.innerHTML = bits.length
      ? bits.join("")
      : `<span class="empty">Pocket's empty. Buy furniture or a pet in the shop.</span>`;
    box.querySelectorAll("canvas[data-art-thumb]").forEach((c) => paintArtThumb(c, c.dataset.artThumb));
    box.querySelectorAll("[data-place]").forEach((b) => {
      b.addEventListener("click", () => {
        if (state._invDragging) return;
        state.movingId = null;
        state.selectedFurnId = null;
        hideFurnActions();
        state._selectAfterPlace = true;
        startPlace(b.dataset.place);
        confirmGhostPlace();
      });
    });
    box.querySelectorAll("[data-pet-place]").forEach((b) => {
      b.addEventListener("click", () => {
        if (state._invDragging) return;
        state._selectAfterPlace = true;
        startPlacePet(b.dataset.petPlace);
        confirmPlacePet();
      });
    });
    afterPaintInventory();
  }
  function afterPaintInventory() {
    bindInventoryScrollGuard();
    measureChatFrame();
    requestAnimationFrame(() => measureChatFrame());
  }
  function bindInventoryScrollGuard() {
    const inv = document.getElementById("edit-inventory");
    if (!inv || inv.dataset.scrollGuard) return;
    inv.dataset.scrollGuard = "1";
    const stop = (e) => e.stopPropagation();
    inv.addEventListener("touchstart", stop, { passive: true });
    inv.addEventListener("touchmove", stop, { passive: true });
    inv.addEventListener("wheel", stop, { passive: true });
    inv.addEventListener("pointerdown", stop);
  }
  function paintDecorTab(box) {
    const section = state.decorSection || "floor";
    document.querySelectorAll("#edit-decor-chips [data-decor]").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.decor === section);
    });
    const decor = currentDecor();
    const bits = [];
    const addItems = (list, kind, key) => {
      const row = [];
      for (const it of list) {
        const on = decor[key] === it.id ? " selected" : "";
        row.push(`<button type="button" class="edit-decor-item${on}" data-testid="decor-${key}-${it.id}" data-decor-key="${key}" data-decor-id="${it.id}" title="${escapeHtml(it.name)}" aria-label="${escapeHtml(it.name)}">
          <canvas width="40" height="28" data-decor-thumb="${kind}" data-decor-id="${it.id}" aria-hidden="true"></canvas>
          <span>${escapeHtml(it.name)}</span>
        </button>`);
      }
      return row.join("");
    };
    for (const group of DECOR_GROUPS) {
      bits.push(`<section class="edit-decor-section" data-testid="decor-section-${group.id}" id="decor-section-${group.id}">`);
      bits.push(`<h4 class="edit-decor-heading">${escapeHtml(group.label || group.id)}</h4>`);
      if (group.colors) {
        const custom = canonHex(decor[group.colorKey]) || state.customDecorColors?.[group.colorKey] || "";
        const wheelOn = Boolean(canonHex(decor[group.colorKey]));
        bits.push(`<div class="edit-decor-row" data-testid="decor-row-${group.id}-color">${addItems(group.colors, group.colorKey, group.colorKey)}<button type="button" class="edit-decor-item color-wheel-swatch${custom ? " has-custom" : ""}${wheelOn ? " selected" : ""}" data-testid="decor-${group.colorKey}-wheel" data-color-wheel="${group.colorKey}" style="--custom-color:${custom || "transparent"}" aria-label="Custom ${escapeHtml(group.label || "color")}"><span class="color-wheel-chip"></span><span>Custom</span></button></div>`);
      }
      if (group.patterns) bits.push(`<div class="edit-decor-row" data-testid="decor-row-${group.id}-pattern">${addItems(group.patterns, group.patternKey, group.patternKey)}</div>`);
      if (group.options) bits.push(`<div class="edit-decor-row" data-testid="decor-row-${group.id}">${addItems(group.options, group.key, group.key)}</div>`);
      bits.push(`</section>`);
    }
    const keepY = box.scrollTop;
    box.innerHTML = bits.join("");
    box.scrollTop = keepY;
    box.querySelectorAll("canvas[data-decor-thumb]").forEach((c) => {
      paintDecorThumb(c, c.dataset.decorThumb, c.dataset.decorId, decor);
    });
    box.querySelectorAll("[data-decor-key]").forEach((b) => {
      b.addEventListener("click", () => applyDecorPatch({ [b.dataset.decorKey]: b.dataset.decorId }));
    });
    box.querySelectorAll("[data-color-wheel]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key = b.dataset.colorWheel;
        const start = decorColorHex(key, currentDecor()[key]) || state.customDecorColors?.[key] || "#e0b068";
        openColorWheel({
          anchor: b,
          color: start,
          avoid: colorAvoidRects(),
          within: document.querySelector(".room-view") || document.body,
          onLive(hex) {
            rememberCustom(key, hex, "decor");
            b.classList.add("has-custom", "selected");
            b.style.setProperty("--custom-color", hex);
            box.querySelectorAll(`[data-decor-key="${key}"]`).forEach((s) => s.classList.remove("selected"));
            previewDecorPatch({ [key]: hex }, { persist: false, repaint: false });
            scheduleDecorPersist();
          },
          onClose() {
            flushDecorPersist();
            paintEditInventory();
          },
        });
      });
    });
  }
  function paintUpgradeTab(box) {
    const size = state.room?.size || 6;
    const tiers = [
      { size: 6, cost: 0 },
      { size: 8, cost: 25 },
      { size: 10, cost: 40 },
    ];
    const coins = state.me?.coins ?? 0;
    const bits = tiers.map((t) => {
      const current = size === t.size;
      const owned = size >= t.size;
      const next = (size === 6 && t.size === 8) || (size === 8 && t.size === 10);
      const can = next && coins >= t.cost;
      let action = "";
      if (current) action = `<span class="up-cost">Current</span>`;
      else if (owned) action = `<span class="up-cost">Owned</span>`;
      else if (next) action = `<button type="button" class="edit-upgrade-buy" data-testid="upgrade-cube" ${can ? "" : "disabled"}>🪙 ${t.cost}</button>`;
      else action = `<span class="up-cost">🪙 ${t.cost}</span>`;
      return `<div class="edit-upgrade-item${current ? " is-current" : ""}" data-testid="upgrade-tier-${t.size}">
        <div class="up-size">${t.size}×${t.size}</div>
        ${action}
      </div>`;
    });
    box.innerHTML = bits.join("");
    box.querySelector("[data-testid=upgrade-cube]")?.addEventListener("click", () => socket.emit("upgradeCube"));
  }

  function bindEditInvDrag() {
    const box = $("#edit-inv-items");
    if (!box || box.dataset.dragBound) return;
    box.dataset.dragBound = "1";
    let drag = null;
    const tileAt = (x, y) => state.room3d?.pickFloorTileAt?.(x, y);
    box.addEventListener("pointerdown", (e) => {
      const item = e.target.closest("[data-place], [data-pet-place]");
      if (!item) return;
      const typ = item.dataset.place;
      const pet = item.dataset.petPlace;
      drag = { x: e.clientX, y: e.clientY, moved: false, typ, pet };
      try { item.setPointerCapture?.(e.pointerId); } catch {}
    });
    box.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
        drag.moved = true;
        state._invDragging = true;
        state.movingId = null;
        state.selectedFurnId = null;
        hideFurnActions();
        if (drag.typ) startPlace(drag.typ);
        else if (drag.pet) startPlacePet(drag.pet);
      }
      if (!drag.moved) return;
      const tile = tileAt(e.clientX, e.clientY);
      if (!tile) return;
      if (drag.pet) updatePetPlaceHighlight(tile.x, tile.y);
      else updatePlaceHighlight(tile.x, tile.y);
    });
    const finish = (e) => {
      if (!drag) return;
      const wasDrag = drag.moved;
      const pet = drag.pet;
      drag = null;
      if (!wasDrag) {
        state._invDragging = false;
        return;
      }
      const tile = tileAt(e.clientX, e.clientY);
      if (tile) {
        if (pet) {
          updatePetPlaceHighlight(tile.x, tile.y);
          confirmPlacePet();
        } else {
          updatePlaceHighlight(tile.x, tile.y);
          confirmGhostPlace();
        }
      }
      setTimeout(() => { state._invDragging = false; }, 0);
    };
    box.addEventListener("pointerup", finish);
    box.addEventListener("pointercancel", () => { drag = null; state._invDragging = false; });
  }

  function currentPlaceType() {
    if (state.pendingPlace) return state.pendingPlace;
    if (state.movingId) {
      const f = (state.room?.furniture || []).find((x) => x.id === state.movingId);
      return f?.type || null;
    }
    return null;
  }

  function nextFreeWallSlot(type, wall, slot, ignoreId) {
    const n = state.room?.size || 6;
    const list = state.room?.wallArt || [];
    const trySlot = (s) => HouseIso.canPlaceWall(type, wall, s, n)
      && !HouseIso.wallOccupied(list, wall, s, ignoreId);
    if (trySlot(slot)) return slot;
    for (let i = 1; i < n; i++) {
      const s = (slot + i) % n;
      if (trySlot(s)) return s;
    }
    return null;
  }

  function flipWallTarget(type, wall, slot, ignoreId) {
    const other = wall === "left" ? "back" : "left";
    const next = nextFreeWallSlot(type, other, slot, ignoreId);
    if (next == null) return null;
    return { wall: other, slot: next };
  }

  function rotatePending(dir = 1) {
    const wallType = pendingWallType();
    if (wallType) {
      const g = state.room3d?.getWallGhost?.();
      const art = state.movingWallId && (state.room?.wallArt || []).find((x) => x.id === state.movingWallId);
      const curWall = g?.wall || art?.wall || "back";
      const curSlot = g?.slot ?? art?.slot ?? 0;
      const flipped = flipWallTarget(wallType, curWall, curSlot, state.movingWallId);
      if (!flipped) {
        toast("No free space on the other wall.");
        return;
      }
      updateWallHighlight(flipped.wall, flipped.slot);
      if (state.movingWallId) {
        socket.emit("moveWallArt", { id: state.movingWallId, wall: flipped.wall, slot: flipped.slot });
      }
      return;
    }
    if (state.pendingPlace || state.movingId) {
      state.placeRot = HouseIso.normalizeRot((state.placeRot || 0) + dir);
      const g = state.room3d?.getGhost?.();
      if (g) updatePlaceHighlight(g.tx, g.ty);
      paintEditInventory();
      if (state.movingId) {
        const ng = state.room3d?.getGhost?.();
        const f = (state.room?.furniture || []).find((x) => x.id === state.movingId);
        if (f && ng?.ok) socket.emit("moveFurniture", { id: f.id, x: ng.tx, y: ng.ty, rot: state.placeRot });
      }
      return;
    }
    if (state.selectedFurnId && state.editMode) {
      const art = (state.room?.wallArt || []).find((x) => x.id === state.selectedFurnId);
      if (art) {
        const flipped = flipWallTarget(art.type, art.wall, art.slot, art.id);
        if (!flipped) {
          toast("No free space on the other wall.");
          return;
        }
        socket.emit("moveWallArt", { id: art.id, wall: flipped.wall, slot: flipped.slot });
        return;
      }
      const f = (state.room?.furniture || []).find((x) => x.id === state.selectedFurnId);
      if (!f) return;
      const rot = HouseIso.normalizeRot((f.rot || 0) + dir);
      socket.emit("moveFurniture", { id: f.id, x: f.x, y: f.y, rot });
    }
  }

  function confirmGhostPlace() {
    if (state.pendingPet) { confirmPlacePet(); return; }
    if (pendingWallType()) {
      confirmWallGhost();
      return;
    }
    const g = state.room3d?.getGhost?.();
    if (!g || !g.ok) return;
    if (state.movingId) {
      const f = (state.room?.furniture || []).find((x) => x.id === state.movingId);
      if (!f) { cancelPlace(); return; }
      socket.emit("moveFurniture", { id: f.id, x: g.tx, y: g.ty, rot: state.placeRot });
      return;
    }
    if (state.pendingPlace) {
      if (HouseIso.isWallArt(state.pendingPlace)) return;
      socket.emit("placeFurniture", { type: state.pendingPlace, x: g.tx, y: g.ty, rot: state.placeRot });
    }
  }

  function hideFurnActions() {
    HIDE($("#furn-actions"));
    HIDE($("#item-rotate"));
    syncPutAwayBtn();
  }

  function showFurnActions(id) {
    state.selectedFurnId = id;
    state.room3d?.highlightFurniture(id);
    syncPutAwayBtn();
    HIDE($("#furn-actions"));
    HIDE($("#place-actions"));
    const rot = $("#item-rotate");
    if (rot) {
      SHOW(rot);
      updateFurnActionPos();
    }
  }

  function selectFurniture(f) {
    if (!f) return;
    hidePetActions();
    state.selectedPet = null;
    state.selectedFurnId = f.id;
    state.movingId = null;
    state.movingWallId = null;
    state.pendingPlace = null;
    state.pendingPet = null;
    if (state.editMode) state.room3d?.setPlacing("edit");
    showFurnActions(f.id);
    syncPutAwayBtn();
  }
  function selectWallArt(art) {
    if (!art) return;
    hidePetActions();
    state.selectedPet = null;
    state.selectedFurnId = art.id;
    state.movingId = null;
    state.movingWallId = null;
    state.pendingPlace = null;
    state.pendingPet = null;
    if (state.editMode) state.room3d?.setPlacing("edit");
    state.room3d?.highlightFurniture(art.id);
    showFurnActions(art.id);
    syncPutAwayBtn();
  }
  function selectPet(pet) {
    if (!pet || !pet.item) return;
    hideFurnActions();
    state.selectedFurnId = null;
    state.movingId = null;
    state.movingWallId = null;
    state.pendingPlace = null;
    state.pendingPet = null;
    state.selectedPet = pet;
    if (state.editMode) state.room3d?.setPlacing("edit");
    showPetActions(pet);
    syncPutAwayBtn();
  }
  function beginMoveFurniture(f) {
    if (!f) return;
    hidePetActions();
    state.selectedFurnId = f.id;
    state.movingId = f.id;
    state.pendingPlace = null;
    state.pendingPet = null;
    state.movingWallId = null;
    state.placeRot = HouseIso.normalizeRot(f.rot);
    state.room3d?.setPlacing(f.type);
    showFurnActions(f.id);
    updatePlaceHighlight(f.x, f.y);
    if (state.editMode) paintEditInventory();
  }

  function beginMoveWall(art) {
    if (!art) return;
    hidePetActions();
    state.selectedFurnId = art.id;
    state.movingWallId = art.id;
    state.movingId = null;
    state.pendingPlace = null;
    state.pendingPet = null;
    state.room3d?.setPlacing(art.type);
    state.room3d?.highlightFurniture(art.id);
    SHOW($("#furn-actions"));
    updateFurnActionPos();
    updateWallHighlight(art.wall, art.slot);
    showPlaceActions();
  }

  function beginMovePet(pet) {
    if (!pet || !pet.item) return;
    hideFurnActions();
    state.selectedPet = pet;
    state.pendingPet = pet.item;
    state.pendingPlace = null;
    state.movingId = null;
    state.movingWallId = null;
    state.room3d?.setPlacing("edit");
    const x = Math.round(pet.x ?? 0);
    const y = Math.round(pet.y ?? 0);
    updatePetPlaceHighlight(x, y);
    showPetActions(pet);
    showPlaceActions();
  }

  function handleGrabStart(hit) {
    state._grabbing = true;
    state._grabMoved = false;
    state._grabStartX = null;
    state._grabStartY = null;
    state._grabOrigin = null;
    const f0 = hit?.id && (state.room?.furniture || []).find((x) => x.id === hit.id);
    if (f0) state._grabOrigin = { x: f0.x, y: f0.y, rot: f0.rot };
    if (!state.editMode) return;
    if (hit?.kind === "ghost") return;
    if (state.pendingPlace && !state.movingId && !state.movingWallId) return;
    if (state.pendingPet && hit?.kind !== "pet") return;
    if (hit?.kind === "furn" || hit?.kind === "npc") {
      const f = (state.room?.furniture || []).find((x) => x.id === hit.id);
      if (f) selectFurniture(f);
    } else if (hit?.kind === "pet" && hit.pet && !hit.pet.following) {
      selectPet(hit.pet);
    } else if (hit?.kind === "wall" && hit.art) {
      selectWallArt(hit.art);
    }
  }
  function handleGrabMove(cx, cy, hit) {
    state._grabbing = true;
    if (state._grabStartX == null) { state._grabStartX = cx; state._grabStartY = cy; }
    const dragged = Math.hypot(cx - state._grabStartX, cy - state._grabStartY) > 8;
    if (dragged && !state._grabMoved) {
      state._grabMoved = true;
      if (hit?.kind === "furn" || hit?.kind === "npc") {
        const f = (state.room?.furniture || []).find((x) => x.id === hit.id);
        if (f) beginMoveFurniture(f);
      } else if (hit?.kind === "pet" && hit.pet && !hit.pet.following) {
        beginMovePet(hit.pet);
      } else if (hit?.kind === "wall" && hit.art) {
        beginMoveWall(hit.art);
      }
    }
    if (dragged) state._grabMoved = true;
    const invHover = state.editMode && (function () {
      const inv = $("#edit-inventory");
      if (!inv || inv.classList.contains("hidden")) return false;
      const r = inv.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    })();
    $("#edit-inventory")?.classList.toggle("putaway-hover", Boolean(invHover));
    if (invHover) return;
    if (pendingWallType()) {
      const at = state.room3d?.pickHitAt?.(cx, cy);
      if (at?.kind === "wall") updateWallHighlight(at.wall, at.slot);
      return;
    }
    const tile = state.room3d?.pickFloorTileAt?.(cx, cy);
    if (!tile) return;
    if (state.pendingPet) updatePetPlaceHighlight(tile.x, tile.y);
    else updatePlaceHighlight(tile.x, tile.y);
  }
  function overEditInventory(cx, cy) {
    const inv = $("#edit-inventory");
    if (!inv || inv.classList.contains("hidden")) return false;
    const r = inv.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }
  const PUTAWAY_DOUBLE_MS = 300;
  let lastEditTap = null;
  function isEditDoubleTap(key) {
    const now = Date.now();
    const hit = Boolean(lastEditTap && lastEditTap.key === key && now - lastEditTap.at <= PUTAWAY_DOUBLE_MS);
    lastEditTap = hit ? null : { key, at: now };
    return hit;
  }
  function hasEditSelection() {
    return Boolean(state.selectedPet?.item || state.selectedFurnId || state.movingId || state.movingWallId);
  }
  function syncPutAwayBtn() {
    const btn = $("#edit-putaway");
    if (!btn) return;
    const on = state.editMode && hasEditSelection();
    btn.disabled = !on;
    btn.setAttribute("aria-disabled", on ? "false" : "true");
    btn.classList.toggle("is-dim", !on);
  }
  function poofAtSelection(id, kind) {
    const layer = document.getElementById("bubble-layer");
    if (!layer || !id) return;
    const pos = kind === "pet"
      ? state.room3d?.projectPet?.(id)
      : state.room3d?.projectFurniture?.(id);
    if (!pos) return;
    const poof = document.createElement("div");
    poof.className = "poof-float";
    poof.dataset.testid = "putaway-poof";
    poof.style.left = (pos.x || 0) + "px";
    poof.style.top = (pos.y || 0) + "px";
    layer.appendChild(poof);
    setTimeout(() => poof.remove(), 450);
  }
  function putAwaySelected() {
    const pet = state.selectedPet;
    const wallId = state.movingWallId || ((state.room?.wallArt || []).some((a) => a.id === state.selectedFurnId) ? state.selectedFurnId : null);
    const furnId = state.movingId || state.selectedFurnId;
    if (pet?.item) poofAtSelection(pet.id, "pet");
    else if (wallId) poofAtSelection(wallId, "wall");
    else if (furnId) poofAtSelection(furnId, "furn");
    if (pet?.item) {
      socket.emit("putAwayPet", { item: pet.item, id: pet.id });
      state.selectedPet = null;
    } else if (wallId) {
      socket.emit("pickupWallArt", { id: wallId });
    } else if (furnId) {
      socket.emit("pickupFurniture", { id: furnId });
    } else {
      syncPutAwayBtn();
      return;
    }
    lastEditTap = null;
    cancelPlace();
    state.selectedFurnId = null;
    hideFurnActions();
    state.room3d?.highlightFurniture(null);
    if (state.editMode) state.room3d?.setPlacing("edit");
    $("#edit-inventory")?.classList.remove("putaway-hover");
    syncPutAwayBtn();
  }
  function handleGrabEnd(cx, cy, hit) {
    handleGrabMove(cx, cy, hit);
    const moved = state._grabMoved || overEditInventory(cx, cy);
    state._grabbing = false;
    $("#edit-inventory")?.classList.remove("putaway-hover");
    if (overEditInventory(cx, cy) && state.editMode) { putAwaySelected(); return; }
    if (!moved) {
      if (state.movingId || state.movingWallId) {
        const id = state.movingId || state.movingWallId || state.selectedFurnId;
        state.movingId = null;
        state.movingWallId = null;
        state.pendingPlace = null;
        state.room3d?.setGhost(null);
        state.room3d?.setWallGhost(null);
        if (id) showFurnActions(id);
      }
      return;
    }
    if (pendingWallType()) {
      const g = state.room3d?.getWallGhost?.();
      if (g && g.ok) confirmWallGhost();
      else {
        const art = (state.room?.wallArt || []).find((x) => x.id === state.movingWallId);
        if (art) updateWallHighlight(art.wall, art.slot);
        state.movingWallId = null;
        state.room3d?.setWallGhost(null);
      }
      return;
    }
    if (state.pendingPet) {
      const g = state.room3d?.getPetGhost?.();
      if (g && g.ok) confirmPlacePet();
      return;
    }
    if (state.pendingPlace || state.movingId) {
      const g = state.room3d?.getGhost?.();
      if (g && g.ok) {
        state._deselectAfterCommit = true;
        confirmGhostPlace();
        if (state.editMode) {
          cancelPlace();
          hideFurnActions();
          state.selectedFurnId = null;
          state.room3d?.highlightFurniture(null);
        }
      } else if (state._grabOrigin) {
        updatePlaceHighlight(state._grabOrigin.x, state._grabOrigin.y);
        state.movingId = null;
        state.room3d?.setGhost(null);
        if (state.selectedFurnId) showFurnActions(state.selectedFurnId);
      }
    }
  }

  function updateFurnActionPos() {
    const bar = $("#item-rotate") || $("#furn-actions");
    if (!bar || bar.classList.contains("hidden") || !state.selectedFurnId) return;
    const pos = state.room3d?.projectFurniture(state.selectedFurnId) || state.room3d?.projectPet?.(state.selectedFurnId);
    if (!pos || !pos.visible) return;
    bar.style.left = pos.x + "px";
    bar.style.top = Math.max(24, pos.y - 8) + "px";
  }

  function inBoundsTile(x, y, size) {
    return x >= 0 && y >= 0 && x < size && y < size;
  }

  function isUseableFurn(type) {
    return [
      "couch", "chair", "hoverchair", "capsulecouch",
      "tv", "holotv", "chesstable", "fridge", "punchbag", "heavybag",
      "benchpress", "treadmill", "cubics", "clothescab", "coffeemachine", "stove",
      "recordplayer", "bed",
    ].includes(type) || type === RECORD_TYPE;
  }

  function requestWalkTo(tx, ty) {
    const me = state.people.get(state.me?.username);
    // A regular floor walk cancels a pending "use this furniture when I arrive" job.
    state.pendingArrive = null;
    if (me?.sitting || me?.lying) {
      socket.emit("standUp");
      me.sitting = false;
      me.lying = false;
    }
    const size = state.room?.size || 6;
    const from = { x: me?.x ?? tx, y: me?.y ?? ty };
    const dest = nearestWalkable(from, tx, ty, blockedNow(), size);
    if (!dest) {
      toast("You can't walk there.");
      return false;
    }
    if (me) {
      const dx = dest.x - me.x, dy = dest.y - me.y;
      if (dx || dy) me.facing = { x: dx, z: dy };
    }
    if (phoneOpen()) closePhone();
    state.room3d?.setMoveTarget?.(dest.x, dest.y);
    socket.emit("move", { x: dest.x, y: dest.y });
    return true;
  }

  function nearestWalkable(from, tx, ty, blocked, size, extraTiles) {
    const pathTo = (x, y) => HouseIso.pathfind(from, { x, y }, blocked, size);
    if (inBoundsTile(tx, ty, size) && !blocked.has(tx + "," + ty)) {
      const path = pathTo(tx, ty);
      if (path) return { x: tx, y: ty };
    }
    const seeds = extraTiles ? extraTiles.slice() : [{ x: tx, y: ty }];
    const seen = new Set();
    const cands = [];
    for (const t of seeds) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = t.x + dx, y = t.y + dy;
        const k = x + "," + y;
        if (seen.has(k) || !inBoundsTile(x, y, size) || blocked.has(k)) continue;
        seen.add(k);
        cands.push({ x, y, d: Math.hypot(x - from.x, y - from.y) });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands) {
      if (pathTo(c.x, c.y)) return { x: c.x, y: c.y };
    }
    return null;
  }

  function approachFurniture(furn, then) {
    const me = state.people.get(state.me?.username);
    if (!me) return;
    const size = state.room?.size || 6;
    const tiles = HouseIso.tilesFor(furn.type, furn.x, furn.y, furn.rot);
    const occ = new Set(tiles.map((t) => t.x + "," + t.y));
    const blocked = blockedNow();
    const cands = [];
    for (const t of tiles) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = t.x + dx, y = t.y + dy;
        if (!inBoundsTile(x, y, size) || occ.has(x + "," + y) || blocked.has(x + "," + y)) continue;
        cands.push({ x, y, d: Math.hypot(x - me.x, y - me.y) });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const dest = cands[0];
    if (!dest) {
      then();
      return;
    }
    if (Math.hypot(dest.x - me.x, dest.y - me.y) < 0.55) {
      then();
      return;
    }
    const path = HouseIso.pathfind({ x: me.x, y: me.y }, { x: dest.x, y: dest.y }, blocked, size);
    if (!path) {
      toast("You can't reach that.");
      return;
    }
    state.pendingArrive = { x: dest.x, y: dest.y, fn: then };
    state.room3d?.setMoveTarget?.(dest.x, dest.y);
    // Start the approach locally so a late userMoved from a previous walk cannot
    // drop the path before we even begin heading to the furniture.
    setPersonDest(me, dest.x, dest.y, false);
    socket.emit("move", { x: dest.x, y: dest.y });
  }

  function pendingArriveDest() {
    const job = state.pendingArrive;
    return job && Number.isFinite(job.x) && Number.isFinite(job.y) ? job : null;
  }

  function maybeFireArrive(p) {
    const job = pendingArriveDest();
    if (!job || !p || p.username !== state.me?.username) return false;
    if (Math.hypot(job.x - p.x, job.y - p.y) >= 0.85) return false;
    state.pendingArrive = null;
    setTimeout(() => job.fn(), 30);
    return true;
  }

  function isShopProp(type) {
    return ["shopkeeper", "rack", "mannequin", "petpen", "cage", "counter"].includes(type);
  }


  function setVoice() {
    state.voice = "speak";
    const send = $("#chat-send");
    if (send) send.textContent = "Say";
  }

  function storePanelOpen() {
    const el = $("#store-panel");
    return Boolean(el && !el.classList.contains("hidden"));
  }

  function setShopOpenUi(open) {
    document.body.classList.toggle("shop-open", open);
    const btn = $("#shop-toggle");
    if (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close shop" : "Open shop");
    }
  }

  function closeStorePanel() {
    state.shopFromPhone = false;
    endPhoneHoldIfIdle();
    HIDE($("#store-panel"));
    setShopOpenUi(false);
    if (state.storePreview) {
      state.storePreview.dispose?.();
      state.storePreview = null;
    }
    state.storeKind = null;
    state.storeSel = null;
    const prev = $("#store-preview");
    if (prev) prev.innerHTML = "";
  }

  function toggleStorePanel() {
    if (storePanelOpen()) closeStorePanel();
    else openStorePanel(state.storeKind || "furniture");
  }

  function storeStock(kind, slot) {
    if (kind === "pets") return PET_STOCK;
    if (kind === "clothes") {
      const s = slot || (kind === state.storeKind ? state.storeSlot : state.shopSlot) || "all";
      if (!s || s === "all") return CLOTHING_STOCK;
      return CLOTHING_STOCK.filter((item) => clothingSlot(item) === s);
    }
    if (kind === "art") {
      const listed = CATALOG.filter((item) => item.surface === "wall").map((item) => {
        const extra = ART_PIECES.find((p) => p.type === item.type);
        return extra ? { ...item, description: extra.description, label: extra.name, fresh: true } : item;
      });
      listed.sort((a, b) => Number(Boolean(b.fresh)) - Number(Boolean(a.fresh)));
      return listed;
    }
    return CATALOG.filter((item) => item.surface !== "wall");
  }

  function ownsStoreItem(kind, stock) {
    if (kind === "furniture" || kind === "art") {
      const typ = stock.type || stock.id;
      return (state.me?.inventory || []).includes(typ);
    }
    const col = state.me?.collection;
    if (!col) return false;
    if (kind === "pets") return (col.pets || []).some((p) => p.item === stock.item);
    return (col.clothes || []).some((c) => c.catalogId === stock.id);
  }

  const storeThumbCache = new Map();

  function storeThumbKey(kind, stock, avatar) {
    const id = stock?.id || stock?.type || stock?.item || "";
    if (kind === "clothes") {
      const item = stock?.item || {};
      return "clothes:" + id + ":" + (avatar?.skin || "") + ":" + (avatar?.hair || "") + ":" + JSON.stringify(item);
    }
    if (kind === "pets") return "pets:" + (stock?.item || id);
    if (kind === "art") return "art:" + id;
    return "furn:" + id;
  }

  function blitSpriteToThumb(ctx, spr, size, pad = 4) {
    if (!spr?.c) return false;
    const sc = Math.min((size - pad) / spr.w, (size - pad) / spr.h);
    const dw = Math.max(1, Math.round(spr.w * sc));
    const dh = Math.max(1, Math.round(spr.h * sc));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, Math.floor((size - dw) / 2), Math.floor((size - dh) / 2), dw, dh);
    return true;
  }

  function paintStoreCardThumb(canvas, kind, stock, avatar) {
    if (!canvas || !stock) return false;
    const size = canvas.width || 56;
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const key = storeThumbKey(kind, stock, avatar) + ":" + size;
    let src = storeThumbCache.get(key);
    if (!src) {
      src = document.createElement("canvas");
      src.width = size;
      src.height = size;
      const sctx = src.getContext("2d");
      sctx.imageSmoothingEnabled = false;
      sctx.fillStyle = "#efe6d4";
      sctx.fillRect(0, 0, size, size);
      if (kind === "furniture") {
        const typ = stock.type || stock.id;
        const spr = drawFurnitureSprite(typ, { lights: true, rot: 0, on: true });
        if (!blitSpriteToThumb(sctx, spr, size)) {
          const svg = typeof furnitureSVG === "function" ? furnitureSVG(typ) : "";
          if (svg) {
            src.dataset.svg = "1";
          }
        }
      } else if (kind === "pets") {
        if (typeof window.__paintPetThumb === "function") window.__paintPetThumb(src, stock.item);
      } else if (kind === "art") {
        paintArtThumb(src, stock.type || stock.id);
      } else if (kind === "clothes") {
        if (typeof window.__paintStoreThumb === "function") {
          window.__paintStoreThumb(src, "clothes", stock.item, avatar || {});
        }
      }
      storeThumbCache.set(key, src);
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(src, 0, 0);
    return true;
  }

  function paintStorePreview() {

    const el = $("#store-preview");
    const nameEl = $("#store-foot-name");
    const priceEl = $("#store-foot-price");
    const kind = state.storeKind || "furniture";
    const stock = storeStock(kind).find((s) => (s.id || s.type) === state.storeSel);
    const owned = stock && ownsStoreItem(kind, stock);
    const label = stock ? (stock.label || stock.name || stock.type || "") : "";
    if (nameEl) nameEl.textContent = label;
    if (priceEl) priceEl.textContent = !stock ? "" : owned ? "owned" : `${stock.price}c`;
    if (state.storePreview) {
      state.storePreview.dispose?.();
      state.storePreview = null;
    }
    if (!el) return;
    if (!stock) { el.innerHTML = ""; return; }
    el.innerHTML = `<canvas width="40" height="40" class="store-thumb" data-testid="store-preview-canvas"></canvas>`;
    const c = el.querySelector("canvas");
    if (c) paintStoreCardThumb(c, kind, stock, state.me?.avatar || {});
  }

  function paintStoreTabs() {
    document.querySelectorAll("[data-store-tab]").forEach((b) => {
      b.classList.toggle("on", b.dataset.storeTab === state.storeKind);
      b.setAttribute("aria-selected", b.dataset.storeTab === state.storeKind ? "true" : "false");
    });
  }

  function paintSlotTabs(hostId, current, onPick) {
    const host = document.getElementById(hostId);
    if (!host) return;
    const clothes = (hostId.includes("phone") ? state.shopTab : state.storeKind) === "clothes";
    host.classList.toggle("hidden", !clothes);
    if (!clothes) { host.innerHTML = ""; return; }
    const slots = ["all", ...CLOTHING_SLOTS];
    const labels = { all: "All", tops: "Tops", bottoms: "Bottoms", hats: "Hats", accessories: "Accessories", shoes: "Shoes" };
    host.innerHTML = slots.map((slot) =>
      `<button type="button" class="store-slot${current === slot ? " on" : ""}" data-testid="${hostId.replace("tabs","")}${slot}" data-slot="${slot}">${labels[slot]}</button>`
    ).join("");
    host.querySelectorAll("[data-slot]").forEach((b) => {
      b.addEventListener("click", () => onPick(b.dataset.slot));
    });
  }

  function paintStorePanel() {
    const kind = state.storeKind || "clothes";
    const title = $("#store-panel-title");
    if (title) title.textContent = "Shop";
    updateCoins();
    paintShopInventory();
    paintStoreTabs();
    if (!state.storeSlot) state.storeSlot = "all";
    paintSlotTabs("store-slot-tabs", state.storeSlot, (slot) => {
      state.storeSlot = slot;
      const list = storeStock("clothes", slot);
      const still = list.some((it) => (it.id || it.type) === state.storeSel);
      if (!still) state.storeSel = (list[0] && (list[0].id || list[0].type)) || null;
      paintStorePanel();
      paintStorePreview();
    });
    const grid = $("#store-grid");
    if (!grid) return;
    const coins = state.me?.coins ?? 0;
    const stockList = storeStock(kind);
    grid.innerHTML = stockList
      .map((s) => {
        const id = s.id || s.type;
        const label = s.label || s.name || s.type;
        const owned = ownsStoreItem(kind, s);
        const sel = state.storeSel === id ? " selected" : "";
        const thumb = `<canvas class="store-thumb" width="56" height="56" data-testid="store-thumb-${id}" data-thumb-id="${id}"></canvas>`;
        const afford = !owned && coins >= (s.price || 0);
        const action = owned && (kind === "furniture" || kind === "art")
          ? `<button type="button" class="btn small" data-testid="place-${id}" data-place="${id}">Place</button>`
          : `<button type="button" class="btn small" data-testid="buy-${id}" data-buy="${id}" ${owned || afford ? (owned ? "disabled" : "") : "disabled"}>${owned ? "Owned" : "Buy"}</button>`;
        return `<div class="store-item${sel}" data-testid="store-item-${id}" data-store-id="${id}">${thumb}<span class="meta">${escapeHtml(label)}${owned ? " · owned" : ""}</span><span class="price">${owned ? "owned" : s.price + "c"}</span>${action}</div>`;
      })
      .join("");
    grid.querySelectorAll("[data-store-id]").forEach((b) => {
      b.addEventListener("click", (e) => {
        if (e.target.closest("[data-buy], [data-place]")) return;
        state.storeSel = b.dataset.storeId;
        paintStorePanel();
        paintStorePreview();
      });
    });
    grid.querySelectorAll("[data-buy]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = b.dataset.buy;
        if (!id) return;
        state.storeSel = id;
        if (kind === "furniture" || kind === "art") socket.emit("buyFurniture", { type: id });
        else socket.emit("buyStoreItem", { kind, id });
      });
    });
    grid.querySelectorAll("[data-place]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (b.dataset.place) startPlace(b.dataset.place);
      });
    });
    grid.querySelectorAll("canvas.store-thumb").forEach((c) => {
      const stock = stockList.find((s) => (s.id || s.type) === c.dataset.thumbId);
      if (stock) paintStoreCardThumb(c, kind, stock, state.me?.avatar || {});
    });
    const buy = $("#store-buy");
    const stock = stockList.find((s) => (s.id || s.type) === state.storeSel);
    const owned = stock && ownsStoreItem(kind, stock);
    if (buy) {
      buy.disabled = !stock || owned || coins < (stock?.price || 0);
      buy.textContent = !stock ? "Buy" : owned ? "Owned" : `Buy · ${stock.price}c`;
    }
    const tryon = $("#store-tryon");
    if (tryon) {
      tryon.style.display = kind === "clothes" || kind === "pets" ? "" : "none";
      tryon.textContent = kind === "pets" ? "Preview" : "Try on";
    }
    const wear = $("#store-wear");
    if (wear) {
      wear.style.display = kind === "clothes" && owned ? "" : "none";
      wear.disabled = !owned;
    }
  }

  function openStorePanel(kind, sku) {
    const k = kind === "pets" ? "pets" : kind === "art" ? "art" : kind === "furniture" ? "furniture" : "clothes";
    state.storeKind = k;
    if (k === "clothes") state.storeSlot = "all";
    const stock = storeStock(k);
    const idOf = (s) => s.id || s.type;
    state.storeSel = sku && stock.some((s) => idOf(s) === sku) ? sku : idOf(stock[0] || {});
    if (phoneOpen() || state.phoneHeld) state.shopFromPhone = true;
    if (phoneOpen()) hidePhoneUI();
    if (typeof closeCoinsPanel === "function") closeCoinsPanel();
    SHOW($("#store-panel"));
    setShopOpenUi(true);
    paintStorePanel();
    paintStorePreview();
  }

  $("#store-close")?.addEventListener("click", closeStorePanel);
  $("#shop-toggle")?.addEventListener("click", toggleStorePanel);
  $("#store-tabs")?.querySelectorAll("[data-store-tab]").forEach((b) => {
    b.addEventListener("click", () => openStorePanel(b.dataset.storeTab));
  });
  $("#store-tryon")?.addEventListener("click", () => {
    paintStorePreview();
    const kind = state.storeKind;
    const stock = storeStock(kind).find((s) => (s.id || s.type) === state.storeSel);
    if (!stock || kind === "pets" || kind === "furniture" || kind === "art") return;
    const me = state.people.get(state.me?.username);
    if (me) me.avatar = { ...(me.avatar || {}), ...(stock.item || {}) };
    renderPeople();
  });
  $("#store-buy")?.addEventListener("click", () => {
    if (!state.storeKind || !state.storeSel) return;
    if (state.storeKind === "furniture" || state.storeKind === "art") {
      socket.emit("buyFurniture", { type: state.storeSel });
      return;
    }
    socket.emit("buyStoreItem", { kind: state.storeKind, id: state.storeSel });
  });
  $("#store-wear")?.addEventListener("click", () => {
    const stock = storeStock(state.storeKind).find((s) => (s.id || s.type) === state.storeSel);
    const rec = (state.me?.collection?.clothes || []).find((c) => c.catalogId === stock?.id);
    if (!rec) return;
    socket.emit("equipClothes", { id: rec.id });
    const me = state.people.get(state.me?.username);
    if (me) me.avatar = { ...(me.avatar || {}), ...(rec.item || {}) };
    if (state.me) state.me.avatar = { ...(state.me.avatar || {}), ...(rec.item || {}) };
    renderPeople();
  });

  function handleFurnitureClick(id, type, extra = {}) {
    if (state.room?.shop && (isShopProp(type) || extra?.avatar)) {
      openStorePanel(state.room.shop);
      return;
    }
    if (extra?.wallArt || HouseIso.isWallArt(type)) {
      if (!state.editMode) return;
      if (state.pendingPlace && !state.movingWallId) return;
      const art = (state.room?.wallArt || []).find((x) => x.id === id);
      if (!art) return;
      if (isEditDoubleTap("wall:" + art.id)) {
        state.selectedFurnId = art.id;
        putAwaySelected();
        return;
      }
      selectWallArt(art);
      return;
    }
    if (state.editMode || state.pendingPlace || state.movingId) {
      if (!state.editMode) return;
      if (state.pendingPlace && !state.movingId) return;
      const f = (state.room?.furniture || []).find((x) => x.id === id);
      if (!f) return;
      if (isEditDoubleTap("furn:" + id)) {
        state.selectedFurnId = id;
        putAwaySelected();
        return;
      }
      selectFurniture(f);
      return;
    }
    const furn = (state.room?.furniture || []).find((x) => x.id === id);
    if (!furn) return;
    if (type === "couch" || type === "chair" || type === "hoverchair" || type === "capsulecouch") {
      approachFurniture(furn, () => socket.emit("sitFurniture", { id, seat: extra.seat }));
      return;
    }
    if (type === "tv" || type === "holotv") {
      socket.emit("toggleTv", { id });
      return;
    }
    if (type === "chesstable") {
      chessUI.handleTableClick(id, extra, (seat) => {
        approachFurniture(furn, () => socket.emit("sitFurniture", { id, seat }));
      });
      return;
    }
    if (type === "fridge") {
      approachFurniture(furn, () => socket.emit("openFridge", { id }));
      return;
    }
    if (type === "punchbag") {
      approachFurniture(furn, () => socket.emit("usePunchbag", { id }));
      return;
    }
    if (type === "benchpress" || type === "treadmill") {
      approachFurniture(furn, () => socket.emit("useGym", { id }));
      return;
    }
    if (type === "cubics") {
      approachFurniture(furn, () => openCubics(id));
      return;
    }
    if (type === "clothescab") {
      approachFurniture(furn, () => {
        socket.emit("useWardrobe", { id });
        openWardrobe(id);
      });
      return;
    }
    if (type === "coffeemachine") {
      approachFurniture(furn, () => {
        socket.emit("useCoffee", { id });
        toast("Brewing a cup…");
      });
      return;
    }
    if (type === "stove") {
      approachFurniture(furn, () => socket.emit("useStove", { id }));
      return;
    }
    if (type === "recordplayer" || type === RECORD_TYPE) {
      approachFurniture(furn, () => {
        openRecordPicker(id, state.room.recordPlayers?.[id]);
      });
      return;
    }
    if (type === "bed") {
      const me = state.people.get(state.me?.username);
      if (me?.lying && me.stationId === id) {
        socket.emit("standUp");
        me.lying = false;
        me.sitting = false;
        return;
      }
      approachFurniture(furn, () => socket.emit("useBed", { id }));
      return;
    }
    // Decorative / unused furniture: walk to the nearest adjacent tile.
    const tiles = HouseIso.tilesFor(furn.type, furn.x, furn.y, furn.rot);
    const me = state.people.get(state.me?.username);
    const dest = nearestWalkable({ x: me?.x ?? furn.x, y: me?.y ?? furn.y }, furn.x, furn.y, blockedNow(), state.room?.size || 6, tiles);
    if (dest) {
      if (me?.sitting || me?.lying) {
        socket.emit("standUp");
        me.sitting = false;
        me.lying = false;
      }
      if (phoneOpen()) closePhone();
      state.room3d?.setMoveTarget?.(dest.x, dest.y);
      socket.emit("move", { x: dest.x, y: dest.y });
    }
  }

  function refreshActivityUI() {
    const me = state.people.get(state.me?.username);
    const chip = $("#activity-chip");
    if (!chip) return;
    let key = "none";
    if (me?.boxing) key = "box:" + me.boxing.bagId + ":" + (me.boxing.auto ? "1" : "0");
    else if (me?.gym) key = "gym:" + me.gym.id + ":" + me.gym.type;
    else if (me?.heldItem) key = "hold:" + me.heldItem.kind;
    if (chip.dataset.key === key && key !== "none") {
      const sub = chip.querySelector(".item-sub");
      if (sub && me?.gym) {
        const label = me.gym.type === "treadmill" ? "Running" : "Bench";
        sub.textContent = label + " · " + (me.gym.reps || 0);
      }
      const combo = chip.querySelector(".combo-label");
      if (combo && me?.boxing) combo.textContent = (me.boxing.combo || 0) + " hits";
      return;
    }
    chip.dataset.key = key;
    if (me?.boxing) {
      const id = me.boxing.bagId;
      state.activityId = id;
      chip.innerHTML = `
        <button class="btn small" data-box="jab" data-testid="box-jab">Jab</button>
        <button class="btn small" data-box="hook" data-testid="box-hook">Hook</button>
        <button class="btn small" data-box="uppercut" data-testid="box-uppercut">Uppercut</button>
        <button class="btn small ${me.boxing.auto ? "sage" : ""}" data-testid="box-auto" id="box-auto">Auto</button>
        <button class="btn small secondary" data-testid="box-done" id="box-done">Done</button>`;
      SHOW(chip);
      chip.querySelectorAll("[data-box]").forEach((b) =>
        b.addEventListener("click", () => socket.emit("boxHit", { id, move: b.dataset.box }))
      );
      chip.querySelector("#box-auto")?.addEventListener("click", () => {
        const on = !me.boxing.auto;
        socket.emit("boxAuto", { id, on });
        setBoxAuto(on, id);
      });
      chip.querySelector("#box-done")?.addEventListener("click", () => {
        setBoxAuto(false, id);
        socket.emit("boxStop", { id });
      });
      if (me.boxing.auto) setBoxAuto(true, id);
      HIDE($("#fridge-picker"));
      return;
    }
    setBoxAuto(false);
    if (me?.gym) {
      const id = me.gym.id;
      state.activityId = id;
      const label = me.gym.type === "treadmill" ? "Running" : "Bench";
      chip.innerHTML = `
        <span class="item-sub">${label} · ${me.gym.reps || 0}</span>
        ${me.gym.type === "benchpress" ? `<button class="btn small" data-testid="gym-rep" id="gym-rep">Lift</button>` : ""}
        <button class="btn small secondary" data-testid="gym-done" id="gym-done">Done</button>`;
      SHOW(chip);
      chip.querySelector("#gym-rep")?.addEventListener("click", () => socket.emit("gymRep", { id }));
      chip.querySelector("#gym-done")?.addEventListener("click", () => {
        clearInterval(state.gymAutoTimer);
        state.gymAutoTimer = null;
        socket.emit("gymStop", { id });
      });
      if (me.gym.type === "benchpress" && !state.gymAutoTimer) {
        state.gymAutoTimer = setInterval(() => socket.emit("gymRep", { id }), 900);
      }
      return;
    }
    clearInterval(state.gymAutoTimer);
    state.gymAutoTimer = null;
    if (me?.heldItem) {
      chip.innerHTML = `<span class="item-sub">Holding ${heldItemLabel(me.heldItem)}</span><button class="btn small secondary" data-testid="stow-item" id="stow-item">Put away</button>`;
      SHOW(chip);
      chip.querySelector("#stow-item")?.addEventListener("click", () => socket.emit("stowItem"));
      return;
    }
    HIDE(chip);
  }

  function setBoxAuto(on, id) {
    if (state.boxAutoTimer) {
      clearInterval(state.boxAutoTimer);
      state.boxAutoTimer = null;
    }
    if (!on || !id) return;
    let i = 0;
    const cycle = ["jab", "hook", "jab", "uppercut"];
    state.boxAutoTimer = setInterval(() => {
      const mv = cycle[i++ % cycle.length];
      socket.emit("boxHit", { id, move: mv });
    }, 420);
  }

  function showFridgePicker(id) {
    state.fridgeId = id;
    paintFridgeThumbs(document);
    SHOW($("#fridge-picker"));
  }
  function hideFridgePicker() {
    HIDE($("#fridge-picker"));
    state.fridgeId = null;
  }

  function syncCamToggle() {
    const view = document.querySelector(".room-view");
    const btn = document.getElementById("cam-toggle");
    const st = state.room3d?.camState?.() || {};
    view?.classList.toggle("phone-cam", Boolean(st.phone));
    if (btn) {
      const follow = st.mode !== "room";
      const label = follow ? "Show the whole cube" : "Follow me";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      btn.setAttribute("aria-pressed", follow ? "false" : "true");
      btn.dataset.mode = st.mode || "follow";
    }
  }

  function lockPageScroll() {
    // iOS Safari can shift the layout or visual viewport, hiding the top HUD.
    // Always snap back to (0, 0). Avoid transforms on the app shell — they
    // would turn position:fixed HUD into a scrolled containing block.
    window.scrollTo(0, 0);
    const html = document.documentElement;
    const body = document.body;
    if (html) { html.scrollTop = 0; html.scrollLeft = 0; }
    if (body) { body.scrollTop = 0; body.scrollLeft = 0; }
    const se = document.scrollingElement;
    if (se && se !== html && se !== body) { se.scrollTop = 0; se.scrollLeft = 0; }
  }

  function syncVisualTop() {
    lockPageScroll();
    const vv = window.visualViewport;
    const offset = vv ? Math.max(0, Math.round(vv.offsetTop || 0)) : 0;
    const root = document.documentElement;
    root.style.setProperty("--vv-top", offset + "px");
    const bar = document.querySelector(".room-view .topbar");
    if (bar) {
      const h = Math.round(bar.getBoundingClientRect().height);
      if (h > 0) {
        const px = h + "px";
        root.style.setProperty("--room-topbar-h", px);
        document.querySelector(".room-view")?.style.setProperty("--room-topbar-h", px);
      }
    }
  }

  function isTouchChatLayout() {
    return window.innerWidth <= 820;
  }
  function keyboardHeight() {
    if (state.testKbInset != null) return Math.max(0, Math.round(state.testKbInset));
    const vv = window.visualViewport;
    if (!vv) return 0;
    const layoutH = window.innerHeight;
    return Math.max(0, Math.round(layoutH - vv.height - (vv.offsetTop || 0)));
  }
  try { localStorage.removeItem("mycubeKbReserve"); } catch {}
  function chromeBottom() {
    const vv = window.visualViewport;
    const layoutH = window.innerHeight;
    if (!vv) return 0;
    const gap = Math.max(0, Math.round(layoutH - vv.height - (vv.offsetTop || 0)));
    // A software keyboard is much taller than Safari's toolbar (~44–60px).
    if (gap >= 120) return null;
    return gap;
  }
  function measureChatFrame() {
    const root = document.documentElement;
    const inv = document.getElementById("edit-inventory");
    const invH = (inv && !inv.classList.contains("hidden")) ? Math.round(inv.getBoundingClientRect().height) : 0;
    const chrome = getComputedStyle(root).getPropertyValue("--chrome-bottom").trim();
    const chromePx = parseFloat(chrome) || 0;
    const h = invH + Math.max(8, chromePx);
    root.style.setProperty("--dock-h", h + "px");
    root.style.setProperty("--inv-h", invH + "px");
    document.querySelector(".room-view")?.style.setProperty("--dock-h", h + "px");
    document.querySelector(".room-view")?.style.setProperty("--inv-h", invH + "px");
  }

  function syncAppShell() {
    const layoutH = Math.max(1, Math.round(window.innerHeight));
    const root = document.documentElement;
    // Layout size stays locked to the layout viewport so a software
    // keyboard (visual viewport) does not shrink or shift the room.
    root.style.setProperty("--app-h", layoutH + "px");
    root.style.setProperty("--app-top", "0px");
    root.style.setProperty("--layout-h", layoutH + "px");
    root.style.setProperty("--kb-reserve", "0px");
    measureChatFrame();
    syncVisualTop();
    const chat = document.getElementById("chat-input");
    if (chat) {
      const next = "Say something...";
      if (chat.placeholder !== next) chat.placeholder = next;
    }
    if (state.view === "room") state.room3d?.resize();
  }

  function syncKeyboardInset() {
    syncVisualTop();
    const kb = keyboardHeight();
    const root = document.documentElement;
    const px = kb + "px";
    // Only the slim composer anchors to the keyboard. The room and fabs stay put.
    root.style.setProperty("--kb-inset", px);
    document.querySelector(".room-view")?.style.setProperty("--kb-inset", px);
    const chrome = chromeBottom();
    if (chrome != null) {
      const cpx = chrome + "px";
      root.style.setProperty("--chrome-bottom", cpx);
      document.querySelector(".room-view")?.style.setProperty("--chrome-bottom", cpx);
    }
    measureChatFrame();
  }

  let typingOn = false;
  let lastTypingEmit = 0;
  let typingIdleTimer = 0;
  function emitTyping(on) {
    if (on) {
      const now = Date.now();
      if (typingOn && now - lastTypingEmit < 350) {
        clearTimeout(typingIdleTimer);
        typingIdleTimer = setTimeout(() => emitTyping(false), 4000);
        return;
      }
      lastTypingEmit = now;
      typingOn = true;
      socket.emit("typing", { on: true });
      const me = state.people.get(state.me?.username);
      if (me) {
        me.typing = true;
        me.typingAt = now;
        paintOverlays();
      }
      clearTimeout(typingIdleTimer);
      typingIdleTimer = setTimeout(() => emitTyping(false), 4000);
    } else if (typingOn || state.people.get(state.me?.username)?.typing) {
      typingOn = false;
      lastTypingEmit = 0;
      clearTimeout(typingIdleTimer);
      socket.emit("typing", { on: false });
      const me = state.people.get(state.me?.username);
      if (me) {
        me.typing = false;
        me.typingAt = 0;
        paintOverlays();
      }
    }
  }

  function updateChatCount() {
    const el = $("#chat-input");
    const count = $("#chat-count");
    if (!el || !count) return;
    if (el.value.length > CHAT_MAX) el.value = el.value.slice(0, CHAT_MAX);
    count.textContent = `${el.value.length}/${CHAT_MAX}`;
  }
  function autosizeChat() {
    const el = $("#chat-input");
    if (!el) return;
    updateChatCount();
    const val = el.value.trim();
    if (val) emitTyping(true);
    else emitTyping(false);
    if (isChatOpen()) paintOverlays();
  }


  function showRewards() {
    paintRewards();
    SHOW($("#rewards-sheet"));
  }
  function hideRewards() {
    HIDE($("#rewards-sheet"));
  }

  function paintRewards() {
    const me = state.me;
    if (!me) return;
    const r = me.rewards || {};
    $("#rewards-balance").textContent = `You have 🪙 ${me.coins ?? 0}. Hang out with friends or grab a daily bonus to earn more.`;
    const packs = r.packs || {
      starter: { coins: 80, price: "$0.99", label: "Starter pack" },
      bundle: { coins: 500, price: "$4.99", label: "Bundle" },
      stack: { coins: 1200, price: "$9.99", label: "Stack" },
    };
    $("#coin-packs").innerHTML = Object.entries(packs).map(([id, pack]) => `
      <button type="button" class="pack-card" data-pack="${id}">
        <strong>${pack.label || id}</strong>
        <span>+${pack.coins} coins</span>
        <span class="pack-price">${pack.price}</span>
      </button>`).join("");
    $("#coin-packs").querySelectorAll("[data-pack]").forEach((b) => {
      b.addEventListener("click", () => {
        state.pendingPack = b.dataset.pack;
        const pack = packs[b.dataset.pack];
        $("#buy-confirm-copy").textContent = `Get ${pack.coins} coins for ${pack.price}? This is a fake purchase for the prototype.`;
        SHOW($("#buy-confirm"));
      });
    });
    const adsLeft = r.adsLeft ?? 3;
    $("#watch-ad-btn").disabled = adsLeft <= 0;
    $("#watch-ad-btn").textContent = adsLeft > 0 ? `Watch ad · +15 coins (${adsLeft} left today)` : "Ad cap reached today";

    const col = me.collection || { clothes: [], props: [], pets: [] };
    const bits = [];
    (col.clothes || []).forEach((c) => {
      bits.push(`<button type="button" class="inv-chip" data-wear="${c.id}">Wear ${escapeHtml(c.label)}</button>`);
    });
    (col.props || []).forEach((c) => {
      const on = me.heldProp === c.item;
      bits.push(`<button type="button" class="inv-chip" data-prop="${c.item}">${on ? "Put away" : "Hold"} ${escapeHtml(c.label)}</button>`);
    });
    (col.pets || []).forEach((c) => {
      const on = me.activePet === c.item;
      bits.push(`<button type="button" class="inv-chip" data-pet="${c.item}">${on ? "Send home" : "Bring"} ${escapeHtml(c.label)}</button>`);
    });
    $("#collection-list").innerHTML = bits.length ? bits.join("") : `<span class="empty">Win clothes, props, or a pet on the daily spin.</span>`;
    $("#collection-list").querySelectorAll("[data-wear]").forEach((b) =>
      b.addEventListener("click", () => socket.emit("equipClothes", { id: b.dataset.wear }))
    );
    $("#collection-list").querySelectorAll("[data-prop]").forEach((b) => {
      b.addEventListener("click", () => {
        const item = b.dataset.prop;
        socket.emit("equipProp", { item: state.me?.heldProp === item ? null : item });
      });
    });
    $("#collection-list").querySelectorAll("[data-pet]").forEach((b) => {
      b.addEventListener("click", () => {
        const item = b.dataset.pet;
        socket.emit("equipPet", { item: state.me?.activePet === item ? null : item });
      });
    });

    const odds = r.odds || [];
    $("#spin-odds").innerHTML = odds.map((o) => `<li>${escapeHtml(o.label)} — ${o.chance}%</li>`).join("");
    const canFree = r.freeSpinAvailable;
    const extra = r.extraSpins || 0;
    $("#spin-btn").disabled = !canFree && extra <= 0;
    $("#spin-btn").textContent = canFree ? "Free spin" : extra ? `Spin (${extra} extra)` : "No spins left";
    $("#spin-ad-btn").disabled = (r.adSpinsLeft ?? 0) <= 0;
  }

  function playAd(kind) {
    const overlay = $("#ad-overlay");
    const timer = $("#ad-timer");
    SHOW(overlay);
    let n = 5;
    timer.textContent = n;
    const tick = setInterval(() => {
      n -= 1;
      timer.textContent = Math.max(0, n);
      if (n <= 0) {
        clearInterval(tick);
        HIDE(overlay);
        if (kind === "coins") socket.emit("claimAdReward");
        if (kind === "spin") socket.emit("claimAdSpin");
      }
    }, 1000);
  }


  /* ---------- in-room phone ---------- */
  function isOwner() {
    return Boolean(state.room && state.me && state.room.owner === state.me.username);
  }

  function spinAvailable() {
    return Boolean(state.me?.rewards?.freeSpinAvailable);
  }

  function updatePhoneBadge() {
    const spin = spinAvailable();
    document.querySelectorAll("[data-testid=spin-app-badge]").forEach((el) => {
      el.classList.toggle("hidden", !spin);
    });
    document.querySelectorAll("[data-testid=phone-badge]").forEach((el) => {
      el.classList.toggle("hidden", !spin || Boolean(state.phoneBadgeSeen));
    });
  }

  function tickPhoneTime() {
    const el = $("#phone-time");
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function phoneOpen() {
    return Boolean($("#phone-overlay") && !$("#phone-overlay").classList.contains("hidden"));
  }
  function isEditCharOpen() {
    const el = $("#edit-char-overlay");
    return Boolean(el && !el.classList.contains("hidden") && !el.hasAttribute("hidden"));
  }
  function phoneHoldActive() {
    return Boolean(phoneOpen() || isEditCharOpen() || isPhoneEditOpen() || (typeof storePanelOpen === "function" && storePanelOpen() && state.shopFromPhone));
  }
  function beginPhoneHold() {
    if (state.phoneHeld) return;
    state.phoneHeld = true;
    socket.emit("usePhone", { on: true });
  }
  function endPhoneHoldIfIdle() {
    if (!state.phoneHeld) return;
    if (phoneHoldActive()) return;
    state.phoneHeld = false;
    socket.emit("usePhone", { on: false });
  }
  function hidePhoneUI() {
    if (isPhoneEditOpen() && !isEditCharOpen()) {
      persistDraft();
      closeFromPhone();
      state.creatorReturn = null;
      HIDE($("#creator-back"));
    }
    dockSpinInPhone(false);
    HIDE($("#phone-overlay"));
    $("#phone-overlay")?.classList.remove("phone-just-opened");
    document.body.classList.remove("phone-open");
    setPhoneExpanded(false);
    $("#phone-btn")?.setAttribute("aria-expanded", "false");
    state.phoneApp = null;
  }

  function setPhoneExpanded(on) {
    $("#phone-overlay")?.classList.toggle("app-open", Boolean(on));
  }
  function showPhoneHome() {
    if (isPhoneEditOpen()) {
      persistDraft();
      closeFromPhone();
      state.creatorReturn = null;
      HIDE($("#creator-back"));
    }
    if (state.editMode) exitEditMode();
    dockSpinInPhone(false);
    document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
    SHOW($("#phone-home"));
    state.phoneApp = "home";
    setPhoneExpanded(false);
  }

  function closePhone() {
    hidePhoneUI();
    if (isEditCharOpen()) return;
    endPhoneHoldIfIdle();
  }

  function paintPhoneEditPreview() {
    const box = $("#phone-edit-preview");
    if (!box) return;
    const screen = $("#phone-screen-edit-character");
    if (!screen || screen.classList.contains("hidden") || !state.draft) {
      box.innerHTML = "";
      return;
    }
    if (!box.clientHeight) {
      requestAnimationFrame(() => paintPhoneEditPreview());
      return;
    }
    const spr = drawAvatarSprite(state.draft, { bodyDir: 1, headDir: 1, blink: "open" }, 0);
    const boxW = Math.max(1, box.clientWidth || 140);
    const boxH = Math.max(1, box.clientHeight || 48);
    const raw = Math.min(boxW / spr.w, boxH / spr.h);
    const scale = raw >= 1 ? Math.floor(raw) : Math.max(0.5, raw);
    const dw = Math.max(1, Math.round(spr.w * scale));
    const dh = Math.max(1, Math.round(spr.h * scale));
    let c = box.querySelector("canvas");
    if (!c) {
      c = document.createElement("canvas");
      box.innerHTML = "";
      box.appendChild(c);
    }
    c.width = spr.w;
    c.height = spr.h;
    c.style.width = dw + "px";
    c.style.height = dh + "px";
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(spr.c, 0, 0);
  }
  function paintPhoneEmotes() {
    const body = $("#phone-emotes-body");
    if (!body) return;
    body.innerHTML = `<div class="phone-emote-grid">` + ACTION_EMOTE_LIST.map((e) =>
      `<button type="button" data-testid="phone-emote-${e.id}" data-emote="${e.id}"><span>${e.icon}</span><span>${e.label}</span></button>`
    ).join("") + `</div>`;
    body.querySelectorAll("[data-emote]").forEach((b) => {
      b.addEventListener("click", () => {
        playActionEmote(b.dataset.emote);
      });
    });
  }
  function dockSpinInPhone(on) {
    const card = document.querySelector("#spin-modal .card, #spin-modal .modal, #spin-modal > div") || document.querySelector("#phone-spin-mount .card, #phone-spin-mount > div");
    const dest = on ? $("#phone-spin-mount") : $("#spin-modal");
    if (!card || !dest) return;
    if (card.parentElement !== dest) dest.appendChild(card);
    if (!on) HIDE($("#spin-modal"));
  }
  function hidePetActions() {
    HIDE($("#pet-actions"));
    state.selectedPet = null;
  }
  function showPetActions(pet) {
    state.selectedPet = pet;
    const bar = $("#pet-actions");
    if (!bar) return;
    const followBtn = $("#pet-follow");
    const awayBtn = $("#pet-putaway");
    if (followBtn) {
      const already = state.me?.activePet === pet.item && pet.following;
      followBtn.classList.toggle("hidden", Boolean(already));
    }
    SHOW(bar);
    const pos = state.room3d?.projectPet?.(pet.id);
    if (pos && pos.visible) {
      bar.style.left = pos.x + "px";
      bar.style.top = pos.y + "px";
    }
  }
  function handlePetClick(pet) {
    if (!pet || !pet.item) return;
    if (pet.owner && state.me?.username && pet.owner !== state.me.username) {
      toast("That's not your pal.");
      return;
    }
    if (state.editMode) {
      if (state.pendingPlace && !state.pendingPet) return;
      if (pet.following) { showPetActions(pet); syncPutAwayBtn(); return; }
      if (isEditDoubleTap("pet:" + (pet.id || pet.item))) {
        state.selectedPet = pet;
        putAwaySelected();
        return;
      }
      selectPet(pet);
      return;
    }
    showPetActions(pet);
  }

    const OWNER_APPS = new Set(["invite", "lock"]);
  const APP_TITLES = {
    edit: "Edit Room",
    shop: "Shop",
    invite: "Invite",
    lock: "Lock",
    upgrade: "Upgrade",
  };

  function openPhone(app) {
    if (app === "coins") {
      openCoinsPanel();
      return;
    }
    if (app === "shop" || app === "clothes-store" || app === "pets-store") {
      openPhoneApp(app);
      return;
    }
    if (storePanelOpen()) closeStorePanel();
    if (typeof closeCoinsPanel === "function") closeCoinsPanel();
    if (typeof closeChatComposer === "function" && isChatOpen?.()) closeChatComposer();
    const wasOpen = phoneOpen();
    state.phoneBadgeSeen = true;
    tickPhoneTime();
    updatePhoneBadge();
    SHOW($("#phone-overlay"));
    document.body.classList.add("phone-open");
    $("#phone-btn")?.setAttribute("aria-expanded", "true");
    if (!wasOpen) {
      // Opening the phone exits Edit Room and can slide the handset under
      // the same finger. Ignore the rest of this pointer so the backdrop
      // or a home-screen app (Edit Character) cannot eat the opening tap.
      ignorePhoneTaps(400);
      phoneJustOpenedUntil = Date.now() + 400;
      const overlay = $("#phone-overlay");
      overlay?.classList.add("phone-just-opened");
      clearTimeout(phoneJustOpenedTimer);
      phoneJustOpenedTimer = setTimeout(() => overlay?.classList.remove("phone-just-opened"), 400);
      beginPhoneHold();
    }
    if (app) openPhoneApp(app);
    else showPhoneHome();
  }

  function openPhoneApp(app) {
    if (app === "clothes-store") {
      openStorePanel("clothes");
      return;
    }
    if (app === "pets-store") {
      openStorePanel("pets");
      return;
    }
    if (app === "shop") {
      openStorePanel("furniture");
      return;
    }
    if (storePanelOpen()) closeStorePanel();
    if (!phoneOpen()) {
      state.phoneBadgeSeen = true;
      tickPhoneTime();
      updatePhoneBadge();
      SHOW($("#phone-overlay"));
      document.body.classList.add("phone-open");
      $("#phone-btn")?.setAttribute("aria-expanded", "true");
      beginPhoneHold();
    }
    if (OWNER_APPS.has(app) && !isOwner()) {
      const title = APP_TITLES[app] || "App";
      const t = $("#phone-guest-title");
      const c = $("#phone-guest-copy");
      if (t) t.textContent = title;
      if (c) c.textContent = "Only the cube owner can use this.";
      HIDE($("#phone-home"));
      document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
      SHOW($("#phone-screen-guest"));
      state.phoneApp = "guest";
      setPhoneExpanded(true);
      return;
    }
    if (app === "leave") {
      HIDE($("#phone-home"));
      document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
      SHOW($("#phone-screen-leave"));
      state.phoneApp = "leave";
      setPhoneExpanded(true);
      return;
    }
    if (app === "edit-character" || app === "wardrobe") {
      openCharacterEditor("phone");
      return;
    }
    if (app === "emotes") {
      HIDE($("#phone-home"));
      document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
      SHOW($("#phone-screen-emotes"));
      state.phoneApp = "emotes";
      paintPhoneEmotes();
      return;
    }
    if (app === "spin") {
      HIDE($("#phone-home"));
      document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
      SHOW($("#phone-screen-spin"));
      state.phoneApp = "spin";
      dockSpinInPhone(true);
      paintRewards();
      return;
    }
    if (app === "edit") {
      enterEditMode();
      return;
    }
    HIDE($("#phone-home"));
    document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
    const screen = document.getElementById("phone-screen-" + app);
    if (!screen) return;
    SHOW(screen);
    state.phoneApp = app;
    setPhoneExpanded(true);
    if (app === "edit-legacy") paintEditInventory();
    if (app === "invite") {
      const input = $("#invite-name");
      if (input) {
        input.value = "";
        setTimeout(() => input.focus(), 40);
      }
    }
    if (app === "lock") paintLock();
    if (app === "pets") paintPets();
    if (app === "props") paintProps();
    if (app === "coins") paintPhoneCoins();
    if (app === "upgrade") paintUpgrade();
  }

  function paintEditRoom() {
    if (state.editMode) paintEditInventory();
  }

  function paintLock() {
    const body = $("#phone-lock-body");
    if (!body || !state.room) return;
    const locked = Boolean(state.room.locked);
    body.innerHTML = `
      <p class="lede">${locked ? "This cube is locked. Friends need the password or an invite to come in." : "This cube is open. Anyone can walk in."}</p>
      <label class="check-row">
        <input type="checkbox" id="phone-lock-toggle" data-testid="phone-lock-toggle" ${locked ? "checked" : ""} />
        Lock with a password
      </label>
      <div class="field ${locked ? "" : "hidden"}" id="phone-lock-pass-field">
        <label for="phone-lock-password">Password</label>
        <input id="phone-lock-password" data-testid="phone-lock-password" type="text" maxlength="24" placeholder="${locked ? "Enter a new password to change it" : "something friends can type"}" />
      </div>
      <button class="btn" type="button" data-testid="phone-lock-save" id="phone-lock-save">Save</button>
    `;
    const toggle = $("#phone-lock-toggle");
    const field = $("#phone-lock-pass-field");
    toggle.addEventListener("change", () => field.classList.toggle("hidden", !toggle.checked));
    $("#phone-lock-save").addEventListener("click", () => {
      socket.emit("setRoomLock", { locked: toggle.checked, password: $("#phone-lock-password").value });
    });
  }

  function petLabel(item) {
    const c = (state.me?.collection?.pets || []).find((p) => p.item === item);
    return c?.label || item;
  }
  function placedPetFor(item) {
    return (state.room?.pets || []).find((p) => p.item === item && (!p.owner || p.owner === state.me?.username));
  }
  function paintPets() {
    const body = $("#phone-pets-body");
    if (!body) return;
    const pets = state.me?.collection?.pets || [];
    if (!pets.length) {
      body.innerHTML = `<p class="phone-empty">Open Shop and the Pets tab to adopt a pal, then bring them into cubes with you.</p>`;
      return;
    }
    body.innerHTML =
      `<p class="lede">One pal can follow you. Others can stay in this cube.</p>` +
      pets.map((c) => {
        const follow = state.me?.activePet === c.item;
        const placed = placedPetFor(c.item);
        const status = follow ? "Following you" : placed ? "In this cube" : "In inventory";
        return `<div class="phone-pet-card" data-testid="pet-card-${c.item}">
          <strong>${escapeHtml(c.label)}</strong>
          <span class="item-sub">${status}</span>
          <div>
            ${follow ? "" : `<button type="button" class="btn small" data-pet-follow="${c.item}" data-testid="pet-follow-${c.item}">Follow me</button>`}
            ${placed && !follow ? "" : `<button type="button" class="btn small" data-pet-place="${c.item}" data-testid="pet-place-${c.item}">Place in room</button>`}
            ${(follow || placed) ? `<button type="button" class="btn small secondary" data-pet-away="${c.item}" data-testid="pet-away-${c.item}">Put away</button>` : ""}
          </div>
        </div>`;
      }).join("");
    body.querySelectorAll("[data-pet-follow]").forEach((b) => {
      b.addEventListener("click", () => socket.emit("equipPet", { item: b.dataset.petFollow }));
    });
    body.querySelectorAll("[data-pet-place]").forEach((b) => {
      b.addEventListener("click", () => startPlacePet(b.dataset.petPlace));
    });
    body.querySelectorAll("[data-pet-away]").forEach((b) => {
      b.addEventListener("click", () => socket.emit("putAwayPet", { item: b.dataset.petAway }));
    });
  }
  function startPlacePet(item) {
    state.pendingPet = item;
    state.pendingPlace = null;
    const banner = $("#place-banner");
    if (banner && !state.editMode) {
      banner.innerHTML = `Tap a tile to place your ${escapeHtml(petLabel(item))} <button class="btn small secondary" id="cancel-place" type="button">Cancel</button>`;
      SHOW(banner);
      $("#cancel-place")?.addEventListener("click", (e) => { e.stopPropagation(); cancelPlacePet(); });
    } else if (banner) HIDE(banner);
    $("#floor")?.classList.add("placing");
    state.room3d?.setPlacing(state.editMode ? "edit" : "pet");
    seedPlacePetGhost();
    showPlaceActions();
    const conf = $("#place-confirm");
    if (conf) conf.textContent = "Place";
  }
  function cancelPlacePet() {
    state.pendingPet = null;
    HIDE($("#place-banner"));
    $("#floor")?.classList.remove("placing");
    state.room3d?.setPetGhost?.(null);
    if (!state.editMode) state.room3d?.setPlacing(null);
    else state.room3d?.setPlacing("edit");
    hidePlaceActions();
  }
  function seedPlacePetGhost() {
    if (!state.pendingPet) return;
    const size = state.room?.size || 6;
    const cx = (size - 1) / 2;
    const ignore = { owner: state.me?.username, item: state.pendingPet };
    const spots = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (HouseIso.canPlacePet(state.room?.furniture || [], state.room?.pets || [], x, y, size, ignore)) {
          spots.push({ x, y, d: Math.hypot(x - cx, y - cx) });
        }
      }
    }
    spots.sort((a, b) => a.d - b.d);
    if (spots[0]) updatePetPlaceHighlight(spots[0].x, spots[0].y);
  }
  function updatePetPlaceHighlight(tx, ty) {
    if (!state.pendingPet) {
      state.room3d?.setPetGhost?.(null);
      return;
    }
    const size = state.room?.size || 6;
    const ignore = { owner: state.me?.username, item: state.pendingPet };
    const ok = HouseIso.canPlacePet(state.room?.furniture || [], state.room?.pets || [], tx, ty, size, ignore);
    state.room3d?.setPetGhost?.(state.pendingPet, tx, ty, ok);
    showPlaceActions();
    const conf = $("#place-confirm");
    if (conf) conf.disabled = !ok;
  }
  function confirmPlacePet() {
    const g = state.room3d?.getPetGhost?.();
    if (!state.pendingPet || !g || !g.ok) return;
    socket.emit("placePet", { item: state.pendingPet, x: g.tx, y: g.ty });
    cancelPlacePet();
  }


  function paintProps() {
    const body = $("#phone-props-body");
    if (!body) return;
    const props = state.me?.collection?.props || [];
    if (!props.length) {
      body.innerHTML = `<p class="phone-empty">Win a prop on the daily spin, then hold it in your hand.</p>`;
      return;
    }
    body.innerHTML =
      `<p class="lede">Props are held in your hand.</p>` +
      props
        .map((c) => {
          const on = state.me?.heldProp === c.item;
          return `<button type="button" class="inv-chip" data-prop="${c.item}">${on ? "Put away" : "Hold"} ${escapeHtml(c.label)}</button>`;
        })
        .join(" ");
    body.querySelectorAll("[data-prop]").forEach((b) => {
      b.addEventListener("click", () => {
        const item = b.dataset.prop;
        socket.emit("equipProp", { item: state.me?.heldProp === item ? null : item });
      });
    });
  }

  function defaultCoinPacks() {
    return state.me?.rewards?.packs || {
      starter: { coins: 80, price: "$0.99", label: "Starter pack" },
      bundle: { coins: 500, price: "$4.99", label: "Bundle" },
      stack: { coins: 1200, price: "$9.99", label: "Stack" },
    };
  }
  function coinsPanelOpen() {
    const el = $("#coins-panel");
    return Boolean(el && !el.classList.contains("hidden"));
  }
  function closeCoinsPanel() {
    const el = $("#coins-panel");
    if (el) HIDE(el);
    document.body.classList.remove("coins-open");
    $("#room-coins-btn")?.setAttribute("aria-expanded", "false");
    $("#room-coins-btn")?.setAttribute("aria-label", "Open coins");
  }
  function paintCoinsPanel() {
    const body = $("#coins-panel-body");
    if (!body) return;
    const packs = defaultCoinPacks();
    const adsLeft = state.me?.rewards?.adsLeft ?? 3;
    const packHtml = Object.entries(packs)
      .map(
        ([id, pack]) => `
      <button type="button" class="coins-pack pack-card" data-pack="${id}" data-testid="coin-pack-${id}">
        <span class="pack-meta"><strong>${pack.label || id}</strong><span class="pack-coins">+${pack.coins} coins</span></span>
        <span class="pack-price">${pack.price}</span>
      </button>`
      )
      .join("");
    body.innerHTML = `
      <button class="coins-watch-ad" type="button" data-testid="coins-watch-ad" id="coins-watch-ad" ${adsLeft <= 0 ? "disabled" : ""}>${
      adsLeft > 0 ? `Watch ad for coins · +15 (${adsLeft} left today)` : "Ad cap reached today"
    }</button>
      <div class="coins-pack-row">${packHtml}</div>
    `;
    $("#coins-watch-ad")?.addEventListener("click", () => playAd("coins"));
    body.querySelectorAll("[data-pack]").forEach((b) => {
      b.addEventListener("click", () => {
        state.pendingPack = b.dataset.pack;
        const pack = packs[b.dataset.pack];
        if (!pack) return;
        $("#buy-confirm-copy").textContent = `Get ${pack.coins} coins for ${pack.price}? This is a fake purchase for the prototype.`;
        SHOW($("#buy-confirm"));
      });
    });
  }
  function openCoinsPanel() {
    if (storePanelOpen()) closeStorePanel();
    if (phoneOpen()) closePhone();
    paintCoinsPanel();
    SHOW($("#coins-panel"));
    document.body.classList.add("coins-open");
    $("#room-coins-btn")?.setAttribute("aria-expanded", "true");
    $("#room-coins-btn")?.setAttribute("aria-label", "Close coins");
  }
  function toggleCoinsPanel() {
    if (coinsPanelOpen()) closeCoinsPanel();
    else openCoinsPanel();
  }
  function paintPhoneCoins() { paintCoinsPanel(); }

  function paintUpgrade() {
    const body = $("#phone-upgrade-body");
    if (!body || !state.room) return;
    const size = state.room.size || 6;
    const next = size === 6 ? 8 : size === 8 ? 10 : null;
    const cost = size === 6 ? 25 : 40;
    if (!next) {
      body.innerHTML = `<p class="lede">This cube is maxed at 10×10.</p>`;
      return;
    }
    const can = (state.me?.coins ?? 0) >= cost;
    body.innerHTML = `
      <p class="lede">This cube is ${size}×${size}. Upgrade to ${next}×${next} so there's more room to hang out.</p>
      <button type="button" class="btn" data-testid="upgrade-cube" ${can ? "" : "disabled"}>Upgrade cube to ${next}×${next} · 🪙 ${cost}</button>
    `;
    body.querySelector("[data-testid=upgrade-cube]")?.addEventListener("click", () => socket.emit("upgradeCube"));
  }

  function refreshPhoneScreens() {
    updatePhoneBadge();
    if (storePanelOpen()) paintStorePanel();
    if (!phoneOpen()) return;
    if (state.phoneApp === "edit") paintEditRoom();
    if (state.phoneApp === "lock") paintLock();
    if (state.phoneApp === "pets") paintPets();
    if (state.phoneApp === "props") paintProps();
    if (coinsPanelOpen()) paintCoinsPanel();
    if (state.phoneApp === "upgrade") paintUpgrade();
  }

  function applyDraftLive() {
    const draft = { ...state.draft };
    if (state.me) state.me.avatar = draft;
    const self = state.people.get(state.me?.username);
    if (self) {
      self.avatar = draft;
      // Keep seat, action, facing, and tile exactly as they are.
      renderPeople();
    }
  }

  function persistDraft() {
    if (!state.me) return;
    state.draft.displayName = ($("#display-name")?.value || "").trim() || state.me.username;
    applyDraftLive();
    socket.emit("updateAvatar", { ...state.draft });
  }

  function closePhoneEditor() {
    if (!isEditCharOpen() && !isPhoneEditOpen()) return;
    persistDraft();
    closeFromPhone();
    state.creatorReturn = null;
    HIDE($("#creator-back"));
    hidePhoneUI();
    endPhoneHoldIfIdle();
  }

  function openCharacterEditor(returnTo = "room") {
    state.draft = { ...HearthAvatar.defaults(), ...(state.me?.avatar || {}) };
    const nameEl = $("#display-name");
    if (nameEl) nameEl.value = state.draft.displayName || state.me?.username || "";
    paintCreator();
    if ((returnTo === "phone" || returnTo === "room") && state.view === "room" && state.room) {
      state.creatorReturn = "phone";
      beginPhoneHold();
      hidePhoneUI();
      if (!openFromPhone()) return;
      applyDraftLive();
      requestAnimationFrame(() => requestAnimationFrame(() => state.preview3d?.resize?.()));
      return;
    }
    closePhone();
    state.creatorReturn = returnTo === "phone" ? "room" : returnTo;
    SHOW($("#creator-back"));
    setView("creator");
  }

  function returnFromCreator() {
    if (isEditCharOpen() || isPhoneEditOpen() || state.creatorReturn === "phone") {
      persistDraft();
      closePhoneEditor();
      return;
    }
    const dest = state.creatorReturn;
    state.creatorReturn = null;
    HIDE($("#creator-back"));
    if (dest === "room" && state.room) {
      setView("room");
      state.room3d?.resize();
      renderPeople();
      return;
    }
    paintLobby();
    setView("lobby");
  }

  /* ---------- events ---------- */
  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    socket.emit("login", { username: $("#username-input").value.trim() });
  });

  $("#display-name").addEventListener("input", () => {
    state.draft.displayName = $("#display-name").value;
    if (isPhoneEditOpen()) applyDraftLive();
  });
  $("#glasses-toggle")?.addEventListener("change", () => {
    const on = $("#glasses-toggle").checked;
    state.draft.glassesStyle = on ? (state.draft.glassesStyle && state.draft.glassesStyle !== "none" ? state.draft.glassesStyle : "round") : "none";
    state.draft.glasses = on;
    paintCreator();
  });
  $("#save-avatar").addEventListener("click", () => {
    persistDraft();
    if (isEditCharOpen() || isPhoneEditOpen() || state.creatorReturn === "phone") {
      closePhoneEditor();
    }
  });
  $("#edit-avatar").addEventListener("click", () => {
    state.creatorReturn = "lobby";
    state.draft = { ...HearthAvatar.defaults(), ...(state.me.avatar || {}) };
    $("#display-name").value = state.draft.displayName || state.me.username;
    paintCreator();
    SHOW($("#creator-back"));
    setView("creator");
  });
  $("#creator-back")?.addEventListener("click", returnFromCreator);
  $("#edit-char-done")?.addEventListener("click", () => {
    persistDraft();
    closePhoneEditor();
  });
  $("#edit-char-rotate, #creator-rotate")?.addEventListener?.("click", () => state.preview3d?.cycleFacing?.());
  document.getElementById("creator-rotate")?.addEventListener("click", () => state.preview3d?.cycleFacing?.());
  document.querySelectorAll("[data-testid=edit-char-rotate]").forEach((b) => b.addEventListener("click", () => state.preview3d?.cycleFacing?.()));
  $("#save-avatar")?.setAttribute("aria-label", "Looks good");

  $("#room-locked").addEventListener("change", () => {
    $("#password-field").classList.toggle("hidden", !$("#room-locked").checked);
  });
  $("#create-room-form").addEventListener("submit", (e) => {
    e.preventDefault();
    socket.emit("createRoom", {
      name: $("#room-name").value.trim(),
      locked: $("#room-locked").checked,
      password: $("#room-password").value,
    });
    hideAddSheet();
  });
  $("#add-friend-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = $("#friend-name").value.trim();
    if (!username) return;
    socket.emit("addFriend", { username });
    $("#friend-name").value = "";
    hideAddSheet();
  });
  $("#add-menu-btn").addEventListener("click", showAddSheet);
  $("#add-sheet-close").addEventListener("click", hideAddSheet);
  $("#add-sheet-backdrop").addEventListener("click", hideAddSheet);
  $("#friend-search")?.addEventListener("input", () => {
    if (state.view === "lobby") paintLobby();
  });
  $("#together-banner-btn")?.addEventListener("click", () => {
    const id = $("#together-banner")?.dataset.roomId;
    if (id) tryJoin(id);
  });
  $("#rewards-btn")?.addEventListener("click", showRewards);
  $("#rewards-close")?.addEventListener("click", hideRewards);
  $("#rewards-backdrop")?.addEventListener("click", hideRewards);
  $("#watch-ad-btn")?.addEventListener("click", () => playAd("coins"));
  $("#open-spin-btn")?.addEventListener("click", () => {
    paintRewards();
    SHOW($("#spin-modal"));
  });
  $("#spin-close")?.addEventListener("click", () => HIDE($("#spin-modal")));
  $("#spin-btn")?.addEventListener("click", () => socket.emit("spinWheel"));
  $("#spin-ad-btn")?.addEventListener("click", () => playAd("spin"));
  $("#buy-confirm-yes")?.addEventListener("click", () => {
    HIDE($("#buy-confirm"));
    if (state.pendingPack) socket.emit("buyCoinPack", { pack: state.pendingPack });
    state.pendingPack = null;
  });
  $("#buy-confirm-no")?.addEventListener("click", () => {
    HIDE($("#buy-confirm"));
    state.pendingPack = null;
  });

  $("#leave-room")?.addEventListener("click", () => {
    closePhone();
    socket.emit("leaveRoom");
  });
  $("#leave-cube")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closePhone();
    socket.emit("leaveRoom");
  });
  let phoneTapIgnoreUntil = 0;
  let phoneJustOpenedUntil = 0;
  let phoneJustOpenedTimer = 0;
  function ignorePhoneTaps(ms = 400) {
    phoneTapIgnoreUntil = Date.now() + ms;
  }
  function phoneTapIgnored() {
    return Date.now() < phoneTapIgnoreUntil;
  }
  const phoneBtn = $("#phone-btn");
  let phoneBtnHandled = false;
  function setPhoneBtnPressed(on) {
    phoneBtn?.classList.toggle("is-pressed", Boolean(on));
  }
  function togglePhoneFromDock(e) {
    if (e && e.button != null && e.button !== 0) return false;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (phoneOpen()) closePhone();
    else openPhone();
    return true;
  }
  phoneBtn?.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    // preventDefault keeps a focused chat input from blurring first and
    // swallowing the tap; the toggle runs immediately on this event.
    e.preventDefault();
    e.stopPropagation();
    setPhoneBtnPressed(true);
    phoneBtnHandled = true;
    togglePhoneFromDock(e);
  }, { capture: true });
  phoneBtn?.addEventListener("pointerup", () => setPhoneBtnPressed(false));
  phoneBtn?.addEventListener("pointercancel", () => setPhoneBtnPressed(false));
  phoneBtn?.addEventListener("lostpointercapture", () => setPhoneBtnPressed(false));
  phoneBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (phoneBtnHandled) {
      phoneBtnHandled = false;
      return;
    }
    if (phoneTapIgnored()) return;
    togglePhoneFromDock(e);
  });
  $("#phone-overlay")?.querySelector(".phone-backdrop")?.addEventListener("click", (e) => {
    if (Date.now() < phoneJustOpenedUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    closePhone();
  });
  $("#phone-overlay")?.querySelector(".phone-backdrop")?.addEventListener("pointerdown", (e) => {
    // Close on the first pointer so a follow-up click isn't lost to the room.
    if (e.button != null && e.button !== 0) return;
    if (Date.now() < phoneJustOpenedUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target && e.target.closest && e.target.closest(".phone-device, #phone-btn")) return;
    e.preventDefault();
    closePhone();
  });
  $("#phone-home-bar")?.addEventListener("click", () => {
    if (state.phoneApp && state.phoneApp !== "home") showPhoneHome();
    else closePhone();
  });
  $("#phone-overlay")?.querySelectorAll("[data-app]").forEach((b) => {
    b.addEventListener("click", () => openPhoneApp(b.dataset.app));
  });
  $("#phone-overlay")?.querySelectorAll("[data-phone-back]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      showPhoneHome();
    });
  });
  $("#room-coins-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCoinsPanel();
  });
  $("#coins-panel-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeCoinsPanel();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!coinsPanelOpen()) return;
    const t = e.target;
    if (t?.closest?.("#coins-panel, #room-coins-btn, #buy-confirm, #ad-overlay")) return;
    closeCoinsPanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && coinsPanelOpen()) {
      closeCoinsPanel();
      return;
    }
    if (e.key === "Escape" && phoneOpen()) {
      if (state.phoneApp && state.phoneApp !== "home") showPhoneHome();
      else closePhone();
    }
    if (e.key === "Escape" && state.editMode) {
      if (state.pendingPlace || state.movingId) cancelPlace();
      else if (state.selectedFurnId) {
        state.selectedFurnId = null;
        hideFurnActions();
        state.room3d?.highlightFurniture(null);
      }
    }
    if ((e.key === "r" || e.key === "R") && state.view === "room") {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      rotatePending(1);
    }
  });
  const phoneDevice = $("#phone-device");
  const phoneScrollRoot = (el) => el?.closest?.(".phone-grid, .phone-app-body");
  const stopPhonePageScroll = (e) => {
    // The handset stays put; only the grid / app body may pan vertically.
    if (phoneScrollRoot(e.target)) return;
    e.preventDefault();
  };
  phoneDevice?.addEventListener("touchmove", stopPhonePageScroll, { passive: false });
  $("#phone-overlay")?.addEventListener("touchmove", (e) => {
    if (phoneScrollRoot(e.target)) return;
    if (e.target && (e.target === phoneDevice || phoneDevice?.contains(e.target) || e.target.closest?.(".phone-device, .phone-home, .phone-screen"))) {
      e.preventDefault();
    }
  }, { passive: false });
  $("#phone-shop-tabs")?.querySelectorAll("[data-shop-tab]").forEach((b) => {
    b.addEventListener("click", () => {
      state.shopTab = b.dataset.shopTab;
      if (b.dataset.shopTab === "clothes" || b.dataset.shopTab === "pets" || b.dataset.shopTab === "art") {
        state.shopSel = null;
      }
      paintShop();
    });
  });
  $("#phone-shop-buy")?.addEventListener("click", () => {
    if (!state.shopSel) return;
    if (state.shopTab === "art" || state.shopTab === "furniture") {
      socket.emit("buyFurniture", { type: state.shopSel });
      return;
    }
    socket.emit("buyStoreItem", { kind: state.shopTab, id: state.shopSel });
  });
  $("#phone-shop-tryon")?.addEventListener("click", () => {
    const kind = state.shopTab;
    const stock = storeStock(kind).find((s) => (s.id || s.type) === state.shopSel);
    if (!stock) return;
    if (kind === "clothes") {
      const me = state.people.get(state.me?.username);
      if (me) me.avatar = { ...(me.avatar || {}), ...(stock.item || {}) };
      renderPeople();
    }
    paintPhoneShopCatalog();
  });
  setInterval(tickPhoneTime, 15000);
  tickPhoneTime();
  const ACTION_EMOTE_LIST = [
    { id: "wave", label: "Wave", icon: "👋" },
    { id: "dance", label: "Dance", icon: "💃" },
    { id: "cry", label: "Cry", icon: "😢" },
    { id: "laugh", label: "Laugh", icon: "😂" },
    { id: "clap", label: "Clap", icon: "👏" },
    { id: "shrug", label: "Shrug", icon: "🤷" },
    { id: "heart", label: "Heart", icon: "❤️" },
    { id: "cheer", label: "Cheer", icon: "🎉" },
  ];
  let wheelOpen = false;
  let wheelDrag = false;
  let wheelJustOpened = false;
  let wheelHighlight = null;

  function emoteWheelEls() {
    return { wheel: $("#emote-wheel"), backdrop: $("#emote-wheel-backdrop"), btn: $("#emote-wheel-btn") };
  }

  function layoutEmoteWheel() {
    const { wheel, btn } = emoteWheelEls();
    if (!wheel || !btn) return;
    const rect = btn.getBoundingClientRect();
    const bx = rect.left + rect.width / 2;
    const by = rect.top + rect.height / 2;
    const n = ACTION_EMOTE_LIST.length;
    const iconR = 32;
    const pad = 10;
    const minX = pad + iconR;
    const maxX = window.innerWidth - pad - iconR;
    let radius = Math.min(168, Math.max(118, window.innerWidth * 0.36));
    const spaceTop = by - pad - iconR - 8;
    radius = Math.min(radius, Math.max(100, spaceTop));
    // Shift the fan origin inward so a full upward semicircle stays on-screen.
    let cx = bx, cy = by;
    if (cx - radius < minX) cx = minX + radius;
    if (cx + radius > maxX) cx = maxX - radius;
    wheel.style.left = cx + "px";
    wheel.style.top = cy + "px";
    const start = Math.PI;
    const end = 0;
    const slots = [...wheel.querySelectorAll(".emote-slot")];
    slots.forEach((el, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = start + (end - start) * t;
      const x = Math.cos(ang) * radius;
      const y = -Math.sin(ang) * radius;
      el.style.setProperty("--x", x + "px");
      el.style.setProperty("--y", y + "px");
      el.style.setProperty("--i", String(i));
    });
  }

  function paintEmoteWheel() {
    const { wheel } = emoteWheelEls();
    if (!wheel) return;
    wheel.innerHTML = ACTION_EMOTE_LIST.map(
      (e, i) => `<button type="button" class="emote-slot" data-testid="emote-slot-${e.id}" data-emote="${e.id}" style="--i:${i}">
        <span class="emote-ico">${e.icon}</span>
        <span class="emote-lab">${e.label}</span>
      </button>`
    ).join("");
    wheel.querySelectorAll(".emote-slot").forEach((b) => {
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        playActionEmote(b.dataset.emote);
        closeEmoteWheel();
      });
    });
  }

  function setWheelHighlight(id) {
    wheelHighlight = id;
    const { wheel } = emoteWheelEls();
    wheel?.querySelectorAll(".emote-slot").forEach((el) => {
      el.classList.toggle("active", el.dataset.emote === id);
    });
  }

  function slotAtPoint(x, y) {
    const { wheel } = emoteWheelEls();
    if (!wheel) return null;
    let best = null;
    let bestD = 40;
    wheel.querySelectorAll(".emote-slot").forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestD) { bestD = d; best = el.dataset.emote; }
    });
    return best;
  }

  function openEmoteWheel() {
    const { wheel, backdrop, btn } = emoteWheelEls();
    if (!wheel) return;
    if (!wheel.childElementCount) paintEmoteWheel();
    wheel.classList.remove("open");
    SHOW(wheel);
    SHOW(backdrop);
    layoutEmoteWheel();
    void wheel.offsetWidth;
    requestAnimationFrame(() => {
      layoutEmoteWheel();
      wheel.classList.add("open");
    });
    wheelOpen = true;
    wheelJustOpened = true;
    btn?.setAttribute("aria-expanded", "true");
    setTimeout(() => { wheelJustOpened = false; }, 250);
  }

  function closeEmoteWheel() {
    const { wheel, backdrop, btn } = emoteWheelEls();
    wheelOpen = false;
    wheelDrag = false;
    wheelHighlight = null;
    wheel?.classList.remove("open");
    HIDE(wheel);
    HIDE(backdrop);
    btn?.setAttribute("aria-expanded", "false");
  }

  function toggleEmoteWheel() {
    if (wheelOpen) closeEmoteWheel();
    else openEmoteWheel();
  }

  function playActionEmote(type) {
    if (!type) return;
    socket.emit("emote", { type });
  }

  const wheelBtn = $("#emote-wheel-btn");
  let skipWheelClick = false;
  wheelBtn?.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (wheelOpen) return;
    openEmoteWheel();
    wheelDrag = true;
    skipWheelClick = true;
    try { wheelBtn.setPointerCapture(e.pointerId); } catch {}
  });
  wheelBtn?.addEventListener("pointermove", (e) => {
    if (!wheelDrag || !wheelOpen) return;
    const id = slotAtPoint(e.clientX, e.clientY);
    if (id) setWheelHighlight(id);
  });
  wheelBtn?.addEventListener("pointerup", (e) => {
    if (!wheelDrag) return;
    wheelDrag = false;
    const br = wheelBtn.getBoundingClientRect();
    const onBtn = e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom;
    if (onBtn) return;
    const id = slotAtPoint(e.clientX, e.clientY);
    if (id) {
      playActionEmote(id);
      closeEmoteWheel();
    }
  });
  wheelBtn?.addEventListener("pointercancel", () => { wheelDrag = false; });
  wheelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (skipWheelClick) {
      skipWheelClick = false;
      return;
    }
    toggleEmoteWheel();
  });
  $("#emote-wheel-backdrop")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    closeEmoteWheel();
  });
  window.addEventListener("resize", () => { if (wheelOpen) layoutEmoteWheel(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => { if (wheelOpen) layoutEmoteWheel(); });
    window.visualViewport.addEventListener("scroll", () => { if (wheelOpen) layoutEmoteWheel(); });
  }

  $("#emote-eat")?.addEventListener("click", () => socket.emit("emote", { type: "eat" }));
  $("#emote-drink")?.addEventListener("click", () => socket.emit("emote", { type: "drink" }));
  window.__emote = (type) => socket.emit("emote", { type });
  function isChatOpen() {
    return document.body.classList.contains("chat-open");
  }
  function openChatComposer() {
    const composer = document.getElementById("chat-composer");
    const btn = document.getElementById("chat-bubble-btn");
    const input = document.getElementById("chat-input");
    if (composer) {
      composer.classList.remove("hidden");
      composer.classList.add("is-open");
    }
    document.body.classList.add("chat-open");
    btn?.setAttribute("aria-expanded", "true");
    updateChatCount();
    ignorePhoneTaps(300);
    lockPageScroll();
    // Focus must happen synchronously in the user-gesture handler so iOS shows the keyboard.
    input?.focus?.({ preventScroll: true });
    paintOverlays();
    lockPageScroll();
    syncKeyboardInset();
  }
  function closeChatComposer() {
    const composer = document.getElementById("chat-composer");
    const btn = document.getElementById("chat-bubble-btn");
    const input = document.getElementById("chat-input");
    input?.blur?.();
    if (composer) {
      composer.classList.add("hidden");
      composer.classList.remove("is-open");
    }
    document.body.classList.remove("chat-open");
    btn?.setAttribute("aria-expanded", "false");
    emitTyping(false);
    syncKeyboardInset();
  }
  function toggleChatComposer() {
    if (isChatOpen()) closeChatComposer();
    else openChatComposer();
  }
  window.__openChat = openChatComposer;
  window.__closeChatComposer = closeChatComposer;

  function sendChat(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const input = $("#chat-input");
    const text = (input?.value || "").slice(0, CHAT_MAX);
    if (!text.trim()) {
      ignorePhoneTaps(400);
      input?.focus?.({ preventScroll: true });
      return;
    }
    emitTyping(false);
    socket.emit("say", { text });
    input.value = "";
    autosizeChat();
    ignorePhoneTaps(400);
    // Keep the keyboard up so the next message is one tap away.
    input.focus({ preventScroll: true });
    lockPageScroll();
  }
  const chatSend = $("#chat-send");
  function holdChatFocus(e) {
    // Prevent the Say button from blurring the input (which would drop the keyboard).
    e.preventDefault();
  }
  chatSend?.addEventListener("pointerdown", holdChatFocus);
  chatSend?.addEventListener("mousedown", holdChatFocus);
  chatSend?.addEventListener("touchstart", holdChatFocus, { passive: false });
  chatSend?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendChat(e);
  });
  $("#chat-dock")?.addEventListener("click", (e) => {
    if (e.target && (e.target.id === "chat-send" || e.target.closest?.("#chat-send"))) e.stopPropagation();
  });
  $("#chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      sendChat(e);
    }
  });
  $("#chat-input").addEventListener("input", autosizeChat);
  $("#chat-input").addEventListener("focus", () => {
    lockPageScroll();
    setTimeout(() => { lockPageScroll(); syncKeyboardInset(); }, 50);
  });
  $("#chat-input").addEventListener("blur", () => {
    ignorePhoneTaps(400);
    setTimeout(() => {
      syncKeyboardInset();
      if (!isChatOpen()) return;
      const ae = document.activeElement;
      if (ae && (ae.id === "chat-input" || ae.id === "chat-send" || ae.closest?.("#chat-composer"))) return;
      closeChatComposer();
    }, 80);
  });
  $("#chat-bubble-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleChatComposer();
  });
  // Tap outside the composer (on the room) closes chat.
  document.addEventListener("pointerdown", (e) => {
    if (!isChatOpen()) return;
    const t = e.target;
    if (t?.closest?.("#chat-composer") || t?.closest?.("#chat-bubble-btn") || t?.closest?.("#chat-send") || t?.closest?.("#phone-btn") || t?.closest?.("#emote-wheel-btn") || t?.closest?.("#chat-dock")) return;
    closeChatComposer();
  }, true);
  // Swipe down on the composer dismisses it (and the keyboard).
  (function bindComposerSwipe() {
    const el = document.getElementById("chat-composer");
    if (!el) return;
    let y0 = 0, tracking = false;
    el.addEventListener("touchstart", (e) => {
      if (!e.touches?.[0]) return;
      y0 = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      if (!tracking || !e.touches?.[0]) return;
      if (e.touches[0].clientY - y0 > 36) {
        tracking = false;
        closeChatComposer();
      }
    }, { passive: true });
    el.addEventListener("touchend", () => { tracking = false; }, { passive: true });
  })();
  window.addEventListener("scroll", lockPageScroll, { passive: true, capture: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncKeyboardInset);
    window.visualViewport.addEventListener("scroll", syncKeyboardInset);
  }
  window.addEventListener("resize", () => { lockPageScroll(); syncAppShell(); syncKeyboardInset(); });
  window.addEventListener("orientationchange", () => setTimeout(() => { lockPageScroll(); syncAppShell(); syncKeyboardInset(); }, 50));
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false, capture: true });
  });
  syncAppShell();
  syncKeyboardInset();
  window.__setKeyboardInset = (px) => {
    state.testKbInset = px == null ? null : Math.max(0, Number(px) || 0);
    syncKeyboardInset();
    return keyboardHeight();
  };
  window.__syncVisualTop = syncVisualTop;

  function handleTileClick(tx, ty) {
    if (state.pendingPet) {
      updatePetPlaceHighlight(tx, ty);
      return;
    }
    if (state.pendingPlace) {
      if (HouseIso.isWallArt(state.pendingPlace)) return;
      updatePlaceHighlight(tx, ty);
      return;
    }
    if (state.movingId) {
      const f = (state.room?.furniture || []).find((x) => x.id === state.movingId);
      if (!f) { cancelPlace(); return; }
      updatePlaceHighlight(tx, ty);
      return;
    }
    if (pendingWallType()) return;
    if (state.editMode) {
      state.selectedFurnId = null;
      hideFurnActions();
      state.room3d?.highlightFurniture(null);
      return;
    }
    requestWalkTo(tx, ty);
  }

  $("#password-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.pendingJoin) return;
    socket.emit("joinRoom", { roomId: state.pendingJoin, password: $("#join-password").value });
  });
  $("#password-cancel").addEventListener("click", () => {
    HIDE($("#password-modal"));
    state.pendingJoin = null;
  });

  $("#invite-form").addEventListener("submit", (e) => {
    e.preventDefault();
    socket.emit("inviteUser", { username: $("#invite-name").value.trim() });
    showPhoneHome();
  });

  $("#edit-putaway")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasEditSelection()) return;
    putAwaySelected();
  });
  $("#edit-done")?.addEventListener("click", exitEditMode);
  $("#edit-room-btn")?.addEventListener("click", (e) => { e.stopPropagation(); toggleEditMode(); });
  $("#edit-inv-tabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) setEditTab(tab.dataset.tab);
  });
  $("#edit-decor-chips")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-decor]");
    if (!chip) return;
    state.decorSection = chip.dataset.decor;
    paintEditInventory();
    requestAnimationFrame(() => {
      document.querySelector(`[data-testid="decor-section-${state.decorSection}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  });
  $("#item-rotate")?.addEventListener("click", (e) => { e.stopPropagation(); rotatePending(1); });
  $("#edit-inv-toggle")?.addEventListener("click", () => {
    $("#edit-inventory")?.classList.toggle("collapsed");
  });
  $("#rotate-place")?.addEventListener("click", () => rotatePending(1));
  $("#confirm-place")?.addEventListener("click", confirmGhostPlace);
  $("#place-rotate")?.addEventListener("click", () => rotatePending(1));
  $("#place-confirm")?.addEventListener("click", confirmGhostPlace);
  $("#place-cancel")?.addEventListener("click", (e) => { e.stopPropagation(); cancelPlace(); });
  $("#pet-follow")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selectedPet?.item) socket.emit("equipPet", { item: state.selectedPet.item });
    hidePetActions();
  });
  $("#pet-putaway")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selectedPet?.item) socket.emit("putAwayPet", { item: state.selectedPet.item, id: state.selectedPet.id });
    hidePetActions();
  });
  $("#furn-rotate")?.addEventListener("click", () => rotatePending(1));
  $("#furn-move")?.addEventListener("click", () => {
    const art = (state.room?.wallArt || []).find((x) => x.id === state.selectedFurnId);
    if (art) { beginMoveWall(art); return; }
    const f = (state.room?.furniture || []).find((x) => x.id === state.selectedFurnId);
    if (f) beginMoveFurniture(f);
  });
  $("#furn-place")?.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmGhostPlace();
  });
  $("#furn-pickup")?.addEventListener("click", () => {
    if (!state.selectedFurnId) return;
    const art = (state.room?.wallArt || []).find((x) => x.id === state.selectedFurnId);
    if (art) socket.emit("pickupWallArt", { id: state.selectedFurnId });
    else socket.emit("pickupFurniture", { id: state.selectedFurnId });
    hideFurnActions();
    state.selectedFurnId = null;
    state.room3d?.highlightFurniture(null);
  });
  $("#fridge-close")?.addEventListener("click", () => {
    if (state.fridgeId) socket.emit("closeFridge", { id: state.fridgeId });
    hideFridgePicker();
  });
  document.querySelectorAll("[data-fridge]").forEach((b) => {
    b.addEventListener("click", () => {
      if (!state.fridgeId) return;
      socket.emit("fridgeTake", { id: state.fridgeId, item: b.dataset.fridge });
      hideFridgePicker();
    });
  });
  $("#cubics-close")?.addEventListener("click", closeCubics);
  $("#cubics-start")?.addEventListener("click", startCubicsPlay);
  $("#cam-toggle")?.addEventListener("click", () => {
    state.room3d?.toggleCamMode();
    syncCamToggle();
  });
  $("#cam-recenter")?.addEventListener("click", () => {
    state.room3d?.recenterView?.();
    syncCamToggle();
  });
  document.querySelectorAll("[data-cubic]").forEach((b) => {
    b.addEventListener("click", () => cubicsInput(b.dataset.cubic));
  });
  document.addEventListener("keydown", (e) => {
    if (!$("#cubics-panel") || $("#cubics-panel").classList.contains("hidden")) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowLeft") { e.preventDefault(); cubicsInput("left"); }
    if (e.key === "ArrowRight") { e.preventDefault(); cubicsInput("right"); }
    if (e.key === "ArrowDown") { e.preventDefault(); cubicsInput("down"); }
    if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); cubicsInput("drop"); }
  });
  $("#ward-save")?.addEventListener("click", () => {
    socket.emit("updateAvatar", { ...state.draft });
    closeWardrobe();
  });
  $("#ward-cancel")?.addEventListener("click", closeWardrobe);


  /* ---------- socket ---------- */
  socket.on("loggedIn", ({ user, rooms, isNew }) => {
    state.me = user;
    ingestRooms(rooms);
    try {
      sessionStorage.setItem("hearthUser", user.username);
      localStorage.setItem("hearthUser", user.username);
    } catch {}
    state.draft = { ...HearthAvatar.defaults(), ...(user.avatar || {}), displayName: user.avatar?.displayName || user.username };
    if (isNew) {
      toast("Welcome to your cube.");
    }
  });

  socket.on("profile", (user) => {
    const wasCreating = state.view === "creator" && !state.me?.avatar;
    state.me = user;
    updateCoins();
    if (!$("#rewards-sheet")?.classList.contains("hidden") || !$("#spin-modal")?.classList.contains("hidden")) paintRewards();
    const self = state.people.get(user.username);
    if (self) {
      self.heldProp = user.heldProp;
      self.activePet = user.activePet;
      self.avatar = user.avatar;
      self.heldItem = user.heldItem;
      self.boxing = user.boxing;
      self.gym = user.gym;
      self.facing = user.facing;
      self.stationId = user.stationId;
      renderPeople();
    }
    if (state.editMode) paintEditInventory();
    if (state.phoneApp === "pets") paintPets();
    if (state.phoneApp === "edit") paintEditRoom();
    refreshActivityUI();
    if (state.view === "creator") {
      if (state.creatorReturn) {
        returnFromCreator();
      }
      // First-time creation: stay put until joinedRoom lands them in their cube.
    } else if (state.view === "lobby") {
      paintLobby();
    }
    refreshPhoneScreens();
  });

  socket.on("roomsUpdated", (rooms) => {
    ingestRooms(rooms);
    if (state.view === "lobby") paintLobby();
    if (state.view === "room" && state.room) {
      const meta = rooms.find((r) => r.id === state.room.id);
      if (meta) {
        if ("locked" in meta) state.room.locked = meta.locked;
        if (meta.name) {
          state.room.name = meta.name;
          $("#room-title").textContent = "Cube: " + meta.name;
        }
        $("#room-meta").textContent = "Owner: " + state.room.owner;
      }
    }
  });

  socket.on("friendsUpdated", (friends) => {
    if (state.me) state.me.friends = friends;
    if (state.view === "lobby") paintLobby();
  });

  socket.on("joinedRoom", (room) => {
    HIDE($("#password-modal"));
    state.pendingJoin = null;
    mountRoom(room);
  });

  socket.on("leftRoom", () => {
    stopRecordAudio();
    if (isRecordPickerOpen()) closeRecordPicker();
    closePhone();
    state.room = null;
    state.people.clear();
    state.room3d?.clear();
    const layer = document.getElementById("bubble-layer");
    if (layer) layer.innerHTML = "";
    cancelPlace();
    exitEditMode();
    closeChessPanel();
    closeCubics();
    closeWardrobe();
    closeStorePanel();
    hideFridgePicker();
    HIDE($("#activity-chip"));
    setBoxAuto(false);
    paintLobby();
    setView("lobby");
  });

  socket.on("joinResult", (res) => {
    window.__joinResults.push(res);
    if (!res.ok && res.reason === "password_required") {
      state.pendingJoin = res.roomId;
      SHOW($("#password-modal"));
    }
    if (!res.ok && res.reason === "bad_password") {
      SHOW($("#password-modal"));
    }
  });

  socket.on("userJoined", (person) => {
    state.people.set(person.username, personRecord(person));
    renderPeople();
  });

  socket.on("userLeft", ({ username }) => {
    state.people.delete(username);
    renderPeople();
  });

  socket.on("userUpdated", (person) => {
    const cur = state.people.get(person.username);
    if (cur) {
      cur.avatar = person.avatar;
      cur.heldProp = person.heldProp;
      cur.activePet = person.activePet;
      cur.heldItem = person.heldItem;
      cur.boxing = person.boxing;
      cur.gym = person.gym;
      cur.facing = person.facing;
      cur.stationId = person.stationId;
      if (person.sitting != null) cur.sitting = person.sitting;
      if (person.lying != null) cur.lying = person.lying;
      if (person.lyingAt != null) cur.lyingAt = person.lyingAt;
      if (person.usingPhone != null) cur.usingPhone = person.usingPhone;
      renderPeople();
    }
    if (person.username === state.me?.username) refreshActivityUI();
  });

  socket.on("userMoved", ({ username, x, y, sitting, lying, facing, usingPhone }) => {
    const p = state.people.get(username);
    if (!p) return;
    if (facing) p.facing = facing;
    if (usingPhone != null) p.usingPhone = usingPhone;
    else p.usingPhone = false;
    const job = (username === state.me?.username && !sitting) ? pendingArriveDest() : null;
    // Ignore a stale dest from an earlier walk while we are approaching furniture.
    if (job && Math.hypot(job.x - x, job.y - y) > 0.85) {
      setPersonDest(p, job.x, job.y, false);
    } else {
      setPersonDest(p, x, y, sitting, lying);
    }
    if (username === state.me?.username && !sitting) closeChessPanel();
    if (username === state.me?.username) maybeFireArrive(p);
    if (username === state.me?.username) {
      if (sitting) maybeTvChannelToast(true);
      else lastTvToastKey = "";
    }
    renderPeople();
  });

  socket.on("userPhone", ({ username, on }) => {
    const p = state.people.get(username);
    if (!p) return;
    p.usingPhone = Boolean(on);
    renderPeople();
  });

  socket.on("storeBought", (payload) => {
    if (!state.me) return;
    if (payload.coins != null) state.me.coins = payload.coins;
    if (payload.collection) state.me.collection = payload.collection;
    updateCoins();
    if (state.storeKind) paintStorePanel();
    toast(payload.kind === "pets" ? "New pet added to your collection." : "Added to your wardrobe.");
  });

  socket.on("userTyping", ({ username, on, at }) => {
    const p = state.people.get(username);
    if (!p) return;
    p.typing = Boolean(on);
    p.typingAt = p.typing ? (at || Date.now()) : 0;
    paintOverlays();
  });

  socket.on("userSaid", ({ username, text, shout }) => {
    window.__lastSays.push({ username, text, at: Date.now(), roomId: state.room?.id });
    const p = state.people.get(username);
    if (!p) return;
    const until = Date.now() + 5600;
    p.bubble = text;
    p.bubbleUntil = until;
    p.bubbles = (p.bubbles || []).filter((b) => Date.now() < b.until);
    p.bubbles.push({ text, until, id: until + "-" + p.bubbles.length, shout: Boolean(shout) });
    if (p.bubbles.length > 4) p.bubbles.shift();
    p.typing = false;
    p.typingAt = 0;
    const talkMs = Math.min(4000, Math.max(600, String(text || "").length * 60));
    p.talkText = text;
    p.talkAt = Date.now();
    p.talkUntil = p.talkAt + talkMs;
    pushChatFloat(p, text);
    const others = [...state.people.values()].filter((o) => o.username !== p.username);
    if (others.length) {
      let best = others[0], bestD = Infinity;
      for (const o of others) {
        const d = Math.hypot((o.x ?? 0) - (p.x ?? 0), (o.y ?? 0) - (p.y ?? 0));
        if (d < bestD) { best = o; bestD = d; }
      }
      p.facing = { x: (best.x ?? 0) - (p.x ?? 0), z: (best.y ?? 0) - (p.y ?? 0) };
      if (bestD < 5) best.facing = { x: (p.x ?? 0) - (best.x ?? 0), z: (p.y ?? 0) - (best.y ?? 0) };
    }
    renderPeople();
  });

  socket.on("userEmote", ({ username, type, at, action }) => {
    const p = state.people.get(username);
    if (!p) return;
    if (action) {
      p.actionEmote = type || null;
      p.actionEmoteAt = type ? (at || Date.now()) : null;
    } else {
      p.emote = type;
    }
    renderPeople();
  });

  socket.on("roomPets", ({ pets } = {}) => {
    if (!state.room) return;
    state.room.pets = pets || [];
    state.room3d?.setPlacedPets?.(state.room.pets);
    if (state.phoneApp === "pets") paintPets();
    hidePetActions();
  });

  socket.on("furniturePlaced", (piece) => {
    if (state.room) {
      state.room.furniture.push(piece);
      addFurnitureEl(piece);
    }
    const select = state.editMode && state._selectAfterPlace;
    state._selectAfterPlace = false;
    cancelPlace();
    if (select && piece?.id) showFurnActions(piece.id);
    if (state.editMode) paintEditInventory();
    if (state.phoneApp === "edit") paintEditRoom();
  });

  socket.on("furnitureUpdated", (piece) => {
    if (!state.room) return;
    const idx = state.room.furniture.findIndex((f) => f.id === piece.id);
    if (idx >= 0) state.room.furniture[idx] = piece;
    else state.room.furniture.push(piece);
    renderFloorStatic();
    if (state.movingId === piece.id) {
      cancelPlace();
      if (state._deselectAfterCommit) {
        state._deselectAfterCommit = false;
        state.selectedFurnId = null;
        hideFurnActions();
        state.room3d?.highlightFurniture(null);
      } else {
        state.selectedFurnId = piece.id;
        showFurnActions(piece.id);
      }
    } else if (state.selectedFurnId === piece.id) {
      state.room3d?.highlightFurniture(piece.id);
      updateFurnActionPos();
    }
  });

  socket.on("furnitureRemoved", ({ id }) => {
    if (!state.room) return;
    state.room.furniture = (state.room.furniture || []).filter((f) => f.id !== id);
    if (state.room.uses) delete state.room.uses[id];
    if (state.room.chess) delete state.room.chess[id];
    if (state.room.tvs) delete state.room.tvs[id];
    if (state.room.recordPlayers) delete state.room.recordPlayers[id];
    renderFloorStatic();
    state.room3d?.setUses(state.room.uses || {});
    state.room3d?.setChessMap(state.room.chess || {});
    state.room3d?.setTvs(state.room.tvs || {});
    state.room3d?.setRecordPlayers(state.room.recordPlayers || {});
    syncRoomRecordAudio(state.room.recordPlayers || {});
    if (isRecordPickerOpen()) closeRecordPicker();
    if (state.selectedFurnId === id) {
      state.selectedFurnId = null;
      hideFurnActions();
    }
    if (state.chessId === id) closeChessPanel();
    if (state.editMode) paintEditInventory();
  });

  socket.on("lightsUpdated", ({ on }) => {
    if (!state.room) return;
    state.room.lightsOn = on;
    state.room3d?.setLights(on);
  });

  socket.on("tvUpdated", ({ id, tv, serverTime }) => {
    if (!state.room) return;
    state.room.tvs = state.room.tvs || {};
    if (tv) state.room.tvs[id] = tv;
    else delete state.room.tvs[id];
    state.room3d?.setTvs(state.room.tvs);
    if (serverTime) state.room3d?.setServerTime(serverTime);
    maybeTvChannelToast(false);
  });

  socket.on("recordPlayerUpdated", ({ id, player, serverTime }) => {
    if (!state.room) return;
    state.room.recordPlayers = state.room.recordPlayers || {};
    if (player) state.room.recordPlayers[id] = player;
    else delete state.room.recordPlayers[id];
    state.room3d?.setRecordPlayers(state.room.recordPlayers);
    if (serverTime) state.room3d?.setServerTime(serverTime);
    paintRecordPicker(state.room.recordPlayers[id]);
    syncRoomRecordAudio(state.room.recordPlayers);
  });

  socket.on("seatsUpdated", ({ seats }) => {
    if (!state.room) return;
    state.room.seats = seats || {};
  });

  socket.on("wallArtPlaced", (piece) => {
    if (!state.room) return;
    state.room.wallArt = state.room.wallArt || [];
    if (!state.room.wallArt.some((a) => a.id === piece.id)) state.room.wallArt.push(piece);
    state.room3d?.setWallArt(state.room.wallArt);
    const select = state.editMode && state._selectAfterPlace;
    state._selectAfterPlace = false;
    cancelPlace();
    state.movingWallId = null;
    state.room3d?.setWallGhost(null);
    if (select && piece?.id) showFurnActions(piece.id);
    if (state.editMode) paintEditInventory();
  });
  socket.on("wallArtUpdated", (piece) => {
    if (!state.room) return;
    const i = (state.room.wallArt || []).findIndex((a) => a.id === piece.id);
    if (i >= 0) state.room.wallArt[i] = piece;
    else (state.room.wallArt = state.room.wallArt || []).push(piece);
    state.room3d?.setWallArt(state.room.wallArt);
    state.movingWallId = null;
    cancelPlace();
    state.room3d?.setWallGhost(null);
  });
  socket.on("wallArtRemoved", ({ id }) => {
    if (!state.room) return;
    state.room.wallArt = (state.room.wallArt || []).filter((a) => a.id !== id);
    state.room3d?.setWallArt(state.room.wallArt);
    if (state.selectedFurnId === id) {
      state.selectedFurnId = null;
      hideFurnActions();
    }
    if (state.editMode) paintEditInventory();
  });

  socket.on("arcadeUpdated", ({ id, arcade }) => {
    if (!state.room) return;
    state.room.arcade = state.room.arcade || {};
    if (arcade) state.room.arcade[id] = arcade;
    else delete state.room.arcade[id];
    state.room3d?.setArcade(state.room.arcade);
    if (state.cubicsId === id) paintCubicsScores();
  });

  socket.on("wardrobeOpen", ({ id }) => {
    if (id) openWardrobe(id);
  });

  socket.on("useUpdated", ({ id, use }) => {
    if (!state.room) return;
    state.room.uses = state.room.uses || {};
    if (use) state.room.uses[id] = use;
    else delete state.room.uses[id];
    for (const p of state.people.values()) {
      if (use && use.type === "punchbag" && use.user === p.username) {
        p.boxing = { bagId: id, move: use.move || null, combo: use.combo || 0, auto: Boolean(use.auto), lastHitAt: use.lastHitAt || 0 };
      } else if ((!use || use.user !== p.username) && p.boxing && p.boxing.bagId === id) {
        p.boxing = null;
      }
    }
    state.room3d?.setUses(state.room.uses);
    state.room3d?.syncPeople?.([...state.people.values()]);
    const me = state.me?.username;
    if (use && use.type === "fridge" && use.open && use.user === me) showFridgePicker(id);
    if ((!use || !use.open) && state.fridgeId === id) hideFridgePicker();
    refreshActivityUI();
    paintOverlays();
  });

  socket.on("chessUpdated", ({ id, game }) => {
    chessUI.onChessUpdated(id, game);
  });

  socket.on("roomResized", ({ size }) => {
    if (!state.room) return;
    state.room.size = size;
    state.room3d?.setGridSize(size);
    state.room3d?.setFurniture(state.room.furniture || []);
    renderPeople();
    $("#room-meta").textContent = "Owner: " + state.room.owner;
    toast(`Cube upgraded to ${size}×${size}!`);
    refreshPhoneScreens();
  });

  socket.on("roomStyle", (style = {}) => {
    if (!state.room) return;
    Object.assign(state.room, style);
    state.room3d?.setStyle(style.wallpaper, style.floorStyle);
    state.room3d?.setDecor?.(normalizeDecor(state.room));
    state.room3d?.setFurniture(state.room.furniture || []);
    if (state.editMode) paintEditInventory();
    renderPeople();
    refreshPhoneScreens();
  });

  socket.on("bought", ({ name }) => {
    toast(`Bought a ${name}! Place it from your inventory.`);
    refreshPhoneScreens();
    paintShop();
    requestAnimationFrame(() => {
      const chip = document.querySelector("#inventory-row [data-place], #store-panel [data-place]");
      chip?.scrollIntoView({ block: "nearest" });
    });
  });

  socket.on("inviteSent", ({ username, roomName }) => {
    toast(`Invite sent to ${username} for ${roomName}.`);
  });

  socket.on("invited", ({ roomId, roomName, from }) => {
    if (state.me) {
      state.me.invites = state.me.invites || [];
      if (!state.me.invites.some((i) => i.roomId === roomId)) {
        state.me.invites.push({ roomId, roomName, from });
      }
    }
    toast(`${from} invited you to “${roomName}”.`, [
      {
        label: "Join",
        testId: "invite-join",
        onClick: () => tryJoin(roomId),
      },
    ]);
  });

  socket.on("roomLock", ({ locked, hasPassword }) => {
    if (!state.room) return;
    state.room.locked = locked;
    state.room.hasPassword = hasPassword;
    const count = state.room.people?.length || state.room.occupants?.length || "";
    $("#room-meta").textContent = "Owner: " + state.room.owner;
    toast(locked ? "Cube locked." : "Cube unlocked.");
    if (state.phoneApp === "lock") paintLock();
  });

  socket.on("errorMsg", ({ message }) => {
    toast(message);
    if (!state.me || !state.me.username) setView("login");
  });


  socket.on("coinsEarned", ({ amount, reason, coins }) => {
    if (state.me) state.me.coins = coins;
    updateCoins();
    const why = { daily: "daily login", hangout: "hanging out", ad: "watching an ad", store: "coin pack" }[reason] || reason;
    toast(`+${amount} coins · ${why}`, null, "coin-toast");
    if (!$("#rewards-sheet")?.classList.contains("hidden")) paintRewards();
    refreshPhoneScreens();
  });

  socket.on("spinResult", ({ prize }) => {
    const el = $("#spin-result");
    if (el) el.textContent = `You won: ${prize.label}`;
    toast(`You won ${prize.label}!`);
    if (prize.type === "prop" || prize.type === "pet" || prize.type === "clothes") {
      /* collection comes via profile */
    }
  });

  socket.on("spinGranted", () => {
    toast("Extra spin unlocked!");
    paintRewards();
  });

  socket.on("storePurchase", ({ label, coins, price }) => {
    toast(`${label}: +${coins} coins (${price} prototype)`);
  });

  window.__openCoins = openCoinsPanel;
  window.__closeCoins = closeCoinsPanel;
  window.__debugKit = (kit) => socket.emit("debugKit", kit);
  window.__pickupFurniture = (id) => socket.emit("pickupFurniture", { id });
  window.__equipPet = (item) => socket.emit("equipPet", { item: item || null });
  window.__placePet = (item, x, y) => socket.emit("placePet", { item, x, y });
  window.__startPlacePet = startPlacePet;
  window.__updatePetPlace = updatePetPlaceHighlight;
  window.__putAwayPet = (item) => socket.emit("putAwayPet", { item });

  window.__inventory = () => [...(state.me?.inventory || [])];
  window.__clickFurniture = (id, type, extra) => handleFurnitureClick(id, type, extra || {});
  window.__updateAvatar = (raw) => socket.emit("updateAvatar", raw);
  window.__peopleAvatars = () => {
    const out = {};
    for (const [name, person] of state.people) out[name] = person.avatar || null;
    if (state.me) out[state.me.username] = state.me.avatar;
    return out;
  };
  window.__decor = () => normalizeDecor(state.room || {});
  window.__enterEdit = enterEditMode;
  window.__setEditTab = setEditTab;
  window.__putAwaySelected = putAwaySelected;
  window.__clickPet = (pet) => handlePetClick(pet);
  window.__clickWallArt = (id) => {
    const art = (state.room?.wallArt || []).find((a) => a.id === id);
    if (art) handleWallClick(art.wall, art.slot, art);
  };
  window.__moveFurnitureTo = (id, x, y) => {
    const f = (state.room?.furniture || []).find((p) => p.id === id);
    if (!f) return;
    beginMoveFurniture(f);
    updatePlaceHighlight(x, y);
    confirmGhostPlace();
  };
  window.__toast = (message) => toast(message);
  window.__exitEdit = exitEditMode;
  window.__startPlace = startPlace;
  window.__highlightTile = (x, y) => updatePlaceHighlight(x, y);
  window.__rotatePending = () => rotatePending(1);
  window.__confirmPlace = confirmGhostPlace;
  window.__cancelPlace = cancelPlace;
  window.__clickTile = (x, y) => {
    if (state.pendingPlace || state.movingId) {
      const g = state.room3d?.getGhost?.();
      if (!(g && g.tx === x && g.ty === y)) updatePlaceHighlight(x, y);
      confirmGhostPlace();
      return;
    }
    handleTileClick(x, y);
  };
  window.__clickWall = (wall, slot) => {
    if (pendingWallType()) {
      const g = state.room3d?.getWallGhost?.();
      if (!(g && g.wall === wall && g.slot === slot)) updateWallHighlight(wall, slot);
      confirmWallGhost();
      return;
    }
    handleWallClick(wall, slot);
  };
  window.__openPhone = (app) => openPhone(app);
  window.__openPhoneApp = (app) => openPhoneApp(app);
  window.__leaveRoom = () => socket.emit("leaveRoom");
  window.__openStore = (kind, sku) => openStorePanel(kind, sku);
  window.__closeStore = () => closeStorePanel();
  window.__storeState = () => ({ kind: state.storeKind, sel: state.storeSel, slot: state.storeSlot, coins: state.me?.coins, collection: state.me?.collection, me: { inventory: state.me?.inventory || [], coins: state.me?.coins, avatar: state.me?.avatar } });
  window.__buyStoreSel = () => socket.emit("buyStoreItem", { kind: state.storeKind, id: state.storeSel });

  window.__closePhone = () => closePhone();
  window.__say = (text) => socket.emit("say", { text });
  window.__chatBubbles = () => (state.chatFloats || []).map((b) => ({ id: b.id, username: b.username, text: b.text, row: b.row, x: b.x, y: b.targetY }));
  window.__stepChatRows = () => { stepChatRows(); paintOverlays(); return window.__chatBubbles(); };

  window.__openEmoteWheel = openEmoteWheel;
  window.__closeEmoteWheel = closeEmoteWheel;
  window.__playEmote = playActionEmote;
  window.__openCubics = openCubics;
  window.__startCubics = startCubicsPlay;
  window.__cubicsInput = cubicsInput;
  window.__standUp = () => { socket.emit("standUp"); closeChessPanel(); };
  window.__moveFurniture = (id, x, y, rot) => socket.emit("moveFurniture", { id, x, y, rot });
  window.__sit = (id, seat) => socket.emit("sitFurniture", { id, seat });
  window.__gymStop = (id) => socket.emit("gymStop", { id });
  window.__stowItem = () => socket.emit("stowItem");
  window.__openWardrobe = (id) => openWardrobe(id);
  window.__useCoffee = (id) => socket.emit("useCoffee", { id });
  window.__useStove = (id) => socket.emit("useStove", { id });
  window.__selectRecord = (id, vinyl) => socket.emit("selectRecordPlayer", { id, vinyl });
  window.__stopRecord = (id) => socket.emit("selectRecordPlayer", { id, stop: true });
  window.__openRecordPicker = (id) => openRecordPicker(id, state.room?.recordPlayers?.[id]);
  window.__closeRecordPicker = () => closeRecordPicker();
  window.__recordAudioState = () => getRecordAudioState();
  window.__listenToRecord = (id) => {
    const rec = state.room?.recordPlayers?.[id];
    if (rec?.on && rec.vinyl) return playRecordVinyl(rec.vinyl);
    unlockRecordAudio();
    return syncRecordAudio(rec, { userGesture: true });
  };
  window.__playRecordVinyl = (vinyl) => playRecordVinyl(vinyl);
  window.__setRecordVolume = (v) => setRecordVolume(v);
  window.__setRecordMuted = (m) => setRecordMuted(m);
  window.__toggleCam = () => { const m = state.room3d?.toggleCamMode(); syncCamToggle(); return m; };
  window.__setCamMode = (mode) => { const m = state.room3d?.setCamMode(mode); syncCamToggle(); return m; };
  window.__camState = () => state.room3d?.camState?.() || null;
  window.__tapAt = (x, y) => state.room3d?.tapAt?.(x, y);
  window.__chessBoardInfo = (id) => state.room3d?.chessBoardInfo?.(id) || null;

  window.__usePunchbag = (id) => socket.emit("usePunchbag", { id });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  function signOut() {
    try {
      sessionStorage.removeItem("hearthUser");
      localStorage.removeItem("hearthUser");
    } catch {}
    stopRecordAudio();
    if (isRecordPickerOpen()) closeRecordPicker();
    closePhone();
    state.me = null;
    state.room = null;
    state.people.clear();
    state.room3d?.clear?.();
    socket.emit("logout");
    setView("login");
  }
  window.__signOut = signOut;
  $("#sign-out-lobby")?.addEventListener("click", signOut);
  $("#sign-out-phone")?.addEventListener("click", signOut);

  paintLoginPreview();

  window.__openCharacterEditor = () => openCharacterEditor("phone");
  window.__closeCharacterEditor = () => {
    if (isPhoneEditOpen()) closePhoneEditor();
  };
  window.__avatarPose = () => {
    const name = state.me?.username;
    const p = name ? state.people.get(name) : null;
    const r3 = state.room3d;
    return {
      name,
      tile: r3?.personTile?.(name) || (p ? { x: p.x, y: p.y } : null),
      head: r3?.projectHead?.(name) || null,
      box: r3?.personBox?.(name) || null,
      flags: r3?.personFlags?.(name) || null,
      sitting: p?.sitting ?? null,
      stationId: p?.stationId ?? null,
      facing: p?.facing ?? null,
      actionEmote: p?.actionEmote ?? null,
      cam: r3?.camState?.() || null,
      zoom: r3?.visualZoom?.() ?? null,
      view: state.view,
      phoneEdit: isPhoneEditOpen(),
    };
  };

  let remembered = "";
  try { remembered = localStorage.getItem("hearthUser") || sessionStorage.getItem("hearthUser") || ""; } catch {}
  if (remembered) {
    socket.emit("login", { username: remembered });
  } else {
    socket.emit("guestLogin");
  }

  socket.on("loggedOut", () => {
    setView("login");
  });
})();
