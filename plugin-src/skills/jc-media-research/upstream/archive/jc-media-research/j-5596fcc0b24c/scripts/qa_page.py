#!/usr/bin/env python3
"""报告页渲染自查：截图（亮/暗）→ 机械检查（截断/空白尾/横向溢出）→ 输出分区裁剪图供逐屏目检。

用法: python3 qa_page.py <report.html> [--height 6000] [--outdir /tmp/qa]
退出码非 0 = 有硬伤（截断/全空白），不许交付。
"""
import argparse, subprocess, sys, tempfile, time
from pathlib import Path
from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def shot(url, out, width, height, dark=False):
    Path(out).unlink(missing_ok=True)
    args = [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
            f"--user-data-dir={tempfile.mkdtemp(prefix='qa_chr_')}",
            f"--window-size={width},{height}", f"--screenshot={out}", url]
    # Chrome 截图完成后可能挂起退出：detach + 轮询文件
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        time.sleep(1)
        p = Path(out)
        if p.exists() and p.stat().st_size > 10000:
            time.sleep(2)
            proc.kill()
            return True
    proc.kill()
    return False


def analyze(png, label):
    im = Image.open(png).convert("RGB")
    w, h = im.size
    px = im.load()
    bg = px[5, h - 5]

    def row_blank(y):
        return all(abs(px[x, y][0]-bg[0]) + abs(px[x, y][1]-bg[1]) + abs(px[x, y][2]-bg[2]) < 18
                   for x in range(60, w - 60, 24))

    bottom = next((y for y in range(h - 1, 0, -1) if not row_blank(y)), 0)
    issues, notes = [], []
    if h - bottom < 24:
        issues.append(f"[{label}] 内容贴到画布底边（bottom={bottom}/{h}），疑似页面被截断——加大 --height 重测")
    blank_tail = h - bottom
    if blank_tail > 300:
        notes.append(f"[{label}] 尾部空白 {blank_tail}px，已裁剪")
    if bottom < h * 0.2:
        issues.append(f"[{label}] 页面基本空白（内容高度 {bottom}px），渲染失败")
    # 横向：右边缘不应有内容贴边
    col_edge = sum(1 for y in range(0, bottom, 30)
                   if abs(px[w-4, y][0]-bg[0]) + abs(px[w-4, y][1]-bg[1]) + abs(px[w-4, y][2]-bg[2]) > 30)
    if col_edge > 3:
        issues.append(f"[{label}] 右边缘 {col_edge} 处有内容贴边，疑似横向溢出")
    im2 = im.crop((0, 0, w, min(h, bottom + 40)))
    im2.save(png)
    return im2, issues, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--height", type=int, default=6000)
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--outdir", default="/tmp/qa_page")
    a = ap.parse_args()
    src = Path(a.html).resolve()
    out = Path(a.outdir); out.mkdir(parents=True, exist_ok=True)
    all_issues = []
    for label, url in (("light", src.as_uri()),):
        png = out / f"{src.stem}_{label}.png"
        if not shot(url, str(png), a.width, a.height):
            print(f"FAIL [{label}] 截图未生成"); sys.exit(2)
        im, issues, notes = analyze(png, label)
        all_issues += issues
        for n in notes: print("note:", n)
        # 分区裁剪供目检
        H = im.size[1]
        for i in range(0, H, 1400):
            im.crop((0, i, im.size[0], min(H, i + 1400))).save(out / f"{src.stem}_{label}_sec{i//1400}.png")
        print(f"[{label}] 内容高度 {H}px → 分区图 {out}/{src.stem}_{label}_sec*.png")
    # 暗色：临时加 data-theme
    dark_html = out / f"{src.stem}_dark.html"
    s = src.read_text()
    dark_html.write_text(s.replace('<html lang="zh">', '<html lang="zh" data-theme="dark">', 1))
    png = out / f"{src.stem}_dark.png"
    if shot(dark_html.as_uri(), str(png), a.width, a.height):
        im, issues, notes = analyze(png, "dark")
        all_issues += issues
        H = im.size[1]
        im.crop((0, 0, im.size[0], min(H, 1400))).save(out / f"{src.stem}_dark_sec0.png")
        print(f"[dark] 内容高度 {H}px")
    else:
        all_issues.append("[dark] 截图未生成")
    if all_issues:
        print("\nQA FAIL:")
        for i in all_issues: print(" -", i)
        sys.exit(1)
    print("\nQA PASS（机械检查）。剩余职责：逐张查看分区图，确认无文字重叠、图形完整。")


if __name__ == "__main__":
    main()
