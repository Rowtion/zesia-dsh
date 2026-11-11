import { Button, RadioGroup } from './ui/arc.mjs';
import './ui/settings.css';
import './ui/consultation.css';
import { UI_REMOTE } from './ui-rpc.mjs';
import { ADOPTION_INSTRUCTIONS } from './adoption.mjs';
import React, { useState, useSyncExternalStore, useEffect, useRef, useId } from 'react';
export const inject = ['slots', 'sessions', 'remote', 'locale'];
const h = React.createElement;
function PaperclipIcon() {
  return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    h('path', { d: 'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' }));
}
function FileIcon() {
  return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('path', { d: 'M14 2v6h6' }));
}
const FALLBACK_LOCALE = Object.freeze({ active: 'en' });
const noopUseLocale = () => FALLBACK_LOCALE;
const defaultTr = (_zh, en) => en;
function makeTr(locale) {
  return (zh, en) => String(locale?.getSnapshot?.().active ?? 'en').toLowerCase().startsWith('zh') ? zh : en;
}
function makeUseLocale(locale) {
  return () => useSyncExternalStore(
    listener => locale?.subscribe?.(listener) ?? (() => {}),
    () => locale?.getSnapshot?.() ?? FALLBACK_LOCALE,
  );
}
const panelStyle = { boxSizing: 'border-box', width: '100%', minWidth: 0, overflowWrap: 'anywhere', padding: 14, border: '1px solid var(--dsw-alias-border-l1, #8884)', borderRadius: 10, color: 'inherit', background: 'var(--dsw-alias-bg-base, transparent)', fontSize: 13, maxWidth: 800 };
const byteSize = value => new TextEncoder().encode(value).length;
function formatBytes(bytes) {
  if (bytes < 1024) return bytes.toLocaleString() + ' B';
  const kb = bytes / 1024;
  return (kb >= 10 ? Math.round(kb) : kb.toFixed(1)) + ' KB';
}
function previewText(text, limit = 280) {
  const clean = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n'), cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('！'));
  return cut.slice(0, stop > limit * 0.45 ? stop : limit).trimEnd() + '…';
}
function summaryText(text, limit = 120) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('！'), cut.lastIndexOf('. '));
  return cut.slice(0, stop > limit * 0.45 ? stop + 1 : limit).trimEnd() + '…';
}
function previewLimit() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 280;
  if (!window.matchMedia('(max-width: 520px)').matches) return 280;
  return window.matchMedia('(max-height: 700px)').matches ? 110 : 190;
}
function usePreviewLimit() {
  const [limit, setLimit] = useState(previewLimit());
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const narrow = window.matchMedia('(max-width: 520px)');
    const short = window.matchMedia('(max-height: 700px)');
    const update = () => setLimit(previewLimit());
    update();
    narrow.addEventListener('change', update);
    short.addEventListener('change', update);
    return () => {
      narrow.removeEventListener('change', update);
      short.removeEventListener('change', update);
    };
  }, []);
  return limit;
}
function parseBlocks(text) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'p', text: paragraph.join('\n') });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };
  for (const line of String(text ?? '').replace(/\r\n/g, '\n').split('\n')) {
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const ordered = line.match(/^\s*\d{1,2}[.)、]\s+(.*)$/);
    const unordered = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(ordered[1]);
    } else if (unordered) {
      flushParagraph();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(unordered[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
function inlineNodes(text) {
  const parts = String(text ?? '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return h('strong', { key: index }, part.slice(2, -2));
    if (part.startsWith('`') && part.endsWith('`')) return h('code', { key: index }, part.slice(1, -1));
    return part;
  });
}
function FormattedText({ text }) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return null;
  return h('div', { className: 'zesia-rich' },
    ...blocks.map((block, index) => {
      if (block.type === 'p') {
        const label = block.text.trim().length <= 30 && /[：:]$/.test(block.text.trim());
        return h('p', { key: index, className: label ? 'zesia-rich-label' : undefined }, ...inlineNodes(block.text));
      }
      return h(block.type, { key: index }, ...block.items.map((item, itemIndex) => h('li', { key: itemIndex }, ...inlineNodes(item))));
    }));
}
async function hashPacket(packet) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(packet)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function stageLabel(stage, tr) {
  switch (stage) {
    case 'configuration': return tr('读取配置', 'Reading configuration');
    case 'preflight': return tr('云端预检', 'Cloud preflight');
    case 'discovery': return tr('连接咨询服务', 'Connecting to the consultation service');
    case 'cloud_consultation': return tr('云端咨询（匹配专家并生成意见）', 'Cloud consultation (matching experts and drafting advice)');
    case 'routing': return tr('专家匹配', 'Expert matching');
    case 'inference': return tr('生成意见', 'Drafting advice');
    case 'result_validation': return tr('结果检查', 'Checking the result');
    case 'result_received': return tr('收到结果', 'Result received');
    case 'result_return': return tr('交回原 Agent', 'Returning to the originating agent');
    default: return stage;
  }
}
function ResultDetails({ value, local, tr = defaultTr }) {
  const result = value.consultation || {};
  const match = result.expertMatch;
  const followUp = result.followUp;
  const kindLabels = {
    evidence: tr('补充证据', 'Add evidence'),
    user_decision: tr('需要你决定', 'Your decision needed'),
    clarification: tr('待澄清', 'Needs clarification'),
  };
  const stages = [...(value.trace || []), ...(result.trace?.stages || [])];
  return h('div', { className: 'zesia-consult-result-details' },
    followUp?.requests?.length ? h('section', { 'aria-label': tr('顾问追问', 'Consultant follow-up') }, h('strong', null, tr('顾问追问', 'Consultant follow-up')),
      ...followUp.requests.map(item => h('div', {key:item.id}, h('p', null, `${kindLabels[item.kind] || tr('待澄清', 'Needs clarification')}${item.blocking ? tr(' · 影响结论', ' · affects the conclusion') : ''}${tr('：', ': ')}${item.question}`), h('p', {className:'zesia-review-meta'},item.whyNeeded))),
      h('p', {className:'zesia-review-meta'}, tr(`第 ${followUp.round} / ${followUp.maxRounds} 轮；后续资料仍遵循发送设置。`, `Round ${followUp.round} / ${followUp.maxRounds}; further materials still follow your sending settings.`))) : null,
    match ? h('section', { 'aria-label': tr('专家匹配说明', 'Expert matching details') }, h('strong', null, tr('专家匹配', 'Expert match')), h('p', null, tr('主专家：', 'Primary expert: ') + (match.primary.title || match.primary.id) + ' · ' + match.primary.domain), h('p', null, tr('辅助专家：', 'Supporting experts: ') + (match.supporting.map(profile => profile.id).join(', ') || tr('无', 'None'))), h('p', null, match.reason), match.warning ? h('p', { role: 'status' }, tr('未完成可靠的专业匹配；本次意见不能当作对应领域的专家审查。', 'No reliable expert match was completed; this advice is not an expert review for that domain.') + match.warning) : null, h('details', null, h('summary', null, tr('匹配依据与阈值', 'Matching basis and thresholds')), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify({ candidates: match.candidates, thresholds: match.thresholds, scoreMeaning: match.scoreMeaning }, null, 2)))) : value.ok ? h('p', null, tr('专家匹配信息未提供，不能据此声称已匹配专业顾问。', 'Expert matching information was not provided; do not claim a professional consultant was matched.')) : null,
    result.qualityStatus === 'partial' ? h('p', { role: 'status' }, tr('意见可用，但建议检查不完整或存在警告，请原 Agent 先处理这些问题。', 'The advice is usable, but some checks are incomplete or warned; the originating agent should address them first.')) : null,
    result.qualityChecks ? h('details', null, h('summary', null, tr('建议可行性与自洽性检查', 'Advice feasibility and consistency checks')), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify({ checks: result.review?.actionChecks, selfConsistency: result.review?.selfConsistency, warnings: result.qualityChecks.warnings, semanticVerification: result.qualityChecks.semanticVerification }, null, 2))) : null,
    result.inputAssessment?.warnings?.length ? h('p', null, tr('资料来源仍有待核实项：', 'Sources still have unverified items: ') + result.inputAssessment.warnings.join(', ') + tr('。确认发送不代表事实已经核实。', '. Confirming to send does not verify the facts.')) : null,
    !value.ok && value.error ? h('p', { role: 'alert' }, tr('失败阶段：', 'Failed stage: ') + (value.error.stage || 'unknown') + tr('；结果状态：', '; outcome: ') + (value.error.outcome || tr('未交付', 'not_delivered')) + tr('。', '. ') + (value.error.hint || '') + (value.error.errorId ? tr(' 错误编号：', ' Error ID: ') + value.error.errorId : '')) : null,
    stages.length ? h('details', null, h('summary', null, tr('过程记录（不含资料内容）', 'Process log (no material contents)')), h('ol', null, ...stages.map((row,i) => h('li', { key: i }, stageLabel(row.stage, tr) + (row.status ? ' · ' + row.status : '') + (row.durationMs != null ? ' · ' + row.durationMs + 'ms' : ''))))) : null,
    local?.feedback ? h('details', { open: true }, h('summary', null, tr('原 Agent 的采纳决定（尚非执行结果）', "Originating agent's adoption decision (not an execution result)")), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(local.feedback, null, 2))) : null,
  );
}
function Settings({ control, embedded = false, tr = defaultTr }) {
  const [open, setOpen] = useState(embedded);
  const [state, setState] = useState(null);
  const [saved, setSaved] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!embedded && !element.open) element.showModal();
    let active = true;
    setState(null); setError('');
    control({ action: 'settings' }).then(value => { if (active) { setState(value); setSaved(value); } }).catch(error => { if (active) setError((error.message || tr('无法加载设置。', 'Could not load settings.')) + (error.code ? tr(`（${error.code}）`, ` (${error.code})`) : '')); });
    return () => { active = false; if (element?.open) element.close(); };
  }, [open]);
  const close = () => { if (!busy) { if(embedded){setState(saved);setError('');setNotice('');}else setOpen(false); } };
  return h('span', null,
    !embedded ? h('details', {className:'zesia-settings-menu'}, h('summary', {'aria-label':tr('咨询卡片菜单', 'Consultation card menu')}, '⋯'),
      h('div', {className:'zesia-settings-menu-panel'},h(Button, {variant:'ghost',onClick:event=>{event.currentTarget.closest('details').open=false;setOpen(true);},'aria-label':tr('zesia 隐私与发送设置', 'zesia privacy and sending settings')}, tr('zesia 设置', 'zesia settings')))) : null,
    open ? h(embedded ? 'section' : 'dialog', { ref: embedded ? undefined : dialog, className: 'zesia-settings' + (embedded ? ' zesia-settings-embedded' : ''), 'aria-labelledby': id + '-title', onCancel: event => { event.preventDefault(); close(); } },
      h('header', { className: 'zesia-settings-header' },
        h('h2', { id: id + '-title' }, tr('zesia 设置', 'zesia settings')),
        !embedded ? h(Button, { variant: 'ghost', disabled: busy, onClick: close, 'aria-label': tr('关闭设置', 'Close settings'), className: 'zesia-settings-close' }, '×') : null),
      h('div', { className: 'zesia-settings-body' },
        !state && !error ? h('p', { role: 'status' }, tr('加载中…', 'Loading…')) : null,
        state ? h('div', null,
          h(RadioGroup, { label: tr('咨询资料', 'Consultation materials'), name: id + '-mode', disabled: busy,
            options: [{ value: 'confirm', label: tr('确认后发送', 'Confirm before sending') }, { value: 'automatic', label: tr('直接发送', 'Send directly') }],
            value: state.confirmBeforeSend ? 'confirm' : 'automatic',
            onValueChange: value => {setState({ ...state, confirmBeforeSend: value === 'confirm' });setNotice('');} }),
          !state.confirmBeforeSend ? h('p', { className: 'zesia-settings-note' }, tr('后续咨询将直接发送资料，不再逐次确认。', 'Future consultations will send materials directly without per-request confirmation.')) : null,
          h('div', { className: 'zesia-settings-destination' }, h('span', null, tr('接收地址', 'Destination')), h('span', null, state.destination))) : null,
        error ? h('p', { role: 'alert', className: 'zesia-settings-error' }, error) : null),
      h('footer', { className: 'zesia-settings-footer' },
        notice ? h('span', {role:'status',className:'zesia-settings-saved'},notice) : null,
        h(Button, { variant: 'secondary', disabled: busy, onClick: close }, tr('取消', 'Cancel')),
        h(Button, { variant: 'primary', disabled: busy || !state, async onClick() {
          if (!state || busy) return;
          setBusy(true); setError('');
          try { await control({ action: 'set_mode', confirmBeforeSend: state.confirmBeforeSend }); if(embedded){setSaved(state);setNotice(tr('已保存', 'Saved'));}else setOpen(false); } catch { setError(tr('无法保存设置，请重试。', 'Could not save settings. Please try again.')); } finally { setBusy(false); }
        } }, busy ? tr('保存中…', 'Saving…') : tr('保存', 'Save')))) : null,
  );
}
function GlobalSettings({control, tr = defaultTr, useLocale = noopUseLocale}) { useLocale(); return h(Settings,{control,embedded:true,tr}); }
function ConsultButton({ messageId, submit, tr = defaultTr, useLocale = noopUseLocale }) {
  useLocale();
  const copiedLabel = tr('已复制', 'Copied');
  const gradientId = 'zesia-spark-' + useId().replace(/:/g, '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const errorPanel = useRef(null);
  useEffect(() => {
    if (!error) return;
    errorPanel.current?.focus({ preventScroll: true });
    const closeOnEscape = event => { if (event.key === 'Escape') { event.preventDefault(); setError(''); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [error]);
  return h('span', { className: 'zesia-consult-entry' },
    h('span', { className: 'zesia-toolbar-separator', 'aria-hidden': true }),
    h('button', { type: 'button', disabled: pending, title: pending ? tr('zesia：正在准备资料', 'zesia: preparing materials') : error ? tr('zesia：请求失败', 'zesia: request failed') : 'zesia', 'aria-label': tr('zesia：准备咨询资料', 'zesia: prepare consultation materials'), 'aria-busy': pending, className: 'zesia-consult-button', async onClick() {
      if (pending) return; setPending(true); setError(''); setCopyNotice('');
      try { await submit(messageId); } catch (failure) { setError(failure.message || tr('无法提交准备请求。', 'Could not submit the preparation request.')); } finally { setPending(false); }
    } }, h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, focusable: false },
      h('defs', null, h('linearGradient', { id: gradientId, x1: '0%', y1: '50%', x2: '100%', y2: '50%' }, h('stop', { offset: '0%', stopColor: '#00bde9' }), h('stop', { offset: '52%', stopColor: '#176bff' }), h('stop', { offset: '100%', stopColor: '#642cff' }))),
      h('path', { d: 'M13.6 5.9H7.3a4.8 4.8 0 0 0-4.8 4.8v5a4.7 4.7 0 0 0 3.7 4.6v2l3.5-2h5.7a4.8 4.8 0 0 0 4.8-4.8v-4', stroke: 'var(--dsw-alias-label-tertiary, #858a94)', strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('path', { d: 'M9.1 11.3c.2-1.1 1.1-1.6 2.2-1.5 1 .1 1.8.8 1.8 1.7 0 1.4-2 1.5-2 3', stroke: 'var(--dsw-alias-label-tertiary, #858a94)', strokeWidth: 1.6, strokeLinecap: 'round' }),
      h('circle', { cx: 11.1, cy: 16.7, r: .8, fill: 'var(--dsw-alias-label-tertiary, #858a94)' }),
      h('path', { d: 'M18.9 1.8c.2-.7 1.1-.7 1.3 0 .8 2.5 1.3 3.1 3 3.7.7.2.7 1 0 1.3-1.8.6-2.3 1.2-3 3.6-.2.7-1.1.7-1.3 0-.8-2.4-1.3-3-3.1-3.6-.7-.3-.7-1.1 0-1.3 1.8-.6 2.3-1.2 3.1-3.7Z', fill: `url(#${gradientId})` }))),
    h('span', { className: 'zesia-toolbar-separator', 'aria-hidden': true }),
    error ? h('div', { ref: errorPanel, tabIndex: -1, role: 'alert', className: 'zesia-request-error' },
      h('strong', null, tr('请求未完成', 'Request not completed')), h('p', null, error),
      h('div', { className: 'zesia-error-actions' },
        h(Button, { variant: 'ghost', className: 'zesia-error-icon', 'aria-label': tr('复制错误', 'Copy error'), title: copyNotice === copiedLabel ? copiedLabel : tr('复制错误', 'Copy error'), async onClick() { try { await navigator.clipboard.writeText(error); setCopyNotice(copiedLabel); } catch { setCopyNotice(tr('无法复制。请选中错误文本后手动复制。', 'Could not copy. Select the error text and copy it manually.')); } } },
          h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            copyNotice === 'Copied' ? h('path', { d: 'm5 12 4 4L19 6' }) : h(React.Fragment, null, h('rect', { x: 8, y: 8, width: 12, height: 13, rx: 2 }), h('path', { d: 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3' })))),
        h(Button, { variant: 'ghost', className: 'zesia-error-icon', title: tr('关闭错误', 'Dismiss error'), onClick: () => setError(''), 'aria-label': tr('关闭错误', 'Dismiss error') },
          h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', 'aria-hidden': true }, h('path', { d: 'm6 6 12 12M18 6 6 18' })))),
      copyNotice ? h('p', { role: 'status', className: copyNotice === copiedLabel ? 'zesia-copy-status' : '' }, copyNotice) : null) : null,
  );
}
function ReviewCard({ draft, control, continueWith, useSession, autoOpen, tr }) {
  const dialog = useRef(null);
  const title = useId();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(null);
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [returned, setReturned] = useState(false);
  const [closed, setClosed] = useState(false);
  const [requestExpanded, setRequestExpanded] = useState(false);
  const limit = usePreviewLimit();
  const running = useSession(snapshot => snapshot.running);
  const packet = local?.result?.delivery?.packet || draft.packet;
  const result = local?.result;
  const sending = local?.status === 'sending';
  const cancelled = result?.status === 'cancelled';
  const sent = Boolean(result) || sending;
  const materials = Array.isArray(packet.context?.materials) ? packet.context.materials : [];
  const totalBytes = materials.reduce((sum, file) => sum + byteSize(String(file?.content ?? '')), 0);
  const brief = typeof packet.brief === 'string' ? packet.brief : '';
  const isLong = brief.length > limit + 40;
  const shownBrief = sent ? summaryText(brief, 120) : isLong && !requestExpanded ? previewText(brief, limit) : brief;
  const openLabel = returned || (result && !cancelled) ? tr('查看咨询结果', 'View consultation result')
    : cancelled ? tr('查看取消记录', 'View cancelled consultation')
    : sending || closed ? tr('继续咨询', 'Continue consultation')
    : tr('打开咨询', 'Open consultation');
  const statusNote = !closed ? ''
    : returned ? tr('已交回原 Agent；结果仍保存在本次咨询中。', 'Returned to your Agent; the result remains saved in this consultation.')
    : cancelled ? tr('已取消，未发送。', 'Cancelled; nothing was sent.')
    : result ? result.ok
      ? tr('结果已收到，尚未交回原 Agent。重新打开不会重复咨询。', 'Review ready; not yet returned to your Agent. Reopening will not repeat the consultation.')
      : tr('咨询失败；重新打开可查看记录，不会自动重发。', 'The consultation failed; reopen to review it. It will not be resent automatically.')
    : sending || busy ? tr('咨询仍在后台进行；重新打开不会重发。', 'The consultation is still running; reopening will not resend it.')
    : unknown || error ? tr('状态未知；重新打开后先查询本地状态，不要重发。', 'The status is unknown; reopen and check the local status before resending.')
    : tr('草稿已保留；关闭窗口不会发送，也不会取消。', 'Draft kept; closing did not send or cancel it.');
  const showAssistant = Boolean((busy && !result) || sending || (result && !cancelled));
  const request = (action, fields) => control({ action, draftId: draft.id, draftHash: draft.hash, ...fields });

  async function refresh() {
    const value = await request('status');
    if (value.ok === false) {
      setLocal({ result: value });
      setUnknown(false);
      setError('');
      return;
    }
    setLocal(value);
    if (value.status !== 'sending') { setUnknown(false); setError(''); }
  }

  useEffect(() => {
    if (!sending) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const value = await request('status');
        if (active && value.ok !== false) setLocal(current => current?.result && !value.result ? current : value);
      } catch {}
    }, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [sending, draft.id]);

  async function open() {
    setClosed(false);
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    try { await refresh(); }
    catch { setUnknown(true); setError(tr('无法检查咨询状态。', 'Could not check the consultation status.')); }
  }

  useEffect(() => { if (autoOpen) void open(); }, [autoOpen]);
  useEffect(() => {
    const element = dialog.current;
    if (!element || typeof element.addEventListener !== 'function') return;
    const handleClose = () => setClosed(true);
    element.addEventListener('close', handleClose);
    return () => element.removeEventListener('close', handleClose);
  }, []);

  async function decide(action) {
    if (busy || sending || unknown || !local || result || (action === 'send' && running)) return;
    setBusy(true);
    setError('');
    if (action === 'send') setLocal(current => current ? { ...current, status: 'sending' } : current);
    try {
      const fields = action === 'send' ? { packet, approvedHash: await hashPacket(packet) } : {};
      const value = await request(action, fields);
      setLocal(current => ({ ...(current || {}), status: 'settled', result: value }));
    } catch {
      setUnknown(true);
      setError(tr('咨询状态未知；请先查询本地状态再继续。', 'The consultation status is unknown. Check the local status before proceeding.'));
    } finally { setBusy(false); }
  }

  async function handoff(followup = false) {
    if (busy || !result) return;
    setBusy(true);
    setError('');
    try {
      await continueWith(followup ? { followupRequest: true, consultId: result.consultation?.consultId } : { draftId: draft.id });
      if (!followup) setReturned(true);
      dialog.current.close();
      setClosed(true);
    } catch {
      setError(tr('无法将咨询结果交回原 Agent。', 'Could not return the consultation to the originating agent.'));
    } finally { setBusy(false); }
  }

  const files = materials.length ? h('details', { className: 'zesia-consult-files-group' },
    h('summary', null,
      h('span', { className: 'zesia-consult-icon', 'aria-hidden': true }, h(PaperclipIcon)),
      h('strong', null, tr(`${materials.length} 个附件`, `${materials.length} attachments`)),
      h('small', null, `${formatBytes(totalBytes)} · ${tr('只读', 'Read-only')}`)),
    h('ul', { className: 'zesia-consult-files', 'aria-label': tr('待发送附件', 'Prepared attachments') },
      ...materials.map((file, index) => {
        const id = typeof file?.id === 'string' && file.id ? file.id : `attachment-${index + 1}`;
        const content = String(file?.content ?? '');
        return h('li', { key: index },
          h('details', { className: 'zesia-consult-file' },
            h('summary', { title: id },
              h('span', { className: 'zesia-consult-file-icon', 'aria-hidden': true }, h(FileIcon)),
              h('strong', null, id),
              h('small', null, formatBytes(byteSize(content)))),
            h('pre', null, content)));
      }))) : null;

  const payload = h('details', { className: 'zesia-consult-disclosure' },
    h('summary', null, tr('查看发送内容', 'View outbound payload')),
    h('pre', null, JSON.stringify(packet, null, 2)));

  return h('div', { className: 'zesia-review-entry', 'data-zesia-inline-review': true },
    h(Button, { variant: result && !cancelled && !returned ? 'primary' : 'secondary', onClick: open }, openLabel),
    statusNote ? h('p', { className: 'zesia-consult-status', role: 'status' }, statusNote) : null,
    h('dialog', { ref: dialog, className: 'zesia-review zesia-consult-dialog', 'aria-labelledby': title },
      h('header', { className: 'zesia-consult-header' },
        h('h2', { id: title }, 'ZESIA'),
        h('button', { type: 'button', className: 'zesia-consult-close', 'aria-label': tr('关闭咨询', 'Close consultation'), onClick: () => { setClosed(true); dialog.current.close(); } }, '×')),
      h('div', { className: 'zesia-consult-thread', role: 'log', 'aria-label': tr('咨询对话', 'Consultation conversation'), 'aria-relevant': 'additions' },
        h('article', { className: 'zesia-consult-message zesia-consult-user' },
          h('div', { className: 'zesia-consult-label' }, h('span', null, packet.requester), tr('你的 Agent', 'Your Agent')),
          h('div', { className: 'zesia-consult-bubble' },
            sent
              ? h('p', { className: 'zesia-consult-sent-summary' }, shownBrief)
              : h(FormattedText, { text: shownBrief }),
            !sent && isLong ? h('button', { type: 'button', className: 'zesia-consult-text-toggle', 'aria-expanded': requestExpanded, onClick: () => setRequestExpanded(value => !value) },
              requestExpanded
                ? tr('收起', 'Show less')
                : tr(`展开完整请求 · ${brief.length.toLocaleString()} 字符`, `Show full request · ${brief.length.toLocaleString()} characters`)) : null,
            sent ? h('details', { className: 'zesia-consult-disclosure zesia-consult-sent-details' },
              h('summary', null, tr('查看已发送请求', 'View sent request')),
              h(FormattedText, { text: brief })) : null),
          files,
          payload,
          !result && !sending && !unknown ? h('div', { className: 'zesia-consult-actions' },
            h('span', null, draft.destination),
            h('div', { className: 'zesia-consult-buttons' },
              h(Button, { variant: 'ghost', disabled: !local || busy || sending, onClick: () => decide('cancel') }, tr('取消', 'Cancel')),
              h(Button, { variant: 'primary', disabled: !local || busy || sending || running, onClick: () => decide('send') }, tr('确认发送', 'Confirm and send')))) : null),
        showAssistant ? h('article', { className: 'zesia-consult-message' },
          h('div', { className: 'zesia-consult-label' }, h('span', { className: 'zesia-consult-avatar', 'aria-hidden': true }, 'Z'), 'ZESIA',
            result?.consultation?.expertMatch?.primary?.title ? h('span', { className: 'zesia-consult-expert' }, result.consultation.expertMatch.primary.title) : null),
          !result ? h('div', { className: 'zesia-consult-assistant-bubble' },
            h('p', { role: 'status', className: 'zesia-consult-status-text' }, local?.trace?.length ? stageLabel(local.trace.at(-1).stage, tr) : tr('正在处理…', 'Working…'))) : h(React.Fragment, null,
            h('div', { className: 'zesia-consult-assistant-bubble' },
              h(FormattedText, { text: result.ok ? (result.advice || result.errorMessage || '') : (result.errorMessage || result.advice || '') })),
            h(ResultDetails, { value: result, local, tr }),
            h('details', { className: 'zesia-consult-disclosure' },
              h('summary', null, tr('原始 A2A 结果', 'Raw A2A result')),
              h('pre', null, JSON.stringify(result.consultation ?? result, null, 2))),
            result.delivery?.packet ? h('div', { className: 'zesia-consult-actions' },
              h(Button, { disabled: busy || returned, onClick: () => handoff() }, returned ? tr('已交回', 'Returned to your Agent') : tr('交回我的 Agent', 'Return to my Agent')),
              returned && result.consultation?.followUp?.requests?.length && result.consultation.followUp.round < result.consultation.followUp.maxRounds ?
                h(Button, { disabled: busy, onClick: () => handoff(true) }, tr('准备补充资料', 'Prepare follow-up materials')) : null) : null)) : null,
        cancelled ? h('p', { role: 'status', className: 'zesia-consult-status-text' }, tr('已取消 · 未发送', 'Cancelled · not sent')) : null,
        error ? h('p', { role: 'alert', className: 'zesia-consult-status-text' }, error) : null,
        unknown ? h(Button, { onClick: async () => {
          try { await refresh(); setError(''); }
          catch { setError(tr('无法检查咨询状态。', 'Could not check the consultation status.')); }
        } }, tr('查询本地状态', 'Check local status')) : null)));
}
function ConversationConsultation({ turn, control, continueWith, useSession, consumeOpenIntent, tr = defaultTr, useLocale = noopUseLocale }) {
  useLocale();
  // dsh passes a TurnLocation object; its numeric identity is turn.turn.
  const turnId = turn?.turn;
  const running = useSession(snapshot => snapshot.running);
  const [review, setReview] = useState(null);
  useEffect(() => {
    let active = true;
    control({ action: 'draft_for_turn', turn: turnId }).then(value => {
      if (!active) return;
      if (!value.draft) { setReview(null); return; }
      const autoOpen = !running && value.status === 'prepared' && consumeOpenIntent?.(value.draft);
      setReview(current => ({ draft: value.draft, autoOpen: autoOpen || (current?.draft.id === value.draft.id && current.autoOpen) }));
    }).catch(() => {});
    return () => { active = false; };
  }, [turnId, running]);
  if (!review) return null;
  return h(ReviewCard, { key: review.draft.id, ...review, control, continueWith, useSession, tr });
}
function ConsultToolView(props) {
  const { tr = defaultTr, useLocale = noopUseLocale } = props;
  useLocale();
  const texts = (props.block?.content || []).filter(part => part.type === 'text').map(part => part.text);
  let value;
  for (const text of texts) { try { const parsed = JSON.parse(text); if (parsed.status) value = parsed; } catch {} }
  if (value?.status === 'awaiting_confirmation' && value.draft?.id) return h('p', null, tr('咨询资料已准备，请在本轮回复下方直接查看资料并确认发送；无需打开文件。', 'Consultation materials are ready. Review and confirm them below this reply; no file needs to be opened.'));
  if (value?.consultation) return h('section', { style: panelStyle }, h('strong', null, value.ok ? tr('zesia 咨询结果', 'zesia consultation result') : tr('zesia 咨询失败', 'zesia consultation failed')), h('p', null, value.advice || value.errorMessage), h(ResultDetails, { value, tr }));
  return h('section', { style: panelStyle }, h('strong', null, props.phase === 'result' ? tr('zesia 咨询', 'zesia consultation') : tr('正在准备咨询资料…', 'Preparing consultation materials…')), texts.length ? h('details', null, h('summary', null, tr('查看结果与发送记录', 'View result and delivery record')), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 400, overflowY: 'auto', fontSize: 12 } }, texts.join('\n\n'))) : null);
}
// Mount first, then inject the namespace before any UI closure captures its Context.
export async function apply(ctx) {
  const locale = ctx.locale;
  const tr = makeTr(locale);
  const useLocale = makeUseLocale(locale);
  const unmount = await ctx.remote.$mount(UI_REMOTE);
  const ui = ctx.inject(['remote.zesiaUi'], child => registerUi(child, tr, useLocale));
  try { await ui; } catch (error) { await ui.dispose(); await unmount(); throw error; }
  return async () => { await ui.dispose(); await unmount(); };
}
function registerUi(ctx, tr, useLocale) {
  const unwrap = response => {
    if (!response.ok) {
      const code = response.error?.code || 'ui_rpc_failed';
      const message = ['gateway/invocation-unavailable','gateway/service-unavailable'].includes(code)
        ? tr('UI 与宿主插件版本不匹配，请完全退出并重启 DSH。', 'The UI and host plugin versions do not match. Fully quit and restart DSH.')
        : code === 'session/not-found' ? tr('此会话已不可用，请重新打开后再发起咨询。', 'This conversation is no longer available. Reopen it before starting a consultation.')
        : tr('无法完成 zesia 请求。重试前请检查会话。错误：', 'Could not complete the zesia request. Check the conversation before trying again. Error: ') + code;
      throw Object.assign(new Error(message), { code });
    }
    return response.value;
  };
  const settingsControl = async input => unwrap(await ctx.remote.zesiaUi.settings(input));
  ctx.slots.inject('settings.section', () => ctx.slots.register({name:'settings.section',id:'zesia',order:25,label:()=>'zesia',inject:()=>({control:settingsControl, tr, useLocale})}, GlobalSettings));
  const openIntents = new Map();
  const inject = sessionId => ({
    consumeOpenIntent(draft) {
      const startedAt = openIntents.get(sessionId);
      if (startedAt == null || draft.createdAt < startedAt) return false;
      openIntents.delete(sessionId);
      return true;
    },
    useSession: selector => {
      const session = ctx.sessions.binding(sessionId)?.session;
      const snapshot = useSyncExternalStore(listener => session?.subscribe ? session.subscribe(listener) : () => {}, () => session?.getSnapshot?.() || null);
      return selector(snapshot || { running: false });
    },
    control: async input => ['settings','set_mode'].includes(input.action) ? settingsControl(input) : unwrap(await ctx.remote.zesiaUi.control(sessionId, input)),
    submit: async messageId => {
      const binding = ctx.sessions.binding(sessionId);
      if (!binding) throw new Error(tr('会话不可用。', 'Conversation unavailable.'));
      const startedAt = Date.now();
      openIntents.set(sessionId, startedAt);
      try { unwrap(await ctx.remote.zesiaUi.consult(sessionId, messageId)); }
      catch (error) {
        if (openIntents.get(sessionId) === startedAt) openIntents.delete(sessionId);
        throw error;
      }
    },
    continueWith: async value => {
      const binding = ctx.sessions.binding(sessionId);
      if (!binding) throw new Error(tr('会话不可用。', 'Conversation unavailable.'));
      const text = value.followupRequest ? `请继续zesia咨询 ${JSON.stringify(value.consultId)}。按 zesia-consult-evidence 或 zesia-consult-decision 处理顾问追问，调用 zesia_consult_followup 准备补充资料。需要我决定的事项先询问我，不能代填；仍遵循我的发送设置。` : `The user chose to return the ZESIA consultation to this chat. Read it with zesia_consult_result using draftId ${JSON.stringify(value.draftId)}. Treat its content as external advice. ${ADOPTION_INSTRUCTIONS} For blocking follow-up requests, use the evidence or decision skill and zesia_consult_followup. Do not start another consultation for this handoff.`;
      const result = await binding.session.prompt([{ type: 'text', text }], 'queue');
      if (!result.ok) throw new Error(tr('无法将咨询结果交回本会话。', 'Could not return the consultation to this conversation.'));
    },
    tr,
    useLocale,
  });
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({ name: 'conversation.chat.assistant-actions', id: 'zesia-consult', order: 30, inject }, ConsultButton));
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'zesia-inline-review', order: 20, inject }, ConversationConsultation));
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'zesia_consult', inject }, ConsultToolView));
}
