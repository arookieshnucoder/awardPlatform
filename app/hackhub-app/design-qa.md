# 主页模块迁移验收

final result: passed

参考：用户提供的图2主页布局及蓝色科技背景；图1对应项目原有文字、表单和卡片样式。首屏保留图2内容，概览整体放在首屏下方；三个网站入口为概览、个人提名、浏览与投票。

- 桌面 1536 × 864：背景复用原视频和海报，导航正常；Get Started 跳转至首页概览，概览顶端滚动至距视口约24px。概览原有赛道、标准、时间线、提名入口全部复用。
- 移动端 390 × 844：主页、展开导航、提名和浏览页面均无横向溢出。
- 字体和表单：DigitalPioneer.css、index.css、Mantine主题未修改。浏览器对比迁移容器内与移除容器样式后的输入框、文本域、标签、卡片，fontFamily/fontSize/fontWeight/lineHeight/letterSpacing/color/backgroundColor/borderColor/borderWidth/borderRadius/padding/boxShadow 一致。
- 游客使用真实数据可浏览11条已公开提名、打开详情；点击投票后显示原有邮箱密码登录页面，redirect保留对应候选人。
- 普通用户不显示评审入口；管理员/管理者及获分配的评审员显示评审入口，评审路由按所分配评选校验。账号切换会清理旧角色及表单状态。
- 按“普通用户只能浏览投票”暂定：普通用户和游客可查看提名表单，提交仅对管理员和评选管理者开放；前后端均限制提交权限。
- 用户已确认将当前开放中的评选设为公开，已执行；草稿保持私有。公开接口不返回草稿、私有评选、评审分数、注册密钥或账号ID。

浏览器证据：`/tmp/award-home.png`、`/tmp/award-overview.png`、`/tmp/award-nominate.png`、`/tmp/award-vote.png`、`/tmp/award-detail.png`、`/tmp/award-login.png`、`/tmp/award-mobile.png`、`/tmp/award-mobile-nominate.png`。

验证：291项前端测试通过；23项公开浏览和投票/权限相关后端测试通过；生产构建通过；Java格式化通过；lint零错误，4项原有警告。浏览器主流程未出现页面脚本错误。匿名refresh接口返回401属于未登录的正常响应。

限制：本次没有使用真实账号提交新提名、投票或评审，以免改变现有业务数据；这些写入流程使用自动化测试验证。动态背景帧会随视频播放时间不同。
