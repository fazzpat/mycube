import { createRoom3D, createAvatarPreview } from "./isoRoom.js";
import { CLOTHING_STOCK, PET_STOCK, PUBLIC_PLACES } from "./storeCatalog.js";
import { startGame, move as cubicsMove, softDrop, hardDrop, tick as cubicsTick, snapshot as cubicsSnap, drawCubics, jokeAt } from "./cubics.js";
import { initChessUI } from "./chess-ui.js";

(() => {
  const socket = io({ transports: ["websocket", "polling"] });
  const $ = (sel) => document.querySelector(sel);
  const SHOW = (el) => el && el.classList.remove("hidden");
  const HIDE = (el) => el && el.classList.add("hidden");

  window.__lastSays = [];
  window.__joinResults = [];

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

  function setView(name) {
    state.view = name;
    document.body.dataset.view = name;
    ["login", "creator", "lobby", "room"].forEach((v) => {
      const el = document.getElementById("view-" + v);
      if (v === name) SHOW(el);
      else HIDE(el);
    });
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
    setTimeout(() => el.remove(), actions ? 14000 : 4200);
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
    const samples = [
      { skin: "#f1c27d", hair: "bun", hairColor: "#6b3a2a", shirt: "#ff7a59" },
      { skin: "#c68642", hair: "curly", hairColor: "#2b1d16", shirt: "#6c7bff" },
      { skin: "#ffdfc4", hair: "spiky", hairColor: "#d4a017", shirt: "#7bc47f" },
    ];
    row.innerHTML = samples.map((a) => HearthAvatar.svg(a, { size: 78 })).join("");
  }

  /* ---------- creator ---------- */
  function paintCreator() {
    const box = $("#creator-preview");
    if (!state.preview3d) {
      box.innerHTML = "";
      state.preview3d = createAvatarPreview(box);
    }
    state.preview3d.setAvatar(state.draft);
    $("#creator-user").textContent = state.me?.username || "";
    if (!$("#display-name").value) {
      $("#display-name").value = state.draft.displayName || state.me?.username || "";
    }

    const swatch = (list, key, el, asColor) => {
      el.innerHTML = "";
      list.forEach((val, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = asColor ? "swatch" : "choice";
        if (asColor) b.style.background = val;
        else b.textContent = val;
        b.dataset.testid = `${key}-${i}`;
        if (state.draft[key] === val) b.classList.add("selected");
        b.addEventListener("click", () => {
          state.draft[key] = val;
          paintCreator();
        });
        el.appendChild(b);
      });
    };
    swatch(HearthAvatar.SKINS, "skin", $("#skin-choices"), true);
    swatch(HearthAvatar.HAIR_STYLES, "hair", $("#hair-choices"), false);
    swatch(HearthAvatar.HAIR_COLORS, "hairColor", $("#hair-color-choices"), true);
    swatch(HearthAvatar.SHIRTS, "shirt", $("#shirt-choices"), true);
    swatch(HearthAvatar.TOPS, "top", $("#top-choices"), false);
    swatch(HearthAvatar.BOTTOMS, "bottom", $("#bottom-choices"), false);
    swatch(HearthAvatar.BOTTOM_COLORS, "bottomColor", $("#bottom-color-choices"), true);
    swatch(HearthAvatar.SHOES, "shoes", $("#shoes-choices"), false);
    swatch(HearthAvatar.ACCESSORIES, "accessory", $("#accessory-choices"), false);
    if (HearthAvatar.HEADPHONE_COLORS && $("#headphone-color-choices")) {
      swatch(HearthAvatar.HEADPHONE_COLORS, "headphoneColor", $("#headphone-color-choices"), true);
    }
    const hpField = $("#headphone-color-field");
    if (hpField) hpField.classList.toggle("hidden", state.draft.accessory !== "headphones");
    $("#glasses-toggle").checked = state.draft.glasses;
  }

  /* ---------- lobby ---------- */
  function updateCoins() {
    const n = state.me?.coins ?? 50;
    const lobby = $("#lobby-coins");
    const room = $("#room-coins");
    if (lobby) lobby.textContent = n;
    if (room) room.textContent = n;
    updatePhoneBadge();
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
      walking: false,
      emote: p.emote ?? existing.emote ?? null,
      actionEmote: p.actionEmote ?? existing.actionEmote ?? null,
      actionEmoteAt: p.actionEmoteAt ?? existing.actionEmoteAt ?? null,
      usingPhone: p.usingPhone ?? existing.usingPhone ?? false,
      bubble: existing.bubble || null,
      bubbleUntil: existing.bubbleUntil || 0,
      bubbles: existing.bubbles || [],
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

  function setPersonDest(p, x, y, sitting) {
    p.destX = x;
    p.destY = y;
    p.sitting = sitting;
    if (sitting) {
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
    state.room3d.onTileHover((tx, ty) => updatePlaceHighlight(tx, ty));
    state.room3d.setFurnInteractive?.((type) => {
      if (state.editMode || state.pendingPlace || state.movingId) return true;
      if (state.room?.shop && isShopProp(type)) return true;
      return isUseableFurn(type);
    });
    state.room3d.onFurnitureClick(handleFurnitureClick);
    state.room3d.onSwitchClick(() => {
      const on = !(state.room?.lightsOn !== false);
      socket.emit("setLights", { on });
    });
    state.room3d.onWallHover((wall, slot) => updateWallHighlight(wall, slot));
    state.room3d.onWallClick((wall, slot) => handleWallClick(wall, slot));
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
    const r3 = ensureRoom3D();
    r3.setGridSize(room.size || 6);
    r3.setStyle(room.wallpaper || "paint-cream", room.floorStyle || "wood");
    r3.setFurniture(room.furniture || []);
    r3.setNpcs?.(room.npcs || []);
    r3.setLights(room.lightsOn !== false);
    r3.setUses(room.uses || {});
    r3.setChessMap(room.chess || {});
    r3.setTvs(room.tvs || {});
    r3.setWallArt(room.wallArt || []);
    r3.setArcade(room.arcade || {});
    r3.setServerTime(room.serverTime || Date.now());
    state.room.lightsOn = room.lightsOn !== false;
    state.room.uses = room.uses || {};
    state.room.chess = room.chess || {};
    state.room.tvs = room.tvs || {};
    state.room.wallArt = room.wallArt || [];
    state.room.seats = room.seats || {};
    state.room.arcade = room.arcade || {};
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

  const CHAT_ROW_H = 24;
  function layoutChatRows(baseY) {
    const list = state.chatFloats || [];
    if (!list.length) return;
    const base = baseY;
    for (let i = 0; i < list.length; i++) {
      const row = list.length - 1 - i;
      list[i].row = row;
      list[i].targetY = base - row * CHAT_ROW_H;
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
    const newest = state.chatFloats[state.chatFloats.length - 1];
    layoutChatRows(newest.targetY - CHAT_ROW_H);
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

      if (p.typingPreview && p.username === state.me?.username && !active.length) {
        let typ = layer.querySelector(`[data-testid="typing-${cssEscape(p.username)}"]`);
        if (!typ) {
          typ = document.createElement("div");
          typ.className = "speech-stack";
          typ.dataset.testid = "typing-" + p.username;
          layer.appendChild(typ);
        }
        typ.innerHTML = bubbleMarkup(p, p.typingPreview, false).replace('speech-bubble', 'speech-bubble typing-bubble');
        typ.style.left = Math.min(Math.max(pos.x, 48), W - 48) + "px";
        typ.style.top = Math.max(PAD + 36, Math.round(H * 0.1) + 8) + "px";
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
    // Habbo/MyCoke rows: newest just above head height; each new line
    // and each quiet tick pushes every older bubble up exactly one row.
    const CHAT_ROW_H = 24;
    const CHAT_ROW_MS = 4500;
    const CHAT_FADE_TOP = 16;
    if (!state.chatFloats) state.chatFloats = [];
    if (state.chatFloats.length && state.chatQuietAt && now - state.chatQuietAt >= CHAT_ROW_MS) {
      stepChatRows();
    }
    const usedIds = new Set();
    const latestOf = new Map();
    for (const b of state.chatFloats) latestOf.set(b.username, b);
    const remain = [];
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
    layer.querySelectorAll("[data-testid^='typing-']").forEach((el) => {
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
            if (p.username === state.me?.username && state.pendingArrive) {
              const job = state.pendingArrive;
              if (Math.hypot((job.x - p.x), (job.y - p.y)) < 0.85) {
                state.pendingArrive = null;
                setTimeout(() => job.fn(), 30);
              }
            }
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
  }
  raf = requestAnimationFrame(tick);

  /* ---------- shop ---------- */
  function paintShop() {
    if (!state.shopTab) state.shopTab = "furniture";
    document.querySelectorAll("#phone-shop-tabs [data-shop-tab]").forEach((b) => {
      b.classList.toggle("on", b.dataset.shopTab === state.shopTab);
      b.setAttribute("aria-selected", b.dataset.shopTab === state.shopTab ? "true" : "false");
    });
    const furnPane = $("#shop-furniture-pane");
    const catPane = $("#shop-catalog-pane");
    if (state.shopTab === "clothes" || state.shopTab === "pets" || state.shopTab === "art") {
      if (furnPane) furnPane.classList.add("hidden");
      if (catPane) catPane.classList.remove("hidden");
      paintPhoneShopCatalog();
      return;
    }
    if (furnPane) furnPane.classList.remove("hidden");
    if (catPane) catPane.classList.add("hidden");
    const inv = $("#inventory-row");
    if (!inv) return;
    const items = state.me?.inventory || [];
    inv.innerHTML = items.length
      ? items
          .map(
            (t, i) =>
              `<button class="inv-chip" data-testid="inv-${t}-${i}" data-place="${t}" type="button">${labelFor(t)} — place</button>`
          )
          .join("")
      : `<span class="empty">Nothing in your pocket yet.</span>`;
    inv.querySelectorAll("[data-place]").forEach((b) =>
      b.addEventListener("click", () => startPlace(b.dataset.place))
    );

    const grid = $("#shop-grid");
    if (!grid) return;
    const furnList = CATALOG.filter((item) => item.surface !== "wall");
    grid.innerHTML =
      furnList.map((item) => {
        const afford = (state.me?.coins ?? 0) >= item.price;
        return `<div class="shop-item">
        ${furnitureSVG(item.type)}
        <strong>${item.name}</strong>
        <div class="item-sub">🪙 ${item.price} · ${item.w}×${item.h} tiles</div>
        <button class="btn small" data-testid="buy-${item.type}" data-buy="${item.type}" ${afford ? "" : "disabled"} type="button">Buy</button>
      </div>`;
      }).join("");
    grid.querySelectorAll("[data-buy]").forEach((b) =>
      b.addEventListener("click", () => socket.emit("buyFurniture", { type: b.dataset.buy }))
    );
  }

  function paintPhoneShopCatalog() {
    const kind = state.shopTab;
    const list = storeStock(kind);
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
        const thumb = (kind === "clothes" || kind === "pets")
          ? `<canvas class="store-thumb" width="28" height="28" data-thumb-id="${id}"></canvas>`
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
        if (stock && typeof window.__paintStoreThumb === "function") {
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
    state.placeRot = state.placeRot || 0;
    const banner = $("#place-banner");
    banner.innerHTML = `Tap a tile to place your ${escapeHtml(labelFor(type))} <button class="btn small secondary" id="cancel-place" type="button">Cancel</button>`;
    SHOW(banner);
    $("#floor").classList.add("placing");
    state.room3d?.setPlacing(type);
    closePhone();
    if (state.editMode) paintEditInventory();
    $("#cancel-place").addEventListener("click", (e) => {
      e.stopPropagation();
      cancelPlace();
    });
    seedPlaceGhost();
    showPlaceActions();
  }

  function cancelPlace() {
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


  function showPlaceActions() {
    const bar = $("#place-actions");
    if (!bar) return;
    if (state.pendingPlace || state.movingId || state.movingWallId) SHOW(bar);
    else HIDE(bar);
    const conf = $("#place-confirm");
    if (conf) {
      const g = state.room3d?.getGhost?.();
      const wg = state.room3d?.getWallGhost?.();
      const ok = (g && g.ok) || (wg && wg.ok);
      conf.disabled = !ok;
      conf.classList.toggle("hidden", false);
    }
  }
  function hidePlaceActions() {
    HIDE($("#place-actions"));
  }
  function seedPlaceGhost() {
    const type = currentPlaceType() || pendingWallType();
    if (!type) return;
    if (HouseIso.isWallArt(type)) return;
    const size = state.room?.size || 6;
    const me = state.people.get(state.me?.username);
    const ignore = state.movingId || undefined;
    const spots = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (HouseIso.canPlace(state.room?.furniture || [], type, x, y, size, state.placeRot || 0, ignore)) {
          const d = Math.hypot(x - (me?.x ?? size / 2), y - (me?.y ?? size / 2));
          spots.push({ x, y, d });
        }
      }
    }
    spots.sort((a, b) => a.d - b.d);
    if (spots[0]) updatePlaceHighlight(spots[0].x, spots[0].y);
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

  function handleWallClick(wall, slot) {
    const type = pendingWallType();
    if (!type) return;
    const ignore = state.movingWallId;
    const ok = HouseIso.canPlaceWall(type, wall, slot, state.room?.size || 6)
      && !HouseIso.wallOccupied(state.room?.wallArt || [], wall, slot, ignore);
    const g = state.room3d?.getWallGhost?.();
    if (ok && g && g.wall === wall && g.slot === slot && g.ok) {
      confirmWallGhost();
      return;
    }
    updateWallHighlight(wall, slot);
    if (!ok) toast("That wall space is taken or blocked.");
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
    state.draft = { ...HearthAvatar.defaults(), ...(state.me?.avatar || {}) };
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
    const swatch = (list, key, label, asColor) => {
      const row = document.createElement("div");
      row.innerHTML = `<h4>${label}</h4>`;
      const wrap = document.createElement("div");
      wrap.className = "swatch-row";
      list.forEach((val, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = asColor ? "swatch" : "choice";
        if (asColor) b.style.background = val;
        else b.textContent = val;
        b.dataset.testid = `ward-${key}-${i}`;
        if (state.draft[key] === val) b.classList.add("selected");
        b.addEventListener("click", () => { state.draft[key] = val; paintWardrobe(); });
        wrap.appendChild(b);
      });
      row.appendChild(wrap);
      return row;
    };
    root.innerHTML = "";
    root.appendChild(swatch(HearthAvatar.SKINS, "skin", "Skin", true));
    root.appendChild(swatch(HearthAvatar.HAIR_STYLES, "hair", "Hair", false));
    root.appendChild(swatch(HearthAvatar.HAIR_COLORS, "hairColor", "Hair color", true));
    root.appendChild(swatch(HearthAvatar.SHIRTS, "shirt", "Shirt", true));
    root.appendChild(swatch(HearthAvatar.TOPS, "top", "Top", false));
    root.appendChild(swatch(HearthAvatar.BOTTOMS, "bottom", "Bottoms", false));
    root.appendChild(swatch(HearthAvatar.BOTTOM_COLORS, "bottomColor", "Bottom color", true));
    root.appendChild(swatch(HearthAvatar.SHOES, "shoes", "Shoes", false));
    root.appendChild(swatch(HearthAvatar.ACCESSORIES, "accessory", "Accessory", false));
  }

  function enterEditMode() {
    if (!isOwner()) {
      toast("Only the cube owner can decorate.");
      return;
    }
    state.editMode = true;
    document.body.classList.add("edit-mode");
    SHOW($("#edit-inventory"));
    $("#edit-inventory")?.classList.remove("collapsed");
    paintEditInventory();
    state.room3d?.setPlacing("edit");
    closePhone();
  }

  function exitEditMode() {
    state.editMode = false;
    document.body.classList.remove("edit-mode");
    HIDE($("#edit-inventory"));
    hideFurnActions();
    cancelPlace();
    state.selectedFurnId = null;
    state.movingId = null;
    state.room3d?.highlightFurniture(null);
    state.room3d?.setPlacing(null);
  }

  function paintEditInventory() {
    const box = $("#edit-inv-items");
    if (!box) return;
    const counts = {};
    for (const t of state.me?.inventory || []) counts[t] = (counts[t] || 0) + 1;
    const types = Object.keys(counts);
    box.innerHTML = types.length
      ? types
          .map((typ) => {
            const sel = state.pendingPlace === typ && !state.movingId ? " selected" : "";
            return `<button type="button" class="edit-inv-item${sel}" data-testid="edit-item-${typ}" data-place="${typ}">
              ${furnitureSVG(typ)}
              <span>${escapeHtml(labelFor(typ))}</span>
              <span class="count" data-testid="edit-count-${typ}">${counts[typ]}</span>
            </button>`;
          })
          .join("")
      : `<span class="empty">Pocket's empty. Pick something up or buy from the shop.</span>`;
    box.querySelectorAll("[data-place]").forEach((b) => {
      b.addEventListener("click", () => {
        state.movingId = null;
        state.selectedFurnId = null;
        hideFurnActions();
        startPlace(b.dataset.place);
      });
    });
    const styles = $("#edit-styles");
    if (styles) {
      styles.innerHTML = `
        <h4>Wallpaper</h4>
        <div class="style-row">${HouseIso.WALLPAPERS.map(
          (w) =>
            `<button type="button" class="style-swatch${state.room?.wallpaper === w.id ? " selected" : ""}" data-wallpaper="${w.id}" style="background:${w.wall};color:#fff">${w.name}</button>`
        ).join("")}</div>
        <h4>Floor</h4>
        <div class="style-row">${HouseIso.FLOORS.map(
          (f) =>
            `<button type="button" class="style-swatch${state.room?.floorStyle === f.id ? " selected" : ""}" data-floor="${f.id}">${f.name}</button>`
        ).join("")}</div>`;
      styles.querySelectorAll("[data-wallpaper]").forEach((b) =>
        b.addEventListener("click", () => socket.emit("setRoomStyle", { wallpaper: b.dataset.wallpaper }))
      );
      styles.querySelectorAll("[data-floor]").forEach((b) =>
        b.addEventListener("click", () => socket.emit("setRoomStyle", { floorStyle: b.dataset.floor }))
      );
    }
    const tools = $("#edit-place-tools");
    if (tools) {
      if (state.pendingPlace || state.movingId) SHOW(tools);
      else HIDE(tools);
    }
  }

  function currentPlaceType() {
    if (state.pendingPlace) return state.pendingPlace;
    if (state.movingId) {
      const f = (state.room?.furniture || []).find((x) => x.id === state.movingId);
      return f?.type || null;
    }
    return null;
  }

  function rotatePending(dir = 1) {
    if (state.pendingPlace || state.movingId) {
      state.placeRot = HouseIso.normalizeRot((state.placeRot || 0) + dir);
      const g = state.room3d?.getGhost?.();
      if (g) updatePlaceHighlight(g.tx, g.ty);
      paintEditInventory();
      return;
    }
    if (state.selectedFurnId && state.editMode) {
      const f = (state.room?.furniture || []).find((x) => x.id === state.selectedFurnId);
      if (!f) return;
      const rot = HouseIso.normalizeRot((f.rot || 0) + dir);
      socket.emit("moveFurniture", { id: f.id, x: f.x, y: f.y, rot });
    }
  }

  function confirmGhostPlace() {
    if (pendingWallType()) {
      confirmWallGhost();
      return;
    }
    const g = state.room3d?.getGhost?.();
    if (!g || !g.ok) return;
    handleTileClick(g.tx, g.ty);
  }

  function hideFurnActions() {
    HIDE($("#furn-actions"));
  }

  function showFurnActions(id) {
    state.selectedFurnId = id;
    state.room3d?.highlightFurniture(id);
    SHOW($("#furn-actions"));
    updateFurnActionPos();
  }

  function updateFurnActionPos() {
    const bar = $("#furn-actions");
    if (!bar || bar.classList.contains("hidden") || !state.selectedFurnId) return;
    const pos = state.room3d?.projectFurniture(state.selectedFurnId);
    if (!pos || !pos.visible) return;
    bar.style.left = pos.x + "px";
    bar.style.top = pos.y + "px";
  }

  function inBoundsTile(x, y, size) {
    return x >= 0 && y >= 0 && x < size && y < size;
  }

  function isUseableFurn(type) {
    return [
      "couch", "chair", "hoverchair", "capsulecouch",
      "tv", "holotv", "chesstable", "fridge", "punchbag", "heavybag",
      "benchpress", "treadmill", "cubics", "clothescab", "coffeemachine",
    ].includes(type);
  }

  function requestWalkTo(tx, ty) {
    const me = state.people.get(state.me?.username);
    if (me?.sitting) {
      socket.emit("standUp");
      me.sitting = false;
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
    socket.emit("move", { x: dest.x, y: dest.y });
  }

  function isShopProp(type) {
    return ["shopkeeper", "rack", "mannequin", "petpen", "cage", "counter"].includes(type);
  }


  function setVoice() {
    state.voice = "speak";
    const send = $("#chat-send");
    if (send) send.textContent = "Say";
  }

  function closeStorePanel() {
    HIDE($("#store-panel"));
    if (state.storePreview) {
      state.storePreview.dispose?.();
      state.storePreview = null;
    }
    state.storeKind = null;
    state.storeSel = null;
    const prev = $("#store-preview");
    if (prev) prev.innerHTML = "";
  }

  function storeStock(kind) {
    if (kind === "pets") return PET_STOCK;
    if (kind === "clothes") return CLOTHING_STOCK;
    if (kind === "art") return CATALOG.filter((item) => item.surface === "wall");
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

  function paintStorePreview() {
    const el = $("#store-preview");
    if (!el) return;
    const stock = storeStock(state.storeKind).find((s) => (s.id || s.type) === state.storeSel);
    if (state.storeKind === "pets") {
      if (state.storePreview) { state.storePreview.dispose?.(); state.storePreview = null; }
      el.innerHTML = `<canvas width="96" height="90" data-testid="pet-preview-canvas" style="image-rendering:pixelated;width:96px;height:90px"></canvas><div style="padding:6px;text-align:center;font-weight:700">${stock ? escapeHtml(stock.label) : ""}</div>`;
      const c = el.querySelector("canvas");
      if (c && stock && typeof window.__paintPetThumb === "function") {
        c.width = 96; c.height = 88;
        window.__paintPetThumb(c, stock.item);
      }
      return;
    }
    if (state.storeKind === "furniture" || state.storeKind === "art") {
      if (state.storePreview) { state.storePreview.dispose?.(); state.storePreview = null; }
      el.innerHTML = `<div style="padding:12px;text-align:center;font-weight:700">${stock ? escapeHtml(stock.name || stock.label || stock.type) : ""}</div>`;
      return;
    }
    if (!state.storePreview) {
      el.innerHTML = "";
      state.storePreview = createAvatarPreview(el);
    }
    const base = { ...(state.me?.avatar || {}) };
    if (stock?.item) Object.assign(base, stock.item);
    state.storePreview.setAvatar(base);
    state.storePreview.resize?.();
  }

  function paintStoreTabs() {
    document.querySelectorAll("[data-store-tab]").forEach((b) => {
      b.classList.toggle("on", b.dataset.storeTab === state.storeKind);
      b.setAttribute("aria-selected", b.dataset.storeTab === state.storeKind ? "true" : "false");
    });
  }

  function paintStorePanel() {
    const kind = state.storeKind || "clothes";
    const title = $("#store-panel-title");
    if (title) title.textContent = "Shop";
    paintStoreTabs();
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
        const thumb = (kind === "clothes" || kind === "pets")
          ? `<canvas class="store-thumb" width="28" height="28" data-thumb-id="${id}"></canvas>`
          : (typeof furnitureSVG === "function" ? furnitureSVG(s.type || id) : "");
        return `<button type="button" class="store-item${sel}" data-testid="store-item-${id}" data-store-id="${id}">${thumb}<span class="meta">${escapeHtml(label)}${owned ? " · owned" : ""}</span><span class="price">${owned ? "✓" : s.price + "c"}</span></button>`;
      })
      .join("");
    grid.querySelectorAll("[data-store-id]").forEach((b) => {
      b.addEventListener("click", () => {
        state.storeSel = b.dataset.storeId;
        paintStorePanel();
        paintStorePreview();
      });
    });
    grid.querySelectorAll("canvas.store-thumb").forEach((c) => {
      const stock = stockList.find((s) => (s.id || s.type) === c.dataset.thumbId);
      if (!stock) return;
      if (typeof window.__paintStoreThumb === "function") {
        window.__paintStoreThumb(c, kind, stock.item || stock, state.me?.avatar || {});
      }
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
  }

  function openStorePanel(kind, sku) {
    const k = kind === "pets" ? "pets" : kind === "art" ? "art" : kind === "furniture" ? "furniture" : "clothes";
    state.storeKind = k;
    const stock = storeStock(k);
    const idOf = (s) => s.id || s.type;
    state.storeSel = sku && stock.some((s) => idOf(s) === sku) ? sku : idOf(stock[0] || {});
    SHOW($("#store-panel"));
    paintStorePanel();
    paintStorePreview();
  }

  $("#store-close")?.addEventListener("click", closeStorePanel);
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

  function handleFurnitureClick(id, type, extra = {}) {
    if (state.room?.shop && (isShopProp(type) || extra?.avatar)) {
      openStorePanel(state.room.shop);
      return;
    }
    if (extra?.wallArt || HouseIso.isWallArt(type)) {
      if (!state.editMode) return;
      if (state.pendingPlace) return;
      state.selectedFurnId = id;
      state.room3d?.highlightFurniture(id);
      SHOW($("#furn-actions"));
      updateFurnActionPos();
      return;
    }
    if (state.editMode || state.pendingPlace || state.movingId) {
      if (!state.editMode) return;
      if (state.pendingPlace) return;
      const f = (state.room?.furniture || []).find((x) => x.id === id);
      if (!f) return;
      showFurnActions(id);
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
    // Decorative / unused furniture: walk to the nearest adjacent tile.
    const tiles = HouseIso.tilesFor(furn.type, furn.x, furn.y, furn.rot);
    const me = state.people.get(state.me?.username);
    const dest = nearestWalkable({ x: me?.x ?? furn.x, y: me?.y ?? furn.y }, furn.x, furn.y, blockedNow(), state.room?.size || 6, tiles);
    if (dest) {
      if (me?.sitting) {
        socket.emit("standUp");
        me.sitting = false;
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
      chip.innerHTML = `<span class="item-sub">Holding ${me.heldItem.kind}</span><button class="btn small secondary" data-testid="stow-item" id="stow-item">Done</button>`;
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

  function syncAppShell() {
    const vv = window.visualViewport;
    const visible = Math.max(1, Math.round((vv && vv.height) || window.innerHeight));
    const offsetTop = Math.max(0, Math.round((vv && vv.offsetTop) || 0));
    const root = document.documentElement;
    root.style.setProperty("--app-h", visible + "px");
    root.style.setProperty("--app-top", offsetTop + "px");
    // The shell already tracks the visual viewport, so don't double-apply a keyboard inset.
    root.style.setProperty("--kb-inset", "0px");
    document.querySelector(".room-view")?.style.setProperty("--kb-inset", "0px");
    const dock = document.getElementById("chat-dock");
    if (dock && state.view === "room") {
      const h = Math.round(dock.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty("--dock-h", h + "px");
    }
    const chat = document.getElementById("chat-input");
    root.style.setProperty("--layout-h", window.innerHeight + "px");
    if (chat) {
      const next = "Say something...";
      if (chat.placeholder !== next) chat.placeholder = next;
    }
    if (state.view === "room") state.room3d?.resize();
  }
  function syncKeyboardInset() {
    syncAppShell();
  }

  function autosizeChat() {
    const el = $("#chat-input");
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(96, Math.max(44, el.scrollHeight)) + "px";
    const me = state.people.get(state.me?.username);
    if (me) {
      const val = el.value.trim();
      me.typingPreview = val || null;
      paintOverlays();
    }
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
    const on = spinAvailable();
    document.querySelectorAll("[data-testid=phone-badge], [data-testid=spin-app-badge]").forEach((el) => {
      el.classList.toggle("hidden", !on);
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

  function setPhoneExpanded(on) {
    $("#phone-overlay")?.classList.toggle("app-open", Boolean(on));
  }
  function showPhoneHome() {
    document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
    SHOW($("#phone-home"));
    state.phoneApp = "home";
    setPhoneExpanded(false);
  }

  function closePhone() {
    const wasOpen = phoneOpen();
    HIDE($("#phone-overlay"));
    document.body.classList.remove("phone-open");
    setPhoneExpanded(false);
    $("#phone-btn")?.setAttribute("aria-expanded", "false");
    state.phoneApp = null;
    if (wasOpen) socket.emit("usePhone", { on: false });
  }

  const OWNER_APPS = new Set(["edit", "invite", "lock", "upgrade"]);
  const APP_TITLES = {
    edit: "Edit Room",
    shop: "Shop",
    invite: "Invite",
    lock: "Lock",
    upgrade: "Upgrade",
  };

  function openPhone(app) {
    const wasOpen = phoneOpen();
    tickPhoneTime();
    updatePhoneBadge();
    SHOW($("#phone-overlay"));
    document.body.classList.add("phone-open");
    $("#phone-btn")?.setAttribute("aria-expanded", "true");
    if (!wasOpen) socket.emit("usePhone", { on: true });
    if (app) openPhoneApp(app);
    else showPhoneHome();
  }

  function openPhoneApp(app) {
    if (!phoneOpen()) {
      tickPhoneTime();
      updatePhoneBadge();
      SHOW($("#phone-overlay"));
      document.body.classList.add("phone-open");
      $("#phone-btn")?.setAttribute("aria-expanded", "true");
      socket.emit("usePhone", { on: true });
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
    if (app === "clothes-store") {
      state.shopTab = "clothes";
      app = "shop";
    }
    if (app === "pets-store") {
      state.shopTab = "pets";
      app = "shop";
    }
    if (app === "wardrobe") {
      closePhone();
      state.creatorReturn = "room";
      state.draft = { ...HearthAvatar.defaults(), ...(state.me.avatar || {}) };
      $("#display-name").value = state.draft.displayName || state.me.username;
      paintCreator();
      SHOW($("#creator-back"));
      setView("creator");
      return;
    }
    if (app === "emotes") {
      closePhone();
      openEmoteWheel();
      return;
    }
    if (app === "spin") {
      closePhone();
      paintRewards();
      SHOW($("#spin-modal"));
      return;
    }
    HIDE($("#phone-home"));
    document.querySelectorAll(".phone-app-screen").forEach((el) => HIDE(el));
    const screen = document.getElementById("phone-screen-" + app);
    if (!screen) return;
    SHOW(screen);
    state.phoneApp = app;
    setPhoneExpanded(true);
    if (app === "edit") {
      closePhone();
      enterEditMode();
      return;
    }
    if (app === "edit-legacy") paintEditRoom();
    if (app === "shop") paintShop();
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
    const body = $("#phone-edit-body");
    if (!body || !state.room) return;
    const items = state.me?.inventory || [];
    const inv = items.length
      ? items
          .map((t, i) => `<button class="inv-chip" data-testid="inv-${t}-${i}" data-place="${t}" type="button">${labelFor(t)} — place</button>`)
          .join("")
      : `<span class="phone-empty">Buy furniture in Shop, then place it here.</span>`;
    const size = state.room.size || 6;
    body.innerHTML = `
      <h3>Your furniture</h3>
      <div class="inv-row">${inv}</div>
      <h3>Wallpaper</h3>
      <div class="style-row">${HouseIso.WALLPAPERS.map(
        (w) =>
          `<button type="button" class="style-swatch${state.room.wallpaper === w.id ? " selected" : ""}" data-wallpaper="${w.id}" style="background:${w.wall};color:#fff">${w.name}</button>`
      ).join("")}</div>
      <h3>Floor</h3>
      <div class="style-row">${HouseIso.FLOORS.map(
        (f) =>
          `<button type="button" class="style-swatch${state.room.floorStyle === f.id ? " selected" : ""}" data-floor="${f.id}">${f.name}</button>`
      ).join("")}</div>
      <p class="item-sub">This cube is ${size}×${size} tiles.</p>`;
    body.querySelectorAll("[data-place]").forEach((b) =>
      b.addEventListener("click", () => startPlace(b.dataset.place))
    );
    body.querySelectorAll("[data-wallpaper]").forEach((b) =>
      b.addEventListener("click", () => socket.emit("setRoomStyle", { wallpaper: b.dataset.wallpaper }))
    );
    body.querySelectorAll("[data-floor]").forEach((b) =>
      b.addEventListener("click", () => socket.emit("setRoomStyle", { floorStyle: b.dataset.floor }))
    );
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

  function paintPets() {
    const body = $("#phone-pets-body");
    if (!body) return;
    const pets = state.me?.collection?.pets || [];
    if (!pets.length) {
      body.innerHTML = `<p class="phone-empty">Open Shop and the Pets tab to adopt a pal, then bring them into cubes with you.</p>`;
      return;
    }
    body.innerHTML =
      `<p class="lede">Pets follow you into other cubes.</p>` +
      pets
        .map((c) => {
          const on = state.me?.activePet === c.item;
          return `<button type="button" class="inv-chip" data-pet="${c.item}">${on ? "Send home" : "Bring"} ${escapeHtml(c.label)}</button>`;
        })
        .join(" ");
    body.querySelectorAll("[data-pet]").forEach((b) => {
      b.addEventListener("click", () => {
        const item = b.dataset.pet;
        socket.emit("equipPet", { item: state.me?.activePet === item ? null : item });
      });
    });
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

  function paintPhoneCoins() {
    const body = $("#phone-coins-body");
    if (!body || !state.me) return;
    const r = state.me.rewards || {};
    const packs = r.packs || {};
    const adsLeft = r.adsLeft ?? 3;
    const packHtml = Object.entries(packs)
      .map(
        ([id, pack]) => `
      <button type="button" class="pack-card" data-pack="${id}">
        <strong>${pack.label || id}</strong>
        <span>+${pack.coins} coins</span>
        <span class="pack-price">${pack.price}</span>
      </button>`
      )
      .join("");
    body.innerHTML = `
      <p class="lede">You have 🪙 ${state.me.coins ?? 0}. Watch an ad or grab a coin pack.</p>
      <button class="btn small" type="button" id="phone-watch-ad" ${adsLeft <= 0 ? "disabled" : ""}>${
      adsLeft > 0 ? `Watch ad · +15 coins (${adsLeft} left today)` : "Ad cap reached today"
    }</button>
      <h3 style="margin-top:16px">Coin store</h3>
      <p class="item-sub">Prototype checkout — real purchases would use Apple In-App Purchase.</p>
      <div class="pack-row">${packHtml}</div>
    `;
    $("#phone-watch-ad")?.addEventListener("click", () => playAd("coins"));
    body.querySelectorAll("[data-pack]").forEach((b) => {
      b.addEventListener("click", () => {
        state.pendingPack = b.dataset.pack;
        const pack = packs[b.dataset.pack];
        $("#buy-confirm-copy").textContent = `Get ${pack.coins} coins for ${pack.price}? This is a fake purchase for the prototype.`;
        SHOW($("#buy-confirm"));
      });
    });
  }

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
    if (!phoneOpen()) return;
    if (state.phoneApp === "edit") paintEditRoom();
    if (state.phoneApp === "shop") paintShop();
    if (state.phoneApp === "lock") paintLock();
    if (state.phoneApp === "pets") paintPets();
    if (state.phoneApp === "props") paintProps();
    if (state.phoneApp === "coins") paintPhoneCoins();
    if (state.phoneApp === "upgrade") paintUpgrade();
  }

  function returnFromCreator() {
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
  });
  $("#glasses-toggle").addEventListener("change", () => {
    state.draft.glasses = $("#glasses-toggle").checked;
    paintCreator();
  });
  $("#save-avatar").addEventListener("click", () => {
    state.draft.displayName = $("#display-name").value.trim() || state.me.username;
    socket.emit("updateAvatar", state.draft);
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
  function ignorePhoneTaps(ms = 400) {
    phoneTapIgnoreUntil = Date.now() + ms;
  }
  function phoneTapIgnored(e) {
    if (Date.now() >= phoneTapIgnoreUntil) return false;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    return true;
  }
  $("#phone-btn")?.addEventListener("pointerdown", (e) => { if (phoneTapIgnored(e)) return; }, true);
  $("#phone-btn")?.addEventListener("touchend", (e) => { if (phoneTapIgnored(e)) return; }, true);
  $("#phone-btn")?.addEventListener("click", (e) => {
    if (phoneTapIgnored(e)) return;
    if (phoneOpen()) closePhone();
    else openPhone();
  });
  $("#phone-overlay")?.querySelector(".phone-backdrop")?.addEventListener("click", closePhone);
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
  $("#room-coins-btn")?.addEventListener("click", () => openPhone("coins"));
  document.addEventListener("keydown", (e) => {
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
  function sendChat(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const text = $("#chat-input").value;
    if (!text.trim()) {
      ignorePhoneTaps(400);
      return;
    }
    socket.emit("say", { text });
    $("#chat-input").value = "";
    autosizeChat();
    ignorePhoneTaps(400);
  }
  $("#chat-send")?.addEventListener("click", (e) => {
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
  $("#chat-input").addEventListener("focus", () => setTimeout(syncKeyboardInset, 50));
  $("#chat-input").addEventListener("blur", () => {
    ignorePhoneTaps(400);
    setTimeout(syncKeyboardInset, 50);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncKeyboardInset);
    window.visualViewport.addEventListener("scroll", syncKeyboardInset);
  }
  window.addEventListener("resize", syncKeyboardInset);
  window.addEventListener("orientationchange", () => setTimeout(syncKeyboardInset, 50));
  syncKeyboardInset();

  function handleTileClick(tx, ty) {
    if (state.pendingPlace) {
      if (HouseIso.isWallArt(state.pendingPlace)) return;
      const ok = HouseIso.canPlace(state.room?.furniture || [], state.pendingPlace, tx, ty, state.room?.size || 6, state.placeRot);
      const g = state.room3d?.getGhost?.();
      if (ok && g && g.tx === tx && g.ty === ty && g.ok) {
        socket.emit("placeFurniture", { type: state.pendingPlace, x: tx, y: ty, rot: state.placeRot });
        return;
      }
      updatePlaceHighlight(tx, ty);
      if (!ok) toast("That doesn't fit on those tiles.");
      return;
    }
    if (state.movingId) {
      const f = (state.room?.furniture || []).find((x) => x.id === state.movingId);
      if (!f) { cancelPlace(); return; }
      const ok = HouseIso.canPlace(state.room?.furniture || [], f.type, tx, ty, state.room?.size || 6, state.placeRot, f.id);
      const g = state.room3d?.getGhost?.();
      if (ok && g && g.tx === tx && g.ty === ty && g.ok) {
        socket.emit("moveFurniture", { id: f.id, x: tx, y: ty, rot: state.placeRot });
        return;
      }
      updatePlaceHighlight(tx, ty);
      if (!ok) toast("That doesn't fit on those tiles.");
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

  $("#edit-done")?.addEventListener("click", exitEditMode);
  $("#edit-inv-toggle")?.addEventListener("click", () => {
    $("#edit-inventory")?.classList.toggle("collapsed");
  });
  $("#rotate-place")?.addEventListener("click", () => rotatePending(1));
  $("#confirm-place")?.addEventListener("click", confirmGhostPlace);
  $("#place-rotate")?.addEventListener("click", () => rotatePending(1));
  $("#place-confirm")?.addEventListener("click", confirmGhostPlace);
  $("#place-cancel")?.addEventListener("click", (e) => { e.stopPropagation(); cancelPlace(); });
  $("#furn-rotate")?.addEventListener("click", () => rotatePending(1));
  $("#furn-move")?.addEventListener("click", () => {
    const art = (state.room?.wallArt || []).find((x) => x.id === state.selectedFurnId);
    if (art) {
      hideFurnActions();
      state.movingWallId = art.id;
      state.pendingPlace = null;
      updateWallHighlight(art.wall, art.slot);
      SHOW($("#place-banner"));
      $("#place-banner").innerHTML = `Move your ${escapeHtml(labelFor(art.type))} <button class="btn small secondary" id="cancel-place" type="button">Cancel</button>`;
      $("#cancel-place")?.addEventListener("click", (e) => { e.stopPropagation(); cancelPlace(); state.movingWallId = null; state.room3d?.setWallGhost(null); });
      return;
    }
    const f = (state.room?.furniture || []).find((x) => x.id === state.selectedFurnId);
    if (!f) return;
    hideFurnActions();
    state.movingId = f.id;
    state.pendingPlace = null;
    state.placeRot = HouseIso.normalizeRot(f.rot);
    state.room3d?.setPlacing(f.type);
    SHOW($("#place-banner"));
    $("#place-banner").innerHTML = `Move your ${escapeHtml(labelFor(f.type))} <button class="btn small secondary" id="cancel-place" type="button">Cancel</button>`;
    $("#cancel-place")?.addEventListener("click", (e) => { e.stopPropagation(); cancelPlace(); });
    updatePlaceHighlight(f.x, f.y);
    paintEditInventory();
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
  socket.on("loggedIn", ({ user, rooms }) => {
    state.me = user;
    ingestRooms(rooms);
    sessionStorage.setItem("hearthUser", user.username);
    if (!user.avatar) {
      state.draft = { ...HearthAvatar.defaults(), displayName: user.username };
      $("#display-name").value = user.username;
      paintCreator();
      setView("creator");
    } else {
      state.draft = { ...user.avatar };
      paintLobby();
      setView("lobby");
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
    refreshActivityUI();
    if (state.view === "creator") {
      returnFromCreator();
    } else if (state.view === "lobby") {
      paintLobby();
    }
    refreshPhoneScreens();
    if (wasCreating) {
      /* stay in lobby */
    }
  });

  socket.on("roomsUpdated", (rooms) => {
    ingestRooms(rooms);
    if (state.view === "lobby") paintLobby();
    if (state.view === "room" && state.room) {
      const meta = rooms.find((r) => r.id === state.room.id);
      if (meta) {
        if ("locked" in meta) state.room.locked = meta.locked;
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
      if (person.usingPhone != null) cur.usingPhone = person.usingPhone;
      renderPeople();
    }
    if (person.username === state.me?.username) refreshActivityUI();
  });

  socket.on("userMoved", ({ username, x, y, sitting, facing, usingPhone }) => {
    const p = state.people.get(username);
    if (!p) return;
    if (facing) p.facing = facing;
    if (usingPhone != null) p.usingPhone = usingPhone;
    else p.usingPhone = false;
    setPersonDest(p, x, y, sitting);
    if (username === state.me?.username && !sitting) closeChessPanel();
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

  socket.on("furniturePlaced", (piece) => {
    if (state.room) {
      state.room.furniture.push(piece);
      addFurnitureEl(piece);
    }
    cancelPlace();
    if (state.editMode) paintEditInventory();
  });

  socket.on("furnitureUpdated", (piece) => {
    if (!state.room) return;
    const idx = state.room.furniture.findIndex((f) => f.id === piece.id);
    if (idx >= 0) state.room.furniture[idx] = piece;
    else state.room.furniture.push(piece);
    renderFloorStatic();
    if (state.movingId === piece.id) {
      cancelPlace();
      state.selectedFurnId = piece.id;
      showFurnActions(piece.id);
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
    renderFloorStatic();
    state.room3d?.setUses(state.room.uses || {});
    state.room3d?.setChessMap(state.room.chess || {});
    state.room3d?.setTvs(state.room.tvs || {});
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
    cancelPlace();
    state.movingWallId = null;
    state.room3d?.setWallGhost(null);
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

  socket.on("roomStyle", ({ wallpaper, floorStyle }) => {
    if (!state.room) return;
    state.room.wallpaper = wallpaper;
    state.room.floorStyle = floorStyle;
    state.room3d?.setStyle(wallpaper, floorStyle);
    state.room3d?.setFurniture(state.room.furniture || []);
    renderPeople();
    refreshPhoneScreens();
  });

  socket.on("bought", ({ name }) => {
    toast(`Bought a ${name}! Place it from your inventory.`);
    refreshPhoneScreens();
    if (state.phoneApp === "shop" || !phoneOpen()) paintShop();
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

  socket.on("errorMsg", ({ message }) => toast(message));

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

  window.__debugKit = (kit) => socket.emit("debugKit", kit);
  window.__clickFurniture = (id, type, extra) => handleFurnitureClick(id, type, extra || {});
  window.__enterEdit = enterEditMode;
  window.__exitEdit = exitEditMode;
  window.__startPlace = startPlace;
  window.__highlightTile = (x, y) => updatePlaceHighlight(x, y);
  window.__rotatePending = () => rotatePending(1);
  window.__confirmPlace = confirmGhostPlace;
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
  window.__openPhone = () => openPhone();
  window.__leaveRoom = () => socket.emit("leaveRoom");
  window.__openStore = (kind, sku) => openStorePanel(kind, sku);
  window.__closeStore = () => closeStorePanel();
  window.__storeState = () => ({ kind: state.storeKind, sel: state.storeSel, coins: state.me?.coins, collection: state.me?.collection });
  window.__buyStoreSel = () => socket.emit("buyStoreItem", { kind: state.storeKind, id: state.storeSel });

  window.__closePhone = () => closePhone();
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
  window.__toggleCam = () => { const m = state.room3d?.toggleCamMode(); syncCamToggle(); return m; };
  window.__setCamMode = (mode) => { const m = state.room3d?.setCamMode(mode); syncCamToggle(); return m; };
  window.__camState = () => state.room3d?.camState?.() || null;
  window.__tapAt = (x, y) => state.room3d?.tapAt?.(x, y);
  window.__chessBoardInfo = (id) => state.room3d?.chessBoardInfo?.(id) || null;

  window.__usePunchbag = (id) => socket.emit("usePunchbag", { id });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  paintLoginPreview();
  setView("login");

  const remembered = sessionStorage.getItem("hearthUser");
  if (remembered && !$("#username-input").value) {
    /* don't auto-login during tests; user can type */
  }
})();
