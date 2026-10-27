#!/usr/bin/env python3
"""Recognize the known local WAV; never contact a remote inference service."""
import argparse, datetime, hashlib, importlib.metadata, json, os, pathlib, platform, re, socket, sys, time
p=argparse.ArgumentParser();p.add_argument('--model',type=pathlib.Path,required=True);p.add_argument('--audio',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
for key in ['HF_HUB_OFFLINE','TRANSFORMERS_OFFLINE','HF_HUB_DISABLE_TELEMETRY']:os.environ[key]='1'
network_attempts=[]
def deny_connect(*a,**kw):
    network_attempts.append(str(a[1] if len(a)>1 else a));raise RuntimeError('Network disabled for local Qwen self-test')
socket.socket.connect=deny_connect;socket.socket.connect_ex=deny_connect;socket.create_connection=deny_connect
start=time.monotonic();result={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'platform':platform.system(),'arch':platform.machine(),'macOS':platform.mac_ver()[0],'pythonVersion':platform.python_version(),'python':sys.executable,'basePrefix':sys.base_prefix,'model':str(args.model.resolve()),'audioSha256':hashlib.sha256(args.audio.read_bytes()).hexdigest(),'expectedText':'你好，语音测试。','packages':{n:importlib.metadata.version(n) for n in ['mlx','mlx-metal','mlx-audio','transformers']},'networkPolicy':'HF/transformers offline flags + Python socket connect denied; OS sandbox network denial is separate evidence'}
try:
    from mlx_audio.stt.utils import load_model
    model=load_model(str(args.model.resolve()));output=model.generate(str(args.audio.resolve()),max_tokens=64,language='Chinese')
    result['text']=output.text;normalize=lambda x:re.sub(r'[\W_]+','',x)
    result['normalizedTextMatch']=normalize(output.text)==normalize(result['expectedText'])
    result['outcome']='passed' if result['normalizedTextMatch'] and not network_attempts else 'failed'
except Exception as exc:
    result.update(outcome='failed',error=f'{type(exc).__name__}: {exc}')
finally:
    result['elapsedSeconds']=round(time.monotonic()-start,3);result['pythonNetworkConnectAttempts']=network_attempts
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
if result['outcome']!='passed':sys.exit(1)
