/**
 * The API returns folders and files in separate lists. The UI treats both as
 * "items" with a `type` field, so lists, menus and dialogs can handle either.
 */

export function toItems(folders = [], files = []) {
  return [
    ...folders.map((f) => ({ ...f, type: "folder" })),
    ...files.map((f) => ({ ...f, type: "file" })),
  ];
}

/** Unique key for React lists (a folder and a file can share the same id). */
export const itemKey = (item) => `${item.type}-${item.id}`;

/** "/files/7" or "/folders/3": the API path of an item. */
export const itemPath = (item) => `/${item.type === "folder" ? "folders" : "files"}/${item.id}`;

/** Sort by name / size / updated, always keeping folders before files. */
export function sortItems(items, { key, dir }) {
  const factor = dir === "asc" ? 1 : -1;
  const value = (item) => {
    if (key === "size") return item.type === "folder" ? -1 : item.size;
    if (key === "updated") return new Date(item.updated_at ?? item.created_at).getTime();
    return item.name.toLowerCase();
  };
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    const va = value(a);
    const vb = value(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * factor;
  });
}

const LEVELS = { view: 1, edit: 2, owner: 3 };
/** Does the permission `have` include `need`? ("edit" includes "view") */
export const can = (have, need) => (LEVELS[have] ?? 0) >= LEVELS[need];
