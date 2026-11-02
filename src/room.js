import { DurableObject } from "cloudflare:workers";
import { GAMES } from "./games.js";

// 房间闲置 7 天后清理；有人在线时顺延。
const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 一个房间一个 Durable Object（以房间码命名）。
 * 房间对所有游戏通用：负责座位、在线状态和广播；游戏规则交给各自的 logic 模块，
 * 服务端是唯一可信的状态来源，前端只发操作、只渲染广播回来的状态。
 */
export class GameRoom extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		// 心跳由运行时直接回复，不会唤醒休眠中的房间。
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
	}

	async init(code, gameId) {
		if (await this.ctx.storage.get("room")) return false;
		const game = GAMES[gameId];
		await this.ctx.storage.put("room", {
			code,
			game: gameId,
			createdAt: Date.now(),
			players: [],
			state: game.createState(),
		});
		await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
		return true;
	}

	async info() {
		const room = await this.ctx.storage.get("room");
		if (!room) return { exists: false };
		return {
			exists: true,
			code: room.code,
			game: room.game,
			players: room.players.length,
			maxPlayers: GAMES[room.game].meta.maxPlayers,
		};
	}

	async fetch(request) {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("需要 WebSocket 连接", { status: 426 });
		}
		const url = new URL(request.url);
		const playerId = (url.searchParams.get("player") || "").slice(0, 64);
		const name = (url.searchParams.get("name") || "").trim().slice(0, 16) || "玩家";

		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server);

		const room = await this.ctx.storage.get("room");
		const reject = (message) => {
			server.send(JSON.stringify({ type: "fatal", message }));
			server.close(4000, "rejected");
			return new Response(null, { status: 101, webSocket: client });
		};
		if (!room) return reject("房间不存在或已过期，请回首页重新创建");
		if (!playerId) return reject("缺少玩家标识，请刷新页面重试");

		let player = room.players.find((item) => item.id === playerId);
		if (!player && room.players.length >= GAMES[room.game].meta.maxPlayers) {
			// 关掉页面再从邀请链接回来会换一个玩家标识，这时接管不在线的那个座位。
			const online = new Set(this.openSockets(server).map((ws) => ws.deserializeAttachment()?.playerId));
			player = room.players.find((item) => !online.has(item.id));
			if (!player) return reject("房间已满，两位玩家都在线");
			player.id = playerId;
		}
		if (!player) {
			player = { id: playerId, name, seat: room.players.length };
			room.players.push(player);
		}
		player.name = name;
		await this.ctx.storage.put("room", room);
		server.serializeAttachment({ playerId });
		await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
		this.broadcast(room, null);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws, message) {
		let action;
		try {
			action = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
		} catch {
			return;
		}
		const room = await this.ctx.storage.get("room");
		const playerId = ws.deserializeAttachment()?.playerId;
		const player = room?.players.find((item) => item.id === playerId);
		if (!room || !player) return;

		const result = GAMES[room.game].applyAction(room.state, action, {
			seat: player.seat,
			playerCount: room.players.length,
		});
		if (result.error) {
			ws.send(JSON.stringify({ type: "error", message: result.error }));
			return;
		}
		room.state = result.state;
		await this.ctx.storage.put("room", room);
		this.broadcast(room, result.event);
	}

	async webSocketClose(ws) {
		// 兼容日期 >= 2026-04-07 时运行时会自动回复关闭帧；
		// 对方不带关闭码时这里收到的是保留码 1005，原样回传会抛错，所以只做不带参数的关闭。
		try {
			ws.close();
		} catch {
			// 连接已经关闭。
		}
		const room = await this.ctx.storage.get("room");
		if (room) this.broadcast(room, null, ws);
	}

	async webSocketError(ws) {
		const room = await this.ctx.storage.get("room");
		if (room) this.broadcast(room, null, ws);
	}

	async alarm() {
		if (this.openSockets().length) {
			await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
			return;
		}
		await this.ctx.storage.deleteAll();
	}

	// 只把仍处于 OPEN 的连接算作在线；webSocketClose 期间正在关闭的连接仍会出现在列表里。
	openSockets(except = null) {
		return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
	}

	broadcast(room, event, closing = null) {
		const sockets = this.openSockets(closing);
		const online = new Set(sockets.map((ws) => ws.deserializeAttachment()?.playerId).filter(Boolean));
		const players = room.players.map((item) => ({ name: item.name, seat: item.seat, online: online.has(item.id) }));
		sockets.forEach((ws) => {
			const playerId = ws.deserializeAttachment()?.playerId;
			const seat = room.players.find((item) => item.id === playerId)?.seat ?? null;
			try {
				ws.send(JSON.stringify({
					type: "state",
					room: { code: room.code, game: room.game, players },
					you: seat,
					state: room.state,
					event,
				}));
			} catch {
				// 连接正在关闭，下次重连会拿到最新状态。
			}
		});
	}
}
