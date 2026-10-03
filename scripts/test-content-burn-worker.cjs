const fs=require('fs'); const vm=require('vm'); const ts=require('typescript'); const assert=require('node:assert/strict');
const source=fs.readFileSync('supabase/functions/_shared/contentBurn.ts','utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,Response});
function fixture(count=2) {
 let inventory=Array.from({length:count},(_,i)=>({bucket:'vault',path:`couple/user/${i}.jpg`}));
 const bytes=new Set(inventory.map(o=>o.path)); let state='pending',fail=false,falseSuccess=false,ackFail=false;
 const admin={
  from(table) {
   let head=false;
   const q={ select(_,{head:h}={}) {head=!!h;return q},eq(){return q},limit(n){q.n=n;return q},
    then(resolve,reject) {return Promise.resolve({data:head?null:inventory.slice(0,q.n??inventory.length),count:head?inventory.length:null,error:null}).then(resolve,reject)} };
   return q;
  },
  storage:{from(){return {async remove(paths){if(fail)return {error:new Error('Storage unavailable')};if(!falseSuccess)paths.forEach(p=>bytes.delete(p));return {error:null}}}}},
  async rpc(name,params) {
   if(name==='acknowledge_content_burn_objects') {if(ackFail)return {error:new Error('DB unavailable')};inventory=inventory.filter(o=>!params.p_paths.includes(o.path)||bytes.has(o.path));return {error:null}}
   if(name==='finish_content_burn') {if(inventory.length||bytes.size)return {data:false,error:null};state='complete';return {data:true,error:null}}
   throw Error(name);
  }
 };
 return {admin,bytes,get inventory(){return inventory},get state(){return state},set fail(v){fail=v},set falseSuccess(v){falseSuccess=v},set ackFail(v){ackFail=v}};
}
(async()=>{
 const a=fixture();a.fail=true;await assert.rejects(exportsObject.processBurnJob(a.admin,'job'));assert.equal(a.inventory.length,2);assert.equal(a.state,'pending');a.fail=false;assert.equal(await exportsObject.processBurnJob(a.admin,'job'),true);
 const b=fixture();b.falseSuccess=true;assert.equal(await exportsObject.processBurnJob(b.admin,'job'),false);assert.equal(b.inventory.length,2);assert.equal(b.state,'pending');b.falseSuccess=false;assert.equal(await exportsObject.processBurnJob(b.admin,'job'),true);
 const c=fixture();c.ackFail=true;await assert.rejects(exportsObject.processBurnJob(c.admin,'job'));assert.equal(c.inventory.length,2);assert.equal(c.bytes.size,0);c.ackFail=false;assert.equal(await exportsObject.processBurnJob(c.admin,'job'),true);
 const d=fixture(1001);assert.equal(await exportsObject.processBurnJob(d.admin,'job'),false);assert.equal(d.inventory.length,501);assert.equal(await exportsObject.processBurnJob(d.admin,'job'),false);assert.equal(d.inventory.length,1);assert.equal(await exportsObject.processBurnJob(d.admin,'job'),true);
 let authDeletes=0;
 const e=fixture();e.fail=true;
 const originalFrom=e.admin.from;
 e.admin.from=table=>table==='account_burn_requests'?{select(){return this},eq(){return this},async maybeSingle(){return {data:{job_ids:['job']},error:null}}}:table==='content_burn_jobs'?{select(){return this},eq(){return this},async single(){return {data:{state:'pending'},error:null}}}:originalFrom(table);
 e.admin.auth={admin:{async deleteUser(){authDeletes++;return {error:null}}}};
 await assert.rejects(exportsObject.processAccountBurn(e.admin,'user'));assert.equal(authDeletes,0,'never auth-cascade before file cleanup');
 console.log('PASS: actual server worker retains jobs on Storage failure/false success, recovers after crash, paginates >1000 files, and prevents premature auth deletion');
})().catch(e=>{console.error(e);process.exitCode=1});
