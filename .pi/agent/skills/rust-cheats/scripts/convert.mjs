import { parseDocument } from 'htmlparser2';
import { decodeHTML } from 'entities';

const TOKEN = /\uE000(\d+)\uE001/g;
const LINK_LABELS = { book: 'Book', ex: 'Rust by Example', std: 'std', nom: 'Nomicon', ref: 'Reference', rfc: 'RFC', link: 'Link', above: 'See section', below: 'See section' };
const MARKERS = { bad: 'Pitfall / intentionally wrong', deprecated: 'Deprecated / outdated', experimental: 'Unstable / nightly', esoteric: 'Advanced', hot: 'Useful', opinionated: 'Opinion', todo: 'Missing source / explanation', tbl_boost: 'Potential >2x boost', tbl_risk: 'Security / correctness risk', tbl_simple: 'Easy to implement', tbl_tradeoff: 'Costly tradeoff' };
export const SHORTCODES = [...Object.keys(LINK_LABELS), ...Object.keys(MARKERS), 'date', 'year', 'edition', 'note', 'tab', 'tablesep', 'expands_to', 'noemoji1', 'noemoji2'].sort();

const WRAPPERS = new Set('div span noprint fixed-2-column fixed-3-column twocolumn column panel tabs lifetime-section generics-section threading-section mini-table explanation less-important magic zoo spacer'.split(' '));
const DIAGRAM_ROOTS = new Set(['datum', 'mini-zoo', 'lifetime-example', 'thread-row', 'region']);
const DIAGRAM_TAGS = new Set('datum mini-zoo lifetime-example thread-row region entry narrow-entry machine type impl trait-impl associated-type function macro const person andor group value values name visual byte bit bitgroup word framed sized ptr payload capacity pad memory memory-entry memory-backdrop memory-row memory-link labels label arrows arrow tip drop droparrow denied failed subtext description section-header line-comment thread-backdrop thread-link region-label blank-background container tag zoom spacer'.split(' '));
const ROLES = { 'mini-zoo': 'relationships', datum: 'layout', 'lifetime-example': 'state', 'thread-row': 'thread', 'memory-backdrop': 'byte map', 'memory-row': 'memory row', 'memory-entry': 'pointee', 'memory-link': 'pointer link', ptr: 'pointer', sized: 'size field', framed: 'field', visual: 'representation', 'trait-impl': 'trait implementation', 'associated-type': 'associated type', droparrow: 'drop arrow', denied: 'DENIED', failed: 'FAILED', region: 'crate region' };
const DECORATIVE_CLASSES = new Set('spaced not-first zoo ignore-auto hidemobile no-margin nowrap wider narrow smaller small big large downshift hide_on_small'.split(' '));
const POSITION_PROPERTIES = new Set(['left', 'right', 'top', 'bottom', 'width', 'height', 'color', 'background-color', 'border-color', 'border-style', 'opacity', 'display', 'visibility']);

function descendants(node, predicate) {
  return (node.children ?? []).flatMap(child => [ ...(predicate(child) ? [child] : []), ...descendants(child, predicate) ]);
}
function plain(node) {
  return node.type === 'text' ? decodeHTML(node.data) : (node.children ?? []).map(plain).join('');
}
function compact(text) { return text.replace(/\s+/g, ' ').trim(); }
function escapeText(text) {
  return decodeHTML(text).replace(/[\u00a0\u200b\u200a]/g, ' ').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function absoluteURL(url) {
  if (/^(javascript|data):/i.test(url)) throw new Error(`Unsafe link scheme: ${url}`);
  return new URL(url, 'https://cheats.rs/').href;
}
function link(text, url) { return `[${text}](${absoluteURL(url).replace(/\(/g, '%28').replace(/\)/g, '%29')})`; }

// Freeze Markdown code BEFORE parsing any HTML, shortcodes, or comments. In
// particular, Vec<T>, macro braces, and strings containing HTML stay untouched.
export function protectCode(source) {
  if (/[\uE000\uE001]/.test(source)) throw new Error('Input contains reserved converter tokens');
  const tokens = [];
  const save = (text, kind) => { const id = tokens.push({ text, kind }) - 1; return `\uE000${id}\uE001`; };
  let output = '';
  for (let i = 0; i < source.length;) {
    if (i === 0 || source[i - 1] === '\n') {
      const opening = /^([ \t]*(?:>[ \t]*)*)(`{3,}|~{3,})([^\n]*)\n/.exec(source.slice(i));
      if (opening && !(opening[2][0] === '`' && opening[3].includes('`'))) {
        const char = opening[2][0];
        const prefix = opening[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const endPattern = new RegExp(`^${prefix}${char}{${opening[2].length},}[ \\t]*(?:\\n|$)`, 'm');
        const rest = source.slice(i + opening[0].length);
        const end = endPattern.exec(rest);
        if (!end) throw new Error(`Unclosed code fence at source offset ${i}`);
        const length = opening[0].length + end.index + end[0].length;
        output += save(source.slice(i, i + length), 'fence') + '\n';
        i += length;
        continue;
      }
    }
    // Comments are opaque: an unmatched backtick in a maintenance comment must
    // never consume a later visible section or hide the comment's closing tag.
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      if (end === -1) throw new Error(`Unclosed HTML comment at source offset ${i}`);
      output += save(source.slice(i, end + 3), 'comment');
      i = end + 3;
      continue;
    }
    const htmlCode = /^<code(?:\s[^>]*|)>/i.exec(source.slice(i));
    if (htmlCode) {
      const rest = source.slice(i + htmlCode[0].length);
      const closing = /<\/code\s*>/i.exec(rest);
      if (!closing) throw new Error(`Unclosed HTML code element at source offset ${i}`);
      const end = i + htmlCode[0].length + closing.index + closing[0].length;
      output += save(source.slice(i, end), 'html-code');
      i = end;
      continue;
    }
    if (source[i] === '`' && (i === 0 || source[i - 1] !== '\\')) {
      const marker = /^`+/.exec(source.slice(i))[0];
      let end = i + marker.length;
      while ((end = source.indexOf(marker, end)) !== -1) {
        if (source[end - 1] !== '`' && source[end + marker.length] !== '`') break;
        end += marker.length;
      }
      if (end !== -1 && !/\n[ \t]*\n/.test(source.slice(i, end))) {
        output += save(source.slice(i, end + marker.length), 'inline');
        i = end + marker.length;
        continue;
      }
    }
    output += source[i++];
  }
  return { text: output, tokens };
}

function parseArgs(raw) {
  const result = {};
  let rest = raw.trim();
  while (rest) {
    const match = /^(\w+)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*(?:,\s*|$)/.exec(rest);
    if (!match) throw new Error(`Unsupported shortcode arguments: ${raw}`);
    if (Object.hasOwn(result, match[1])) throw new Error(`Duplicate shortcode argument: ${match[1]}`);
    result[match[1]] = match[2][0] === '"' ? JSON.parse(match[2]) : match[2].slice(1, -1).replace(/\\'/g, "'");
    rest = rest.slice(match[0].length);
  }
  return result;
}

export function convert(source, templates) {
  const { text: frozen, tokens } = protectCode(source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
  const report = { shortcodes: {}, tags: {}, removed: {}, tabs: [], diagrams: [], sourceHeadings: [], code: {} };
  const omitted = new Set();
  const count = (group, key) => { group[key] = (group[key] ?? 0) + 1; };
  const omit = (text, reason) => {
    for (const match of text.matchAll(TOKEN)) omitted.add(Number(match[1]));
    count(report.removed, reason);
    return '';
  };
  const restore = text => text.replace(TOKEN, (_, id) => tokens[Number(id)].text);
  const generatedCode = (value, table = false, block = false) => {
    value = restore(value);
    if (table) value = value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const ticks = Math.max(block ? 3 : 1, ...[...value.matchAll(/`+/g)].map(m => m[0].length + 1));
    const fence = '`'.repeat(ticks);
    const text = block ? `${fence}text\n${value.trim()}\n${fence}` : `${fence}${/^[` ]|[` ]$/.test(value) ? ' ' : ''}${value}${/^[` ]|[` ]$/.test(value) ? ' ' : ''}${fence}`;
    const id = tokens.push({ text, kind: 'generated' }) - 1;
    return `\uE000${id}\uE001`;
  };
  let input = frozen.replace(/^\+\+\+\n[\s\S]*?\n\+\+\+\n/, text => omit(text, 'TOML frontmatter'));
  input = input.replace(TOKEN, (whole, id) => tokens[Number(id)].kind === 'comment' ? omit(whole, 'HTML comment') : whole);
  // No reference content follows this heading in the pinned upstream source.
  input = input.replace(/^## Printing & PDF\n[\s\S]*$/m, text => {
    if ([...text.matchAll(/^#{1,6} /gm)].length !== 1) throw new Error('New content follows Printing & PDF; review the removal policy');
    return omit(text, 'printing instructions and site footer');
  });
  report.sourceHeadings = [...input.matchAll(/^(#{1,6}) +(.+)$/gm)].map(m => ({ level: m[1].length, title: restore(m[2]) }));
  input = input.replace(/\{\{\s*(\w+)\s*\(([^]*?)\)\s*\}\}/g, (whole, name, argsText) => {
    if (!SHORTCODES.includes(name)) throw new Error(`Unknown shortcode: ${name}`);
    const template = templates[name];
    if (typeof template !== 'string') throw new Error(`Missing shortcode template: ${name}`);
    const args = parseArgs(argsText);
    count(report.shortcodes, name);
    const required = ['edition', 'note'].includes(name) ? { edition: 'ed', note: 'note' }[name] : name in LINK_LABELS ? ({ link: 'url', above: 'target', below: 'target' }[name] ?? 'page') : null;
    if (required && !Object.hasOwn(args, required)) throw new Error(`Missing ${required} in ${name}`);
    if (Object.keys(args).some(key => key !== required)) throw new Error(`Unexpected arguments in ${name}`);
    if (name in LINK_LABELS) {
      const expanded = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => args[key] ?? '');
      const node = descendants(parseDocument(expanded), node => node.name === 'a')[0];
      if (!node?.attribs.href) throw new Error(`Unrecognized link template: ${name}`);
      return link(LINK_LABELS[name], node.attribs.href);
    }
    if (name in MARKERS) return ` **[${MARKERS[name]}]** `;
    if (name === 'edition') return ` **[Edition ${args.ed}]** `;
    if (name === 'note') return `^(${args.note})`;
    if (name === 'tab') return '↳ ';
    if (name === 'tablesep') return '\n\n';
    if (name === 'expands_to') return ' → ';
    return ''; // date/year are site metadata; noemoji* are invisible spacers.
  });
  if (/\{\{[\s\S]*?\}\}/.test(input)) throw new Error('Unconverted template expression');
  input = input.replace(/^(#{1,6} .+?)\s*\{#[^}]+\}/gm, '$1');
  // Restore HTML code only after shortcode expansion, so literal shortcode-like
  // text and backticks inside HTML code are not interpreted as website syntax.
  input = input.replace(TOKEN, (whole, id) => tokens[Number(id)].kind === 'html-code' ? tokens[Number(id)].text : whole);
  const doc = parseDocument(input, { decodeEntities: false, recognizeSelfClosing: true, withStartIndices: true, withEndIndices: true });
  const sourceOf = node => input.slice(node.startIndex, node.endIndex + 1);
  const inPipeTable = node => input.slice(input.lastIndexOf('\n', node.startIndex) + 1, node.startIndex).trimStart().startsWith('|');
  const children = (node, context = {}) => (node.children ?? []).map(child => render(child, context)).join('');
  const flags = node => {
    const parts = (node.attribs?.class ?? '').split(/\s+/).filter(c => c && !DECORATIVE_CLASSES.has(c));
    if (node.attribs?.id) parts.push(`id=${node.attribs.id}`);
    for (const [key, value] of Object.entries(node.attribs ?? {})) {
      if (['class', 'id', 'style'].includes(key)) continue;
      parts.push(`${key}=${decodeHTML(value)}`);
    }
    // Coordinates/colors express arrow endpoints, aliasing, invalid states and
    // cache membership. Keep them explicitly as DIAGRAM data, not ABI facts.
    for (const rule of (node.attribs?.style ?? '').split(';')) {
      const colon = rule.indexOf(':');
      const key = rule.slice(0, colon).trim();
      if (colon >= 0 && POSITION_PROPERTIES.has(key)) parts.push(`diagram-${key}=${rule.slice(colon + 1).trim()}`);
    }
    return parts.length ? ` [${parts.join(', ')}]` : '';
  };
  function diagramLines(node, depth = 0) {
    if (node.type === 'text') {
      const text = compact(decodeHTML(restore(node.data)));
      return text ? ['  '.repeat(depth) + text] : [];
    }
    if (node.type === 'comment') return [];
    if (!DIAGRAM_TAGS.has(node.name) && !['code', 'b', 'i', 'sub', 'sup', 'br', 'div', 'span', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'header', 'subtitle', 'note', 'hr'].includes(node.name)) throw new Error(`Unknown diagram element: ${node.name}`);
    count(report.tags, node.name);
    if (node.name === 'br') return [];
    if (node.name === 'code') return restore(codeText(node)).split('\n').map(line => '  '.repeat(depth) + line);
    if (node.name === 'a') return ['  '.repeat(depth) + restore(renderLink(node))];
    const label = (ROLES[node.name] ?? node.name.replaceAll('-', ' ')) + flags(node);
    const items = (node.children ?? []).filter(child => child.type !== 'text' || compact(child.data));
    let lines = [];
    // Run-length encode identical adjacent byte cells without dropping their
    // classes, values, order, or hidden/padding state.
    for (let i = 0; i < items.length; i++) {
      const child = items[i];
      const serialized = diagramLines(child, depth + 1);
      let repeats = 1;
      if (child.name === 'byte') {
        while (items[i + 1]?.name === 'byte' && sourceOf(items[i + 1]) === sourceOf(child)) { repeats++; i++; }
      }
      lines.push(...(repeats > 1 ? ['  '.repeat(depth + 1) + `${serialized.join(' ').trim()} × ${repeats}`] : serialized));
    }
    const prefix = '  '.repeat(depth) + label;
    if (lines.length === 1) return [prefix + ': ' + lines[0].trim()];
    return [prefix + (lines.length ? ':' : ''), ...lines];
  }
  function codeText(node) {
    return (node.children ?? []).map(child => {
      if (child.type === 'text') return decodeHTML(child.data);
      if (child.type === 'comment') return '';
      if (child.name === 'br') return '\n';
      if (child.name === 'sub') return `_(${codeText(child)})`;
      if (child.name === 'sup') return `^(${codeText(child)})`;
      if (['span', 'b', 'i', 'code'].includes(child.name)) return codeText(child);
      throw new Error(`Unexpected markup inside code: ${child.name}`);
    }).join('');
  }
  function renderLink(node) {
    const text = compact(children(node));
    if (node.attribs.href?.startsWith('javascript:')) return omit(sourceOf(node), 'interactive control');
    if (node.attribs.href) return link(text || node.attribs.title || node.attribs.href, decodeHTML(node.attribs.href));
    if (node.attribs.title) return ` **[${escapeText(node.attribs.title)}]** `;
    return text;
  }
  function renderTable(node) {
    const rowNodes = descendants(node, n => n.name === 'tr');
    if (descendants(node, n => n.attribs?.rowspan).length) throw new Error('Row-spanning HTML table needs an explicit conversion');
    if (descendants(node, n => n.attribs?.colspan).length) {
      return '\n\n' + rowNodes.map((row, index) => {
        let column = 1;
        const cells = (row.children ?? []).filter(n => ['td', 'th'].includes(n.name));
        const values = cells.map(cell => {
          const span = Number(cell.attribs.colspan ?? 1);
          if (!Number.isSafeInteger(span) || span < 1) throw new Error('Invalid column span');
          const range = span === 1 ? `${column}` : `${column}–${column + span - 1}`;
          column += span;
          return `  - ${cell.name === 'th' ? 'Header, ' : ''}column${span > 1 ? 's' : ''} ${range}: ${compact(children(cell)) || '(empty)'}`;
        });
        return `- Row ${index + 1}${flags(row)}:\n${values.join('\n')}`;
      }).join('\n') + '\n\n';
    }
    const rows = rowNodes.map(row => {
      const cells = (row.children ?? []).filter(n => ['td', 'th'].includes(n.name));
      const rowFlags = (row.attribs.class ?? '').trim();
      return cells.map((cell, index) => (index === 0 && rowFlags ? `**[${rowFlags}]** ` : '') + compact(children(cell, { table: true })));
    });
    if (!rows.length) return '';
    const width = Math.max(...rows.map(row => row.length));
    const line = row => '| ' + Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ') + ' |';
    const hasHeader = descendants(node, n => n.name === 'th').length > 0;
    const header = hasHeader ? rows.shift() : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
    return '\n\n' + [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n') + '\n\n';
  }
  let sourceHeadingLevel = 2;
  let sectionLevel = 2;
  let sectionEpoch = 0;
  const activeTabLevel = context => context.sectionEpoch === sectionEpoch ? context.tabLevel : undefined;
  function render(node, context = {}) {
    if (node.type === 'text') {
      for (const match of node.data.matchAll(/^(#{1,6}) +/gm)) {
        sourceHeadingLevel = match[1].length;
        sectionLevel = sourceHeadingLevel;
        sectionEpoch++; // A new Markdown section also ends stale HTML tab context.
      }
      // Keep Markdown delimiters and table pipes, only decode textual entities.
      return node.data.replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, entity => {
        const decoded = decodeHTML(entity);
        if (decoded === '|') return '\\|';
        if (decoded === '<' || decoded === '>') return entity;
        return decoded.replace(/[\u00a0\u200b\u200a]/g, ' ');
      });
    }
    if (node.type === 'comment') return omit(sourceOf(node), 'HTML comment');
    count(report.tags, node.name);
    const { name, attribs: attrs = {} } = node;
    if (name === 'img' && attrs.id !== 'logo') throw new Error('Non-logo image needs an explicit textual conversion');
    if (['toc', 'page-controls', 'symbol-legend', 'pagetitle', 'footer', 'input', 'img'].includes(name) ||
        (name === 'blockquote' && attrs.class === 'legend') ||
        ['xray-help', 'expander'].some(cls => (attrs.class ?? '').split(/\s+/).includes(cls)) ||
        ['subtitle', 'helloplay', 'helloinfo', 'helloctrl'].includes(attrs.id)) return omit(sourceOf(node), `site chrome: ${name}${attrs.id ? '#' + attrs.id : ''}`);
    if (DIAGRAM_ROOTS.has(name)) {
      const id = report.diagrams.length + 1;
      const lines = diagramLines(node);
      report.diagrams.push({ id, kind: name, normalizedInputLine: input.slice(0, node.startIndex).split('\n').length, title: compact(restore(plain(node))).slice(0, 90) });
      return `\n\n**Diagram ${id} — textual ${ROLES[name] ?? name}:**\n\n${generatedCode(lines.join('\n'), false, true)}\n\n`;
    }
    if (name === 'code') {
      const value = codeText(node);
      if (!value) return '';
      const table = context.table || inPipeTable(node);
      const aliases = descendants(node, child => (child.attribs?.class ?? '').split(/\s+/).includes('cargo-prefix'));
      const annotation = aliases.length ? ` (highlighted abbreviation: ${aliases.map(child => generatedCode(codeText(child), table)).join(', ')})` : '';
      return generatedCode(value, table) + annotation;
    }
    if (name === 'a') return renderLink(node);
    if (name === 'table') return renderTable(node);
    if (name === 'tabs') return children(node, { ...context, sectionEpoch, tabLevel: Math.min(6, (activeTabLevel(context) ?? sectionLevel) + 1) });
    if (name === 'tab') {
      const label = (node.children ?? []).find(n => n.name === 'label');
      if (!label) throw new Error('Tab has no label');
      const title = compact(children(label)).replace(/\*\*/g, '');
      report.tabs.push(restore(title));
      const tabLevel = activeTabLevel(context) ?? Math.min(6, sectionLevel + 1);
      return '\n\n' + '#'.repeat(tabLevel) + ' ' + title + '\n\n' + node.children.filter(n => n !== label).map(n => render(n, { ...context, sectionEpoch, tabLevel })).join('') + '\n\n';
    }
    if (WRAPPERS.has(name)) {
      const semantic = (attrs.class ?? '').split(/\s+/).filter(value => ['good', 'bad', 'unsafe', 'warning'].includes(value));
      return (semantic.length ? `**[Source: ${semantic.join(', ')}]** ` : '') + children(node, context);
    }
    if (['b', 'strong'].includes(name)) return `**${children(node, context)}**`;
    if (['i', 'em'].includes(name)) return `_${children(node, context)}_`;
    if (name === 'strike') return `~~${children(node, context)}~~`;
    if (name === 'sup') return `^(${compact(children(node, context))})`;
    if (name === 'sub') return `_(${compact(children(node, context))})`;
    if (name === 'br') return context.table || inPipeTable(node) ? ' / ' : '\n';
    if (name === 'hr') return '\n\n---\n\n';
    if (name === 'blockquote') return '\n\n' + children(node).trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n';
    if (name === 'ul') return '\n' + children(node) + '\n';
    if (name === 'li') return '- ' + children(node).trim() + '\n';
    if (['header', 'section-header'].includes(name)) {
      const tabLevel = activeTabLevel(context);
      const level = Math.min(6, (tabLevel ?? sourceHeadingLevel) + 1);
      if (!tabLevel) sectionLevel = level;
      return '\n\n' + '#'.repeat(level) + ' ' + compact(children(node, context)) + '\n\n';
    }
    if (name === 'footnotes') return '\n\n**Notes:**\n\n' + children(node).trim() + '\n\n';
    if (['footnote', 'note', 'description', 'subtitle', 'region-label'].includes(name)) return '\n\n' + children(node).trim() + '\n\n';
    if (DIAGRAM_TAGS.has(name)) throw new Error(`Diagram element outside a recognized diagram: ${name}`);
    throw new Error(`Unknown HTML element: ${name} near source offset ${node.startIndex}`);
  }
  let body = doc.children.map(node => render(node)).join('');
  // Keep links usable even when headings were normalized or tabs flattened.
  body = body.replace(/\]\((#[^\s)]+)\)/g, (_, href) => `](https://cheats.rs/${href})`);
  body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const sourceTabs = [...input.matchAll(/<tab(?:\s[^>]*|)>/g)].length;
  if (report.tabs.length !== sourceTabs) throw new Error(`Tab coverage mismatch: ${report.tabs.length}/${sourceTabs}`);
  report.sourceTabs = sourceTabs;
  const present = new Set([...body.matchAll(TOKEN)].map(m => Number(m[1])));
  // Original tokens consumed by generated code blocks count as preserved too.
  const final = restore(body) + '\n';
  for (const [id, token] of tokens.entries()) {
    if (omitted.has(id) || ['generated', 'html-code', 'comment'].includes(token.kind)) continue;
    if (!present.has(id) && !final.includes(token.text)) throw new Error(`Lost ${token.kind} code token ${id}: ${token.text.slice(0, 100)}`);
  }
  report.code = {
    sourceFences: tokens.filter(t => t.kind === 'fence').length,
    preservedFences: tokens.filter((t, id) => t.kind === 'fence' && !omitted.has(id) && final.includes(t.text)).length,
    omittedCommentOrChromeFences: tokens.filter((t, id) => t.kind === 'fence' && omitted.has(id)).length,
    sourceInlineSpans: tokens.filter(t => t.kind === 'inline').length,
  };
  return { body: final, report };
}

export function makeIndex(markdown) {
  const lines = markdown.split('\n');
  let fence = null;
  const sections = [];
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) sections.push({ level: heading[1].length, title: heading[2], start: index + 1 });
  }
  return sections.map((section, i) => ({ ...section, end: sections.slice(i + 1).find(next => next.level <= section.level)?.start - 1 || lines.length - 1 }));
}
