#!/usr/bin/env python3
"""Offline build: add independently identified Whisper timings to a new Qwen payload."""
import argparse, hashlib, json, os, pathlib, platform, shutil, subprocess

def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def child(root,name):
    file=(root/name).resolve()
    if not file.is_relative_to(root.resolve()):raise RuntimeError('Source path escapes component')
    return file

def main():
    p=argparse.ArgumentParser();p.add_argument('--base-runtime',type=pathlib.Path,required=True);p.add_argument('--component',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    if platform.system()!='Darwin' or platform.machine()!='arm64' or platform.mac_ver()[0].split('.')[0]!='26':raise SystemExit('Only native macOS26/arm64 is verified.')
    if not all(f.is_absolute() for f in [a.base_runtime,a.component,a.output]):raise SystemExit('All paths must be absolute.')
    if a.output.exists() or a.output.is_symlink():raise SystemExit('Output must be a new directory; existing payloads are preserved.')
    for f in json.loads((a.base_runtime/'payload-manifest.json').read_text())['files']:
        file=child(a.base_runtime,f['path']);assert file.stat().st_size==f['bytes'] and sha(file)==f['sha256'],f['path']
    model=json.loads((a.component/'timing-model-manifest.json').read_text());wheels=json.loads((a.component/'wheel-manifest.json').read_text())
    for f in model['files']:
        file=child(a.component/'model',f['path']);assert file.stat().st_size==f['bytes'] and sha(file)==f['sha256']
    for f in wheels:
        file=child(a.component/'wheels',f['file']);assert file.stat().st_size==f['bytes'] and sha(file)==f['sha256']
    shutil.copytree(a.base_runtime,a.output,symlinks=True);site=a.output/'timing-site';model_rel='models/'+model['repoId'].split('/')[-1];shutil.copytree(a.component/'model',a.output/model_rel)
    shutil.copytree(a.component/'licenses',a.output/'licenses/timing');shutil.copy2(a.component/'wheel-manifest.json',a.output/'timing-wheel-manifest.json');shutil.copy2(a.component/'requirements.lock',a.output/'timing-requirements.lock')
    env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1'}
    for name in ['PYTHONHOME','PYTHONPATH','VIRTUAL_ENV']:env.pop(name,None)
    subprocess.run([str(a.output/'python/bin/python3'),'-B','-I','-m','pip','--isolated','install','--no-index','--find-links',str(a.component/'wheels'),'--require-hashes','--only-binary=:all:','--no-compile','--no-cache-dir','--target',str(site),'-r',str(a.component/'requirements.lock')],check=True,env=env)
    runtime=json.loads((a.output/'runtime.json').read_text());runtime['timing']={'engine':'faster-whisper','module':'faster_whisper','pythonSitePath':'timing-site','modelPath':model_rel,'model':model};runtime['timestampSource']='faster-whisper-word-timestamps';(a.output/'runtime.json').write_text(json.dumps(runtime,indent=2)+'\n')
    for file in a.output.rglob('*'):
        if file.is_symlink() and not file.resolve().is_relative_to(a.output.resolve()):raise RuntimeError('External runtime symlink')
    files=[{'path':str(f.relative_to(a.output)),'bytes':f.stat().st_size,'sha256':sha(f)} for f in sorted(a.output.rglob('*')) if f.is_file() and f.name!='payload-manifest.json']
    (a.output/'payload-manifest.json').write_text(json.dumps({'version':1,'files':files,'bytes':sum(f['bytes'] for f in files)},indent=2)+'\n');print('Prepared independent Qwen text + Whisper timing payload:',a.output)
if __name__=='__main__':main()
