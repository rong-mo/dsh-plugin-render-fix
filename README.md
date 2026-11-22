# 插件渲染修复 · Plugins render fix

**中文**：修复 DSH 侧边栏「插件」页的渲染崩溃。旧版 Android WebView（Chrome 116）缺少 `URL.canParse`，内置 Markdown 渲染器在渲染文档链接时抛 `TypeError`，插槽条目被错误边界**永久停用（abdicate）**，内容区变成零尺寸死格、一直空白直到刷新页面。本插件在客户端启动时安装标准 polyfill，并在崩溃时用恢复卡片兜底、把原始错误写入日志。

**English**: Repairs the sidebar Plugins page render crash. Android System WebView 116 lacks `URL.canParse`; the bundled Markdown renderer throws while resolving document links, the slot entry is **abdicated** by the renderer's error boundary, and the content area stays a zero-size dead cell until the page is reloaded. This plugin installs the standard polyfill at client-module evaluation and falls back to a recovery card, logging the original error.

## 为什么需要它 · Why

- 官方页面在 `main` 槽注册 `key=plugins / priority=0`；渲染抛错后条目被永久跳过，布局却仍选中该面板。
- 插件以 `priority=1` 注册同一 key：官方页面健康时完全不可见，条目被 abdicate 后才显示恢复卡片（重新加载界面 / 返回对话 / 查看错误详情）。
- 另有一个 `[data-plugin-body]` 看门狗，修复「列表刷新后既无头部也无卡片」的无崩溃空白变体。
- 根因修复仍需上游：本插件是客户端兜底，不修改官方包。

## Root cause found (2026-11-22)

The recorded crash was:

```
TypeError: URL.canParse is not a function
  at P4 (assets/index-BgUyXZcc.js:17031)
  ... Markdown link resolver -> mdast renderer ...
```

The bundled Markdown renderer calls the static `URL.canParse` (and some paths
`URL.parse`), which Android System WebView **116** does not implement (they
arrived in Chrome 120/126). Rendering a Markdown link then throws, the
Plugins page entry is abdicated, and the panel goes permanently blank.

The client half installs the standard polyfills at module evaluation, before
any lazy Markdown render:

```js
if (typeof URL.canParse !== 'function') URL.canParse = (input, base) => {
  try { new URL(input, base); return true; } catch { return false; }
};
```

`guard-loaded` log lines report `polyfilledCanParse` and `canParse` so the fix
is observable. On WebViews that already have the API it is a no-op.

## Verification

- A real page loaded this bundle and wrote `{"kind":"guard-loaded"}` to the Host log.
- The client Slots inspector showed the registration `main / key=plugins /
  priority=1 / active=false` while the official priority-0 entry was healthy:
  the fix is registered and correctly shadowed.
- `?renderFixSelfTest=1` opts into a self-test that reports a simulated abdication
  of the official entry through the same `reportEntryError(..., {abdicate:true})`
  path the renderer uses. In the instrumented clone the recovery card then
  rendered with "插件面板需要重新加载", the crash was written to the Host log,
  and the probe observed `[data-render-fix-panel]` in the DOM.

## Crash log

`~/.dsh/plugin-render-fix.ndjson` — one JSON line per load, crashed entry,
and watchdog heal. Lines with `"kind":"slot-crash"` carry the original
`name`, `message`, and first stack lines; those are the lines to attach to an
upstream issue.
