import type {LibraryBinding} from './contracts.ts';
import type {PublicationFacts} from '../../../plugin-src/src/lib/publication-runtime/index.mjs';
export type {PublicationFacts};
interface Base {contentId:string;mutationId:string;expectedRevision:string;decisionText:string;decisionAt:string}
export type PublicationMutation =
 | Base&{op:'sync-knowledge'}
 | Base&{op:'cover-copy';platform:string;coverCopy:string}
 | Base&{op:'associate-archive';sourceId:string;videoId:string;manifestPath:string;expectedSourceHash:string}
 | Base&{op:'enable-observation';enabled:boolean;provider:'tikhub';maxRequestsPerCheckpoint:1;maxUnits:number}
 | Base&{op:'record';publication:{platform:string;title:string;description:string;cover:string;coverCopy?:string|null;url:string;publishedAt:string;postId?:string|null};finalScript:{text:string;hash:string};contentPackageId:string|null}
 | Base&{op:'snapshot';platform:string;checkpoint:'12h'|'7d';collectedAt:string;rawEvidence:string;metrics:Record<string,number|null>;delayReason:string|null}
 | Base&{op:'confirm-review';candidateId:string;candidateHash:string;selectedActionIndex:number|null}
 | Base&{op:'decide-knowledge';candidateId:string;candidateHash:string;decision:'accept'|'reject'};
export interface PublicationRuntimeInputs {readJinchengPublication:{contentId:string};mutateJinchengPublication:PublicationMutation}
export interface PublicationRuntimeResults {readJinchengPublication:PublicationFacts|null;mutateJinchengPublication:PublicationFacts}
export interface PublicationRuntimeWorkerOperations {
 publicationRead:{args:{binding:LibraryBinding;input:{contentId:string}};result:PublicationFacts|null};
 publicationMutate:{args:{binding:LibraryBinding;input:PublicationMutation};result:PublicationFacts};
 publicationReserveObservation:{args:{binding:LibraryBinding;input:import('../../../plugin-src/src/lib/publication-runtime/index.mjs').BaseInput&{platform:string;checkpoint:'12h'|'7d';authorizationId:string}};result:import('../../../plugin-src/src/lib/publication-runtime/index.mjs').ObservationReservation};
 publicationFinishObservation:{args:{binding:LibraryBinding;input:import('../../../plugin-src/src/lib/publication-runtime/index.mjs').BaseInput&{platform:string;checkpoint:'12h'|'7d';reservationId:string;result:import('../../../plugin-src/src/lib/publication-runtime/index.mjs').ObservationResult}};result:unknown};
 publicationDue:{args:{binding:LibraryBinding};result:ReturnType<typeof import('../../../plugin-src/src/lib/publication-runtime/index.mjs').readObservationDue>};
}
