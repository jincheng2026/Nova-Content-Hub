#!/usr/bin/env python3
"""Create release-only runtime from a verified payload; keep the original intact."""
import argparse,datetime,hashlib,json,pathlib,re,shutil
OMIT_DIRS={'test','tests','__tests__','fixture','fixtures','__fixtures__','logs','.local-probes','.git','__pycache__','self-test'}
FIXTURE=re.compile(r'(?:\.(?:test|spec)\.|(?:^|[._-])fixture(?:[._-]|$))',re.I)
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    if not a.source.is_absolute() or not a.output.is_absolute():raise SystemExit('Absolute paths required')
    if a.output.exists() or a.output.is_symlink():raise SystemExit('Existing directory preserved; choose new output')
    source=a.source.resolve();omitted=[]
    def ignore(directory,names):
        result=[]
        for name in names:
            file=pathlib.Path(directory)/name;rel=file.relative_to(source).as_posix()
            if name in OMIT_DIRS or FIXTURE.search(name) or (file.is_file() and file.suffix.lower() in {'.pyc','.pyo','.whl','.log','.db','.sqlite','.sqlite3'}) or rel in {'payload-manifest.json','preparation-test.json'}:
                result.append(name);omitted.append({'path':rel,'rule':'release-only omit: tests/fixtures/cache/wheel/build-proof'})
        return result
    shutil.copytree(source,a.output,symlinks=True,ignore=ignore)
    # Replace safe internal file aliases with regular copies so the generic gate
    # can inspect native interpreter aliases without its small symlink-file bound.
    aliases=[]
    for file in a.output.rglob('*'):
        if file.is_symlink():
            target=file.resolve();assert target.is_relative_to(a.output.resolve())
            if target.is_file():file.unlink();shutil.copy2(target,file);aliases.append(file.relative_to(a.output).as_posix())
    runtime=json.loads((a.output/'runtime.json').read_text());runtime.pop('selfTest',None);(a.output/'runtime.json').write_text(json.dumps(runtime,indent=2)+'\n')
    (a.output/'release-omit-manifest.json').write_text(json.dumps({'version':1,'sourcePayloadManifestSha256':sha(source/'payload-manifest.json'),'omitted':omitted,'internalFileAliasesMaterialized':aliases,'rules':sorted(OMIT_DIRS)+['*.pyc','*.pyo','*.whl','*.log','*.db','*.sqlite','*.sqlite3','fixture/spec/test filename patterns','preparation-test.json']},indent=2)+'\n')
    files=[{'path':f.relative_to(a.output).as_posix(),'bytes':f.stat().st_size,'sha256':sha(f)} for f in sorted(a.output.rglob('*')) if f.is_file()]
    (a.output/'payload-manifest.json').write_text(json.dumps({'version':1,'files':files,'bytes':sum(f['bytes'] for f in files)},indent=2)+'\n');print(json.dumps({'root':str(a.output),'manifestEntries':len(files),'omittedPaths':len(omitted),'materializedAliases':aliases,'payloadManifestSha256':sha(a.output/'payload-manifest.json')},indent=2))
if __name__=='__main__':main()
