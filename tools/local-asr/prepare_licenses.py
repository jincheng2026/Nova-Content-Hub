#!/usr/bin/env python3
"""Extract standalone notices and fetch the two wheel-missing Apache licenses."""
import argparse, hashlib, json, pathlib, tarfile, urllib.request
import zstandard

def main():
    p=argparse.ArgumentParser();p.add_argument('--full-python-archive',type=pathlib.Path,required=True);p.add_argument('--upstream-sums',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();root=a.output
    with a.full_python_archive.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()=='cf89670270f1952c47f7f1c9dae90343361fa8e5d4f492117a086684049f26d7'
    lic=root/'python-standalone';lic.mkdir(parents=True,exist_ok=True)
    with a.full_python_archive.open('rb') as f,zstandard.ZstdDecompressor().stream_reader(f) as reader,tarfile.open(fileobj=reader,mode='r|') as t:
        for m in t:
            if m.isfile() and (m.name=='python/PYTHON.json' or m.name.startswith('python/licenses/')):(lic/pathlib.Path(m.name).name).write_bytes(t.extractfile(m).read())
    (lic/'upstream-SHA256SUMS').write_bytes(a.upstream_sums.read_bytes())
    sources=[]
    for rel,url in [('wheels/tokenizers-0.23.3/LICENSE','https://raw.githubusercontent.com/huggingface/tokenizers/v0.23.3/LICENSE'),('wheels/sentencepiece-0.2.2/LICENSE','https://raw.githubusercontent.com/google/sentencepiece/v0.2.2/LICENSE'),('model/APACHE-2.0.txt','https://www.apache.org/licenses/LICENSE-2.0.txt')]:
        dest=root/rel;dest.parent.mkdir(parents=True,exist_ok=True)
        with urllib.request.urlopen(url,timeout=60) as r:body=r.read()
        dest.write_bytes(body);sources.append({'url':url,'path':rel,'sha256':hashlib.sha256(body).hexdigest()})
    (root/'supplementary-license-sources.json').write_text(json.dumps(sources,indent=2)+'\n')
    (root/'model'/'ATTRIBUTION.txt').write_text('Qwen3-ASR-1.7B: Qwen Team / Alibaba Cloud. Model license: Apache-2.0.\n8-bit MLX conversion: mlx-community/Qwen3-ASR-1.7B-8bit\nRevision: a8379a2e2f9e313c9292cdf1af4055ab56d50d55\nhttps://huggingface.co/mlx-community/Qwen3-ASR-1.7B-8bit\nhttps://huggingface.co/Qwen/Qwen3-ASR-1.7B\nConverted upstream README is retained in models/Qwen3-ASR-1.7B-8bit/README.md.\nModel files are unmodified; SHA256 is recorded in model-manifest.json.\n')
if __name__=='__main__':main()
