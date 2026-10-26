export type ServiceCredential = 'tikhub' | 'model' | 'asr';
export interface ServiceSettingsValues {
    model: {provider: 'volc'|'compatible'; baseUrl: string; modelId: string};
    asr: {mode: 'local-first'|'local-only'|'volc'; resourceId: string; localEngine: 'faster-whisper'|'whisper-cpp'|'qwen3-asr'; localExecutable: string; localModelPath: string};
    budget: {enabled: boolean; maxRequestsPerTask: number};
    commentsEnabled: boolean;
}
export interface ServiceSettingsPatch {values?: ServiceSettingsValues; keys?: Partial<Record<ServiceCredential, string|null>>}
export interface ServiceSettingsView {values: ServiceSettingsValues; credentials: Record<ServiceCredential, {hasKey: boolean}>; encryptionAvailable: boolean}
export interface ServiceReadiness {localAsr: {available: boolean; reason: string}; encryptionAvailable: boolean}
export type TikHubOperation = 'douyin-search'|'user-search'|'profile'|'user-posts'|'video'|'comments';
export type ServiceToolInput = {tool: 'tikhub'; operation: TikHubOperation; id: string; cursor?: string} | {tool: 'asr'; audioPath: string; allowCloud?: boolean} | {tool: 'model'; instruction: string; text: string};
export type ServiceToolRequest = ServiceToolInput & {taskId: string; attemptId: string; claimToken: string; workerId: string; requestId: string};
export interface ServiceToolResult {data: unknown; service: string; requestsUsed: 0|1; collectedAt: string; cacheHit: boolean}
export interface ServiceBrokerDescriptor {version: 1; host: '127.0.0.1'; port: number; token: string}
