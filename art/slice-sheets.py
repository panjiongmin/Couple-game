# 把 SpriteCook 生成的 3x3 合集图切成单张精灵，清掉边缘的半透明光晕，裁边、缩小、存成 WebP。
# 用法：python art/slice-sheets.py   （在仓库根目录运行）
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "public" / "games" / "goodnight-garden" / "art"
ALPHA_CUT = 48      # 低于这个透明度的像素当作光晕清掉
MAX_SIZE = 192      # 输出图最长边（手机上一格约 40pt，3 倍屏约 120px，留一点余量）

# 每张合集图里 3x3 的格子从左到右、从上到下对应的名字
SHEETS = {
    "style-sample-lineup": ["rabbit", "cat", "pig", "mouse", "monkey", "chick", "frog", "hippo", "fox"],
    "towers-sheet": ["sunflower", "daisy", "carrot", "cactus", "scarecrow", "watering-can", "windmill", "honey", "crate"],
    "sleeping-sheet": ["pig-sleep", "mouse-sleep", "monkey-sleep", "chick-sleep", "frog-sleep", "hippo-sleep", "fox-sleep", "rabbit-sleep", "cat-sleep"],
    "icons-sheet": ["star", "moon", "rain", "wind", "fullmoon", "fog", "firefly", "harvest", "heart"],
    "decor-sheet": ["fence", "bush", "mushroom", "stone", "lantern", "stump", "sign", "grass", "lily"],
}


def components(mask):
    """在缩小的遮罩上找连通块（8 邻接），返回每块的格点坐标列表。"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    blocks = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            block = []
            while stack:
                cy, cx = stack.pop()
                block.append((cy, cx))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            blocks.append(block)
    return blocks


def slice_sheet(name, labels):
    image = Image.open(ROOT / "spritecook" / f"{name}.png").convert("RGBA")
    rgba = np.array(image)
    alpha = rgba[:, :, 3]
    alpha[alpha < ALPHA_CUT] = 0
    size = image.width
    cell = size / 3

    # 合集图里各个物件之间留了空隙，按 3x3 等分切。
    # 邻格角色伸过来的一小截会贴着格子边缘，把"碰到边缘、又比主体小很多"的碎块清掉再裁边。
    results = {}
    for index, label in enumerate(labels):
        x0, y0 = int(index % 3 * cell), int(index // 3 * cell)
        x1, y1 = int(x0 + cell), int(y0 + cell)
        cell_rgba = rgba[y0:y1, x0:x1].copy()
        cell_alpha = cell_rgba[:, :, 3]
        step = 4
        # 每个 4x4 小块里只要有一个像素不透明就算有内容，细线也不会漏掉
        hh, ww = cell_alpha.shape[0] // step * step, cell_alpha.shape[1] // step * step
        small = (cell_alpha[:hh, :ww].reshape(hh // step, step, ww // step, step) > 0).any(axis=(1, 3))
        blocks = components(small)
        if not blocks:
            raise SystemExit(f"{name} 第 {index + 1} 格没找到内容：{label}")
        main = max(blocks, key=len)
        biggest = len(main)
        my0, my1 = min(y for y, _ in main), max(y for y, _ in main)
        mx0, mx1 = min(x for _, x in main), max(x for _, x in main)
        h, w = small.shape
        keep = np.zeros_like(small)
        for block in blocks:
            touches = any(y in (0, h - 1) or x in (0, w - 1) for y, x in block)
            # 离主体超过 40px 的小碎块也清掉；"z"、水滴这类贴着主体的小部件保留
            gap = max(
                max(0, my0 - max(y for y, _ in block), min(y for y, _ in block) - my1),
                max(0, mx0 - max(x for _, x in block), min(x for _, x in block) - mx1),
            ) * step
            drop = block is not main and (
                (touches and len(block) < biggest * 0.15) or (len(block) < biggest * 0.03 and gap > 40)
            )
            if not drop:
                for y, x in block:
                    keep[y, x] = True
        # 只留下要保留的小块，其余全部清成透明
        full = np.zeros_like(cell_alpha, dtype=bool)
        full[:hh, :ww] = np.repeat(np.repeat(keep, step, axis=0), step, axis=1)
        cell_alpha[~full] = 0
        piece = Image.fromarray(cell_rgba)
        piece = piece.crop(piece.getchannel("A").getbbox())
        scale = MAX_SIZE / max(piece.size)
        if scale < 1:
            piece = piece.resize((round(piece.width * scale), round(piece.height * scale)), Image.LANCZOS)
        path = OUT / f"{label}.webp"
        piece.save(path, "WEBP", quality=88, method=6)
        results[label] = {"w": piece.width, "h": piece.height, "bytes": path.stat().st_size}
    return results


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    summary = {name: slice_sheet(name, labels) for name, labels in SHEETS.items()}
    total = sum(item["bytes"] for sheet in summary.values() for item in sheet.values())
    print(json.dumps({name: {k: f'{v["w"]}x{v["h"]}' for k, v in sheet.items()} for name, sheet in summary.items()}, ensure_ascii=False, indent=1))
    print(f"{sum(len(s) for s in summary.values())} 张，共 {total / 1024:.0f} KB")
