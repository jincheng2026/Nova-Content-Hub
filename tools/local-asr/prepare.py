#!/usr/bin/env python3
"""Fetch a pinned wheelhouse from PyPI. Run with the already accepted Qwen runtime."""
import argparse, concurrent.futures, hashlib, json, pathlib, urllib.request, zipfile
from packaging.tags import sys_tags
from packaging.utils import parse_wheel_filename

def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()

def fetch(url, dest):
    with urllib.request.urlopen(url, timeout=60) as r, dest.open('wb') as f:
        while b := r.read(1024*1024): f.write(b)

def main():
    p=argparse.ArgumentParser();p.add_argument('--runtime-json',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
    root=args.output; wheels=root/'wheels'; licenses=root/'licenses'/'wheels'; wheels.mkdir(parents=True,exist_ok=True);licenses.mkdir(parents=True,exist_ok=True)
    tags=list(sys_tags()); rank={t:i for i,t in enumerate(tags)}
    def one(pkg):
        name,version=pkg['name'],pkg['version'];url=f'https://pypi.org/pypi/{name}/{version}/json'
        with urllib.request.urlopen(url,timeout=60) as r: data=json.load(r)
        candidates=[]
        for entry in data['urls']:
            if entry['packagetype']!='bdist_wheel' or entry.get('yanked'):continue
            compatible=set(parse_wheel_filename(entry['filename'])[3]) & rank.keys()
            if compatible:candidates.append((min(rank[t] for t in compatible),entry))
        if not candidates:raise RuntimeError(f'No native wheel for {name}=={version}')
        entry=min(candidates,key=lambda x:x[0])[1];dest=wheels/entry['filename']
        if not dest.exists() or digest(dest)!=entry['digests']['sha256']:fetch(entry['url'],dest)
        assert digest(dest)==entry['digests']['sha256'],dest
        target=licenses/f'{name}-{version}';target.mkdir(exist_ok=True)
        texts=[]
        with zipfile.ZipFile(dest) as z:
            for item in z.namelist():
                if '.dist-info/' in item and ('license' in item.lower() or 'copying' in item.lower() or 'notice' in item.lower() or item.endswith('/METADATA')) and not item.endswith('/'):
                    rel=item.split('.dist-info/',1)[1];out=target/rel;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(z.read(item));texts.append(rel)
        rec={'name':name,'version':version,'filename':entry['filename'],'bytes':dest.stat().st_size,'sha256':entry['digests']['sha256'],'url':entry['url'],'metadataUrl':url,'licenseExpression':data['info'].get('license_expression'),'license':data['info'].get('license'),'licenseFiles':texts}
        print(f"{name}=={version}: {dest.stat().st_size}",flush=True);return rec
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: records=list(pool.map(one,json.loads(args.runtime_json.read_text())['packages']))
    records.sort(key=lambda r:r['name'].lower());(root/'wheel-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    (root/'requirements.lock').write_text(''.join(f"{r['name']}=={r['version']} --hash=sha256:{r['sha256']}\n" for r in records))
if __name__=='__main__':main()
