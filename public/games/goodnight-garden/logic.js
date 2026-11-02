// 晚安小菜园：双人合作塔防。夜里小动物来偷菜，兔兔种花、猫猫造机关，一起把小偷哄睡送走。
// 白天两人同时布置，都准备好后入夜。夜晚是确定性演算：服务端算一次得出结果，
// 前端拿同样的输入再跑一遍来播放动画。全程整数运算，保证服务端和各浏览器算出来一模一样。

export const meta = {
	id: "goodnight-garden",
	name: "晚安小菜园",
	summary: "夜里小动物来偷菜。兔兔种花、猫猫造机关，两人白天一起布置，夜里看小偷一个个被哄睡送走。",
	tags: ["双人合作", "塔防", "白天布置"],
	icon: "sunflower",
	minPlayers: 2,
	maxPlayers: 2,
};

export const COLS = 9;
export const ROWS = 13;
export const CELL = 1000;            // 1 格 = 1000 个长度单位
export const TICK_MS = 100;          // 演算步长，1 秒 10 步
export const MAX_TICKS = 1800;       // 一夜最长 3 分钟
export const NIGHTS = 5;
export const BASKET = 20;
export const START_STARS = 30;
export const NIGHT_BONUS = 8;
export const REVIVE_BASKET = 8;
export const HOLD_WINDOW = 1200;     // 两人按住的时间差在这之内算"一起按住"
export const END_PAUSE_MS = 1500;    // 最后一只小偷离场后留一点时间播完动画
export const HP_GROWTH = 25;         // 每过一夜，小偷的清醒值多 25%

export const ROLES = [
	{ name: "兔兔", title: "园丁", avatar: "rabbit", towers: ["sunflower", "daisy", "carrot"] },
	{ name: "猫猫", title: "工匠", avatar: "cat", towers: ["scarecrow", "sprinkler", "windmill"] },
];

// 数值按等级 1～3 排列。range 是半径（长度单位），cooldown 是演算步数，damage 是降低的清醒值。
export const TOWERS = {
	sunflower: {
		name: "向日葵", icon: "sunflower", seat: 0, cost: 12,
		desc: "照亮一圈，范围内的小偷走得慢",
		range: [1600, 1900, 2200], slow: [30, 38, 45],
	},
	daisy: {
		name: "小雏菊", icon: "daisy", seat: 0, cost: 15,
		desc: "安眠花香，范围内的小偷一直犯困",
		range: [1400, 1600, 1800], drip: [12, 18, 26],
	},
	carrot: {
		name: "胡萝卜", icon: "carrot", seat: 0, cost: 10,
		desc: "诱饵，路过的小偷停下来啃一会儿，同时最多 2 只",
		range: [1300, 1500, 1700], hold: [12, 16, 20],
	},
	scarecrow: {
		name: "稻草人", icon: "scarecrow", seat: 1, cost: 12,
		desc: "把跑在最前面的小偷吓退一段",
		range: [1500, 1600, 1700], push: [800, 1100, 1400], cooldown: [40, 35, 30], damage: [50, 70, 90],
	},
	sprinkler: {
		name: "洒水壶", icon: "watering-can", seat: 1, cost: 15,
		desc: "一下一下地洒水，单只小偷很快犯困",
		range: [2200, 2400, 2600], damage: [80, 120, 170], cooldown: [6, 6, 5],
	},
	windmill: {
		name: "风车", icon: "windmill", seat: 1, cost: 20,
		desc: "隔一会儿吹一阵晚风，一圈小偷一起犯困",
		range: [1800, 2000, 2200], damage: [180, 270, 380], cooldown: [30, 28, 26],
	},
};

export const MAX_LEVEL = 3;

export function upgradeCost(kind, level) {
	const base = TOWERS[kind].cost;
	return level === 1 ? base : Math.round(base * 1.5);
}

// 兔兔的植物和猫猫的装置紧挨着（含斜对角）时触发组合，3 × 3 每一对都有自己的效果。
export const COMBOS = [
	{ id: "rainbow", name: "小彩虹", pair: ["sunflower", "sprinkler"], desc: "洒水壶每 4 秒挂一道彩虹，范围内的小偷看呆 1 秒" },
	{ id: "sunguard", name: "向阳守卫", pair: ["sunflower", "scarecrow"], desc: "稻草人扔得更有劲，吓退距离 +50%，砸中的小偷 2 秒内慢吞吞" },
	{ id: "warmwind", name: "暖风", pair: ["sunflower", "windmill"], desc: "风车吹的是暖风，被吹到的小偷 3 秒内走得慢" },
	{ id: "dew", name: "花露水", pair: ["daisy", "sprinkler"], desc: "洒水壶的水带着花香，淋到的小偷 3 秒内一直犯困" },
	{ id: "lullaby", name: "催眠稻草人", pair: ["daisy", "scarecrow"], desc: "稻草人扔的是花粉团，砸中一下困一大截" },
	{ id: "breeze", name: "晚风花香", pair: ["daisy", "windmill"], desc: "小雏菊的花香被风吹远，范围 +0.6 格" },
	{ id: "trap", name: "陷阱路口", pair: ["carrot", "scarecrow"], desc: "啃完胡萝卜的小偷会被吓退 1 格" },
	{ id: "sprout", name: "浇水萝卜", pair: ["carrot", "sprinkler"], desc: "胡萝卜被浇得又大又甜，同时能引 4 只，啃得更久" },
	{ id: "scent", name: "香味飘远", pair: ["carrot", "windmill"], desc: "风把萝卜香吹远，范围 +0.8 格，连小猴子也会被引过来" },
];

// 弹道：洒水壶的水滴和稻草人扔的草团都要飞一会儿才落到小偷身上，风车的风一圈圈往外推。
export const DROP_SPEED = 350;   // 水滴每步飞多远
export const LOB_SPEED = 250;    // 草团每步飞多远（抛得高，飞得慢）
export const WAVE_SPEED = 450;   // 风每步往外推多远
const flightTicks = (dx, dy, speed, base) => base + Math.floor((Math.abs(dx) + Math.abs(dy)) / speed);

export const CRITTERS = {
	pig: { name: "小猪", icon: "pig", hp: 1100, speed: 45, steal: 1, reward: 2, desc: "慢吞吞，很难哄睡" },
	mouse: { name: "小老鼠", icon: "mouse", hp: 380, speed: 110, steal: 1, reward: 1, burrow: true, desc: "跑得快，会钻地，稻草人吓不退" },
	monkey: { name: "小猴子", icon: "monkey", hp: 520, speed: 85, steal: 1, reward: 2, jump: true, desc: "蹦蹦跳跳，只有洒水壶和风车碰得到" },
	fox: { name: "狐狸大王", icon: "fox", hp: 6000, speed: 50, steal: 3, reward: 10, boss: true, desc: "一次叼走 3 颗菜，吓退距离减半" },
};

// 两条小路，从地图上方两侧进来，在菜筐前汇合。坐标是格子。
export const PATHS = {
	L: [[0, 1], [3, 1], [3, 4], [1, 4], [1, 8], [4, 8], [4, 12]],
	R: [[8, 1], [5, 1], [5, 6], [7, 6], [7, 10], [4, 10], [4, 12]],
};
export const CRATE = [4, 12];

// 每晚的小偷：[种类, 路线, 数量, 第几秒开始, 间隔秒]
export const WAVES = {
	1: [["pig", "L", 3, 0, 4], ["pig", "R", 3, 2, 4], ["mouse", "L", 3, 12, 2]],
	2: [["pig", "L", 4, 0, 3.5], ["mouse", "R", 5, 4, 1.5], ["monkey", "L", 3, 10, 3], ["pig", "R", 3, 14, 3]],
	3: [["mouse", "L", 8, 0, 1], ["monkey", "R", 6, 3, 2], ["pig", "L", 6, 8, 2.5], ["pig", "R", 4, 10, 3], ["mouse", "R", 8, 16, 1]],
	4: [["pig", "L", 8, 0, 2], ["pig", "R", 8, 0, 2], ["monkey", "L", 7, 6, 1.6], ["monkey", "R", 7, 8, 1.6], ["mouse", "L", 10, 18, 0.8], ["mouse", "R", 10, 22, 0.8]],
	5: [["mouse", "L", 8, 0, 0.8], ["mouse", "R", 8, 0, 0.8], ["pig", "L", 8, 6, 2], ["monkey", "R", 8, 8, 1.5], ["fox", "L", 1, 18, 0], ["pig", "R", 8, 20, 2], ["monkey", "L", 8, 24, 1.5], ["mouse", "R", 10, 30, 0.7]],
};

export const CARDS = {
	pouch: { name: "星星袋", desc: "自己 +15 星星" },
	gift: { name: "小礼物", desc: "给对方 +12 星星" },
	veggies: { name: "补点菜", desc: "菜筐 +2 颗菜" },
	sale: { name: "打折券", desc: "下一次建造半价" },
	polish: { name: "免费升级", desc: "下一次升级不花星星" },
	together: { name: "同心卡", desc: "两人都选它：各 +20 星星；只有一人选：+5" },
};

export const EMOTES = { heart: "比心", yay: "好耶", haha: "哈哈哈", cheer: "加油", sleepy: "困了" };

const cellKey = (x, y) => `${x},${y}`;

const SEGMENTS = Object.fromEntries(Object.entries(PATHS).map(([lane, points]) => {
	const segments = [];
	let start = 0;
	for (let i = 1; i < points.length; i += 1) {
		const [x0, y0] = points[i - 1];
		const [x1, y1] = points[i];
		const length = (Math.abs(x1 - x0) + Math.abs(y1 - y0)) * CELL;
		segments.push({ x0, y0, x1, y1, start, length });
		start += length;
	}
	return [lane, { segments, length: start }];
}));

export const PATH_CELLS = new Set();
Object.values(PATHS).forEach((points) => {
	for (let i = 1; i < points.length; i += 1) {
		const [x0, y0] = points[i - 1];
		const [x1, y1] = points[i];
		for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) {
			for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 1) PATH_CELLS.add(cellKey(x, y));
		}
	}
});

export function pathLength(lane) {
	return SEGMENTS[lane].length;
}

// 沿路线走了 d 之后的位置（长度单位，格子中心为 x*1000+500）。
export function pathPoint(lane, d) {
	const { segments, length } = SEGMENTS[lane];
	const clamped = Math.max(0, Math.min(d, length));
	const segment = segments.find((item) => clamped <= item.start + item.length) || segments[segments.length - 1];
	const along = clamped - segment.start;
	const dx = Math.sign(segment.x1 - segment.x0);
	const dy = Math.sign(segment.y1 - segment.y0);
	return [segment.x0 * CELL + 500 + dx * along, segment.y0 * CELL + 500 + dy * along];
}

export function waveSpawns(night) {
	const spawns = [];
	(WAVES[night] || []).forEach(([kind, lane, count, start, every], group) => {
		for (let i = 0; i < count; i += 1) {
			spawns.push({ tick: Math.round((start + i * every) * 1000 / TICK_MS), kind, lane, group, index: i });
		}
	});
	return spawns.sort((a, b) => a.tick - b.tick || a.group - b.group || a.index - b.index);
}

export function canBuildAt(state, x, y) {
	if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
	if (PATH_CELLS.has(cellKey(x, y))) return false;
	return !state.towers.some((tower) => tower.x === x && tower.y === y);
}

// 每座塔触发了哪些组合：Map<塔 id, Set<组合 id>>
export function comboMap(towers) {
	const result = new Map(towers.map((tower) => [tower.id, new Set()]));
	towers.forEach((a) => towers.forEach((b) => {
		if (a.id >= b.id || Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) !== 1) return;
		COMBOS.forEach((combo) => {
			const [p, q] = combo.pair;
			if ((a.kind === p && b.kind === q) || (a.kind === q && b.kind === p)) {
				result.get(a.id).add(combo.id);
				result.get(b.id).add(combo.id);
			}
		});
	}));
	return result;
}

export function towerRange(tower, combos = comboMap([tower])) {
	const def = TOWERS[tower.kind];
	const set = combos.get(tower.id);
	let range = def.range[tower.level - 1];
	if (tower.kind === "daisy" && set?.has("breeze")) range += 600;
	if (tower.kind === "carrot" && set?.has("scent")) range += 800;
	return range;
}

function within(unit, tower) {
	const dx = unit.x - tower.x;
	const dy = unit.y - tower.y;
	return dx * dx + dy * dy <= tower.r2;
}

// 帧里每只小偷的状态位
export const FLAG_EATING = 1;
export const FLAG_DAZED = 2;
export const FLAG_SLOW = 4;
export const FLAG_DROWSY = 8;

/**
 * 演算一整夜。输入只有当晚序号、塔和菜筐里的菜，不用随机数，结果完全可复现。
 * record 为 true 时额外返回逐步的位置帧和特效，给前端播放用。
 * 水滴、草团和风都有飞行时间：出手时记下落点的步数，到那一步才生效，前端照着画弹道。
 */
export function simulateNight({ night, towers, basket }, { record = false } = {}) {
	const spawns = waveSpawns(night);
	const hpScale = 100 + (night - 1) * HP_GROWTH;
	const combos = comboMap(towers);
	const sim = towers.slice().sort((a, b) => a.id - b.id).map((tower) => {
		const def = TOWERS[tower.kind];
		const set = combos.get(tower.id);
		const range = towerRange(tower, combos);
		return {
			id: tower.id,
			kind: tower.kind,
			level: tower.level - 1,
			x: tower.x * CELL + 500,
			y: tower.y * CELL + 500,
			r2: range * range,
			cd: 0,
			rainbow: tower.kind === "sprinkler" && set.has("rainbow") ? 40 : -1,
			has: (id) => set.has(id),
			busy: 0,
			def,
		};
	});

	const units = [];
	const frames = [];
	const effects = [];
	const pending = [];   // 还在路上的水滴/草团/风：{ at, unit, apply }
	const slept = { pig: 0, mouse: 0, monkey: 0, fox: 0 };
	let spawnIndex = 0;
	let stolen = 0;
	let earned = 0;
	let left = basket;
	let failed = false;
	let tick = 0;

	const slowFor = (unit, pct, ticks) => {
		if (pct >= unit.timedSlow || unit.timedSlowTicks <= 0) unit.timedSlow = pct;
		unit.timedSlowTicks = Math.max(unit.timedSlowTicks, ticks);
	};
	const drowsyFor = (unit, perTick, ticks) => {
		unit.dot = Math.max(unit.dot, perTick);
		unit.dotTicks = Math.max(unit.dotTicks, ticks);
	};

	for (; tick < MAX_TICKS; tick += 1) {
		while (spawnIndex < spawns.length && spawns[spawnIndex].tick === tick) {
			const spawn = spawns[spawnIndex];
			const def = CRITTERS[spawn.kind];
			const hp = Math.floor(def.hp * hpScale / 100);
			units.push({
				id: units.length, kind: spawn.kind, lane: spawn.lane, def,
				d: 0, x: 0, y: 0, hp, maxHp: hp, incoming: 0,
				stun: 0, eat: 0, eatFrom: -1, eaten: [],
				slow: 0, timedSlow: 0, timedSlowTicks: 0, dot: 0, dotTicks: 0, drowsy: false,
				status: "walk",
			});
			spawnIndex += 1;
		}
		const active = units.filter((unit) => unit.status === "walk");
		active.forEach((unit) => { [unit.x, unit.y] = pathPoint(unit.lane, unit.d); });

		// 落地：这一步到达的水滴、草团和风。目标已经睡着或跑掉就落空。
		for (let i = pending.length - 1; i >= 0; i -= 1) {
			const hit = pending[i];
			if (hit.at !== tick) continue;
			pending.splice(i, 1);
			const unit = units[hit.unit];
			unit.incoming -= hit.damage;
			if (unit.status !== "walk") continue;
			hit.apply(unit);
			if (record && hit.style) effects.push({ tick, type: "hit", unit: unit.id, style: hit.style, x: unit.x, y: unit.y });
		}

		// 光环：向日葵减速、小雏菊持续犯困。蹦跳的小猴子碰不到。
		active.forEach((unit) => {
			let aura = 0;
			unit.drowsy = false;
			if (!unit.def.jump) {
				sim.forEach((tower) => {
					if (!within(unit, tower)) return;
					if (tower.kind === "sunflower") aura = Math.max(aura, tower.def.slow[tower.level]);
					if (tower.kind === "daisy") {
						unit.hp -= tower.def.drip[tower.level];
						unit.drowsy = true;
					}
				});
			}
			if (unit.dotTicks > 0) {
				unit.hp -= unit.dot;
				unit.dotTicks -= 1;
				unit.drowsy = true;
			}
			if (unit.timedSlowTicks > 0) unit.timedSlowTicks -= 1;
			unit.slow = Math.min(60, Math.max(aura, unit.timedSlowTicks > 0 ? unit.timedSlow : 0));
		});

		// 跑得最远的排前面，作为单体目标的优先顺序；已经有足够水滴在路上的不再瞄准。
		const ahead = active.slice().sort((a, b) => b.d - a.d || a.id - b.id);
		sim.forEach((tower) => {
			const def = tower.def;
			const L = tower.level;
			if (tower.kind === "sprinkler") {
				if (tower.cd > 0) tower.cd -= 1;
				else {
					const target = ahead.find((unit) => unit.hp - unit.incoming > 0 && within(unit, tower));
					if (target) {
						const damage = def.damage[L];
						const dew = tower.has("dew");
						const at = tick + flightTicks(target.x - tower.x, target.y - tower.y, DROP_SPEED, 2);
						target.incoming += damage;
						pending.push({
							at, unit: target.id, damage, style: dew ? "dew" : "drop",
							apply: (unit) => {
								unit.hp -= damage;
								if (dew) drowsyFor(unit, 8, 30);
							},
						});
						tower.cd = def.cooldown[L];
						if (record) effects.push({ tick, type: "shot", tower: tower.id, unit: target.id, arrive: at, style: dew ? "dew" : "drop" });
					}
				}
				if (tower.rainbow >= 0) {
					if (tower.rainbow > 0) tower.rainbow -= 1;
					else {
						const hit = active.filter((unit) => within(unit, tower));
						if (hit.length) {
							hit.forEach((unit) => { unit.stun = Math.max(unit.stun, unit.def.boss ? 5 : 10); });
							tower.rainbow = 40;
							if (record) effects.push({ tick, type: "rainbow", tower: tower.id });
						}
					}
				}
			} else if (tower.kind === "windmill") {
				if (tower.cd > 0) tower.cd -= 1;
				else {
					const hit = active.filter((unit) => within(unit, tower));
					if (hit.length) {
						const damage = def.damage[L];
						const warm = tower.has("warmwind");
						// 风从风车往外推，离得越远吹到得越晚
						hit.forEach((unit) => {
							unit.incoming += damage;
							pending.push({
								at: tick + flightTicks(unit.x - tower.x, unit.y - tower.y, WAVE_SPEED, 1),
								unit: unit.id, damage, style: null,
								apply: (target) => {
									target.hp -= damage;
									if (warm) slowFor(target, 25, 30);
								},
							});
						});
						tower.cd = def.cooldown[L];
						if (record) effects.push({ tick, type: "wave", tower: tower.id, style: warm ? "warm" : "wind" });
					}
				}
			} else if (tower.kind === "scarecrow") {
				if (tower.cd > 0) tower.cd -= 1;
				else {
					const target = ahead.find((unit) => !unit.def.jump && !unit.def.burrow && within(unit, tower));
					if (target) {
						const sun = tower.has("sunguard");
						const pollen = tower.has("lullaby");
						const damage = def.damage[L] * (pollen ? 4 : 1);
						const push = Math.floor(def.push[L] * (sun ? 3 : 2) / 2);
						const style = pollen ? "pollen" : sun ? "sun" : "straw";
						const at = tick + flightTicks(target.x - tower.x, target.y - tower.y, LOB_SPEED, 3);
						target.incoming += damage;
						pending.push({
							at, unit: target.id, damage, style,
							apply: (unit) => {
								unit.d = Math.max(0, unit.d - (unit.def.boss ? push / 2 : push));
								unit.hp -= damage;
								if (sun) slowFor(unit, 35, 20);
							},
						});
						tower.cd = def.cooldown[L];
						if (record) effects.push({ tick, type: "shot", tower: tower.id, unit: target.id, arrive: at, style });
					}
				}
			} else if (tower.kind === "carrot") {
				const sprout = tower.has("sprout");
				const scent = tower.has("scent");
				const capacity = sprout ? 4 : 2;
				ahead.forEach((unit) => {
					if (tower.busy >= capacity || (unit.def.jump && !scent) || unit.eat > 0 || unit.eaten.includes(tower.id) || !within(unit, tower)) return;
					unit.eat = sprout ? Math.floor(def.hold[L] * 3 / 2) : def.hold[L];
					unit.eatFrom = tower.id;
					unit.eaten.push(tower.id);
					tower.busy += 1;
					if (record) effects.push({ tick, type: "lure", tower: tower.id, unit: unit.id, style: scent ? "scent" : sprout ? "sprout" : "carrot" });
				});
			}
		});

		const releaseCarrot = (unit) => {
			const carrot = sim.find((tower) => tower.id === unit.eatFrom);
			if (carrot) carrot.busy -= 1;
			unit.eatFrom = -1;
			return carrot;
		};

		active.forEach((unit) => {
			if (unit.hp > 0) return;
			unit.status = "asleep";
			if (unit.eat > 0) releaseCarrot(unit);
			slept[unit.kind] += 1;
			earned += unit.def.reward;
			if (record) effects.push({ tick, type: "sleep", unit: unit.id, x: unit.x, y: unit.y });
		});

		for (const unit of active) {
			if (unit.status !== "walk") continue;
			if (unit.stun > 0) {
				unit.stun -= 1;
				continue;
			}
			if (unit.eat > 0) {
				unit.eat -= 1;
				if (unit.eat === 0) {
					const carrot = releaseCarrot(unit);
					if (carrot?.has("trap") && !unit.def.burrow) {
						unit.d = Math.max(0, unit.d - (unit.def.boss ? 500 : 1000));
						if (record) effects.push({ tick, type: "trap", tower: carrot.id, unit: unit.id });
					}
				}
				continue;
			}
			unit.d += Math.floor(unit.def.speed * (100 - unit.slow) / 100);
			if (unit.d >= pathLength(unit.lane)) {
				unit.status = "stole";
				stolen += Math.min(unit.def.steal, left);
				left = Math.max(0, left - unit.def.steal);
				if (record) effects.push({ tick, type: "steal", unit: unit.id, amount: unit.def.steal });
				if (left === 0) {
					failed = true;
					break;
				}
			}
		}

		if (record) {
			frames.push(units.filter((unit) => unit.status === "walk").map((unit) => {
				const [x, y] = pathPoint(unit.lane, unit.d);
				const flag = (unit.eat > 0 ? FLAG_EATING : 0) | (unit.stun > 0 ? FLAG_DAZED : 0) |
					(unit.slow > 0 ? FLAG_SLOW : 0) | (unit.drowsy ? FLAG_DROWSY : 0);
				return [unit.id, x, y, Math.max(0, Math.round(unit.hp * 100 / unit.maxHp)), flag];
			}));
		}
		if (failed) break;
		if (spawnIndex >= spawns.length && units.every((unit) => unit.status !== "walk")) break;
	}

	return {
		ticks: tick + 1,
		status: failed ? "fail" : "survive",
		basket: left,
		slept,
		stolen,
		earned,
		units: record ? units.map((unit) => ({ id: unit.id, kind: unit.kind, lane: unit.lane })) : undefined,
		frames: record ? frames : undefined,
		effects: record ? effects : undefined,
	};
}

export function createState() {
	return {
		night: 1,
		status: "day",
		basket: BASKET,
		stars: [START_STARS, START_STARS],
		ready: [false, false],
		towers: [],
		nextId: 1,
		perks: [{ sale: false, polish: false }, { sale: false, polish: false }],
		revive: 1,
		holds: [0, 0],
		run: null,
		cards: null,
		restartVote: [false, false],
	};
}

// 夜晚的结果在入夜时就算好了，播放结束（endsAt）之后才切到天亮/失败/通关。
export function settle(state, now) {
	if (state.status === "night" && state.run && now >= state.run.endsAt) state.status = state.run.after;
	return state;
}

function drawCards(random) {
	const keys = Object.keys(CARDS);
	const pick = () => {
		const pool = keys.slice();
		return Array.from({ length: 3 }, () => pool.splice(Math.floor(random() * pool.length), 1)[0]);
	};
	return { options: [pick(), pick()], picked: [null, null] };
}

function startNight(state, now, random) {
	const result = simulateNight({ night: state.night, towers: state.towers, basket: state.basket });
	const before = { basket: state.basket, stars: state.stars.slice() };
	let after = "fail";
	if (result.status === "survive") {
		after = state.night >= NIGHTS ? "win" : "dawn";
		state.stars = state.stars.map((stars) => stars + result.earned + NIGHT_BONUS);
		if (after === "dawn") state.cards = drawCards(random);
	}
	state.basket = result.basket;
	state.status = "night";
	state.ready = [false, false];
	state.holds = [0, 0];
	state.run = {
		night: state.night,
		startedAt: now,
		endsAt: now + result.ticks * TICK_MS + END_PAUSE_MS,
		before,
		after,
		result: { slept: result.slept, stolen: result.stolen, earned: result.earned, basket: result.basket },
	};
}

function applyCard(state, seat, key) {
	const other = 1 - seat;
	if (key === "pouch") state.stars[seat] += 15;
	if (key === "gift") state.stars[other] += 12;
	if (key === "veggies") state.basket += 2;
	if (key === "sale") state.perks[seat].sale = true;
	if (key === "polish") state.perks[seat].polish = true;
}

function finishDawn(state) {
	const [a, b] = state.cards.picked;
	const together = [a, b].map((index, seat) => state.cards.options[seat][index] === "together");
	if (together[0] && together[1]) state.stars = state.stars.map((stars) => stars + 20);
	else together.forEach((picked, seat) => { if (picked) state.stars[seat] += 5; });
	state.cards = null;
	state.night += 1;
	state.status = "day";
	state.run = null;
}

const ok = (state, event = null) => ({ state, event });
const fail = (error) => ({ error });

export function applyAction(current, action, { seat, playerCount, now = Date.now(), random = Math.random }) {
	const state = settle(structuredClone(current), now);
	const type = action?.type;

	if (type === "emote") {
		if (!EMOTES[action.name]) return fail("没有这个表情");
		return ok(state, { type: "emote", seat, name: action.name });
	}
	if (playerCount < meta.minPlayers) return fail("等另一位玩家加入后才能开始");
	const role = ROLES[seat];

	if (type === "build") {
		if (state.status !== "day") return fail("天黑了，等天亮再布置");
		const def = TOWERS[action.kind];
		if (!def) return fail("没有这种塔");
		if (def.seat !== seat) return fail(`${def.name}要让${ROLES[def.seat].name}来${def.seat === 0 ? "种" : "造"}`);
		if (!canBuildAt(state, action.x, action.y)) return fail("这里放不下");
		const cost = state.perks[seat].sale ? Math.ceil(def.cost / 2) : def.cost;
		if (state.stars[seat] < cost) return fail("星星不够");
		state.stars[seat] -= cost;
		state.perks[seat].sale = false;
		const tower = { id: state.nextId, kind: action.kind, x: action.x, y: action.y, level: 1, spent: cost };
		state.nextId += 1;
		state.towers.push(tower);
		state.ready[seat] = false;
		return ok(state, { type: "build", seat, tower: tower.id });
	}

	if (type === "upgrade" || type === "sell") {
		if (state.status !== "day") return fail("天黑了，等天亮再布置");
		const tower = state.towers.find((item) => item.id === action.id);
		if (!tower) return fail("这座塔已经不在了");
		const def = TOWERS[tower.kind];
		if (def.seat !== seat) return fail(`${def.name}归${ROLES[def.seat].name}管`);
		if (type === "sell") {
			state.stars[seat] += Math.floor(tower.spent / 2);
			state.towers = state.towers.filter((item) => item !== tower);
		} else {
			if (tower.level >= MAX_LEVEL) return fail("已经是最高级了");
			const cost = state.perks[seat].polish ? 0 : upgradeCost(tower.kind, tower.level);
			if (state.stars[seat] < cost) return fail("星星不够");
			state.stars[seat] -= cost;
			state.perks[seat].polish = false;
			tower.level += 1;
			tower.spent += cost;
		}
		state.ready[seat] = false;
		return ok(state, { type, seat, tower: tower.id });
	}

	if (type === "gift") {
		const amount = action.amount;
		if (!Number.isInteger(amount) || amount < 1) return fail("送的星星数量不对");
		if (state.stars[seat] < amount) return fail("星星不够");
		state.stars[seat] -= amount;
		state.stars[1 - seat] += amount;
		return ok(state, { type: "gift", seat, amount });
	}

	if (type === "ready") {
		if (state.status !== "day") return fail("现在不是白天");
		state.ready[seat] = action.ready !== false;
		if (state.ready.every(Boolean)) {
			startNight(state, now, random);
			return ok(state, { type: "night", night: state.night });
		}
		return ok(state, { type: "ready", seat, ready: state.ready[seat] });
	}

	if (type === "pick") {
		if (state.status !== "dawn" || !state.cards) return fail("现在不能选卡");
		if (state.cards.picked[seat] !== null) return fail("你已经选过了");
		const index = action.index;
		if (![0, 1, 2].includes(index)) return fail("没有这张卡");
		state.cards.picked[seat] = index;
		applyCard(state, seat, state.cards.options[seat][index]);
		if (state.cards.picked.every((item) => item !== null)) finishDawn(state);
		return ok(state, { type: "pick", seat });
	}

	if (type === "hold") {
		if (state.status !== "fail" || state.revive < 1) return fail("现在不能复活");
		state.holds[seat] = now;
		if (now - state.holds[1 - seat] <= HOLD_WINDOW) {
			state.revive -= 1;
			state.status = "day";
			state.basket = REVIVE_BASKET;
			state.stars = state.run.before.stars.slice();
			state.ready = [false, false];
			state.holds = [0, 0];
			state.run = null;
			return ok(state, { type: "revive" });
		}
		return ok(state, { type: "hold", seat });
	}

	// 中途重开要两人都同意；任何一方说"再想想"就取消
	if (type === "restartVote") {
		const votes = state.restartVote || [false, false];
		if (action.agree === false) {
			state.restartVote = [false, false];
			return ok(state, { type: "restartVote", seat, agree: false });
		}
		votes[seat] = true;
		state.restartVote = votes;
		if (votes.every(Boolean)) return ok(createState(), { type: "restart" });
		return ok(state, { type: "restartVote", seat, agree: true });
	}

	if (type === "restart") {
		if (state.status !== "fail" && state.status !== "win") return fail("这一局还没结束");
		return ok(createState(), { type: "restart" });
	}

	return fail(`${role.name}不会这个操作`);
}
