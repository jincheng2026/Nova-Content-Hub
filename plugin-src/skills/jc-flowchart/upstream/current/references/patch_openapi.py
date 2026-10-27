#!/usr/bin/env python3
"""whiteboard-cli --to openapi 输出的补丁：飞书网页端才能正常绘制。
用法：python3 patch_openapi.py in.json out.json [--panel-ids id1,id2] [--outer-x N]
--outer-x：同侧回流线（如 right→right）绕行的竖线 x 坐标；不给时取两端最大 x 加 30。右侧还有别的栏时必须给，否则线会穿过那一栏。
做四件事：1) 文字 vertical_align mid→top（否则网页端整块卡死）；
2) 删掉白底白边的纯布局容器（否则会盖住别的图形）；
3) 直角折线改成拐点小方块加直线（网页端不画 right_angled_polyline，curve 会卡死）；
4) 按 面板→节点→连线→文字 写 z_index（否则面板可能盖住节点）。"""
import json,sys,copy
src,dst=sys.argv[1],sys.argv[2]
panel_ids=set()
if '--panel-ids' in sys.argv: panel_ids=set(sys.argv[sys.argv.index('--panel-ids')+1].split(','))
outer_x=float(sys.argv[sys.argv.index('--outer-x')+1]) if '--outer-x' in sys.argv else None
d=json.load(open(src,encoding='utf-8')); ns=d['nodes'] if isinstance(d,dict) else d
byid={n['id']:n for n in ns}
# 1 vertical_align
for n in ns:
    t=n.get('text')
    if isinstance(t,dict) and t.get('vertical_align')=='mid': t['vertical_align']='top'
# 2 白色纯布局容器
refs={n['connector'][k]['attached_object']['id'] for n in ns if n['type']=='connector' for k in ('start','end')}
def is_white_container(n):
    st=n.get('style',{}); t=n.get('text'); t=t.get('text') if isinstance(t,dict) else t
    return n['type']=='composite_shape' and not t and st.get('fill_color','').lower()=='#ffffff' and st.get('border_color','#ffffff').lower()=='#ffffff' and n['id'] not in refs and n.get('width',0)>=100
ns=[n for n in ns if not is_white_container(n)]
# 3 直角折线 → 拐点 + 直线
straight=next((n for n in ns if n['type']=='connector' and n['connector'].get('shape')=='straight'),None)
extra=[]; k=0
def anchor_point(obj,snap):
    x,y,w,h=obj['x'],obj['y'],obj['width'],obj['height']
    return {'top':(x+w/2,y),'bottom':(x+w/2,y+h),'left':(x,y+h/2),'right':(x+w,y+h/2)}[snap]
def elbow(cx,cy):
    global k; k+=1
    return {'id':f'o9:{k}','type':'composite_shape','x':cx-2,'y':cy-2,'width':4,'height':4,'composite_shape':{'type':'round_rect'},
            'style':{'border_opacity':100,'border_width':'extra_narrow','border_color':'#ffffff','border_color_type':1,'border_style':'solid','fill_opacity':100,'fill_color':'#ffffff','fill_color_type':1}}
def seg(tmpl,a,asnap,b,bsnap,arrow):
    global k; k+=1
    c=copy.deepcopy(tmpl); c['id']=f'c9:{k}'
    pos={'top':{'x':0.5,'y':0},'bottom':{'x':0.5,'y':1},'left':{'x':0,'y':0.5},'right':{'x':1,'y':0.5}}
    c['connector']['start']={'attached_object':{'id':a,'snap_to':asnap,'position':pos[asnap]},'arrow_style':'none'}
    c['connector']['end']={'attached_object':{'id':b,'snap_to':bsnap,'position':pos[bsnap]},'arrow_style':'line_arrow' if arrow else 'none'}
    c['connector']['start_object']=c['connector']['start']['attached_object']; c['connector']['end_object']=c['connector']['end']['attached_object']
    c['connector']['shape']='straight'; c['connector']['turning_points']=[]
    return c
keep=[]
for n in ns:
    if n['type']=='connector' and n['connector'].get('shape')=='right_angled_polyline':
        c=n['connector']; a=c['start']['attached_object']; b=c['end']['attached_object']
        A=byid[a['id']]; Bn=byid[b['id']]; ax,ay=anchor_point(A,a['snap_to']); bx,by=anchor_point(Bn,b['snap_to'])
        tmpl=copy.deepcopy(n); tmpl['connector'].pop('captions',None)
        if a['snap_to'] in ('top','bottom') and b['snap_to'] in ('left','right'):
            e=elbow(ax,by); extra.append(e)
            extra += [seg(tmpl,a['id'],a['snap_to'],e['id'],'bottom' if a['snap_to']=='top' else 'top',False),
                      seg(tmpl,e['id'],'left' if b['snap_to']=='right' else 'right',b['id'],b['snap_to'],True)]
        elif a['snap_to'] in ('left','right') and b['snap_to'] in ('top','bottom'):
            e=elbow(bx,ay); extra.append(e)
            extra += [seg(tmpl,a['id'],a['snap_to'],e['id'],'left' if a['snap_to']=='right' else 'right',False),
                      seg(tmpl,e['id'],'bottom' if b['snap_to']=='top' else 'top',b['id'],b['snap_to'],True)]
        else:
            # 同侧（如 right→right）：绕外侧一条竖线，外扩 30
            side=a['snap_to']; off=30 if side=='right' else -30
            xx=outer_x if outer_x is not None else (max(ax,bx)+off if side=='right' else min(ax,bx)+off)
            e1=elbow(xx,ay); e2=elbow(xx,by); extra += [e1,e2]
            extra += [seg(tmpl,a['id'],side,e1['id'],'left' if side=='right' else 'right',False),
                      seg(tmpl,e1['id'],'top' if by<ay else 'bottom',e2['id'],'bottom' if by<ay else 'top',False),
                      seg(tmpl,e2['id'],'left' if side=='right' else 'right',b['id'],b['snap_to'],True)]
        cap=(c.get('captions') or {}).get('data')
        if cap:
            lx=(xx+8) if (a['snap_to'] in('left','right') and b['snap_to'] in('left','right')) else ((ax+bx)/2 if a['snap_to'] in('left','right') else ax+6)
            extra.append({'id':f'a9:{k}','type':'text_shape','x':lx,'y':(ay+by)/2-10,'width':90,'height':22,
                          'text':dict(cap[0],horizontal_align='left',vertical_align='top'),'style':{}})
        continue
    keep.append(n)
ns=keep+extra
# 4 z_index
def rank(n):
    if n['id'] in panel_ids: return 0
    if n['type']=='composite_shape':
        t=n.get('text'); t=t.get('text') if isinstance(t,dict) else t
        return 0 if (not t and n.get('width',0)>=200 and n.get('height',0)>=200) else 1
    return 2 if n['type']=='connector' else 3
ns.sort(key=rank)
for i,n in enumerate(ns): n['z_index']=i
json.dump({'nodes':ns},open(dst,'w',encoding='utf-8'),ensure_ascii=False)
print(f'patched: {len(ns)} nodes -> {dst}')
