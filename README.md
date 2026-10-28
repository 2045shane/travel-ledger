# 出游记账

和朋友出游时，按行程标题建一本账：谁垫了、谁参与、每人该摊多少。界面是中文，金额只记人民币。

数据写在这台浏览器的 `localStorage` 里。没有账号，没有服务器，也不连 Supabase。朋友要一起看，就用记账的那台设备、同一个浏览器打开。换设备之前，先导出 JSON 备份。

Cut：`TRAVEL-LEDGER-CUT-2026-10-28-v1`。2026-10-28 决定改为本地单人账本，不做分享链接，也不做云端同步。

## 本地使用

```bash
npm install
npm test
npm run dev
```

浏览器打开终端里给出的地址。生产包：

```bash
npm run build
npm run preview
```

不需要环境变量，仓库里也没有密钥。

## 怎么记账

1. 在首页写下行程标题，建立账本。标题不同就是另一本账，列表里点进去只看这一本。
2. 用昵称添加成员。人不在现场也可以加一个昵称，用来代记。
3. 记一笔费用：金额、一句说明、谁付的，再勾选参与的人。只在勾选的人之间均分。没勾的人不摊这笔。
4. 预收/预缴可以不记。要记的话，写清谁把钱交给了谁。不记预缴时，结算只按费用算。
5. 打开结算页：总支出、每人应收或应付、以及按笔明细（谁付、谁分、各多少）。每笔账和账本都会带上创建时间、更新时间。

## 结算怎么算

费用：付款人先垫全额。勾选的参与人均分；除不尽时，多出来的 1 分钱按成员添加顺序分给更靠前的人。付款人可以不参与分摊，例如一个人请另外两个人吃饭。

预缴：甲提前把一笔钱交给乙。这笔不进总支出。甲的净额加上它，乙的净额减去它。

每人净额 = 垫付的费用 + 自己预缴出去的 − 应摊 − 收到的预缴。

正数是应收，负数是应付，零是已平。

## 备份

首页可以导出、导入 JSON。导入会覆盖这台浏览器里现有的全部账本。文件只放在你自己的设备上。

存储键名是 `travel-ledger:v1`。形状：

- 账本 `trips[]`：`id`，`title`，`createdAt`，`updatedAt`，`members[]`，`entries[]`
- 成员：`id`，`nickname`，`createdAt`
- 账目：`id`，`kind`（`expense` 或 `prepaid`），`amountCents`（分），`note`，费用的 `payerMemberId` 与 `participantMemberIds`，预缴的 `prepaidMemberId` 与 `receiverMemberId`，`createdAt`，`updatedAt`

## 部署到 GitHub Pages

仓库：<https://github.com/2045shane/travel-ledger>

站点会在合并到 `main` 之后，由 `.github/workflows/pages.yml` 构建并发布。构建时设置 `GITHUB_PAGES=true`，资源前缀是 `/travel-ledger/`。

1. 打开仓库 Settings → Pages。
2. Build and deployment 的 Source 选 **GitHub Actions**。
3. 把 `main` 上的这次改动合并进去，或在 Actions 里手动跑 “Deploy to GitHub Pages”。
4. 部署完成后打开 <https://2045shane.github.io/travel-ledger/> 。

Pages 对公开仓库是免费的。这个静态站点没有后端，构建也不读取密钥。

## 添加到主屏幕

手机浏览器打开站点后，用浏览器菜单里的「添加到主屏幕」或「安装应用」。项目带了 `manifest.webmanifest` 和 `sw.js`，安装后可以离线打开已经缓存的页面。账本数据仍在这台浏览器里，不在服务器上。

微信内置浏览器一般能直接打开链接并记账。微信里不一定能安装 PWA，需要的话用系统浏览器打开同一地址。

## 免费边界

- 托管用 GitHub Pages，不买服务器，不买数据库。
- 不注册、不登录、不接支付，也不代收代付。
- 不做微信小程序、行程地图、多币种、比例分摊、小票识别或 AI 记账。

## 联系

小红书搜「珊哥爱读书」。
