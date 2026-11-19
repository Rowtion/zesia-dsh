import React, { useEffect, useState } from 'react';
import { Button } from './arc.mjs';
const h = React.createElement;

// The shared page owns the entire tutorial. Only show host UI if opening it fails.
export function FirstUseGuide({ onboarding, tr, useLocale }) {
  useLocale();
  const [fallback, setFallback] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, scheduled;
    function whenInteractive() {
      if (document.visibilityState === 'hidden') return;
      const modals = document.querySelectorAll('dialog[open], [aria-modal="true"]');
      if (Array.from(modals).some(el => el.getClientRects().length > 0)) return;
      observer.disconnect();
      document.removeEventListener('visibilitychange', whenInteractive);
      cancelAnimationFrame(scheduled);
      onboarding('open').then(result => {
        if (active) setFallback(result.state === 'link' ? result : null);
      }).catch(() => { if (active) setFallback({ state: 'error' }); });
    }
    const observer = new MutationObserver(whenInteractive);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['open', 'aria-modal', 'hidden'] });
    document.addEventListener('visibilitychange', whenInteractive);
    scheduled = requestAnimationFrame(whenInteractive);
    return () => {
      active = false;
      cancelAnimationFrame(scheduled);
      observer.disconnect();
      document.removeEventListener('visibilitychange', whenInteractive);
    };
  }, [onboarding, attempt]);

  if (!fallback) return null;
  return h('aside', { className: 'zesia-settings zesia-guide-fallback', 'aria-label': tr('Zesia 使用引导', 'Zesia guide') },
    h('p', { role: 'status' }, tr('请在浏览器中打开 Zesia 使用引导。', 'Open the Zesia guide in your browser.')),
    fallback.url
      ? h('a', { href: fallback.url, target: '_blank', rel: 'noreferrer', onClick: () => setFallback(null) }, tr('打开引导', 'Open guide'))
      : h(Button, { onClick: () => { setFallback(null); setAttempt(n => n + 1); } }, tr('重试', 'Retry')),
    h(Button, { variant: 'ghost', onClick: () => { setFallback(null); void onboarding('dismiss').catch(() => {}); } }, tr('关闭', 'Dismiss')));
}
