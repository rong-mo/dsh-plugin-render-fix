/**
 * Browser half of dsh-plugin-render-fix.
 *
 * The sidebar Plugins page is one ``main`` slot entry (key ``plugins``,
 * priority 0). The client renderer catches any render/lifecycle throw in it,
 * logs ``slot entry crashed in 'main'``, and *abdicates* the entry: the slot
 * ledger keeps the registration but never renders it again, and the layout
 * keeps the panel selected — the content area is a zero-size dead cell until
 * the page is reloaded. This bundle registers a priority-1 survivor for the
 * same key, so after such a crash the cell falls back to a visible recovery
 * card instead of a permanent blank. It also forwards the original error to
 * the Host half's ``/plugin-render-fix/log`` route, because that text is
 * otherwise only visible in the (unreadable on mobile) WebView console.
 *
 * The second, crash-free blank mode (an open package/item disappears from a
 * refreshed list, leaving no header and no list) is healed by a small
 * ``[data-plugin-body]`` watchdog that re-selects the panel.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-render-fix',
  factory(require) {
    /* Mobile WebView compat: the bundled Markdown renderer calls the static
       URL.canParse (and some paths URL.parse), which Android System WebView
       116 lacks. The resulting TypeError is what abdicates the Plugins page
       (`markdown link resolver -> URL.canParse`). Define the standard polyfill
       as early as this module is evaluated, before any lazy Markdown render. */
    const hadCanParse = typeof URL.canParse === 'function';
    try {
      if (typeof URL.canParse !== 'function') {
        const canParse = function canParse(input, base) {
          try {
            new URL(input, base);
            return true;
          } catch (error) {
            return false;
          }
        };
        try {
          Object.defineProperty(URL, 'canParse', { configurable: true, writable: true, value: canParse });
        } catch (error) {
          URL.canParse = canParse;
        }
      }
    } catch (error) { /* leave the platform untouched if URL is frozen */ }
    try {
      if (typeof URL.parse !== 'function') {
        const parse = function parse(input, base) {
          try {
            return new URL(input, base);
          } catch (error) {
            return null;
          }
        };
        try {
          Object.defineProperty(URL, 'parse', { configurable: true, writable: true, value: parse });
        } catch (error) {
          URL.parse = parse;
        }
      }
    } catch (error) { /* ignore */ }
    const React = require('react');
    const h = React.createElement;

    const NS = 'pluginRenderFix';
    const PANEL_KEY = 'plugins';
    const LOG_URL = 'plugin-render-fix/log';
    const MAX_TEXT = 4000;

    const zh = {
      title: '插件面板需要重新加载',
      body: '插件页面在渲染时出错，已被上游停用，以免影响其他界面。重新加载界面即可恢复；本次错误已记录，可反馈给插件作者。',
      notReadyTitle: '插件页面当前不可用',
      notReadyBody: '插件页面没有可显示的注册。重新加载界面通常会恢复。',
      reload: '重新加载界面',
      back: '返回对话',
      detail: '错误详情',
      noDetail: '没有记录到错误。',
    };
    const en = {
      title: 'The Plugins panel needs a reload',
      body: 'The Plugins page threw while rendering, so upstream retired it to protect the rest of the shell. Reload the page to restore it. The error was recorded for the plugin author.',
      notReadyTitle: 'The Plugins page is unavailable',
      notReadyBody: 'No usable registration is mounted for the Plugins page. Reloading the page usually restores it.',
      reload: 'Reload the interface',
      back: 'Back to conversation',
      detail: 'Error details',
      noDetail: 'No error was recorded.',
    };

    let lastCrash = null;

    function cut(value, limit) {
      try {
        const text = typeof value === 'string' ? value : String(value);
        return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
      } catch (error) {
        return '[unserializable]';
      }
    }

    function describeError(error) {
      try {
        if (error && typeof error === 'object') {
          const name = typeof error.name === 'string' ? error.name : 'Error';
          const message = typeof error.message === 'string' ? error.message : String(error);
          const stack = typeof error.stack === 'string' ? error.stack.split('\n').slice(0, 12).join('\n') : '';
          return { name, message: cut(message, MAX_TEXT), stack: cut(stack, MAX_TEXT) };
        }
        return { name: 'Error', message: cut(error, MAX_TEXT), stack: '' };
      } catch (inner) {
        return { name: 'Error', message: '[unserializable]', stack: '' };
      }
    }

    /** Forward one diagnostic line to the Host half; failures are irrelevant. */
    function report(payload) {
      try {
        const body = JSON.stringify(Object.assign({ at: Date.now(), href: cut(String(location.href || ''), 500) }, payload));
        try {
          fetch(LOG_URL, { method: 'POST', mode: 'no-cors', body });
        } catch (error) {
          try {
            const image = new Image();
            image.src = LOG_URL + '?d=' + encodeURIComponent(body);
          } catch (inner) { /* ignore */ }
        }
      } catch (error) { /* ignore */ }
    }

    function buttonStyle(primary) {
      return {
        appearance: 'none',
        border: primary ? 'none' : '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '8px',
        padding: '8px 14px',
        fontSize: '13px',
        lineHeight: '20px',
        cursor: 'pointer',
        color: primary ? '#fff' : 'var(--dsw-alias-label-primary)',
        background: primary ? 'var(--dsw-alias-state-business-primary, #4d6bfe)' : 'transparent',
      };
    }

    function RecoveryPanel(props) {
      const t = props && typeof props.t === 'function' ? props.t : (key) => key;
      const crash = props && typeof props.crash === 'function' ? props.crash() : null;
      const detail = crash && crash.error ? crash.error : null;
      const title = crash === null ? t('notReadyTitle') : t('title');
      const body = crash === null ? t('notReadyBody') : t('body');
      return h('section', {
        'data-render-fix-panel': true,
        style: {
          boxSizing: 'border-box',
          width: '100%',
          height: '100%',
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          color: 'var(--dsw-alias-label-primary)',
          background: 'var(--dsw-alias-bg-base)',
          overflow: 'auto',
        },
      }, h('div', {
        style: {
          width: '100%',
          maxWidth: '560px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '20px',
          border: '1px solid var(--dsw-alias-border-l2)',
          borderRadius: '14px',
          background: 'var(--dsw-alias-bg-l1, transparent)',
        },
      }, [
        h('h2', { key: 'title', style: { margin: 0, fontSize: '18px', fontWeight: 600 } }, title),
        h('p', { key: 'body', style: { margin: 0, fontSize: '13px', lineHeight: '21px', color: 'var(--dsw-alias-label-secondary)' } }, body),
        h('div', { key: 'actions', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' } }, [
          h('button', {
            key: 'reload',
            type: 'button',
            style: buttonStyle(true),
            onClick: () => props.reload && props.reload(),
          }, t('reload')),
          h('button', {
            key: 'back',
            type: 'button',
            style: buttonStyle(false),
            onClick: () => props.back && props.back(),
          }, t('back')),
        ]),
        h('details', { key: 'details', style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' } }, [
          h('summary', { key: 'summary', style: { cursor: 'pointer' } }, t('detail')),
          h('pre', {
            key: 'pre',
            style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '8px 0 0', maxHeight: '260px', overflow: 'auto' },
          }, detail === null ? t('noDetail') : `${detail.name}: ${detail.message}\n${detail.stack}`),
        ]),
      ]));
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`);

      try {
        ctx.effect(() => {
          let off;
          try {
            off = ctx.slots.onEntryError((slotKey, entry, error, info) => {
              try {
                const options = entry && entry.options ? entry.options : {};
                if (slotKey !== 'main' || options.key !== PANEL_KEY) return;
                const described = describeError(error);
                lastCrash = {
                  slot: String(slotKey),
                  priority: options.priority === undefined ? 0 : options.priority,
                  error: described,
                  abdicated: !!(info && info.abdicated),
                };
                report({ kind: 'slot-crash', slot: lastCrash.slot, priority: lastCrash.priority, abdicated: lastCrash.abdicated, error: described });
                try { console.error('[plugin-render-fix] Plugins page crashed:', described.name + ': ' + described.message); } catch (inner) { /* ignore */ }
              } catch (inner) { /* never break the reporter */ }
            });
          } catch (error) {
            report({ kind: 'hook-unavailable', error: describeError(error) });
          }
          return () => {
            try { if (typeof off === 'function') off(); } catch (error) { /* ignore */ }
          };
        }, `${NS}: entry error hook`);
      } catch (error) {
        report({ kind: 'effect-unavailable', error: describeError(error) });
      }

      /* Priority 1: the official entry (priority 0) wins while it is live; this
         one only renders after the official entry has been abdicated. */
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_KEY,
        priority: 1,
        locale: NS,
        inject: () => ({
          t,
          crash: () => lastCrash,
          reload: () => {
            try { location.reload(); } catch (error) { /* ignore */ }
          },
          back: () => {
            try { ctx.layout.selectPanel(null); } catch (error) { /* ignore */ }
          },
        }),
      }, RecoveryPanel));

      /* Crash-free blank mode: an open package/item vanished from refreshed
         data, so the page renders neither cards nor a header. Re-select the
         panel; the official plugin's panelInfo subscription resets its view. */
      try {
        ctx.effect(() => {
          let beats = 0;
          let heals = 0;
          const timer = setInterval(() => {
            try {
              const active = ctx.layout.panelInfo.getSnapshot().activePanelId;
              if (active !== PANEL_KEY) { beats = 0; return; }
              const panel = document.querySelector('[data-plugin-panel]');
              if (panel === null) { beats = 0; return; }
              const body = document.querySelector('[data-plugin-body]');
              const children = body === null ? -1 : body.children.length;
              if (children === 0) beats += 1; else beats = 0;
              if (beats < 2) return;
              beats = 0;
              if (heals >= 3) return;
              heals += 1;
              report({ kind: 'watchdog-heal', attempt: heals });
              ctx.layout.selectPanel(null);
              setTimeout(() => {
                try { ctx.layout.selectPanel(PANEL_KEY); } catch (error) { /* ignore */ }
              }, 80);
            } catch (error) { /* one bad beat must not kill the interval */ }
          }, 2000);
          return () => clearInterval(timer);
        }, `${NS}: empty page watchdog`);
      } catch (error) {
        report({ kind: 'watchdog-unavailable', error: describeError(error) });
      }

      /* Explicit, opt-in self test (`?renderFixSelfTest=1`): abdicate the official
         priority-0 entry the same way the renderer does on a real crash, so the
         fallback card can be verified end to end without waiting for the bug. */
      try {
        if (/[?&]renderFixSelfTest=1(?:&|$)/.test(String(location.search || ''))) {
          setTimeout(() => {
            try {
              const entries = ctx.slots.entries('main');
              const official = entries.find((entry) => entry && entry.options && entry.options.key === PANEL_KEY && (entry.options.priority ?? 0) === 0);
              const core = ctx.slots && ctx.slots._core;
              if (official === undefined || core === undefined || typeof core.reportEntryError !== 'function') {
                report({ kind: 'self-test-unavailable', hasEntry: official !== undefined, hasCore: core !== undefined });
                return;
              }
              const error = new Error('guard self-test: simulated render crash');
              error.name = 'GuardSelfTest';
              core.reportEntryError('main', official, error, { abdicate: true });
              report({ kind: 'self-test-abdicated' });
            } catch (error) {
              report({ kind: 'self-test-failed', error: describeError(error) });
            }
          }, 5000);
        }
      } catch (error) {
        report({ kind: 'self-test-hook-failed', error: describeError(error) });
      }

      report({ kind: 'guard-loaded', polyfilledCanParse: !hadCanParse, canParse: typeof URL.canParse === 'function' });
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply,
    };
  },
});
