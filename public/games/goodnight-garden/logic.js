// 晚安小菜园：双人合作塔防。夜里小动物来偷菜，兔兔种花、猫猫造机关，一起把小偷哄睡送走。
// 白天两人同时布置，都准备好后入夜。夜晚是确定性演算：服务端算一次得出结果，
// 前端拿同样的输入再跑一遍来播放动画。全程整数运算，保证服务端和各浏览器算出来一模一样。

export const meta = {
	id: "goodnight-garden",
	name: "晚安小菜园",
	summary: "夜里小动物来偷菜。兔兔种花、猫猫造机关，三座菜园各守 7 夜，通关后还有无尽模式。",
	tags: ["双人合作", "塔防", "白天布置"],
	icon: "sunflower",
	minPlayers: 2,
	maxPlayers: 2,
};

export const COLS = 9;
export const ROWS = 13;
export const CELL = 1000;            // 1 格 = 1000 个长度单位
export const TICK_MS = 100;          // 演算步长，1 秒 10 步
export const MAX_TICKS = 3000;       // 一夜最长 5 分钟
export const BASKET = 20;
export const START_STARS = 30;
export const REVIVE_BASKET = 8;
export const HOLD_WINDOW = 1200;     // 两人按住的时间差在这之内算"一起按住"
export const END_PAUSE_MS = 1500;    // 最后一只小偷离场后留一点时间播完动画
export const MAX_LEVEL = 3;

// ---------- 菜园 ----------
// critters 里是 [种类, 从第几夜开始出现]；pressure 是第二夜起小偷数量和清醒值增长的百分比系数（路越长越好守，系数越高）。

export const GARDENS = [
	{
		id: "veggie",
		name: "小菜园",
		desc: "两条小路从上面进来，适合刚开始",
		nights: 7,
		paths: {
			L: [[0, 1], [3, 1], [3, 4], [1, 4], [1, 8], [4, 8], [4, 12]],
			R: [[8, 1], [5, 1], [5, 6], [7, 6], [7, 10], [4, 10], [4, 12]],
		},
		crate: [4, 12],
		critters: [["pig", 1], ["mouse", 1], ["monkey", 3], ["chick", 5]],
		boss: "fox",
		level: 0,
		pressure: { budget: 100, hp: 100 },
	},
	{
		id: "orchard",
		name: "河边果园",
		desc: "一条长长的蛇形路，小偷成群结队地来",
		nights: 7,
		paths: {
			S: [[4, 0], [4, 2], [1, 2], [1, 5], [7, 5], [7, 8], [1, 8], [1, 11], [4, 11], [4, 12]],
		},
		crate: [4, 12],
		critters: [["pig", 1], ["chick", 1], ["mouse", 2], ["frog", 3], ["monkey", 4], ["hippo", 5]],
		boss: "hippo",
		level: 1,
		pressure: { budget: 380, hp: 300 },
	},
	{
		id: "meadow",
		name: "山坡花田",
		desc: "两条之字形的坡道，什么小偷都有",
		nights: 7,
		paths: {
			L: [[0, 1], [3, 1], [3, 4], [1, 4], [1, 7], [3, 7], [3, 10], [4, 10], [4, 12]],
			R: [[8, 1], [5, 1], [5, 4], [7, 4], [7, 7], [5, 7], [5, 10], [4, 10], [4, 12]],
		},
		crate: [4, 12],
		critters: [["pig", 1], ["mouse", 1], ["chick", 2], ["monkey", 3], ["frog", 4], ["hippo", 5]],
		boss: "fox",
		level: 2,
		pressure: { budget: 180, hp: 200 },
	},
];

export const gardenById = (id) => GARDENS.find((garden) => garden.id === id) || GARDENS[0];
export const gardenOf = (state) => gardenById(state.garden);
export const isEndless = (state) => state.mode === "endless";
export const nightsOf = (state) => (isEndless(state) ? Infinity : gardenOf(state).nights);

// 第一座菜园开着；通关一座解锁下一座；通关任意一座解锁无尽模式。
export function unlockedGardens(cleared = []) {
	return GARDENS.filter((garden, index) => index === 0 || cleared.includes(GARDENS[index - 1].id)).map((garden) => garden.id);
}

export const endlessUnlocked = (cleared = []) => cleared.length > 0;

// ---------- 角色和塔 ----------

export const ROLES = [
	{ name: "兔兔", title: "园丁", avatar: "rabbit", towers: ["sunflower", "daisy", "carrot", "cactus"] },
	{ name: "猫猫", title: "工匠", avatar: "cat", towers: ["scarecrow", "sprinkler", "windmill", "honey"] },
];

// 仙人掌和蜂蜜罐从河边果园开始才有
const LATE_TOWERS = new Set(["cactus", "honey"]);

export function towersFor(state, seat) {
	const late = isEndless(state) || gardenOf(state).level >= 1;
	return ROLES[seat].towers.filter((kind) => late || !LATE_TOWERS.has(kind));
}

// 数值按等级 1～3 排列。range 是半径（长度单位），cooldown 是演算步数，damage 是降低的清醒值。
export const TOWERS = {
	sunflower: {
		name: "向日葵", icon: "sunflower", seat: 0, cost: 12,
		desc: "照亮一圈，范围内的小偷走得慢",
		range: [1600, 1900, 2200], slow: [30, 40, 50],
	},
	daisy: {
		name: "小雏菊", icon: "daisy", seat: 0, cost: 15,
		desc: "安眠花香，范围内的小偷一直犯困",
		range: [1400, 1600, 1800], drip: [12, 20, 30],
	},
	carrot: {
		name: "胡萝卜", icon: "carrot", seat: 0, cost: 10,
		desc: "诱饵，路过的小偷停下来啃一会儿，同时最多 2 只",
		range: [1300, 1500, 1700], hold: [12, 18, 24],
	},
	cactus: {
		name: "仙人掌", icon: "cactus", seat: 0, cost: 18,
		desc: "扎一下就犯困，范围小但很猛",
		range: [1100, 1250, 1400], drip: [30, 48, 70],
	},
	scarecrow: {
		name: "稻草人", icon: "scarecrow", seat: 1, cost: 12,
		desc: "把跑在最前面的小偷吓退一段",
		range: [1500, 1600, 1700], push: [800, 1100, 1400], cooldown: [40, 34, 28], damage: [50, 80, 120],
	},
	sprinkler: {
		name: "洒水壶", icon: "watering-can", seat: 1, cost: 15,
		desc: "一下一下地洒水，单只小偷很快犯困",
		range: [2200, 2400, 2600], damage: [80, 130, 190], cooldown: [6, 5, 4],
	},
	windmill: {
		name: "风车", icon: "windmill", seat: 1, cost: 20,
		desc: "隔一会儿吹一阵晚风，一圈小偷一起犯困",
		range: [1800, 2000, 2200], damage: [180, 290, 420], cooldown: [30, 26, 22],
	},
	honey: {
		name: "蜂蜜罐", icon: "honey", seat: 1, cost: 16,
		desc: "往路上扔一团蜂蜜，踩到的小偷黏住走不动",
		range: [2000, 2200, 2400], cooldown: [50, 42, 34], puddle: [700, 850, 1000], stick: [40, 55, 70], slow: [45, 52, 60],
	},
};

// 升级比再建一座划算一些，地方不够时升级是主要的变强方式
export function upgradeCost(kind, level) {
	const base = TOWERS[kind].cost;
	return level === 1 ? Math.round(base * 0.8) : Math.round(base * 1.2);
}

// 兔兔的植物和猫猫的装置紧挨着（含斜对角）时触发组合，4 × 4 每一对都有自己的效果。
export const COMBOS = [
	{ id: "rainbow", name: "小彩虹", pair: ["sunflower", "sprinkler"], desc: "洒水壶每 4 秒挂一道彩虹，范围内的小偷看呆 1 秒" },
	{ id: "sunguard", name: "向阳守卫", pair: ["sunflower", "scarecrow"], desc: "稻草人扔得更有劲，吓退距离 +50%，砸中的小偷 2 秒内慢吞吞" },
	{ id: "warmwind", name: "暖风", pair: ["sunflower", "windmill"], desc: "风车吹的是暖风，被吹到的小偷 3 秒内走得慢" },
	{ id: "melt", name: "晒化蜂蜜", pair: ["sunflower", "honey"], desc: "蜂蜜被晒得更稀，摊得更大（+50%），黏得更久" },
	{ id: "dew", name: "花露水", pair: ["daisy", "sprinkler"], desc: "洒水壶的水带着花香，淋到的小偷 3 秒内一直犯困" },
	{ id: "lullaby", name: "催眠稻草人", pair: ["daisy", "scarecrow"], desc: "稻草人扔的是花粉团，砸中一下困一大截" },
	{ id: "breeze", name: "晚风花香", pair: ["daisy", "windmill"], desc: "小雏菊的花香被风吹远，范围 +0.6 格" },
	{ id: "nectar", name: "蜜糖花", pair: ["daisy", "honey"], desc: "蜂蜜带着花香，站在蜂蜜里的小偷一直犯困" },
	{ id: "trap", name: "陷阱路口", pair: ["carrot", "scarecrow"], desc: "啃完胡萝卜的小偷会被吓退 1 格" },
	{ id: "sprout", name: "浇水萝卜", pair: ["carrot", "sprinkler"], desc: "胡萝卜被浇得又大又甜，同时能引 4 只，啃得更久" },
	{ id: "scent", name: "香味飘远", pair: ["carrot", "windmill"], desc: "风把萝卜香吹远，范围 +0.8 格，连跳着走的小偷也会被引过来" },
	{ id: "glaze", name: "蜜汁萝卜", pair: ["carrot", "honey"], desc: "胡萝卜抹了蜂蜜，多引 1 只，啃得更久" },
	{ id: "spikeball", name: "刺球", pair: ["cactus", "scarecrow"], desc: "稻草人扔的是带刺的草团，砸中困得更多，还会扎一会儿" },
	{ id: "watered", name: "浇水仙人掌", pair: ["cactus", "sprinkler"], desc: "仙人掌喝饱了水，范围 +0.5 格，扎得更狠" },
	{ id: "needles", name: "飞针", pair: ["cactus", "windmill"], desc: "风把仙人掌的刺吹出去，风车每阵风多困 50%" },
	{ id: "sticky", name: "黏刺", pair: ["cactus", "honey"], desc: "蜂蜜里混了小刺，站在里面会一直被扎" },
];

// 弹道：洒水壶的水滴、稻草人的草团和蜂蜜团都要飞一会儿才落地，风车的风一圈圈往外推。
export const DROP_SPEED = 350;   // 水滴每步飞多远
export const LOB_SPEED = 250;    // 草团/蜂蜜每步飞多远（抛得高，飞得慢）
export const WAVE_SPEED = 450;   // 风每步往外推多远
const flightTicks = (dx, dy, speed, base) => base + Math.floor((Math.abs(dx) + Math.abs(dy)) / speed);

// ---------- 小偷 ----------
// cost 是生成每晚小偷时的"分量"，spacing 是同一队里相邻两只的间隔（步），reward 以 0.1 颗星星为单位。
// jump：只有洒水壶、风车碰得到；burrow：稻草人吓不退；heavy：减速、吓退、看呆都减半。

export const CRITTERS = {
	pig: { name: "小猪", icon: "pig", hp: 1000, speed: 45, steal: 1, reward: 14, cost: 30, spacing: 22, desc: "慢吞吞，很难哄睡" },
	mouse: { name: "小老鼠", icon: "mouse", hp: 340, speed: 110, steal: 1, reward: 6, cost: 14, spacing: 9, burrow: true, desc: "跑得快，会钻地，稻草人吓不退" },
	monkey: { name: "小猴子", icon: "monkey", hp: 480, speed: 85, steal: 1, reward: 9, cost: 20, spacing: 14, jump: true, desc: "蹦蹦跳跳，只有洒水壶和风车碰得到" },
	chick: { name: "小黄鸡", icon: "chick", hp: 160, speed: 95, steal: 1, reward: 3, cost: 7, spacing: 5, desc: "一来一大群，单只很好哄睡" },
	frog: { name: "小青蛙", icon: "frog", hp: 560, speed: 100, steal: 1, reward: 10, cost: 22, spacing: 12, jump: true, desc: "跳得又快又远，只有洒水壶和风车碰得到" },
	hippo: { name: "大河马", icon: "hippo", hp: 4200, speed: 32, steal: 2, reward: 40, cost: 90, spacing: 40, heavy: true, desc: "又慢又壮，减速、吓退都只有一半效果，一次叼走 2 颗" },
	fox: { name: "狐狸大王", icon: "fox", hp: 6500, speed: 50, steal: 3, reward: 80, cost: 0, spacing: 0, heavy: true, boss: true, desc: "最后一夜的首领，一次叼走 3 颗菜" },
};

// ---------- 天气：每晚随机一种，白天就能看到 ----------

export const WEATHERS = {
	calm: { name: "晴朗的夜", icon: "moon", desc: "没什么特别的" },
	rain: { name: "小雨夜", icon: "rain", desc: "洒水壶每下更困 +30%，小偷走得慢 10%" },
	wind: { name: "大风夜", icon: "wind", desc: "风车范围 +0.4 格，吹得更勤" },
	fullmoon: { name: "满月夜", icon: "fullmoon", desc: "小偷兴奋，走得快 15%，但哄睡多给 50% 星星" },
	fog: { name: "起雾了", icon: "fog", desc: "看不清，所有塔的范围 -15%" },
	firefly: { name: "萤火虫夜", icon: "firefly", desc: "萤火虫帮忙：向日葵、小雏菊、仙人掌范围 +0.3 格" },
	harvest: { name: "丰收夜", icon: "harvest", desc: "守住的话天亮后菜筐 +2" },
};

function pickWeather(random) {
	if (random() < 0.3) return "calm";
	const keys = Object.keys(WEATHERS).filter((key) => key !== "calm");
	return keys[Math.floor(random() * keys.length)];
}

export const CARDS = {
	pouch: { name: "星星袋", desc: "自己 +15 星星" },
	gift: { name: "小礼物", desc: "给对方 +12 星星" },
	veggies: { name: "补点菜", desc: "菜筐 +2 颗菜" },
	sale: { name: "打折券", desc: "下一次建造半价" },
	polish: { name: "免费升级", desc: "下一次升级不花星星" },
	together: { name: "同心卡", desc: "两人都选它：各 +20 星星；只有一人选：+5" },
};

export const EMOTES = { heart: "比心", yay: "好耶", haha: "哈哈哈", cheer: "加油", sleepy: "困了" };

// ---------- 地图几何 ----------

const cellKey = (x, y) => `${x},${y}`;

function buildGeometry(garden) {
	const segmentsByLane = {};
	const cells = new Set();
	Object.entries(garden.paths).forEach(([lane, points]) => {
		const segments = [];
		let start = 0;
		for (let i = 1; i < points.length; i += 1) {
			const [x0, y0] = points[i - 1];
			const [x1, y1] = points[i];
			const length = (Math.abs(x1 - x0) + Math.abs(y1 - y0)) * CELL;
			segments.push({ x0, y0, x1, y1, start, length });
			start += length;
			for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) {
				for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 1) cells.add(cellKey(x, y));
			}
		}
		segmentsByLane[lane] = { segments, length: start };
	});
	return { segmentsByLane, cells };
}

const GEOMETRY = Object.fromEntries(GARDENS.map((garden) => [garden.id, buildGeometry(garden)]));

export const pathCells = (gardenId) => GEOMETRY[gardenById(gardenId).id].cells;

export function pathLength(gardenId, lane) {
	return GEOMETRY[gardenById(gardenId).id].segmentsByLane[lane].length;
}

// 沿路线走了 d 之后的位置（长度单位，格子中心为 x*1000+500）。
export function pathPoint(gardenId, lane, d) {
	const { segments, length } = GEOMETRY[gardenById(gardenId).id].segmentsByLane[lane];
	const clamped = Math.max(0, Math.min(d, length));
	const segment = segments.find((item) => clamped <= item.start + item.length) || segments[segments.length - 1];
	const along = clamped - segment.start;
	const dx = Math.sign(segment.x1 - segment.x0);
	const dy = Math.sign(segment.y1 - segment.y0);
	return [segment.x0 * CELL + 500 + dx * along, segment.y0 * CELL + 500 + dy * along];
}

export function canBuildAt(state, x, y) {
	if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
	if (pathCells(state.garden).has(cellKey(x, y))) return false;
	return !state.towers.some((tower) => tower.x === x && tower.y === y);
}

// ---------- 每晚的小偷 ----------
// 用确定的伪随机数生成（种子来自菜园、模式和第几夜），服务端和前端算出来完全一样。

function seeded(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// 这一夜的总分量和清醒值倍率（百分比）。前两夜很轻，之后越来越重；无尽模式一直涨下去。
export function nightDifficulty(gardenId, mode, night) {
	const garden = gardenById(gardenId);
	const n = night - 1;
	if (mode === "endless") {
		// 无尽模式在二次增长之外每夜再复利 3%，地图塞满满级塔之后也守不住，只看能撑多久。
		// 用整数一步步乘，不用 Math.pow，保证各个浏览器算出来一样。
		let grow = 100;
		for (let i = 0; i < n; i += 1) grow = Math.floor(grow * 103 / 100);
		return {
			budget: Math.round((70 + 32 * n + 6 * n * n) * grow / 100),
			hp: Math.round((100 + 8 * n + 1.2 * n * n) * grow / 100),
		};
	}
	return {
		// 第一夜各菜园一样轻，pressure 只放大之后每夜的增长
		budget: Math.round(90 + (55 * n + 16 * n * n) * garden.pressure.budget / 100),
		hp: Math.round(100 + (14 * n + 2 * n * n) * garden.pressure.hp / 100),
	};
}

export function waveSpawns(gardenId, mode, night) {
	const garden = gardenById(gardenId);
	const lanes = Object.keys(garden.paths);
	const random = seeded(GARDENS.indexOf(garden) * 7919 + night * 104729 + (mode === "endless" ? 15485863 : 0));
	const { budget } = nightDifficulty(gardenId, mode, night);
	const pool = mode === "endless"
		? ["pig", "mouse", "monkey", "chick", "frog", "hippo"].filter((kind) => kind !== "hippo" || night >= 4)
		: garden.critters.filter(([, from]) => night >= from).map(([kind]) => kind);
	const spawns = [];
	let remaining = budget;
	let tick = 0;
	let group = 0;
	let jumpers = 0;
	while (remaining >= 7) {
		// 跳着走的小偷只有洒水壶和风车打得到，一夜最多占四成，免得某一夜突然守不住
		const jumpRoom = Math.floor(budget * 2 / 5) - jumpers;
		const choices = pool.filter((kind) => CRITTERS[kind].cost <= remaining && (!CRITTERS[kind].jump || CRITTERS[kind].cost <= jumpRoom));
		if (!choices.length) break;
		const kind = choices[Math.floor(random() * choices.length)];
		const def = CRITTERS[kind];
		const share = Math.max(def.cost, Math.floor(budget * (0.14 + random() * 0.14)));
		const cap = def.jump ? Math.min(share, remaining, jumpRoom) : Math.min(share, remaining);
		const count = Math.max(1, Math.floor(cap / def.cost));
		const lane = lanes[group % lanes.length];
		for (let i = 0; i < count; i += 1) spawns.push({ tick: tick + i * def.spacing, kind, lane, group, index: i });
		remaining -= count * def.cost;
		if (def.jump) jumpers += count * def.cost;
		// 下一队在这一队走到一半时出发，前后队会叠在一起
		tick += Math.floor(count * def.spacing * 0.6) + 15 + Math.floor(random() * 15);
		group += 1;
	}
	// 一夜的小偷在 90 秒内出发完：队伍太长就整体压缩间隔，小偷越多来得越密
	const SPAWN_WINDOW = 900;
	const lastTick = spawns.reduce((max, spawn) => Math.max(max, spawn.tick), 0);
	if (lastTick > SPAWN_WINDOW) spawns.forEach((spawn) => { spawn.tick = Math.floor(spawn.tick * SPAWN_WINDOW / lastTick); });
	tick = Math.min(tick, SPAWN_WINDOW);
	// 故事模式最后一夜和无尽模式每 5 夜来一个首领
	const bossNight = mode === "endless" ? night % 5 === 0 : night === garden.nights;
	if (bossNight) {
		const boss = mode === "endless" ? (night % 15 === 0 ? "fox" : "hippo") : garden.boss;
		spawns.push({ tick: Math.floor(tick / 2), kind: boss, lane: lanes[0], group, index: 0 });
	}
	return spawns.sort((a, b) => a.tick - b.tick || a.group - b.group || a.index - b.index);
}

// ---------- 组合 ----------

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

export function towerRange(tower, combos = comboMap([tower]), weather = "calm") {
	const def = TOWERS[tower.kind];
	const set = combos.get(tower.id);
	let range = def.range[tower.level - 1];
	if (tower.kind === "daisy" && set?.has("breeze")) range += 600;
	if (tower.kind === "carrot" && set?.has("scent")) range += 800;
	if (tower.kind === "cactus" && set?.has("watered")) range += 500;
	if (weather === "wind" && tower.kind === "windmill") range += 400;
	if (weather === "firefly" && ["sunflower", "daisy", "cactus"].includes(tower.kind)) range += 300;
	if (weather === "fog") range = Math.floor(range * 85 / 100);
	return range;
}

function within(unit, item) {
	const dx = unit.x - item.x;
	const dy = unit.y - item.y;
	return dx * dx + dy * dy <= item.r2;
}

// 帧里每只小偷的状态位
export const FLAG_EATING = 1;
export const FLAG_DAZED = 2;
export const FLAG_SLOW = 4;
export const FLAG_DROWSY = 8;
export const FLAG_STUCK = 16;

/**
 * 演算一整夜。输入是菜园、模式、第几夜、天气、塔和菜筐里的菜，不用随机数，结果完全可复现。
 * record 为 true 时额外返回逐步的位置帧和特效，给前端播放用。
 * 水滴、草团、蜂蜜和风都有飞行时间：出手时记下落点的步数，到那一步才生效，前端照着画弹道。
 */
export function simulateNight({ garden: gardenId = "veggie", mode = "story", night, weather = "calm", towers, basket }, { record = false } = {}) {
	const garden = gardenById(gardenId);
	const spawns = waveSpawns(garden.id, mode, night);
	const { hp: hpScale } = nightDifficulty(garden.id, mode, night);
	const speedScale = weather === "fullmoon" ? 115 : weather === "rain" ? 90 : 100;
	const rewardScale = weather === "fullmoon" ? 3 : 2;   // 一半，满月 1.5 倍
	const combos = comboMap(towers);
	const sim = towers.slice().sort((a, b) => a.id - b.id).map((tower) => {
		const def = TOWERS[tower.kind];
		const set = combos.get(tower.id);
		const range = towerRange(tower, combos, weather);
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
	const pending = [];   // 还在路上的水滴/草团/蜂蜜/风：{ at, unit, damage, apply }
	const puddles = [];   // 地上的蜂蜜：{ x, y, r2, until, slow, sting, drowsy }
	const slept = Object.fromEntries(Object.keys(CRITTERS).map((kind) => [kind, 0]));
	let spawnIndex = 0;
	let stolen = 0;
	let earned10 = 0;
	let left = basket;
	let failed = false;
	let tick = 0;

	const half = (unit, value) => (unit.def.heavy ? Math.floor(value / 2) : value);
	const slowFor = (unit, pct, ticks) => {
		const value = half(unit, pct);
		if (value >= unit.timedSlow || unit.timedSlowTicks <= 0) unit.timedSlow = value;
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
				speed: Math.floor(def.speed * speedScale / 100),
				d: 0, x: 0, y: 0, hp, maxHp: hp, incoming: 0,
				stun: 0, eat: 0, eatFrom: -1, eaten: [],
				slow: 0, timedSlow: 0, timedSlowTicks: 0, dot: 0, dotTicks: 0, drowsy: false, stuck: false,
				status: "walk",
			});
			spawnIndex += 1;
		}
		const active = units.filter((unit) => unit.status === "walk");
		active.forEach((unit) => { [unit.x, unit.y] = pathPoint(garden.id, unit.lane, unit.d); });

		// 落地：这一步到达的水滴、草团、蜂蜜和风。目标已经睡着或跑掉就落空（蜂蜜照样摊在地上）。
		for (let i = pending.length - 1; i >= 0; i -= 1) {
			const hit = pending[i];
			if (hit.at !== tick) continue;
			pending.splice(i, 1);
			const unit = units[hit.unit];
			unit.incoming -= hit.damage;
			if (hit.land) {
				hit.land(unit);
				continue;
			}
			if (unit.status !== "walk") continue;
			hit.apply(unit);
			if (record && hit.style) effects.push({ tick, type: "hit", unit: unit.id, style: hit.style, x: unit.x, y: unit.y });
		}
		for (let i = puddles.length - 1; i >= 0; i -= 1) if (puddles[i].until <= tick) puddles.splice(i, 1);

		// 光环：向日葵减速，小雏菊和仙人掌持续犯困，蜂蜜黏脚。跳着走的小偷碰不到地上的东西。
		active.forEach((unit) => {
			let aura = 0;
			unit.drowsy = false;
			unit.stuck = false;
			if (!unit.def.jump) {
				sim.forEach((tower) => {
					if (!within(unit, tower)) return;
					if (tower.kind === "sunflower") aura = Math.max(aura, half(unit, tower.def.slow[tower.level]));
					if (tower.kind === "daisy") {
						unit.hp -= tower.def.drip[tower.level];
						unit.drowsy = true;
					}
					if (tower.kind === "cactus") unit.hp -= Math.floor(tower.def.drip[tower.level] * (tower.has("watered") ? 3 : 2) / 2);
				});
				puddles.forEach((puddle) => {
					if (!within(unit, puddle)) return;
					unit.stuck = true;
					aura = Math.max(aura, half(unit, puddle.slow));
					if (puddle.sting) unit.hp -= 10;
					if (puddle.drowsy) {
						unit.hp -= 8;
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
			unit.slow = Math.min(70, Math.max(aura, unit.timedSlowTicks > 0 ? unit.timedSlow : 0));
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
						const damage = Math.floor(def.damage[L] * (weather === "rain" ? 13 : 10) / 10);
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
							hit.forEach((unit) => { unit.stun = Math.max(unit.stun, half(unit, 10)); });
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
						const damage = Math.floor(def.damage[L] * (tower.has("needles") ? 3 : 2) / 2);
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
						tower.cd = weather === "wind" ? Math.floor(def.cooldown[L] * 4 / 5) : def.cooldown[L];
						if (record) effects.push({ tick, type: "wave", tower: tower.id, style: warm ? "warm" : tower.has("needles") ? "needles" : "wind" });
					}
				}
			} else if (tower.kind === "scarecrow") {
				if (tower.cd > 0) tower.cd -= 1;
				else {
					const target = ahead.find((unit) => !unit.def.jump && !unit.def.burrow && within(unit, tower));
					if (target) {
						const sun = tower.has("sunguard");
						const pollen = tower.has("lullaby");
						const spike = tower.has("spikeball");
						const damage = def.damage[L] * (pollen ? 4 : 1) * (spike ? 2 : 1);
						const push = Math.floor(def.push[L] * (sun ? 3 : 2) / 2);
						const style = pollen ? "pollen" : spike ? "spike" : sun ? "sun" : "straw";
						const at = tick + flightTicks(target.x - tower.x, target.y - tower.y, LOB_SPEED, 3);
						target.incoming += damage;
						pending.push({
							at, unit: target.id, damage, style,
							apply: (unit) => {
								unit.d = Math.max(0, unit.d - half(unit, push));
								unit.hp -= damage;
								if (sun) slowFor(unit, 35, 20);
								if (spike) drowsyFor(unit, 6, 20);
							},
						});
						tower.cd = def.cooldown[L];
						if (record) effects.push({ tick, type: "shot", tower: tower.id, unit: target.id, arrive: at, style });
					}
				}
			} else if (tower.kind === "honey") {
				if (tower.cd > 0) tower.cd -= 1;
				else {
					// 蜂蜜扔在跑得最远、脚下还没有蜂蜜的地面小偷那里
					const target = ahead.find((unit) => !unit.def.jump && within(unit, tower) && !puddles.some((puddle) => within(unit, puddle)));
					if (target) {
						const melt = tower.has("melt");
						const radius = Math.floor(def.puddle[L] * (melt ? 3 : 2) / 2);
						const stick = Math.floor(def.stick[L] * (melt ? 3 : 2) / 2);
						const at = tick + flightTicks(target.x - tower.x, target.y - tower.y, LOB_SPEED, 3);
						const sting = tower.has("sticky");
						const drowsy = tower.has("nectar");
						pending.push({
							at, unit: target.id, damage: 0, style: "honey",
							land: (unit) => {
								const [x, y] = unit.status === "walk" ? [unit.x, unit.y] : pathPoint(garden.id, unit.lane, unit.d);
								puddles.push({ x, y, r2: radius * radius, until: at + stick, slow: def.slow[L], sting, drowsy });
								if (record) effects.push({ tick: at, type: "puddle", x, y, r: radius, until: at + stick, style: drowsy ? "nectar" : sting ? "sticky" : "honey" });
							},
						});
						tower.cd = def.cooldown[L];
						if (record) effects.push({ tick, type: "shot", tower: tower.id, unit: target.id, arrive: at, style: "honey" });
					}
				}
			} else if (tower.kind === "carrot") {
				const sprout = tower.has("sprout");
				const scent = tower.has("scent");
				const glaze = tower.has("glaze");
				const capacity = (sprout ? 4 : 2) + (glaze ? 1 : 0);
				const hold = Math.floor(def.hold[L] * (sprout ? 3 : 2) * (glaze ? 3 : 2) / 4);
				ahead.forEach((unit) => {
					if (tower.busy >= capacity || (unit.def.jump && !scent) || unit.eat > 0 || unit.eaten.includes(tower.id) || !within(unit, tower)) return;
					unit.eat = unit.def.heavy ? Math.floor(hold / 2) : hold;
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
			earned10 += unit.def.reward * rewardScale;
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
						unit.d = Math.max(0, unit.d - half(unit, 1000));
						if (record) effects.push({ tick, type: "trap", tower: carrot.id, unit: unit.id });
					}
				}
				continue;
			}
			unit.d += Math.floor(unit.speed * (100 - unit.slow) / 100);
			if (unit.d >= pathLength(garden.id, unit.lane)) {
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
				const [x, y] = pathPoint(garden.id, unit.lane, unit.d);
				const flag = (unit.eat > 0 ? FLAG_EATING : 0) | (unit.stun > 0 ? FLAG_DAZED : 0) |
					(unit.slow > 0 ? FLAG_SLOW : 0) | (unit.drowsy ? FLAG_DROWSY : 0) | (unit.stuck ? FLAG_STUCK : 0);
				return [unit.id, x, y, Math.max(0, Math.round(unit.hp * 100 / unit.maxHp)), flag];
			}));
		}
		if (failed) break;
		if (spawnIndex >= spawns.length && units.every((unit) => unit.status !== "walk")) break;
	}

	// 到了时间上限还在路上的小偷算偷到了（正常不会发生，只是防止夜晚无限拖长）
	if (!failed) {
		units.forEach((unit) => {
			if (unit.status !== "walk" || failed) return;
			unit.status = "stole";
			stolen += Math.min(unit.def.steal, left);
			left = Math.max(0, left - unit.def.steal);
			if (left === 0) failed = true;
		});
	}

	return {
		ticks: tick + 1,
		status: failed ? "fail" : "survive",
		basket: left,
		slept,
		stolen,
		earned: Math.floor(earned10 / 20),
		units: record ? units.map((unit) => ({ id: unit.id, kind: unit.kind, lane: unit.lane })) : undefined,
		frames: record ? frames : undefined,
		effects: record ? effects : undefined,
	};
}

// ---------- 状态和操作 ----------

export function nightBonus(night) {
	return 5 + Math.min(Math.floor(night / 2), 5);
}

export function createState({ garden = "veggie", mode = "story", cleared = [], best = 0 } = {}) {
	return {
		garden,
		mode,
		cleared,
		best,
		night: 1,
		weather: "calm",
		status: "day",
		basket: BASKET,
		stars: mode === "endless" ? [50, 50] : [START_STARS, START_STARS],
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

// 旧房间里的状态没有这些字段，补上默认值
function normalize(state) {
	state.garden = state.garden || "veggie";
	state.mode = state.mode || "story";
	state.cleared = state.cleared || [];
	state.best = state.best || 0;
	state.weather = state.weather || "calm";
	state.restartVote = state.restartVote || [false, false];
	return state;
}

const freshFrom = (state, overrides = {}) => createState({
	garden: state.garden, mode: state.mode, cleared: state.cleared, best: state.best, ...overrides,
});

// 夜晚的结果在入夜时就算好了，播放结束（endsAt）之后才切到天亮/失败/通关。
export function settle(state, now) {
	normalize(state);
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
	const result = simulateNight({
		garden: state.garden, mode: state.mode, night: state.night, weather: state.weather, towers: state.towers, basket: state.basket,
	});
	const before = { basket: state.basket, stars: state.stars.slice() };
	let after = "fail";
	if (result.status === "survive") {
		after = state.night >= nightsOf(state) ? "win" : "dawn";
		state.stars = state.stars.map((stars) => stars + result.earned + nightBonus(state.night));
		if (state.weather === "harvest") result.basket += 2;
		if (after === "dawn") state.cards = drawCards(random);
		if (after === "win" && !state.cleared.includes(state.garden)) state.cleared = [...state.cleared, state.garden];
		if (isEndless(state)) state.best = Math.max(state.best, state.night);
	}
	state.basket = result.basket;
	state.status = "night";
	state.ready = [false, false];
	state.holds = [0, 0];
	state.restartVote = [false, false];
	state.run = {
		night: state.night,
		weather: state.weather,
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

function finishDawn(state, random) {
	const [a, b] = state.cards.picked;
	const together = [a, b].map((index, seat) => state.cards.options[seat][index] === "together");
	if (together[0] && together[1]) state.stars = state.stars.map((stars) => stars + 20);
	else together.forEach((picked, seat) => { if (picked) state.stars[seat] += 5; });
	state.cards = null;
	state.night += 1;
	state.weather = pickWeather(random);
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

	// 两人各自的设备上记着通关过哪些菜园，进房间时报上来，合在一起决定能选哪些
	if (type === "progress") {
		const cleared = Array.isArray(action.cleared) ? action.cleared.filter((id) => GARDENS.some((garden) => garden.id === id)) : [];
		const merged = [...new Set([...state.cleared, ...cleared])];
		const best = Math.max(state.best, Number.isInteger(action.best) ? Math.min(action.best, 999) : 0);
		if (merged.length === state.cleared.length && best === state.best) return ok(state);
		state.cleared = merged;
		state.best = best;
		return ok(state, { type: "progress" });
	}

	if (playerCount < meta.minPlayers) return fail("等另一位玩家加入后才能开始");
	const role = ROLES[seat];

	// 选菜园和模式：只能在一局刚开始（还没放塔）或者结束之后
	if (type === "setup") {
		const fresh = state.status === "day" && state.night === 1 && state.towers.length === 0;
		if (!fresh && state.status !== "win" && state.status !== "fail") return fail("这一局已经开始了，先重开才能换菜园");
		if (!unlockedGardens(state.cleared).includes(action.garden)) return fail("这座菜园还没解锁");
		const mode = action.mode === "endless" ? "endless" : "story";
		if (mode === "endless" && !endlessUnlocked(state.cleared)) return fail("通关一座菜园后才能玩无尽模式");
		return ok(freshFrom(state, { garden: action.garden, mode }), { type: "setup", seat });
	}

	if (type === "build") {
		if (state.status !== "day") return fail("天黑了，等天亮再布置");
		const def = TOWERS[action.kind];
		if (!def) return fail("没有这种塔");
		if (def.seat !== seat) return fail(`${def.name}要让${ROLES[def.seat].name}来${def.seat === 0 ? "种" : "造"}`);
		if (!towersFor(state, seat).includes(action.kind)) return fail(`${def.name}在这座菜园还用不了`);
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
		if (state.cards.picked.every((item) => item !== null)) finishDawn(state, random);
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

	// 中途重开要两人都同意；任何一方说"再想想"就取消。重开还是同一座菜园、同一个模式。
	if (type === "restartVote") {
		const votes = state.restartVote;
		if (action.agree === false) {
			state.restartVote = [false, false];
			return ok(state, { type: "restartVote", seat, agree: false });
		}
		votes[seat] = true;
		if (votes.every(Boolean)) return ok(freshFrom(state), { type: "restart" });
		return ok(state, { type: "restartVote", seat, agree: true });
	}

	if (type === "restart") {
		if (state.status !== "fail" && state.status !== "win") return fail("这一局还没结束");
		return ok(freshFrom(state), { type: "restart" });
	}

	return fail(`${role.name}不会这个操作`);
}
