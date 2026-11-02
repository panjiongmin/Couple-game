import { test } from "node:test";
import assert from "node:assert/strict";
import { createState, applyAction, isFree, SLOT_SIZE } from "../public/games/pasture-stack/logic.js";

const two = (seat) => ({ seat, playerCount: 2 });

// 手工摆一个平铺、全部可点的牌局，方便验证规则。
function flatState(types) {
	const state = createState({ level: 1 });
	state.tiles = types.map((type, id) => ({ id, type, where: "board", x: id, y: 0, layer: 0 }));
	state.piles = { L: [], R: [] };
	return state;
}

function play(state, steps) {
	return steps.reduce((current, [seat, action]) => {
		const result = applyAction(current, action, two(seat));
		assert.ok(!result.error, `${JSON.stringify(action)} 失败：${result.error}`);
		return result.state;
	}, state);
}

test("每局每种图案的数量都是 3 的倍数", () => {
	for (let i = 0; i < 100; i += 1) {
		for (const level of [1, 2]) {
			const counts = {};
			createState({ level }).tiles.forEach((tile) => { counts[tile.type] = (counts[tile.type] || 0) + 1; });
			Object.values(counts).forEach((count) => assert.equal(count % 3, 0));
		}
	}
});

test("第 2 关有两堆各 10 张的盲牌，只有顶牌可拿", () => {
	const state = createState({ level: 2 });
	assert.equal(state.piles.L.length, 10);
	assert.equal(state.piles.R.length, 10);
	const free = state.piles.L.map((id) => isFree(state, state.tiles[id]));
	assert.deepEqual(free, [...Array(9).fill(false), true]);
});

test("对方没加入时不能开始", () => {
	const state = flatState(["🥕", "🥕", "🥕"]);
	const result = applyAction(state, { type: "pick", id: 0 }, { seat: 0, playerCount: 1 });
	assert.match(result.error, /另一位玩家/);
});

test("轮流拿牌：不是自己回合会被拒绝，拿完换人", () => {
	const state = flatState(["🥕", "🌽", "🥬"]);
	assert.match(applyAction(state, { type: "pick", id: 0 }, two(1)).error, /没轮到/);
	const next = play(state, [[0, { type: "pick", id: 0 }]]);
	assert.equal(next.turn, 1);
	assert.deepEqual(next.slot, [0]);
	assert.equal(state.slot.length, 0, "原状态不应被修改");
});

test("两人凑齐 3 张相同的会消除，全部清空即过关", () => {
	const state = flatState(["🥕", "🥕", "🥕"]);
	const steps = [[0, { type: "pick", id: 0 }], [1, { type: "pick", id: 1 }]];
	const afterTwo = play(state, steps);
	const result = applyAction(afterTwo, { type: "pick", id: 2 }, two(0));
	assert.deepEqual(result.event.cleared, [0, 1, 2]);
	assert.deepEqual(result.event.slotBefore, [0, 1, 2]);
	assert.equal(result.state.slot.length, 0);
	assert.equal(result.state.status, "win");
});

test("卡槽满 7 张一起输，复活把 3 张移到暂存区后继续", () => {
	const types = ["🥕", "🌽", "🥬", "🍄", "🌾", "🧶", "🪣", "🥕", "🌽"];
	let state = flatState(types);
	for (let id = 0; id < SLOT_SIZE; id += 1) state = play(state, [[state.turn, { type: "pick", id }]]);
	assert.equal(state.status, "fail");
	assert.match(applyAction(state, { type: "pick", id: 7 }, two(state.turn)).error, /结束/);
	const revived = applyAction(state, { type: "revive" }, two(1)).state;
	assert.equal(revived.status, "play");
	assert.equal(revived.slot.length, 4);
	assert.equal(revived.buffer.length, 3);
	assert.equal(revived.props.revive, 0);
	assert.match(applyAction(revived, { type: "revive" }, two(0)).error, /不需要复活|用过/);
});

test("撤回把牌放回原位，并由拿这张牌的人重新走", () => {
	const state = play(flatState(["🥕", "🌽", "🥬"]), [[0, { type: "pick", id: 0 }]]);
	const undone = applyAction(state, { type: "undo" }, two(1)).state;
	assert.equal(undone.tiles[0].where, "board");
	assert.equal(undone.turn, 0);
	assert.equal(undone.props.undo, 0);
	const again = play(undone, [[0, { type: "pick", id: 0 }]]);
	assert.match(applyAction(again, { type: "undo" }, two(1)).error, /用过/);
});

test("道具两人共享，每局只能用一次", () => {
	const state = play(flatState(["🥕", "🌽", "🥬", "🍄"]), [[0, { type: "pick", id: 0 }]]);
	const moved = applyAction(state, { type: "moveOut" }, two(1)).state;
	assert.deepEqual(moved.buffer, [0]);
	assert.match(applyAction(moved, { type: "moveOut" }, two(1)).error, /用过/);
	const shuffled = applyAction(moved, { type: "shuffle" }, two(1)).state;
	assert.equal(shuffled.props.shuffle, 0);
	assert.match(applyAction(shuffled, { type: "shuffle" }, two(1)).error, /用过/);
});
