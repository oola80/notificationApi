import { sanitizeEmailHtml, sanitizeTextContent } from './html-sanitizer.js';

describe('sanitizeEmailHtml', () => {
  it('should strip <script> tags with content', () => {
    const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(sanitizeEmailHtml(input)).toBe('<p>Hello</p><p>World</p>');
  });

  it('should strip <script> tags case-insensitively', () => {
    const input = '<SCRIPT type="text/javascript">evil()</SCRIPT>';
    expect(sanitizeEmailHtml(input)).toBe('');
  });

  it('should strip <iframe> tags with content', () => {
    const input = '<div><iframe src="http://evil.com">content</iframe></div>';
    expect(sanitizeEmailHtml(input)).toBe('<div></div>');
  });

  it('should strip <object> tags with content', () => {
    const input = '<object data="evil.swf"><param name="x"></object>';
    expect(sanitizeEmailHtml(input)).toBe('');
  });

  it('should strip <embed> tags', () => {
    const input = '<embed src="evil.swf" /><p>safe</p>';
    expect(sanitizeEmailHtml(input)).toBe('<p>safe</p>');
  });

  it('should remove on* event handler attributes', () => {
    const input = '<img src="pic.jpg" onerror="alert(1)" />';
    expect(sanitizeEmailHtml(input)).toBe('<img src="pic.jpg" />');
  });

  it('should remove onclick with single quotes', () => {
    const input = "<button onclick='doEvil()'>Click</button>";
    expect(sanitizeEmailHtml(input)).toBe('<button>Click</button>');
  });

  it('should remove onmouseover without quotes', () => {
    const input = '<div onmouseover=alert(1)>text</div>';
    expect(sanitizeEmailHtml(input)).toBe('<div>text</div>');
  });

  it('should replace javascript: URIs in href', () => {
    const input = '<a href="javascript:alert(1)">link</a>';
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('should replace javascript: URIs in src', () => {
    const input = '<img src="javascript:evil()" />';
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('should remove CSS expression() patterns', () => {
    const input = '<div style="width: expression(document.body.clientWidth)">test</div>';
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain('expression');
  });

  it('should remove CSS url() with data: scheme', () => {
    const input = '<div style="background: url(data:image/png;base64,abc)">test</div>';
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain('url(data:');
  });

  it('should preserve safe HTML content', () => {
    const input =
      '<h1>Welcome</h1><p>Hello <strong>World</strong></p><a href="https://example.com">Link</a>';
    expect(sanitizeEmailHtml(input)).toBe(input);
  });

  it('should preserve url(https://...) in CSS', () => {
    const input = '<div style="background: url(https://cdn.example.com/img.png)">test</div>';
    expect(sanitizeEmailHtml(input)).toBe(input);
  });

  it('should handle multiline script tags', () => {
    const input = '<p>Before</p><script>\n  var x = 1;\n  alert(x);\n</script><p>After</p>';
    expect(sanitizeEmailHtml(input)).toBe('<p>Before</p><p>After</p>');
  });

  it('should handle empty input', () => {
    expect(sanitizeEmailHtml('')).toBe('');
  });

  it('should handle input with no dangerous content', () => {
    const input = '<table><tr><td>Data</td></tr></table>';
    expect(sanitizeEmailHtml(input)).toBe(input);
  });
});

describe('sanitizeTextContent', () => {
  it('should strip all HTML tags', () => {
    const input = '<b>Bold</b> and <i>italic</i>';
    expect(sanitizeTextContent(input)).toBe('Bold and italic');
  });

  it('should handle self-closing tags', () => {
    const input = 'Line 1<br/>Line 2';
    expect(sanitizeTextContent(input)).toBe('Line 1Line 2');
  });

  it('should handle empty input', () => {
    expect(sanitizeTextContent('')).toBe('');
  });

  it('should pass through plain text unchanged', () => {
    const input = 'Just plain text with no tags';
    expect(sanitizeTextContent(input)).toBe(input);
  });
});
