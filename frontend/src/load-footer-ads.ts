/**
 * Footer ad loader — runs outside Angular (see main.ts).
 * Measures the card inner width so atOptions matches the fluid column (fixes mobile overflow).
 */
export function loadFooterAdsWhenReady(): void {
  const maxAttempts = 60;
  let attempts = 0;

  const tryRun = (): void => {
    const host = document.getElementById('ptpchat-ad-host');
    if (host) {
      loadFooterAds(host);
      return;
    }
    attempts += 1;
    if (attempts < maxAttempts) {
      setTimeout(tryRun, 16);
    }
  };

  queueMicrotask(tryRun);
}

function innerWidthOfCard(host: HTMLElement): number {
  const card = host.parentElement;
  if (!card) {
    return Math.max(200, window.innerWidth - 48);
  }
  const cs = getComputedStyle(card);
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  return Math.max(200, Math.floor(card.clientWidth - pl - pr));
}

function loadFooterAds(host: HTMLElement): void {
  if (host.getAttribute('data-ad-loaded') === '1') {
    return;
  }

  const run = (): void => {
    const innerW = innerWidthOfCard(host);
    const mobile = window.matchMedia('(max-width: 767px)').matches;

    host.setAttribute('data-ad-loaded', '1');

    let opts: { key: string; format: string; width: number; height: number; params: Record<string, unknown> };
    let src: string;

    if (mobile) {
      const w = Math.min(300, innerW);
      const h = Math.max(160, Math.round((w * 250) / 300));
      opts = {
        key: '8b42e43eba12779e8f4f618928eb5231',
        format: 'iframe',
        width: w,
        height: h,
        params: {}
      };
      src = 'https://www.highperformanceformat.com/8b42e43eba12779e8f4f618928eb5231/invoke.js';
      host.classList.add('footer-ad-host--mobile');
    } else {
      const w = Math.min(728, Math.max(320, innerW));
      const h = 90;
      opts = {
        key: 'bf32519f82bc0ae029b8dcb96eef9f58',
        format: 'iframe',
        width: w,
        height: h,
        params: {}
      };
      src = 'https://www.highperformanceformat.com/bf32519f82bc0ae029b8dcb96eef9f58/invoke.js';
      host.classList.add('footer-ad-host--desktop');
    }

    const inline = document.createElement('script');
    inline.text = `var atOptions = ${JSON.stringify(opts)};`;
    host.appendChild(inline);

    const ext = document.createElement('script');
    ext.src = src;
    ext.async = false;
    host.appendChild(ext);
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}
