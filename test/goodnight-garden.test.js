import test from "node:test";
import assert from "node:assert/strict";
import {
	applyAction, createState, simulateNight, settle, canBuildAt, comboMap, pathPoint, pathLength,
	BASKET, NIGHTS, REVIVE_BASKET, START_STARS, TOWERS,
} from "../public/games/goodnight-garden/logic.js";

let clock = 1_000_000;
const ctx = (seat, extra = {}) => ({ seat, playerCount: 2, now: clock, random: () => 0.5, ...extra });

function act(state, seat, action, extra) {
	const result = applyAction(state, action, ctx(seat, extra));
	assert.equal(result.error, undefined, result.error);
	return result.state;
}

function rejected(state, seat, action, pattern, extra) {
	const result = applyAction(state, action, ctx(seat, extra));
	assert.match(result.error || "", pattern);
}

// 一套能稳稳守住第 1 夜的布局
function strongDefense(state) {
	state.towers = [
		{ id: 1, kind: "sprinkler", x: 2, y: 2, level: 3, spent: 0 },
		{ id: 2, kind: "sprinkler", x: 6, y: 2, level: 3, spent: 0 },
		{ id: 3, kind: "windmill", x: 2, y: 6, level: 3, spent: 0 },
		{ id: 4, kind: "windmill", x: 6, y: 8, level: 3, spent: 0 },
		{ id: 5, kind: "sprinkler", x: 3, y: 10, level: 3, spent: 0 },
		{ id: 6, kind: "sprinkler", x: 5, y: 11, level: 3, spent: 0 },
	];
	state.nextId = 7;
	return state;
}

test("路线按格子走，终点是菜筐", () => {
	assert.deepEqual(pathPoint("L", 0), [500, 1500]);
	assert.deepEqual(pathPoint("L", pathLength("L")), [4500, 12500]);
	assert.deepEqual(pathPoint("R", pathLength("R")), [4500, 12500]);
});

test("路上和已有塔的格子不能建", () => {
	const state = act(createState(), 0, { type: "build", kind: "sunflower", x: 0, y: 0 });
	assert.equal(canBuildAt(state, 0, 0), false);
	assert.equal(canBuildAt(state, 0, 1), false);
	assert.equal(canBuildAt(state, 4, 3), true);
	rejected(state, 0, { type: "build", kind: "daisy", x: 1, y: 1 }, /放不下/);
});

test("兔兔只能种植物，猫猫只能造装置，各花各的星星", () => {
	let state = createState();
	rejected(state, 0, { type: "build", kind: "sprinkler", x: 4, y: 3 }, /猫猫/);
	rejected(state, 1, { type: "build", kind: "sunflower", x: 4, y: 3 }, /兔兔/);
	state = act(state, 1, { type: "build", kind: "sprinkler", x: 4, y: 3 });
	assert.deepEqual(state.stars, [START_STARS, START_STARS - TOWERS.sprinkler.cost]);
	const id = state.towers[0].id;
	rejected(state, 0, { type: "upgrade", id }, /归猫猫管/);
	state = act(state, 1, { type: "upgrade", id });
	assert.equal(state.towers[0].level, 2);
});

test("送星星给对方", () => {
	const state = act(createState(), 0, { type: "gift", amount: 10 });
	assert.deepEqual(state.stars, [START_STARS - 10, START_STARS + 10]);
	rejected(state, 0, { type: "gift", amount: 999 }, /不够/);
});

test("两人相邻的塔触发组合", () => {
	const combos = comboMap([
		{ id: 1, kind: "daisy", x: 2, y: 2 },
		{ id: 2, kind: "windmill", x: 3, y: 3 },
		{ id: 3, kind: "sunflower", x: 6, y: 6 },
	]);
	assert.ok(combos.get(1).has("breeze"));
	assert.ok(combos.get(2).has("breeze"));
	assert.equal(combos.get(3).size, 0);
});

test("夜晚演算完全可复现", () => {
	const input = { night: 3, towers: strongDefense(createState()).towers, basket: BASKET };
	const a = simulateNight(input, { record: true });
	const b = simulateNight(input, { record: true });
	assert.deepEqual(a, b);
	assert.equal(a.frames.length, a.ticks);
});

test("不放塔第 1 夜会被偷，菜筐见底就失败", () => {
	const empty = simulateNight({ night: 1, towers: [], basket: BASKET });
	assert.equal(empty.status, "survive");
	assert.ok(empty.stolen > 0);
	assert.equal(simulateNight({ night: 1, towers: [], basket: 3 }).status, "fail");
});

test("两人都准备好才入夜，播放结束后进入天亮选卡", () => {
	let state = strongDefense(createState());
	state = act(state, 0, { type: "ready" });
	assert.equal(state.status, "day");
	state = act(state, 1, { type: "ready" });
	assert.equal(state.status, "night");
	rejected(state, 0, { type: "build", kind: "sunflower", x: 4, y: 3 }, /天黑/);
	clock = state.run.endsAt;
	state = settle(state, clock);
	assert.equal(state.status, "dawn");
	assert.ok(state.stars[0] > START_STARS);
	state = act(state, 0, { type: "pick", index: 0 });
	assert.equal(state.status, "dawn");
	state = act(state, 1, { type: "pick", index: 1 });
	assert.equal(state.status, "day");
	assert.equal(state.night, 2);
});

test("失败后两人一起按住才能复活，只有一次", () => {
	let state = createState();
	state.basket = 2;
	state = act(state, 0, { type: "ready" });
	state = act(state, 1, { type: "ready" });
	clock = state.run.endsAt;
	state = settle(state, clock);
	assert.equal(state.status, "fail");
	state = act(state, 0, { type: "hold" });
	assert.equal(state.status, "fail");
	clock += 5000;
	state = act(state, 1, { type: "hold" });
	assert.equal(state.status, "fail", "间隔太久不算一起按住");
	clock += 300;
	state = act(state, 0, { type: "hold" });
	assert.equal(state.status, "day");
	assert.equal(state.basket, REVIVE_BASKET);
	assert.equal(state.revive, 0);
});

test("守住第 5 夜就通关", () => {
	let state = strongDefense(createState());
	state.night = NIGHTS;
	state = act(state, 0, { type: "ready" });
	state = act(state, 1, { type: "ready" });
	assert.equal(state.run.after, "win");
	state = settle(state, state.run.endsAt);
	assert.equal(state.status, "win");
	state = act(state, 0, { type: "restart" });
	assert.equal(state.night, 1);
});

test("对方没来时不能操作，但可以发表情", () => {
	const state = createState();
	const result = applyAction(state, { type: "build", kind: "sunflower", x: 4, y: 3 }, ctx(0, { playerCount: 1 }));
	assert.match(result.error, /另一位玩家/);
	const emote = applyAction(state, { type: "emote", name: "heart" }, ctx(0, { playerCount: 1 }));
	assert.equal(emote.event.name, "heart");
});
