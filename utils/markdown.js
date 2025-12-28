/**
 * Obsidian Markdown Generator
 * Creates PPV-aligned markdown files with proper frontmatter for Pinterest pins
 */

import { generatePinFilename } from './sanitize.js';

/**
 * Generate Obsidian markdown for a Pinterest pin
 * @param {Object} pin - Pin data object
 * @param {string} pin.id - Pinterest pin ID
 * @param {string} pin.title - Pin title/description
 * @param {string} pin.pinUrl - Full Pinterest URL
 * @param {string} pin.thumbnailUrl - Image thumbnail URL
 * @param {string} pin.description - Extended description (if available)
 * @param {string} pin.author - Pin author/pinner username
 * @param {Object} options - Export options
 * @param {string} options.boardName - Name of the Pinterest board
 * @param {string} options.imageExtension - Image file extension (jpg, png, gif, webp)
 * @param {string[]} options.tags - Additional tags to include
 * @param {string[]} options.pillars - PPV pillars (Career, Lifestyle, etc.)
 * @returns {string} - Complete markdown content with frontmatter
 */
export function generatePinMarkdown(pin, options = {}) {
  const {
    boardName = 'Uncategorized',
    imageExtension = 'jpg',
    tags = [],
    pillars = []
  } = options;

  const filename = generatePinFilename(pin.title, pin.id);
  const imageFilename = `${filename}.${imageExtension}`;
  const today = new Date().toISOString().split('T')[0];

  // Build frontmatter
  const frontmatter = {
    type: 'pinterest',
    title: pin.title || 'Untitled Pin',
    source: pin.pinUrl,
    board: `"[[${boardName}]]"`,
    author: pin.author || 'unknown',
    created: today,
    processed: '',
    description: pin.description || pin.title || '',
    tags: ['pinterest', ...tags],
    pillars: pillars,
    image: `"[[${imageFilename}]]"`
  };

  // Generate YAML frontmatter
  const yamlLines = ['---'];
  yamlLines.push(`type: ${frontmatter.type}`);
  yamlLines.push(`title: ${escapeTitleForYaml(frontmatter.title)}`);
  yamlLines.push(`source: ${frontmatter.source}`);
  yamlLines.push(`board: ${frontmatter.board}`);
  yamlLines.push(`author: ${frontmatter.author}`);
  yamlLines.push(`created: ${frontmatter.created}`);
  yamlLines.push(`processed:`);
  yamlLines.push(`description: ${escapeTitleForYaml(frontmatter.description)}`);

  // Tags as YAML array
  yamlLines.push('tags:');
  frontmatter.tags.forEach(tag => yamlLines.push(`  - ${tag}`));

  // Pillars as YAML array
  yamlLines.push('pillars:');
  if (frontmatter.pillars.length > 0) {
    frontmatter.pillars.forEach(pillar => yamlLines.push(`  - ${pillar}`));
  }

  yamlLines.push(`image: ${frontmatter.image}`);
  yamlLines.push('---');

  // Generate body
  const body = `
# ${frontmatter.title}

![[${imageFilename}]]

## Description

${frontmatter.description}

## Source

[View on Pinterest](${pin.pinUrl})
`.trim();

  return yamlLines.join('\n') + '\n\n' + body + '\n';
}

/**
 * Generate a board index markdown file
 * @param {string} boardName - Name of the board
 * @param {Object[]} pins - Array of pins in this board
 * @returns {string} - Board index markdown with Dataview query
 */
export function generateBoardIndexMarkdown(boardName, pins = []) {
  const today = new Date().toISOString().split('T')[0];

  return `---
type: pinterest-board
title: ${escapeTitleForYaml(boardName)}
created: ${today}
pin_count: ${pins.length}
tags:
  - pinterest
  - board
---

# ${boardName}

## Pins

\`\`\`dataview
TABLE title, created, image
FROM "06-Vaults/Media/Pinterest/pins"
WHERE board = [[${boardName}]]
SORT created DESC
\`\`\`

## Statistics

- **Total Pins:** ${pins.length}
- **Exported:** ${today}
`;
}

/**
 * Escape title for safe YAML usage
 * @param {string} title - Raw title string
 * @returns {string} - YAML-safe title
 */
function escapeTitleForYaml(title) {
  if (!title) return '""';
  // Quote if contains special characters
  if (/[:#\[\]{}|>!@`'"]/.test(title) || title.includes('\n')) {
    return `"${title.replace(/"/g, '\\"')}"`;
  }
  return title;
}
