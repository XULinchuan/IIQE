# 微信个人号回复助手设计（V1）

- 日期：2026-03-17
- 状态：Design Approved by User（conversation）
- 目标平台：Mac 版微信 + iPhone（仅本人安装，不上架）

## 1. 目标与边界

### 1.1 目标
构建一个“微信个人号回复助手”：
- 在 Mac 端对指定会话自动轮询并检测新消息。
- 基于会话上下文调用 OpenAI 生成候选回复。
- 将候选回复同步到 iPhone 独立 App。
- 用户在 iPhone 点“复制回复”，再回微信手动发送。

### 1.2 明确边界
- 不在 iPhone 端直接读取微信消息。
- 不自动发送微信消息。
- 允许聊天内容上传到云端模型（OpenAI）。
- 依赖 Mac 微信在线且窗口布局固定。

### 1.3 V1 范围
- 支持 3 个会话轮询（后续可扩展到 5 个）。
- 生成 2-3 条候选回复。
- 支持全局风格、会话级风格覆盖、即时改写。

### 1.4 V1 非目标
- 群聊复杂说话人解析。
- 多微信账号并发。
- 自动化发送或半自动注入到微信输入框。
- 知识库 RAG（文档检索增强）能力。

## 2. 方案比较与选型

### 方案 A（选中）：Mac 轮询采集 + 云端生成 + iPhone 收件
- 通过 Mac UI 自动化 + OCR 采集指定会话新增消息。
- 调 OpenAI 生成候选回复。
- 通过同步服务推送/拉取到 iPhone App。

优点：
- 无需越狱，不改微信客户端。
- 满足“指定会话后自动轮询”的核心诉求。
- 在合规和可维护性间平衡最好。

缺点：
- 依赖微信桌面 UI 稳定性。
- OCR 质量受字体、缩放、主题影响。

### 方案 B：Mac 插件/逆向注入
优点：自动化程度高。  
缺点：封号与合规风险高，维护成本高。  
结论：不采用。

### 方案 C：手动快捷键抓取 + 云端生成 + iPhone 收件
优点：实现快、稳定。  
缺点：自动化不足，不满足核心体验。  
结论：不采用。

## 3. 架构与数据流

## 3.1 组件

1. Mac Poller（轮询采集器）
- 维护 watchlist（3 个会话）。
- 执行 UI 导航、消息区域截图、OCR 识别。
- 产生标准化消息事件。

2. Context Builder（上下文构建器）
- 为每个会话维护最近消息窗口。
- 组装 Prompt：最近上下文 + 风格规则 + 安全约束。

3. Reply Generator（生成器）
- 调 OpenAI 生成 2-3 条候选回复。
- 输出结构化结果：文本、风格标签、生成时间、简要理由。

4. Uploader（上传器，Mac 本地）
- 接收本地 `MessageEvent` 与 `CandidateReply`，统一调用 Sync/API。
- 负责 API 写入重试、死信队列（DLQ）和幂等键生成。

5. Sync/API Service（同步服务）
- 接收消息事件与候选回复。
- 提供 iPhone 拉取接口。
- 存储去重指纹、会话状态、候选历史。

6. iPhone Receiver App（收件端）
- 展示会话列表、候选回复、更新时间。
- 支持一键复制。
- 支持一键改写（更简短/更正式/更随和）。

### 3.2 数据流
1. Mac Poller 轮询到会话 A 新消息。  
2. Poller 将消息事件写入本地事件队列。  
3. Context Builder 从本地队列读取增量并组装上下文。  
4. Reply Generator 调 OpenAI 返回候选。  
5. Mac 侧将 `MessageEvent` 与 `CandidateReply` 一并写入 Sync/API。  
6. iPhone App 前台拉取并展示未读候选。  
7. 用户复制后手动到微信发送。
8. 即时改写流：iPhone 调 `/v1/candidates/{id}/rewrite`，由 Sync/API 直接调用 OpenAI 返回改写结果（不依赖 Mac 在线）。

### 3.3 部署与边界归属
- Mac Poller、Context Builder、Reply Generator 运行在同一台 Mac 的本地守护进程中。
- Uploader 与上述组件同进程部署在 Mac 本地。
- Sync/API Service 运行在云端（轻量 Node 服务 + 数据库）。
- iPhone Receiver App 仅作为展示与交互客户端，不承担生成逻辑。
- 触发链路：Mac Poller 发现增量消息 -> 本地 Context Builder 组 Prompt -> 本地 Reply Generator 调 OpenAI -> 写入云端 Sync/API -> iPhone 拉取。
- 责任边界：文本采集和预处理在 Mac；状态持久化和多端同步在云端；用户交互在 iPhone。
- 改写能力归属：`rewrite` 由云端 Sync/API 的 Rewrite Handler 执行，Mac ReplyGenerator 仅负责初次候选生成。

### 3.4 组件接口契约（V1）
1. Mac -> Sync/API: `POST /v1/events`
- 请求体：`conversation_id`, `event_id`, `event_type`, `direction`, `text`, `captured_at`, `source_hash`, `idempotency_key`
- 响应：`201 created` 或 `200 duplicated`
- 鉴权：`Authorization: Bearer <device_token>`
- 幂等：服务端以 `idempotency_key` 去重，7 天有效。
- 失败码：`400 invalid_payload`, `401 unauthorized`, `403 token_expired`, `500 internal_error`

2. Mac -> Sync/API: `POST /v1/candidates`
- 请求体：`conversation_id`, `candidate_id`, `idempotency_key`, `based_on_event_ids`, `variant_index`, `text`, `style_tag`, `rationale_tag`, `generated_at`
- 响应：`201 created` 或 `200 duplicated`
- 失败码：`400 invalid_payload`, `401 unauthorized`, `409 stale_base_events`, `500 internal_error`
- `candidate_id` 规则：`sha256(conversation_id + sorted(base_event_ids) + variant_index + model_version)`。
- `idempotency_key` 规则：`sha256(candidate_id + generated_at_second)`，服务端保留 7 天。

3. iPhone -> Sync/API: `GET /v1/inbox?since=<cursor>`
- 响应：`items[]`, `next_cursor`, `server_time`
- `items[]` schema：`candidate_id`, `conversation_id`, `text`, `style_tag`, `rationale_tag`, `generated_at`, `status`
- 排序保证：按 `generated_at ASC, candidate_id ASC` 返回。
- 拉取策略：前台每 2 秒轮询，后台停止轮询。
- 失败码：`400 invalid_cursor`, `410 cursor_expired`, `401 unauthorized`
- `410` 处理：客户端清空本地 cursor，回退到全量最近 200 条窗口重拉。

4. iPhone -> Sync/API: `POST /v1/candidates/{id}/status`
- 请求体：`status` in `copied|dismissed`
- 响应：`200 ok`
- 作用：消除重复提醒并形成行为日志。
- 失败码：`400 invalid_status`, `401 unauthorized`, `404 candidate_not_found`, `409 invalid_transition`

5. iPhone -> Sync/API: `POST /v1/candidates/{id}/rewrite`
- 请求体：`mode` in `shorter|formal|casual`, `client_request_id`
- 响应：`200 ok` + `rewritten_text`
- 失败码：`400 invalid_mode`, `401 unauthorized`, `409 base_candidate_missing`, `500 internal_error`

6. iPhone -> Sync/API: `PUT /v1/style/global` 与 `PUT /v1/style/conversations/{conversation_id}`
- 请求体：`tone`, `brevity_level`, `banned_phrases[]`, `persona_hint`, `revision`
- 响应：`200 ok` + `new_revision`
- 冲突：`409 revision_conflict`（客户端需刷新后重提）
- 失败码：`400 invalid_style_payload`, `401 unauthorized`, `404 conversation_not_found`

7. Mac <- Sync/API: `GET /v1/style/updates?since_revision=<n>`
- 用途：Mac 生成器每 5 秒拉取最新风格配置，实现“下一次生成实时生效”。
- 权威源（Source of Truth）：Sync/API 的 `StyleProfile` 存储。
- 失败码：`400 invalid_revision`, `401 unauthorized`, `410 revision_expired`

8. 设备令牌轮换：`POST /v1/auth/refresh-device-token`
- 请求体：`refresh_token`, `device_id`
- 响应：`200 ok` + `device_token`, `expires_at`
- 失败码：`401 invalid_refresh_token`, `403 revoked_device`

9. 初始设备注册：`POST /v1/auth/register-device`
- 请求体：`device_id`, `device_name`, `one_time_pair_code`
- 响应：`200 ok` + `device_token`, `refresh_token`, `expires_at`
- 用途：首次绑定 Mac 与 iPhone 客户端。

### 3.5 本地进程接口契约（Mac 内部）
1. `Poller -> ContextBuilder` 事件：`LocalEventDetected`
- 字段：`conversation_id`, `event_id`, `event_type`, `direction`, `text`, `captured_at`, `source_hash`, `row_index`
- 语义：至少一次投递；消费者用 `event_id` 去重。

2. `ContextBuilder -> ReplyGenerator` 命令：`GenerateCandidates`
- 字段：`conversation_id`, `ordered_events[]`, `style_profile`, `max_variants`
- 超时：8 秒；超时返回 `generation_timeout`。

3. `ReplyGenerator -> Uploader` 事件：`CandidatesReady`
- 字段：`conversation_id`, `base_event_ids[]`, `candidates[]`, `generated_at`
- 失败重试：指数退避 3 次，随后落入本地 dead-letter 队列。

4. 认证生命周期（Mac/iPhone 通用）
- 首次启动：调用 `register-device` 获取 `device_token + refresh_token`。
- API 返回 `401 unauthorized` 或 `403 token_expired`：立即调用 `refresh-device-token`；成功后原请求重试 1 次。
- 刷新失败：进入 `auth_required` 状态，停止上传/拉取并提示用户重新配对。

## 4. 关键策略

### 4.1 轮询与调度
- 每会话基准轮询间隔 2-4 秒。
- 3 会话整轮目标小于等于 12 秒。
- 活跃会话提升优先级，静默会话降频。

### 4.2 新消息检测与去重
- 主去重键：`conversation_id + source_hash`。
- `source_hash` 由 `direction + normalized_text + row_index` 计算，不仅依赖文本。
- 仅当 `source_hash` 不可用时，才启用降级键：`conversation_id + normalized_text + captured_at(ms)`。
- 不使用固定 10 秒文本桶，避免“10 秒内重复短句”被误吞。
- 双层去重：内存近期集合 + 持久层索引。
- 重试时通过指纹保证幂等。
- 示例：同一句“好的”若出现在不同消息行（`row_index` 不同），会被识别为两条有效消息。

### 4.3 上下文窗口
- 默认最近 30-50 条消息。
- Token 超限时优先保留：最新轮次、问句、用户近几条回复样式。
- 长文本摘要缓存作为 `post-V1`，V1 只做截断与关键句保留。

### 4.4 回复风格可调（实时生效）
- 全局风格：默认语气、长度、禁用表达。
- 会话级覆盖：联系人单独风格。
- 即时改写：iPhone 调用 `/v1/candidates/{id}/rewrite`，由 Sync/API 云端执行改写并返回。
- 配置修改入口在 iPhone；Sync/API 持久化后由 Mac 每 5 秒拉取，下一次生成生效。

### 4.5 输出策略
- 默认 2-3 条候选：主推荐 + 备选。
- 每条附短标签（如“澄清问题”“确认时间”“礼貌收束”）。
- 高风险承诺语句提示作为 `post-V1`，V1 不阻塞上线。

### 4.6 边界输入处理策略（V1）
- 图片/语音/表情：统一记录为占位符（如 `[image]`, `[voice]`, `[emoji]`），不做内容识别。
- 撤回消息：记录撤回事件，不参与候选生成上下文。
- 超长消息：按句切分后截断到最大 1200 字符并保留末段。
- 多行换行：归一化为 `\\n`，保持语义换行。

## 5. 数据模型（逻辑）

### 5.1 ConversationConfig
- conversation_id
- display_name
- enabled
- poll_priority
- style_profile_id（可为空，回退全局）

### 5.2 MessageEvent
- event_id
- conversation_id
- event_type（message|recall）
- direction（incoming/outgoing）
- text
- captured_at
- source_hash

### 5.3 CandidateReply
- candidate_id
- conversation_id
- based_on_event_ids
- variant_index
- text
- style_tag
- rationale_tag
- generated_at
- status（new/copied/dismissed）

### 5.4 StyleProfile
- style_profile_id
- tone
- brevity_level
- banned_phrases
- persona_hint
- updated_at

## 6. 错误处理与恢复

- OCR 失败：该会话本轮跳过并记录 error_code，下一轮自动重试。
- OpenAI 失败：指数退避 `1s, 2s, 4s` 最多 3 次；连续 5 次失败标记会话 `degraded` 并暂停 60 秒后恢复。
- 网络中断：本地暂存队列最长保留 24 小时，恢复后按时间顺序补传。
- UI 漂移：连续 3 轮锚点检测失败触发“重新标定”；标定成功后自动退出恢复流程。
- 重复推送风险：依赖指纹与状态机（new/copied/dismissed）抑制重复提醒。

### 6.1 统一 API 恢复矩阵（客户端必须实现）
- `401 unauthorized` / `403 token_expired`：先调用 `refresh-device-token`，成功后原请求重试 1 次；失败进入 `auth_required`。
- `409 revision_conflict`：拉取最新 style revision 后自动重试 1 次。
- `410 cursor_expired` / `410 revision_expired`：清空本地游标并执行一次全量窗口重拉。
- `409 invalid_transition`：不重试，客户端刷新该 candidate 最新状态并提示用户。
- `5xx`：指数退避 `1s, 2s, 4s` 共 3 次，仍失败则记录 telemetry 并提示稍后重试。

## 7. 安全与隐私

- API Key 存储于 macOS Keychain。
- 传输全程 HTTPS。
- 日志默认脱敏（手机号、金额、证件号模式掩码）。
- iPhone 本地缓存可手动清空。
- 不支持自动发送，降低误操作与策略风险。

## 8. 测试与验收标准

### 8.1 功能验收
- 可配置并保存 3 个 watchlist 会话。
- 新消息可触发候选生成并同步到 iPhone。
- 复制按钮可稳定粘贴到微信。
- 全局风格、会话级风格、即时改写均生效。

### 8.2 正确性
- 去重：使用固定测试集 `300` 条消息事件（含 `40` 条短句重复场景），重复推送率低于 1%。
- 顺序：上下文不乱序。
- 隔离：A 会话内容不进入 B 会话 Prompt。
- 风格覆盖不串会话。

### 8.3 稳定性
- 连续运行 8 小时无崩溃。
- 网络波动可恢复。
- OCR 偶发失败不影响整体轮询。

### 8.4 性能
- 端到端延迟：P50 小于 8 秒，P95 小于 20 秒。
- 3 会话并发下 Mac 资源阈值：常态 CPU 小于 35%，峰值小于 60%；内存常态小于 500MB。
- 性能基线设备：MacBook Pro M2 / 16GB / macOS 14.x / 微信 4.x。

### 8.5 通过门槛
- 72 小时 soak test：回放不少于 `3000` 条消息事件，崩溃次数 `= 0`。
- 指标达标（延迟、重复率、恢复能力）并附测试报告（时间窗、样本量、失败样本）。
- 用户操作链路不超过 3 步（打开 App -> 点复制 -> 回微信粘贴发送）。
- 主观评分协议：每次候选使用后立即打分（1-5 分），样本不少于 20 次，平均分不低于 4.0。

## 9. 实施里程碑（V1）

1. M1（采集链路）
- 完成 watchlist 配置、轮询、OCR、消息事件标准化。
- 可交付契约：`POST /v1/events` 稳定可用，字段冻结到 V1。

2. M2（生成链路）
- 完成上下文构建、OpenAI 生成、候选存储。
- 可交付契约：`POST /v1/candidates` 与 `409 stale_base_events` 语义稳定。

3. M3（iPhone 收件）
- 完成会话列表、候选展示、复制、改写。
- 可交付契约：`GET /v1/inbox` 游标协议稳定，`status` 更新可用。

4. M4（稳定性）
- 完成去重、重试、观测、8 小时稳定性验证。
- 可交付契约：错误码与重试日志结构冻结，支持回归对比。

## 10. 未来扩展（非 V1）

- 扩展至 5 会话并发与动态优先级。
- 引入知识片段库（RAG）支持业务背景回复。
- 群聊角色分离与联系人画像。
- 更细粒度策略（时间段语气、黑白词库）。
