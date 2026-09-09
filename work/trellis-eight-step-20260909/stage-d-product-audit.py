"""Observe finished native trials; preserve original failures and bytes, no model steering."""
import pathlib, json, hashlib, subprocess, base64, tarfile, datetime, re
repo = pathlib.Path.cwd()
out = repo / 'work/trellis-eight-step-20260909'
def sha(b): return hashlib.sha256(b).hexdigest()
def read(file): return json.loads(file.read_text()) if file.is_file() else None
def command(args, cwd):
    p = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=90)
    return {'command': args, 'exit_code': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr}
for location in map(json.loads, (out/'stage-d-product-attempts.jsonl').read_text().splitlines()):
    root = pathlib.Path(location['root'])
    observed = read(root/'probe/observation.json')
    key = f"{location['shape']}-r{location['repeat']}-{location['mode']}-{root.name.split('-')[-1]}"
    record = out/f'stage-d-product-{key}-audit.json'
    if not observed or record.exists():
        continue
    task = 'expense-ledger' if location['shape'] == 'expense' else 'tree-manifest'
    fixture = 'product-fixture' if task == 'expense-ledger' else 'product-manifest-fixture'
    canonical = 'product-canonical-fixture' if task == 'expense-ledger' else 'product-manifest-canonical-fixture'
    evidence_path = root/f'.ultra/evidence/{task}/evidence.json'
    evidence = read(evidence_path)
    report = read(root/'.ultra/test-report.json')
    receipts = [read(p) for p in (root/'.ultra/.runtime/delegations').glob('*/result.json')]
    row = {'location': location, 'observation': observed, 'primary_result': read(root/'probe/result.json'), 'commands': [],
        'immutable_inputs': {rel: (root/rel).read_bytes() == (out/f/rel).read_bytes() for rel,f in [('GOAL.md',fixture),('acceptance.cjs',fixture),('.ultra/decisions/experiment.md',canonical),('.ultra/north-star.md',canonical)]},
        'raw_evidence_hashes': [], 'task_evidence_present': evidence is not None, 'task_review': None,
        'archived_delivery': (root/f'.ultra/changes/archive/{task}/delivery.md').is_file() and not (root/f'.ultra/changes/active/{task}').exists(),
        'ledger_completed': all(t['status'] == 'completed' for t in read(root/'.ultra/tasks.json')['tasks']),
        'actual_delegate_results': receipts, 'human_interventions_after_prompt': 0}
    row['commands'].append(command(['node','acceptance.cjs'], root))
    if task == 'expense-ledger':
        row['commands'].append(command(['node',str(out/'stage-c-product-supplement.cjs'),str(root)], root))
    if evidence:
        row['commands'].append(command(['node',str(repo/'skills/ultra-plan/scripts/validate_task_evidence.cjs'),str(evidence_path),'--projection'],root))
        for criterion in evidence['acceptance']:
            e = criterion['evidence']
            if 'raw_evidence_ref' in e:
                f = root/e['raw_evidence_ref']
                row['raw_evidence_hashes'].append({'id': criterion['criterion_id'], 'ref': e['raw_evidence_ref'], 'matches': f.is_file() and sha(f.read_bytes()) == e['raw_evidence_sha256']})
        ref = evidence.get('task_review',{}).get('receipt_ref')
        if ref and (root/ref).is_file():
            raw = (root/ref).read_bytes(); receipt = json.loads(raw); origins = []
            for result in receipts:
                for e in result.get('evidence',[]):
                    if not isinstance(e,str): continue
                    for encoded in re.findall(r'(?:base64\s*[:=]\s*)([A-Za-z0-9+/=]+)',e,re.I):
                        try:
                            if base64.b64decode(encoded) == raw: origins.append(result)
                        except ValueError: pass
            row['task_review'] = {'ref': ref, 'receipt': receipt, 'exact_native_origins': [x.get('delegation_id') for x in origins],
                'native_base_matches': bool(origins) and all(x['base_head'] == receipt['subject']['git_head'] for x in origins),
                'native_terminal': [x.get('native_terminal') for x in origins],
                'source_unchanged': command(['git','diff','--exit-code',receipt['subject']['git_head'],'--','cli.cjs','src','README.md'],root)}
    summary_ref = (report or {}).get('review',{}).get('summary_ref')
    if summary_ref:
        row['commands'].append(command(['node',str(repo/'skills/ultra-test/scripts/validate_review_transport.cjs'),'--summary',str(root/summary_ref),'--report',str(root/'.ultra/test-report.json')],root))
        row['aggregate_source_unchanged'] = command(['git','diff','--exit-code',report['git_commit'],'--','cli.cjs','src','README.md'],root)
    row['metrics'] = json.loads(subprocess.check_output(['node',str(out/'stage-c-product-metrics.cjs'),str(root)],text=True))
    archive = out/f'stage-d-product-{key}-raw.tar.gz'
    assert not archive.exists(), f'Unindexed archive must be reconciled: {archive}'
    files = []
    with tarfile.open(archive,'w:gz') as tar:
        for file in sorted(root.rglob('*')):
            if file.is_file() and not file.is_symlink():
                files.append({'path':str(file.relative_to(root)),'sha256':sha(file.read_bytes())})
                tar.add(file,arcname=str(file.relative_to(root)),recursive=False)
    row.update(archive=str(archive.relative_to(repo)),archive_sha256=sha(archive.read_bytes()),files=files,
        observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        limitation='Mechanical observations and bounded Root checks; no semantic acceptance or performance generalization. Failed or incomplete runs remain in the fixed experiment denominator.')
    record.write_text(json.dumps(row,indent=2)+'\n')
    print(json.dumps({'run':key,'archived':row['archived_delivery'],'commands':[x['exit_code'] for x in row['commands']], 'native_review_origin':(row['task_review'] or {}).get('exact_native_origins'), 'wall_seconds':observed['wall_seconds'],'metrics':row['metrics']['totals']}))
