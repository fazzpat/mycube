import { createRoom3D, createAvatarPreview } from "./room3d.js";

(() => {
  const socket = io({ transports: ["websocket", "polling"] });
  const $ = (sel) => document.querySelector(sel);
  const SHOW = (el) => el.classList.remove("hidden");
  const HIDE = (el) => el.classList.add("hidden");

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
      bubble: existing.bubble || null,
      bubbleUntil: existing.bubbleUntil || 0,
      bubbles: existing.bubbles || [],
      heldProp: p.heldProp ?? existing.heldProp ?? null,
      activePet: p.activePet ?? existing.activePet ?? null,
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
    state.room3d.onFurnitureClick((id, type) => {
      if (type === "couch" && !state.pendingPlace) socket.emit("sit", { furnitureId: id });
    });
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
    const owner = room.owner === state.me?.username;
    $("#room-meta").textContent = `${room.locked ? "Locked" : "Open"} · ${room.people.length} here · ${room.owner}'s cube · ${room.size || 6}×${room.size || 6}`;
    if (owner) {
      SHOW($("#invite-btn"));
      SHOW($("#shop-btn"));
    } else {
      HIDE($("#invite-btn"));
      HIDE($("#shop-btn"));
    }
    const r3 = ensureRoom3D();
    r3.setGridSize(room.size || 6);
    r3.setStyle(room.wallpaper || "paint-cream", room.floorStyle || "wood");
    r3.setFurniture(room.furniture || []);
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
          if (!p.path.length) p.walking = false;
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

    const owner = state.room && state.room.owner === state.me?.username;
    let styleHtml = "";
    if (owner) {
      const size = state.room.size || 6;
      const next = size === 6 ? 8 : size === 8 ? 10 : null;
      const cost = size === 6 ? 25 : 40;
      const upgrade = next
        ? `<button type="button" class="btn small" data-testid="upgrade-cube" ${ (state.me?.coins ?? 0) < cost ? "disabled" : "" }>Upgrade cube to ${next}×${next} · 🪙 ${cost}</button>`
        : `<div class="item-sub">This cube is maxed at 10×10.</div>`;
      styleHtml = `<h3>Upgrade cube</h3><div class="style-row" style="margin-bottom:12px">${upgrade}</div>
      <div class="item-sub" style="margin-bottom:12px">Now ${size}×${size} tiles</div>
      <h3>Wallpaper</h3><div class="style-row">${HouseIso.WALLPAPERS.map(
        (w) =>
          `<button type="button" class="style-swatch${state.room.wallpaper === w.id ? " selected" : ""}" data-wallpaper="${w.id}" style="background:${w.wall};color:#fff">${w.name}</button>`
      ).join("")}</div>
      <h3>Floor</h3><div class="style-row">${HouseIso.FLOORS.map(
        (f) =>
          `<button type="button" class="style-swatch${state.room.floorStyle === f.id ? " selected" : ""}" data-floor="${f.id}">${f.name}</button>`
      ).join("")}</div>`;
    }

    const grid = $("#shop-grid");
    grid.innerHTML =
      styleHtml +
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
    grid.querySelectorAll("[data-wallpaper]").forEach((b) =>
      b.addEventListener("click", () => socket.emit("setRoomStyle", { wallpaper: b.dataset.wallpaper }))
    );
    grid.querySelectorAll("[data-floor]").forEach((b) =>
      b.addEventListener("click", () => socket.emit("setRoomStyle", { floorStyle: b.dataset.floor }))
    );
    const up = grid.querySelector("[data-testid=upgrade-cube]");
    if (up) up.addEventListener("click", () => socket.emit("upgradeCube"));
  }

  function labelFor(type) {
    return HouseIso.CATALOG[type]?.name || type;
  }

  function startPlace(type) {
    state.pendingPlace = type;
    const banner = $("#place-banner");
    banner.innerHTML = `Tap a tile to place your ${escapeHtml(labelFor(type))} <button class="btn small secondary" id="cancel-place" type="button">Cancel</button>`;
    SHOW(banner);
    $("#floor").classList.add("placing");
    state.room3d?.setPlacing(type);
    HIDE($("#shop-drawer"));
    $("#cancel-place").addEventListener("click", (e) => {
      e.stopPropagation();
      cancelPlace();
    });
  }

  function cancelPlace() {
    state.pendingPlace = null;
    HIDE($("#place-banner"));
    $("#floor").classList.remove("placing");
    state.room3d?.setPlacing(null);
    state.room3d?.setGhost(null);
  }

  function updatePlaceHighlight(tx, ty) {
    if (!state.pendingPlace) {
      state.room3d?.setGhost(null);
      return;
    }
    const ok = HouseIso.canPlace(state.room?.furniture || [], state.pendingPlace, tx, ty, state.room?.size || 6);
    state.room3d?.setGhost(state.pendingPlace, tx, ty, ok);
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
    state.draft = { ...HearthAvatar.defaults(), ...(state.me.avatar || {}) };
    $("#display-name").value = state.draft.displayName || state.me.username;
    paintCreator();
    setView("creator");
  });

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

  $("#leave-room").addEventListener("click", () => socket.emit("leaveRoom"));
  $("#emote-eat").addEventListener("click", () => socket.emit("emote", { type: "eat" }));
  $("#emote-drink").addEventListener("click", () => socket.emit("emote", { type: "drink" }));
  function sendChat() {
    const text = $("#chat-input").value;
    if (!text.trim()) return;
    socket.emit("say", { text });
    $("#chat-input").value = "";
  }
  $("#chat-send").addEventListener("click", sendChat);
  $("#chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  function handleTileClick(tx, ty) {
    if (state.pendingPlace) {
      if (!HouseIso.canPlace(state.room?.furniture || [], state.pendingPlace, tx, ty, state.room?.size || 6)) {
        toast("That doesn't fit on those tiles.");
        return;
      }
      socket.emit("placeFurniture", { type: state.pendingPlace, x: tx, y: ty });
      return;
    }
    const me = state.people.get(state.me?.username);
    const path = HouseIso.pathfind({ x: me?.x ?? tx, y: me?.y ?? ty }, { x: tx, y: ty }, blockedNow(), state.room?.size || 6);
    if (!path) {
      toast("You can't walk there.");
      return;
    }
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

  $("#invite-btn").addEventListener("click", () => {
    $("#invite-name").value = "";
    SHOW($("#invite-modal"));
    $("#invite-name").focus();
  });
  $("#invite-cancel").addEventListener("click", () => HIDE($("#invite-modal")));
  $("#invite-form").addEventListener("submit", (e) => {
    e.preventDefault();
    socket.emit("inviteUser", { username: $("#invite-name").value.trim() });
    HIDE($("#invite-modal"));
  });

  $("#shop-btn").addEventListener("click", () => {
    paintShop();
    SHOW($("#shop-drawer"));
  });
  $("#shop-close").addEventListener("click", () => HIDE($("#shop-drawer")));
  $("#shop-backdrop").addEventListener("click", () => HIDE($("#shop-drawer")));

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
      renderPeople();
    }
    if (state.view === "creator") {
      paintLobby();
      setView("lobby");
    } else if (state.view === "lobby") {
      paintLobby();
    }
    if (document.getElementById("shop-drawer") && !$("#shop-drawer").classList.contains("hidden")) {
      paintShop();
    }
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
    state.room = null;
    state.people.clear();
    state.room3d?.clear();
    const layer = document.getElementById("bubble-layer");
    if (layer) layer.innerHTML = "";
    cancelPlace();
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
      renderPeople();
    }
  });

  socket.on("userMoved", ({ username, x, y, sitting }) => {
    const p = state.people.get(username);
    if (!p) return;
    setPersonDest(p, x, y, sitting);
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

  socket.on("userEmote", ({ username, type }) => {
    const p = state.people.get(username);
    if (!p) return;
    p.emote = type;
    renderPeople();
  });

  socket.on("furniturePlaced", (piece) => {
    if (state.room) {
      state.room.furniture.push(piece);
      addFurnitureEl(piece);
    }
    cancelPlace();
  });

  socket.on("roomResized", ({ size }) => {
    if (!state.room) return;
    state.room.size = size;
    state.room3d?.setGridSize(size);
    state.room3d?.setFurniture(state.room.furniture || []);
    renderPeople();
    $("#room-meta").textContent = `${state.room.locked ? "Locked" : "Open"} · ${state.room.people?.length || state.room.occupants?.length || ""} here · ${state.room.owner}'s cube · ${size}×${size}`;
    toast(`Cube upgraded to ${size}×${size}!`);
    if (!$("#shop-drawer").classList.contains("hidden")) paintShop();
  });

  socket.on("roomStyle", ({ wallpaper, floorStyle }) => {
    if (!state.room) return;
    state.room.wallpaper = wallpaper;
    state.room.floorStyle = floorStyle;
    state.room3d?.setStyle(wallpaper, floorStyle);
    state.room3d?.setFurniture(state.room.furniture || []);
    renderPeople();
    if (!$("#shop-drawer").classList.contains("hidden")) paintShop();
  });

  socket.on("bought", ({ name }) => {
    toast(`Bought a ${name}! Place it from your inventory.`);
    paintShop();
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

  socket.on("errorMsg", ({ message }) => toast(message));

  socket.on("coinsEarned", ({ amount, reason, coins }) => {
    if (state.me) state.me.coins = coins;
    updateCoins();
    const why = { daily: "daily login", hangout: "hanging out", ad: "watching an ad", store: "coin pack" }[reason] || reason;
    toast(`+${amount} coins · ${why}`, null, "coin-toast");
    if (!$("#rewards-sheet")?.classList.contains("hidden")) paintRewards();
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

  paintLoginPreview();
  setView("login");

  const remembered = sessionStorage.getItem("hearthUser");
  if (remembered && !$("#username-input").value) {
    /* don't auto-login during tests; user can type */
  }
})();
