import {useEffect, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import Checkbox from '@douyinfe/semi-ui-19/lib/es/checkbox';
import type {ServiceCredential,ServiceCredentialDisclosure, ServiceReadiness, ServiceSettingsPatch, ServiceSettingsValues, ServiceSettingsView} from '../shared/service-contracts.ts';
import {customAsrBaseUrl,defaultServiceSettings,normalizeAsrSettings,validCustomAsrBaseUrl,validAsrModelId} from '../shared/service-validation.ts';
import {PopupSelect} from './semi-controls.tsx';
import {useManagedDraftGuard} from './library-panels.tsx';
import './service-settings.css';
import {localOnlyServiceDraft} from './service-settings-draft.ts';
export interface ServiceSettingsProps {
    value: ServiceSettingsView | null;
    busy?: boolean;
    active?:boolean;
    onLoad(): Promise<ServiceSettingsView>;
    onSave(patch: ServiceSettingsPatch): Promise<ServiceSettingsView>;
    onReveal(service:ServiceCredential):Promise<ServiceCredentialDisclosure>;
    onCheck(): Promise<ServiceReadiness>;
    onDirtyChange?(dirty: boolean): void;
}
export function ServiceSettings({value, busy = false,active=true, onLoad, onSave, onReveal,onCheck, onDirtyChange}: ServiceSettingsProps) {
    const [saved, setSaved] = useState(value), [values, setValues] = useState<ServiceSettingsValues>(value?.values ?? defaultServiceSettings());
    const [keys, setKeys] = useState<NonNullable<ServiceSettingsPatch['keys']>>({}), [loading, setLoading] = useState(!value), [saving, setSaving] = useState(false), [notice, setNotice] = useState('');
    const [disclosed,setDisclosed]=useState<ServiceCredentialDisclosure|null>(null),[revealing,setRevealing]=useState<ServiceCredential|null>(null),revealSequence=useRef(0);
    function hideSavedKey(){revealSequence.current++;setDisclosed(null);setRevealing(null);}
    useEffect(()=>()=>{revealSequence.current++;},[]);
    useEffect(()=>{if(!active)hideSavedKey();},[active]);
    useEffect(()=>{hideSavedKey();},[value,values.asr.mode,values.asr.localEngine,values.asr.localExecutable,values.asr.localModelPath,values.asr.resourceId,values.asr.cloud?.provider,values.asr.cloud?.groqModel,values.asr.cloud?.customBaseUrl,values.asr.cloud?.customModelId]);
    async function toggleSavedKey(service:ServiceCredential){
        if(disclosed?.service===service){hideSavedKey();return;}
        const sequence=++revealSequence.current;setDisclosed(null);setRevealing(service);setNotice('');
        try{const result=await onReveal(service);if(sequence===revealSequence.current&&result.service===service)setDisclosed(result);}
        catch{if(sequence===revealSequence.current)setNotice('已保存的 Key 查看失败，请检查系统安全存储后重试。');}
        finally{if(sequence===revealSequence.current)setRevealing(null);}
    }
    const dirty = JSON.stringify(values) !== JSON.stringify(saved?.values ?? defaultServiceSettings()) || Object.keys(keys).length > 0;
    useManagedDraftGuard(dirty);
    useEffect(() => {onDirtyChange?.(dirty); return () => onDirtyChange?.(false);}, [dirty, onDirtyChange]);
    useEffect(() => {if (value) return; let live = true; void onLoad().then(next => {if (live) {setSaved(next); setValues(next.values);}}).catch(() => {if (live) setNotice('服务设置读取失败，请关闭后重新打开设置。');}).finally(() => {if (live) setLoading(false);}); return () => {live = false;};}, []);
    useEffect(() => {if (value && !dirty) {setSaved(value); setValues(value.values); setLoading(false);}}, [value]);
    const blocked = busy || saving || loading || !saved || !active;
    const currentAsr=normalizeAsrSettings(values.asr),cloud=currentAsr.cloud,cloudMode=currentAsr.mode==='cloud';
    const asr = (patch: Partial<ServiceSettingsValues['asr']>) => setValues(current=>({...current,asr:{...normalizeAsrSettings(current.asr),...patch}}));
    function changeAsrMode(mode:ServiceSettingsValues['asr']['mode']) {
        hideSavedKey();
        if(mode==='local-only'){
            const restored=localOnlyServiceDraft(values,saved?.values??defaultServiceSettings(),keys);
            setValues(restored.values);setKeys(restored.keys);setNotice('已切换为仅本地；未保存的云端配置与 Key 修改已放弃，已保存配置保留。');
        }else asr({mode});
    }
    const setCloud=(patch:Partial<typeof cloud>)=>asr({cloud:{...cloud,...patch}});
    const cloudPreset=cloud.provider==='groq'?cloud.groqModel:cloud.provider;
    const endpoint=(value:string)=>{try{return customAsrBaseUrl(value);}catch{return value;}};
    const priorCustom=saved?normalizeAsrSettings(saved.values.asr).cloud.customBaseUrl:'';
    const customRebind=!!saved?.credentials.custom?.hasKey&&endpoint(priorCustom)!==endpoint(cloud.customBaseUrl);
    const customNeedsKey=customRebind&&!Object.hasOwn(keys,'custom');
    const customInvalid=(cloud.provider==='custom'||cloud.customBaseUrl!=='')&&!validCustomAsrBaseUrl(cloud.customBaseUrl)||(cloud.provider==='custom'||cloud.customModelId!=='')&&!validAsrModelId(cloud.customModelId);
    const keyInput = (name: ServiceCredential, label: string) => <div className="service-settings-key">
        <label htmlFor={saved?.credentials[name]?.hasKey?`service-saved-key-${name}`:`service-key-${name}`}>{label}</label>
        <span className="service-settings-key-status">{keys[name] === null ? '保存后清除' : typeof keys[name] === 'string' ? '保存后替换' : name==='custom'&&customRebind ? '旧地址 Key · 等待重新填写' : saved?.credentials[name]?.hasKey ? '已配置 · 安全保存' : '未配置'}</span>
        {saved?.credentials[name]?.hasKey&&<div className="service-settings-key-saved"><Input id={`service-saved-key-${name}`} aria-label={`已保存的${label}`} type={disclosed?.service===name?'text':'password'} readonly autoComplete="off" value={disclosed?.service===name?disclosed.key:'••••••••'}/><Button id={`service-key-reveal-${name}`} aria-controls={`service-saved-key-${name}`} aria-label={`${disclosed?.service===name?'隐藏':'查看'}已保存的${label}`} aria-pressed={disclosed?.service===name} theme="borderless" loading={revealing===name} disabled={blocked||keys[name]===null||name==='custom'&&customRebind} onClick={()=>void toggleSavedKey(name)}>{disclosed?.service===name?'隐藏':'查看'}</Button></div>}
        {saved?.credentials[name]?.hasKey&&<label htmlFor={`service-key-${name}`}>{name==='custom'&&customRebind?'新地址 Key（重新填写，或明确清除旧 Key）':'新 Key（可选，留空保留已保存的 Key）'}</label>}
        <Input id={`service-key-${name}`} type="password" mode="password" autoComplete="new-password" value={keys[name] ?? ''} disabled={blocked || keys[name] === null} placeholder={saved?.credentials[name]?.hasKey ? '填写新 Key 替换' : '填写 Key'} onChange={text => {hideSavedKey();setKeys(current => {const next = {...current}; if (text) next[name] = text; else delete next[name]; return next;});}}/>
        {(saved?.credentials[name]?.hasKey || Object.hasOwn(keys, name)) && <div className="service-settings-key-actions"><Button id={`service-key-clear-${name}`} theme="borderless" type={keys[name] === null ? 'primary' : 'danger'} disabled={blocked} onClick={() => {hideSavedKey();setKeys(current => {const next = {...current}; if (current[name] === null || !saved?.credentials[name]?.hasKey) delete next[name]; else next[name] = null; return next;});}}>{keys[name] === null ? '撤销清除' : saved?.credentials[name]?.hasKey ? '清除 Key' : '清空输入'}</Button></div>}
    </div>;
    async function saveAndCheck() {
        if (blocked || customNeedsKey || customInvalid) return;
        hideSavedKey();
        setSaving(true); setNotice('');
        let current = saved!;
        try {
            if (dirty) {
                try {
                    current = await onSave({values, ...(Object.keys(keys).length ? {keys} : {})});
                    setSaved(current); setValues(current.values); setKeys({});
                } catch {
                    setNotice('保存未确认，填写内容已保留；请检查配置后重试。');
                    return;
                }
            }
            if (normalizeAsrSettings(current.values.asr).mode === 'cloud') {setNotice('服务设置已保存。云端识别将在任务授权后调用。'); return;}
            setNotice('服务设置已保存，正在检查本地语音组件。首次初始化可能较慢，最多等待 120 秒；检查完成前不表示已就绪。');
            try {const result = await onCheck(); setNotice(`服务设置已保存。${result.localAsr.reason}`);}
            catch {setNotice('服务设置已保存；本地模型检查未完成，可再次点击“保存并检查”重试。');}
        } finally {setSaving(false);}
    }
    const localConfigured = !!values.asr.localExecutable && !!values.asr.localModelPath;
    const cloudFields = <>
      <label htmlFor="service-asr-provider">云端服务</label><PopupSelect id="service-asr-provider" value={cloudPreset} disabled={blocked} onChange={preset=>{
        hideSavedKey();setCloud(preset==='volc'||preset==='custom'?{provider:preset}:{provider:'groq',groqModel:preset as typeof cloud.groqModel});
      }}><option value="whisper-large-v3-turbo">Groq · Whisper Large V3 Turbo</option><option value="whisper-large-v3">Groq · Whisper Large V3</option><option value="volc">火山语音 · 极速版</option><option value="custom">自定义兼容 ASR</option></PopupSelect>
      {cloud.provider==='groq'&&<>{keyInput('groq','Groq 语音 Key')}<p>提供免费计划，额度以账户为准；已升级账户或超出免费额度时可能计费。单文件最大 25 MB，本次任务仍需授权并受请求次数上限约束。</p></>}
      {cloud.provider==='volc'&&<>{keyInput('asr','火山语音专用 Key')}<label htmlFor="service-asr-resource">极速版语音资源 ID</label><Input id="service-asr-resource" value={values.asr.resourceId} disabled={blocked} onChange={resourceId=>asr({resourceId})}/><p>当前接入极速版 volc.bigasr.auc_turbo，需单独开通。标准版 2.0 暂未接入；控制台的“20 小时”试用包不能证明极速版可用，适用资源与额度以账户为准。</p></>}
      {cloud.provider==='custom'&&<>
        <label htmlFor="service-asr-custom-url">API 基础地址（HTTPS）</label><Input id="service-asr-custom-url" value={cloud.customBaseUrl} disabled={blocked} placeholder="https://asr.example.com/v1" onChange={customBaseUrl=>setCloud({customBaseUrl})}/>
        <label htmlFor="service-asr-custom-model">语音模型 ID</label><Input id="service-asr-custom-model" value={cloud.customModelId} disabled={blocked} placeholder="服务商提供的语音模型 ID" onChange={customModelId=>setCloud({customModelId})}/>
        {keyInput('custom','自定义 ASR Key')}
        {customRebind&&<p role="alert">接口地址已修改。请重新填写此地址的 Key，或明确清除旧 Key 后保存；已保存的旧 Key 不会发送到新地址。</p>}
        {customInvalid&&<p role="status">请填写有效的 HTTPS 基础地址与语音模型 ID。</p>}
        <p>用于兼容的语音转文字接口，单文件最大 25 MB；实际格式、额度与收费以服务商为准。修改接口地址后需要重新填写 Key。</p>
      </>}
      <p>各提供方的 Key 独立加密保存；仅在本次任务明确授权后上传音频，不自动切换提供方。</p>
    </>;
    return <form className="service-settings" aria-label="研究与创作服务" onSubmit={event => {event.preventDefault(); void saveAndCheck();}}>
      <Card title="研究与创作服务"><p>调研、账号分析及所有文字分析与创作均由你选择的 Codex / WorkBuddy 助手完成。这里配置 TikHub 采集与语音识别；工作台直连云端模型仅用于语音转文字。</p><p>Key 加密保存在本机，不随内容库备份；已配置的 Key 默认隐藏，点击“查看”可显示。新 Key 留空保留原值。</p>{saved?.encryptionStatus === 'unchecked' && <p role="status">系统安全存储尚未检查。保存新 Key、查看已保存 Key 或授权服务调用时，系统可能请求许可；本地语音识别无需 Key。</p>}{saved?.encryptionStatus === 'unavailable' && <p role="alert">上次访问系统安全存储未成功。可在解锁钥匙串或配置系统凭据存储后重试 Key 操作；本地语音识别仍可使用。</p>}{loading && <p role="status">正在读取服务设置…</p>}</Card>
      <Card title="TikHub 采集">{keyInput('tikhub', 'TikHub Key')}<p>用于抖音搜索、账号、作品与评论，调用可能计费。</p></Card>
      <Card title="语音识别">
        <p>默认优先使用适用本机的免费随包语音组件。云端识别仅在本次任务明确授权后使用；本地失败不会自动取得云端授权。</p>
        <label htmlFor="service-asr-mode">识别方式</label><PopupSelect id="service-asr-mode" value={currentAsr.mode} disabled={blocked} onChange={mode => changeAsrMode(mode as ServiceSettingsValues['asr']['mode'])}><option value="local-first">免费本地优先</option><option value="local-only">仅本地</option><option value="cloud">云端识别（需授权）</option></PopupSelect><p>选择“仅本地”会放弃未保存的云端配置与 Key 修改，已保存配置保留。</p>
        {!cloudMode && <>
          <p>{localConfigured ? '已填写本地模型路径，保存时检查可用性。' : '路径留空会检查适用本机的随包组件；也可展开指定已有模型。'}本地识别失败时不会自动转付费云端。</p>
          <details className="service-settings-details" open={!localConfigured}><summary>本地模型配置</summary><div className="service-settings-detail-body">
            <label htmlFor="service-asr-engine">本地引擎</label><PopupSelect id="service-asr-engine" value={values.asr.localEngine} disabled={blocked} onChange={localEngine => asr({localEngine: localEngine as ServiceSettingsValues['asr']['localEngine']})}><option value="faster-whisper">faster-whisper / Python</option><option value="qwen3-asr">Qwen3-ASR / Python</option><option value="whisper-cpp">whisper.cpp</option></PopupSelect>
            <label htmlFor="service-asr-executable">Python / whisper-cli 路径</label><Input id="service-asr-executable" value={values.asr.localExecutable} disabled={blocked} onChange={localExecutable => asr({localExecutable})}/>
            <label htmlFor="service-asr-model">离线模型路径</label><Input id="service-asr-model" value={values.asr.localModelPath} disabled={blocked} onChange={localModelPath => asr({localModelPath})}/><p>使用绝对路径。Python 引擎填写模型目录；whisper.cpp 填写模型文件。此处不会安装软件或下载模型。</p>
          </div></details>
        </>}
        {cloudMode ? cloudFields : values.asr.mode === 'local-first' && <details className="service-settings-details"><summary>云端备用配置（可选）</summary><div className="service-settings-detail-body">{cloudFields}</div></details>}
      </Card>
      <Card title="调用预算与评论">
        <p>免费计划与试用资格由提供方账户决定；开启此项允许任务申请外部服务，不代表一定扣费。所有云端识别仍需本次任务明确授权。</p>
        <Checkbox checked={values.budget.enabled} disabled={blocked} onChange={event => setValues({...values, budget: {...values.budget, enabled: !!event.target.checked}})}>允许任务申请外部服务调用（可能计费，默认关闭）</Checkbox>
        {values.budget.enabled && <><label htmlFor="service-request-budget">每任务请求次数上限（1–100）</label><Input id="service-request-budget" type="number" min={1} max={100} value={String(values.budget.maxRequestsPerTask)} disabled={blocked} onChange={text => setValues({...values, budget: {...values.budget, maxRequestsPerTask: Number(text)}})}/></>}
        <Checkbox checked={values.commentsEnabled} disabled={blocked} onChange={event => setValues({...values, commentsEnabled: !!event.target.checked})}>开放评论采集能力（默认关闭）</Checkbox>
        <p>TikHub 评论采集收费较高，分页可能多次计费。这里仅开放能力；每次调研仍需手动勾选，并受任务预算限制。实际费用以提供方账单为准。</p>
      </Card>
      {(customNeedsKey||customInvalid)&&(!cloudMode||cloud.provider!=='custom')&&<p role="alert">自定义接口配置尚未完成。请在“云端识别”的“自定义兼容 ASR”中补全地址、模型和需要重新填写的 Key，或放弃本次修改。</p>}
      <div className="service-settings-actions"><Button htmlType="submit" theme="solid" loading={saving} disabled={blocked||customNeedsKey||customInvalid}>{cloudMode ? '保存设置' : '保存并检查'}</Button>{dirty && <Button disabled={blocked} onClick={() => {hideSavedKey();if (saved) setValues(saved.values); setKeys({}); setNotice('已放弃本次修改。');}}>放弃修改</Button>}</div>{notice && <p className="service-settings-notice" role="status">{notice}</p>}
    </form>;
}
