import test from "node:test";
import assert from "node:assert/strict";
import {
	applyAction, createState, simulateNight, settle, canBuildAt, comboMap, pathPoint, pathLength, waveSpawns,
	nightDifficulty, towersFor, unlockedGardens, GARDENS, BASKET, REVIVE_BASKET, START_STARS, TOWERS, COMBOS,
	towerRange,
} from "../public/games/goodnight-garden/logic.js";

const towerRangeOf = (tower, weather) => towerRange(tower, comboMap([tower]), weather);

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
	GARDENS.forEach((garden) => {
		Object.entries(garden.paths).forEach(([lane, points]) => {
			assert.deepEqual(pathPoint(garden.id, lane, 0), [points[0][0] * 1000 + 500, points[0][1] * 1000 + 500]);
			assert.deepEqual(pathPoint(garden.id, lane, pathLength(garden.id, lane)), [garden.crate[0] * 1000 + 500, garden.crate[1] * 1000 + 500]);
			assert.ok(pathLength(garden.id, lane) >= 19000, `${garden.id} ${lane} 路太短`);
		});
	});
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

test("守住最后一夜就通关，解锁下一座菜园和无尽模式", () => {
	let state = strongDefense(createState());
	state.night = GARDENS[0].nights;
	state.basket = 999;
	state = act(state, 0, { type: "ready" });
	state = act(state, 1, { type: "ready" });
	assert.equal(state.run.after, "win");
	state = settle(state, state.run.endsAt);
	assert.equal(state.status, "win");
	assert.deepEqual(state.cleared, ["veggie"]);
	rejected(state, 0, { type: "setup", garden: "meadow" }, /还没解锁/);
	const next = act(state, 1, { type: "setup", garden: "orchard" });
	assert.equal(next.garden, "orchard");
	assert.equal(next.night, 1);
	assert.deepEqual(next.cleared, ["veggie"]);
	const endless = act(state, 0, { type: "setup", garden: "veggie", mode: "endless" });
	assert.equal(endless.mode, "endless");
	const again = act(state, 0, { type: "restart" });
	assert.equal(again.night, 1);
	assert.equal(again.garden, "veggie");
});

test("一局开始后要先重开才能换菜园", () => {
	let state = createState({ cleared: ["veggie"] });
	state = act(state, 0, { type: "build", kind: "sunflower", x: 4, y: 3 });
	rejected(state, 0, { type: "setup", garden: "orchard" }, /已经开始/);
});

test("无尽模式没有最后一夜，记录最远守到第几夜", () => {
	let state = strongDefense(createState({ mode: "endless", cleared: ["veggie"] }));
	state.night = 12;
	state.basket = 999;
	state = act(state, 0, { type: "ready" });
	state = act(state, 1, { type: "ready" });
	assert.equal(state.run.after, "dawn");
	assert.equal(state.best, 12);
});

test("每晚的小偷是确定的，越往后越多越壮", () => {
	GARDENS.forEach((garden) => {
		assert.deepEqual(waveSpawns(garden.id, "story", 3), waveSpawns(garden.id, "story", 3));
		let previous = 0;
		for (let night = 1; night <= garden.nights; night += 1) {
			const { budget, hp } = nightDifficulty(garden.id, "story", night);
			assert.ok(waveSpawns(garden.id, "story", night).length > 0);
			assert.ok(budget * hp > previous, `${garden.id} 第 ${night} 夜没有比前一夜难`);
			previous = budget * hp;
		}
		const last = waveSpawns(garden.id, "story", garden.nights);
		assert.ok(last.some((spawn) => spawn.kind === garden.boss), `${garden.id} 最后一夜没有首领`);
	});
});

test("小菜园只有 3 种塔，从河边果园开始有仙人掌和蜂蜜罐", () => {
	assert.deepEqual(towersFor(createState(), 0), ["sunflower", "daisy", "carrot"]);
	assert.deepEqual(towersFor(createState({ garden: "orchard" }), 1), ["scarecrow", "sprinkler", "windmill", "honey"]);
	rejected(createState(), 0, { type: "build", kind: "cactus", x: 4, y: 3 }, /用不了/);
	assert.deepEqual(unlockedGardens([]), ["veggie"]);
	assert.deepEqual(unlockedGardens(["veggie", "orchard"]), ["veggie", "orchard", "meadow"]);
});

test("蜂蜜罐把蜂蜜扔到路上，踩到的小偷会被黏住", () => {
	const { effects, frames } = simulateNight({
		garden: "orchard", night: 2, basket: BASKET,
		towers: [{ id: 1, kind: "honey", x: 2, y: 3, level: 1, spent: 0 }],
	}, { record: true });
	const puddle = effects.find((effect) => effect.type === "puddle");
	assert.ok(puddle && puddle.until > puddle.tick);
	assert.ok(frames.some((frame) => frame.some((row) => row[4] & 16)), "没有小偷被黏住");
});

test("天气会改变塔的范围", () => {
	const tower = { id: 1, kind: "windmill", x: 2, y: 2, level: 1 };
	assert.equal(towerRangeOf(tower, "wind"), towerRangeOf(tower, "calm") + 400);
	assert.ok(towerRangeOf(tower, "fog") < towerRangeOf(tower, "calm"));
});

test("水滴和草团要飞一会儿才落地", () => {
	const run = (towers) => simulateNight({ night: 2, towers, basket: BASKET }, { record: true }).effects;
	const straw = run([{ id: 1, kind: "scarecrow", x: 2, y: 5, level: 1, spent: 0 }, { id: 2, kind: "scarecrow", x: 6, y: 3, level: 1, spent: 0 }]);
	assert.ok(straw.some((effect) => effect.type === "shot" && effect.style === "straw"));
	const effects = run([{ id: 1, kind: "sprinkler", x: 2, y: 2, level: 1, spent: 0 }]);
	const shots = [...straw, ...effects].filter((effect) => effect.type === "shot");
	shots.forEach((shot) => assert.ok(shot.arrive > shot.tick));
	const firstDrop = shots.find((shot) => shot.style === "drop");
	assert.ok(effects.some((effect) => effect.type === "hit" && effect.tick === firstDrop.arrive && effect.unit === firstDrop.unit));
});

test("十六种组合都能被触发", () => {
	const plants = ["sunflower", "daisy", "carrot", "cactus"];
	const devices = ["scarecrow", "sprinkler", "windmill", "honey"];
	const found = new Set();
	plants.forEach((plant) => devices.forEach((device) => {
		const combos = comboMap([{ id: 1, kind: plant, x: 2, y: 2 }, { id: 2, kind: device, x: 2, y: 3 }]);
		combos.get(1).forEach((id) => found.add(id));
	}));
	assert.equal(found.size, 16);
	assert.equal(COMBOS.length, 16);
});

test("花露水让淋到的小偷持续犯困，香味飘远连小猴子也能引过来", () => {
	const base = (night, towers) => simulateNight({ night, towers, basket: BASKET }, { record: true });
	const dew = base(1, [
		{ id: 1, kind: "sprinkler", x: 2, y: 2, level: 1, spent: 0 },
		{ id: 2, kind: "daisy", x: 8, y: 12, level: 1, spent: 0 },
	]);
	const dewCombo = base(1, [
		{ id: 1, kind: "sprinkler", x: 2, y: 2, level: 1, spent: 0 },
		{ id: 2, kind: "daisy", x: 2, y: 3, level: 1, spent: 0 },
	]);
	assert.ok(dewCombo.effects.some((effect) => effect.type === "shot" && effect.style === "dew"));
	assert.ok(dewCombo.slept.pig + dewCombo.slept.mouse >= dew.slept.pig + dew.slept.mouse);

	const lured = (towers) => {
		const result = base(4, towers);
		assert.ok(result.units.some((unit) => unit.kind === "monkey"), "第 4 夜应该有小猴子");
		return result.effects.filter((effect) => effect.type === "lure").some((effect) => result.units[effect.unit].kind === "monkey");
	};
	assert.equal(lured([{ id: 1, kind: "carrot", x: 6, y: 8, level: 1, spent: 0 }]), false);
	assert.equal(lured([
		{ id: 1, kind: "carrot", x: 6, y: 8, level: 1, spent: 0 },
		{ id: 2, kind: "windmill", x: 6, y: 9, level: 1, spent: 0 },
	]), true);
});

test("中途重开要两人都同意，一方拒绝就取消", () => {
	let state = act(createState(), 0, { type: "build", kind: "sunflower", x: 4, y: 3 });
	state = act(state, 0, { type: "restartVote" });
	assert.deepEqual(state.restartVote, [true, false]);
	state = act(state, 1, { type: "restartVote", agree: false });
	assert.deepEqual(state.restartVote, [false, false]);
	assert.equal(state.towers.length, 1);
	state = act(state, 1, { type: "restartVote" });
	state = act(state, 0, { type: "restartVote" });
	assert.equal(state.towers.length, 0);
	assert.equal(state.night, 1);
	assert.deepEqual(state.stars, [START_STARS, START_STARS]);
});

test("对方没来时不能操作，但可以发表情", () => {
	const state = createState();
	const result = applyAction(state, { type: "build", kind: "sunflower", x: 4, y: 3 }, ctx(0, { playerCount: 1 }));
	assert.match(result.error, /另一位玩家/);
	const emote = applyAction(state, { type: "emote", name: "heart" }, ctx(0, { playerCount: 1 }));
	assert.equal(emote.event.name, "heart");
});
