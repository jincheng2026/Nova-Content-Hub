import type {LibraryBinding} from './contracts.ts';
import type {FinalAssetsView as StoredView,FinalAssetsPreview as StoredPreview,FinalAssetSelection,FinalAssetSaveInput,VerifiedBundle} from '../../../plugin-src/src/lib/final-assets/index.mjs';
export type {FinalAssetSelection,FinalAssetSaveInput,FinalAssetWarning} from '../../../plugin-src/src/lib/final-assets/index.mjs';
export type FinalAssetsPreview=Omit<StoredPreview,'cover'>&{cover:StoredPreview['cover']&{url:string|null}};
export type FinalAssetsView=Omit<StoredView,'selected'>&{selected:(Omit<NonNullable<StoredView['selected']>,'cover'>&{cover:NonNullable<StoredView['selected']>['cover']&{url:string|null}})|null};
export interface FinalAssetsInputs {
 readFinalAssets:{contentId:string;bundleId?:string};
 previewFinalAssets:FinalAssetSelection;
 saveFinalAssets:FinalAssetSaveInput;
 exportFinalAssets:{contentId:string;bundleId:string;manifestHash:string};
}
export interface FinalAssetsResults {
 readFinalAssets:FinalAssetsView;
 previewFinalAssets:FinalAssetsPreview;
 saveFinalAssets:FinalAssetsView;
 exportFinalAssets:{cancelled:true}|{cancelled:false;directory:string};
}
export interface FinalAssetsWorkerOperations {
 finalRead:{args:{binding:LibraryBinding;input:FinalAssetsInputs['readFinalAssets']};result:StoredView};
 finalPreview:{args:{binding:LibraryBinding;input:FinalAssetSelection};result:StoredPreview};
 finalExport:{args:{binding:LibraryBinding;input:FinalAssetsInputs['exportFinalAssets']};result:VerifiedBundle};
 finalAssetRaster:{args:{binding:LibraryBinding;input:FinalAssetsInputs['exportFinalAssets']};result:{data:Uint8Array;mime:string;sha256:string}};
}
