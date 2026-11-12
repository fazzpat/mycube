/* Chunky cute 2D chibi avatars with outlines (original SVG). */
(function (global) {
  const SKINS = ["#ffdfc4", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3317"];
  const HAIR_STYLES = ["short", "long", "curly", "bun", "spiky", "bangs", "undercut", "frosted", "buzz", "swoop", "cornrows", "shaggy", "ponytail", "spacebuns", "straightbangs", "afropuff", "bobclips"];
  const HAIR_COLORS = ["#2b1d16", "#6b3a2a", "#d4a017", "#f3e5c2", "#c0392b", "#4a90d9", "#7b4f9c", "#222222"];
  const SHIRTS = ["#ff7a59", "#7bc47f", "#6c7bff", "#f4c15d", "#ef476f", "#20b2aa", "#ff8fab", "#5c4d7d"];
  const TOPS = ["tshirt", "hoodie", "jacket"];
  const BOTTOMS = ["jeans", "joggers"];
  const BOTTOM_COLORS = ["#3d4f7c", "#2a2a2e", "#6b7280", "#c4a35a"];
  const SHOES = ["white", "black", "red", "gum"];
  const ACCESSORIES = ["none", "cap", "beanie", "chain", "headphones"];
  const HEADPHONE_COLORS = ["#2a2a2e", "#ff7a59", "#7c5cff", "#f4c15d", "#ef476f", "#20b2aa", "#f6f3ee", "#3d4f7c"];
  const INK = "#4a2a20";

  function shade(hex, amt) {
    const n = hex.replace("#", "");
    const num = parseInt(n, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function hairSVG(style, color) {
    const dark = shade(color, -30);
    const o = `fill="${color}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"`;
    switch (style) {
      case "long":
        return `
          <ellipse cx="40" cy="34" rx="23" ry="17" ${o}/>
          <path d="M17 36 Q15 80 21 90 Q28 70 29 48" ${o}/>
          <path d="M63 36 Q65 80 59 90 Q52 70 51 48" ${o}/>
          <path d="M20 26 Q40 12 60 26 Q54 20 40 18 Q26 20 20 26" fill="${dark}"/>`;
      case "curly":
        return `
          <circle cx="23" cy="28" r="10" ${o}/>
          <circle cx="33" cy="19" r="10" ${o}/>
          <circle cx="47" cy="18" r="10" ${o}/>
          <circle cx="57" cy="28" r="10" ${o}/>
          <ellipse cx="40" cy="30" rx="21" ry="13" fill="${color}"/>`;
      case "bun":
        return `
          <ellipse cx="40" cy="32" rx="21" ry="15" ${o}/>
          <circle cx="40" cy="13" r="11" ${o}/>
          <circle cx="40" cy="12" r="6" fill="${dark}"/>`;
      case "spiky":
        return `
          <polygon points="18,38 16,12 30,30 33,8 40,27 48,6 51,30 64,10 62,38" ${o}/>
          <ellipse cx="40" cy="34" rx="20" ry="13" fill="${color}"/>`;
      case "bangs":
        return `
          <ellipse cx="40" cy="30" rx="22" ry="16" ${o}/>
          <path d="M19 36 Q22 22 32 28 Q40 16 48 28 Q58 22 61 36 Q50 32 40 34 Q30 32 19 36" fill="${dark}"/>
          <path d="M17 40 Q15 72 23 80 Q26 58 28 44" ${o}/>`;
      default:
        return `
          <ellipse cx="40" cy="30" rx="22" ry="16" ${o}/>
          <path d="M19 34 Q40 18 61 34 Q54 24 40 22 Q26 24 19 34" fill="${dark}"/>`;
    }
  }

  function svg(avatar = {}, opts = {}) {
    const a = {
      skin: avatar.skin || SKINS[1],
      hair: avatar.hair || "short",
      hairColor: avatar.hairColor || HAIR_COLORS[0],
      shirt: avatar.shirt || SHIRTS[0],
      glasses: Boolean(avatar.glasses) || (avatar.glassesStyle && avatar.glassesStyle !== "none"),
      glassesStyle: avatar.glassesStyle || (avatar.accessory === "shades" ? "shades" : (avatar.glasses ? "round" : "none")),
      glassesColor: avatar.glassesColor || "#2a2422",
      hat: avatar.hat || "none",
      hatColor: avatar.hatColor || avatar.headphoneColor || "#2a2a2e",
      necklace: avatar.necklace || (avatar.accessory === "chain" ? "chain" : "none"),
      shoeColor: avatar.shoeColor,
      top: avatar.top || "tshirt",
      bottom: avatar.bottom || "jeans",
      bottomColor: avatar.bottomColor || BOTTOM_COLORS[0],
      shoes: avatar.shoes || "white",
      accessory: avatar.accessory || "none",
      headphoneColor: avatar.headphoneColor || "#2a2a2e",
    };
    const sitting = Boolean(opts.sitting);
    const size = opts.size || 96;
    const flip = Boolean(opts.flip);
    const shirtDark = shade(a.shirt, -35);
    const skinDark = shade(a.skin, -28);

    const legs = sitting
      ? `<ellipse cx="40" cy="98" rx="18" ry="7" fill="${shirtDark}" stroke="${INK}" stroke-width="2.4"/>`
      : `<rect x="27" y="88" width="10" height="16" rx="5" fill="${skinDark}" stroke="${INK}" stroke-width="2.2"/>
         <rect x="43" y="88" width="10" height="16" rx="5" fill="${skinDark}" stroke="${INK}" stroke-width="2.2"/>
         <ellipse cx="32" cy="104" rx="7" ry="3.4" fill="#2a1810" opacity=".28"/>
         <ellipse cx="48" cy="104" rx="7" ry="3.4" fill="#2a1810" opacity=".28"/>`;

    const bodyY = sitting ? 8 : 0;
    const glasses = a.glasses
      ? `<circle cx="32" cy="44" r="7" fill="none" stroke="${INK}" stroke-width="2.4"/>
         <circle cx="48" cy="44" r="7" fill="none" stroke="${INK}" stroke-width="2.4"/>
         <path d="M39 44 H41" stroke="${INK}" stroke-width="2.4"/>`
      : "";

    return `<svg class="avatar-svg" viewBox="0 0 80 112" width="${size}" height="${Math.round(size * 1.4)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="${flip ? "transform:scaleX(-1)" : ""}">
      <ellipse cx="40" cy="106" rx="20" ry="5" fill="#2a1810" opacity=".2"/>
      <g transform="translate(0 ${bodyY})">
        <rect x="20" y="62" width="40" height="32" rx="16" fill="${a.shirt}" stroke="${INK}" stroke-width="2.8"/>
        <path d="M22 74 Q40 88 58 74" fill="none" stroke="${shirtDark}" stroke-width="3" opacity=".35"/>
        <circle cx="19" cy="74" r="7" fill="${a.skin}" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="61" cy="74" r="7" fill="${a.skin}" stroke="${INK}" stroke-width="2.4"/>
        ${legs}
        <circle cx="40" cy="40" r="23" fill="${a.skin}" stroke="${INK}" stroke-width="2.8"/>
        ${hairSVG(a.hair, a.hairColor)}
        <ellipse cx="32" cy="44" rx="3.4" ry="4.1" fill="${INK}"/>
        <ellipse cx="48" cy="44" rx="3.4" ry="4.1" fill="${INK}"/>
        <circle cx="33.3" cy="42.8" r="1.2" fill="#fff"/>
        <circle cx="49.3" cy="42.8" r="1.2" fill="#fff"/>
        <ellipse cx="27" cy="51" rx="4" ry="2.3" fill="#ff8fab" opacity=".7"/>
        <ellipse cx="53" cy="51" rx="4" ry="2.3" fill="#ff8fab" opacity=".7"/>
        <path d="M34 55 Q40 61 46 55" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        ${glasses}
      </g>
    </svg>`;
  }

  function defaults() {
    return {
      displayName: "",
      skin: SKINS[1],
      hair: "short",
      hairColor: HAIR_COLORS[0],
      shirt: SHIRTS[0],
      glasses: false,
      glassesStyle: "none",
      glassesColor: "#2a2422",
      top: "tshirt",
      bottom: "jeans",
      bottomColor: BOTTOM_COLORS[0],
      shoes: "white",
      shoeColor: undefined,
      accessory: "none",
      hat: "none",
      hatColor: "#2a2a2e",
      necklace: "none",
      headphoneColor: "#2a2a2e",
    };
  }

  global.HearthAvatar = {
    svg, defaults, SKINS, HAIR_STYLES, HAIR_COLORS, SHIRTS,
    TOPS, BOTTOMS, BOTTOM_COLORS, SHOES, ACCESSORIES, HEADPHONE_COLORS,
  };
})(window);
