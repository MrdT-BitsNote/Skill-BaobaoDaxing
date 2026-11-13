# 宝宝大星

DeepSeek Harness Web GUI 的置顶小浮窗（插件 bundle）。

- **值班**：06:00–18:00 是**宝宝**，18:00–06:00 是**大星**（本地时区）。角色会轻轻浮动、眨眼；点脑袋收起/展开。
- **形状**：展开是 268px 圆角卡片（14px），收起是 **82×82 小方形**（18px 圆角），只显示一颗大脑袋 + 上下文百分比 + 任务完成数。
- **美式漫画造型**：粗黑描边、歪扭手绘轮廓、一大一小两只眼、咧开的嘴；角色 92px（收起 66px）。白天宝宝（黄块）压粉底、夜里大星（粉星）压黄底。
- **跟随当前对话**：新建/切换对话 1~2 秒内自动跟上（列表订阅 + 1.5 秒兜底轮询 + 投影自愈重试）。
- **翻页看其它对话**：任务行右侧 `‹ 标题 ›` 循环翻看别的对话的上下文/tokens/任务，`◎` 回到当前对话（预览只做只读挂载，离开即释放）。
- **刷新按钮**：展开态底部 `⟳ 立即刷新` 调用 `sessions.refreshProjections()` 并重新解析投影，用于救活卡住不更新的卡片。
- **拖动**：拖标题栏可在**应用窗口内任意位置**移动（包括盖在侧栏、右栏上，允许贴边部分移出），位置存 `localStorage`；展开态右上角的 ⌂ 回到右下角。
- **边界**：Web 插件只能活在 DSH 窗口的视口内，**不能拖出窗口到桌面或其它应用**；需要系统级悬浮窗得由 Electron 主进程单独开置顶窗口，不属于插件能力。
- **展开态**：头像与名字同一行，右侧是**滚动轮换的鼓励语**（每 9 秒换一句，横向跑马灯）；下面是上下文进度条（`38.5k / 1.05M · 3%`）、本会话 tokens、任务列表；底部只有两个按钮：`⟳ 立即刷新`、`立即压缩`。
- **压缩**：不再自动压缩。DSH 内核会在上下文约 69%（`floor(min(W×0.8, W−O−65536))`，随模型路由的 `maxTokens` 变化）时自己压缩；浮窗只保留「立即压缩」按钮做手动兜底，避免两套机制互相等。**每轮留档默认开启**（任务投影每轮清空，浮窗用 localStorage 留档跨轮显示）。
- **忙碌 / 完成特效**：干活时描边变金 + 金色鎏光绕边缘转动；本轮结束瞬间闪金 + ★ 弹跳 + 星芒迸发约 3 秒。
- **没有任何账户余额显示**（已按需求移除）。

## 表面与数据

- 注册进根插槽 `shell.overlay`（id `sponge-buddy`，order `-10`），常驻最上层、点击穿透、可拖动；位置与展开态存在 `localStorage` 的 `dsh.sponge-buddy.v2`。
- 数据来自会话投影：`contextPressure`（优先 `projectedTokens`，这是**压缩感知**的值；缺失时才退回 `pressureTokens`）、`tokenUsage`（`uncachedInputTokens`/`outputTokens`）、`todos`（`todo_write` 维护）。
- 为什么不用 `pressureTokens`：它只等于**上一次请求的 prompt 体积**，而没有任何请求能「看见」压缩，所以 `/compact` 之后它会一直停在压缩前的大小，直到下一次请求上报 usage。`projectedTokens = pressureTokens + surfaceTokens − sampledSurfaceTokens` 才会立刻反映压缩后的真实占用，DSH 输入框右下角的百分比用的就是这个公式。

## 安装 / 卸载 / 升级

- 安装：`plugin_manager` `action: install_bundle`，target 为 `D:\DeepSeek Harness\workbox\plugins\dsh-sponge-buddy`。
- 卸载：`plugin_manager` `action: remove_bundle`，target `dsh-sponge-buddy`。
- 前端改动在打包版 GUI 下需要刷新页面；验证用 `cordis_inspect_query`（client / Slots / `shell.overlay`）看 occupant `sponge-buddy` 是否 active。
