// 牧场叠叠消：双人合作、回合制的叠牌三消。
// 纯逻辑模块：服务端（房间 Durable Object）用它校验每一步，前端用它判断哪些牌可点。
// 发牌照原版思路，只保证每种图案是 3 的倍数，随机打散，不验证是否有解。

export const meta = {
	id: "pasture-stack",
	name: "牧场叠叠消",
	summary: "两人共用一个牌局和一个 7 格卡槽，轮流各拿一张，一起清空牧场。",
	tags: ["双人合作", "回合制", "叠牌三消"],
	icon: "sheep",
	minPlayers: 2,
	maxPlayers: 2,
};

// 牌面图案，对应 /shared/icons.svg 里的图标。
export const TYPES = [
	"carrot", "corn", "cabbage", "mushroom", "eggplant", "broccoli", "watermelon", "strawberry",
	"grape", "banana", "blueberry", "peach", "pineapple", "cherry", "dragonfruit", "avocado",
];
export const SLOT_SIZE = 7;
export const BUFFER_MAX = 6;
export const PILE_SIZE = 10;
const LEVEL_TYPES = { 1: 3, 2: 14 };

function shuffle(list, random) {
	for (let i = list.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[list[i], list[j]] = [list[j], list[i]];
	}
	return list;
}

// 每层按左右对称随机铺牌；奇数层错开半张，形成互相压住的叠层。
function pushMirroredLayer(list, layer, fill, random) {
	const offset = layer % 2 ? 0.5 : 0;
	const cols = offset ? 6 : 7;
	const rows = offset ? 7 : 8;
	for (let r = 0; r < rows; r += 1) {
		for (let c = 0; c < Math.ceil(cols / 2); c += 1) {
			if (random() >= fill) continue;
			list.push({ x: c + offset, y: r + offset, layer });
			const mirror = cols - 1 - c;
			if (mirror !== c) list.push({ x: mirror + offset, y: r + offset, layer });
		}
	}
}

function buildBoardPositions(level, random) {
	const list = [];
	if (level === 1) {
		for (let r = 3; r <= 5; r += 1) {
			for (let c = 2; c <= 4; c += 1) list.push({ x: c, y: r, layer: 0 });
		}
		[[2.5, 3.5], [3.5, 3.5], [2.5, 4.5], [3.5, 4.5]].forEach(([x, y]) => list.push({ x, y, layer: 1 }));
		[[3, 3], [2, 4], [3, 4], [4, 4], [3, 5]].forEach(([x, y]) => list.push({ x, y, layer: 2 }));
		return list;
	}
	for (let layer = 0; layer < 8; layer += 1) {
		pushMirroredLayer(list, layer, 0.42 - layer * 0.025, random);
	}
	return list;
}

export function createState({ level = 1, random = Math.random } = {}) {
	const positions = buildBoardPositions(level, random);
	const pileCount = level === 1 ? 0 : PILE_SIZE;
	const extra = (positions.length + pileCount * 2) % 3;
	positions.splice(positions.length - extra, extra);
	const total = positions.length + pileCount * 2;
	const typeOrder = shuffle(TYPES.slice(), random).slice(0, LEVEL_TYPES[level]);
	const pool = [];
	for (let group = 0; group < total / 3; group += 1) {
		const type = typeOrder[group % typeOrder.length];
		pool.push(type, type, type);
	}
	shuffle(pool, random);

	const tiles = positions.map((pos, id) => ({ id, type: pool[id], where: "board", x: pos.x, y: pos.y, layer: pos.layer }));
	const piles = { L: [], R: [] };
	["L", "R"].forEach((side) => {
		for (let i = 0; i < pileCount; i += 1) {
			const id = tiles.length;
			tiles.push({ id, type: pool[id], where: "pile", pile: side });
			piles[side].push(id);
		}
	});

	return {
		level,
		tiles,
		piles,
		slot: [],
		buffer: [],
		props: { moveOut: 1, undo: 1, shuffle: 1, revive: 1 },
		last: null,
		status: "play",
		turn: 0,
		moves: 0,
	};
}

export function isFree(state, tile) {
	if (tile.where === "pile") {
		const pile = state.piles[tile.pile];
		return pile[pile.length - 1] === tile.id;
	}
	if (tile.where === "buffer") return true;
	if (tile.where !== "board") return false;
	return !state.tiles.some((other) => (
		other.where === "board" &&
		other.layer > tile.layer &&
		Math.abs(other.x - tile.x) < 0.999 &&
		Math.abs(other.y - tile.y) < 0.999
	));
}

export function remaining(state) {
	return state.tiles.filter((tile) => tile.where !== "gone").length;
}

function settle(state) {
	if (remaining(state) === 0) state.status = "win";
	else if (state.slot.length >= SLOT_SIZE) state.status = "fail";
}

function moveSlotToBuffer(state) {
	const count = Math.min(3, state.slot.length, BUFFER_MAX - state.buffer.length);
	state.slot.splice(0, count).forEach((id) => {
		state.tiles[id].where = "buffer";
		state.buffer.push(id);
	});
	state.last = null;
}

// 只有轮到的人能拿牌和用移出、撤回、洗牌；复活、重开、下一关谁都可以点。
const TURN_ACTIONS = new Set(["pick", "moveOut", "undo", "shuffle"]);

/**
 * @param {object} current 当前状态（不会被修改）
 * @param {{type: string, id?: number}} action
 * @param {{seat: number, playerCount: number, random?: () => number}} ctx
 * @returns {{state: object, event: object} | {error: string}}
 */
export function applyAction(current, action, { seat, playerCount, random = Math.random }) {
	const type = action?.type;
	if (TURN_ACTIONS.has(type)) {
		if (playerCount < meta.minPlayers) return { error: "等另一位玩家加入后才能开始" };
		if (current.status !== "play") return { error: "这一局已经结束了" };
		if (seat !== current.turn) return { error: "还没轮到你" };
	}
	const state = structuredClone(current);

	if (type === "pick") {
		const tile = state.tiles[action.id];
		if (!tile || tile.where === "slot" || tile.where === "gone" || !isFree(state, tile)) {
			return { error: "这张牌现在拿不了" };
		}
		if (state.slot.length >= SLOT_SIZE) return { error: "卡槽已经满了" };

		const from = { where: tile.where };
		if (tile.where === "pile") {
			state.piles[tile.pile].pop();
		} else if (tile.where === "buffer") {
			from.index = state.buffer.indexOf(tile.id);
			state.buffer.splice(from.index, 1);
		}
		tile.where = "slot";

		// 新牌插到同图案的牌后面，方便看出凑了几张。
		let insertAt = state.slot.length;
		state.slot.forEach((slotId, index) => {
			if (state.tiles[slotId].type === tile.type) insertAt = index + 1;
		});
		state.slot.splice(insertAt, 0, tile.id);
		state.last = { id: tile.id, from, seat };

		const event = { type: "pick", seat, id: tile.id, cleared: [], slotBefore: state.slot.slice() };
		const sameType = state.slot.filter((slotId) => state.tiles[slotId].type === tile.type);
		if (sameType.length >= 3) {
			event.cleared = sameType.slice(0, 3);
			state.slot = state.slot.filter((slotId) => !event.cleared.includes(slotId));
			event.cleared.forEach((id) => { state.tiles[id].where = "gone"; });
			state.last = null;
		}
		state.moves += 1;
		state.turn = (state.turn + 1) % playerCount;
		settle(state);
		return { state, event };
	}

	if (type === "moveOut") {
		if (!state.props.moveOut) return { error: "移出已经用过了" };
		if (!state.slot.length || state.buffer.length >= BUFFER_MAX) return { error: "现在没有可以移出的牌" };
		moveSlotToBuffer(state);
		state.props.moveOut -= 1;
		return { state, event: { type, seat } };
	}

	if (type === "undo") {
		if (!state.props.undo) return { error: "撤回已经用过了" };
		const last = state.last;
		if (!last || state.tiles[last.id].where !== "slot") return { error: "没有可以撤回的一步" };
		const tile = state.tiles[last.id];
		state.slot.splice(state.slot.indexOf(tile.id), 1);
		if (last.from.where === "pile") state.piles[tile.pile].push(tile.id);
		if (last.from.where === "buffer") state.buffer.splice(last.from.index, 0, tile.id);
		tile.where = last.from.where;
		// 撤回后由拿这张牌的人重新走这一步。
		state.turn = last.seat;
		state.props.undo -= 1;
		state.last = null;
		return { state, event: { type, seat } };
	}

	if (type === "shuffle") {
		if (!state.props.shuffle) return { error: "洗牌已经用过了" };
		const onField = state.tiles.filter((tile) => tile.where === "board" || tile.where === "pile");
		if (!onField.length) return { error: "场上没有可以洗的牌" };
		const types = shuffle(onField.map((tile) => tile.type), random);
		onField.forEach((tile, index) => { tile.type = types[index]; });
		state.props.shuffle -= 1;
		state.last = null;
		return { state, event: { type, seat } };
	}

	if (type === "revive") {
		if (state.status !== "fail") return { error: "现在不需要复活" };
		if (!state.props.revive) return { error: "复活已经用过了" };
		moveSlotToBuffer(state);
		state.props.revive -= 1;
		state.status = "play";
		return { state, event: { type, seat } };
	}

	if (type === "restart") {
		return { state: createState({ level: current.level, random }), event: { type, seat } };
	}

	if (type === "nextLevel") {
		if (current.status !== "win" || current.level !== 1) return { error: "过了第 1 关才能进入第 2 关" };
		return { state: createState({ level: 2, random }), event: { type, seat } };
	}

	if (type === "playAgain") {
		const level = action.level === 1 ? 1 : 2;
		return { state: createState({ level, random }), event: { type, seat } };
	}

	return { error: "不认识的操作" };
}
