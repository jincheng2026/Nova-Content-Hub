import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultServiceSettings, serviceCredentials, serviceSettingsPatch, serviceSettingsValues} from '../shared/service-validation.ts';
import type {ServiceCredential,ServiceCredentialDisclosure, ServiceSettingsPatch, ServiceSettingsValues, ServiceSettingsView} from '../shared/service-contracts.ts';
export interface ServiceEncryption {isEncryptionAvailable(): boolean; getSelectedStorageBackend?(): string; encryptString(text: string): Buffer; decryptString(bytes: Buffer): string}
const fail = (code: string) => {throw Object.assign(new Error(code === 'ENCRYPTION_UNAVAILABLE' ? '系统安全存储不可用，请解锁钥匙串或配置系统凭据存储。' : '服务设置不可用；原设置文件已保留。'), {code});};
export class ServiceSettingsStore {
    readonly filePath: string;
    readonly encryption: ServiceEncryption;
    private values = defaultServiceSettings();
    private encrypted: Partial<Record<ServiceCredential,string>> = {};
    private initialized = false;
    private pending: Promise<unknown> = Promise.resolve();
    constructor(options: {filePath: string; encryption: ServiceEncryption}) {this.filePath=options.filePath; this.encryption=options.encryption;}
    encryptionAvailable(): boolean {try {return this.encryption.isEncryptionAvailable() && !['basic_text','unsafe',...(process.platform==='linux'?['unknown']:[])].includes(this.encryption.getSelectedStorageBackend?.()??'');} catch {return false;}}
    async initialize(): Promise<ServiceSettingsView> {
        try {
            const stat=await fs.lstat(this.filePath); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100000) fail('SETTINGS_UNAVAILABLE');
            const data: unknown=JSON.parse(await fs.readFile(this.filePath,'utf8'));
            if (!data || typeof data !== 'object' || Array.isArray(data)) fail('SETTINGS_UNAVAILABLE');
            const d=data as Record<string,unknown>;
            if (Object.keys(d).sort().join(',') !== 'keys,values,version' || d.version !== 1 || !serviceSettingsValues(d.values) || !d.keys || typeof d.keys !== 'object' || Array.isArray(d.keys)) fail('SETTINGS_UNAVAILABLE');
            const keys=d.keys as Record<string,unknown>;
            if (Object.entries(keys).some(([name,v]) => !serviceCredentials.includes(name as ServiceCredential) || typeof v !== 'string' || v.length > 20000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v))) fail('SETTINGS_UNAVAILABLE');
            this.values=structuredClone(d.values as ServiceSettingsValues); this.encrypted=keys as typeof this.encrypted;
            if (process.platform !== 'win32') await fs.chmod(this.filePath,0o600);
        } catch(error) {if (!(error && typeof error==='object' && 'code' in error && error.code==='ENOENT')) fail('SETTINGS_UNAVAILABLE');}
        this.initialized=true; return this.read();
    }
    read(): ServiceSettingsView {if (!this.initialized) fail('SETTINGS_UNAVAILABLE'); return {values: structuredClone(this.values), credentials: {tikhub:{hasKey:!!this.encrypted.tikhub}, model:{hasKey:!!this.encrypted.model}, asr:{hasKey:!!this.encrypted.asr}}, encryptionAvailable:this.encryptionAvailable()};}
    reveal(name:ServiceCredential):ServiceCredentialDisclosure {if(!serviceCredentials.includes(name))fail('INVALID_INPUT');return{service:name,key:this.secret(name)};}
    secret(name: ServiceCredential): string {if (!this.initialized) fail('SETTINGS_UNAVAILABLE'); if (!this.encryptionAvailable()) fail('ENCRYPTION_UNAVAILABLE'); const bytes=this.encrypted[name]; if (!bytes) fail('SERVICE_KEY_MISSING'); try {return this.encryption.decryptString(Buffer.from(bytes!,'base64'));} catch {return fail('ENCRYPTION_UNAVAILABLE');}}
    async update(patch: ServiceSettingsPatch): Promise<ServiceSettingsView> {
        const run=this.pending.then(async () => {
            if (!this.initialized || !serviceSettingsPatch(patch)) fail('INVALID_INPUT');
            const values=structuredClone(patch.values ?? this.values), keys={...this.encrypted};
            for (const name of serviceCredentials) if (patch.keys && Object.hasOwn(patch.keys,name)) {
                const value=patch.keys[name]; if (value === null) delete keys[name];
                else {if (!this.encryptionAvailable()) fail('ENCRYPTION_UNAVAILABLE'); keys[name]=this.encryption.encryptString(value!).toString('base64');}
            }
            await fs.mkdir(path.dirname(this.filePath),{recursive:true,mode:0o700});
            try {const s=await fs.lstat(this.filePath); if (!s.isFile() || s.isSymbolicLink()) fail('SETTINGS_UNAVAILABLE');} catch(error) {if (!(error && typeof error==='object' && 'code' in error && error.code==='ENOENT')) throw error;}
            const temp=`${this.filePath}.${randomUUID()}.tmp`;
            try {await fs.writeFile(temp,JSON.stringify({version:1,values,keys}),{flag:'wx',mode:0o600}); await fs.rename(temp,this.filePath);} finally {await fs.rm(temp,{force:true});}
            this.values=values; this.encrypted=keys; return this.read();
        }); this.pending=run.catch(()=>{}); return run;
    }
}
