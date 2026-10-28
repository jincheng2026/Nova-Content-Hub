import {createHash} from 'node:crypto';
import {createReportSearchService,type ReportSearchSnapshot} from './report-search.mts';
import {verifiedBoundReader} from './bound-reader.mts';
import {registeredReportPage} from './report-navigation.mts';
import {fail,exact,libraryBinding} from '../shared/validation.ts';
import {validReportSearchInput} from '../shared/report-search-contracts.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
import type {ReportSearchInput} from '../shared/report-search-contracts.ts';
import type {ProductionCoreLibrary} from '../shared/production-core.d.ts';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let selected='',capture:ReportSearchSnapshot,reader:ProductionCoreLibrary,binding:LibraryBinding;
const service=createReportSearchService({capture:()=>capture,readRegisteredPage(input){
 if(digest(input.binding)!==digest(capture.binding))fail('STALE_SEARCH','报告检索绑定已变化');
 const report=capture.reports.find(r=>r.id===input.reportId),page=report?.pages.find(p=>p.id===input.pageId&&p.assetHash===input.assetHash);
 if(!report||!page)fail('CONFLICT','报告页面登记已变化');
 const source=report.meta&&typeof report.meta==='object'&&!Array.isArray(report.meta)?report.meta.vault:null;
 if(source&&typeof source==='object'&&!Array.isArray(source)&&source.currentBody==='original'&&(source.format==='html'||Array.isArray(source.originalPages))&&!registeredReportPage(binding,report,page.id))fail('SOURCE_NOT_AVAILABLE','原注册报告页面已变化，请核对来源');
 const asset=reader.readAsset(page.assetHash);return {data:asset.data,detectedType:asset.detectedType};
}});
/** All source bytes come from current registered report pages, never renderer paths. */
export async function executeReportSearch(args:unknown){
 if(!exact(args,['binding','input'])||!libraryBinding(args.binding)||!validReportSearchInput(args.input))fail('INVALID_INPUT','报告检索参数无效');
 const next=args.binding as LibraryBinding,key=digest(next);if(key!==selected){service.cancel();selected=key;}
 binding=next;reader=verifiedBoundReader(binding) as unknown as ProductionCoreLibrary;
 const snapshot=reader.readProduction();capture={binding:{libraryId:binding.libraryId,rootIdentity:binding.rootIdentity},snapshotToken:snapshot.editToken,reports:snapshot.reports,accounts:snapshot.accounts};
 const before=digest(capture),result=await service.search(args.input as ReportSearchInput),latest=reader.readProduction();
 const after={...capture,snapshotToken:latest.editToken,reports:latest.reports,accounts:latest.accounts};if(before!==digest(after)){capture=after;service.cancel();fail('STALE_SEARCH','报告来源或资料已变化，请重新检索');}
 return result;
}
