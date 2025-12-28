/**
 * Filename sanitization for Obsidian-compatible filenames
 * Removes special characters and formats for safe filesystem usage
 */

/**
 * Sanitize a title for use as a filename
 * @param {string} title - The original title/text to sanitize
 * @returns {string} - Safe filename string
 */
export function sanitize(title) {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/[*"\/\\<>:|?#\[\]^]/g, '')  // Remove filesystem-unsafe chars
    .replace(/\s+/g, '-')                   // Spaces to hyphens
    .replace(/-+/g, '-')                    // Collapse multiple hyphens
    .replace(/^-|-$/g, '')                  // Trim leading/trailing hyphens
    .substring(0, 100);                     // Limit length
}

/**
 * Generate a unique filename for a pin
 * @param {string} title - Pin title
 * @param {string} pinId - Pinterest pin ID
 * @returns {string} - Unique filename like "scandinavian-kitchen-123456789"
 */
export function generatePinFilename(title, pinId) {
  const sanitizedTitle = sanitize(title);
  return `${sanitizedTitle}-${pinId}`;
}
