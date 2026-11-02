# Couple-game · 两人游戏馆

两个人在各自的手机或电脑上一起玩的小游戏合集。建一个房间，把邀请链接发给对方，对方打开就能加入。

线上地址：https://couple.887756.xyz

运行在 Cloudflare 上：一个 Worker 同时提供页面和房间接口，每个房间是一个 Durable Object，负责座位、在线状态、回合顺序和规则校验。

## 已有游戏

| 游戏 | 人数 | 玩法 |
|---|---|---|
| 晚安小菜园 `goodnight-garden` | 2 人合作 | 塔防。夜里小动物来偷菜，兔兔种花（向日葵、小雏菊、胡萝卜），猫猫造机关（稻草人、洒水壶、风车），各花各的星星，可以互送。白天两人同时布置、都准备好后入夜，夜里自动播放：水滴和草团沿抛物线飞、风一圈圈往外推。兔兔的植物和猫猫的装置挨着会触发组合，3 × 3 共 9 种效果，页面里有组合图鉴，放塔时会标出能组合的格子。带合成的背景音乐和音效，可以分别关掉。守住 5 夜通关，菜筐空了可以两人一起按住复活一次；中途想重来点"重开"，对方同意后回到第 1 夜。手机上点塔种类、小偷或格子就能看到说明和数值，放塔要先点格子预览、再点一次确认。 |
| 牧场叠叠消 `pasture-stack` | 2 人合作 | 回合制叠牌三消。两人共用一个牌局和一个 7 格卡槽，轮流各拿一张，一起清空牧场；卡槽满了一起输。牌局随机生成，不保证有解。移出、撤回、洗牌、复活两人共享，每局各 1 次。 |

## 本地开发

需要 Node.js 18 以上。

```bash
npm install
npm run dev
```

打开 http://localhost:8787 。同一个浏览器开两个标签页就是两位玩家，可以直接试玩。

```bash
npm test
```

运行游戏逻辑的单元测试（Node 自带的 `node:test`，不需要额外依赖）。

## 部署到 Cloudflare

```bash
npx wrangler login
npm run deploy
```

`wrangler.jsonc` 里把 Worker 绑定到自定义域名 `couple.887756.xyz`（`routes` 中的 `custom_domain`），部署时 Cloudflare 会自动创建 DNS 记录和证书。换域名只需改这一行，域名必须托管在同一个 Cloudflare 账号下。Durable Objects 使用 SQLite 存储，Workers 免费套餐即可运行。

## 目录结构

```
src/
  worker.js        Worker 入口：/api/* 路由，其余请求交给静态资源
  room.js          GameRoom Durable Object：所有游戏通用的房间
  games.js         游戏注册表
public/
  index.html       首页：游戏列表、按房间码加入
  shared/
    room-client.js 前端通用房间客户端：玩家身份、建房、连接与重连、邀请链接
    icons.svg      图标 sprite（牌面果蔬、小动物、界面图标），用 <use href="/shared/icons.svg#名字"> 引用
    icons.js       icon(name) 生成图标元素
    sound.js       合成的背景音乐和音效
  games/
    pasture-stack/
      logic.js     纯规则模块，服务端和前端共用
      index.html   游戏页面
    goodnight-garden/
      logic.js     塔防规则和夜晚演算（服务端算结果，前端用同样的输入重放动画）
      index.html   游戏页面
test/
  pasture-stack.test.js
  goodnight-garden.test.js
```

## 房间是怎么工作的

- `POST /api/rooms`，请求体 `{ "game": "pasture-stack" }`：创建房间，返回 6 位房间码（不含容易看错的 0/O、1/I/L）。
- `GET /api/rooms/:code`：查询房间是否存在、属于哪个游戏、几个人。
- `GET /api/rooms/:code/ws?player=<玩家标识>&name=<昵称>`：WebSocket 连接。
  - 客户端发送 `{ "type": "<操作>", ... }`。
  - 服务端用游戏的 `applyAction(state, action, { seat, playerCount, now })` 校验并更新状态，再把 `{ type: "state", serverTime, room, you, state, event }` 广播给房间里所有人。`serverTime` 用来校准前端时钟，有计时的游戏（比如夜晚回放）靠它让两边播放同步。
  - 不合法的操作只回给发起人 `{ type: "error", message }`，比如"还没轮到你"。
- 服务端是唯一可信的状态来源，前端只发操作、只渲染广播回来的状态。
- 玩家标识按浏览器标签页保存，刷新不变。关掉页面后再从邀请链接回来，会接管不在线的那个座位。
- 房间使用 WebSocket Hibernation：没人操作时房间会休眠，不产生持续计费。心跳 `ping` 由运行时直接回 `pong`，不会唤醒房间。
- 房间闲置 7 天后自动清理。

## 图标

界面是奶油底色加粉、薄荷、薰衣草、奶黄四种柔和色，图标来自 [iconfont](https://www.iconfont.cn/)，版权归原作者所有：

| 用途 | 合集 | 作者 |
|---|---|---|
| 牌面果蔬 | [水果铺子](https://www.iconfont.cn/collections/detail?cid=51141)、[蔬菜超市](https://www.iconfont.cn/collections/detail?cid=51142) | 阿狸的信燕 |
| 小羊、小兔、小猫 | [彩色动物club](https://www.iconfont.cn/collections/detail?cid=50174) | 芝芝桃桃和丸子 |
| 爱心、邀请、礼花、花朵、新芽 | [可爱生活彩色线性图标](https://www.iconfont.cn/collections/detail?cid=54346) | 黑洛视觉 |
| 小猪、小老鼠、小猴子、狐狸 | [彩色动物club](https://www.iconfont.cn/collections/detail?cid=50174) | 芝芝桃桃和丸子 |
| 向日葵、小雏菊 | [多彩小植物](https://www.iconfont.cn/collections/detail?cid=50664) | 芝芝桃桃和丸子 |
| 稻草人、洒水壶、风车、菜筐 | [复古农场小游戏](https://www.iconfont.cn/collections/detail?cid=52094) | 叁叁sanh |

合并进 sprite 时把描边从纯黑统一换成暖棕 `#4A3A33`。《复古农场小游戏》的颜色偏艳、描边没写颜色，合并时换成了柔和色并补上暖棕描边。星星和月亮按果蔬图标的画法补画。移出、撤回、洗牌三个道具图标在 iconfont 上没找到同风格的，按《可爱生活彩色线性图标》的画法（浅色圆底、右上角圆点、圆头描边）补画。

新游戏可以直接引用 sprite 里已有的图标；要加新图标，把 SVG 的内容包成 `<symbol id="名字" viewBox="...">` 追加到 `icons.svg`。

## 晚安小菜园的夜晚是怎么算的

- 两人都按"准备"时，服务端调用 `simulateNight()` 把整夜一次算完：结果（哄睡几只、叼走几颗、得多少星星）直接写进状态，并记下开始时间和结束时间。
- 演算不用随机数，全程整数运算（1 格 = 1000 个长度单位，1 秒 = 10 步），所以前端拿同样的塔和当晚序号再跑一遍，得到的每一步都和服务端一模一样，只用来播放动画，不需要实时同步位置。
- 前端按 `serverTime` 校准后的时间播放，中途断线重连会直接跳到当前进度。播放结束前，天亮/失败/通关不会显示出来。
- 弹道也在演算里：洒水壶的水滴、稻草人的草团出手时就算好落地是第几步，风车的风按距离先后吹到，到那一步才生效。前端照着出手步和落地步画抛物线，落点正好是小偷那一刻的位置。
- 小偷、塔、组合和每晚的波次都写在 `logic.js` 开头，改数值只动那里。

## 音乐和音效

`public/shared/sound.js` 用 Web Audio 现场合成，不需要任何音频文件：白天是轻快的拨弦，夜里是八音盒摇篮曲，攻击、组合技、哄睡、偷菜、建造等都有各自的音效。浏览器要求先点一下页面才能出声，开关状态存在本机。其他游戏可以直接 `createSound()` 复用，在 `SFX` 里加新的音效。

## 添加一个新游戏

1. 新建 `public/games/<id>/logic.js`，导出：
   - `meta`：`{ id, name, summary, tags, icon, minPlayers, maxPlayers }`
   - `createState()`：返回新一局的初始状态（必须能被 JSON 序列化）
   - `applyAction(state, action, { seat, playerCount })`：不能修改传入的 `state`；成功返回 `{ state, event }`，失败返回 `{ error }`。回合检查也写在这里。
2. 在 `src/games.js` 里登记这个模块。
3. 新建 `public/games/<id>/index.html`，用 `/shared/room-client.js` 的 `connectRoom()` 连接房间、发送操作、渲染状态。`meta.icon` 写 sprite 里的图标名，首页卡片会显示它。
4. 在 `test/` 下给规则写单元测试。

首页的游戏列表来自 `/api/games`，登记后会自动出现。
