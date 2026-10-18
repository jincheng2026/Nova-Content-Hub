import type {ContentHub} from '../shared/contracts.ts';

declare global {
    interface Window {
        contentHub: ContentHub
    }
}
