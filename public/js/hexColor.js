/** Valid custom colors are stored as lowercase #rrggbb only. */
export function isCustomHex(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

export function canonHex(value) {
  return isCustomHex(value) ? value.trim().toLowerCase() : null;
}

export function colorOrHex(list, value, fallback) {
  if (Array.isArray(list) && list.includes(value)) return value;
  const hex = canonHex(value);
  if (hex) {
    const hit = Array.isArray(list)
      ? list.find((item) => typeof item === "string" && item.toLowerCase() === hex)
      : null;
    return hit || hex;
  }
  return fallback;
}
