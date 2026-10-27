export function publishVaultProductionArchive(input:{root:string;task:any;attempt:any;archive:any}):any;
export function verifyVaultProductionArchive(binding:{root:string;libraryId:string;rootIdentity:{dev:string;ino:string}},archive:{ready:boolean;warnings:string[];directory:string;taskId:string;attemptId:string;receiptHash:string}):string|null;
