import { GAMES } from "./games.js";

export { GameRoom } from "./room.js";

// 去掉了容易看错的 0/O、1/I/L。
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function randomCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
	return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function json(data, status = 200) {
	return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function createRoom(request, env) {
	const body = await request.json().catch(() => ({}));
	const gameId = body?.game;
	if (!GAMES[gameId]) return json({ error: "没有这个游戏" }, 400);
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const code = randomCode();
		if (await env.ROOMS.getByName(code).init(code, gameId)) {
			return json({ code, game: gameId }, 201);
		}
	}
	return json({ error: "房间码生成失败，请重试" }, 503);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/api/games" && request.method === "GET") {
			return json(Object.values(GAMES).map(({ meta }) => meta));
		}

		if (url.pathname === "/api/rooms" && request.method === "POST") {
			return createRoom(request, env);
		}

		const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{6})(\/ws)?$/);
		if (match) {
			const stub = env.ROOMS.getByName(match[1].toUpperCase());
			if (match[2]) return stub.fetch(request);
			if (request.method === "GET") {
				const info = await stub.info();
				return json(info, info.exists ? 200 : 404);
			}
		}

		if (url.pathname.startsWith("/api/")) return json({ error: "接口不存在" }, 404);
		return env.ASSETS.fetch(request);
	},
};
