# Bosch SSO 接入与上线步骤

## 当前实现与边界

采用单租户 OIDC Authorization Code + PKCE，由 Spring Boot 完成授权码兑换和 ID Token 验证。
前端、API、回调使用同一个 HTTPS origin；前端不保存公司凭据或公司 Token。
SSO 默认关闭，现有密码登录和注册保持原有行为。关闭 SSO 不会撤销已建立的网站会话。

经用户确认：

| 项目 | 值 |
| --- | --- |
| 网站 | `https://cnaward.bosch-datanexus.com` |
| Application (client) ID | `bb6d57e7-a971-433f-882d-01d7ef3b0e49` |
| Directory (tenant) ID | `0ae51e19-07c8-4e4b-bb6d-648ee58410f4` |
| SSO 使用范围 | Bosch 公司成员，新用户自动创建为 participant |
| 回调地址 | `https://cnaward.bosch-datanexus.com/api/v1/auth/oidc/callback/bosch` |
| 浏览器登录入口 | `/api/v1/auth/oidc/authorize/bosch` |
| 可用状态接口 | `GET /api/v1/auth/sso`，只返回 enabled |

新用户创建账号时不设置本地密码。身份唯一键为 `tenant_id + object_id`，不以邮箱授权。
已绑定身份继续使用原 profile ID、角色、部门及业务记录。
当首次登录的邮箱与已有账号冲突时，不自动合并，需要管理员核验并绑定。
业务中的部门、提名和评审资格仍由原有规则决定，不会因公司登录自动获取。

`acct=0` 表示 Entra 租户 Member，`acct=1` 表示 Guest，本实现拒绝访客及缺少 acct 的 Token。
Member 是目录身份类型，不是 HR 雇佣关系证明。如果该租户中包含非员工 Member，
应由公司管理员通过应用分配/员工组进一步限定，不能把 Member 等同于精确员工名册。

目前实现的客户端认证方式是 Client Secret。公司文档也推荐证书；
若审批方要求证书，需另行实现 private_key_jwt，不能将证书或私钥填到 Secret 配置中。

## 1. 公司平台配置（应用 Owner 操作）

### 1.1 确认注册与负责人

在 Entra → App registrations 找到上表 Client ID 对应的应用：

1. 保持 Bosch Group 单租户。
2. 应用注册和对应的 Enterprise application 均至少配置两名有效 Owner。
3. API permissions 保留 Delegated 类型的 `openid`、`profile`、`email`。
4. 只做 SSO 时不需要 `User.Read`、Application permissions 或 `offline_access`。
5. 跟进已经提交的 T&R 预审批工单；提交成功不代表批准。

### 1.2 注册后端回调

Authentication → Add a platform → **Web**，添加：

```text
https://cnaward.bosch-datanexus.com/api/v1/auth/oidc/callback/bosch
```

不要选择 SPA 平台；本方案由服务器兑换授权码。不要为此开启 Implicit grant 的
Access tokens / ID tokens 选项。代码通过授权码流程取得 ID Token。

### 1.3 增加 ID Token 的账号类型声明

Token configuration → Add optional claim → **ID**：

1. 添加 `acct`，用于区分 Member 与 Guest。
2. 添加 `email`，确保公司目录允许释放邮箱；`name` 来自 profile。
3. 如门户提示需要标准 `email` / `profile` 权限，确认它们已在前面的审批范围内。

不要将 acct 配置成固定值，也不要将它改成 Application role。
缺少 acct、姓名或邮箱时会显示“公司账号信息不完整”，不会使用猜测的资料创建账号。
已绑定用户不依赖邮箱和姓名的持续不变，但每次公司登录仍要求正确租户和 Member 身份。

### 1.4 核对全员访问范围

应用注册 Overview → Managed application in local directory → 企业应用：

- 如果面向该租户所有 Member，确认 Properties 中 `Assignment required?` 没有阻止普通员工登录。
  若公司允许全租户访问，可设置为 No；后端仍检查 Member 类型。
- 如果公司要求按员工组控制，保持 Yes，在 Users and groups 分配覆盖全部目标员工的正式组。
  不要只分配应用 Owner 后就认为全体员工都可以使用。
- MFA、条件访问等租户策略继续生效。

### 1.5 创建客户端凭据

如果公司允许 Secret：Certificates & secrets → Client secrets → New client secret。

按公司要求设置有效期，记录到期维护负责人，并把 **Value** 保存到公司认可的秘密存储。
服务器需要 Value，不是 Secret ID。不要发送到聊天、写进源码、前端变量或镜像。
若已有有效凭据，按公司密钥管理流程复用，不必重复生成。

## 2. 服务器准备（运维/应用负责人）

必须满足：

- 用户可访问网站的 HTTPS 域名，网关将 `/api/` 转发到当前后端。
- 实际 API 容器内的 Java 进程可以访问 Entra discovery、token、JWKS 端点。
- 公司内网部署按公司 P4S 流程确认服务器到代理的网络路径；PDF 新版说明相关目标域名默认放行。
- Java 信任公司要求的 TLS CA；不要关闭证书验证。

启用时会读取租户 discovery 配置；网络或 TLS 不通会导致 API 启动失败。
本实现不调用 Graph UserInfo，也不申请 Graph 业务数据权限。

Java 不保证自动使用 `HTTPS_PROXY`。需要 P4S 时，由运维在 Compose 的 api 服务
environment 中配置适合现场的 `JAVA_TOOL_OPTIONS`，例如 Java 标准
`-Dhttps.proxyHost=YOUR_PROXY_HOST -Dhttps.proxyPort=YOUR_PROXY_PORT`。
若还要求代理认证或专用信任库，需按现场方案配置并联调；不要把密码直接写到命令行。
现有 Dockerfile 的构建代理不会自动成为 API 运行时代理。

后端使用固定的 HTTPS public-base-url 生成回调，不从不可信的请求 Host 生成地址。
SSO 会话 Cookie 为 Secure / HttpOnly / SameSite=Lax，仅用于五分钟的登录握手，
成功或失败后销毁。原业务 API 继续使用 JWT，临时 SSO 会话不能用于调用业务 API。
目前登录临时状态保存在单个 API 实例内存中；多副本部署需粘性会话或另做共享会话，
重启 API 后尚未完成的登录需要重新发起。

## 3. 服务器配置（不要在聊天中填写真实 Secret）

在目标服务器的受保护环境配置中追加以下键。已有 `.env` 必须保留，不能用示例整文件覆盖。

```dotenv
APP_SSO_ENABLED=false
APP_SSO_TENANT_ID=0ae51e19-07c8-4e4b-bb6d-648ee58410f4
APP_SSO_CLIENT_ID=bb6d57e7-a971-433f-882d-01d7ef3b0e49
APP_SSO_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
APP_SSO_PUBLIC_BASE_URL=https://cnaward.bosch-datanexus.com
APP_AUTH_COOKIE_SECURE=true
```

`YOUR_CLIENT_SECRET_HERE` 只是占位符，须在服务器安全替换。
public-base-url 不带末尾斜杠。保持原数据库、JWT、MinIO 等配置不变。
不要运行会打印全部环境变量的 `docker inspect` 或未加 `--quiet` 的 Compose config。

先以 `APP_SSO_ENABLED=false` 部署和检查原有功能。确认配置、审批、账号策略、网络均就绪后，
将此值改为 true 并仅重建 API 容器。前端会从接口读取 enabled，无需为开关重新打包前端。

## 4. 数据库变更与旧账号绑定

新版本启动时 Flyway 自动执行 `V023__sso_identities.sql`：

- 新建 `sso_identities`，唯一约束防止重复绑定。
- 允许 `profiles.password_hash` 为空，以支持没有本地密码的新 SSO 账号。
- 保留所有已有密码、角色和业务记录，不根据同名邮箱更新角色。

更新前按现有部署文档完成数据库备份。
新员工首次登录会自动创建 participant 及身份绑定；不必逐人建账号。

已有账号发生邮箱冲突时，由管理员核验本人身份，再将用户的 **Entra 用户 Object ID**
绑定到其原网站 profile。这个 Object ID 不是应用的 Object ID，也不是 Client ID。
优先在首次上线前完成关键管理员账号的绑定。

在目标数据库的受控 SQL 会话执行以下模板，替换两个占位 UUID：

```sql
BEGIN;

-- 先核对原用户姓名、邮箱和角色。必须只返回预期的一行。
SELECT id, email, name, role
FROM profiles
WHERE id = 'EXISTING_PROFILE_UUID'::uuid;

INSERT INTO sso_identities (tenant_id, object_id, profile_id)
VALUES (
    '0ae51e19-07c8-4e4b-bb6d-648ee58410f4'::uuid,
    'ENTRA_USER_OBJECT_UUID'::uuid,
    'EXISTING_PROFILE_UUID'::uuid
)
RETURNING tenant_id, object_id, profile_id;

-- 核对结果正确后再执行；有疑问执行 ROLLBACK。
COMMIT;
```

不要为了绕过冲突删除原账号，也不要使用 ON CONFLICT 覆盖其他身份。
如果已有新建 SSO 账号、但另有不同邮箱的历史账号，应单独核查业务数据后制定合并方案。

## 5. 部署

本地验证和公司真实联调是两件事；测试通过不表示工单已批准或正式环境已接通。
本次前后端都变化，需要更新两个镜像，并同步新增 SSO 环境变量的 Compose 配置。

按仓库 [离线部署说明](../../../offline-release/README.md) 执行构建、打包、上传、校验和导入。
已有生产环境只更新 app/api 与部署配置，不覆盖数据库或 MinIO 卷。

若目标使用现有 `offline-release/compose.sh` 布局：

1. 在构建机生成新的 app、api 发布包；镜像架构匹配目标服务器。
2. 目标执行 `sha256sum -c SHA256SUMS`，全部 OK 后才 `docker load`。
3. 保留目标 `compose.yml`，安装本包的 `compose.sso.yml` 和支持加载它的 `compose.sh`；
   在 `images.env` 只更新对应 APP_IMAGE / API_IMAGE。
4. 安全编辑原 `.env`；先保留 SSO 关闭。
5. 在目标 runtime 目录检查并更新：

```bash
bash compose.sh config --quiet
bash compose.sh up -d --no-deps --no-build --pull never --wait api app
```

完成公司配置和审批后，将原 `.env` 中 `APP_SSO_ENABLED` 改为 true，再执行：

```bash
bash compose.sh config --quiet
bash compose.sh up -d --no-deps --no-build --pull never --wait api
bash compose.sh exec -T app nginx -t
bash compose.sh exec -T app nginx -s reload
```

API 单独重建后重载 Nginx，使其重新解析后端容器地址。
本次 `/opt/hackhub/runtime` 的具体操作见
[离线 SSO 更新手册](../../../offline-release/sso/UPDATE-SSO.md)。

回滚 SSO 开关：设为 false 后按上面的命令重建 api，保留数据库迁移和原有数据。
这只关闭新的公司登录，不会撤销已有 JWT/刷新会话。不要删除数据卷或回滚数据库来关闭登录按钮。

## 6. 真实验收

1. 打开 `https://cnaward.bosch-datanexus.com/api/v1/auth/sso`，启用后应返回 `{"enabled":true}`。
2. 浏览器打开网站登录页，点击“公司账号登录”，完成公司认证和 MFA。
3. 新员工获得 participant，刷新页面仍能恢复会话；不拥有管理和评审权限。
4. 已绑定旧账号仍有原用户 ID、提名记录、部门和角色。
5. 邮箱冲突显示关联提示，不接管已有账号。
6. 非目标租户、Guest、缺少声明、取消登录或过期回调不能建立新的网站会话。
7. 退出网站后刷新会话失效；再次公司登录可能复用公司自己的登录会话，这是正常 SSO 行为。
8. 检查普通密码登录、提名和原业务权限没有回归。

网站退出仅撤销网站刷新会话，不执行整个 Microsoft/Bosch 会话的全局退出。
公司禁用用户不等于立即撤销本网站已签发的 JWT；目前沿用网站的 access/refresh 有效期，
需要立即离职撤权时应配套应用会话撤销和账号生命周期策略。
若要强制只能 SSO，还需明确关闭公开密码登录/注册的范围；当前没有擅自改变这些入口。

## 7. 常见问题

| 现象 | 检查 |
| --- | --- |
| 看不到公司登录按钮 | `/api/v1/auth/sso` 是否返回 true；前后端是否已更新 |
| AADSTS50011 | Entra Web 回调地址是否逐字匹配本页地址 |
| 请求审批 / 管理员批准提示 | 工单是否批准且落实到正确 Client ID；不必重复走两条审批路线 |
| 公司账号信息不完整 | ID Token 是否有 acct；首次创建时是否有有效 email、name |
| 仅公司成员可登录 | 当前账号是否 Guest；不要伪造 acct 绕过 |
| 请管理员关联 | 可信公司邮箱与已有网站账号冲突，核验并绑定原 profile |
| API 启动失败 | 启用参数是否齐全，discovery 网络/P4S/Java TLS 信任是否正常 |
| 回调失败 | 五分钟内完成登录；浏览器接受 Secure Cookie；API 未重启；多副本路由一致 |
| Secret 到期 | Owner 创建/轮换凭据，安全更新服务器后重建 API，不改变应用 Client ID |

## 依据

- 公司 `Bosch IdP Onboarding Process`：OIDC、权限、Owner、P4S、预审批相关章节。
- [Spring Security OAuth2 Login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/advanced.html)
- [Microsoft optional claims：acct](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)
- [Microsoft optional claims 配置](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims)
