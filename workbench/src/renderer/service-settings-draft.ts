import type {ServiceSettingsPatch,ServiceSettingsValues} from '../shared/service-contracts.ts';
import {normalizeAsrSettings} from '../shared/service-validation.ts';

/** Local-only abandons unsaved cloud edits, retaining the saved configuration and unrelated drafts. */
export function localOnlyServiceDraft(values:ServiceSettingsValues,saved:ServiceSettingsValues,keys:NonNullable<ServiceSettingsPatch['keys']>):Required<ServiceSettingsPatch> {
    const prior=normalizeAsrSettings(saved.asr),local=normalizeAsrSettings(values.asr);
    const retained={...keys};delete retained.asr;delete retained.groq;delete retained.custom;
    return {values:{...values,asr:{...local,mode:'local-only',resourceId:prior.resourceId,cloud:prior.cloud}},keys:retained};
}
