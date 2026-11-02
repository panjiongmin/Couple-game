// 游戏注册表：新游戏在 public/games/<id>/logic.js 写好纯逻辑后，在这里登记一行。
// 每个逻辑模块需要导出 meta、createState()、applyAction()。
import * as pastureStack from "../public/games/pasture-stack/logic.js";
import * as goodnightGarden from "../public/games/goodnight-garden/logic.js";

export const GAMES = {
	[pastureStack.meta.id]: pastureStack,
	[goodnightGarden.meta.id]: goodnightGarden,
};
