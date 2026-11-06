from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, sys
root = sys.argv[1]
font = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
def icon(size):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 圓角方形，棕色漸層
    grad = Image.new('RGBA', (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        t = y / S
        c = (int(176 - 40 * t), int(110 - 30 * t), int(66 - 22 * t), 255)
        gd.line([(0, y), (S, y)], fill=c)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    im.paste(grad, (0, 0), mask)
    # 內圈
    r = int(S * 0.36); cx = cy = S // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(110, 68, 38, 255))
    f = ImageFont.truetype(font, int(S * 0.40), index=0)
    t = '擷'
    bb = d.textbbox((0, 0), t, font=f)
    d.text((cx - (bb[0] + bb[2]) / 2, cy - (bb[1] + bb[3]) / 2 - S * 0.02), t, font=f, fill=(244, 236, 220, 255))
    # 右下角小下載箭頭徽章
    br = int(S * 0.13); bx, by = int(S * 0.74), int(S * 0.74)
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=(111, 125, 76, 255), outline=(244, 236, 220, 255), width=int(S * 0.018))
    w = int(S * 0.022)
    d.line([(bx, by - br * 0.5), (bx, by + br * 0.35)], fill=(255, 255, 255, 255), width=w)
    d.line([(bx - br * 0.4, by), (bx, by + br * 0.42), (bx + br * 0.4, by)], fill=(255, 255, 255, 255), width=w, joint='curve')
    return im.resize((size, size), Image.LANCZOS)
for name, sz in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    p = os.path.join(root, 'app/src/main/res/mipmap-' + name); os.makedirs(p, exist_ok=True)
    icon(sz).save(os.path.join(p, 'ic_launcher.png'))
icon(512).save(os.path.join(root, 'web/icon-512.png'))
icon(192).save(os.path.join(root, 'web/icon-192.png'))
print('ok')
