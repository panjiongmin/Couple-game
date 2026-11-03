// 背景音乐和音效：不用音频文件，全部用 Web Audio 现场合成，风格是八音盒和柔和的拨弦。
// 浏览器要求用户先点一下页面才能出声，所以第一次点击/按键时才真正启动。

const PREF_KEY = "couple-game:sound";
const midi = (note) => 440 * 2 ** ((note - 69) / 12);

// 和弦按 MIDI 音高写，旋律里 null 是休止。
const THEMES = {
	// 白天：轻快的拨弦，C - Am - F - G，每小节 8 个八分音符
	day: {
		bpm: 96,
		steps: 8,
		chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
		melody: [
			[76, null, 79, null, 76, 74, 72, null],
			[72, null, 74, 76, null, 72, 69, null],
			[69, 72, 74, null, 72, null, 69, 67],
			[67, null, 71, 74, 72, null, null, null],
		],
		pluck: true,
	},
	// 夜晚：慢慢的摇篮曲，3/4 拍，F - C - Dm - C，八音盒音色
	night: {
		bpm: 66,
		steps: 6,
		chords: [[53, 57, 60], [48, 52, 55], [50, 53, 57], [48, 52, 55]],
		melody: [
			[81, null, 79, null, 77, null],
			[76, null, null, 72, null, null],
			[74, null, 77, null, 76, 74],
			[72, null, null, null, null, null],
		],
		pluck: false,
	},
};

export function createSound() {
	let prefs = { music: true, sfx: true };
	try {
		prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") };
	} catch {
		// 读不到偏好就用默认值
	}
	const listeners = new Set();
	let ctx = null;
	let master;
	let musicBus;
	let sfxBus;
	let noiseBuffer;
	let theme = null;
	let wantedTheme = null;
	let bar = 0;
	let step = 0;
	let nextTime = 0;
	let timer = 0;
	const lastPlayed = new Map();

	function build() {
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtx) return false;
		ctx = new AudioCtx();
		master = ctx.createGain();
		master.gain.value = 0.9;
		master.connect(ctx.destination);
		// 音乐走一条带回声的总线，听起来更梦幻
		musicBus = ctx.createGain();
		musicBus.gain.value = prefs.music ? 0.32 : 0;
		const delay = ctx.createDelay();
		delay.delayTime.value = 0.32;
		const feedback = ctx.createGain();
		feedback.gain.value = 0.28;
		const wet = ctx.createGain();
		wet.gain.value = 0.35;
		musicBus.connect(master);
		musicBus.connect(delay);
		delay.connect(feedback);
		feedback.connect(delay);
		delay.connect(wet);
		wet.connect(master);
		sfxBus = ctx.createGain();
		sfxBus.gain.value = prefs.sfx ? 0.75 : 0;
		sfxBus.connect(master);
		noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = noiseBuffer.getChannelData(0);
		for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
		return true;
	}

	function unlock() {
		if (!ctx && !build()) return;
		if (ctx.state === "suspended") ctx.resume();
		if (wantedTheme && !theme) startTheme(wantedTheme);
	}

	// iPhone 的 Safari 对哪种触摸事件能启动声音比较挑，几种都挂上
	["pointerdown", "touchend", "click", "keydown"].forEach((type) => window.addEventListener(type, unlock, { passive: true }));
	document.addEventListener("visibilitychange", () => {
		if (!ctx) return;
		if (document.hidden) ctx.suspend();
		else ctx.resume();
	});

	// ---------- 基本音色 ----------

	function envelope(gain, time, peak, attack, decay) {
		gain.gain.setValueAtTime(0.0001, time);
		gain.gain.exponentialRampToValueAtTime(peak, time + attack);
		gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
	}

	function osc(bus, type, f0, f1, time, dur, vol, attack = 0.005) {
		const node = ctx.createOscillator();
		const gain = ctx.createGain();
		node.type = type;
		node.frequency.setValueAtTime(f0, time);
		if (f1 && f1 !== f0) node.frequency.exponentialRampToValueAtTime(f1, time + dur);
		envelope(gain, time, vol, attack, dur);
		node.connect(gain);
		gain.connect(bus);
		node.start(time);
		node.stop(time + attack + dur + 0.05);
	}

	function noise(bus, filterType, f0, f1, time, dur, vol, q = 1) {
		const source = ctx.createBufferSource();
		source.buffer = noiseBuffer;
		const filter = ctx.createBiquadFilter();
		filter.type = filterType;
		filter.Q.value = q;
		filter.frequency.setValueAtTime(f0, time);
		if (f1 && f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, time + dur);
		const gain = ctx.createGain();
		envelope(gain, time, vol, 0.01, dur);
		source.connect(filter);
		filter.connect(gain);
		gain.connect(bus);
		source.start(time, Math.random() * 0.5);
		source.stop(time + dur + 0.05);
	}

	// 八音盒：基音加两个泛音，衰减长
	function bell(bus, note, time, vol, decay = 1.2) {
		const f = midi(note);
		osc(bus, "sine", f, f, time, decay, vol);
		osc(bus, "sine", f * 2, f * 2, time, decay * 0.6, vol * 0.25);
		osc(bus, "sine", f * 3.01, f * 3.01, time, decay * 0.3, vol * 0.08);
	}

	function pluck(bus, note, time, vol, decay = 0.35) {
		osc(bus, "triangle", midi(note), midi(note), time, decay, vol);
	}

	function pad(bus, note, time, dur, vol) {
		[-4, 4].forEach((cents) => {
			const f = midi(note) * 2 ** (cents / 1200);
			osc(bus, "sine", f, f, time, dur, vol, Math.min(0.4, dur / 3));
		});
	}

	// ---------- 背景音乐：提前 0.4 秒排好要弹的音 ----------

	function startTheme(name) {
		theme = THEMES[name];
		bar = 0;
		step = 0;
		nextTime = ctx.currentTime + 0.15;
		clearInterval(timer);
		timer = setInterval(schedule, 100);
		schedule();
	}

	function schedule() {
		if (!theme || !ctx) return;
		const stepDur = 60 / theme.bpm / 2;
		while (nextTime < ctx.currentTime + 0.4) {
			const chord = theme.chords[bar % theme.chords.length];
			const melody = theme.melody[bar % theme.melody.length];
			if (step === 0) pad(musicBus, chord[0] - 12, nextTime, stepDur * theme.steps, 0.07);
			if (theme.pluck) {
				pluck(musicBus, chord[step % chord.length] + (step >= 4 ? 12 : 0), nextTime, 0.05);
			} else if (step % 2 === 0) {
				bell(musicBus, chord[(step / 2) % chord.length] + 12, nextTime, 0.035, 1.4);
			}
			const note = melody[step];
			if (note) theme.pluck ? pluck(musicBus, note, nextTime, 0.08, 0.5) : bell(musicBus, note, nextTime, 0.07, 1.8);
			step += 1;
			if (step >= theme.steps) {
				step = 0;
				bar += 1;
			}
			nextTime += stepDur;
		}
	}

	function setTheme(name) {
		if (wantedTheme === name) return;
		wantedTheme = name;
		if (!ctx || ctx.state !== "running") return;
		if (!name) {
			clearInterval(timer);
			theme = null;
			return;
		}
		// 换曲子时先把音乐压低再起新的，避免两段重叠
		const now = ctx.currentTime;
		musicBus.gain.cancelScheduledValues(now);
		musicBus.gain.setValueAtTime(musicBus.gain.value, now);
		musicBus.gain.linearRampToValueAtTime(0.0001, now + 0.4);
		setTimeout(() => {
			startTheme(name);
			const t = ctx.currentTime;
			musicBus.gain.cancelScheduledValues(t);
			musicBus.gain.setValueAtTime(0.0001, t);
			musicBus.gain.linearRampToValueAtTime(prefs.music ? 0.32 : 0, t + 0.8);
		}, 420);
	}

	// ---------- 音效 ----------

	const SFX = {
		drop: (t) => osc(sfxBus, "sine", 1400, 700, t, 0.08, 0.12),
		dew: (t) => { osc(sfxBus, "sine", 1500, 800, t, 0.08, 0.1); bell(sfxBus, 96, t + 0.03, 0.03, 0.4); },
		splash: (t) => { noise(sfxBus, "highpass", 3000, 2000, t, 0.1, 0.08); osc(sfxBus, "sine", 700, 300, t, 0.06, 0.06); },
		lob: (t) => osc(sfxBus, "triangle", 220, 440, t, 0.18, 0.1),
		thud: (t) => { osc(sfxBus, "sine", 190, 70, t, 0.16, 0.22); noise(sfxBus, "lowpass", 600, 300, t, 0.1, 0.1); },
		pollen: (t) => { osc(sfxBus, "sine", 160, 80, t, 0.14, 0.14); bell(sfxBus, 88, t + 0.02, 0.05, 0.8); bell(sfxBus, 91, t + 0.08, 0.04, 0.8); },
		sun: (t) => { osc(sfxBus, "sine", 190, 70, t, 0.14, 0.16); bell(sfxBus, 93, t, 0.05, 0.5); },
		wind: (t) => noise(sfxBus, "bandpass", 300, 1300, t, 0.5, 0.14, 1.4),
		warm: (t) => { noise(sfxBus, "bandpass", 250, 900, t, 0.55, 0.12, 1.2); pad(sfxBus, 67, t, 0.5, 0.03); },
		rainbow: (t) => [84, 88, 91, 96].forEach((note, i) => bell(sfxBus, note, t + i * 0.06, 0.05, 0.6)),
		lure: (t) => [0, 0.08].forEach((d) => noise(sfxBus, "bandpass", 1800, 1500, t + d, 0.04, 0.1, 3)),
		sprout: (t) => { osc(sfxBus, "sine", 500, 950, t, 0.09, 0.12); noise(sfxBus, "bandpass", 1800, 1500, t + 0.08, 0.04, 0.08, 3); },
		scent: (t) => { noise(sfxBus, "bandpass", 1800, 1500, t, 0.04, 0.08, 3); bell(sfxBus, 86, t + 0.05, 0.04, 0.7); },
		trap: (t) => osc(sfxBus, "triangle", 420, 180, t, 0.2, 0.12),
		splat: (t) => { noise(sfxBus, "lowpass", 900, 250, t, 0.18, 0.14); osc(sfxBus, "sine", 260, 120, t, 0.16, 0.12); },
		sleep: (t) => { bell(sfxBus, 88, t, 0.06, 0.9); bell(sfxBus, 84, t + 0.13, 0.05, 1.1); },
		steal: (t) => { osc(sfxBus, "square", 330, 220, t, 0.1, 0.04); osc(sfxBus, "square", 262, 175, t + 0.13, 0.16, 0.04); },
		build: (t) => { osc(sfxBus, "sine", 400, 900, t, 0.1, 0.14); bell(sfxBus, 91, t + 0.06, 0.04, 0.5); },
		upgrade: (t) => { bell(sfxBus, 84, t, 0.05, 0.5); bell(sfxBus, 91, t + 0.09, 0.05, 0.7); },
		sell: (t) => osc(sfxBus, "sine", 700, 280, t, 0.16, 0.1),
		ready: (t) => bell(sfxBus, 81, t, 0.06, 0.8),
		night: (t) => [48, 55, 60].forEach((note, i) => bell(sfxBus, note + 12, t + i * 0.03, 0.06, 2)),
		dawn: (t) => [72, 76, 79, 84].forEach((note, i) => pluck(sfxBus, note, t + i * 0.09, 0.09, 0.5)),
		fail: (t) => [67, 64, 60].forEach((note, i) => pluck(sfxBus, note, t + i * 0.22, 0.08, 0.6)),
		win: (t) => [72, 76, 79, 84, 88, 91, 96].forEach((note, i) => bell(sfxBus, note, t + i * 0.08, 0.06, 1)),
		pop: (t) => osc(sfxBus, "sine", 600, 1100, t, 0.06, 0.1),
		gift: (t) => { bell(sfxBus, 100, t, 0.04, 0.5); bell(sfxBus, 95, t + 0.08, 0.04, 0.6); },
	};

	// 同一种音效太密时跳过，避免一堆水滴同时响成噪音
	const GAP = { splat: 0.1, drop: 0.07, dew: 0.07, splash: 0.07, lob: 0.08, thud: 0.08, sleep: 0.09, lure: 0.08, steal: 0.12 };

	function play(name) {
		if (!ctx || ctx.state !== "running" || !prefs.sfx || !SFX[name]) return;
		const now = ctx.currentTime;
		if (now - (lastPlayed.get(name) ?? -1) < (GAP[name] ?? 0.03)) return;
		lastPlayed.set(name, now);
		SFX[name](now + 0.01);
	}

	function toggle(kind) {
		prefs = { ...prefs, [kind]: !prefs[kind] };
		try {
			localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
		} catch {
			// 存不下就只在本次页面生效
		}
		if (ctx) {
			const bus = kind === "music" ? musicBus : sfxBus;
			const target = prefs[kind] ? (kind === "music" ? 0.32 : 0.75) : 0;
			bus.gain.cancelScheduledValues(ctx.currentTime);
			bus.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
		}
		listeners.forEach((listener) => listener(prefs));
	}

	return {
		play,
		setTheme,
		toggle,
		get prefs() { return prefs; },
		onChange(listener) { listeners.add(listener); },
	};
}
