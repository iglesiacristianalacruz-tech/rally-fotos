(function initCore(root) {
  function normalizeTeamName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/^equipo\s*(\d+)$/i, "Equipo $1");
  }

  function photoKey(teamName, itemId) {
    return `${normalizeTeamName(teamName).toLowerCase()}::${itemId}`;
  }

  function sortItems(items) {
    return [...items].sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  function completion(items, photos, pendingPhotos) {
    const itemIds = new Set(items.map((item) => item.id));
    const done = new Set();
    photos.forEach((photo) => {
      if (itemIds.has(photo.item_id)) done.add(photo.item_id);
    });
    pendingPhotos.forEach((photo) => {
      if (itemIds.has(photo.itemId)) done.add(photo.itemId);
    });
    return { done: done.size, total: items.length };
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  }

  const core = { normalizeTeamName, photoKey, sortItems, completion, formatDate };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = core;
  } else {
    root.AppCore = core;
  }
})(typeof window !== "undefined" ? window : globalThis);
