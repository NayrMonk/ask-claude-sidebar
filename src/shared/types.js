// shared/types.js — JSDoc type definitions (no runtime behavior).
// Central reference for the structured objects passed between layers. Editors and
// tooling pick these up; nothing imports it at runtime in M0.

/**
 * @typedef {('google_slides'|'google_doc'|'google_sheet'|'google_drive'|'pdf'|'webpage')} PageType
 */

/**
 * @typedef {Object} PageContent
 * Result of content-script extraction (M0 shape). Gains summary/outline in M2 when the
 * Context Engine normalizes this into a ContextObject.
 * @property {PageType} type
 * @property {string}   title
 * @property {string}   url
 * @property {string}   text          Full composed text injected into Claude.
 * @property {number}   [wordCount]
 * @property {number}   [currentSlide]
 * @property {number}   [slideCount]
 * @property {number}   [currentPage]
 * @property {number}   [totalPages]
 * @property {string}   [sheet]
 * @property {string}   [fileId]
 */

/**
 * @typedef {Object} ContextObject
 * Normalized context unit — the target schema populated from M2 onward. Stored in memory
 * and composed into the injection block.
 * @property {string}   id
 * @property {PageType} type
 * @property {string}   url
 * @property {string}   title
 * @property {Object}   meta       Type-specific metadata (author, counts, lang, …).
 * @property {string}   summary    Heuristic summary (no model call).
 * @property {string[]} outline    Heading tree / slide titles / sheet headers.
 * @property {string}   excerpt    Relevant excerpt(s).
 * @property {string}   hash       Content hash for dedup against conversation memory.
 * @property {number}   createdAt
 */
