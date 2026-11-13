window.__ModuleLoader__.load({
  id: 'dsh-sponge-buddy',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React
    const h = React.createElement

    const NS = 'spongeBuddy'
    const OVERLAY_ID = 'sponge-buddy'
    const STORE_KEY = 'dsh.sponge-buddy.v2'
    const ARCHIVE_KEY = 'dsh.sponge-buddy.archive.v1'
    const DAY_START = 6
    const DAY_END = 18
    const NEAR_FULL_RATIO = 0.8
    const CRITICAL_RATIO = 0.9
    const CHEER_INTERVAL_MS = 9000

    /** Motivational one-liners; the header marquee cycles through them. */
    const CHEERS_DAY = [
      '今天也要元气满满！',
      '别急，一步一步来～',
      '上下文我盯着，你专心干活！',
      '喝口水，起来动一动～',
      '这波稳了，继续！',
      '卡住就换条路，我陪你。',
      '深呼吸，下一行在等你。',
      '进度不错，保持住！',
      '慢慢来，比较快。',
      '你负责思考，我负责盯数字。',
      '累了就歇会儿，我替你看着。',
      '又搞定一件事，真棒！',
    ]
    const CHEERS_NIGHT = [
      '夜深了，我值班～',
      '困了就睡，明天再战。',
      '夜里安静，适合收尾。',
      '大星在，别慌。',
      '再改一行就收工吧。',
      '星星陪你熬这一会儿。',
      '别熬太晚，我替你盯着。',
    ]

    /** Readable Chinese fallback if the client locale namespace is not registered yet. */
    const FALLBACK = {
      panel: '宝宝大星',
      buddyDay: '宝宝',
      buddyNight: '大星',
      context: '上下文',
      tokens: '本会话 tokens',
      tasks: '任务',
      keepTasks: '每轮留档',
      keepTasksTip: '把每轮的任务清单留档，换到下一轮后继续显示',
      compactNow: '立即压缩',
      collapse: '收起',
      expand: '展开',
      unavailable: '暂不可用',
      noSession: '先开个会话，我在这儿等你～',
      running: '正在干活，我盯着上下文！',
      nearLimit: '上下文快满了，注意！',
      compactSent: '已请求压缩',
      compactFailed: '压缩请求失败',
      noTasks: '暂无任务',
      untitled: '（无内容）',
      idle: '空闲',
      reset: '回到右下角',
      refresh: '立即刷新',
      refreshed: '已刷新',
      prev: '上一个对话',
      next: '下一个对话',
      follow: '回到当前对话',
      browse: '左右箭头翻看其它对话进度',
      staleTodos: '上一轮的任务清单（本轮还没写新的）',
      otherRunning: '其它正在跑的对话',
      tip: '拖动标题栏移动我；点脑袋收起/展开；⌂ 回到右下角',
    }

    /**
     * 手绘感五角星：每个角的半径与角度都做了固定抖动，看起来像漫画里歪着画出来的星。
     * 抖动是写死的常量，所以每次渲染完全一致，不会有闪烁。
     */
    const comicStarPath = (cx, cy, outer, inner) => {
      const radii = [1.03, 1.0, 0.93, 1.14, 1.07, 0.88, 0.97, 1.12, 0.94, 1.0]
      const shifts = [0, 8, -7, 6, -8, 7, 5, -6, 8, -5]
      const points = []
      for (let index = 0; index < 10; index += 1) {
        const base = index % 2 === 0 ? outer : inner
        const radius = base * radii[index]
        const angle = ((-90 + index * 36 + shifts[index]) * Math.PI) / 180
        points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
      }
      return 'M' + points.map((point) => point[0].toFixed(1) + ' ' + point[1].toFixed(1)).join(' L ') + ' Z'
    }

    const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
    const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
    const fmtTokens = (value) => {
      const n = num(value)
      if (n === undefined) return '—'
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
      return String(n)
    }
    const isDayHour = (date) => {
      const hour = date.getHours()
      return hour >= DAY_START && hour < DAY_END
    }
    const readStore = () => {
      try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}
      } catch {
        return {}
      }
    }
    const writeStore = (patch) => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...patch }))
      } catch {
        /* storage unavailable — preferences stay in memory */
      }
    }

    const CSS = `
.dsh-sb-root{position:fixed;z-index:2200;pointer-events:auto;user-select:none;color:var(--dsw-alias-label-primary);
  font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.dsh-sb-card{position:relative;width:268px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);
  border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.20);overflow:hidden;transition:border-color .2s,box-shadow .2s,background .3s}
/* 反差配色：白天宝宝（黄海绵）压在大星粉底上，夜里大星（粉海星）压在宝宝黄底上 */
.dsh-sb-card.day{--sb-fg:#2b1420;--sb-sub:#6b3450;--sb-line:rgba(60,10,30,.25);--sb-track:rgba(255,255,255,.45);--sb-fill:#e0487f;
  background:linear-gradient(150deg,#ffb8d3 0%,#ff7bb0 100%);border-color:#e0487f}
.dsh-sb-card.night{--sb-fg:#3d3200;--sb-sub:#6b5a10;--sb-line:rgba(70,55,0,.25);--sb-track:rgba(255,255,255,.5);--sb-fill:#c99300;
  background:linear-gradient(150deg,#ffe98a 0%,#ffd423 100%);border-color:#e0a800}
.dsh-sb-card.day,.dsh-sb-card.night{color:var(--sb-fg)}
.dsh-sb-card.day .dsh-sb-name,.dsh-sb-card.night .dsh-sb-name,
.dsh-sb-card.day .dsh-sb-row .v,.dsh-sb-card.night .dsh-sb-row .v,
.dsh-sb-card.day .dsh-sb-compact,.dsh-sb-card.night .dsh-sb-compact{color:var(--sb-fg)}
.dsh-sb-card.day .dsh-sb-cheer,.dsh-sb-card.night .dsh-sb-cheer,
.dsh-sb-card.day .dsh-sb-mini,.dsh-sb-card.night .dsh-sb-mini,
.dsh-sb-card.day .dsh-sb-label,.dsh-sb-card.night .dsh-sb-label,
.dsh-sb-card.day .dsh-sb-row .k,.dsh-sb-card.night .dsh-sb-row .k,
.dsh-sb-card.day .dsh-sb-btn,.dsh-sb-card.night .dsh-sb-btn,
.dsh-sb-card.day .dsh-sb-task .t,.dsh-sb-card.night .dsh-sb-task .t{color:var(--sb-sub)}
.dsh-sb-card.day .dsh-sb-bar,.dsh-sb-card.night .dsh-sb-bar{background:var(--sb-track)}
.dsh-sb-card.day .dsh-sb-fill,.dsh-sb-card.night .dsh-sb-fill{background:var(--sb-fill)}
.dsh-sb-card.day .dsh-sb-compact,.dsh-sb-card.night .dsh-sb-compact{border-color:var(--sb-line)}
.dsh-sb-card.collapsed{width:82px;height:82px;border-radius:18px}
.dsh-sb-head{display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:grab}
.dsh-sb-card.collapsed .dsh-sb-head{flex-direction:column;justify-content:center;align-items:center;gap:0;
  padding:1px 2px 2px;height:100%}
.dsh-sb-head.dragging{cursor:grabbing}
.dsh-sb-char-btn{flex:0 0 92px;width:92px;height:92px;border:0;background:transparent;padding:0;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
.dsh-sb-card.collapsed .dsh-sb-char-btn{flex:0 0 66px;width:66px;height:66px}
.dsh-sb-char{display:block;width:92px;height:92px;filter:drop-shadow(0 5px 9px rgba(0,0,0,.3));
  animation:sb-bob 3.2s ease-in-out infinite}
.dsh-sb-card.collapsed .dsh-sb-char{width:66px;height:66px}
.dsh-sb-eyes{transform-box:fill-box;transform-origin:center;animation:sb-blink 4.6s infinite}
.dsh-sb-name{font-size:11px;font-weight:600;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.dsh-sb-cheer{font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary);margin-bottom:7px;
  white-space:normal;word-break:break-word;overflow-wrap:anywhere}
.dsh-sb-mini{flex:1;min-width:0;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-align:left;padding-left:1px}
.dsh-sb-card.collapsed .dsh-sb-mini{flex:0 0 auto;font-size:8px;line-height:1.1;text-align:center;
  display:block;padding:0;white-space:nowrap}
.dsh-sb-mini .sep{opacity:.55;margin:0 2px}
.dsh-sb-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;
  padding:3px;border-radius:8px;line-height:0;display:inline-flex;align-items:center;justify-content:center}
.dsh-sb-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-sb-body{padding:0 12px 10px}
.dsh-sb-label{display:flex;justify-content:space-between;align-items:center;font-size:11px;
  color:var(--dsw-alias-label-secondary);margin-bottom:3px;gap:8px}
.dsh-sb-bar{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin-bottom:7px}
.dsh-sb-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .3s ease}
.dsh-sb-fill.warn{background:var(--dsw-alias-state-warn-primary)}
.dsh-sb-fill.err{background:var(--dsw-alias-state-error-primary)}
.dsh-sb-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;padding:2px 0}
.dsh-sb-row .k{color:var(--dsw-alias-label-secondary)}
.dsh-sb-row .v{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-sb-tasks{border-top:1px dashed var(--dsw-alias-border-l1);margin-top:8px;padding-top:6px}
.dsh-sb-nav{display:flex;align-items:center;gap:3px;min-width:0;flex:0 1 auto}
.dsh-sb-navbtn{border:0;background:transparent;color:var(--sb-sub,var(--dsw-alias-label-secondary));cursor:pointer;
  font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:1px 4px;border-radius:6px}
.dsh-sb-navbtn:hover{background:rgba(0,0,0,.09)}
.dsh-sb-navbtn.live{color:var(--sb-fg,var(--dsw-alias-label-primary))}
.dsh-sb-navtitle{max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;
  color:var(--sb-sub,var(--dsw-alias-label-secondary));flex:0 1 auto;min-width:0}
.dsh-sb-navtitle.pinned{color:var(--sb-fg,var(--dsw-alias-label-primary));font-weight:600}
.dsh-sb-pagecount{font-size:9px;color:var(--sb-sub,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums;flex:0 0 auto}
.dsh-sb-task{display:flex;gap:6px;align-items:flex-start;font-size:11px;padding:1px 0}
.dsh-sb-dot{flex:0 0 12px;text-align:center;line-height:1.35;font-size:10px}
.dsh-sb-dot.done{color:var(--dsw-alias-state-success-primary)}
.dsh-sb-dot.active{color:var(--dsw-alias-brand-primary);animation:sb-pulse 1.4s ease-in-out infinite}
.dsh-sb-dot.idle{color:var(--dsw-alias-state-idle-primary)}
.dsh-sb-task .t{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-sb-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
  border-top:1px solid var(--dsw-alias-border-l1);margin-top:8px;padding-top:7px}
.dsh-sb-footbtns{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.dsh-sb-compact{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);
  border-radius:999px;padding:3px 9px;font-size:11px;line-height:1.4;cursor:pointer;
  flex:1 1 0;min-width:0;text-align:center;white-space:nowrap}
.dsh-sb-compact:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-sb-card.running{border-color:#f5c518;box-shadow:0 0 0 1px rgba(245,197,24,.35),0 12px 32px rgba(0,0,0,.20)}
.dsh-sb-ring{position:absolute;inset:-2px;border-radius:inherit;pointer-events:none;padding:2px;
  background:conic-gradient(from var(--sb-a),transparent 0deg 300deg,#f5c518 330deg,#ffe27a 352deg,transparent 360deg);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;
  animation:sb-ring 1.8s linear infinite}
@property --sb-a{syntax:'<angle>';initial-value:0deg;inherits:false}
@keyframes sb-ring{to{--sb-a:360deg}}
.dsh-sb-card.celebrating{animation:sb-flash .22s steps(2,jump-none) infinite}
@keyframes sb-flash{0%{filter:brightness(1)}100%{filter:brightness(1.22) saturate(1.12)}}
.dsh-sb-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:inherit;z-index:2}
.dsh-sb-fx-star{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-size:18px;line-height:1;
  color:#f5c518;animation:sb-bounce .3s ease-in-out infinite}
@keyframes sb-bounce{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(-50%,calc(-50% - 6px))}}
.dsh-sb-spark{position:absolute;left:50%;top:50%;width:6px;height:6px;border-radius:50%;background:#f5c518;
  box-shadow:0 0 6px 2px rgba(245,197,24,.7);animation:sb-spark 1.4s ease-out infinite}
@keyframes sb-spark{0%{transform:translate(-50%,-50%) rotate(var(--sd)) translateY(0) scale(1);opacity:1}
  100%{transform:translate(-50%,-50%) rotate(var(--sd)) translateY(58px) scale(.2);opacity:0}}
@keyframes sb-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes sb-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
@keyframes sb-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.dsh-sb-char,.dsh-sb-eyes,.dsh-sb-dot.active{animation:none}
  .dsh-sb-ring,.dsh-sb-fx-star,.dsh-sb-spark,.dsh-sb-card.celebrating{animation:none}}
`

    /** 宝宝：歪扭的手绘黄块 + 一大一小两只歪眼 + 咧开的嘴，美式漫画粗黑描边。 */
    function SpongeBob() {
      return h(
        'svg',
        { className: 'dsh-sb-char', viewBox: '0 0 100 100', 'aria-hidden': true, focusable: 'false' },
        h(
          'g',
          { transform: 'rotate(-5 50 50)' },
          h('path', {
            d: 'M7 31 Q3 13 21 9 Q41 4 63 8 Q85 11 91 24 Q97 41 92 63 Q89 85 71 89 Q45 94 23 89 Q7 85 6 67 Q2 48 7 31 Z',
            fill: '#ffd400',
            stroke: '#17171a',
            strokeWidth: 5,
            strokeLinejoin: 'round',
            strokeLinecap: 'round',
          }),
          h('circle', { cx: 20, cy: 22, r: 4.6, fill: '#e8bc00' }),
          h('circle', { cx: 79, cy: 26, r: 3.8, fill: '#e8bc00' }),
          h('circle', { cx: 87, cy: 53, r: 4.2, fill: '#e8bc00' }),
          h('circle', { cx: 14, cy: 57, r: 3.6, fill: '#e8bc00' }),
          h('circle', { cx: 63, cy: 16, r: 2.4, fill: '#e8bc00' }),
          h('g', { className: 'dsh-sb-eyes' },
            h('ellipse', {
              cx: 31,
              cy: 37,
              rx: 14.5,
              ry: 16.5,
              fill: '#fff',
              stroke: '#17171a',
              strokeWidth: 4.5,
              transform: 'rotate(-9 31 37)',
            }),
            h('ellipse', {
              cx: 65,
              cy: 40,
              rx: 11.5,
              ry: 13.5,
              fill: '#fff',
              stroke: '#17171a',
              strokeWidth: 4.5,
              transform: 'rotate(8 65 40)',
            }),
            h('circle', { cx: 33, cy: 40, r: 7.6, fill: '#17171a' }),
            h('circle', { cx: 62, cy: 43, r: 6, fill: '#17171a' }),
          ),
          h('path', {
            d: 'M27 63 Q39 56 51 60 Q63 56 74 64 Q67 79 50 80 Q32 80 27 63 Z',
            fill: '#b3241f',
            stroke: '#17171a',
            strokeWidth: 4,
            strokeLinejoin: 'round',
          }),
          h('path', { d: 'M36 62 L45 59 L46 70 L38 72 Z', fill: '#fff' }),
          h('path', { d: 'M51 60 L60 59 L61 71 L52 72 Z', fill: '#fff' }),
        ),
      )
    }

    /** 大星：歪着画的粗黑描边五角星 + 一大一小两只眼 + 一道歪嘴。 */
    function Patrick() {
      return h(
        'svg',
        { className: 'dsh-sb-char', viewBox: '0 0 100 100', 'aria-hidden': true, focusable: 'false' },
        h(
          'g',
          { transform: 'rotate(6 50 50)' },
          h('path', {
            d: comicStarPath(50, 50, 47, 26),
            fill: '#ff5fa2',
            stroke: '#17171a',
            strokeWidth: 5,
            strokeLinejoin: 'round',
          }),
          h('circle', { cx: 39, cy: 41, r: 7.2, fill: '#17171a' }),
          h('circle', { cx: 63, cy: 39, r: 9.6, fill: '#17171a' }),
          h('path', {
            d: 'M41 57 Q52 67 62 55',
            fill: 'none',
            stroke: '#17171a',
            strokeWidth: 4.5,
            strokeLinecap: 'round',
          }),
        ),
      )
    }

    function MinusIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: 'false' },
        h('path', { d: 'M4 8h8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }))
    }

    function PlusIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: 'false' },
        h('path', { d: 'M8 4v8M4 8h8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }))
    }

    function HomeIcon() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: 'false' },
        h('path', { d: 'M3 7.2 8 3l5 4.2V13H3z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round', strokeLinecap: 'round' }))
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        const listSource = ctx.sessions && ctx.sessions.list

        /** A conversation row = a top-level Session (not a subagent / team child). */
        const isTopLevelRow = (row) =>
          Boolean(row && row.parentId === undefined && row.origin !== 'subagent')

        /**
         * The conversations the pager walks, plus which one the Main view shows.
         *
         * A "conversation" = a top-level Session **in the same workspace as the active
         * conversation** with at least one message (non-blank). Subagent children, blank
         * placeholders (e.g. an untouched session from another workspace) and sessions
         * from other workspaces never become a page — so N conversations = N pages.
         */
        const readSessionFeed = () => {
          const empty = { activeId: undefined, rows: [] }
          if (!listSource) return empty
          let state
          try {
            state = listSource.getSnapshot()
          } catch {
            return empty
          }
          if (!state || !state.byId) return empty
          const ids = Array.isArray(state.ids) && state.ids.length > 0 ? state.ids : Object.keys(state.byId)
          const stampOf = (id) => {
            const row = state.byId[id]
            return row && typeof row.updatedAt === 'number' ? row.updatedAt : 0
          }
          const isMainRow = (id) => {
            const row = state.byId[id]
            return Boolean(row && row.retainedBy && (row.retainedBy.mainView || 0) > 0)
          }
          const topLevel = ids.filter((id) => isTopLevelRow(state.byId[id]))

          // 当前对话：主视图保留的顶层会话（并发时取 updatedAt 最新）；
          // 切换瞬间没有主视图保留时，只从顶层且非空白的会话里挑最新。
          let activeId
          const retained = topLevel.filter(isMainRow)
          if (retained.length > 0) {
            activeId = retained[0]
            for (const id of retained) if (stampOf(id) > stampOf(activeId)) activeId = id
          } else {
            for (const id of topLevel) {
              const row = state.byId[id]
              if (row && row.blank === true) continue
              if (activeId === undefined || stampOf(id) > stampOf(activeId)) activeId = id
            }
          }
          const activeRow = activeId === undefined ? undefined : state.byId[activeId]
          const activeCwd = activeRow && typeof activeRow.cwd === 'string' ? activeRow.cwd : undefined

          const rows = []
          for (const id of topLevel) {
            const row = state.byId[id]
            if (id !== activeId) {
              // 空白占位会话（一条消息都没发过）不是一个对话。
              if (row.blank === true) continue
              // 只算与当前对话同一个工作区的会话，别的 workspace 不混进翻页。
              if (activeCwd !== undefined && typeof row.cwd === 'string' && row.cwd !== activeCwd) continue
            }
            const rawTitle = String(row.title || row.displayTitle || '').trim()
            rows.push({
              id,
              title: (rawTitle === '' ? (row.blank ? '新对话' : '未命名') : rawTitle).slice(0, 28),
              running: row.running === true,
            })
          }
          return { activeId, rows }
        }

        /**
         * Live Session feed: which Session the Main view shows plus the ordered rows the
         * pager walks. Re-reads on every list change, on a slow poll, and on demand after
         * a manual refresh, so switching or adding a conversation is always followed.
         */
        const useSessionFeed = (revision) => {
          const [feed, setFeed] = useState({ activeId: undefined, rows: [] })
          const sigRef = useRef('')
          const sync = useCallback(() => {
            const next = readSessionFeed()
            const sig =
              String(next.activeId) +
              '|' +
              next.rows.map((row) => row.id + ':' + row.title + ':' + (row.running ? '1' : '0')).join(',')
            if (sig === sigRef.current) return
            sigRef.current = sig
            setFeed(next)
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [])
          useEffect(() => {
            sync()
            let un = () => {}
            try {
              un = listSource ? listSource.subscribe(sync) : () => {}
            } catch {
              un = () => {}
            }
            const timer = setInterval(sync, 1500)
            return () => {
              try {
                un()
              } catch {
                /* subscription already disposed */
              }
              clearInterval(timer)
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [sync, revision])
          return feed
        }

        const useLocaleRevision = () => {
          const subscribe = useCallback((listener) => ctx.locale.subscribe(listener), [])
          const getSnapshot = useCallback(() => ctx.locale.getSnapshot().active, [])
          return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
        }

        /** One client-visible Session projection, or undefined until it is available. */
        const useProjection = (sessionId, key, revision) => {
          const [entry, setEntry] = useState({ sessionId: undefined, value: undefined })
          const [tick, setTick] = useState(0)
          const attempted = useRef({})
          useEffect(() => {
            let alive = true
            let un = () => {}
            // Self-healing heartbeat: a freshly opened conversation materialises its
            // binding shortly and a re-bound projection can replace its store, so
            // re-resolve on a slow tick rather than staying stuck on an old value.
            const heartbeat = setInterval(() => {
              if (alive) setTick((n) => n + 1)
            }, 2500)
            const finish = () => {
              alive = false
              clearInterval(heartbeat)
              try {
                un()
              } catch {
                /* subscription already disposed */
              }
            }
            if (sessionId === undefined) {
              setEntry({ sessionId: undefined, value: undefined })
              return finish
            }
            const binding = ctx.sessions.binding(sessionId)
            let source
            if (binding) {
              try {
                source = binding.session.projections.faceOf(key)
              } catch {
                source = undefined
              }
            }
            if (!source) {
              setEntry({ sessionId, value: undefined })
              if (attempted.current[sessionId] !== true) {
                attempted.current[sessionId] = true
                void ctx.sessions
                  .using(sessionId, { source: 'controllerOperation' }, () => undefined)
                  .catch(() => {})
              }
              return finish
            }
            const read = () => {
              if (!alive) return
              let next
              try {
                next = source.getSnapshot()
              } catch {
                return
              }
              setEntry((previous) =>
                previous.sessionId === sessionId && previous.value === next
                  ? previous
                  : { sessionId, value: next },
              )
            }
            read()
            try {
              un = source.subscribe(read)
            } catch {
              un = () => {}
            }
            return finish
          }, [sessionId, key, tick, revision])
          return entry.sessionId === sessionId ? entry.value : undefined
        }

        /** Whether the current Session has a running Agent turn. */
        const useSessionRunning = (sessionId, revision) => {
          const [entry, setEntry] = useState({ sessionId: undefined, running: false })
          const [tick, setTick] = useState(0)
          useEffect(() => {
            let alive = true
            let un = () => {}
            // Keep re-resolving so a just-opened conversation and a re-bound Session
            // both start reporting their running state without a page reload.
            const heartbeat = setInterval(() => {
              if (alive) setTick((n) => n + 1)
            }, 2500)
            const finish = () => {
              alive = false
              clearInterval(heartbeat)
              try {
                un()
              } catch {
                /* subscription already disposed */
              }
            }
            if (sessionId === undefined) {
              setEntry({ sessionId: undefined, running: false })
              return finish
            }
            const binding = ctx.sessions.binding(sessionId)
            if (!binding) {
              setEntry({ sessionId, running: false })
              return finish
            }
            const session = binding.session
            const read = () => {
              if (!alive) return
              let next = false
              try {
                const snapshot = session.getSnapshot()
                next = Boolean(snapshot && snapshot.running)
              } catch {
                next = false
              }
              setEntry((previous) =>
                previous.sessionId === sessionId && previous.running === next
                  ? previous
                  : { sessionId, running: next },
              )
            }
            read()
            try {
              un = session.subscribe(read)
            } catch {
              un = () => {}
            }
            return finish
          }, [sessionId, tick, revision])
          return entry.sessionId === sessionId ? entry.running : false
        }

        /** Per-session task archive (localStorage) used by the 「每轮留档」 switch. */
        const readArchive = () => {
          try {
            const parsed = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '{}')
            return parsed && typeof parsed === 'object' ? parsed : {}
          } catch {
            return {}
          }
        }
        const writeArchive = (sessionId, todos) => {
          try {
            const archive = readArchive()
            archive[sessionId] = todos
            const keys = Object.keys(archive)
            for (const key of keys.slice(0, Math.max(0, keys.length - 20))) delete archive[key]
            localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive))
          } catch {
            /* storage unavailable — archive stays in memory for this page */
          }
        }

        /**
         * Task list for one Session. Priority:
         *   1. live `todos` projection (canonical `{content,status}`, accurate mid-turn);
         *   2. the last `todo/write` in the Session event window;
         *   3. the list row's `projectionValues.todos` (last-resort);
         *   4. with `keep` on, the archived list from an earlier turn of the same Session.
         * When the current window has no `todo/write`, page history back (bounded) so a
         * task list from an earlier turn is still found.
         */
        const useLatestTodos = (sessionId, revision, keep) => {
          const [state, setState] = useState({ todos: [], source: 'none', events: 0, todoEvents: 0 })
          const [tick, setTick] = useState(0)
          const searchedRef = useRef({})
          useEffect(() => {
            let alive = true
            let un = () => {}
            const heartbeat = setInterval(() => {
              if (alive) setTick((n) => n + 1)
            }, 2500)
            const finish = () => {
              alive = false
              clearInterval(heartbeat)
              try {
                un()
              } catch {
                /* already disposed */
              }
            }
            if (sessionId === undefined) {
              setState({ todos: [], source: 'none', events: 0, todoEvents: 0 })
              return finish
            }
            const binding = ctx.sessions.binding(sessionId)
            if (!binding || !binding.session) {
              setState({ todos: [], source: 'none', events: 0, todoEvents: 0 })
              return finish
            }
            const session = binding.session

            const scan = () => {
              let list = null
              let source = 'none'
              let events = 0
              let todoEvents = 0
              // 1) 本轮投影：schema 明确是 [{content,status}]，mid-turn 时内容最准。
              try {
                list = session.projections.faceOf('todos').getSnapshot()
              } catch {
                list = null
              }
              if (Array.isArray(list) && list.length > 0) {
                source = 'projection'
              } else {
                // 2) 事件窗口里最后一次 todo/write。
                try {
                  const snapshot = session.eventSource.getSnapshot()
                  const entries = (snapshot && snapshot.entries) || []
                  events = entries.length
                  for (let i = entries.length - 1; i >= 0; i -= 1) {
                    const event = entries[i] && entries[i].event
                    if (event && event.type === 'todo/write') {
                      todoEvents += 1
                      if (!Array.isArray(list)) list = event.data && event.data.todos
                    }
                  }
                } catch {
                  list = null
                }
                if (Array.isArray(list) && list.length > 0) {
                  source = 'event'
                } else {
                  // 3) 列表行 projectionValues.todos（兜底）
                  try {
                    const row = listSource && listSource.getSnapshot().byId[sessionId]
                    const pv = row && row.projectionValues
                    list = pv && pv.todos
                  } catch {
                    list = null
                  }
                  if (Array.isArray(list) && list.length > 0) source = 'list'
                }
              }
              return { todos: normalizeTodos(list), source, events, todoEvents }
            }

            // 当前窗口没有任务时，向上翻最多 3 页历史找最近一次 todo/write。
            const searchKey = String(sessionId) + ':' + String(revision)
            const searchOlder = () => {
              if (typeof session.loadOlder !== 'function' || session.hasMore !== true) return
              let record = searchedRef.current[searchKey]
              if (record === undefined) {
                record = { attempts: 0, done: false }
                searchedRef.current[searchKey] = record
              }
              if (record.done || record.attempts >= 3) return
              record.attempts += 1
              Promise.resolve()
                .then(() => session.loadOlder())
                .catch(() => {
                  record.done = true
                })
            }

            const read = () => {
              if (!alive) return
              const result = scan()
              if (result.todos.length > 0) {
                if (keep) writeArchive(sessionId, result.todos)
                setState(result)
                return
              }
              if (keep) {
                const archived = readArchive()[sessionId]
                if (Array.isArray(archived) && archived.length > 0) {
                  setState({ ...result, todos: normalizeTodos(archived), source: 'archive' })
                  return
                }
              }
              setState(result)
              searchOlder()
            }

            read()
            try {
              un = session.eventSource.subscribe(read)
            } catch {
              un = () => {}
            }
            return finish
          }, [sessionId, tick, revision, keep])
          return state
        }

        /** Normalize a todo list to `{ content: string, status }` regardless of source shape. */
        const normalizeTodos = (list) => {
          if (!Array.isArray(list)) return []
          const out = []
          for (const item of list) {
            if (typeof item === 'string') {
              out.push({ content: item, status: 'pending' })
              continue
            }
            if (!item || typeof item !== 'object') continue
            const raw =
              item.content ?? item.text ?? item.title ?? item.name ?? item.label ?? item.description ?? ''
            out.push({
              content: typeof raw === 'string' ? raw : raw == null ? '' : String(raw),
              status: typeof item.status === 'string' ? item.status : 'pending',
            })
          }
          return out
        }

        const compactSession = (sessionId) => {
          const binding = ctx.sessions.binding(sessionId)
          if (!binding) return Promise.reject(new Error('session is not live'))
          try {
            return Promise.resolve(binding.session.command('/compact'))
          } catch (error) {
            return Promise.reject(error)
          }
        }

        function Buddy() {
          const localeRevision = useLocaleRevision()
          const t = useMemo(() => {
            let bound
            try {
              bound = ctx.locale.bind(NS)
            } catch {
              bound = undefined
            }
            return (key) => {
              if (typeof bound === 'function') {
                try {
                  const value = bound(key)
                  if (value !== undefined && value !== null && value !== key) return String(value)
                } catch {
                  /* fall through to the bundled fallback */
                }
              }
              return FALLBACK[key] !== undefined ? FALLBACK[key] : key
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [localeRevision])

          const [prefs] = useState(() => readStore())
          const [now, setNow] = useState(() => Date.now())
          const [expanded, setExpanded] = useState(() => readStore().expanded === true)
          const [pos, setPos] = useState(() => {
            const store = readStore()
            return num(store.x) !== undefined && num(store.y) !== undefined ? { x: store.x, y: store.y } : null
          })
          const [dragging, setDragging] = useState(false)
          const [toast, setToast] = useState('')
          const [cheerIndex, setCheerIndex] = useState(0)
          const [celebrating, setCelebrating] = useState(false)
          const dragRef = useRef(null)
          const rootRef = useRef(null)
          const prevRunningRef = useRef({ id: undefined, running: false })

          const [refreshTick, setRefreshTick] = useState(0)
          const [pinnedId, setPinnedId] = useState(null)

          const feed = useSessionFeed(refreshTick)
          const activeId = feed.activeId
          const rows = feed.rows

          // Switching to a conversation the user is actually looking at clears the pin.
          const prevActiveRef = useRef(undefined)
          useEffect(() => {
            if (prevActiveRef.current !== activeId) {
              prevActiveRef.current = activeId
              setPinnedId(null)
            }
          }, [activeId])

          const pinnedValid =
            pinnedId !== null && rows.some((row) => row.id === pinnedId) ? pinnedId : null
          const viewing = pinnedValid !== null && pinnedValid !== activeId
          const sessionId = pinnedValid !== null ? pinnedValid : activeId
          const viewedRow = rows.find((row) => row.id === sessionId)
          const viewIndex = rows.findIndex((row) => row.id === sessionId)

          // Hold a light, read-only retention on a previewed conversation so its tasks,
          // tokens and context are available while the user pages through it. Released as
          // soon as the user moves on or returns to the live conversation.
          useEffect(() => {
            if (pinnedValid === null || pinnedValid === activeId) return undefined
            let reference
            try {
              reference = ctx.sessions.retain(pinnedValid, { source: 'buddyPreview' })
            } catch {
              return undefined
            }
            void Promise.resolve(reference.ready).catch(() => {})
            return () => {
              try {
                reference.release()
              } catch {
                /* already released */
              }
            }
          }, [pinnedValid, activeId])

          /** Walk the Session list; the arrows wrap around. */
          const stepSession = (delta) => {
            if (rows.length === 0) return
            const currentIndex = sessionId === undefined ? -1 : rows.findIndex((row) => row.id === sessionId)
            const nextIndex =
              currentIndex < 0 ? (delta > 0 ? 0 : rows.length - 1) : (currentIndex + delta + rows.length) % rows.length
            const nextId = rows[nextIndex].id
            setPinnedId(nextId === activeId ? null : nextId)
          }

          const followActive = () => setPinnedId(null)

          /** Manual recovery: ask the Host to re-publish projections and re-resolve locally. */
          const refreshData = () => {
            if (sessionId !== undefined && typeof ctx.sessions.refreshProjections === 'function') {
              try {
                void Promise.resolve(ctx.sessions.refreshProjections(sessionId)).catch(() => {})
              } catch {
                /* session is not live */
              }
            }
            // 强制重新拉取会话列表：新建/其它窗口的对话若还没同步进来，这一步补上。
            try {
              if (typeof ctx.sessions.refresh === 'function') {
                void Promise.resolve(ctx.sessions.refresh()).catch(() => {})
              }
            } catch {
              /* list refresh not exposed */
            }
            setRefreshTick((value) => value + 1)
            setToast(t('refreshed'))
          }

          const running = useSessionRunning(sessionId, refreshTick)
          const pressure = useProjection(sessionId, 'contextPressure', refreshTick)
          const usage = useProjection(sessionId, 'tokenUsage', refreshTick)
          const todosState = useLatestTodos(sessionId, refreshTick, prefs.keepTasks !== false)
          const todos = todosState.todos

          // A turn that just finished triggers the celebration; a fresh turn starts the gold ring.
          // Only the SAME Session counts, so paging between conversations never fakes a finish.
          useEffect(() => {
            const prev = prevRunningRef.current
            prevRunningRef.current = { id: sessionId, running }
            if (prev.id === sessionId && prev.running && !running) {
              setCelebrating(true)
              const timer = setTimeout(() => setCelebrating(false), 3000)
              return () => clearTimeout(timer)
            }
            return undefined
          }, [running, sessionId])

          // 任务清单来自 useLatestTodos：直接读会话事件窗口里最后一次 todo/write，
          // 跨回合、跨刷新都稳定，不会因 Host 每回合清空投影而消失或串台。
          const doneCount = todos.filter((item) => item && item.status === 'completed').length
          const totalCount = todos.length
          const activeTask = todos.find((item) => item && item.status === 'in_progress')
          /** 其它窗口 / 后台回合里正在跑的对话（本窗口主视图之外的）。 */
          const otherRunning = rows.filter((row) => row.running && row.id !== sessionId)

          /** Active task first, so a long list never hides what is actually running. */
          const orderedTodos = (() => {
            if (todos.length === 0) return todos
            const index = todos.findIndex((item) => item && item.status === 'in_progress')
            if (index <= 0) return todos
            const copy = todos.slice()
            const [active] = copy.splice(index, 1)
            copy.unshift(active)
            return copy
          })()

          const contextWindow = num(pressure && pressure.contextWindow)
          // `projectedTokens` is the compaction-aware figure (last usage sample plus the
          // surface's movement since it was taken); `pressureTokens` is that sample alone
          // and cannot see a compaction until the next request reports usage. Prefer the
          // projected value exactly like the composer's own occupancy readout, or the card
          // keeps showing the pre-compaction size after /compact.
          const pressureTokens =
            num(pressure && pressure.projectedTokens) !== undefined
              ? num(pressure.projectedTokens)
              : num(pressure && pressure.pressureTokens)
          const ratio =
            contextWindow !== undefined && pressureTokens !== undefined && contextWindow > 0
              ? Math.min(1, pressureTokens / contextWindow)
              : undefined
          const pct = ratio === undefined ? undefined : Math.round(ratio * 100)

          const usageText = (() => {
            if (!usage) return undefined
            const input = num(usage.inputTokens) !== undefined ? num(usage.inputTokens) : num(usage.uncachedInputTokens)
            const output = num(usage.outputTokens)
            if (input === undefined && output === undefined) return undefined
            const parts = []
            if (input !== undefined) parts.push('in ' + fmtTokens(input))
            if (output !== undefined) parts.push('out ' + fmtTokens(output))
            return parts.join(' · ')
          })()

          const day = isDayHour(new Date(now))

          /** Rotating encouragement pool: status lines first, then the mood lines of the shift. */
          const cheerPool = useMemo(() => {
            const pool = []
            if (sessionId === undefined) pool.push(t('noSession'))
            else if (running) pool.push(t('running'))
            if (ratio !== undefined && ratio >= NEAR_FULL_RATIO) pool.push(t('nearLimit'))
            const mood = day ? CHEERS_DAY : CHEERS_NIGHT
            for (const line of mood) pool.push(line)
            return pool
          }, [sessionId, running, ratio, day, t])

          useEffect(() => { setCheerIndex(0) }, [cheerPool])
          useEffect(() => {
            const timer = setInterval(() => setCheerIndex((value) => value + 1), CHEER_INTERVAL_MS)
            return () => clearInterval(timer)
          }, [])
          const cheer = cheerPool[cheerIndex % cheerPool.length]
          const marqueeLine = toast || cheer

          useEffect(() => {
            const timer = setInterval(() => setNow(Date.now()), 30000)
            return () => clearInterval(timer)
          }, [])

          useEffect(() => {
            if (pos) return
            setPos({
              x: Math.max(12, window.innerWidth - 288),
              y: Math.max(12, window.innerHeight - 208),
            })
          }, [pos])

          useEffect(() => {
            const onResize = () => {
              setPos((current) => {
                if (!current) return current
                return {
                  x: clamp(current.x, 32 - 288, Math.max(32, window.innerWidth - 32)),
                  y: clamp(current.y, 0, Math.max(0, window.innerHeight - 32)),
                }
              })
            }
            window.addEventListener('resize', onResize)
            return () => window.removeEventListener('resize', onResize)
          }, [])

          useEffect(() => {
            writeStore({ expanded })
          }, [expanded])

          useEffect(() => {
            if (pos) writeStore({ x: pos.x, y: pos.y })
          }, [pos])

          useEffect(() => {
            writeStore({ keepTasks: prefs.keepTasks !== false })
          }, [prefs.keepTasks])

          useEffect(() => {
            if (!toast) return
            const timer = setTimeout(() => setToast(''), 2600)
            return () => clearTimeout(timer)
          }, [toast])

          const compactNow = () => {
            if (sessionId === undefined) return
            void compactSession(sessionId)
              .then(() => setToast(t('compactSent')))
              .catch(() => setToast(t('compactFailed')))
          }

          const resetPos = () => {
            const next = {
              x: Math.max(12, window.innerWidth - 288),
              y: Math.max(12, window.innerHeight - 208),
            }
            setPos(next)
            writeStore({ x: next.x, y: next.y })
          }

          const onHeadPointerDown = (event) => {
            if (event.button !== undefined && event.button !== 0) return
            if (event.target && event.target.closest && event.target.closest('button')) return
            const current = pos
            if (!current) return
            dragRef.current = { offsetX: event.clientX - current.x, offsetY: event.clientY - current.y }
            setDragging(true)
          }

          useEffect(() => {
            if (!dragging) return
            const onMove = (event) => {
              const drag = dragRef.current
              if (!drag) return
              const node = rootRef.current
              const width = node ? node.offsetWidth : 268
              const height = node ? node.offsetHeight : 140
              setPos({
                x: clamp(event.clientX - drag.offsetX, 32 - width, Math.max(32, window.innerWidth - 32)),
                y: clamp(event.clientY - drag.offsetY, 0, Math.max(0, window.innerHeight - 32)),
              })
            }
            const onUp = () => {
              dragRef.current = null
              setDragging(false)
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
            window.addEventListener('pointercancel', onUp)
            return () => {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
              window.removeEventListener('pointercancel', onUp)
            }
          }, [dragging])

          const fillClass =
            'dsh-sb-fill' +
            (ratio !== undefined && ratio >= CRITICAL_RATIO ? ' err' : ratio !== undefined && ratio >= NEAR_FULL_RATIO ? ' warn' : '')

          const char = day ? h(SpongeBob) : h(Patrick)
          const collapsed = !expanded
          const taskText = totalCount ? doneCount + '/' + totalCount : '0/0'
          const miniText = (viewing ? '‹ ' : '') + (pct === undefined ? '—' : pct + '%') + ' · ' + taskText
          const sparks = celebrating ? Array.from({ length: 10 }, (_, index) => index) : []

          return h(
            'div',
            {
              ref: rootRef,
              className: 'dsh-sb-root',
              style: pos
                ? { left: pos.x + 'px', top: pos.y + 'px' }
                : { right: '20px', bottom: '20px' },
            },
            h('style', null, CSS),
            h(
              'div',
              {
                className:
                  'dsh-sb-card' +
                  (collapsed ? ' collapsed' : '') +
                  (day ? ' day' : ' night') +
                  (running ? ' running' : '') +
                  (celebrating ? ' celebrating' : ''),
                role: 'region',
                'aria-label': t('panel'),
              },
              running && !celebrating ? h('div', { className: 'dsh-sb-ring' }) : null,
              celebrating
                ? h(
                    'div',
                    { className: 'dsh-sb-fx' },
                    h('span', { className: 'dsh-sb-fx-star' }, '★'),
                    sparks.map((index) =>
                      h('span', {
                        key: index,
                        className: 'dsh-sb-spark',
                        style: { '--sd': index * 36 + 'deg', animationDelay: index * 0.07 + 's' },
                      }),
                    ),
                  )
                : null,
              h(
                'div',
                {
                  className: 'dsh-sb-head' + (dragging ? ' dragging' : ''),
                  onPointerDown: onHeadPointerDown,
                  onDoubleClick: () => setExpanded((value) => !value),
                  title: t('tip'),
                },
                h(
                  'button',
                  {
                    className: 'dsh-sb-char-btn',
                    type: 'button',
                    onClick: () => setExpanded((value) => !value),
                    'aria-label': expanded ? t('collapse') : t('expand'),
                  },
                  char,
                ),
                collapsed
                  ? h('span', { className: 'dsh-sb-mini', title: t('context') + ' · ' + t('tasks') }, miniText)
                  : h(
                      'div',
                      { style: { flex: '1', minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px' } },
                      h('span', { className: 'dsh-sb-name' }, day ? t('buddyDay') : t('buddyNight')),
                    ),
                expanded
                  ? h(
                      'button',
                      {
                        className: 'dsh-sb-btn',
                        type: 'button',
                        onClick: (event) => {
                          event.stopPropagation()
                          resetPos()
                        },
                        'aria-label': t('reset'),
                        title: t('reset'),
                      },
                      h(HomeIcon),
                    )
                  : null,
                expanded
                  ? h(
                      'button',
                      {
                        className: 'dsh-sb-btn',
                        type: 'button',
                        onClick: (event) => {
                          event.stopPropagation()
                          setExpanded((value) => !value)
                        },
                        'aria-label': t('collapse'),
                        title: t('collapse'),
                      },
                      h(MinusIcon),
                    )
                  : null,
              ),
              collapsed
                ? null
                : h(
                    'div',
                    { className: 'dsh-sb-body' },
                    h('div', { className: 'dsh-sb-cheer', title: marqueeLine }, marqueeLine),
                    h(
                      'div',
                      { className: 'dsh-sb-label' },
                      h('span', null, t('context')),
                      h(
                        'span',
                        null,
                        pressureTokens !== undefined && contextWindow !== undefined
                          ? fmtTokens(pressureTokens) + ' / ' + fmtTokens(contextWindow) +
                            (pct === undefined ? '' : ' · ' + pct + '%')
                          : t('unavailable'),
                      ),
                    ),
                    h('div', { className: 'dsh-sb-bar' }, h('div', { className: fillClass, style: { width: (pct === undefined ? 0 : pct) + '%' } })),
                    h(
                      'div',
                      { className: 'dsh-sb-row' },
                      h('span', { className: 'k' }, t('tokens')),
                      h('span', { className: 'v' }, usageText || t('unavailable')),
                    ),
                    h(
                      'div',
                      { className: 'dsh-sb-tasks' },
                      h(
                        'div',
                        { className: 'dsh-sb-label' },
                        h(
                          'span',
                          { style: { flex: '0 0 auto' } },
                          t('tasks') + (totalCount ? ' ' + doneCount + '/' + totalCount : '') + (activeTask ? ' ●' : ''),
                        ),
                        h(
                          'div',
                          { className: 'dsh-sb-nav', title: t('browse') },
                          h(
                            'button',
                            { className: 'dsh-sb-navbtn', type: 'button', title: t('prev'), onClick: () => stepSession(-1) },
                            '‹',
                          ),
                          h(
                            'span',
                            {
                              className: 'dsh-sb-navtitle' + (viewing ? ' pinned' : ''),
                              title: viewedRow ? viewedRow.title : '',
                            },
                            (viewedRow && viewedRow.running ? '● ' : '') +
                              (viewedRow ? viewedRow.title : t('noSession')),
                          ),
                          h(
                            'span',
                            { className: 'dsh-sb-pagecount' },
                            viewIndex >= 0 && rows.length > 1 ? viewIndex + 1 + '/' + rows.length : '',
                          ),
                          h(
                            'button',
                            { className: 'dsh-sb-navbtn', type: 'button', title: t('next'), onClick: () => stepSession(1) },
                            '›',
                          ),
                          otherRunning.length > 0
                            ? h(
                                'button',
                                {
                                  className: 'dsh-sb-navbtn live',
                                  type: 'button',
                                  title: t('otherRunning') + ' ' + otherRunning.length,
                                  onClick: () => setPinnedId(otherRunning[0].id === activeId ? null : otherRunning[0].id),
                                },
                                '●' + otherRunning.length,
                              )
                            : null,
                          viewing
                            ? h(
                                'button',
                                { className: 'dsh-sb-navbtn live', type: 'button', title: t('follow'), onClick: followActive },
                                '◎',
                              )
                            : null,
                        ),
                      ),
                      totalCount === 0
                        ? h(
                            'div',
                            { className: 'dsh-sb-task' },
                            h('span', { className: 'dsh-sb-dot idle' }, '·'),
                            h('span', { className: 't', style: { color: 'var(--dsw-alias-label-secondary)' } }, t('noTasks')),
                          )
                        : orderedTodos.slice(0, 3).map((item, index) =>
                            h(
                              'div',
                              { className: 'dsh-sb-task', key: index },
                              h(
                                'span',
                                {
                                  className:
                                    'dsh-sb-dot ' +
                                    (item.status === 'completed' ? 'done' : item.status === 'in_progress' ? 'active' : 'idle'),
                                },
                                item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○',
                              ),
                              h('span', { className: 't', title: item.content }, item.content || t('untitled')),
                            ),
                          ),
                      totalCount > 3
                        ? h(
                            'div',
                            { className: 'dsh-sb-task' },
                            h('span', { className: 'dsh-sb-dot idle' }, '…'),
                            h('span', { className: 't', style: { color: 'var(--dsw-alias-label-secondary)' } }, '+' + (totalCount - 3)),
                          )
                        : null,
                    ),
                    h(
                      'div',
                      { className: 'dsh-sb-foot' },
                      h(
                        'div',
                        { className: 'dsh-sb-footbtns' },
                        h(
                          'button',
                          {
                            className: 'dsh-sb-compact',
                            type: 'button',
                            onClick: refreshData,
                            title: t('refresh'),
                            'aria-label': t('refresh'),
                          },
                          '⟳',
                          ' ' + t('refresh'),
                        ),
                        h(
                          'button',
                          { className: 'dsh-sb-compact', type: 'button', onClick: compactNow, title: t('compactNow') },
                          t('compactNow'),
                        ),
                      ),
                    ),
                  ),
            ),
          )
        }

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: OVERLAY_ID, order: -10 },
            Buddy,
          ),
        )
      },
    }
  },
})
