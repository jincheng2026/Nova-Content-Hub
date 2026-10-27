#!/usr/bin/env python3
"""Assemble an offline addon after prepare.py. Never copies the existing venv."""
import argparse, hashlib, json, pathlib, shutil, tarfile

def sha(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--source-model',type=pathlib.Path,required=True);p.add_argument('--model-source',type=pathlib.Path,required=True);p.add_argument('--known-audio',type=pathlib.Path,required=True);p.add_argument('--python-archive',type=pathlib.Path,required=True);p.add_argument('--license-directory',type=pathlib.Path,required=True);args=p.parse_args();root=args.output;root.mkdir(parents=True,exist_ok=True);here=pathlib.Path(__file__).resolve().parent
    expected='2e50ed6ec49d8714a83c093e9ce74e1b8b21a2c64a49c3b603471d9c4caac76b'
    assert sha(args.python_archive)==expected,'Python archive differs from upstream SHA256SUMS'
    if not (root/'python').exists():
        with tarfile.open(args.python_archive,'r:gz') as t:t.extractall(root,filter='data')
    shutil.copytree(args.license_directory,root/'licenses',dirs_exist_ok=True)
    metadata=json.loads(args.model_source.read_text());model=root/'models'/'Qwen3-ASR-1.7B-8bit';model.mkdir(parents=True,exist_ok=True);files=[]
    for entry in metadata['files']:
        src=args.source_model/entry['name'];assert src.stat().st_size==entry['bytes'],src
        h=sha(src)
        if entry.get('sha256'):assert h==entry['sha256'],src
        dst=model/entry['name']
        if not dst.exists() or sha(dst)!=h:shutil.copy2(src,dst)
        files.append({'path':entry['name'],'bytes':dst.stat().st_size,'sha256':h})
    (root/'model-manifest.json').write_text(json.dumps({'repoId':metadata['repoId'],'revision':metadata['revision'],'license':metadata['license'],'pinnedMetadataSource':metadata['pinnedMetadataSource'],'files':files},indent=2)+'\n')
    python_source={'version':'3.11.16','build':'20260825','arch':'aarch64-apple-darwin','archive':'cpython-3.11.16+20260825-aarch64-apple-darwin-install_only.tar.gz','sha256':expected,'url':'https://github.com/astral-sh/python-build-standalone/releases/download/20260825/cpython-3.11.16%2B20260825-aarch64-apple-darwin-install_only.tar.gz','fullArchiveUsedForLicenses':{'sha256':'cf89670270f1952c47f7f1c9dae90343361fa8e5d4f492117a086684049f26d7','url':'https://github.com/astral-sh/python-build-standalone/releases/download/20260825/cpython-3.11.16%2B20260825-aarch64-apple-darwin-pgo%2Blto-full.tar.zst'}}
    (root/'python-source.json').write_text(json.dumps(python_source,indent=2)+'\n')
    for name in ['install.command','README.txt']:shutil.copy2(here/name,root/name)
    test=root/'self-test';test.mkdir(exist_ok=True);shutil.copy2(here/'verify.py',test/'verify.py');shutil.copy2(args.known_audio,test/'known-chinese.wav')
    # Reject external symlinks before delivery. The Python archive contains only internal links.
    for file in root.rglob('*'):
        if file.is_symlink():assert file.resolve().is_relative_to(root.resolve()),file
    checks=[f'{sha(f)}  {f.relative_to(root).as_posix()}\n' for f in sorted(root.rglob('*')) if f.is_file() and f.name!='SHA256SUMS']
    (root/'SHA256SUMS').write_text(''.join(checks));print(f'{len(checks)} files hashed')
if __name__=='__main__':main()
