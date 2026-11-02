// 图标都在 /shared/icons.svg 这个 sprite 里，用 <use> 引用，整站只请求一次。

const SPRITE = "/shared/icons.svg";
const SVG_NS = "http://www.w3.org/2000/svg";

// 图标名是小写字母和连字符；旧房间里存的 emoji 牌面不是图标名，原样显示文字。
export function isIconName(name) {
	return typeof name === "string" && /^[a-z][a-z-]*$/.test(name);
}

export function icon(name, className = "ico") {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("class", className);
	svg.setAttribute("aria-hidden", "true");
	const use = document.createElementNS(SVG_NS, "use");
	use.setAttribute("href", `${SPRITE}#${name}`);
	svg.append(use);
	return svg;
}
