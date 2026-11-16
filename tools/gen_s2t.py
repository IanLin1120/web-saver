#!/usr/bin/env python3
"""產生 web/vendor/s2t.js：簡體→繁體（台灣用字）的對照表，給離線歌詞轉繁體用。
資料來源：OpenCC 的字典（需要 pip install opencc）。只在要更新對照表時手動執行，平常打包不需要。
- 單字對照：每個簡體字（和大陸用的異體字，例如 着→著、裏→裡）對應的台灣用字
- 詞彙對照：只收「照單字轉會錯」的詞（头发→頭髮、皇后→皇后、公里→公里、干净→乾淨…）"""
import json, os, opencc

d = os.path.dirname(opencc.__file__) + '/dictionary/'
cc = opencc.OpenCC('s2tw')
KEEP = {'台': '台', '臺': '臺'}          # 台灣習慣寫「台」，不轉成「臺」
keys = set()
for fn in ('STCharacters.txt', 'TWVariants.txt'):
    for l in open(d + fn, encoding='utf-8'):
        p = l.rstrip('\n').split('\t')
        if len(p) >= 2 and len(p[0]) == 1: keys.add(p[0])
chars = {}
for c in sorted(keys):
    t = KEEP.get(c) or cc.convert(c)
    if t != c and len(t) == 1 and ord(c) < 0x10000 and ord(t) < 0x10000: chars[c] = t      # 只收基本平面的字（JS 字串一個字一格）
cw = lambda s: ''.join(chars.get(c, c) for c in s)
fix = lambda t: t.replace('臺', '台')
ph = {}
for l in open(d + 'STPhrases.txt', encoding='utf-8'):
    p = l.rstrip('\n').split('\t')
    if len(p) < 2: continue
    s = p[0]
    if not (2 <= len(s) <= 4): continue
    t = fix(cc.convert(s))
    if len(t) != len(s) or t == cw(s): continue
    if any(ord(x) > 0xffff for x in s + t): continue
    if '瞭' in t and '了' in s: continue      # 了解／明了：台灣兩種都用，維持「了」
    ph[s] = t
# 較短的詞已經能轉對的，就不用再收較長的
out = {}
def conv(s):
    r, i = '', 0
    while i < len(s):
        for n in (4, 3, 2):
            k = s[i:i + n]
            if len(k) == n and k in out: r += out[k]; i += n; break
        else: r += chars.get(s[i], s[i]); i += 1
    return r
for n in (2, 3, 4):
    for s, t in ph.items():
        if len(s) == n and conv(s) != t: out[s] = t
by = {2: ['', ''], 3: ['', ''], 4: ['', '']}
for s, t in sorted(out.items()):
    by[len(s)][0] += s; by[len(s)][1] += t
js = ('/* 簡體→繁體（台灣用字）對照表：由 tools/gen_s2t.py 從 OpenCC 字典產生，請勿手動修改 */\n'
      'window.S2T_DATA=' + json.dumps({'c': ''.join(k + v for k, v in sorted(chars.items())), 'p': {str(n): by[n] for n in by}}, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(os.path.join(os.path.dirname(__file__), '..', 'web', 'vendor', 's2t.js'), 'w', encoding='utf-8').write(js)
print('chars', len(chars), 'phrases', len(out), 'bytes', len(js.encode()))
