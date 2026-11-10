# Bosch SSO 离线更新：20261020-sso-01

本包包含 app 与 api 两个 linux/amd64 镜像。审批已通过、Secret 已由负责人保存。
服务器仍需完成以下部署和真实登录验收；构建机无法代替正式服务器确认网络与公司登录。

现有路径：`/opt/hackhub/runtime`，上传路径：`/opt/hackhub/incoming`。
本包不包含数据库/附件数据，也不包含真实 Secret。不要用旧的 app-only 包代替本包。

## 1. 上传及校验（堡垒机文件传输）

上传 `20261020-sso-01.tar.gz` 和 `20261020-sso-01.tar.gz.sha256`
到 `/opt/hackhub/incoming/`，然后在服务器终端执行：

```bash
set -e
cd /opt/hackhub/incoming
sha256sum -c 20261020-sso-01.tar.gz.sha256
test ! -e 20261020-sso-01 && tar -xzf 20261020-sso-01.tar.gz
cd /opt/hackhub/incoming/20261020-sso-01
sha256sum -c SHA256SUMS
uname -m
python3 --version
```

所有校验必须 OK，架构应为 x86_64，且可运行 Python 3。否则先停止。
若目录已经存在，先确认是不是本包；不要覆盖另一个版本或在服务器重生成校验值。
每个上传文件都低于堡垒机 2 GB 限制。下面在有 Docker 权限、可修改 runtime 的账号下操作。

## 2. 备份现有配置和数据库（服务器终端）

选择维护时段；数据库备份之后仍可能有新写入，恢复旧备份需要另行评估。
以下命令在同一个终端逐段执行。每段的 `set -e` 会在命令失败时停止，
终端可能退出；排查后重新打开终端，不要跳过失败步骤：

```bash
set -e
cd /opt/hackhub/runtime
umask 077
SSO_BACKUP="/opt/hackhub/backups/before-sso-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$SSO_BACKUP"
cp -p .env images.env compose.yml compose.sh "$SSO_BACKUP/"
if [ -f compose.sso.yml ]; then cp -p compose.sso.yml "$SSO_BACKUP/"; fi
bash compose.sh config --quiet
bash compose.sh exec -T postgres pg_dump -U hackhub -d hackhub -Fc > "$SSO_BACKUP/hackhub.dump"
test -s "$SSO_BACKUP/hackhub.dump"
bash compose.sh exec -T postgres pg_restore --list < "$SSO_BACKUP/hackhub.dump" > /dev/null
printf 'Backup directory: %s\n' "$SSO_BACKUP"
```

记住最后显示的备份目录。不要把备份、`.env` 或 Secret 上传到聊天。
不要执行 `down -v`、删除卷或用模板覆盖 `.env`。

## 3. 导入镜像、添加 SSO 配置（服务器终端）

```bash
set -e
cd /opt/hackhub/incoming/20261020-sso-01
docker load -i images/app.tar
docker load -i images/api.tar
docker image inspect hackhub-offline/app:20261020-sso-01 hackhub-offline/api:20261020-sso-01 --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```

对照 `manifest.tsv` 中的镜像 ID 与架构。然后：

```bash
set -e
cd /opt/hackhub/runtime
cp /opt/hackhub/incoming/20261020-sso-01/deploy/compose.sh ./compose.sh
cp /opt/hackhub/incoming/20261020-sso-01/deploy/compose.sso.yml ./compose.sso.yml
python3 /opt/hackhub/incoming/20261020-sso-01/deploy/configure-sso.py configure
```

脚本提示两次输入 **Client Secret Value**，输入不回显；不是 Secret ID。
脚本只更新 SSO 和安全 Cookie 的配置，保留其他键，权限设为 600，SSO 暂时关闭。
若提示所有者不同，切换到 `.env` 所属账号执行，勿放宽文件权限。
现有 `compose.yml` 保留，新增的 `compose.sso.yml` 由更新后的 `compose.sh` 自动加载。

确认原有两条镜像变量各只有一行，再只替换这两行：

```bash
set -e
cd /opt/hackhub/runtime
test "$(grep -c '^APP_IMAGE=' images.env)" -eq 1
test "$(grep -c '^API_IMAGE=' images.env)" -eq 1
sed -i 's|^APP_IMAGE=.*|APP_IMAGE=hackhub-offline/app:20261020-sso-01|' images.env
sed -i 's|^API_IMAGE=.*|API_IMAGE=hackhub-offline/api:20261020-sso-01|' images.env
bash compose.sh config --quiet
```

任何 `test` 或配置检查失败都先停止。不要用本包的 `images.env` 覆盖生产文件，
否则会丢失 PostgreSQL、MinIO、minio-init 的镜像配置。
不要运行不带 `--quiet` 的 `config`，也不要输出容器完整环境变量。

## 4. 先更新应用并验证原功能（SSO 保持关闭）

```bash
set -e
cd /opt/hackhub/runtime
bash compose.sh up -d --no-deps --no-build --pull never --wait --wait-timeout 180 api app
bash compose.sh exec -T app nginx -t
bash compose.sh exec -T app nginx -s reload
bash compose.sh ps
bash compose.sh exec -T postgres psql -U hackhub -d hackhub -Atc "SELECT version, success FROM flyway_schema_history WHERE version='023';"
curl --fail --silent --show-error https://cnaward.bosch-datanexus.com/api/v1/auth/sso
```

期望：api/app 健康，迁移显示 `023|t`，接口显示 `{"enabled":false}`。
浏览器验证首页和原密码登录。V023 仅增加身份映射表、允许新 SSO 账号没有本地密码；
现有密码、角色和业务数据保留。
若服务器不能访问自己的外部域名，可从办公电脑浏览器验证这个 HTTPS 接口。

## 5. 确认服务器出站网络，再启用 SSO

启用前检查：

- Entra Web 回调逐字匹配：
  `https://cnaward.bosch-datanexus.com/api/v1/auth/oidc/callback/bosch`。
- ID Token 配置 `acct` 和 `email` optional claims；权限为 openid/profile/email。
- 企业应用分配范围覆盖目标员工，而不是只有 Owner；Guest 不允许登录。
- API 容器的 Java 进程能访问 `login.microsoftonline.com:443` 的 discovery、
  token 和 JWKS 端点，证书受 Java 信任。离线上传镜像不等于运行时不需要联网。

如公司要求 P4S 代理，请运维在 `compose.sso.yml` 的 api.environment 中补充实际
`JAVA_TOOL_OPTIONS`（例如 `-Dhttps.proxyHost=代理地址 -Dhttps.proxyPort=代理端口`）。
保留现有 Java 参数；代理认证、CA 信任库按现场方案设置。Docker 构建代理不会进入运行容器，
只配置 HTTPS_PROXY 也不能证明 Java 可用。不要关闭 TLS 验证。
代理需要运维提供真实参数，本包不猜测。

网络确认后：

```bash
set -e
python3 /opt/hackhub/incoming/20261020-sso-01/deploy/configure-sso.py enable
cd /opt/hackhub/runtime
bash compose.sh config --quiet
bash compose.sh up -d --no-deps --no-build --pull never --wait --wait-timeout 180 api
bash compose.sh exec -T app nginx -t
bash compose.sh exec -T app nginx -s reload
curl --fail --silent --show-error https://cnaward.bosch-datanexus.com/api/v1/auth/sso
```

期望 `{"enabled":true}`。API 单独重建后必须重载 Nginx，否则可能仍指向旧容器 IP。
若启动失败，按第 7 步关闭 SSO 恢复服务，再排查网络/TLS/配置；
不要连续重复登录或把 Secret、Cookie、完整回调 URL 发到聊天。

## 6. 浏览器真实验收

1. 打开正式网站登录页，出现“公司账号登录”，点击并完成公司认证/MFA。
2. 用没有旧网站账号的公司员工测试：自动创建 participant，不能进入管理功能。
3. 有旧账号时，首次公司登录若提示关联，请按包内 `BOSCH-SSO.md` 的受控绑定步骤处理。
   不会只凭相同邮箱自动接管旧账号；原密码登录仍可用。
4. 已绑定的旧账号保持角色、记录；刷新页面后仍保持网站登录。
5. 退出网站后刷新会话失效；Guest/其他租户不能建立网站会话。
6. 检查原密码登录、提名和权限正常。

租户 Member 并非精确 HR 员工名册；公司若有非员工 Member，应使用员工组分配约束。
完成这些验收，才能确认正式 SSO 已接通。

## 7. SSO 失败时的回退

```bash
set -e
python3 /opt/hackhub/incoming/20261020-sso-01/deploy/configure-sso.py disable
cd /opt/hackhub/runtime
bash compose.sh up -d --no-deps --no-build --pull never --wait --wait-timeout 180 api
bash compose.sh exec -T app nginx -t
bash compose.sh exec -T app nginx -s reload
curl --fail --silent --show-error https://cnaward.bosch-datanexus.com/api/v1/auth/sso
```

期望 false；继续使用密码登录。此操作保留新镜像、V023 和所有账号数据，
只关闭新的 SSO 登录，不撤销已签发的网站会话。
不要为关闭 SSO 删除表、数据卷或直接切回旧 API；数据库已有新迁移，
完整版本回退需要单独评估 Flyway 兼容性及备份之后的数据写入。
