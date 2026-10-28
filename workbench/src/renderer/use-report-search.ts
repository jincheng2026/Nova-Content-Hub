import {useEffect,useRef,useState} from 'react';
import {invoke} from './client.ts';
import type {ReportSearchInput,ReportSearchResult} from '../shared/report-search-contracts.ts';
/** Scope keys prevent a late response from displaying hits in a different library or filter. */
export function useReportSearch(enabled:boolean,scopeKey:string,input:Omit<ReportSearchInput,'cursor'>){
 const key=JSON.stringify([scopeKey,input]),generation=useRef(0),mounted=useRef(true),active=useRef(false);
 const [state,setState]=useState<{key:string;result:ReportSearchResult|null;working:boolean;error:string}>({key:'',result:null,working:false,error:''});
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 async function search(cursor?:string|null){if(!enabled||active.current)return;active.current=true;const version=generation.current,requested=key;
  setState(current=>({key:requested,result:current.key===requested?current.result:null,working:true,error:''}));
  try{const result=await invoke('searchProductionReports',{...input,...(cursor?{cursor}:{})});if(mounted.current&&version===generation.current)setState({key:requested,result,working:false,error:''});}
  catch(error){if(mounted.current&&version===generation.current)setState(current=>({...current,working:false,error:error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:'报告检索未完成，请重试。'}));}
  finally{if(version===generation.current)active.current=false;}
 }
 useEffect(()=>{generation.current++;active.current=false;setState({key,result:null,working:enabled,error:''});if(!enabled)return;const timer=setTimeout(()=>void search(),200);return()=>{clearTimeout(timer);generation.current++;active.current=false;};},[key,enabled]);
 const current=state.key===key?state:{key,result:null,working:enabled,error:''};
 return {...current,continueSearch:()=>search(current.result?.cursor),restart:()=>search()};
}
