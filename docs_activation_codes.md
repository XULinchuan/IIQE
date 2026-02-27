# 授权码与代理人码使用说明

## 已完成内容
- 10000 个一次性授权码：`data/activation_codes_10000.csv`
- 10000 个一次性代理人码：`data/agent_invite_codes_10000.csv`
- 云函数：
  - `checkEntitlement`：查询当前用户是否已授权
  - `redeemActivationCode`：输入授权码后核销（每个码只能用一次）
  - `importActivationCodes`：导入授权码到 `iiqe_activation_codes`
  - `importAgentInviteCodes`：导入代理人码到 `iiqe_agent_invite_codes`
  - `redeemAgentInviteCode`：输入代理人码后开通代理人并同步解锁试卷
  - `getMyAgentProfile`：查询当前用户代理人状态
  - `agentGenerateShareCode`：生成代理人专属小程序码（带 ref）
  - `agentUpdateWxQr`：更新代理人微信二维码
  - `bindReferralOnEntry`：用户扫码进入时绑定来源代理人
  - `getActivationQrByUser`：按用户来源代理人返回二维码
- 导入源文件：
  - `cloudfunctions/importActivationCodes/codes.json`（10000 条）
  - `cloudfunctions/importAgentInviteCodes/codes.json`（10000 条）

## 云数据库集合
- `iiqe_activation_codes`
  - `_id`：授权码
  - `status`：`unused` / `used` / `disabled`
  - `createdAt` `usedAt` `usedBy`
- `iiqe_entitlements`
  - `_id`：OPENID
  - `premium`: true
  - `activatedAt` `activationType` `activationCode`
- `iiqe_agent_invite_codes`
  - `_id`：代理人码
  - `status`：`unused` / `used` / `disabled`
  - `usedByOpenId` `usedAt` `agentId`
- `iiqe_agent_profiles`
  - `_id`：代理人 ID
  - `openId`
  - `status`: `active` / `disabled`
  - `wxQrFileID`
- `iiqe_user_referrals`
  - `_id`：普通用户 OPENID
  - `refAgentId` `bindSource` `locked`
- `iiqe_app_config`
  - `_id=default_activation_qr` 时提供默认二维码 `qrFileID`

## 首次部署步骤（微信开发者工具）
1. 打开云开发并绑定环境。
2. 创建集合：
   - `iiqe_activation_codes`
   - `iiqe_entitlements`
   - `iiqe_agent_invite_codes`
   - `iiqe_agent_profiles`
   - `iiqe_user_referrals`
   - `iiqe_app_config`
3. 上传部署全部云函数（云端安装依赖）。
4. 设置环境变量：
   - `importActivationCodes` -> `IMPORT_ADMIN_KEY=你的密钥`
   - `importAgentInviteCodes` -> `AGENT_IMPORT_ADMIN_KEY=你的密钥`
5. 导入授权码（可分段）：
   - `{"adminKey":"你的密钥","source":"file","start":0,"limit":300}`
6. 导入代理人码（可分段）：
   - `{"adminKey":"你的密钥","source":"file","start":0,"limit":300}`
7. 按 `nextStart` 重复调用，直到 `hasMore=false`。

## 日常发码
- 授权码：从 `data/activation_codes_10000.csv` 选择 `unused` 发给用户。
- 代理人码：从 `data/agent_invite_codes_10000.csv` 选择 `unused` 发给代理人。

## 关键业务规则
- 授权码：核销后解锁试卷。
- 代理人码：核销后同时开通代理人身份 + 解锁试卷。
- 代理人被禁用后：代理人功能不可用，但试卷权限保留。
