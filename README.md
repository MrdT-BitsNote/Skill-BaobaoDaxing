# Skill-BaobaoDaxing

宝宝大星 —— DeepSeek Harness Web GUI 的置顶小浮窗，一份真源，两种形态：

- **DSH 插件**（`plugin/`）：装进 `desktop` profile 的 bundle，常驻 `shell.overlay`，收起态显示上下文百分比与任务数，展开态显示进度条、tokens、任务列表。
- **技能说明**（`skill/`）：`baobao-daxing`，告诉 Agent 这个浮窗在哪、怎么拖动、为什么不再自动压缩、怎么排查百分比不刷新。
- **排查工具**（`tools/`）：读 `app.asar` 源码、监听上下文投影、看压缩前后统计的一次性脚本。

桌面级悬浮版（独立 Python 窗口，`workbox/buddy-desktop/`）不在本仓库范围。

## 目录结构

```text
.
├── plugin/                  # dsh-sponge-buddy@1.0.2（DSH bundle）
│   ├── package.json
│   ├── cordis.patch.yml     # 注册进 shell.overlay，含可配置项
│   ├── index.js             # Host 侧：/compact 等命令
│   ├── client.js            # Web 侧：浮窗 UI、跟随会话、投影解析
│   ├── locale/              # 中英文案
│   ├── icon.svg
│   └── README.md            # 完整功能与数据来源说明
├── skill/
│   └── SKILL.md             # baobao-daxing 技能（含排查笔记）
├── tools/
│   ├── asar.ps1             # 读 app.asar：-Build / -Find / -Extract
│   ├── live-pressure.mjs    # 实时打印某会话的上下文投影
│   ├── compact-stats.mjs    # 压缩前后 pressure/surface 统计
│   └── compact-cmds.mjs     # 列出压缩相关命令与插槽
├── README.md
├── LICENSE
└── sync.ps1                 # 从工作区真源同步到本仓库
```

## 快速开始

### 插件（DeepSeek Harness）

用 `plugin_manager` 本地目录安装本仓库的 `plugin/`：

```text
action:  install_bundle
target:  <本仓库路径>/plugin
```

卸载：`action: remove_bundle`，`target: dsh-sponge-buddy`。

前端改动在打包版 GUI 下需要**刷新页面**（Ctrl+F5）才生效；验证用 `cordis_inspect_query`（client / Slots）看 `shell.overlay` 里的 occupant `sponge-buddy` 是否 `active: true`。

### 技能（任意支持 SKILL.md 的 Agent）

把 `skill/` 目录放进 Agent 的 skills 目录：

```text
<skills-dir>/baobao-daxing/SKILL.md
```

触发说法：`宝宝大星`、`那个浮窗`、`上下文百分比不对`、`为什么点了立即压缩还是旧数字`。

## 一个踩过的坑：压缩后百分比不刷新

`contextPressure` 投影里有两个不同的数字：

| 字段 | 含义 | 压缩后 |
| --- | --- | --- |
| `pressureTokens` | **上一次请求**的 prompt 体积（`input + cacheRead + cacheWrite`） | 不动，直到下一次请求上报 usage |
| `projectedTokens` | `pressureTokens + surfaceTokens − sampledSurfaceTokens` | 立刻反映压缩后的真实占用 |

任何请求都不能「看见」压缩，所以 `pressureTokens` 天生滞后。`1.0.1` 及之前浮窗读的是 `pressureTokens`，表现为「输入框显示 6%，浮窗还写着 34%」，点 `⟳ 立即刷新` 也没用（刷新只是重放同一个纯函数）。

`1.0.2` 起优先读 `projectedTokens`，缺失时才退回 `pressureTokens`：

```js
const tokens = num(pressure && pressure.projectedTokens) || num(pressure && pressure.pressureTokens) || 0;
```

桌面版（`buddy.py`）没有投影的线上视图，只能自己按同一公式算：

```python
projected = max(0, pressure_tokens + surface_tokens - sampled_surface_tokens)
```

## 维护

工作区是真源，仓库是镜像。改完插件/技能后：

```powershell
cd <本仓库>
.\sync.ps1 -Commit -Message "plugin: 改了什么"
git push
```

`sync.ps1` 每次重建 `plugin/ skill/ tools/`，并顺手剔掉 `__pycache__`、`*.zip`、`*.log`、`*.pyc`；`README.md`、`LICENSE`、`sync.ps1` 本身不会被覆盖。

## 许可

MIT，见 [LICENSE](LICENSE)。
