/**
 * Shared search helpers.
 */

/**
 * Case-insensitive contains check for a list of candidate strings.
 * @param {string} query
 * @param {Array<string|undefined|null>} fields
 * @returns {boolean}
 */
export const matchesQuery = (query, fields) => {
  const normalized = (query || '').trim().toLowerCase();
  if (!normalized) return true;
  return fields.some((field) => String(field || '').toLowerCase().includes(normalized));
};
