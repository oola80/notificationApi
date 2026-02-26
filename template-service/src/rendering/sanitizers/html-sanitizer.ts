/**
 * Sanitizes HTML content for email output.
 * Strips dangerous tags, event handlers, javascript URIs, and CSS expressions.
 */
export function sanitizeEmailHtml(html: string): string {
  let result = html;

  // Strip <script>...</script> tags with content (case-insensitive, multiline)
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // Strip <iframe>...</iframe> tags with content
  result = result.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');

  // Strip <object>...</object> tags with content
  result = result.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '');

  // Strip <embed> tags (self-closing or with content)
  result = result.replace(/<embed\b[^>]*\/?>/gi, '');

  // Remove on* event handler attributes
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Replace javascript: URIs in href/src/action with empty value
  result = result.replace(
    /((?:href|src|action)\s*=\s*(?:"|'))javascript:[^"']*(?:"|')/gi,
    '$1"',
  );

  // Remove CSS expression(...) patterns
  result = result.replace(/expression\s*\([^)]*\)/gi, '');

  // Remove CSS url() with non-HTTPS schemes (preserve url(https://...))
  result = result.replace(
    /url\s*\(\s*(?:"|')?(?!https:\/\/)[a-z]+:[^)]*\)/gi,
    '',
  );

  return result;
}

/**
 * Strips all HTML tags from plain text (for email subjects).
 */
export function sanitizeTextContent(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}
