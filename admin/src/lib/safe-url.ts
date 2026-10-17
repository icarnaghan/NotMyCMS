/**
 * URL sanitizer for markdown rendering.
 *
 * react-markdown v10 dropped its built-in URL sanitizer, so a link/image URL
 * like "javascript:..." would render as a live href/src. In the admin origin,
 * which holds auth tokens, that is an XSS vector when authoring pasted or
 * restored content. Pass this as react-markdown's `urlTransform` to allow only
 * safe schemes (and relative/anchor URLs) and reject everything else.
 */
export function safeUrlTransform(url: string): string {
  // Strip whitespace and control chars before checking, so tricks like
  // "java\tscript:" or "  javascript:" cannot slip past. A leading "scheme:"
  // (per RFC 3986) then marks an absolute URL.
  // eslint-disable-next-line no-control-regex
  const value = url.replace(/[\u0000-\u0020]+/g, "");
  const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) {
    // No scheme: relative, root-relative, anchor, or query URL — safe.
    return url;
  }
  const scheme = schemeMatch[1].toLowerCase();
  return ["http", "https", "mailto", "tel"].includes(scheme) ? url : "";
}
