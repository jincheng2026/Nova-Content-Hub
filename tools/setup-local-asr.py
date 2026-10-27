#!/usr/bin/env python3
"""Build a relocatable native payload from the project's verified offline Qwen addon.
Only writes a new explicit directory. No global/site-user installation or downloads.
"""
import argparse, hashlib, json, os, pathlib, platform, shutil, subprocess, sys

def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    if platform.system()!='Darwin' or platform.machine()!='arm64' or platform.mac_ver()[0].split('.')[0]!='26':raise SystemExit('Only native darwin-arm64 / macOS 26 is verified for this payload.')
    if not a.source.is_absolute() or not a.output.is_absolute():raise SystemExit('Source and output must be absolute.')
    source=a.source.resolve();out=a.output
    if out.exists() or out.is_symlink():raise SystemExit('Refusing to replace an existing runtime directory.')
    print('Checking every offline source hash…',flush=True)
    for line in (source/'SHA256SUMS').read_text().splitlines():
        digest,name=line.split('  ',1);file=source/name
        if not file.resolve().is_relative_to(source) or sha(file)!=digest:raise RuntimeError(f'Source integrity failed: {name}')
    out.mkdir(parents=True)
    for name in ['python','models','licenses','self-test']:shutil.copytree(source/name,out/name,symlinks=True)
    for name in ['model-manifest.json','wheel-manifest.json','python-source.json','requirements.lock']:shutil.copy2(source/name,out/name)
    env={**os.environ,'PYTHONNOUSERSITE':'1','PYTHONDONTWRITEBYTECODE':'1','HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1'}
    for name in ['PYTHONHOME','PYTHONPATH','VIRTUAL_ENV']:env.pop(name,None)
    python=out/'python/bin/python3';site=out/'python/lib/python3.11/site-packages'
    print('Installing fixed wheels inside standalone Python (offline)…',flush=True)
    subprocess.run([str(python),'-B','-I','-m','pip','--isolated','install','--target',str(site),'--no-index','--find-links',str(source/'wheels'),'--require-hashes','--only-binary=:all:','--no-cache-dir','--disable-pip-version-check','--no-compile','-r',str(source/'requirements.lock')],check=True,env=env)
    subprocess.run([str(python),'-B','-I','-m','pip','--isolated','check'],check=True,env=env)
    model=json.loads((out/'model-manifest.json').read_text());model_dir='models/'+model['repoId'].split('/')[-1]
    runtime={'version':1,'platform':'darwin','arch':'arm64','macOSMajor':26,'engine':'qwen3-asr','module':'mlx_audio','executable':'python/bin/python3','modelPath':model_dir,'model':model,'python':json.loads((out/'python-source.json').read_text()),'timestampSource':'none','packagesSource':'wheel-manifest.json','selfTest':'self-test/verify.py'}
    (out/'runtime.json').write_text(json.dumps(runtime,indent=2)+'\n')
    # Source Python is relocatable; copied venvs and links escaping the payload are forbidden.
    for file in out.rglob('*'):
        if file.is_symlink() and not file.resolve().is_relative_to(out.resolve()):raise RuntimeError(f'External symlink: {file}')
    subprocess.run([str(python),'-B','-I',str(out/'self-test/verify.py'),'--model',str(out/model_dir),'--audio',str(out/'self-test/known-chinese.wav'),'--output',str(out/'preparation-test.json')],check=True,env=env)
    files=[{'path':str(f.relative_to(out)),'bytes':f.stat().st_size,'sha256':sha(f)} for f in sorted(out.rglob('*')) if f.is_file()]
    (out/'payload-manifest.json').write_text(json.dumps({'version':1,'files':files,'bytes':sum(f['bytes'] for f in files)},indent=2)+'\n')
    print(json.dumps({'root':str(out),'bytes':sum(f['bytes'] for f in files),'files':len(files),'runtimeManifestSha256':sha(out/'runtime.json')},indent=2))
if __name__=='__main__':main()
