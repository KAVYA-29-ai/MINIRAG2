/**
 * Shared media helpers for dashboard pages.
 */

/**
 * Return avatar asset path from avatar key.
 * @param {string} avatar
 * @returns {string}
 */
export const avatarSource = (avatar) => (avatar === 'female' ? '/images/female.png' : '/images/male.png');

/**
 * Build an image error handler that swaps to a fallback source.
 * @param {string} fallbackSrc
 * @returns {(event: Event) => void}
 */
export const imageFallbackHandler = (fallbackSrc) => (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = fallbackSrc;
};
