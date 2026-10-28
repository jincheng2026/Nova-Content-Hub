import {AsyncLocalStorage} from 'node:async_hooks';

// Private process context: no authority callback is accepted from task JSON.
// Only the synchronous final commit holds the production lock, never an await.
const scopes=new AsyncLocalStorage();
export function withProductionWriteScope(library,identity,execute){
 const task=library.readProductionContext(identity.taskId,identity.attemptId).task;
 const execution=task?.journeyMember?{taskId:task.id,attemptId:identity.attemptId,requestHash:task.requestHash}:null;
 return scopes.run({commit:(commit,options)=>library.withProductionAuthority({...identity,...options},commit),execution},execute);
}
export function productionExecution(){return scopes.getStore()?.execution??null;}
export function atProductionCommit(commit,options){const authority=scopes.getStore();return authority?authority.commit(commit,options):commit();}
