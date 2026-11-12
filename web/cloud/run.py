#!/usr/bin/env python3
# Terra 瀏覽器：AI 摘要雲端執行（在你自己的 GitHub Actions 上跑）
# App 把工作放進 jobs/<影片ID>.json，這支程式依序呼叫 Gemini，結果寫到 results/<影片ID>.json 並刪掉工作檔。
# 只用 Python 標準函式庫。Gemini 金鑰來自倉庫的 Secret：GEMINI_KEY。
import json, os, glob, re, subprocess, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ.get('GEMINI_KEY', '')
START = time.time()
LIMIT = 5 * 3600  # Actions 單次最多 6 小時，留一點時間收尾

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True)

def push(msg):
    sh('git', 'add', '-A', 'jobs', 'results')
    if sh('git', 'diff', '--cached', '--quiet').returncode == 0:
        return
    sh('git', 'commit', '-q', '-m', msg)
    for _ in range(5):
        if sh('git', 'push', '-q').returncode == 0:
            return
        sh('git', 'pull', '-q', '--rebase')
        time.sleep(3)

def json_of(t):
    t = (t or '').strip()
    t = re.sub(r'^```(?:json)?\s*|\s*```$', '', t)
    try:
        return json.loads(t)
    except Exception:
        m = re.search(r'[\[{].*[\]}]', t, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    return None

def gemini(model, vid, task, fast):
    parts = []
    if task.get('video'):
        fd = {'file_data': {'file_uri': 'https://www.youtube.com/watch?v=' + vid}}
        vm = {}
        if task.get('clip'):
            vm['start_offset'] = '%ss' % task['clip'][0]
            vm['end_offset'] = '%ss' % task['clip'][1]
        if task.get('fps'):
            vm['fps'] = task['fps']
        if vm:
            fd['video_metadata'] = vm
        parts.append(fd)
    parts.append({'text': task['prompt']})
    gc = {'responseMimeType': 'application/json', 'maxOutputTokens': 65536}
    if task.get('video'):
        gc['mediaResolution'] = 'MEDIA_RESOLUTION_LOW'
    think = fast and re.match(r'^gemini-([3-9]|\d\d)', model)
    for _ in range(3):
        if think:
            gc['thinkingConfig'] = {'thinkingLevel': 'low'}
        else:
            gc.pop('thinkingConfig', None)
        body = json.dumps({'contents': [{'role': 'user', 'parts': parts}], 'generationConfig': gc}).encode()
        req = urllib.request.Request(os.environ.get('GEMINI_BASE', 'https://generativelanguage.googleapis.com') + '/v1beta/models/%s:generateContent' % model, data=body,
                                     headers={'content-type': 'application/json', 'x-goog-api-key': KEY})
        try:
            with urllib.request.urlopen(req, timeout=1200) as r:
                j = json.loads(r.read().decode())
            c = (j.get('candidates') or [{}])[0]
            t = ''.join(p.get('text', '') for p in (c.get('content') or {}).get('parts', []) if not p.get('thought'))
            v = json_of(t)
            if v is None:
                return None, 'Gemini 沒有回傳可讀的內容（%s）' % c.get('finishReason', '')
            return v, None
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='ignore')[:400]
            if e.code == 400 and think and 'think' in msg.lower():
                think = False
                continue
            if e.code == 400 and task.get('video') and re.search(r'media_?resolution|fps|video_?metadata', msg, re.I):
                gc.pop('mediaResolution', None)
                parts[0]['file_data'].pop('video_metadata', None)
                continue
            return None, 'HTTP %d %s' % (e.code, msg)
        except Exception as e:
            return None, str(e)[:300]
    return None, '重試次數用完'

def ask(job, task):
    models = [job.get('model') or 'gemini-3.5-flash'] + [m for m in job.get('fallback', []) if m != job.get('model')]
    errs = []
    for m in models:
        for attempt in range(3):
            v, err = gemini(m, job['id'], task, job.get('fast', True))
            if v is not None:
                return {'ok': v, 'model': m}
            errs.append('%s：%s' % (m, err))
            if re.search(r'HTTP (429|500|502|503|504)', err or ''):
                time.sleep(20 * (attempt + 1))
                continue
            break
        if re.search(r'API key|HTTP 40[13]', ' '.join(errs[-1:])):
            break
    return {'err': errs[-1] if errs else '失敗', 'all': errs[-4:]}

def info_of(vid):
    try:
        u = 'https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=' + vid
        with urllib.request.urlopen(u, timeout=20) as r:
            j = json.loads(r.read().decode())
        return {'title': j.get('title', ''), 'author': j.get('author_name', '')}
    except Exception:
        return {}

def run_job(path):
    job = json.load(open(path, encoding='utf-8'))
    vid = job['id']
    out = {'id': vid, 'v': 1, 't': int(time.time() * 1000), 'info': info_of(vid) if not job.get('info', {}).get('title') else {}, 'out': {}}
    tasks = job.get('tasks', [])
    listen = [t for t in tasks if t['k'].startswith('seg')]
    rest = [t for t in tasks if not t['k'].startswith('seg')]
    if listen:
        with ThreadPoolExecutor(max_workers=4) as ex:
            for t, r in zip(listen, ex.map(lambda t: ask(job, t), listen)):
                r['clip'] = t.get('clip')
                out['out'][t['k']] = r
    for t in rest:
        out['out'][t['k']] = ask(job, t)
    os.makedirs('results', exist_ok=True)
    json.dump(out, open('results/%s.json' % vid, 'w', encoding='utf-8'), ensure_ascii=False)
    os.remove(path)
    push('result ' + vid)

def main():
    sh('git', 'config', 'user.name', 'github-actions[bot]')
    sh('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    if not KEY:
        print('沒有設定 GEMINI_KEY')
        return
    while time.time() - START < LIMIT:
        sh('git', 'pull', '-q', '--rebase')
        jobs = sorted(glob.glob('jobs/*.json'), key=os.path.getmtime)
        if not jobs:
            break
        for p in jobs:
            if time.time() - START > LIMIT:
                break
            try:
                run_job(p)
            except Exception as e:
                print('job failed', p, e)
                vid = os.path.basename(p)[:-5]
                os.makedirs('results', exist_ok=True)
                json.dump({'id': vid, 'v': 1, 't': int(time.time() * 1000), 'out': {}, 'err': str(e)[:300]}, open('results/%s.json' % vid, 'w'), ensure_ascii=False)
                if os.path.exists(p):
                    os.remove(p)
                push('error ' + vid)

if __name__ == '__main__':
    main()
