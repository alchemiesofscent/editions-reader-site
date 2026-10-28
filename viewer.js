/* Public-build presentation only; private viewer assets remain unchanged. */
function renderPublicCredits(index) {
  const credit = index.public_credits;
  const safe = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const line = c => [c.name, c.role, c.affiliation].filter(Boolean).join(' — ');
  const list = lines => `<ul>${lines.map(value => `<li>${safe(value)}</li>`).join('')}</ul>`;
  document.querySelector('#credits').innerHTML = list(credit.edition) +
    `<div>${safe(index.label)} · ${credit.licence ? `<a href="${safe(credit.licence)}">${safe(credit.licence_text || "CC BY-SA 4.0")}</a>` : safe(credit.licence_text)}</div>` +
    list(credit.attribution.map(line)) + (credit.upstream.length ?
      `<h3>Upstream: First1KGreek</h3>${list(credit.upstream.map(line))}` : '') +
    list([...credit.authority, credit.scans]);
  document.querySelector('#candidate-banner').hidden = index.edition !== 'paul' || ['accepted', 'scholarly-accepted'].includes(index.status);
}
if (typeof module !== 'undefined') module.exports = {renderPublicCredits};

/* Static viewer. No edition data is embedded in this script. */
'use strict';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const GROUPS = {criticus: 'Apparatus criticus', fontium: 'Apparatus fontium', synonyma: 'Synonyma'};
// Apparatus groups the reader has folded; kept across pages and visits (browser storage may be unavailable).
const COLLAPSED = new Set();
try { JSON.parse(localStorage.getItem('apparatus-collapsed') || '[]').forEach(g => COLLAPSED.add(g)); } catch {}

function parseRoute(hash, index) {
  const pieces = hash.replace(/^#/, '').split('/');
  if (pieces[0] !== index.edition) throw new Error('Unknown edition route');
  if (/^p[\w-]+$/.test(pieces[1] || '') && pieces.length <= 3) {
    const page = pieces[1].slice(1), line = pieces[2] || '';
    if (!index.pages.some(p => p.n === page) || (line && !/^\d+$/.test(line))) throw new Error('Page or line is outside this build');
    return {page, line};
  }
  const book = index.books.find(b => b.n === pieces[1]);
  const [chapterNumber, sectionNumber, extra] = (pieces[2] || '').split('.');
  const chapter = book?.chapters.find(c => c.n === chapterNumber);
  if (!chapter || pieces.length !== 3) throw new Error('Chapter is outside this build');
  if (sectionNumber !== undefined) {
    const section = chapter.sections?.find(s => s.n === sectionNumber);
    if (!section || extra !== undefined) throw new Error('Section is outside this build');
    return {page: section.first.page, line: section.first.line, book: book.n, chapter: chapter.n, section: section.n};
  }
  return {page: chapter.first.page, line: chapter.first.line, book: book.n, chapter: chapter.n};
}

function pageLabel(key, index) {
  const label = index?.pages?.find(p => p.n === key)?.label;
  if (label) return label;
  const match = key?.match(/^([123])-(\d+)$/);
  return match ? `${['', 'I', 'II', 'III'][Number(match[1])]}, p. ${match[2]}` : `p. ${key}`;
}

function parseLocation(value, index) {
  const qualified = value.trim().match(/^(?:(I{1,3})(?:\s*,\s*(?:p\.?\s*)?|\s+(?:p\.?\s*)?)|([123])(?:-|\s+))(\d+)(?:\s*[,/:]\s*(?:l\.?\s*)?(\d+))?$/i);
  if (qualified) {
    const volume = {I: '1', II: '2', III: '3'}[qualified[1]?.toUpperCase()] || qualified[2];
    return {page: `${volume}-${qualified[3]}`, line: qualified[4] || ''};
  }
  const match = value.trim().match(/^(?:p\.?\s*)?([\w-]+)(?:\s*(?:[,./:]\s*(?:l\.?\s*)?|\s+l\.?\s*)(\d+))?$/i);
  if (!match) throw new Error('Use a printed location such as p. 6, l. 14');
  if (index?.pages.some(p => /^[123]-/.test(p.n)) && /^\d+$/.test(match[1])) throw new Error('Specify the volume: e.g. II 45, 12 or 2-45/12');
  return {page: match[1], line: match[2] || ''};
}

// Producer flags may be JSON objects ({"kind": "line_mismatch", ...}): show them as a sentence.
function flagText(flag) {
  let f;
  try { f = JSON.parse(flag); } catch { return flag; }
  if (!f || typeof f !== 'object') return flag;
  if (f.kind === 'line_mismatch') return `Printed line ${f.cited_line}; the lemma is on line ${f.lemma_line}`;
  const rest = Object.entries(f).filter(([k]) => k !== 'kind' && k !== 'detail' && k !== 'candidates')
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
  return [String(f.kind || 'flag').replace(/_/g, ' '), rest, f.detail].filter(Boolean).join(' — ');
}

// Amber only where review is needed (a printed lemma not found, a missing target);
// an entry that prints no lemma simply refers to its line(s).
function attachmentNote(e) {
  if (e.cert === 'low') return `<div class="fl">${e.anchored === false ? 'Lemma not placed; line highlighted — review' : 'Uncertain — review'}</div>`;
  if (e.attachment === 'page') return '<div class="fl">Page-level entry; target unavailable</div>';
  if (e.lemma && e.attachment === 'line') return '<div class="fl">Printed lemma not found on its line; line highlighted</div>';
  const text = e.attachment === 'chapter' ? `Chapter ${esc(e.chapter)} head` : e.continued ? 'Continued from preceding page' : `Refers to line ${esc(e.line)}`;
  return `<div class="loc">${text}</div>`;
}

// The plain text of a line, to see whether the source already prints its hyphen.
function lineText(line) {
  return line.parts.map(part => part.br || part.t || '').join('');
}

function visibleFlags(entry, index) {
  return index?.apparatus_display?.flags === false ? [] : entry.flags || [];
}

function showPrinted(entry, index) {
  return entry.printed && (index?.apparatus_display?.printed !== 'fallback' ||
    (entry.printed_fallback ?? !entry.readings.length));
}

function renderLineKey(ref, index) {
  if (!ref.page || !ref.line) return `<span class="line-key">${esc(ref.label)}</span>`;
  return `<a class="line-key" href="#${esc(index.edition)}/p${esc(ref.page)}/${esc(ref.line)}">${esc(ref.label || ref.line)}</a>`;
}

function renderText(page, index) {
  const opens = {}, closes = {}, insertions = {};
  for (const entry of page.entries) {
    if (entry.off_page || ['page', 'continued'].includes(entry.attachment)) continue;
    if (entry.insertion || entry.insertion_point) {
      (insertions[entry.insertion_point || entry.from] ||= []).push(entry);
      if (entry.insertion) continue;
    }
    for (const span of entry.spans || [{from: entry.from, to: entry.to}]) {
      (opens[span.from] ||= []).push(entry.id);
      (closes[span.to] ||= []).push(entry.id);
    }
  }
  const uncertain = new Set(page.entries.filter(e => e.cert === 'low' || (e.cert !== 'medium' && visibleFlags(e, index).length)).map(e => e.id));
  const medium = new Set(page.entries.filter(e => e.cert === 'medium').map(e => e.id));
  let active = new Set();
  const renderLines = (lines, nextBreakNo = false) => {
  active = new Set();
  return lines.map((line, k) => {
    let text = '';
    for (const part of line.parts) {
      if (part.ref) {
        text += renderLineKey(part.ref, index);
        continue;
      }
      if ('a' in part) {
        for (const id of closes[part.a] || []) active.delete(id);
        for (const entry of insertions[part.a] || []) {
          const title = entry.readings.map(r => `${r.text}${r.type ? ` (${r.type}.)` : ''}`).join('; ');
          text += `<span class="lem ins${uncertain.has(entry.id) ? ' low' : ''}${part.context ? ' context' : ''}" tabindex="0" role="button" data-e="${esc(entry.id)}" title="${esc(title)}" aria-label="${esc(`Insertion${entry.insertion_side ? ` ${entry.insertion_side} word` : ''}: ${title}`)}"></span>`;
        }
        for (const id of opens[part.a] || []) active.add(id);
        continue;
      }
      const classes = [active.size ? 'lem' : '', part.headword ? 'headword' : '', part.g ? 'g' : '', part.num ? 'num' : '', part.overline ? 'overline' : '', part.superscript ? 'superscript' : '', part.small ? 'small' : '', part.large ? 'large' : '', part.letter_spacing ? 'letter-spacing' : '', [...active].some(id => uncertain.has(id)) ? 'low' : '', part.br ? 'br' : '', part.context ? 'context' : '', part.italic ? 'italic' : ''].filter(Boolean).join(' ');
      const attr = active.size ? ` tabindex="0" role="button" data-e="${esc([...active].join(' '))}"` : '';
      const title = part.tooltip ? ` title="${esc(part.tooltip)}"` : part.value !== undefined ? ` title="Numerical value: ${esc(part.value)}"` : [...active].some(id => medium.has(id)) ? ' title="Medium certainty"' : '';
      text += `<span class="${classes}"${part.id ? ` id="${esc(part.id)}"` : ''}${part.lang ? ` lang="${esc(part.lang)}"` : ''}${attr}${title}>${esc(part.br || part.t)}</span>`;
    }
    const lineEntries = page.entries.filter(e => !e.off_page && e.anchored === false && ['line', 'chapter'].includes(e.attachment) && e.line_ids?.includes(line.id)).map(e => e.id);
    const sections = (line.sections || []).map(s => `<b class="mg" title="Section ${esc(s.chapter)}.${esc(s.n)}">${esc(s.n)}</b> `).join('');
    const continuation = lines[k + 1]?.break_no || (k === lines.length - 1 && nextBreakNo);
    return `<div class="tl" data-line="${esc(line.n)}" data-line-e="${esc(lineEntries.join(' '))}"${line.break_no ? ' data-break-no="true"' : ''}><span class="n">${sections}${line.margin ? `<b class="mg" title="printed marginal">${esc(line.margin)}</b> ` : ''}${esc(line.n)}</span><span>${line.unchecked_layout ? '<small class="unchecked-layout">unchecked layout</small> ' : ''}${text}${continuation && !/[-‐]\s*$/.test(lineText(line)) ? '<span class="hy" aria-hidden="true">-</span>' : ''}</span></div>`;
  }).join('');
  };
  return renderLines(page.lines, page.next_break_no) + (page.segments || []).map(segment =>
    `<section class="recension"><h3 class="recension-label">${segment.rend?.split(/\s+/).includes('bracketed') ? '[' : ''}${esc(segment.n)} ${esc(segment.subtype)}${segment.rend?.split(/\s+/).includes('bracketed') ? ']' : ''}${['M', 'F'].includes(segment.part) ? ' (continued)' : ''}${(segment.refs || []).map(ref => ' ' + renderLineKey(ref, index)).join('')}</h3>${renderLines(segment.lines)}</section>`).join('');
}

function externalLink(url, label) {
  return /^https?:\/\//.test(url || '') ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label);
}

function citationLink(link) {
  if (/^(?:#(?:paul|wellmann)\/\d+\/\d+(?:\.\d+)?|wellmann-[2-5]\/#wellmann\/[2-5]\/\d+)$/.test(link.url || '')) {
    return `<a href="${esc(link.url)}">${esc(link.label || link.kind)}</a>`;
  }
  return externalLink(link.url, link.label || link.kind);
}

function manuscriptDetails(parts) {
  return parts.map(m => {
    const location = [m.city, m.library, m.shelfmark].filter(Boolean).join(', ');
    const extra = [m.folios, m.date].filter(Boolean).join(', ');
    const pinakes = ['exact', 'probable'].includes(m.match) && m.pinakes_url ?
      ` ${externalLink(m.pinakes_url, 'Pinakes')}${m.match === 'probable' ? ` <span title="${esc(m.match_evidence)}">(probable match)</span>` : ''}` : '';
    return `<span class="manuscript">${m.part ? `${esc(m.part)}: ` : ''}${esc(location)}${extra ? ` (${esc(extra)})` : ''}${pinakes}</span>`;
  }).join('');
}

function renderApp(page, index) {
  if (page.front && !page.entries.length) return (page.printed_apparatus || []).map(text => `<div class="printed-apparatus">${esc(text)}</div>`).join('');
  const methodTag = e => {
    if (!e.method) return '';
    const parts = (e.method_parts || []).map(p => `${p.from} → ${p.to}: ${p.method}`).join('; ');
    return `<span class="method"${parts ? ` title="${esc(parts)}"` : ''}>${esc(e.method)}</span>`;
  };
  const printed = parts => parts.map(p => p.gap ? `<span class="br" title="Illegible in source">□</span>` : p.italic ? `<i>${esc(p.t)}</i>` : esc(p.t)).join('');
  const locationLink = (location, label) => index.pages?.some(p => p.n === location.page) ? `<a href="#${esc(index.edition)}/p${esc(location.page)}/${esc(location.line)}">${esc(label)}${location.page_label ? ` (${esc(location.page_label)}, l. ${esc(location.line)})` : ''}</a>` : esc(`${label} (${pageLabel(location.page, index)}, l. ${location.line}; outside this build)`);
  const witness = (w, witnessId) => {
    const except = w.startsWith('-'), siglum = except ? w.slice(1) : w;
    const members = page.legend?.[siglum];
    const description = members ? `family ${siglum}: ${members.join(' ')}` : index.sigla[siglum] || 'Witness description unavailable';
    const parts = (index.manuscripts?.[siglum] || []).filter(m => !witnessId || m.sigla_id === witnessId);
    const tooltip = parts.map(m => [m.city, m.library, m.shelfmark, m.folios, m.date].filter(Boolean).join(', ')).join('; ');
    if (parts.length) return `<details class="witness-detail"><summary class="w${except ? ' ex' : ''}" title="${esc(tooltip)}">${esc(siglum)}</summary>${manuscriptDetails(parts)}</details>`;
    return `<span class="w${except ? ' ex' : ''}" title="${esc(description)}">${esc(siglum)}</span>`;
  };
  const legend = (page.legend_printed || []).map(segment => {
    const tokens = segment.split(/([\p{L}\p{M}\p{N}]+[’'′″]?)/u);
    return `<span>${tokens.map(token => Object.hasOwn(index.sigla, token) || Object.hasOwn(page.legend || {}, token) ? witness(token) : esc(token)).join('')}</span>`;
  }).join(' ');
  const siglaList = index.manuscripts ? `<details class="sigla-list"><summary>Witnesses / sigla</summary>${Object.entries(index.manuscripts).map(([siglum, parts]) => `<div><b>${esc(siglum)}</b> ${manuscriptDetails(parts)}</div>`).join('')}</details>` : '';
  return siglaList + (legend ? `<div class="legend" aria-label="Page witness families">${legend}</div>` : '') + Object.entries(GROUPS).map(([group, title]) => {
    const entries = page.entries.filter(e => e.group === group);
    const witnesses = group === 'criticus' ? (page.witnesses || []).map(w => `<div class="witnesses">${printed(w.parts)}</div>`).join('') : '';
    return `<details class="app-group" data-group="${esc(group)}"${COLLAPSED.has(group) ? '' : ' open'}><summary><h2>${title} (${entries.length})</h2></summary>${witnesses}${entries.map(e => `<div class="entry${e.cert === 'low' || (e.cert !== 'medium' && visibleFlags(e, index).length) ? ' low' : ''}" id="${esc(e.id)}"${e.cert === 'medium' ? ' title="Medium certainty"' : ''} tabindex="0" role="button" data-id="${esc(e.id)}">
      ${e.corresp ? `<small class="continuation"><a href="${esc(e.corresp)}" data-parent="${esc(e.corresp.replace(/^#/, ''))}">continues ${esc(e.corresp.replace(/^#/, ''))}</a></small>` : ''}
      <div class="row1"><span class="ln">${e.off_page || ['page', 'continued'].includes(e.attachment) ? '—' : esc(e.line)}</span><span class="lemt${e.lemma_printed === false ? ' unp' : ''}">${esc(e.insertion ? '' : e.lemma || (e.anchored === false ? '' : '∅'))}</span>${methodTag(e)}</div>
      ${e.cert === 'low' || e.anchored === false ? attachmentNote(e) : ''}
      ${visibleFlags(e, index).map(flag => `<div class="fl">${esc(flagText(flag))}</div>`).join('')}
      ${e.prev_location ? locationLink(e.prev_location, 'Previous apparatus entry') : ''}
      ${e.target_location ? locationLink(e.target_location, 'Open target') : ''}
      ${e.source_page && e.source_page !== page.page ? (index.pages?.some(p => p.n === e.source_page) ? `<a href="#${esc(index.edition)}/p${esc(e.source_page)}">Printed on ${esc(pageLabel(e.source_page, index))}</a>` : `Printed on ${esc(pageLabel(e.source_page, index))} (outside this build)`) : ''}
      ${e.readings.map(r => `<div${r.citation_id ? ` data-citation-id="${esc(r.citation_id)}"` : ''} class="rd${r.cert === 'low' ? ' low' : ''}"><span class="ty">${esc(['om', 'add', 'transp'].includes(r.type) ? `${r.type}.` : r.type)}</span><span class="${r.generic ? 'nt' : 'rt'}">${esc(r.text)}</span>${r.type === 'add' && e.insertion_label ? `<span class="nt">${esc(e.insertion_label)} ${esc(e.lemma)}</span>` : ''}
        ${r.wit.map((w, i) => witness(w, r.wit_ids?.[i])).join('')}
        ${(r.links || []).map(link => `<small class="citation-link">${citationLink(link)}</small>`).join(' ')}
        ${r.two_reads ? `<small class="two-reads" title="${esc(`${r.two_reads.read1_range}; ${r.two_reads.read2_range}`)}">two reads</small>` : ''}
        ${r.linked === false ? `<span class="not-linked" title="${esc(r.link_check || '')}">not linked</span>` : ''}
        ${r.cert === 'low' ? '<span class="fl">Citation uncertainty — review</span>' : ''}
        ${r.notes.filter(n => (n.type !== 'flag' || index.apparatus_display?.flags !== false) &&
          (n.type !== 'printed' || index.apparatus_display?.printed !== 'fallback'))
          .map(n => index.edition === 'paul' && index.encoding === 'standoff' ? `<span class="nt">${n.type === 'editorial' ? `<i>ed. ${esc(n.text)}</i>` : `<span class="ty">${esc(n.type)}</span> ${esc(n.text)}`}</span>` : `<span class="nt">${n.wit ? `<span class="w">${esc(n.wit)}</span> ` : ''}${esc(n.text)}</span>`).join(' ')}</div>`).join('')}
      ${showPrinted(e, index) ? `<div class="pr">${e.printed_parts ? printed(e.printed_parts) : esc(e.printed)}</div>` : ''}</div>`).join('')}</details>`;
  }).join('');
}

const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ');
function headwords(index) {
  if (index.headwords) return index.headwords.map(u => ({label: `${u.n} · ${u.label}`, title: u.label,
    hash: `#${index.edition}/p${u.first.page}/${u.first.line}`}))
    .sort((a, b) => fold(a.title).localeCompare(fold(b.title), 'el'));
  return index.books.flatMap(book => book.chapters.filter(c => !c.context).map(chapter => ({
    label: `${book.n}.${chapter.n} · ${chapter.label}`,
    hash: `#${index.edition}/${book.n}/${chapter.n}`,
    title: chapter.label
  }))).sort((a, b) => fold(a.title).localeCompare(fold(b.title), 'el'));
}
async function searchPages(index, query, loadPage) {
  const needle = fold(query.trim());
  if (!needle) return [];
  const results = [];
  for (const page of index.pages) {
    const payload = await loadPage(page.n);
    for (const line of [...payload.lines, ...(payload.segments || []).flatMap(s => s.lines)]) {
      const text = line.parts.map(p => p.t || '').join('');
      if (fold(text).includes(needle)) results.push({
        hash: `#${index.edition}/p${page.n}/${line.n}`,
        label: `${pageLabel(page.n, index)}, l. ${line.n} · ${text}`
      });
    }
  }
  return results;
}

if (typeof module !== 'undefined') module.exports = {COLLAPSED, parseRoute, parseLocation, pageLabel, renderText, renderApp, flagText, headwords, searchPages};

if (typeof document !== 'undefined') {
  const $ = selector => document.querySelector(selector);
  let index, catalog, currentPage, request = 0, searchRequest = 0;
  const pageCache = new Map();
  const status = message => { $('#status').textContent = message; };
  const chapterOptions = book => {
    const chapters = index.books.find(b => b.n === book).chapters;
    const options = chapters.map(c => `<option value="${esc(c.n)}">${esc(c.n)} · ${esc(c.label)}${c.context ? ' · context' : ''}</option>`).join('');
    $('#chapter').innerHTML = book === 'front' ? `<optgroup label="Front matter">${options}</optgroup>` : options;
  };
  const goChapter = () => { location.hash = `#${index.edition}/${$('#book').value}/${$('#chapter').value}`; };
  const sectionOptions = (book, chapter) => {
    const sections = index.books.find(b => b.n === book)?.chapters.find(c => c.n === chapter)?.sections || [];
    $('#section-nav').hidden = !sections.length;
    $('#section').innerHTML = '<option value="">Chapter start</option>' + sections.map(s => `<option value="${esc(s.n)}">${esc(s.n)}</option>`).join('');
  };

  async function route() {
    const serial = ++request;
    try {
      status('');
      const name = location.hash ? location.hash.slice(1).split('/')[0] : catalog.editions[0].edition;
      if (!catalog.editions.some(e => e.edition === name)) throw new Error('Edition is outside this build');
      if (!index || index.edition !== name) {
        const response = await fetch(`data/${name}/index.json`);
        if (!response.ok) throw new Error('Unable to load edition index');
        const loaded = await response.json();
        if (serial !== request) return;
        index = loaded;
      }
      if (!location.hash || location.hash === `#${name}`) {
        const book = index.books[0], chapter = book.chapters.find(c => !c.context) || book.chapters[0];
        history.replaceState(null, '', `#${name}/${book.n}/${chapter.n}`);
      }
      const target = parseRoute(location.hash, index);
      const response = await fetch(`data/${index.edition}/pages/${target.page}.json`);
      if (!response.ok) throw new Error(`Unable to load page ${target.page}`);
      const page = await response.json();
      if (serial !== request) return;
      currentPage = page;
      $('#wellmann-tools').hidden = !['wellmann', 'paul'].includes(index.edition);
      if (['wellmann', 'paul'].includes(index.edition)) {
        const words = headwords(index);
        $('#headwords').innerHTML = '<option value="">Choose a headword</option>' + words.map(w => `<option value="${esc(w.hash)}">${esc(w.label)}</option>`).join('');
        $('#headwords').value = target.book ? `#${index.edition}/${target.book}/${target.chapter}` : '';
      }
      $('#edition').value = index.edition;
      $('#title').textContent = index.label;
      renderPublicCredits(index);
      $('#book').innerHTML = index.books.map(b => `<option value="${esc(b.n)}">${esc(b.label || b.n)}</option>`).join('');
      $('#text').innerHTML = renderText(page, index);
      $('#text').classList.toggle('paul-text', ['paul', 'aetius'].includes(index.edition));
      $('#parallel-link').hidden = index.edition !== 'wellmann';
      $('#furniture').innerHTML = (page.furniture || []).map(f => `<div>${f.parts.map(p => esc(p.t)).join('')}</div>`).join('');
      $('#furniture').hidden = !$('#show-furniture').checked;
      $('#app').innerHTML = renderApp(page, index);
      $('#sub').textContent = `${page.page_label || `p. ${page.printed_page || page.page}`} · ${page.entries.length} apparatus entries`;
      $('#location').value = `${page.page_label || `p. ${page.page}`}${target.line ? `, l. ${target.line}` : ''}`;
      const chapter = target.chapter ? {book: target.book, n: target.chapter} : page.chapters_on_page.find(c => !c.context) || page.chapters_on_page[0];
      $('#book').value = chapter.book;
      chapterOptions(chapter.book);
      $('#chapter').value = chapter.n;
      sectionOptions(chapter.book, chapter.n);
      $('#section').value = target.section || '';
      const at = index.pages.findIndex(p => p.n === page.page);
      $('#prev').disabled = at === 0;
      $('#next').disabled = at === index.pages.length - 1;
      $('#scan-page').textContent = page.page_label || page.printed_page || page.page;
      $('#scan-open').hidden = !page.scan || page.scan_missing;
      $('#scan-status').textContent = page.scan_missing || !page.scan ? 'Scan unavailable; text and apparatus remain readable.' : 'Click to enlarge.';
      if (page.scan && !page.scan_missing) $('#scan').src = page.scan;
      $('#scan-link').hidden = !page.scan || page.scan_missing;
      $('#scan-link').href = page.scan_link || page.scan || '#';
      if (target.line) {
        const line = [...document.querySelectorAll('.tl')].find(l => l.dataset.line === target.line);
        if (line) { line.classList.add('target'); line.scrollIntoView({block: 'center'}); }
        else status(`Printed line ${target.line} is absent on ${pageLabel(page.page, index)}.`);
      }
    } catch (error) { if (serial === request) status(error.message); }
  }

  function link(element) {
    document.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
    const ids = element.classList.contains('entry') ? [element.dataset.id] : element.dataset.e.split(' ');
    let counterpart;
    document.querySelectorAll('.entry, .lem').forEach(x => {
      const theirs = x.classList.contains('entry') ? [x.dataset.id] : x.dataset.e.split(' ');
      if (ids.some(id => theirs.includes(id))) {
        x.classList.add('on');
        if (!counterpart && x.classList.contains('entry') !== element.classList.contains('entry')) counterpart = x;
      }
    });
    document.querySelectorAll('.tl[data-line-e]').forEach(x => {
      if (ids.some(id => x.dataset.lineE.split(' ').includes(id))) x.classList.add('on');
    });
    // Every matched entry must be visible, also when a lemma has entries in several folded groups.
    document.querySelectorAll('#app .entry.on').forEach(x => x.closest('details.app-group:not([open])')?.setAttribute('open', ''));
    counterpart?.scrollIntoView({block: 'nearest'});
  }
  document.addEventListener('click', async event => {
    const continuation = event.target.closest('a[data-parent]');
    if (continuation) {
      event.preventDefault();
      const parent = document.getElementById(continuation.dataset.parent);
      if (parent) { link(parent); parent.scrollIntoView({block: 'nearest'}); parent.focus(); }
      else {
        try {
          for (const page of index.pages) {
            const response = await fetch(`data/${index.edition}/pages/${page.n}.json`);
            if (!response.ok) continue;
            const payload = await response.json();
            const entry = payload.entries.find(e => e.id === continuation.dataset.parent);
            if (entry) {
              location.hash = `#${index.edition}/p${page.n}`;
              await route();
              const target = document.getElementById(entry.id);
              if (target) { link(target); target.scrollIntoView({block: 'nearest'}); target.focus(); }
              break;
            }
          }
        } catch (error) { status(error.message); }
      }
      return;
    }
    const element = event.target.closest('.entry, .lem');
    if (element) link(element);
  });
  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.entry, .lem')) {
      event.preventDefault(); link(event.target);
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.closest('input, select, textarea, button, [contenteditable]')) return;
    event.preventDefault();
    const at = index?.pages.findIndex(p => p.n === currentPage?.page);
    const next = index?.pages[at + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (next) location.hash = `#${index.edition}/p${next.n}`;
  });
  $('#goto').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const {page, line} = parseLocation($('#location').value, index);
      const hash = `#${index.edition}/p${page}${line ? `/${line}` : ''}`;
      parseRoute(hash, index);
      if (location.hash === hash) route(); else location.hash = hash;
    } catch (error) { status(error.message); }
  });
  $('#headwords').addEventListener('change', () => {
    if ($('#headwords').value) location.hash = $('#headwords').value;
  });
  $('#search').addEventListener('submit', async event => {
    event.preventDefault();
    const serial = ++searchRequest, searching = index;
    $('#search-results').textContent = 'Searching…';
    try {
      const results = await searchPages(searching, $('#query').value, async n => {
        const path = `data/${searching.edition}/pages/${n}.json`;
        if (!pageCache.has(path)) pageCache.set(path, (async () => {
          const response = await fetch(path);
          if (!response.ok) throw new Error('Unable to load search page');
          return response.json();
        })().catch(error => { pageCache.delete(path); throw error; }));
        return pageCache.get(path);
      });
      if (serial !== searchRequest || searching !== index) return;
      $('#search-results').innerHTML = `<li>${results.length} matching lines</li>` + results.map(r => `<li><a href="${esc(r.hash)}">${esc(r.label)}</a></li>`).join('');
    } catch (error) { if (serial === searchRequest) $('#search-results').textContent = error.message; }
  });
  $('#book').addEventListener('change', () => { chapterOptions($('#book').value); goChapter(); });
  $('#chapter').addEventListener('change', goChapter);
  $('#section').addEventListener('change', () => {
    location.hash = `#${index.edition}/${$('#book').value}/${$('#chapter').value}${$('#section').value ? `.${$('#section').value}` : ''}`;
  });
  $('#edition').addEventListener('change', () => {
    const hash = `#${$('#edition').value}`;
    if (location.hash === hash) route(); else location.hash = hash;
  });
  for (const [id, step] of [['prev', -1], ['next', 1]]) {
    $(`#${id}`).addEventListener('click', () => {
      const at = index.pages.findIndex(p => p.n === currentPage.page);
      const next = index.pages[at + step];
      if (next) location.hash = `#${index.edition}/p${next.n}`;
    });
  }
  $('#numerals').addEventListener('change', () => $('#text').classList.toggle('hide-numerals', !$('#numerals').checked));
  $('#show-furniture').addEventListener('change', () => { $('#furniture').hidden = !$('#show-furniture').checked; });
  // Folding an apparatus group is remembered; 'toggle' does not bubble, so listen in the capture phase.
  document.addEventListener('toggle', event => {
    const group = event.target.closest?.('details.app-group');
    if (group !== event.target) return;
    COLLAPSED[group.open ? 'delete' : 'add'](group.dataset.group);
    try { localStorage.setItem('apparatus-collapsed', JSON.stringify([...COLLAPSED])); } catch {}
  }, true);
  $('#theme').addEventListener('change', () => {
    if ($('#theme').value === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = $('#theme').value;
  });
  $('#scan').addEventListener('error', () => { $('#scan-open').hidden = true; $('#scan-status').textContent = 'Scan unavailable.'; });
  $('#scan-open').addEventListener('click', () => { $('#zoom-image').src = $('#scan').src; $('#zoom').showModal(); });
  $('#zoom-close').addEventListener('click', () => $('#zoom').close());
  window.addEventListener('hashchange', () => { if (catalog) route(); });

  (async () => {
    try {
      const response = await fetch('data/index.json');
      if (!response.ok) throw new Error('Unable to load edition index');
      catalog = await response.json();
      $('#edition').innerHTML = catalog.editions.map(e => `<option value="${esc(e.edition)}">${esc(e.label)}</option>`).join('');
      await route();
    } catch (error) { status(error.message); }
  })();
}
