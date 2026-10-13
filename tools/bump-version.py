#!/usr/bin/env python3
"""Stamp a new version into every page so browsers never mix old and new files.

- Sets ?v=<version> on all CSS/JS links.
- Writes assets/version.json.
- Keeps an inline check in each page's <head>: if the page's version differs from
  assets/version.json (fetched without cache), the page reloads itself with ?_v=<new>
  so the browser fetches the latest HTML too.

Run after every change, before committing:  python3 tools/bump-version.py
"""
import glob, json, os, re, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = time.strftime('%Y%m%d%H%M%S')

GUARD = ('<script>/* version check */(function(v,r){try{fetch(r+"assets/version.json?t="+Date.now(),{cache:"no-store"})'
         '.then(function(x){return x.json()}).then(function(j){if(j.v&&j.v!==v){var u=new URL(location.href);'
         'if(u.searchParams.get("_v")!==j.v){u.searchParams.set("_v",j.v);location.replace(u.href)}}}).catch(function(){})}catch(e){}})'
         '("{v}","{root}")</script>')

for path in glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True):
    rel = os.path.relpath(path, ROOT)
    if rel.startswith(('.git', 'tools', 'server')):
        continue
    root = '../' * rel.count(os.sep)
    html = open(path, encoding='utf-8').read()
    html = re.sub(r'(assets/[\w/.-]+\.(?:css|js))(\?v=\w+)?"', rf'\1?v={VERSION}"', html)
    html = re.sub(r'<script>/\* version check \*/.*?</script>\n?', '', html)
    html = html.replace('</head>', GUARD.replace('{v}', VERSION).replace('{root}', root) + '\n</head>', 1)
    open(path, 'w', encoding='utf-8').write(html)

with open(os.path.join(ROOT, 'assets', 'version.json'), 'w') as f:
    json.dump({'v': VERSION}, f)
print('version', VERSION)
