---
name: baobao-daxing
description: 当用户要使用、调整、排查或卸载 DSH 网页里的「宝宝大星」置顶小浮窗（收起态显示上下文百分比与任务数，展开态显示进度条、tokens、任务；白天宝宝夜里大星）时使用；也用于回答它在哪里、怎么拖动、怎么收起、为什么不再自动压缩、怎么手动压缩。
---

# 宝宝大星（用量搭档小浮窗）

> 它是一个 **DSH 前端插件 bundle**（不是 SKILL.md 驱动的能力）：`dsh-sponge-buddy@1.0.2`，
> 安装在 `D:\DeepSeek Harness\workbox\plugins\dsh-sponge-buddy`，通过 `plugin_manager install_bundle` 装入 `desktop` profile。

## 它在哪里、长什么样

- 注册进根插槽 `shell.overlay`（id `sponge-buddy`，order `-10`），常驻最上层、点击穿透、可拖动；**展开 268px 圆角卡片（14px），收起 68×68 小方形（16px 圆角）**。位置与展开态存在 `localStorage` 的 `dsh.sponge-buddy.v2`。
- 拖动范围：**应用窗口视口内任意位置**（可盖住侧栏/右栏，允许贴边部分移出）；展开态右上角 ⌂ 回到右下角。**不能拖出 DSH 窗口到桌面**——Web 插件受窗口裁剪。
- **大号漫画角色 + 反差底色**：角色 92px（收起 66px，收起方块 82×82）；美式漫画风——粗黑描边、歪扭手绘轮廓、一大一小两只眼、咧开的嘴（宝宝：黄块 + 大眼 + 门牙；大星：歪五角星 + 黑点眼 + 笑脸）；白天宝宝压在粉色渐变底上，夜里大星压在黄色渐变底上。
- **自动跟随当前对话**：始终盯着主视图正在显示的会话（`retainedBy.mainView`），并发时取 `updatedAt` 最新者；新建/切换对话 1~2 秒内自动跟上（列表订阅 + 1.5 秒兜底轮询 + 投影自愈重试）。
- **翻页看其它对话**：展开态任务区右侧 `‹ 标题 ›`，左右箭头翻看其它对话的上下文、tokens 与任务进度；翻走时标题加粗，点 `◎` 回到当前对话。翻页用 `retain(..., { source: 'buddyPreview' })` 临时挂载该会话的投影，离开即释放。
- **任务清单不会闪没**：Host 的 `todos` 投影规则是「`todo/write` 写入、`turn/start` 置 null」，每发一条新消息该投影都会被清空。浮窗不依赖它，而是直接扫会话事件窗口里最后一次 `todo/write`（`binding.session.eventSource`），跨回合、跨刷新稳定，拿不到时才退回投影。
- **其它窗口在跑也看得见**：任务行末尾的 `●N` 徽标 = 其它正在运行的对话数（`list.byId[].running`，跨窗口可见），点一下直接切过去。
- **刷新按钮（防卡死）**：展开态底部 `⟳ 立即刷新` 调用 `sessions.refreshProjections()` 并重新解析全部投影，用来救活卡住不更新的卡片。
- **底部只有两个按钮**：`⟳ 立即刷新` 与 `立即压缩`；上下文行显示 `38.5k / 1.05M · 3%`（tokens 与占比同时显示）。

## 桌面级悬浮版（独立程序）

- 位置：`D:\DeepSeek Harness\workbox\buddy-desktop\`，入口 `启动宝宝大星.cmd`（`pythonw buddy.py`）。
- 它是**独立 Windows 置顶窗口**，可拖到任意显示器（本机三块屏都支持），悬浮在所有应用之上。
- 数据只读 `%USERPROFILE%\.dsh\storages\session_projcache\sessions\*.json`（最近修改的会话），每 2 秒刷新：上下文、tokens、任务、标题。
- **限制**：桌面版只读展示，**不能触发 `/compact`**（需要 DSH Host 接口）；压缩由应用内浮窗的「立即压缩」或 DSH 内核负责。
- 开机自启：`设置开机自启.cmd` / `取消开机自启.cmd`；退出：右键菜单 → 退出。
- **白天 06:00–18:00 是宝宝，18:00–06:00 是大星**（本地时区），角色会轻轻浮动、眨眼。
- **收起态**（默认）：154px 胶囊，只显示小脑袋 + `上下文百分比 · 完成/总数`。点脑袋或右上角按钮展开。
- **展开态**：头像与名字同一行，右侧是每 9 秒轮换一句的**横向滚动鼓励语**；下面依次是上下文进度条（tokens + 占比）、本会话 tokens、任务列表，底部只有「⟳ 立即刷新」「立即压缩」。
- **不再显示账户余量**（已移除）。
- **特效**：DSH 正在干活时，浮窗描边变金并有**金色鎏光绕边缘转动**；本轮结束的瞬间触发约 3 秒**庆祝**（底色闪金、中心 ★ 弹跳、星芒向外迸发）。两者都用会话 `running` 状态驱动（`useSessionRunning`），回合级、不随 step 闪烁。

## 数据来源

| 显示项 | 来源 | 取不到时的表现 |
|---|---|---|
| 上下文占用 | 会话投影 `contextPressure`：优先 `projectedTokens`（压缩感知，= `pressureTokens + surfaceTokens − sampledSurfaceTokens`），缺失时退回 `pressureTokens`；再配 `contextWindow` 算百分比。与输入框右下角百分比同源 | 显示「暂不可用」 |

> **别用 `pressureTokens` 当主显示**：它只是上一次请求的 prompt 体积，任何请求都看不见压缩，所以 `/compact` 后它会停在压缩前的大小（典型症状：底部百分比已经掉到 6%，浮窗还写 34%），直到下一次请求上报 usage 才会更新。点「立即刷新」没用——投影重放算出的还是同一个值，问题在取值顺序而不在缓存。`buddy-desktop/buddy.py` 读的是投影缓存里的**状态**（含 `sampledSurfaceTokens`），要自己按同一公式算 `projectedTokens`。
| 本会话 tokens | 会话投影 `tokenUsage`（`uncachedInputTokens` / `outputTokens`） | 显示「暂不可用」 |
| 任务 | 会话投影 `todos`（`todo_write` 维护） | 显示「暂无任务」 |

## 压缩的行为

- 浮窗**不再自动压缩**（90% 自动开关已移除）：DSH 内核在上下文约 **69%** 就会自己压缩——公式 `threshold = floor(min(W×0.8, W−O−65536))`，其中 `W` 是模型窗口（本机 `deepseek-flash` 为 1,048,576）、`O` 是当前路由的 `maxTokens`（本机 256,000）、headroom 默认 65,536，算得 727,040 token ≈ 69.3%，压完占用回落到约 12%（保留 16%×(W−O) ≈ 126,812 原文）。浮窗若也定在 90%，永远轮不到它，所以只保留手动入口。
- **手动压缩**：底部 `立即压缩` 向当前会话发 `/compact`；结果在头像右侧的滚动文字里提示，不弹窗。刚压过再点会因为「摘要不比原区间小」被内核拒绝（日志 `compaction/end` 带 error），属正常保护。
- **每轮留档默认开启**（偏好 `keepTasks`）：任务投影每轮开场即清空，浮窗用 localStorage 留档跨轮显示。
- 想恢复自动压缩：在 `client.js` 里按 `ratio >= NEAR_FULL_RATIO` 调用 `compactSession(activeId)`（注意 DSH 内核会先压，两套机制不建议并存）。

## 偏好存储

浏览器 `localStorage` 键 `dsh.sponge-buddy.v2`：`x` / `y`（位置）、`expanded`（展开态）、`keepTasks`（每轮留档，默认开）。清掉即恢复默认。

## 安装 / 卸载 / 升级

- 重装或升级：改完 `D:\DeepSeek Harness\workbox\plugins\dsh-sponge-buddy` 后，用 `plugin_manager` `action: install_bundle`、`target` 传该绝对目录。
- 卸载：`plugin_manager` `action: remove_bundle`、`target: dsh-sponge-buddy`。
- 验证：`cordis_inspect_query`（client / Slots / listSubTree，root=`shell.overlay`）应看到 occupant `sponge-buddy` 且 `active: true`。
- 前端改动（`client.js`）在当前打包版 GUI 下通常需要**刷新页面**才生效。

## 已知限制

- 角色形象是内置 SVG 简笔卡通，不依赖外部图片。
- 浮窗不会向模型发送任何内容，也不改请求。
- 鼓励语为内置中文短语池，白天与夜间各一套，状态变化（运行中/接近上限）会插入状态提示。
