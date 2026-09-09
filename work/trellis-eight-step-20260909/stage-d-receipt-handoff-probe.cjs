'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'), delegate=require(path.join(repo,'skills/ultra-delegate/scripts/delegate.cjs'));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ubp-d-receipt-handoff-')));
const save=(p,v)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'stage-d-product-attempts.jsonl'),'utf8').trim().split('\n').find(s=>JSON.parse(s).shape==='expense'&&JSON.parse(s).mode==='solo'));
fs.cpSync(path.join(__dirname,'product-canonical-fixture'),root,{recursive:true});
for(const p of ['src','cli.cjs','README.md','test'])fs.cpSync(path.join(previous.root,p),path.join(root,p),{recursive:true});
for(const p of ['GOAL.md','acceptance.cjs'])fs.copyFileSync(path.join(__dirname,'product-fixture',p),path.join(root,p));
save('.gitignore','.ultra/.runtime/\nprobe/\n');git('init','-b','main');git('config','user.name','Receipt Handoff Probe');git('config','user.email','probe@example.invalid');git('add','.');git('commit','-m','test: independent receipt handoff subject');
const observation=JSON.parse(execFileSync(process.execPath,[path.join(repo,'skills/ultra-test/scripts/worktree_digest.cjs'),'--project',root,'--change-id','expense-ledger'],{encoding:'utf8'}));
const check=spawnSync(process.execPath,['acceptance.cjs'],{cwd:root,encoding:'utf8'});assert.equal(check.status,0);save('probe/acceptance.json',{exit_code:check.status,stdout:check.stdout,stderr:check.stderr});save('probe/original-baseline.json',fs.readFileSync(path.join(previous.root,'probe/baseline.json'),'utf8'));
const specimen={$schema:'ultra-external-review-receipt-v1',reviewer:'REVIEWER: use the real provider/model/session from your session header',reviewer_role:'read-only',task_id:'expense-ledger',change_id:'expense-ledger',reviewer_authority:{ref:'.ultra/decisions/experiment.md',sha256:sha(fs.readFileSync(path.join(root,'.ultra/decisions/experiment.md')))},reviewed_contract:{ref:'GOAL.md',sha256:sha(fs.readFileSync(path.join(root,'GOAL.md')))},subject:{git_head:observation.head,worktree_digest:observation.diff_digest},verdict:'REVIEWER_CHOOSES',findings:null,timestamp:'REVIEWER: use the observed native review-session start timestamp'};
save('probe/receipt-specimen.json',specimen);
const dir='.ultra/.runtime/delegations/receipt-context-review';
save(`${dir}/permission.json`,{$schema:'ultra-delegation-permission-v1',writable_roots:[],external_effects:[]});
save(`${dir}/instruction.md`,`This is a new owner-authorized, read-only receipt-handoff characterization on an isolated copy, not permission to resume or edit the earlier experiment. Review GOAL.md, cli.cjs, src and README plus retained actual checks at ${root}/probe/acceptance.json and original baseline at ${root}/probe/original-baseline.json. Determine your own verdict/findings. Do not edit any file or execute Bash/commands; native read/ls/grep/find are enough.\n\nYour real native session files are in ${root}/${dir}/pi-sessions. Use ls then read only the first two lines of the current JSONL: the session header gives the real session ID and start timestamp; the model_change record gives actual provider/model. Set the receipt timestamp to that observed review-session start, explicitly understood as the beginning of this review observation, not an invented current clock.\n\nRead ${root}/probe/receipt-specimen.json. It supplies exact factual subject/contract/authority fields, not a verdict. Originate the complete ultra-external-review-receipt-v1 yourself: reviewer must be a string naming your native identity, verdict approve or request_changes, findings exact {id,severity,title} entries, and timestamp from the native header. Preserve all supplied digests exactly. Choose findings and verdict from your actual inspection. A read-only reviewer labels Primary check logs as inspected, not independently executed.\n\nReturn the usual typed delegation result. Put the complete receipt as ONE RAW JSON STRING in its evidence array. Do not use Base64, Markdown fences, output files or commands. The receiving observer will write that string unchanged and run the existing canonical receipt sensor. Receipt generation does not accept the product on behalf of its owner.\n`);
git('worktree','add','--detach',path.join(root,'review-tree'),observation.head);
const launched=delegate.run(['--to','pi','--instruction',`${dir}/instruction.md`,'--permission',`${dir}/permission.json`,'--worktree','review-tree','--timeout','240','--model','gpt-6-astra','--ack-experimental'],{projectRoot:root});
fs.writeFileSync(path.join(__dirname,'stage-d-receipt-handoff-location.json'),JSON.stringify({root,launched,subject:specimen.subject})+'\n');
(async()=>{
 let state;const started=Date.now();
 do{await new Promise(r=>setTimeout(r,1000));state=delegate.status(['--delegation',dir],{projectRoot:root});}while(!fs.existsSync(path.join(root,dir,'result.json'))&&Date.now()-started<260000);
 const result=JSON.parse(fs.readFileSync(path.join(root,dir,'result.json'),'utf8'));
 const raw=result.evidence.find(e=>{try{return JSON.parse(e).$schema==='ultra-external-review-receipt-v1';}catch{return false;}});
 let receipt=null, diagnostics=null;
 if(raw){
  receipt=JSON.parse(raw);save('.ultra/evidence/expense-ledger/external-review.json',raw);
  // Expose the unchanged canonical receipt sensor for this bounded observation;
  // the CLI bootstrap is the only replaced line. This is not full Task Evidence.
  const file=path.join(repo,'skills/ultra-plan/scripts/validate_task_evidence.cjs');const Module=require('node:module');const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
  m._compile(fs.readFileSync(file,'utf8').replace('process.exitCode = main(process.argv.slice(2));','module.exports = { verifyExternalReceipt };'),file);
  diagnostics=m.exports.verifyExternalReceipt(path.join(root,'.ultra/evidence/expense-ledger/evidence.json'),{task_id:'expense-ledger',change_id:'expense-ledger',subject:specimen.subject,task_review:{review_mode:'external-manual',receipt_ref:'.ultra/evidence/expense-ledger/external-review.json',receipt_sha256:sha(Buffer.from(raw)),blocking_findings:[]}});
 }
 const output={root,status:result.status,failure_type:result.failure_type??null,native_terminal:result.native_terminal,receipt,canonical_receipt_diagnostics:diagnostics,raw_receipt_sha256:raw?sha(Buffer.from(raw)):null,writer:JSON.parse(fs.readFileSync(path.join(root,dir,'writer.json'),'utf8')),wall_seconds:(Date.now()-started)/1000,limitation:'Receipt context/format characterization only; no full Task Evidence, Stage D product acceptance or strategy promotion.'};save('probe/observation.json',output);console.log(JSON.stringify(output));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
