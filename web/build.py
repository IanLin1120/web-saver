#!/usr/bin/env python3
"""組合單檔網頁：python3 web/build.py  →  web/dist/index.html，並複製 APK 需要的資產到 app/src/main/assets/"""
import os, json, shutil
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..')
ver = os.environ.get('VER') or open(os.path.join(root, 'VERSION')).read().strip()
R = lambda *p: open(os.path.join(here, *p), encoding='utf-8').read()

order = ['a_core', 'b_cfg', 'c_browser', 'd_capture', 'e_media', 'f_library', 'g_viewer', 'h_settings', 'i_update', 'j_audio', 'k_youtube', 'l_folders_music', 'm_lyrics', 'n_ytab', 'o_history', 'p_lock', 'q_ai', 'o_office', 'r_ytmusic', 's_guide', 't_relay', 'z_boot']
app = '\n'.join(R('parts', n + '.js') for n in order).replace('__VER__', ver)

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
  '<meta name="theme-color" content="#efe5d3">\n<title>網頁擷取</title>\n'
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
