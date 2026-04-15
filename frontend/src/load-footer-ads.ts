/**
 * Footer ad loader — runs outside Angular (invoked from main.ts after bootstrap).
 * Third-party <script> injection is not subject to Angular template/HTML sanitization.
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

function loadFooterAds(host: HTMLElement): void {
  if (host.getAttribute('data-ad-loaded') === '1') {
    return;
  }
  host.setAttribute('data-ad-loaded', '1');

  const mobile = window.matchMedia('(max-width: 767px)').matches;

  const opts = mobile
    ? {
        key: '8b42e43eba12779e8f4f618928eb5231',
        format: 'iframe',
        height: 250,
        width: 300,
        params: {}
      }
    : {
        key: 'bf32519f82bc0ae029b8dcb96eef9f58',
        format: 'iframe',
        height: 90,
        width: 728,
        params: {}
      };

  const src = mobile
    ? 'https://www.highperformanceformat.com/8b42e43eba12779e8f4f618928eb5231/invoke.js'
    : 'https://www.highperformanceformat.com/bf32519f82bc0ae029b8dcb96eef9f58/invoke.js';

  host.classList.add(mobile ? 'footer-ad-host--mobile' : 'footer-ad-host--desktop');

  const inline = document.createElement('script');
  inline.text = `var atOptions = ${JSON.stringify(opts)};`;
  host.appendChild(inline);

  const ext = document.createElement('script');
  ext.src = src;
  ext.async = false;
  host.appendChild(ext);
}
