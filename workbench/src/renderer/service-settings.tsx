import {useEffect, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import Checkbox from '@douyinfe/semi-ui-19/lib/es/checkbox';
import type {ServiceCredential,ServiceCredentialDisclosure, ServiceReadiness, ServiceSettingsPatch, ServiceSettingsValues, ServiceSettingsView} from '../shared/service-contracts.ts';
import {defaultServiceSettings} from '../shared/service-validation.ts';
import {PopupSelect} from './semi-controls.tsx';
import {useManagedDraftGuard} from './library-panels.tsx';
import './service-settings.css';
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
    useEffect(()=>{hideSavedKey();},[value,values.model.provider,values.model.baseUrl,values.model.modelId,values.asr.mode,values.asr.localEngine,values.asr.localExecutable,values.asr.localModelPath]);
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
    const model = (patch: Partial<ServiceSettingsValues['model']>) => setValues({...values, model: {...values.model, ...patch}});
    const asr = (patch: Partial<ServiceSettingsValues['asr']>) => setValues({...values, asr: {...values.asr, ...patch}});
    const keyInput = (name: ServiceCredential, label: string) => <div className="service-settings-key">
        <label htmlFor={saved?.credentials[name].hasKey?`service-saved-key-${name}`:`service-key-${name}`}>{label}</label>
        <span className="service-settings-key-status">{keys[name] === null ? '保存后清除' : typeof keys[name] === 'string' ? '保存后替换' : saved?.credentials[name].hasKey ? '已配置 · 安全保存' : '未配置'}</span>
        {saved?.credentials[name].hasKey&&<div className="service-settings-key-saved"><Input id={`service-saved-key-${name}`} aria-label={`已保存的${label}`} type={disclosed?.service===name?'text':'password'} readonly autoComplete="off" value={disclosed?.service===name?disclosed.key:'••••••••'}/><Button id={`service-key-reveal-${name}`} aria-controls={`service-saved-key-${name}`} aria-label={`${disclosed?.service===name?'隐藏':'查看'}已保存的${label}`} aria-pressed={disclosed?.service===name} theme="borderless" loading={revealing===name} disabled={blocked||!saved.encryptionAvailable||keys[name]===null} onClick={()=>void toggleSavedKey(name)}>{disclosed?.service===name?'隐藏':'查看'}</Button></div>}
        {saved?.credentials[name].hasKey&&<label htmlFor={`service-key-${name}`}>新 Key（可选，留空保留已保存的 Key）</label>}
        <Input id={`service-key-${name}`} type="password" mode="password" autoComplete="new-password" value={keys[name] ?? ''} disabled={blocked || !saved?.encryptionAvailable || keys[name] === null} placeholder={saved?.credentials[name].hasKey ? '填写新 Key 替换' : '填写 Key'} onChange={text => {hideSavedKey();setKeys(current => {const next = {...current}; if (text) next[name] = text; else delete next[name]; return next;});}}/>
        {(saved?.credentials[name].hasKey || Object.hasOwn(keys, name)) && <div className="service-settings-key-actions"><Button id={`service-key-clear-${name}`} theme="borderless" type={keys[name] === null ? 'primary' : 'danger'} disabled={blocked} onClick={() => {hideSavedKey();setKeys(current => {const next = {...current}; if (current[name] === null || !saved?.credentials[name].hasKey) delete next[name]; else next[name] = null; return next;});}}>{keys[name] === null ? '撤销清除' : saved?.credentials[name].hasKey ? '清除 Key' : '清空输入'}</Button></div>}
    </div>;
    async function saveAndCheck() {
        if (blocked) return;
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
            if (current.values.asr.mode === 'volc') {setNotice('服务设置已保存。云端识别将在任务授权后调用。'); return;}
            try {const result = await onCheck(); setNotice(`服务设置已保存。${result.localAsr.reason}`);}
            catch {setNotice('服务设置已保存；本地模型检查未完成，可再次点击“保存并检查”重试。');}
        } finally {setSaving(false);}
    }
    const localConfigured = !!values.asr.localExecutable && !!values.asr.localModelPath;
    const cloudFields = <>{keyInput('asr', '火山语音专用 Key')}<label htmlFor="service-asr-resource">语音资源 ID</label><Input id="service-asr-resource" value={values.asr.resourceId} disabled={blocked} onChange={resourceId => asr({resourceId})}/><p>需单独开通火山语音。语音 Key 与大模型 Key 分开保存；仅在本次任务明确授权后上传音频。</p></>;
    return <form className="service-settings" aria-label="研究与创作服务" onSubmit={event => {event.preventDefault(); void saveAndCheck();}}>
      <Card title="研究与创作服务"><p>AI 任务仍交给 Codex / WorkBuddy，由你在助手中选模型并提交。这里配置任务可用的采集、分析与语音服务。</p><p>Key 加密保存在本机，不随内容库备份；已配置的 Key 默认隐藏，点击“查看”可显示。新 Key 留空保留原值。</p>{saved && !saved.encryptionAvailable && <p role="alert">系统安全存储当前不可用，暂不能保存或使用新 Key。请先解锁钥匙串或配置系统凭据存储。</p>}{loading && <p role="status">正在读取服务设置…</p>}</Card>
      <Card title="TikHub 采集">{keyInput('tikhub', 'TikHub Key')}<p>用于抖音搜索、账号、作品与评论，调用可能计费。</p></Card>
      <Card title="大模型分析">
        <label htmlFor="service-model-id">模型 / 接入点 ID</label><Input id="service-model-id" value={values.model.modelId} disabled={blocked} onChange={modelId => model({modelId})}/>
        {keyInput('model', '大模型 Key')}
        <details className="service-settings-details"><summary>接口设置</summary><div className="service-settings-detail-body">
          <label htmlFor="service-model-provider">提供方</label><PopupSelect id="service-model-provider" value={values.model.provider} disabled={blocked} onChange={provider => model({provider: provider as ServiceSettingsValues['model']['provider']})}><option value="volc">火山方舟</option><option value="compatible">兼容 Chat Completions</option></PopupSelect>
          <label htmlFor="service-model-url">API 基础地址（HTTPS）</label><Input id="service-model-url" value={values.model.baseUrl} disabled={blocked} onChange={baseUrl => model({baseUrl})}/><p>填写基础地址，例如 https://ark.cn-beijing.volces.com/api/v3。</p>
        </div></details>
        <p>优先使用助手已有额度与本地模型。免费额度以提供方账户为准，额度未知或用尽时不会自动切换付费模型；API 调用仍需任务授权和预算。</p>
      </Card>
      <Card title="语音识别">
        <label htmlFor="service-asr-mode">识别方式</label><PopupSelect id="service-asr-mode" value={values.asr.mode} disabled={blocked} onChange={mode => asr({mode: mode as ServiceSettingsValues['asr']['mode']})}><option value="local-first">优先本地</option><option value="local-only">仅本地</option><option value="volc">火山语音</option></PopupSelect>
        {values.asr.mode !== 'volc' && <>
          <p>{localConfigured ? '已填写本地模型路径，保存时检查可用性。' : '请展开配置已安装的本地模型。'}本地识别失败时不会自动转付费云端。</p>
          <details className="service-settings-details" open={!localConfigured}><summary>本地模型配置</summary><div className="service-settings-detail-body">
            <label htmlFor="service-asr-engine">本地引擎</label><PopupSelect id="service-asr-engine" value={values.asr.localEngine} disabled={blocked} onChange={localEngine => asr({localEngine: localEngine as ServiceSettingsValues['asr']['localEngine']})}><option value="faster-whisper">faster-whisper / Python</option><option value="qwen3-asr">Qwen3-ASR / Python</option><option value="whisper-cpp">whisper.cpp</option></PopupSelect>
            <label htmlFor="service-asr-executable">Python / whisper-cli 路径</label><Input id="service-asr-executable" value={values.asr.localExecutable} disabled={blocked} onChange={localExecutable => asr({localExecutable})}/>
            <label htmlFor="service-asr-model">离线模型路径</label><Input id="service-asr-model" value={values.asr.localModelPath} disabled={blocked} onChange={localModelPath => asr({localModelPath})}/><p>使用绝对路径。Python 引擎填写模型目录；whisper.cpp 填写模型文件。此处不会安装软件或下载模型。</p>
          </div></details>
        </>}
        {values.asr.mode === 'volc' ? cloudFields : values.asr.mode === 'local-first' && <details className="service-settings-details"><summary>云端备用配置（可选）</summary><div className="service-settings-detail-body">{cloudFields}</div></details>}
      </Card>
      <Card title="调用预算与评论">
        <Checkbox checked={values.budget.enabled} disabled={blocked} onChange={event => setValues({...values, budget: {...values.budget, enabled: !!event.target.checked}})}>允许任务申请付费服务调用（默认关闭）</Checkbox>
        {values.budget.enabled && <><label htmlFor="service-request-budget">每任务请求次数上限（1–100）</label><Input id="service-request-budget" type="number" min={1} max={100} value={String(values.budget.maxRequestsPerTask)} disabled={blocked} onChange={text => setValues({...values, budget: {...values.budget, maxRequestsPerTask: Number(text)}})}/></>}
        <Checkbox checked={values.commentsEnabled} disabled={blocked} onChange={event => setValues({...values, commentsEnabled: !!event.target.checked})}>开放评论采集能力（默认关闭）</Checkbox>
        <p>TikHub 评论采集收费较高，分页可能多次计费。这里仅开放能力；每次调研仍需手动勾选，并受任务预算限制。实际费用以提供方账单为准。</p>
      </Card>
      <div className="service-settings-actions"><Button htmlType="submit" theme="solid" loading={saving} disabled={blocked}>{values.asr.mode === 'volc' ? '保存设置' : '保存并检查'}</Button>{dirty && <Button disabled={blocked} onClick={() => {hideSavedKey();if (saved) setValues(saved.values); setKeys({}); setNotice('已放弃本次修改。');}}>放弃修改</Button>}</div>{notice && <p className="service-settings-notice" role="status">{notice}</p>}
    </form>;
}
