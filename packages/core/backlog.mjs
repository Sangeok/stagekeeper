/** @type {readonly ["feat", "fix", "refactor", "docs"]} */
export const ITEM_TYPES = ["feat", "fix", "refactor", "docs"];
export const SCOUT_ITEMS_PER_RUN = 3;

/** @param {unknown} value @returns {typeof ITEM_TYPES[number] | null} */
export function toItemType(value) {
  return ITEM_TYPES.find((type) => type === value) ?? null;
}

// Include removed items: a key is an immutable reference and must never be reused.
/** @param {string[]} keys @returns {string} */
export function nextItemKey(keys) {
  let maximum = 0n;
  for (const key of keys) {
    const match = /^ITEM-(\d+)$/.exec(key);
    if (match) {
      const value = BigInt(match[1]);
      if (value > maximum) maximum = value;
    }
  }
  return `ITEM-${String(maximum + 1n).padStart(2, "0")}`;
}
