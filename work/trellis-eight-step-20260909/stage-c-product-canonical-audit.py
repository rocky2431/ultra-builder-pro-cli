import pathlib,json,hashlib,subprocess,base64,tempfile,tarfile,datetime
repo=pathlib.Path.cwd(); out=repo/'work/trellis-eight-step-20260909'; base=pathlib.Path('/private/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T'); rows=[]
def run(args,cwd):
 x=subprocess.run(args,cwd=cwd,capture_output=True,text=True);return {'command':args,'exit_code':x.returncode,'stdout':x.stdout,'stderr':x.stderr}
for mode,name,attempt in [('factory','NlC7BI','reviewer-delta-01'),('solo','INpJC0','expense-review-3')]:
 root=base/f'ubp-product-canonical-{mode}-{name}'; observation=json.loads((root/'probe/observation.json').read_text());result=json.loads((root/'probe/result.json').read_text());report=json.loads((root/'.ultra/test-report.json').read_text());receipt_bytes=(root/'.ultra/evidence/expense-ledger/external-review.json').read_bytes();receipt=json.loads(receipt_bytes);review=json.loads((root/f'.ultra/.runtime/delegations/{attempt}/result.json').read_text());encoded=next(e for e in review['evidence'] if 'base64:' in e.lower())
 commands=[run(['node','acceptance.cjs'],root),run(['node',str(out/'stage-c-product-supplement.cjs'),str(root)],root),run(['node',str(repo/'skills/ultra-plan/scripts/validate_task_evidence.cjs'),str(root/'.ultra/evidence/expense-ledger/evidence.json'),'--projection'],root),run(['node',str(repo/'skills/ultra-test/scripts/validate_review_transport.cjs'),'--summary',str(root/report['review']['summary_ref']),'--report',str(root/'.ultra/test-report.json')],root)]
 immutable={rel:(root/rel).read_bytes()==(out/fixture/rel).read_bytes() for rel,fixture in [('GOAL.md','product-fixture'),('acceptance.cjs','product-fixture'),('.ultra/decisions/experiment.md','product-canonical-fixture'),('.ultra/north-star.md','product-canonical-fixture')]}
 raw_checks=[]; evidence=json.loads((root/'.ultra/evidence/expense-ledger/evidence.json').read_text())
 for a in evidence['acceptance']:
  e=a['evidence']
  if 'raw_evidence_ref' in e:raw_checks.append({'criterion':a['criterion_id'],'ref':e['raw_evidence_ref'],'matches':hashlib.sha256((root/e['raw_evidence_ref']).read_bytes()).hexdigest()==e['raw_evidence_sha256']})
 extras=[]
 with tempfile.TemporaryDirectory(prefix='ledger-final-independent-') as td:
  p=pathlib.Path(td); ledger=p/'ledger.json'; csv=p/'new.csv';csv.write_text('id,date,amount,currency,category,note\nnew,2026-09-02,+1.13,USD,Food,note\n')
  valid={'id':'old','date':'2026-09-01','amount_cents':100,'currency':'USD','category':'Food','note':''}
  for field in ['id','date','currency','category','note']:
   bad={**valid,field:[valid[field]]}; before=json.dumps([bad]);ledger.write_text(before);c=run(['node','cli.cjs','import',str(csv),str(ledger)],root);extras.append({'case':field+'-array-rejected-with-byte-preservation','passed':c['exit_code']!=0 and ledger.read_text()==before,'observation':c})
  ledger.write_text('[]');c=run(['node','cli.cjs','import',str(csv),str(ledger)],root);extras.append({'case':'explicit-positive-signed-decimal','passed':c['exit_code']==0 and json.loads(ledger.read_text())[0]['amount_cents']==113,'observation':c})
  ledger.write_text(json.dumps([{**valid,'id':str(i),'amount_cents':n} for i,n in enumerate([9007199254740991,1,-1])]))
  c=run(['node','cli.cjs','report',str(ledger),'2026-09'],root);extras.append({'case':'safe-final-sum-after-intermediate-overflow','passed':c['exit_code']==0 and json.loads(c['stdout'])[0]['total_cents']==9007199254740991,'observation':c})
 source_check=run(['git','diff','--exit-code',receipt['subject']['git_head'],'--','cli.cjs','src','README.md'],root);aggregate_source=run(['git','diff','--exit-code',report['git_commit'],'--','cli.cjs','src','README.md'],root)
 metrics=json.loads(subprocess.check_output(['node',str(out/'stage-c-product-metrics.cjs'),str(root)],text=True))
 row={'mode':mode,'root':str(root),'observation':observation,'primary_result':result,'commands':commands,'immutable_inputs':immutable,'raw_evidence_hashes':raw_checks,'independent_extra_checks':extras,'receipt_exact_reviewer_bytes':base64.b64decode(encoded.split(':',1)[1])==receipt_bytes,'native_reviewer':review['native_terminal'],'reviewed_head_matches_native_base':receipt['subject']['git_head']==review['base_head'],'source_unchanged_since_review':source_check,'source_unchanged_since_aggregate':aggregate_source,'archived_delivery':(root/'.ultra/changes/archive/expense-ledger/delivery.md').is_file() and not (root/'.ultra/changes/active/expense-ledger').exists(),'ledger_completed':all(t['status']=='completed' for t in json.loads((root/'.ultra/tasks.json').read_text())['tasks']),'metrics':metrics}
 archive=out/f'stage-c-product-canonical-{mode}-raw.tar.gz';assert not archive.exists();files=[]
 with tarfile.open(archive,'w:gz') as t:
  for p in sorted(root.rglob('*')):
   if p.is_file() and not p.is_symlink():files.append({'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()});t.add(p,arcname=str(p.relative_to(root)),recursive=False)
 row.update(archive=str(archive.relative_to(repo)),archive_sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),files=files);rows.append(row)
 print(mode,observation['wall_seconds'],metrics['totals'],{'command_exits':[c['exit_code'] for c in commands],'extras':[x['passed'] for x in extras],'raw_hashes':all(x['matches'] for x in raw_checks),'immutable':all(immutable.values()),'source_checks':[source_check['exit_code'],aggregate_source['exit_code']],'archived':row['archived_delivery']})
(out/'stage-c-product-canonical-observation.json').write_text(json.dumps({'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':rows,'limitation':'Root independent product/receipt observation; Ultra Stage C formal Task Review/Test/Deliver and commit are still pending. No performance generalization or Owner-level acceptance.'},indent=2)+'\n')
