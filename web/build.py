#!/usr/bin/env python3
"""組合單檔網頁：python3 web/build.py  →  web/dist/index.html，並複製 APK 需要的資產到 app/src/main/assets/"""
import os, json, shutil
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..')
ver = os.environ.get('VER') or open(os.path.join(root, 'VERSION')).read().strip()
R = lambda *p: open(os.path.join(here, *p), encoding='utf-8').read()

order = ['a_core', 'b_cfg', 'c_browser', 'd_capture', 'e_media', 'f_library', 'g_viewer', 'h_settings', 'i_update', 'j_audio', 'k_youtube', 'l_folders_music', 'm_lyrics', 'n_ytab', 'o_history', 'p_lock', 'q_ai', 'o_office', 'r_ytmusic', 's_guide', 't_relay', 'u_i18n', 'z_boot']
app = '\n'.join(R('parts', n + '.js') for n in order).replace('__VER__', ver)

# 多國語言：把程式裡所有中文介面文字列成清單（I18N_SRC），App 切換語言時整批翻譯
import re
_han = re.compile(r'[㐀-鿿]')
_src = set()
def _add(piece):
    for p in re.split(r'<[^>]+>|&[a-z]+;|\\n', piece):
        p = p.strip()
        if _han.search(p) and len(p) < 300 and 'JSON' not in p and '":' not in p: _src.add(p)
for n in order:
    if n == 'u_i18n': continue
    js = re.sub(r'/\*.*?\*/', '', R('parts', n + '.js'), flags=re.S)
    js = re.sub(r'(?m)^\s*//.*$', '', js)
    if n == 's_guide': js = re.sub(r'(?m)^\s{4}\'<(p|li|ol|ul|table|tr|div class="gTip).*$', '', js)   # 說明書內文整段另外翻
    for m in re.finditer(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"", js):
        t = m.group(1) if m.group(1) is not None else m.group(2)
        if _han.search(t): _add(t.replace("\\'", "'").replace('\\"', '"'))
for m in re.finditer(r'>([^<>]+)<|(?:title|placeholder|aria-label)="([^"]+)"', R('shell.html')):
    _add(m.group(1) or m.group(2))
# 內建的語言包（web/i18n/<語言>.json：介面文字；guide.<語言>.json：說明書各章節）
_pack, _gpack = {}, {}
for f in sorted(os.listdir(os.path.join(here, 'i18n'))) if os.path.isdir(os.path.join(here, 'i18n')) else []:
    if not f.endswith('.json'): continue
    d = json.loads(R('i18n', f))
    if f.startswith('guide.'): _gpack[f[6:-5]] = d
    else: _pack[f[:-5]] = d
app = ('window.I18N_SRC=' + json.dumps(sorted(_src), ensure_ascii=False) + ';\nwindow.I18N_PACK=' + json.dumps(_pack, ensure_ascii=False)
       + ';\nwindow.I18N_GPACK=' + json.dumps(_gpack, ensure_ascii=False) + ';\n' + app)

hosts = [l.strip().lower() for l in R('inject', 'adhosts.txt').splitlines() if l.strip() and not l.startswith('#') and '/' not in l]
css = ','.join(l.strip() for l in R('inject', 'adcss.txt').splitlines() if l.strip() and not l.startswith('#'))
ad_js = 'window.WS_AD=' + json.dumps({'hosts': hosts, 'css': css}, ensure_ascii=False) + ';'

def inline(src):            # 避免 </script> 提早結束標籤
    return src.replace('</script', '<\\/script')

vend = ''.join('<script>' + inline(R('vendor', n + '.js')) + '</script>\n' for n in ['jszip', 'pdf', 'lame.min', 'wme.min', 'mp3wasm', 'katex.min', 'qrcode', 'jsqr'])
worker = json.dumps(R('vendor', 'pdf.worker.js')).replace('</', '<\\/')
inject_src = {n: R('inject', n + '.js') for n in ['page', 'capture', 'reader', 'media', 'yt']}
inject_js = 'window.WS_INJECT=' + json.dumps(inject_src, ensure_ascii=False).replace('</', '<\\/') + ';'
inject = '<script>' + inject_js + '</script>\n' + ''.join('<script>' + inline(R('inject', n + '.js')) + '</script>\n' for n in ['capture', 'reader', 'media'])
shell = R('shell.html')
assert shell.startswith('<body>')
html = ('<!DOCTYPE html>\n<html lang="zh-Hant">\n<head>\n<script>' + R('ota_boot.js').replace('__VER__', ver) + '</script>\n'
  '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">\n'
  '<meta name="theme-color" content="#efe5d3">\n<title>Terra 瀏覽器</title>\n'
  '<link rel="icon" href="icon-192.png">\n<style>' + R('app.css') + '</style>\n<style>' + R('vendor', 'katex.css') + '</style>\n</head>\n' +
  shell.replace('</body>', '') + '\n' + vend +
  '<script>window.PDF_WORKER_URL = URL.createObjectURL(new Blob([' + worker + '], {type: "text/javascript"}));</script>\n' +
  '<script>' + ad_js + '</script>\n' + inject +
  '<script>\n' + inline(app) + '\n</script>\n</body>\n</html>\n')
out = os.path.join(here, 'dist'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(html)
for ic in ['icon-192.png', 'icon-512.png']:
    if os.path.exists(os.path.join(here, ic)): shutil.copy(os.path.join(here, ic), os.path.join(out, ic))

assets = os.path.join(root, 'app', 'src', 'main', 'assets')
os.makedirs(os.path.join(assets, 'inject'), exist_ok=True)
shutil.copy(os.path.join(out, 'index.html'), os.path.join(assets, 'index.html'))
for n in ['page', 'capture', 'reader', 'media', 'yt']:
    shutil.copy(os.path.join(here, 'inject', n + '.js'), os.path.join(assets, 'inject', n + '.js'))
for n in ['adhosts.txt', 'adcss.txt']:
    shutil.copy(os.path.join(here, 'inject', n), os.path.join(assets, n))
print('built', os.path.join(out, 'index.html'), len(html), 'bytes, version', ver)
