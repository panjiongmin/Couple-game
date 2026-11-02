// 所有游戏共用的房间客户端：玩家身份、建房、连接与断线重连、邀请链接。

const PLAYER_KEY = "couple-game:player";
const NAME_KEY = "couple-game:name";
let memoryPlayerId = "";

function randomId() {
	return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// 玩家标识按标签页保存：刷新不变，同一浏览器开两个标签页就是两位玩家，方便本地试玩。
export function getPlayerId() {
	try {
		let id = sessionStorage.getItem(PLAYER_KEY);
		if (!id) {
			id = randomId();
			sessionStorage.setItem(PLAYER_KEY, id);
		}
		return id;
	} catch {
		memoryPlayerId = memoryPlayerId || randomId();
		return memoryPlayerId;
	}
}

export function getName() {
	try {
		return localStorage.getItem(NAME_KEY) || "";
	} catch {
		return "";
	}
}

export function setName(name) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		// 存不下就只在本次使用。
	}
}

export async function createRoom(game) {
	const response = await fetch("/api/rooms", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ game }),
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(data.error || "创建房间失败，请稍后再试");
	return data.code;
}

export async function getRoomInfo(code) {
	const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
	return response.json().catch(() => ({ exists: false }));
}

export function inviteUrl(game, code) {
	return `${location.origin}/games/${game}/?room=${code}`;
}

export function normalizeCode(value) {
	return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const input = document.createElement("textarea");
		input.value = text;
		input.setAttribute("readonly", "");
		input.style.position = "fixed";
		input.style.opacity = "0";
		document.body.append(input);
		input.select();
		const copied = document.execCommand("copy");
		input.remove();
		return copied;
	}
}

/**
 * 连接房间。断线后自动重连；房间不存在或已满时触发 onFatal 并停止重连。
 * @returns {{ send(action: object): void, close(): void }}
 */
export function connectRoom(code, { name, onState, onError, onFatal, onStatus }) {
	let ws = null;
	let closedByUser = false;
	let fatal = false;
	let retry = 0;
	let heartbeat = 0;

	function open() {
		const protocol = location.protocol === "https:" ? "wss" : "ws";
		const params = new URLSearchParams({ player: getPlayerId(), name });
		ws = new WebSocket(`${protocol}://${location.host}/api/rooms/${code}/ws?${params}`);
		onStatus?.("connecting");

		ws.addEventListener("open", () => {
			retry = 0;
			onStatus?.("online");
			clearInterval(heartbeat);
			heartbeat = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) ws.send("ping");
			}, 25000);
		});

		ws.addEventListener("message", (event) => {
			if (event.data === "pong") return;
			let message;
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}
			if (message.type === "state") onState?.(message);
			else if (message.type === "error") onError?.(message.message);
			else if (message.type === "fatal") {
				fatal = true;
				onFatal?.(message.message);
			}
		});

		ws.addEventListener("close", () => {
			clearInterval(heartbeat);
			if (closedByUser || fatal) return;
			onStatus?.("offline");
			retry += 1;
			setTimeout(open, Math.min(8000, 500 * 2 ** retry));
		});
	}

	open();
	return {
		send(action) {
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(action));
				return true;
			}
			return false;
		},
		close() {
			closedByUser = true;
			clearInterval(heartbeat);
			ws?.close();
		},
	};
}
