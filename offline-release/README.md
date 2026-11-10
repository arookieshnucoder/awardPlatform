# 云盾堡垒机 / SFTP 镜像离线部署

代码更新必须重新构建对应服务的镜像，但构建在开发机/构建机完成。
生产服务器只做 `docker load` 和 `docker compose up --no-build --pull never`。
tar 是 `docker save` 导出的镜像，不是源码压缩包；不要用 `docker export/import` 替代。

## 1. 服务与文件

| 文件 | 内容 | 何时更新 |
| --- | --- | --- |
| images/app.tar | React 构建产物 + Nginx | 前端代码、构建环境变量、Nginx 配置变化 |
| images/api.tar | Spring Boot + Java 21 JRE | 后端代码、依赖、内置配置、Flyway SQL 变化 |
| images/postgres.tar | PostgreSQL 16 | 数据库软件升级 |
| images/minio.tar | MinIO | 存储软件升级 |
| images/minio-init.tar | MinIO mc 初始化工具 | 初始化工具升级 |
| deploy-config.tar | Compose、包装脚本、初始化脚本、文档、空白配置模板 | 首次或配置文件变化 |
| images.env | 本次打包的镜像版本引用，无密码 | 首次复制；增量只合并对应行 |
| manifest.tsv | 镜像 ID、CPU 架构 | 核对版本 |
| SHA256SUMS | 完整性校验 | 每次上传后核验 |

生产不需要 Node、Maven、JDK、源码、构建阶段基础镜像或开发用 pgAdmin。
镜像不包含 PostgreSQL 记录、MinIO 附件和服务器 `.env`，它们须另行保留/迁移。

## 2. 两端检查

```bash
docker version
docker compose version
docker info --format '{{.OSType}}/{{.Architecture}}'
df -h
```

两端均为 Linux 还不够，CPU 架构须匹配。x86_64 对应 linux/amd64；aarch64 对应 linux/arm64。
脚本默认 amd64。ARM 目标应使用 ARM 构建机并设置 `PLATFORM=linux/arm64`；跨架构需要另配 buildx/QEMU。
目标预装 Docker Engine、支持多次 `--env-file` 和 `--wait` 的 Compose v2+、tar、sha256sum。
离线机器先由运维安装这些软件，并预留镜像 tar、导入镜像和业务数据的空间。

## 3. 构建机重新构建、分别打包

```bash
cd /home/aah5sgh/website_new
VERSION=$(date +%Y%m%d-%H%M%S)
bash offline-release/package.sh "$VERSION" all
```

输出 `offline-release/releases/<版本>-all/`，五个独立 tar 位于 `images/`。
每次为前后端执行 build，Docker 复用缓存；不会启动、替换或停止本机构建前已运行的业务容器。
基础服务复用本机镜像并固定为发布标签，缺失才 pull，不会静默升级本地 latest。
每次用新版本号；只有出现 `Package ready` 才是完整包。失败留下的目录/标签不作为发布包，修复后换版本重试。

构建机需要访问 npm、Maven、镜像仓库，或拥有缓存。公司网络可通过
`DOCKER_BUILD_HTTP_PROXY`、`DOCKER_BUILD_HTTPS_PROXY`、`CORPORATE_CA_FILE` 配置构建代理/CA。
本项目原 `app/scripts/build-with-user-proxy.py` 也可作为公司代理构建入口，先建立缓存再打包，
但该旧脚本会同时构建前后端。Docker daemon 的拉取代理与构建代理分开配置。
不要在脚本或文档写代理密码。生产 load 全部镜像并 `--pull never` 后不需要拉取代理。

## 4. 目标服务器建目录、SFTP 上传

在堡垒机终端登录真正运行 Docker 的目标服务器：

```bash
sudo mkdir -p /opt/hackhub/runtime /opt/hackhub/incoming /opt/hackhub/backups
sudo chown "$(id -u):$(id -g)" /opt/hackhub/runtime /opt/hackhub/incoming /opt/hackhub/backups
chmod 700 /opt/hackhub/runtime /opt/hackhub/incoming /opt/hackhub/backups
mkdir -p /opt/hackhub/incoming/20261012-142000-all
```

日期仅示例，改成实际版本。用云盾目标资产 SFTP 通道上传整个版本目录的内容，保留 images 子目录。
若先到跳板机中转目录，还须使用云盾文件传输功能送到目标资产；不依赖开发机直连生产 SSH。

```bash
cd /opt/hackhub/incoming/20261012-142000-all
sha256sum -c SHA256SUMS
# 必须全部 OK 才继续；后续任何失败均停止。
bash -euc 'for file in images/*.tar; do docker load -i "$file"; done'
docker image ls --filter 'reference=hackhub-offline/*'
# 核对 manifest.tsv 中五个镜像版本均已导入后继续。
tar -xf deploy-config.tar -C /opt/hackhub/runtime
cp images.env /opt/hackhub/runtime/images.env
```

runtime 是长期固定目录。以后不要将增量包的一行 images.env 覆盖整个 runtime/images.env。

## 5. 配置与原数据

### A. 原服务器切换部署方式

停止原服务前查真实项目名、卷名（只输出名字，不输出环境变量）：

```bash
docker inspect hackhub-postgres --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect hackhub-postgres --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Type}} {{.Name}} {{.Source}}{{end}}{{end}}'
docker inspect hackhub-minio --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}} {{.Name}} {{.Source}}{{end}}{{end}}'
```

原项目使用 named volume；如果现场显示 bind，需要把新 Compose 对应卷改为原绝对目录。
新 Compose 使用显式 external volume，避免目录变化时自动创建空库。
安全复制**原生产服务器** `.env` 到 runtime/.env，用编辑器补齐以下配置，勿使用开发机密钥覆盖：

- COMPOSE_PROJECT_NAME：刚查到的原项目名。
- POSTGRES_VOLUME、MINIO_VOLUME：刚查到的实际卷名。
- POSTGRES_PASSWORD、MINIO_ROOT_USER、MINIO_ROOT_PASSWORD、JWT_PRIVATE_KEY、JWT_PUBLIC_KEY：原生产值。
- WEB_PORT：网站端口，默认 80。
- APP_CORS_ALLOWED_ORIGINS：浏览器实际 origin，包含非默认端口，不含路径或结尾斜杠，多个用逗号分隔。
- APP_AUTH_COOKIE_SECURE：HTTPS 入口用 true；仅通过堡垒机访问 HTTP 用 false。

若旧 Compose 硬编码生产密码，安全转入 .env；修改 PostgreSQL 的环境变量不会改变已有库的账户密码。

```bash
chmod 600 /opt/hackhub/runtime/.env /opt/hackhub/runtime/images.env
cd /opt/hackhub/runtime
bash compose.sh config --quiet
```

安排维护窗口，按第 8 节备份，然后在**原部署目录**按原 Compose 参数停止旧服务。
原来用了 prod 覆盖文件才加第二个 -f；保持原 -p 和 --env-file 设置：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop
```

随后执行第 6 节。原项目名相同，Compose 重建同项目容器、复用原卷。
如果报容器名冲突，先检查项目名，不要删除数据卷。无需 down -v。

### B. 新服务器部署空系统

```bash
cd /opt/hackhub/runtime
cp server.env.example .env
chmod 600 .env
vi .env
docker volume create app_postgres_data
docker volume create app_minio_data
```

配置真实的账户、密码和 JWT 密钥，不能为空；卷名与 .env 一致。
JWT 可从密钥管理系统提供。全新系统也可使用下面命令生成；需要 Python 3、OpenSSL，
仅写入权限受限的 .env，不打印密钥。已有生产系统不要重新生成 JWT 密钥：

```bash
python3 - <<'PY'
from pathlib import Path
import os, subprocess, tempfile
os.umask(0o077)
p = Path('.env')
s = p.read_text()
assert s.count('JWT_PRIVATE_KEY=\n') == 1 and s.count('JWT_PUBLIC_KEY=\n') == 1
with tempfile.TemporaryDirectory() as d:
    private = Path(d) / 'private.pem'
    public = Path(d) / 'public.pem'
    subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', str(private)], check=True, stderr=subprocess.DEVNULL)
    subprocess.run(['openssl', 'pkey', '-in', str(private), '-pubout', '-out', str(public)], check=True, stderr=subprocess.DEVNULL)
    for key, path in [('JWT_PRIVATE_KEY', private), ('JWT_PUBLIC_KEY', public)]:
        value = ''.join(path.read_text().splitlines())
        s = s.replace(key + '=\n', key + "='" + value + "'\n")
    p.write_text(s)
p.chmod(0o600)
PY
```

### C. 新服务器迁移原业务数据

先按第 8 节备份恢复，再启动 API/前端。只上传镜像不会带来原用户、记录和附件。
新目标沿用原 JWT/MinIO 配置和兼容的数据库设置。域名、TLS 证书、外部负载均衡另行配置。

## 6. 启动、检查

```bash
cd /opt/hackhub/runtime
bash compose.sh config --quiet
bash compose.sh up -d --no-build --pull never --wait --wait-timeout 300
bash compose.sh ps -a
bash compose.sh exec -T api wget -qO- http://localhost:8081/actuator/health
curl -fsS http://127.0.0.1/health
```

WEB_PORT 不是 80 时调整 curl 端口。app/api/postgres/minio 应 healthy；minio-init 是一次性任务，
Exited (0) 正常。8081 只从容器内部检查。失败时在服务器本地查看相关日志，勿外发未经脱敏的日志、
完整 docker inspect 或 compose config 展开结果。浏览器验收登录、列表、图片、上传下载。

本配置只映射网站端口（默认 80）。Nginx 通过容器网络访问 API 和 MinIO。
堡垒机端口映射/网关指向 WEB_PORT，普通网站访问不用开放 5432、8080、9000、9001。
HTTPS/443 由现有网关提供。如有外部系统直连这些服务，切换前保留必要映射并限制访问来源。

## 7. 后续增量更新、回滚

### 只更新后端

构建机：

```bash
cd /home/aah5sgh/website_new
bash offline-release/package.sh 20261013-120000 api
```

上传生成的 `20261013-120000-api/` 到对应 incoming 目录，其中仅有 api.tar。
生产操作（有 Flyway 迁移时务必先备份数据库）：

```bash
cd /opt/hackhub/incoming/20261013-120000-api
sha256sum -c SHA256SUMS
docker load -i images/api.tar
cd /opt/hackhub/runtime
cp images.env images.env.before-api-update
# 必须与新包 images.env 内的 API_IMAGE 一致。
sed -i 's|^API_IMAGE=.*|API_IMAGE=hackhub-offline/api:20261013-120000|' images.env
bash compose.sh config --quiet
bash compose.sh up -d --no-deps --no-build --pull never --wait --wait-timeout 300 api
# 上一步成功且 API 健康后，重载 Nginx，重新解析 API 容器地址。
bash compose.sh exec -T app nginx -t
bash compose.sh exec -T app nginx -s reload
bash compose.sh ps -a
```

上传或 load 不会自动切换运行容器；restart api 也不会切换镜像。
更新会短暂中断，安排维护窗口。后端接口若有破坏性改变，需同时发布兼容前端。
只更新 API 不需要重新构建或上传前端，但当前 Nginx 静态解析容器地址，因此需重载。

### 只更新前端

构建机运行 `bash offline-release/package.sh 20261013-130000 app`。
SFTP 上传，校验，`docker load -i images/app.tar`；仅修改 runtime/images.env 的 APP_IMAGE 行，然后：

```bash
cd /opt/hackhub/runtime
bash compose.sh up -d --no-deps --no-build --pull never --wait --wait-timeout 120 app
```

前端 VITE_* 通常写入构建产物，改变时需要 build。
仅改后端运行时 .env 不需 build，但必须用 api 的 up 命令重建容器、再重载 Nginx。
Compose 或挂载脚本变动需要同步配置文件。已有数据库不会重新执行 init.sql，业务 SQL 使用 Flyway。

### 回滚

保留上版镜像与 images.env 备份。只恢复需要回滚服务的 IMAGE 行为旧标签，确认旧镜像存在
（否则 load 旧 tar），执行对应 up 命令；API 回滚后也重载 Nginx。
勿覆盖其他服务已经更新的版本行。镜像回滚不会撤销 Flyway 迁移；先确认旧代码兼容当前数据库，
不兼容时需执行经过确认的数据恢复计划，恢复会丢失备份后的新增数据。

## 8. 数据备份、迁移

源端使用原部署目录及原 Compose 参数停止 `app api minio`，PostgreSQL 保持运行。
网站在此期间中断；其他写入客户端也须停写。下面使用本项目标准容器名，在源端执行：

```bash
umask 077
mkdir -p /opt/hackhub/backups/migration
cd /opt/hackhub/backups/migration
docker exec hackhub-postgres pg_dump -U hackhub -d hackhub -Fc > postgres.dump
MINIO_VOLUME=$(docker inspect hackhub-minio --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
test -n "$MINIO_VOLUME"
PG_IMAGE=$(docker inspect hackhub-postgres --format '{{.Image}}')
# 使用已有 postgres 镜像里的 tar；MinIO 必须停止，避免在线复制损坏。
docker run --rm --pull never --network none --user 0 --entrypoint tar \
  -v "$MINIO_VOLUME:/data:ro" "$PG_IMAGE" -C /data -cpf - . > minio-data.tar
sha256sum postgres.dump minio-data.tar > DATA-SHA256SUMS
```

任一步失败均停止，不把错误输出当作成功备份。MinIO 备份包含隐藏的 .minio.sys 元数据。
业务数据按敏感文件管理；生产 .env 通过受控通道单独传，不放入镜像发布包。
若只是备份原站，备份完成后按原配置恢复服务；正式迁移时源站持续停写到切流完成，防止数据分叉。

数据文件经 SFTP 上传新目标备份目录。目标创建**全新空卷**、配置 .env、导入相同基础镜像后：

```bash
cd /opt/hackhub/backups/migration
sha256sum -c DATA-SHA256SUMS
cd /opt/hackhub/runtime
# 只启动 PostgreSQL，不启动 API/Flyway。
bash compose.sh up -d --no-build --pull never --wait --wait-timeout 120 postgres
bash compose.sh exec -T postgres pg_restore -U hackhub -d hackhub \
  --no-owner --no-acl --exit-on-error < /opt/hackhub/backups/migration/postgres.dump
# 改成 .env 中实际新目标 MinIO 卷名。
MINIO_VOLUME=app_minio_data
PG_IMAGE=$(sed -n 's/^POSTGRES_IMAGE=//p' images.env)
# MinIO 尚未启动；先确认目标卷为空。
docker run --rm --pull never --network none --user 0 --entrypoint sh \
  -v "$MINIO_VOLUME:/data" "$PG_IMAGE" -c 'test -z "$(ls -A /data)"'
# 仅上一步成功后解包，失败时不能覆盖已有数据。
docker run --rm -i --pull never --network none --user 0 --entrypoint tar \
  -v "$MINIO_VOLUME:/data" "$PG_IMAGE" -C /data -xpf - \
  < /opt/hackhub/backups/migration/minio-data.tar
```

恢复完成再按第 6 节启动，检查历史记录与附件后切换访问入口。
日常代码更新不重复恢复数据。始终避免 down -v、docker volume prune 或手动删除业务卷。

## 官方命令依据

- [docker image save](https://docs.docker.com/reference/cli/docker/image/save/)：按镜像和标签导出 tar。
- [docker image load](https://docs.docker.com/reference/cli/docker/image/load/)：导入镜像并恢复标签。
- [docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)：镜像或配置变化时重建容器并保留挂载卷。
