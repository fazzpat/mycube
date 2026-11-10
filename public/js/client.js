import { createRoom3D, createAvatarPreview } from "./room3d.js";
import { Chess } from "/vendor/chess.js";
import { startGame, move as cubicsMove, softDrop, hardDrop, tick as cubicsTick, snapshot as cubicsSnap, drawCubics, jokeAt } from "./cubics.js";

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
  };

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

  function paintLobby() {
    if (!state.me) return;
    $("#lobby-user").textContent = state.me.username;
    updateCoins();

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
    const room = state.rooms.find((r) => r.id === roomId);
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
    if (state.view === "room") state.room3d?.resize();
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
    state.room3d.onTileClick(handleTileClick);
    state.room3d.onTileHover((tx, ty) => updatePlaceHighlight(tx, ty));
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
    (room.people || []).forEach((p) => {
      const rec = personRecord(p);
      rec.x = p.x;
      rec.y = p.y;
      rec.destX = p.x;
      rec.destY = p.y;
      state.people.set(p.username, rec);
    });
    $("#room-title").textContent = room.name;
    $("#room-meta").textContent = `${room.locked ? "Locked" : "Open"} · ${room.people.length} here · ${room.owner}'s cube · ${room.size || 6}×${room.size || 6}`;
    updatePhoneBadge();
    const r3 = ensureRoom3D();
    r3.setGridSize(room.size || 6);
    r3.setStyle(room.wallpaper || "paint-cream", room.floorStyle || "wood");
    r3.setFurniture(room.furniture || []);
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
    setView("room");
    r3.resize();
    renderPeople();
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
      let ny = Math.min(Math.max(pos.y + 14, 28), H - 22);
      nameEl.style.left = nx + "px";
      nameEl.style.top = ny + "px";
      seen.add("n:" + p.username);

      const active = (p.bubbles || []).filter((b) => now < b.until);
      if (!active.length && p.bubble && now < p.bubbleUntil) {
        active.push({ text: p.bubble, until: p.bubbleUntil, id: "live" });
      }
      let stack = layer.querySelector(`[data-testid="bubble-${cssEscape(p.username)}"]`);
      if (active.length) {
        if (!stack) {
          stack = document.createElement("div");
          stack.className = "speech-stack";
          stack.dataset.testid = "bubble-" + p.username;
          layer.appendChild(stack);
        }
        const sig = active.map((b) => b.id + ":" + b.text).join("|");
        if (stack.dataset.sig !== sig) {
          stack.dataset.sig = sig;
          stack.innerHTML = active
            .map((b) => {
              const fading = b.until - now < 900;
              return `<div class="speech-bubble${fading ? " fade" : ""}">${escapeHtml(b.text)}<i class="bubble-tail" aria-hidden="true"></i></div>`;
            })
            .join("");
        } else {
          stack.querySelectorAll(".speech-bubble").forEach((el, i) => {
            if (active[i]) el.classList.toggle("fade", active[i].until - now < 900);
          });
        }
        let bx = pos.x;
        let by = ny - 10;
        stack.style.left = bx + "px";
        stack.style.top = by + "px";
        const w = stack.offsetWidth || 120;
        const hgt = stack.offsetHeight || 40;
        bx = Math.min(Math.max(bx, PAD + w / 2), W - PAD - w / 2);
        by = Math.min(Math.max(by, PAD + hgt), H - PAD);
        stack.style.left = bx + "px";
        stack.style.top = by + "px";
        seen.add("b:" + p.username);
      }

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
        typ.innerHTML = `<div class="speech-bubble typing-bubble">${escapeHtml(p.typingPreview)}<i class="bubble-tail" aria-hidden="true"></i></div>`;
        typ.style.left = Math.min(Math.max(pos.x, 48), W - 48) + "px";
        typ.style.top = (ny - 10) + "px";
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
      const name = el.dataset.testid.replace("bubble-", "");
      if (!seen.has("b:" + name)) el.remove();
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
        const speed = 3.4;
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
          changed = true;
        }
      }
      if (p.bubble && tnow >= p.bubbleUntil) {
        p.bubble = null;
        changed = true;
      } else if (p.bubble && p.bubbleUntil - tnow < 900) {
        changed = true;
      }
    }
    if (changed) renderPeople();
    else if (state.view === "room") paintOverlays();
    updateFurnActionPos();
  }
  raf = requestAnimationFrame(tick);

  /* ---------- shop ---------- */
  function paintShop() {
    const inv = $("#inventory-row");
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
    grid.innerHTML =
      CATALOG.map((item) => {
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
      state.placeRot = ((state.placeRot || 0) + dir + 4) % 4;
      const g = state.room3d?.getGhost?.();
      if (g) updatePlaceHighlight(g.tx, g.ty);
      paintEditInventory();
      return;
    }
    if (state.selectedFurnId && state.editMode) {
      const f = (state.room?.furniture || []).find((x) => x.id === state.selectedFurnId);
      if (!f) return;
      const rot = ((f.rot || 0) + dir + 4) % 4;
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
    socket.emit("move", { x: dest.x, y: dest.y });
  }

  function handleFurnitureClick(id, type, extra = {}) {
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
    if (type === "couch" || type === "chair") {
      approachFurniture(furn, () => socket.emit("sitFurniture", { id, seat: extra.seat }));
      return;
    }
    if (type === "tv") {
      socket.emit("toggleTv", { id });
      return;
    }
    if (type === "chesstable") {
      const game = state.room?.chess?.[id];
      const me = state.me?.username;
      if (game && (game.white === me || game.black === me || (game.seats && (game.seats[0] === me || game.seats[1] === me)))) {
        openChessPanel(id);
        return;
      }
      const seat = extra.seat === 1 ? 1 : (extra.seat === 0 ? 0 : pickFreeChessSeat(game));
      approachFurniture(furn, () => socket.emit("sitFurniture", { id, seat }));
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
      approachFurniture(furn, () => socket.emit("useCoffee", { id }));
    }
  }

  function pickFreeChessSeat(game) {
    if (!game) return 0;
    if (!game.seats?.[0]) return 0;
    if (!game.seats?.[1]) return 1;
    return 0;
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

  const PIECE_UNI = {
    p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚",
    P: "♙", R: "♖", N: "♘", B: "♗", Q: "♕", K: "♔",
  };

  function openChessPanel(id) {
    state.chessId = id;
    SHOW($("#chess-panel"));
    paintChessPanel();
  }
  function closeChessPanel() {
    HIDE($("#chess-panel"));
    state.chessId = null;
    state.chessSel = null;
  }

  function paintChessPanel() {
    const id = state.chessId;
    const game = id && state.room?.chess?.[id];
    if (!game) return;
    const me = state.me?.username;
    const isWhite = game.white === me;
    const isBlack = game.black === me;
    const isPlayer = isWhite || isBlack;
    const myTurn = !game.result && ((game.turn === "w" && isWhite) || (game.turn === "b" && isBlack));
    const status = $("#chess-status");
    if (status) {
      if (game.result) status.textContent = game.result === "checkmate" ? `Checkmate · ${game.winner} wins` : game.result === "resign" ? `${game.winner} wins` : "Draw";
      else if (!game.white || !game.black) status.textContent = "Waiting for an opponent…";
      else status.textContent = `${game.turn === "w" ? "White" : "Black"} to move${game.check ? " · check" : ""}`;
    }
    const cap = $("#chess-captured");
    if (cap) {
      const w = (game.captured?.w || []).map((c) => PIECE_UNI[c.toUpperCase()] || c).join(" ");
      const b = (game.captured?.b || []).map((c) => PIECE_UNI[c] || c).join(" ");
      cap.textContent = (w ? "White took " + w + "  " : "") + (b ? "Black took " + b : "");
    }
    const result = $("#chess-result");
    if (result) {
      if (game.result) {
        result.textContent = game.checkmate || game.result === "checkmate"
          ? `Checkmate! ${game.winner} wins`
          : game.result === "stalemate"
            ? "Stalemate"
            : game.result === "resign"
              ? `${game.winner} wins by resignation`
              : "Draw";
        SHOW(result);
        if (isPlayer) SHOW($("#chess-rematch"));
      } else {
        HIDE(result);
        HIDE($("#chess-rematch"));
      }
    }
    const boardEl = $("#chess-board");
    if (!boardEl) return;
    let engine = null;
    try { engine = new Chess(game.fen); } catch { engine = new Chess(); }
    const flip = isBlack;
    const legal = new Set();
    if (myTurn && state.chessSel) {
      engine.moves({ square: state.chessSel, verbose: true }).forEach((m) => legal.add(m.to));
    }
    const last = game.lastMove || {};
    const files = "abcdefgh";
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    const orderFiles = flip ? files.split("").reverse() : files.split("");
    const orderRanks = flip ? ranks.slice().reverse() : ranks;
    let html = "";
    for (const r of orderRanks) {
      for (const f of orderFiles) {
        const sq = f + r;
        const fileIdx = files.indexOf(f);
        const dark = (fileIdx + r) % 2 === 0;
        const piece = engine.get(sq);
        const ch = piece ? (piece.color === "w" ? piece.type.toUpperCase() : piece.type) : "";
        const cls = [
          "chess-sq",
          dark ? "dark" : "light",
          state.chessSel === sq ? "sel" : "",
          legal.has(sq) ? "legal" : "",
          last.from === sq || last.to === sq ? "last" : "",
        ].filter(Boolean).join(" ");
        html += `<button type="button" class="${cls}" data-square="${sq}" data-testid="chess-sq-${sq}">${ch ? PIECE_UNI[ch] : ""}</button>`;
      }
    }
    boardEl.innerHTML = html;
    boardEl.querySelectorAll("[data-square]").forEach((b) => {
      b.addEventListener("click", () => onChessSquare(b.dataset.square, engine, myTurn, isPlayer, isWhite, isBlack));
    });
  }

  function onChessSquare(sq, engine, myTurn, isPlayer, isWhite, isBlack) {
    if (!isPlayer || !myTurn) {
      // spectators / waiting: still allow select highlight locally? keep read-only
      return;
    }
    const piece = engine.get(sq);
    if (state.chessSel) {
      const moves = engine.moves({ square: state.chessSel, verbose: true }).filter((m) => m.to === sq);
      if (moves.length) {
        socket.emit("chessMove", { id: state.chessId, from: state.chessSel, to: sq });
        state.chessSel = null;
        paintChessPanel();
        return;
      }
    }
    if (piece && ((piece.color === "w" && isWhite) || (piece.color === "b" && isBlack))) {
      state.chessSel = sq;
      paintChessPanel();
    } else {
      state.chessSel = null;
      paintChessPanel();
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
    if (chat) {
      const narrow = (window.visualViewport?.width || window.innerWidth) <= 520;
      const next = narrow ? "Say something…" : "Say something — it vanishes in a few seconds";
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

  const OWNER_APPS = new Set(["edit", "shop", "invite", "lock", "upgrade"]);
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
      body.innerHTML = `<p class="phone-empty">Win a cat, dog, or bunny on the daily spin, then bring them into cubes with you.</p>`;
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

  $("#leave-room").addEventListener("click", () => {
    closePhone();
    socket.emit("leaveRoom");
  });
  $("#phone-btn")?.addEventListener("click", () => {
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
  let swipeStart = null;
  phoneDevice?.addEventListener("touchstart", (e) => {
    swipeStart = e.touches[0].clientY;
  }, { passive: true });
  phoneDevice?.addEventListener("touchend", (e) => {
    if (swipeStart == null) return;
    const dy = e.changedTouches[0].clientY - swipeStart;
    swipeStart = null;
    if (dy > 70) {
      if (state.phoneApp && state.phoneApp !== "home") showPhoneHome();
      else closePhone();
    }
  }, { passive: true });
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
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    wheel.style.left = cx + "px";
    wheel.style.top = cy + "px";
    const n = ACTION_EMOTE_LIST.length;
    const iconR = 32;
    const pad = 10;
    let radius = Math.min(134, Math.max(100, window.innerWidth * 0.3));
    const spaceLeft = cx - pad - iconR;
    const spaceRight = window.innerWidth - cx - pad - iconR;
    const spaceTop = cy - pad - iconR - 8;
    radius = Math.min(radius, Math.max(86, spaceTop));
    let start, end;
    if (spaceLeft < radius && spaceRight >= radius * 0.55) {
      start = Math.PI * 0.92;
      end = -0.12;
    } else if (spaceRight < radius && spaceLeft >= radius * 0.55) {
      start = Math.PI + 0.12;
      end = Math.PI * 0.08;
    } else {
      start = Math.PI;
      end = 0;
    }
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

  $("#emote-eat").addEventListener("click", () => socket.emit("emote", { type: "eat" }));
  $("#emote-drink").addEventListener("click", () => socket.emit("emote", { type: "drink" }));
  function sendChat() {
    const text = $("#chat-input").value;
    if (!text.trim()) return;
    socket.emit("say", { text });
    $("#chat-input").value = "";
    autosizeChat();
  }
  $("#chat-send").addEventListener("click", sendChat);
  $("#chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
  $("#chat-input").addEventListener("input", autosizeChat);
  $("#chat-input").addEventListener("focus", () => setTimeout(syncKeyboardInset, 50));
  $("#chat-input").addEventListener("blur", () => setTimeout(syncKeyboardInset, 50));
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
    const me = state.people.get(state.me?.username);
    if (me?.sitting) {
      socket.emit("standUp");
      me.sitting = false;
    }
    const path = HouseIso.pathfind({ x: me?.x ?? tx, y: me?.y ?? ty }, { x: tx, y: ty }, blockedNow(), state.room?.size || 6);
    if (!path) {
      toast("You can't walk there.");
      return;
    }
    if (phoneOpen()) closePhone();
    socket.emit("move", { x: tx, y: ty });
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
    state.placeRot = f.rot || 0;
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
  $("#chess-close")?.addEventListener("click", closeChessPanel);
  $("#chess-resign")?.addEventListener("click", () => {
    if (state.chessId) socket.emit("chessResign", { id: state.chessId });
  });
  $("#chess-rematch")?.addEventListener("click", () => {
    if (state.chessId) socket.emit("chessRematch", { id: state.chessId });
  });
  $("#chess-stand")?.addEventListener("click", () => {
    socket.emit("standUp");
    closeChessPanel();
  });
  $("#cubics-close")?.addEventListener("click", closeCubics);
  $("#cubics-start")?.addEventListener("click", startCubicsPlay);
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
    state.rooms = rooms;
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
    state.rooms = rooms;
    if (state.view === "lobby") paintLobby();
    if (state.view === "room" && state.room) {
      const meta = rooms.find((r) => r.id === state.room.id);
      if (meta) {
        if ("locked" in meta) state.room.locked = meta.locked;
        $("#room-meta").textContent = `${state.room.locked ? "Locked" : "Open"} · ${meta.occupantCount} here · ${state.room.owner}'s cube · ${state.room.size || 6}×${state.room.size || 6}`;
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
    renderPeople();
  });

  socket.on("userPhone", ({ username, on }) => {
    const p = state.people.get(username);
    if (!p) return;
    p.usingPhone = Boolean(on);
    renderPeople();
  });

  socket.on("userSaid", ({ username, text }) => {
    window.__lastSays.push({ username, text, at: Date.now(), roomId: state.room?.id });
    const p = state.people.get(username);
    if (!p) return;
    const until = Date.now() + 5600;
    p.bubble = text;
    p.bubbleUntil = until;
    p.bubbles = (p.bubbles || []).filter((b) => Date.now() < b.until);
    p.bubbles.push({ text, until, id: until + "-" + p.bubbles.length });
    if (p.bubbles.length > 4) p.bubbles.shift();
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
    state.room3d?.setUses(state.room.uses);
    const me = state.me?.username;
    if (use && use.type === "fridge" && use.open && use.user === me) showFridgePicker(id);
    if ((!use || !use.open) && state.fridgeId === id) hideFridgePicker();
    refreshActivityUI();
    paintOverlays();
  });

  socket.on("chessUpdated", ({ id, game }) => {
    if (!state.room) return;
    state.room.chess = state.room.chess || {};
    if (game) state.room.chess[id] = game;
    else delete state.room.chess[id];
    state.room3d?.setChessMap(state.room.chess);
    const me = state.me?.username;
    const seated = game && (game.white === me || game.black === me || game.seats?.[0] === me || game.seats?.[1] === me);
    if (seated && game.white && game.black) openChessPanel(id);
    else if (state.chessId === id) paintChessPanel();
    // spectators who already opened it stay updated
  });

  socket.on("roomResized", ({ size }) => {
    if (!state.room) return;
    state.room.size = size;
    state.room3d?.setGridSize(size);
    state.room3d?.setFurniture(state.room.furniture || []);
    renderPeople();
    $("#room-meta").textContent = `${state.room.locked ? "Locked" : "Open"} · ${state.room.people?.length || state.room.occupants?.length || ""} here · ${state.room.owner}'s cube · ${size}×${size}`;
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
    $("#room-meta").textContent = `${locked ? "Locked" : "Open"} · ${count} here · ${state.room.owner}'s cube · ${state.room.size || 6}×${state.room.size || 6}`;
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
  window.__closePhone = () => closePhone();
  window.__openEmoteWheel = openEmoteWheel;
  window.__closeEmoteWheel = closeEmoteWheel;
  window.__playEmote = playActionEmote;
  window.__openCubics = openCubics;
  window.__startCubics = startCubicsPlay;
  window.__cubicsInput = cubicsInput;
  window.__standUp = () => socket.emit("standUp");
  window.__moveFurniture = (id, x, y, rot) => socket.emit("moveFurniture", { id, x, y, rot });
  window.__sit = (id, seat) => socket.emit("sitFurniture", { id, seat });
  window.__gymStop = (id) => socket.emit("gymStop", { id });
  window.__stowItem = () => socket.emit("stowItem");
  window.__openWardrobe = (id) => openWardrobe(id);
  window.__useCoffee = (id) => socket.emit("useCoffee", { id });
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
