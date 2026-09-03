// dsh-usage-panel · browser half (client plugin for the DSH web UI).
//
// Self-registering classic-script bundle consumed by the page's module loader:
//   window.__ModuleLoader__.load({ id, factory(require) { … } })
// and exports a Cordis v4 plugin module { name, inject, apply(ctx) }.
//
// UI: a floating macOS-style frosted-glass usage panel (中文界面).
//   · collapsed: compact pill (余额 / 今日 / 会话 + 状态点)
//   · click pill → glass window: stat tiles, balance card, smooth 24 h token
//     curve (输入/输出), per-model bars, footer with refresh + DeepSeek link
//   · draggable via pointer capture; position persisted in localStorage.
//   · glass preset: translucent base + backdrop blur(10px), light/dark aware.
//
// Data: same-origin JSON routes served by the host half (index.js):
//   GET  /dsh-usage/api/snapshot  → { ok, value: Snapshot }
//   POST /dsh-usage/api/refresh   → force a balance poll, returns Snapshot
// The API key never leaves the host.
window.__ModuleLoader__.load({
  id: "dsh-usage-panel",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var h = react.createElement;
    var useState = react.useState;
    var useEffect = react.useEffect;
    var useRef = react.useRef;
    var useCallback = react.useCallback;

    // ------------------------------------------------------------------ css
    var UH_CSS = [
      ".up-root{position:absolute;z-index:2;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif}",
      ".up-root,.up-root *{box-sizing:border-box}",
      "body[data-ds-dark-theme]{--up-win:rgba(11,11,16,.25);--up-win2:rgba(20,20,28,.34);--up-brd:rgba(255,255,255,.14);--up-brds:rgba(255,255,255,.08);--up-hi:rgba(255,255,255,.16);--up-txt:rgba(255,255,255,.94);--up-dim:rgba(255,255,255,.58);--up-faint:rgba(255,255,255,.4);--up-card:rgba(255,255,255,.055);--up-cardh:rgba(255,255,255,.1);--up-grid:rgba(255,255,255,.09);--up-sh:0 16px 50px rgba(0,0,0,.42),0 2px 10px rgba(0,0,0,.3);--up-redglow:rgba(255,69,58,.32);--up-blur:10px}",
      "body:not([data-ds-dark-theme]){--up-win:rgba(255,255,255,.3);--up-win2:rgba(255,255,255,.42);--up-brd:rgba(0,0,0,.12);--up-brds:rgba(0,0,0,.06);--up-hi:rgba(255,255,255,.9);--up-txt:rgba(18,18,26,.92);--up-dim:rgba(18,18,26,.55);--up-faint:rgba(18,18,26,.38);--up-card:rgba(18,18,26,.045);--up-cardh:rgba(18,18,26,.09);--up-grid:rgba(18,18,26,.08);--up-sh:0 16px 60px rgba(30,30,60,.2),0 2px 10px rgba(30,30,60,.1);--up-redglow:rgba(255,69,58,.24);--up-blur:10px}",
      ".up-hoverable{transition:transform .16s ease,background .16s ease,box-shadow .16s ease}",
      ".up-pill{display:flex;align-items:center;gap:9px;padding:7px 13px 7px 8px;border-radius:999px;background:var(--up-win);border:1px solid var(--up-brd);box-shadow:var(--up-sh);backdrop-filter:blur(var(--up-blur)) saturate(150%);-webkit-backdrop-filter:blur(var(--up-blur)) saturate(150%);cursor:pointer;user-select:none;white-space:nowrap;touch-action:none;transition:background .18s ease,transform .18s ease,box-shadow .18s ease}",
      ".up-pill:hover{background:var(--up-win2);transform:translateY(-1px)}",
      ".up-pill:active{transform:scale(.97)}",
      ".up-ic{width:24px;height:24px;border-radius:50%;flex:none;display:grid;place-items:center;background:rgba(77,107,254,.14);color:#4d6bfe;box-shadow:inset 0 0 0 1px rgba(77,107,254,.18)}",
      ".up-ic svg{width:15px;height:15px;display:block}",
      ".up-cols{display:flex;align-items:baseline;gap:11px}",
      ".up-col{display:flex;flex-direction:column;gap:0}",
      ".up-col+.up-col{border-left:1px solid var(--up-brds);padding-left:11px}",
      ".up-k{font-size:9.5px;letter-spacing:.06em;color:var(--up-faint)}",
      ".up-v{font-size:12.5px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.35;color:var(--up-txt)}",
      ".up-dot{width:7px;height:7px;border-radius:50%;flex:none;transition:background .2s ease,box-shadow .2s ease}",
      ".up-dot.ok{background:#30d158;box-shadow:0 0 0 3px rgba(48,209,88,.18)}",
      ".up-dot.bad{background:#ff453a;box-shadow:0 0 0 3px var(--up-redglow)}",
      ".up-dot.unknown{background:#ffd60a;box-shadow:0 0 0 3px rgba(255,214,10,.16)}",
      ".up-win{width:468px;max-width:calc(100vw - 20px);border-radius:14px;overflow:hidden;background:var(--up-win);border:1px solid var(--up-brd);box-shadow:var(--up-sh);backdrop-filter:blur(var(--up-blur)) saturate(160%);-webkit-backdrop-filter:blur(var(--up-blur)) saturate(160%);display:flex;flex-direction:column;color:var(--up-txt);position:relative;animation:up-pop .2s cubic-bezier(.2,.9,.3,1.15);transform-origin:bottom right}",
      "@keyframes up-pop{from{opacity:0;transform:scale(.94) translateY(8px)}}",
      ".up-win.closing{animation:up-out .18s ease forwards}",
      "@keyframes up-out{to{opacity:0;transform:scale(.96) translateY(8px)}}",
      ".up-win::before{content:'';position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,var(--up-hi),transparent);pointer-events:none}",
      ".up-titlebar{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;cursor:grab;touch-action:none;user-select:none}",
      ".up-titlebar:active{cursor:grabbing}",
      ".up-lights{display:flex;gap:8px;padding:0 2px}",
      ".up-light{width:12px;height:12px;border-radius:50%;cursor:default;position:relative;transition:transform .12s ease}",
      ".up-light:hover{transform:scale(1.14)}",
      ".up-light.close{background:#ff5f57}.up-light.min{background:#febc2e}.up-light.zoom{background:#28c840}",
      ".up-light::after{content:'';position:absolute;inset:0;border-radius:50%;opacity:0;transition:opacity .1s}",
      ".up-titlebar:hover .up-light::after{opacity:.8;background:radial-gradient(circle at 35% 30%,rgba(0,0,0,.3),transparent 55%)}",
      ".up-logo{flex:1;display:flex;align-items:center;color:var(--up-txt);overflow:hidden;padding-left:4px}",
      ".up-logo svg{height:15px;width:auto;max-width:120px;display:block}",
      ".up-tbtn{border:0;background:transparent;color:var(--up-dim);cursor:pointer;border-radius:6px;padding:3px 7px;line-height:1;font-family:inherit;transition:background .15s ease,color .15s ease,transform .12s ease}",
      ".up-tbtn:hover{background:var(--up-card);color:var(--up-txt)}",
      ".up-tbtn:active{transform:scale(.9)}",
      ".up-tbtn svg{width:14px;height:14px;display:block}",
      ".up-tbtn.spin svg{animation:up-spin .8s linear infinite}",
      "@keyframes up-spin{to{transform:rotate(360deg)}}",
      ".up-body{padding:2px 14px 13px;display:flex;flex-direction:column;gap:11px;overflow:auto;max-height:min(560px,calc(100vh - 140px))}",
      ".up-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
      ".up-tile{border-radius:11px;padding:9px 11px;background:var(--up-card);border:1px solid var(--up-brds);min-width:0;transition:transform .16s ease,background .16s ease}",
      ".up-tile:hover{background:var(--up-cardh);transform:translateY(-1px)}",
      ".up-tile .up-tk{font-size:9.5px;color:var(--up-faint);letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".up-tile .up-tv{font-size:16px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--up-txt)}",
      ".up-tile .up-ts{font-size:9.5px;color:var(--up-faint);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".up-tile.ok .up-tv{color:#30d158}.up-tile.warn .up-tv{color:#ffd60a}.up-tile.bad .up-tv{color:#ff453a}.up-tile.off .up-tv{color:var(--up-dim)}",
      ".up-card{border-radius:12px;padding:11px 12px;background:var(--up-card);border:1px solid var(--up-brds);transition:background .16s ease}",
      ".up-card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;gap:8px}",
      ".up-card-t{font-size:10.5px;font-weight:600;color:var(--up-dim);letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".up-mono{font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace}",
      ".up-note{font-size:10px;color:var(--up-faint);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".up-balmain{display:flex;align-items:baseline;gap:7px}",
      ".up-balamt{font-size:28px;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1.1}",
      ".up-balcur{font-size:14px;font-weight:650;color:var(--up-dim)}",
      ".up-balsub{font-size:10.5px;color:var(--up-faint);margin-top:4px;line-height:1.45}",
      ".up-balsub.err{color:#ff453a}",
      ".up-gauge{height:6px;border-radius:999px;background:var(--up-grid);margin-top:10px;overflow:hidden;display:flex}",
      ".up-gauge>i{display:block;height:100%}",
      ".up-legend{display:flex;gap:13px;margin-top:7px;font-size:10px;color:var(--up-dim);flex-wrap:wrap}",
      ".up-legend i{width:8px;height:8px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}",
      ".up-sec{font-size:10.5px;font-weight:600;color:var(--up-dim);letter-spacing:.05em;display:flex;align-items:center;gap:8px}",
      ".up-cwrap{position:relative}",
      ".up-tip{position:absolute;top:0;left:0;transform:translateX(-50%);pointer-events:none;background:rgba(22,22,32,.9);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 9px;font-size:10.5px;line-height:1.5;font-variant-numeric:tabular-nums;box-shadow:0 8px 24px rgba(0,0,0,.3);white-space:nowrap;z-index:3}",
      ".up-models{display:flex;flex-direction:column;gap:8px}",
      ".up-mrow{display:grid;grid-template-columns:130px 1fr 74px;align-items:center;gap:10px;border-radius:8px;padding:2px 4px;transition:background .15s ease}",
      ".up-mrow:hover{background:var(--up-cardh)}",
      ".up-mname{font-size:11.5px;color:var(--up-txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".up-mname small{display:block;color:var(--up-faint);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".up-mbar{height:11px;border-radius:6px;background:var(--up-grid);overflow:hidden;display:flex}",
      ".up-mbar i{height:100%;display:block;transition:width .4s ease}",
      ".up-mtok{font-size:10.5px;text-align:right;color:var(--up-dim);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".up-mtok small{display:block;color:var(--up-faint);font-size:9px}",
      ".up-empty{color:var(--up-faint);font-size:11px;padding:6px 0}",
      ".up-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;border-top:1px solid var(--up-brds)}",
      ".up-foot a{color:var(--up-dim);font-size:10.5px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;transition:color .15s ease}",
      ".up-foot a:hover{color:#4d6bfe}",
    ].join("");

    // ------------------------------------------------------------ formatting
    function fmtMoney(n, cur) {
      if (n === null || n === undefined) return "—";
      var num = typeof n === "string" ? parseFloat(n) : n;
      if (!isFinite(num)) return "—";
      var sym = cur === "CNY" ? "¥" : cur === "USD" ? "$" : cur ? cur + " " : "$";
      return sym + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtTokens(n) {
      n = Number(n) || 0;
      if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
      if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
      return String(Math.round(n));
    }
    function fmtCalls(n) {
      return (Number(n) || 0).toLocaleString("en-US");
    }
    function fmtHour(t) {
      var d = new Date(t);
      var hh = d.getHours();
      return (hh < 10 ? "0" : "") + hh + ":00";
    }
    function fmtClock(iso) {
      if (!iso) return "";
      try {
        return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } catch (e) {
        return "";
      }
    }
    function fmtAgo(ms) {
      if (!ms) return "";
      var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
      if (s < 60) return s + " 秒前";
      if (s < 3600) return Math.round(s / 60) + " 分钟前";
      return Math.round(s / 3600) + " 小时前";
    }
    function dotClassFor(snap) {
      var b = snap && snap.balance;
      if (!b || b.configured === false) return "unknown";
      if (b.error) return "bad";
      return b.isAvailable === false ? "bad" : "ok";
    }
    function modelLabel(m) {
      if (!m) return "unknown";
      return m;
    }

    // -------------------------------------------------------------- fetch
    async function apiCall(method, post) {
      var res = await fetch("/dsh-usage/api/" + method, {
        method: post ? "POST" : "GET",
        headers: post ? { "content-type": "application/json" } : undefined,
        cache: "no-store",
      });
      var body = null;
      try {
        body = await res.json();
      } catch (e) {
        body = null;
      }
      if (!body || body.ok !== true) {
        var msg = (body && body.error && body.error.message) || ("HTTP " + res.status);
        var err = new Error(msg);
        err.code = (body && body.error && body.error.code) || ("http-" + res.status);
        throw err;
      }
      return body.value;
    }
    async function loadSnapshot() {
      return apiCall("snapshot", false);
    }
    async function triggerRefresh() {
      return apiCall("refresh", true);
    }

    // ------------------------------------------------------------- storage
    var PREFS_KEY = "dsh-usage-panel:v1";
    function numOr(v, d) {
      return typeof v === "number" && isFinite(v) ? v : d;
    }
    function loadPrefs() {
      var def = { r: 24, b: 24 };
      try {
        var raw = window.localStorage.getItem(PREFS_KEY);
        if (!raw) return def;
        var p = JSON.parse(raw);
        return { r: numOr(p.r, def.r), b: numOr(p.b, def.b) };
      } catch (e) {
        return def;
      }
    }
    function savePrefs(p) {
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
      } catch (e) {
        /* private mode etc. */
      }
    }

    // ------------------------------------------------------- svg / curves
    var CHART_COLORS = {
      input: "#5e7bff",
      output: "#30d158",
      cached: "#9aa7ff",
    };

    function smoothPath(pts) {
      if (!pts || pts.length < 2) return "";
      var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[Math.max(0, i - 1)];
        var p1 = pts[i];
        var p2 = pts[i + 1];
        var p3 = pts[Math.min(pts.length - 1, i + 2)];
        var c1x = p1[0] + (p2[0] - p0[0]) / 6;
        var c1y = p1[1] + (p2[1] - p0[1]) / 6;
        var c2x = p2[0] - (p3[0] - p1[0]) / 6;
        var c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += "C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
      }
      return d;
    }

    function areaUnder(pts, baselineY) {
      if (pts.length < 2) return null;
      var line = smoothPath(pts);
      var last = pts[pts.length - 1];
      var first = pts[0];
      return line + "L" + last[0].toFixed(1) + " " + baselineY + "L" + first[0].toFixed(1) + " " + baselineY + "Z";
    }

    function TrendCurve(props) {
      var data = props.data || [];
      var width = props.width;
      var height = 132;
      var pad = { l: 4, r: 4, t: 10, b: 16 };
      var iw = width - pad.l - pad.r;
      var ih = height - pad.t - pad.b;
      var n = data.length;
      var input = [];
      var output = [];
      var maxIn = 1;
      var maxOut = 1;
      var any = false;
      for (var i = 0; i < n; i++) {
        var d = data[i];
        var inV = (Number(d.cacheReadTokens) || 0) + (Number(d.inputTokens) || 0);
        var outV = Number(d.outputTokens) || 0;
        input.push(inV);
        output.push(outV);
        if (inV > maxIn) maxIn = inV;
        if (outV > maxOut) maxOut = outV;
        if (inV + outV > 0) any = true;
      }
      var hover = useState(-1);
      var xOf = function (i) {
        return pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      };
      // 每个系列按自身最大值归一化，避免输入(几十万)把输出(几万)压到底部成一条平线。
      var yOfIn = function (v) {
        return pad.t + ih - (v / maxIn) * ih;
      };
      var yOfOut = function (v) {
        return pad.t + ih - (v / maxOut) * ih;
      };
      var baselineY = pad.t + ih;

      function pointsFor(vals, yOf) {
        var pts = [];
        for (var k = 0; k < n; k++) pts.push([xOf(k), yOf(vals[k])]);
        return pts;
      }

      var defs = h(
        "defs",
        null,
        h("linearGradient", { id: "up-g-in", x1: 0, y1: 0, x2: 0, y2: 1 },
          h("stop", { offset: "0%", stopColor: CHART_COLORS.input, stopOpacity: 0.5 }),
          h("stop", { offset: "100%", stopColor: CHART_COLORS.input, stopOpacity: 0.04 })),
        h("linearGradient", { id: "up-g-out", x1: 0, y1: 0, x2: 0, y2: 1 },
          h("stop", { offset: "0%", stopColor: CHART_COLORS.output, stopOpacity: 0.5 }),
          h("stop", { offset: "100%", stopColor: CHART_COLORS.output, stopOpacity: 0.04 })),
      );

      var gridLines = [];
      for (var g = 1; g <= 3; g++) {
        var gy = yOfIn((maxIn / 4) * g);
        gridLines.push(h("line", { key: "g" + g, x1: pad.l, x2: width - pad.r, y1: gy, y2: gy, stroke: "var(--up-grid)", strokeWidth: 1 }));
      }

      var onMove = function (e) {
        if (!n || !e.currentTarget) return;
        var rect = e.currentTarget.getBoundingClientRect();
        var frac = (e.clientX - rect.left) / Math.max(1, rect.width);
        var idx = Math.min(n - 1, Math.max(0, Math.round(frac * (n - 1))));
        hover[1](idx);
      };

      var idx = hover[0];
      var tip = null;
      if (idx >= 0 && idx < n && data[idx]) {
        var d0 = data[idx];
        var inTot = input[idx];
        var outTot = output[idx];
        var cxPct = Math.min(86, Math.max(14, (xOf(idx) / width) * 100));
        tip = h(
          "div",
          { className: "up-tip", style: { left: cxPct + "%", top: 2 } },
          h("div", { style: { fontWeight: 600 } }, fmtHour(d0.t) + " · " + fmtTokens(inTot + outTot) + " tokens"),
          h("div", { style: { whiteSpace: "nowrap" } }, h("span", { style: { color: CHART_COLORS.cached } }, "● "), "输入·缓存命中: " + fmtTokens(Number(d0.cacheReadTokens) || 0)),
          h("div", { style: { whiteSpace: "nowrap" } }, h("span", { style: { color: CHART_COLORS.input } }, "● "), "输入·未命中: " + fmtTokens(Number(d0.inputTokens) || 0)),
          h("div", { style: { whiteSpace: "nowrap" } }, h("span", { style: { color: CHART_COLORS.output } }, "● "), "输出: " + fmtTokens(outTot)),
        );
      }

      var xLabels = [];
      if (n > 0) {
        var ticks = n <= 6 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
        for (var t = 0; t < ticks.length; t++) {
          var ii = ticks[t];
          xLabels.push(
            h("text", {
              key: ii,
              x: xOf(ii),
              y: height - 2,
              fontSize: 9,
              fill: "var(--up-faint)",
              textAnchor: ii === 0 ? "start" : ii === n - 1 ? "end" : "middle",
            }, fmtHour(data[ii].t)),
          );
        }
      }

      if (n === 1 && any) {
        var colW = Math.min(64, Math.max(26, iw * 0.5));
        var cx = width / 2;
        var inH = (input[0] / maxIn) * ih;
        var outH = (output[0] / maxOut) * ih;
        var segs = [];
        if (output[0] > 0) {
          segs.push(h("rect", { key: "out", x: cx - colW / 2, y: baselineY - inH - outH, width: colW, height: outH, fill: CHART_COLORS.output, rx: Math.min(4, colW / 2), opacity: 0.85 }));
        }
        if (input[0] > 0) {
          segs.push(h("rect", { key: "in", x: cx - colW / 2, y: baselineY - inH, width: colW, height: inH, fill: CHART_COLORS.input, rx: Math.min(4, colW / 2), opacity: 0.85 }));
        }
        return h(
          "div",
          { className: "up-cwrap", onMouseLeave: function () { hover[1](-1); } },
          tip,
          h("svg", { width: width, height: height, viewBox: "0 0 " + width + " " + height, style: { display: "block", width: "100%" } },
            defs, gridLines,
            h("line", { x1: cx, y1: pad.t, x2: cx, y2: baselineY, stroke: "var(--up-grid)" }),
            segs,
            h("text", { x: cx, y: height - 2, fontSize: 9, fill: "var(--up-faint)", textAnchor: "middle" }, fmtHour(data[0].t) + " · " + fmtTokens(input[0] + output[0])),
          ),
        );
      }

      var inPts = pointsFor(input, yOfIn);
      var outPts = pointsFor(output, yOfOut);

      return h(
        "div",
        { className: "up-cwrap", onMouseLeave: function () { hover[1](-1); } },
        tip,
        h("svg", { width: width, height: height, viewBox: "0 0 " + width + " " + height, style: { display: "block", width: "100%" } },
          defs,
          gridLines,
          h("path", { d: areaUnder(inPts, baselineY), fill: "url(#up-g-in)" }),
          h("path", { d: areaUnder(outPts, baselineY), fill: "url(#up-g-out)" }),
          h("path", { d: smoothPath(inPts), fill: "none", stroke: CHART_COLORS.input, strokeWidth: 1.6, strokeLinejoin: "round" }),
          h("path", { d: smoothPath(outPts), fill: "none", stroke: CHART_COLORS.output, strokeWidth: 1.6, strokeLinejoin: "round" }),
          xLabels,
          n > 0
            ? h("rect", { x: 0, y: pad.t, width: width, height: ih, fill: "transparent", onMouseMove: onMove })
            : null,
        ),
      );
    }

    function TrendLegend() {
      var items = [
        { c: CHART_COLORS.input, t: "输入" },
        { c: CHART_COLORS.output, t: "输出" },
      ];
      return h(
        "div",
        { className: "up-legend" },
        items.map(function (it) {
          return h("span", { key: it.t }, h("i", { style: { background: it.c } }), it.t);
        }),
      );
    }

    // ------------------------------------------------------------ stat tiles
    function balanceTone(b) {
      if (!b) return { cls: "off", label: "—" };
      if (b.configured === false) return { cls: "off", label: "未配置" };
      if (b.error) return { cls: "bad", label: "更新失败" };
      var num = parseFloat(b.totalBalance);
      if (!isFinite(num)) return { cls: "off", label: "…" };
      var low = b.currency === "CNY" ? 10 : b.currency === "USD" ? 1.5 : 5;
      if (num <= 0) return { cls: "bad", label: "已耗尽" };
      if (num < low) return { cls: "warn", label: "偏低" };
      return { cls: "ok", label: "正常" };
    }

    function StatTiles(props) {
      var s = props.snap;
      var b = s && s.balance;
      var tone = balanceTone(b);
      var dayTotal = s ? (s.day ? s.day.inputTokens + s.day.outputTokens + (s.day.cacheReadTokens || 0) : 0) : 0;
      var last = s && s.lastSession;
      var sessTotal = last ? last.inputTokens + last.outputTokens + (last.cacheReadTokens || 0) : 0;
      return h(
        "div",
        { className: "up-tiles" },
        h(
          "div",
          { className: "up-tile " + tone.cls, title: tone.label },
          h("div", { className: "up-tk" }, "余额"),
          h("div", { className: "up-tv" }, b ? fmtMoney(b.totalBalance, b.currency) : "—"),
          h("div", { className: "up-ts" }, b && b.error ? "更新失败" : tone.label),
        ),
        h(
          "div",
          { className: "up-tile" },
          h("div", { className: "up-tk" }, "今日"),
          h("div", { className: "up-tv" }, fmtTokens(dayTotal)),
          h("div", { className: "up-ts" }, (s && s.day ? s.day.calls || 0 : 0) + " 次响应"),
        ),
        h(
          "div",
          { className: "up-tile" },
          h("div", { className: "up-tk" }, last && last.active ? "会话 · 进行中" : "会话 · 上次"),
          h("div", { className: "up-tv" }, fmtTokens(sessTotal)),
          h("div", { className: "up-ts" }, last ? modelLabel(last.model) : "—"),
        ),
      );
    }

    // ------------------------------------------------------------ balance card
    function BalanceCard(props) {
      var s = props.snap;
      var b = s && s.balance;
      if (!b) {
        return h("div", { className: "up-card" }, h("div", { className: "up-empty" }, "等待数据…"));
      }
      var tone = balanceTone(b);
      // Only official /user/balance fields are shown; no locally estimated spend.
      var sub;
      if (b.configured === false || (b.error && b.error.code === "no-key")) {
        sub = h(
          "div",
          { className: "up-balsub err" },
          "未配置 DeepSeek API Key。请在 ~/.dsh/.credentials.yaml 中加入 “DEEPSEEK_API_KEY”（或设置环境变量 DSH_USAGE_HUD_API_KEY）后刷新。",
        );
      } else if (b.error) {
        sub = h(
          "div",
          { className: "up-balsub err" },
          "余额更新失败 · " + (b.error.message || b.error.code) + " · 显示上次已知值。",
        );
      } else {
        sub = h(
          "div",
          { className: "up-balsub" },
          b.isAvailable === false ? "API 当前不可用" : "API 可用 · 预付费额度",
        );
      }
      var cur = b.currency || "CNY";
      return h(
        "div",
        { className: "up-card" },
        h(
          "div",
          { className: "up-card-h" },
          h("span", { className: "up-card-t" }, "DeepSeek 余额"),
          h("span", { className: "up-note up-mono" }, b.lastOkAt ? fmtClock(b.lastOkAt) + " · " + fmtAgo(new Date(b.lastOkAt).getTime()) : "等待中"),
        ),
        h(
          "div",
          { className: "up-balmain" },
          h("span", { className: "up-balamt up-mono" }, fmtMoney(b.totalBalance, cur)),
          h("span", { className: "up-balcur" }, cur),
          h("span", { className: "up-dot " + tone.cls, style: { marginLeft: "auto", alignSelf: "center" } }),
        ),
        sub,
        b.toppedUpBalance != null
          ? h(
              "div",
              { className: "up-legend" },
              h("span", { title: "官方 /user/balance 返回的充值余额" }, "充值余额 " + fmtMoney(b.toppedUpBalance, cur)),
            )
          : null,
      );
    }

    // ------------------------------------------------------------ by model
    function ModelRows(props) {
      var list = props.list || [];
      if (!list.length) {
        return h("div", { className: "up-empty" }, "今天暂无用量记录。");
      }
      var total = 0;
      for (var i = 0; i < list.length; i++) {
        total += list[i].inputTokens + list[i].outputTokens + (list[i].cacheReadTokens || 0);
      }
      total = Math.max(1, total);
      return h(
        "div",
        { className: "up-models" },
        list.map(function (m, i) {
          var color = ["#4d6bfe", "#ff9f0a", "#bf5af2", "#30d158", "#ff453a", "#5ac8fa"][i % 6];
          var mt = m.inputTokens + m.outputTokens + (m.cacheReadTokens || 0);
          var wIn = ((m.inputTokens + (m.cacheReadTokens || 0)) / total) * 100;
          var wOut = (m.outputTokens / total) * 100;
          return h(
            "div",
            { key: m.model || i, className: "up-mrow" },
            h(
              "div",
              { className: "up-mname", title: m.model },
              modelLabel(m.model),
              h("small", null, fmtTokens(m.inputTokens + (m.cacheReadTokens || 0)) + " 入 · " + fmtTokens(m.outputTokens) + " 出"),
            ),
            h(
              "div",
              { className: "up-mbar" },
              h("i", { style: { width: wIn.toFixed(2) + "%", background: color } }),
              h("i", { style: { width: wOut.toFixed(2) + "%", background: color, opacity: 0.45 } }),
            ),
            h(
              "div",
              { className: "up-mtok" },
              fmtTokens(mt),
              h("small", null, ((mt / total) * 100).toFixed(1) + "% 今日"),
            ),
          );
        }),
      );
    }

    // -------------------------------------------------------------- icons
    var DS_MARK =
      "M1333.74443323 82.22042509c-13.80988113-6.90651166-19.77216769 6.25765149-27.83971486 12.94735271-2.7494075 2.15867766-5.09661597 4.96464441-7.44382443 7.55380074-20.17908001 22.01097094-43.75485659 36.47128333-74.589069 34.74465541-45.04943475-2.58915632-83.51757347 11.86958497-117.50810569 47.04629015-7.2285851-43.37779501-31.23798253-69.2740715-67.78939144-85.89149046-19.15315822-8.63156848-38.46813872-17.26470805-51.87582082-36.04080467-9.33227462-13.37940245-11.86958497-28.2701935-16.56243082-42.94417414-2.96778901-8.8483789-5.93557805-17.91199713-15.91514173-19.42338573-10.87194282-1.72662791-15.10760146 7.55380073-19.36996865 15.3228408-16.99448057 31.72344934-23.6040562 66.68491519-22.93005859 102.07685969 1.45797153 79.63383898 34.42258196 143.08073766 99.86633603 188.18516058 7.44539552 5.17831264 9.36055423 10.35819639 7.01334578 17.91042602-4.45089798 15.53808012-9.79260399 30.6456816-14.45874129 46.18376174-2.9693601 9.92771773-7.418687 12.0848243-17.85858007 7.76904006-35.90569092-15.3228408-66.92843413-37.9826719-94.36280776-65.38876592-46.53254371-45.9685224-88.61576053-96.6833077-141.08388229-136.39103645a620.44857966 620.44857966 0 0 0-37.41550843-26.11308694c-53.54746058-53.0887023 7.01334578-96.68173661 21.0416084-101.86162035 14.6472721-5.39512307 5.09818706-23.95440928-42.29845612-23.73916995s-90.74772965 16.40217963-145.99510964 37.98267191c-8.09111351 3.2364454-16.59071043 5.6103624-25.27569597 7.55380074-50.17590143-9.71247839-102.23868196-11.86958497-156.65024201-5.61193348-102.42721275 11.65434565-184.24643792 61.07455278-244.40190308 145.45465466-72.24186053 101.4295706-89.26462071 216.6721645-68.4115431 336.87626062 21.85071977 126.68012914 85.21592177 231.56295556 182.54651857 313.56914048 100.94410379 85.02739095 217.18433986 126.68012914 349.79847589 118.69584973 80.54978445-4.74940507 170.2181753-15.75489055 271.37751842-103.15776961 25.51921492 12.94892381 52.30629946 18.12880755 96.71001624 22.01254203 34.23248007 3.2364454 67.17038198-1.72662791 92.66288839-7.12175096 39.95124769-8.63156848 37.17198947-46.39900106 22.7399567-53.30394163-117.10276448-55.67942971-91.39501876-33.01959858-114.755556-51.36207439 59.50817604-71.86479892 149.17656689-146.53556459 184.24643795-388.45514546 2.77768711-19.20657529 0.43047867-31.29139958 0-46.82947971-0.21681042-9.49566798 1.88687908-13.16573423 12.54358259-14.24350198 29.32282382-3.45325582 57.80982774-11.65434565 83.9496232-26.32832626 75.85536753-42.29845616 106.47276951-111.78933809 113.70292571-195.09167222 1.07933883-12.73211339-0.21523932-25.89627652-13.40768208-32.58597776M672.59048267 831.93671913c-113.46097785-91.07137422-168.51982701-121.06819563-191.25978372-119.77361748-21.25684774 1.29457817-17.42653031 26.11308695-12.76039301 42.29845614 4.88294773 15.97012989 11.27571295 26.97561536 20.20421747 41.00387801 6.15238845 9.28042865 10.41475564 23.09188086-6.17595481 33.45007725-36.55298001 23.09188086-100.08157538-7.76904006-103.04779332-9.27885757-73.96848843-44.45713381-135.82544403-103.1577696-179.39176984-183.43732658-42.08164574-77.25992199-66.4948133-160.1302064-70.54194114-248.61085317-1.07933883-21.36525295 5.09818706-28.91905367 25.89784762-32.80435928a250.87636497 250.87636497 0 0 1 83.11223228-2.15710656c115.83646593 17.26627914 214.46006978 70.138171 297.11354374 153.8725549 47.18140388 47.69200813 82.87028441 104.66601601 119.66521225 160.34544572 39.08871926 59.12954337 81.17193611 115.45626214 134.71939669 161.63845278 18.90963927 16.18536923 33.98896113 28.48700395 48.44770242 37.55062216-43.56632578 4.96464441-116.26537349 6.04241215-165.98251663-34.09736632m54.40998899-357.16217477c0-9.49566798 7.44696661-17.04946873 16.80594974-17.04946872q3.18302835 0.05498814 5.71876762 1.07933883a16.91435498 16.91435498 0 0 1 10.84523431 15.97012989 16.83265829 16.83265829 0 0 1-16.77924123 17.04946872 16.6441275 16.6441275 0 0 1-16.59071044-17.04946872m168.95187674 88.48064679c-10.81852576 4.53259466-21.66218896 8.41790022-32.10208201 8.8483789-16.13195215 0.8640995-33.7737218-5.82560173-43.32280686-14.02669155-14.89079105-12.73368447-25.52078602-19.85543545-29.97168398-42.08321683-1.91515871-9.49566798-0.8640995-24.16964861 0.83739098-32.58597774 3.83031742-18.12880755-0.43204976-29.78158209-12.94892381-40.35658891-10.19637413-8.63313957-23.17357754-11.00705657-37.41550843-11.00705657-5.31499747 0-10.19637413-2.37234591-13.81145222-4.31578423a14.16180529 14.16180529 0 0 1-6.15081735-19.85386437c1.48310897-3.02120608 8.71326515-10.35976749 10.41318453-11.65434564 19.34011795-11.2222959 41.64959598-7.55222964 62.25915463 0.8640995 19.1264497 7.9842794 33.55848246 22.65983111 54.4115601 43.37779497 21.25684774 25.03374811 25.08716515 31.94025977 37.17198946 50.71478532 9.57736465 14.67398064 18.29062981 29.78158209 24.22620784 47.04471904 3.64021553 10.79181723-1.0526303 19.63862503-13.59621288 25.03374811";

    function logoMark(color) {
      return h("svg", { viewBox: "0 0 1391 1024", width: 15, height: 15, style: { display: "block" } },
        h("path", { d: DS_MARK, fill: color }));
    }

    // Thin DeepSeek wordmark (logo + name as one path), recolored to the
    // window text color so it adapts to light (dark) / dark (light) themes.
    var DS_WORD =
      "M1348.789884 85.951355c-14.399892-7.231946-20.671845 6.527951-29.055782 13.503899-2.879978 2.303983-5.37596 5.183961-7.807941 7.935941-21.119842 23.039827-45.759657 38.079714-77.951416 36.287727-47.103647-2.68798-87.295345 12.415907-122.879078 49.151632-7.487944-45.31166-32.639755-72.319458-70.847469-89.727327-20.03185-9.023932-40.191699-18.047865-54.207593-37.695718-9.727927-13.951895-12.415907-29.567778-17.279871-44.863663-3.135976-9.27993-6.207953-18.751859-16.639875-20.351847-11.391915-1.791987-15.807881 7.93594-20.287848 15.99988-17.727867 33.215751-24.639815 69.759477-23.93582 106.751199 1.535988 83.199376 35.96773 149.566878 104.319217 196.670525 7.807941 5.439959 9.855926 10.879918 7.359945 18.751859-4.607965 16.255878-10.239923 31.99976-15.103887 48.255638-3.071977 10.367922-7.679942 12.671905-18.62386 8.127939A314.109644 314.109644 0 0 1 887.161346 326.397552c-48.639635-47.99964-92.607305-101.055242-147.454894-142.526931-12.671905-9.599928-25.727807-18.68786-39.039707-27.327795-56.06358-55.487584 7.295945-101.055242 21.951835-106.495201 15.295885-5.631958 5.31196-24.959813-44.223668-24.767815-49.535628 0.191999-94.847289 17.151871-152.638855 39.679703a172.350707 172.350707 0 0 1-26.367802 7.871941 534.395992 534.395992 0 0 0-163.774772-5.823957c-107.071197 12.159909-192.574556 63.807521-255.422084 151.99886C4.671965 325.117562-13.119902 445.564658 8.639935 571.131717c22.847829 132.479006 89.087332 242.046185 190.846569 327.805541 105.471209 88.831334 227.006297 132.415007 365.629258 124.03107 84.159369-4.927963 177.918666-16.447877 283.645872-107.839191 26.6878 13.567898 54.65559 18.943858 101.119242 23.039827 35.711732 3.391975 70.143474-1.791987 96.831274-7.423945 41.727687-9.023932 38.847709-48.511636 23.743822-55.743582-122.367082-58.239563-95.487284-34.559741-119.935101-53.695597 62.207533-75.135436 155.902831-153.150851 192.638555-406.012955 2.879978-20.095849 0.383997-32.703755 0-48.959632-0.255998-9.919926 1.919986-13.759897 13.055902-14.911889a233.598248 233.598248 0 0 0 87.743342-27.519793c79.295405-44.159669 111.359165-116.799124 118.847109-203.902471 1.151991-13.3119-0.191999-27.071797-14.015895-34.047745zM657.723067 869.561478C539.131957 774.394192 481.596388 743.034427 457.788567 744.378417c-22.207833 1.34399-18.175864 27.327795-13.311901 44.223668 5.119962 16.639875 11.775912 28.159789 21.119842 42.879679 6.399952 9.663928 10.879918 24.127819-6.463951 34.943738-38.207713 24.127819-104.639215-8.127939-107.711193-9.727927-77.31142-46.399652-141.950935-107.775192-187.518593-191.678563A594.555541 594.555541 0 0 1 90.239323 405.116962c-1.151991-22.399832 5.31196-30.271773 27.071797-34.367743 28.607785-5.567958 57.983565-6.335952 86.847349-2.239983 121.087092 18.047865 224.190319 73.34345 310.58967 160.830794 49.27963 49.919626 86.591351 109.439179 125.055062 167.678742 40.895693 61.759537 84.863364 120.639095 140.798944 168.894734 19.839851 16.895873 35.583733 29.759777 50.68762 39.231705-45.567658 5.183961-121.535088 6.335952-173.502698-35.647732z m56.895573-373.3092c0-9.919926 7.743942-17.791867 17.535869-17.791866q3.327975 0 6.015955 1.087991a17.663868 17.663868 0 0 1 11.327915 16.703875 17.599868 17.599868 0 0 1-17.535869 17.855866 17.407869 17.407869 0 0 1-17.34387-17.855866zM891.193316 588.795584c-11.327915 4.735964-22.65583 8.831934-33.535748 9.27993a69.759477 69.759477 0 0 1-45.311661-14.719889c-15.551883-13.247901-26.6878-20.735844-31.359764-43.96767a102.207233 102.207233 0 0 1 0.895993-34.047745c4.03197-18.943858-0.447997-31.103767-13.503899-42.175684-10.68792-9.023932-24.255818-11.519914-39.103707-11.519913a31.231766 31.231766 0 0 1-14.463891-4.479967 14.783889 14.783889 0 0 1-6.399952-20.735844c1.535988-3.199976 9.087932-10.879918 10.879918-12.159909 20.223848-11.775912 43.519674-7.93594 65.087512 0.831994 19.96785 8.319938 35.071737 23.679822 56.831574 45.375659 22.207833 26.175804 26.239803 33.34375 38.847709 52.991603 10.047925 15.359885 19.199856 31.103767 25.343809 49.151631 3.839971 11.327915-1.087992 20.543846-14.207893 26.239804z m2806.570951 210.302423h-71.167466v-110.271173h71.167466c43.96767 0 88.511336-10.879918 117.375119-41.40769 28.863784-30.591771 39.423704-77.695417 39.423705-124.287067 0-46.527651-10.559921-93.439299-39.423705-123.967071-28.799784-30.591771-73.407449-41.407689-117.375119-41.407689-44.287668 0-88.575336 10.879918-117.439119 41.407689-29.119782 30.591771-39.423704 77.439419-39.423705 123.967071v453.372599h-124.799064V247.422144h124.799064v46.271653h22.847829c2.303983-2.559981 4.863964-5.119962 7.679942-7.679942 31.167766-28.607785 78.911408-38.591711 126.335053-38.591711 73.407449 0 147.390895 18.239863 195.646532 69.119482 47.99964 50.879618 65.471509 129.151031 65.471509 206.846449 0 77.439419-17.471869 155.710832-65.471509 206.526451-48.255638 51.199616-122.239083 69.119482-195.646532 69.119481zM1797.106522 266.558001h71.103466v110.271173H1797.106522c-44.03167 0-88.575336 10.879918-117.43912 41.727687-28.799784 30.527771-39.423704 77.439419-39.423704 123.96707 0 46.527651 10.559921 93.439299 39.423704 123.96707 28.863784 30.591771 73.407449 41.727687 117.43912 41.727687 44.287668 0 88.575336-11.135916 117.439119-41.727687 29.119782-30.527771 39.423704-77.439419 39.423704-123.96707v-453.116602h124.799064V818.553861h-124.799064v-46.591651h-22.847828a49.471629 49.471629 0 0 1-7.743942 7.679943c-31.167766 28.607785-78.847409 38.911708-126.271053 38.911708-73.407449 0-147.390895-18.303863-195.710532-69.439479C1553.39635 698.234763 1535.98848 620.219348 1535.98848 542.523931s17.407869-155.710832 65.40751-206.846449c48.319638-50.815619 122.239083-69.119482 195.710532-69.119481z m908.473186 266.238003v44.287668h-332.541506V488.508336h220.542346c-5.119962-32.255758-16.831874-62.271533-37.439719-83.96737-30.271773-31.743762-76.223428-43.135676-122.239083-43.135677-45.695657 0-92.03131 11.391915-121.983085 43.135677-30.015775 31.359765-40.895693 79.9994-40.895694 128.255038 0 48.319638 10.879918 96.831274 40.895694 128.575036 29.951775 31.679762 76.287428 42.879678 121.983085 42.879678 45.951655 0 91.96731-11.199916 122.239083-42.879678a142.078934 142.078934 0 0 0 11.455914-14.591891h123.391075c-10.559921 38.271713-27.96779 72.895453-53.695598 100.03125-50.303623 52.799604-127.103047 71.679462-203.390474 71.679462s-153.150851-18.879858-203.134477-71.679462c-50.303623-52.863604-68.287488-133.758997-68.287488-214.014395s17.983865-161.086792 68.287488-213.950395c49.983625-52.607605 126.847049-71.423464 203.134477-71.423465s153.086852 18.815859 203.390474 71.423465c50.303623 52.863604 68.287488 133.694997 68.287488 213.950395z m626.491301 0v44.287668h-332.541505V488.508336h220.798344c-5.119962-32.255758-16.831874-62.271533-37.695718-83.96737-29.951775-31.743762-75.96743-43.135676-121.983085-43.135677-45.695657 0-91.96731 11.391915-121.983085 43.135677-29.951775 31.359765-40.831694 79.9994-40.831694 128.255038 0 48.319638 10.879918 96.831274 40.831694 128.575036 30.015775 31.679762 76.287428 42.879678 121.983085 42.879678 46.079654 0 92.03131-11.199916 121.983085-42.879678 4.287968-4.607965 8.319938-9.407929 11.775912-14.591891h123.391075c-10.879918 38.271713-28.03179 72.895453-53.759597 100.03125-50.239623 52.799604-127.103047 71.679462-203.390475 71.679462-76.223428 0-153.086852-18.879858-203.390474-71.679462-49.983625-52.863604-67.96749-133.758997-67.967491-214.014395s17.983865-161.086792 67.967491-213.950395c50.303623-52.607605 127.167046-71.423464 203.390474-71.423465 76.287428 0 153.150851 18.815859 203.454474 71.423465 49.919626 52.863604 67.96749 133.694997 67.96749 213.950395z m982.200634 285.693857c76.287428 0 153.086852-11.135916 203.070477-42.239683 50.303623-31.167766 68.287488-78.911408 68.287488-126.335052 0-47.359645-17.983865-95.103287-68.287488-126.271053-49.919626-31.103767-126.783049-42.239683-203.070477-42.239684h2.559981c-32.639755 0-65.407509-4.287968-86.591351-16.639875a53.759597 53.759597 0 0 1-29.119781-48.831633c0-18.559861 7.679942-36.799724 29.119781-49.087632 21.119842-12.03191 54.015595-16.319878 86.591351-16.319878s65.407509 4.287968 86.847348 16.319878a53.759597 53.759597 0 0 1 28.799784 49.087632h127.167047c0-47.359645-16.255878-95.103287-61.43954-126.271053-45.439659-31.103767-114.815139-42.239683-183.93462-42.239684s-138.558961 11.135916-183.99862 42.239684c-45.439659 31.167766-61.695537 78.847409-61.695537 126.271053 0 47.423644 16.255878 95.167286 61.695537 126.271052 45.439659 31.167766 114.815139 42.303683 183.99862 42.303683 35.96773 0 75.135436 4.287968 98.815259 16.319878 23.679822 11.96791 31.99976 30.527771 31.99976 49.087632 0 18.303863-8.319938 36.863724-31.99976 48.895633-23.679822 11.96791-59.96755 16.511876-95.99928 16.511876-35.96773 0-72.319458-4.479966-95.679283-16.511876-23.679822-12.03191-32.255758-30.591771-32.255758-48.895633H4042.849679c0 47.423644 17.983865 95.167286 67.96749 126.271053 50.303623 31.167766 126.847049 42.239683 203.454474 42.239683z m897.913266-285.693857v44.287668h-332.605506V488.508336h220.862344c-5.119962-32.255758-16.831874-62.271533-37.759717-83.96737-29.951775-31.743762-75.96743-43.135676-121.919086-43.135677-45.695657 0-92.03131 11.391915-121.983085 43.135677-30.015775 31.359765-40.895693 79.9994-40.895693 128.255038 0 48.319638 10.879918 96.831274 40.895693 128.575036 29.951775 31.679762 76.287428 42.879678 121.983085 42.879678 45.951655 0 91.96731-11.199916 121.983085-42.879678a113.27915 113.27915 0 0 0 11.711913-14.591891h123.391074c-10.879918 38.271713-27.96779 72.895453-53.695597 100.03125-50.303623 52.799604-127.103047 71.679462-203.390475 71.679462s-153.150851-18.879858-203.390474-71.679462c-50.047625-52.863604-68.03149-133.758997-68.03149-214.014395s17.983865-161.086792 68.03149-213.950395c50.239623-52.607605 127.103047-71.423464 203.390474-71.423465s153.086852 18.815859 203.390475 71.423465c49.983625 52.863604 67.96749 133.694997 67.96749 213.950395z m626.747299 0v44.287668h-332.541506V488.508336h220.798344c-5.37596-32.255758-16.831874-62.271533-37.631718-83.96737-30.079774-31.743762-76.287428-43.135676-122.047084-43.135677-45.695657 0-91.96731 11.391915-121.983085 43.135677-30.271773 31.359765-40.831694 79.9994-40.831694 128.255038 0 48.319638 10.559921 96.831274 40.831694 128.575036 30.015775 31.679762 76.287428 42.879678 121.983085 42.879678 45.759657 0 92.03131-11.199916 122.047084-42.879678 4.223968-4.607965 7.93594-9.407929 11.647913-14.591891h123.455074c-10.879918 38.271713-28.03179 72.895453-54.015595 100.03125-49.983625 52.799604-126.847049 71.679462-203.134476 71.679462-76.223428 0-153.406849-18.879858-203.390475-71.679462-49.983625-52.863604-67.96749-133.758997-67.96749-214.014395s17.983865-161.086792 67.96749-213.950395c49.983625-52.607605 127.167046-71.423464 203.390475-71.423465 76.287428 0 153.150851 18.815859 203.134476 71.423465 50.303623 52.863604 68.287488 133.694997 68.287488 213.950395zM5922.963578 63.99952h124.863063v754.68234h-124.863063V63.99952z m337.917465 451.644613l204.862464 302.845728h-154.878838l-204.798464-302.845728 204.798464-242.814179h154.878838l-204.798464 242.814179z";

    function logoWord(color) {
      return h("svg", { viewBox: "0 0 6465 1024", height: 15, preserveAspectRatio: "xMinYMid meet", style: { display: "block", color: color } },
        h("path", { d: DS_WORD, fill: color }),
      );
    }

    // -------------------------------------------------------------- pill
    function Pill(props) {
      var s = props.snap;
      var b = s && s.balance;
      var dayTotal = s && s.day ? s.day.inputTokens + s.day.outputTokens + (s.day.cacheReadTokens || 0) : 0;
      var last = s && s.lastSession;
      var sessTotal = last ? last.inputTokens + last.outputTokens + (last.cacheReadTokens || 0) : 0;
      return h(
        "div",
        {
          className: "up-pill",
          title: "DeepSeek 用量面板 — 点击展开",
          ref: props.dragRef,
          onPointerDown: props.onPointerDown,
          onPointerMove: props.onPointerMove,
          onPointerUp: props.onPointerUp,
          onPointerCancel: props.onPointerUp,
          onClick: props.onClick,
        },
        h("span", { className: "up-ic" }, logoMark("#4d6bfe")),
        h(
          "span",
          { className: "up-cols" },
          h("span", { className: "up-col" },
            h("span", { className: "up-k" }, "余额"),
            h("span", { className: "up-v up-mono" }, b ? fmtMoney(b.totalBalance, b.currency) : "—"),
          ),
          h("span", { className: "up-col" },
            h("span", { className: "up-k" }, "今日"),
            h("span", { className: "up-v" }, fmtTokens(dayTotal)),
          ),
          h("span", { className: "up-col" },
            h("span", { className: "up-k" }, "会话"),
            h("span", { className: "up-v" }, fmtTokens(sessTotal)),
          ),
        ),
        h("span", { className: "up-dot " + (props.dotCls || "unknown") }),
      );
    }

    // ------------------------------------------------------------ window
    function Window(props) {
      var s = props.snap;
      var ref = useRef(null);
      return h(
        "div",
        {
          className: "up-win" + (props.closing ? " closing" : ""),
          ref: function (node) { ref.current = node; },
          style: { width: props.compact ? 380 : 468 },
        },
        h(
          "div",
          {
            className: "up-titlebar",
            onPointerDown: props.onTitleDown,
            onPointerMove: props.onTitleMove,
            onPointerUp: props.onTitleUp,
            onPointerCancel: props.onTitleUp,
            title: "拖动可移动",
          },
          h(
            "div",
            { className: "up-lights" },
            h("span", { className: "up-light close", title: "收起", onClick: props.onClose }),
            h("span", { className: "up-light min", title: "收起", onClick: props.onClose }),
            h("span", { className: "up-light zoom", title: "收起", onClick: props.onClose }),
          ),
          h("span", { className: "up-logo" }, logoWord("var(--up-txt)")),
          h(
            "button",
            {
              className: "up-tbtn" + (props.refreshing ? " spin" : ""),
              title: "手动刷新",
              onClick: function (e) {
                e.stopPropagation();
                props.onRefresh();
              },
            },
            h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
              h("path", { d: "M21 12a9 9 0 1 1-3-6.7" }),
              h("path", { d: "M21 3v5h-5" }),
            ),
          ),
        ),
        h(
          "div",
          { className: "up-body" },
          h(StatTiles, { snap: s }),
          h(BalanceCard, { snap: s }),
          h("div", { className: "up-card" },
            h("div", { className: "up-card-h" }, h("span", { className: "up-card-t" }, "Tokens · 近 24 小时")),
            s && s.history && s.history.length > 0
              ? h(TrendCurve, { data: s.history, width: props.compact ? 352 : 440 })
              : h("div", { className: "up-empty" }, "正在记录 tokens… 每小时桶会填充图表。"),
            h(TrendLegend, null),
          ),
          h("div", { className: "up-card" },
            h("div", { className: "up-card-h" }, h("span", { className: "up-card-t" }, "按模型 · 今日")),
            h(ModelRows, { list: s && s.byModel ? s.byModel : [] }),
          ),
        ),
        h(
          "div",
          { className: "up-foot" },
          h("a", { href: "https://platform.deepseek.com/usage", target: "_blank", rel: "noreferrer" }, "platform.deepseek.com/usage ↗"),
          h("span", { className: "up-note up-mono" },
            props.flash
              ? "已刷新 ✓"
              : s && s.balance && s.balance.lastOkAt
                ? "更新于 " + fmtAgo(new Date(s.balance.lastOkAt).getTime())
                : props.error
                  ? "离线"
                  : "…",
          ),
        ),
      );
    }

    // -------------------------------------------------------------- app
    function HudApp() {
      var snapState = useState(null);
      var snap = snapState[0];
      var errState = useState(null);
      var err = errState[0];
      var expandedState = useState(false);
      var expanded = expandedState[0];
      var compactState = useState(false);
      var compact = compactState[0];
      var refreshingState = useState(false);
      var refreshing = refreshingState[0];
      var posState = useState(function () { return loadPrefs(); });
      var pos = posState[0];
      var setPos = posState[1];

      var dragStateRef = useRef(null);
      var rafRef = useRef(0);
      var latestPosRef = useRef(pos);
      latestPosRef.current = pos;
      var winPosState = useState({ x: 24, y: 24 });
      var winPos = winPosState[0];
      var setWinPos = winPosState[1];
      var closingState = useState(false);
      var closing = closingState[0];
      var setClosing = closingState[1];
      var flashState = useState(false);
      var flash = flashState[0];
      var setFlash = flashState[1];
      var closeTimerRef = useRef(0);

      // Pick the window position so it stays fully on-screen: prefer opening to
      // the right / above the pill, and flip to the left / below when the pill
      // sits near an edge (so the panel never overflows the viewport).
      function computeWinPos(w) {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var h = Math.min(560, vh - 60);
        var gap = 12;
        var pr = vw - latestPosRef.current.r; // pill right edge (x)
        var pb = vh - latestPosRef.current.b; // pill bottom edge (y)
        var left, top;
        if (vw - pr - w - gap >= 8) left = pr + gap; // room to the right
        else if (pr - w - gap >= 8) left = pr - w - gap; // room to the left
        else left = Math.min(Math.max(8, vw - w - 8), Math.max(8, pr - w / 2));
        if (pb - h - gap >= 8) top = pb - h - gap; // room above
        else if (vh - (pb + gap) - h >= 8) top = pb + gap; // room below
        else top = Math.min(Math.max(8, vh - h - 8), Math.max(8, pb - h / 2));
        left = Math.min(Math.max(8, left), Math.max(8, vw - w - 8));
        top = Math.min(Math.max(8, top), Math.max(8, vh - h - 8));
        return { x: left, y: top };
      }

      var applyDrag = useCallback(function (a, b, mode) {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        if (mode === "pill") {
          var w1 = 300, hh1 = 40;
          var r = Math.min(Math.max(8, a), Math.max(8, vw - w1 - 8));
          var bt = Math.min(Math.max(8, b), Math.max(8, vh - hh1 - 8));
          if (r !== latestPosRef.current.r || bt !== latestPosRef.current.b) {
            latestPosRef.current = { r: r, b: bt };
            setPos({ r: r, b: bt });
          }
        } else {
          var ww = compact ? 380 : 468;
          var wh = 560;
          var x = Math.min(Math.max(8, a), Math.max(8, vw - ww - 8));
          var y = Math.min(Math.max(8, b), Math.max(8, vh - wh - 8));
          setWinPos({ x: x, y: y });
        }
      }, [compact]);

      var scheduleDrag = useCallback(function (mode) {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(function () {
          rafRef.current = 0;
          var d = dragStateRef.current;
          if (!d || d.mode !== mode) return;
          applyDrag(d.a, d.b, mode);
        });
      }, [applyDrag]);

      function dragStart(e, mode) {
        if (e.button !== undefined && e.button !== 0) return;
        // Don't start a drag from the traffic lights / refresh / link controls —
        // otherwise the pointer capture swallows their click events.
        if (e.target && e.target.closest && (e.target.closest(".up-light") || e.target.closest(".up-tbtn") || e.target.closest("a"))) return;
        var target = e.currentTarget;
        if (target && typeof target.setPointerCapture === "function") {
          try {
            target.setPointerCapture(e.pointerId);
          } catch (err) {
            /* ignore */
          }
        }
        var base = mode === "pill" ? { a: latestPosRef.current.r, b: latestPosRef.current.b } : { a: winPos.x, b: winPos.y };
        dragStateRef.current = { mode: mode, startX: e.clientX, startY: e.clientY, base: base, a: base.a, b: base.b, moved: false };
      }
      function dragMove(e, mode) {
        var d = dragStateRef.current;
        if (!d || d.mode !== mode) return;
        var dx, dy;
        if (mode === "pill") {
          dx = d.startX - e.clientX;
          dy = d.startY - e.clientY;
        } else {
          dx = e.clientX - d.startX;
          dy = e.clientY - d.startY;
        }
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        d.a = d.base.a + dx;
        d.b = d.base.b + dy;
        scheduleDrag(mode);
      }
      function dragEnd(e, mode) {
        var d = dragStateRef.current;
        if (!d || d.mode !== mode) return;
        dragStateRef.current = null;
        var wasMoved = d.moved;
        if (mode === "pill") {
          savePrefs(latestPosRef.current);
          // 轻点（几乎没移动）→ 立刻打开面板，不再依赖 click 事件（click 可能被
          // 指针捕获/抖动吞掉，导致第一次点击无效）。拖动则不打开。
          if (!wasMoved) openPanel();
        }
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      }

      useEffect(function () {
        var styleId = "dsh-usage-panel-style";
        if (!document.getElementById(styleId)) {
          var st = document.createElement("style");
          st.id = styleId;
          st.setAttribute("data-plugin", "dsh-usage-panel");
          st.setAttribute("data-plugin-css", "up");
          st.textContent = UH_CSS;
          document.head.appendChild(st);
        }
        return function () {
          var el = document.getElementById(styleId);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        };
      }, []);

      useEffect(function () {
        var cancelled = false;
        var timer = 0;
        var failCount = 0;
        var fetchOnce = function () {
          if (cancelled || (typeof document !== "undefined" && document.hidden)) {
            timer = setTimeout(fetchOnce, 15000);
            return;
          }
          loadSnapshot()
            .then(function (value) {
              if (cancelled) return;
              failCount = 0;
              snapState[1](value);
              errState[1](null);
              timer = setTimeout(fetchOnce, 45000);
            })
            .catch(function (e) {
              if (cancelled) return;
              failCount += 1;
              errState[1](e && e.message ? e.message : String(e));
              timer = setTimeout(fetchOnce, failCount > 3 ? 45000 : 15000);
            });
        };
        fetchOnce();
        return function () {
          cancelled = true;
          if (timer) clearTimeout(timer);
        };
      }, []);

      function refreshNow() {
        if (refreshing) return;
        refreshingState[1](true);
        triggerRefresh()
          .then(function (value) {
            snapState[1](value);
            errState[1](null);
            setFlash(true);
            setTimeout(function () { setFlash(false); }, 1400);
          })
          .catch(function (e) {
            errState[1](e && e.message ? e.message : String(e));
          })
          .then(function () {
            refreshingState[1](false);
          });
      }

      function openPanel() {
        if (expanded) return; // 已打开/正在打开则忽略（指针捕获可能重复触发）
        setClosing(false);
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = 0;
        }
        var w = compact ? 380 : 468;
        setWinPos(computeWinPos(w));
        expandedState[1](true);
      }
      function closePanel() {
        if (!expanded || closing) return;
        setClosing(true);
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(function () {
          closeTimerRef.current = 0;
          setClosing(false);
          expandedState[1](false);
          savePrefs(latestPosRef.current);
        }, 180);
      }
      useEffect(function () {
        if (!expanded) return undefined;
        var onKey = function (e) {
          if (e && e.key === "Escape") closePanel();
        };
        window.addEventListener("keydown", onKey);
        return function () {
          window.removeEventListener("keydown", onKey);
        };
      }, [expanded]);

      var dotCls = dotClassFor(snap);

      if (expanded) {
        return h(
          "div",
          { className: "up-root", style: { left: winPos.x + "px", top: winPos.y + "px" } },
          h(Window, {
            snap: snap,
            compact: compact,
            closing: closing,
            error: err,
            refreshing: refreshing,
            flash: flash,
            onClose: closePanel,
            onZoom: function () { closePanel(); },
            onRefresh: refreshNow,
            onTitleDown: function (e) { dragStart(e, "win"); },
            onTitleMove: function (e) { dragMove(e, "win"); },
            onTitleUp: function (e) { dragEnd(e, "win"); },
          }),
        );
      }
      return h(
        "div",
        { className: "up-root", style: { right: pos.r + "px", bottom: pos.b + "px" } },
        h(Pill, {
          snap: snap,
          dotCls: dotCls,
          dragRef: dragStateRef,
          onPointerDown: function (e) { dragStart(e, "pill"); },
          onPointerMove: function (e) { dragMove(e, "pill"); },
          onPointerUp: function (e) { dragEnd(e, "pill"); },
          onPointerCancel: function (e) { dragEnd(e, "pill"); },
        }),
      );
    }

    // ------------------------------------------------------------- plugin
    var inject = ["slots"];

    function apply(ctx) {
      ctx.effect(function () {
        var slots = ctx.get ? ctx.get("slots") : undefined;
        if (!slots) return function () {};
        var dispose = null;
        try {
          slots.inject("shell.overlay", function () {
            var reg = slots.register(
              { name: "shell.overlay", id: "dsh-usage-panel", order: 100, label: "用量面板" },
              function OverlayCell() {
                return h(HudApp, null);
              },
            );
            if (typeof reg === "function") {
              if (dispose) dispose();
              dispose = reg;
            }
          });
        } catch (err) {
          if (typeof console !== "undefined" && console.error) {
            console.error("[dsh-usage-panel] overlay registration failed:", err);
          }
        }
        return function () {
          if (dispose) dispose();
          dispose = null;
        };
      }, "dsh-usage-panel: shell.overlay panel");
    }

    exports.name = "dsh-usage-panel";
    exports.inject = inject;
    exports.apply = apply;

    // Test seam — extra exports are ignored by the Cordis loader.
    exports._ui = {
      HudApp: HudApp,
      Pill: Pill,
      Window: Window,
      StatTiles: StatTiles,
      BalanceCard: BalanceCard,
      ModelRows: ModelRows,
      TrendCurve: TrendCurve,
    };
    exports._fmt = {
      money: fmtMoney,
      tokens: fmtTokens,
      hour: fmtHour,
      ago: fmtAgo,
    };
    return module.exports;
  },
});
