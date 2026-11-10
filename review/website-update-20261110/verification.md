# website-- 修改验收记录

日期：2026-11-10。基于同事提供的 `a433a32`，分支 `fix/bd-voting-and-ui-copy`。

## 投票校验

- 第一笔提交：`d877712`。除 admin 外，投票前必须通过实际 `voting_participants` 名单匹配；仅在 profiles 中有 org_code 不代表在名单内。沿用现有邮箱／姓名规范化匹配方式。
- 单条投票及批量提交均校验；名单外 participant 和 manager 返回 403，提示 `Only folks from the BD department can vote.`。前端显示 4 秒通知，保留重试能力。
- admin 仅豁免新增的名单校验，其他原有规则继续生效。SSO、Token 验证、数据库结构、票数上限及部门规则均未改动。
- 保留新版点击已投票按钮撤票、草稿保存、附件及提交前确认功能。

## 展示修正

- `/nominate` 标题为 `Start Your Nomination`；修正 JPG、Nominator Name、文化说明等静态文字。
- 标题中的 a / the / and / to / of / in / with 等按英文展示习惯使用小写；赛道 API value 保持原值。
- 首页及提名页的类型切换均按 Team、Individual 排列；投票页原有正确排列保持不变，默认选择逻辑不变。
- `/my-nominations`、自己的提名详情、`/awards` 结果表格及个人／团队提交预览采用白底深黑字。深色附件条目保留可读的白字，主按钮保留原色。
- 历史提名正文中的旧标题仍能正常解析；未迁移或改写已保存数据。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 后端全部默认测试 | 675 通过，0 失败，0 错误 |
| 后端覆盖率 | 行覆盖率 83.66%，通过项目门槛 |
| 本次 6 个 Java 文件的 Spotless | 通过 |
| 前端全部测试（含 coverage） | 39 个文件、378 项通过 |
| 前端覆盖率 | 行覆盖率 74.85%，语句覆盖率 72.93% |
| TypeScript 和生产构建 | 通过；保留已有 bundle 大小提示 |
| ESLint | 0 错误；RealtimeContext 原有 2 个警告 |
| 真实 PostgreSQL 投票联调 | 40 项通过，测试投票已清理 |
| 浏览器验收 | 名单外提示、标题、两处顺序、表格和详情颜色、团队预览均已检查 |

后端执行 `mvn verify` 时，仓库原有大量文件存在 Spotless 格式问题，因此未过滤的 verify 仍失败。为控制修改范围，仅格式化本次 6 个 Java 文件，并用以下文件过滤执行完整默认测试、打包及覆盖率验证，结果通过：

```powershell
mvn -Djava.io.tmpdir=D:\Bosch\.tmp\vote-tests '-DspotlessFiles=.*NomineeDirectory.java,.*VoteIdeaUseCase.java,.*NomineeDirectoryTest.java,.*VoteIdeaUseCaseTest.java,.*VotingSubmissionIT.java,.*IdeaControllerTest.java' verify
npm run test:coverage -- --testTimeout=20000
npm run build
npm run lint
```

`mvn -Pintegration test` 已尝试，因本机没有 Docker，Testcontainers 无法初始化，该套 Docker 集成测试未通过，不能视为全绿。补充的真实接口联调使用独立本地 PostgreSQL：验证两类名单外用户对 Individual / Team 的单条和批量投票均被拒绝，所有提名计票及投票行不变；admin 可投；名单内人员可投；批量重复请求和 10 个并发首次请求均不重复计票；重复删除不产生负数；导入的 12 个提名原始计票和 16 条投票记录保持一致。单条投票接口原有的切换投票语义保持不变。

## 本地联调

- 前端：<http://127.0.0.1:5173>
- 本地测试登录：<http://127.0.0.1:5173/local-login>
- 后端 Swagger：<http://127.0.0.1:8080/swagger-ui/index.html>
- 数据库：`hackhub_local_20261110`，其他现有数据库未修改。
- 启停辅助脚本位于仓库外 `D:\Bosch\.local-dev`。本地密码登录入口与关闭 SSO 的启动配置均在仓库外，未提交凭据或生产配置改动。当前无 MinIO，存量附件预览仍需要配置存储服务。

## 截图

- [名单外用户投票提示](blocked-vote.png)
- [我的提名表格](my-nominations.png)
- [奖项结果表格](awards.png)
- [报名标题及顺序](nominate.png)
- [团队提交预览](team-review.png)
