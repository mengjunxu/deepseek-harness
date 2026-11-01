"""One real browser request through the built SDK profile and the bridge adapter,
inside the approved isolated PoC admission (scenario=real, maxCalls=1). Exactly one
harness.run call happens; a denied or failed turn is reported, never retried."""
import json
from pathlib import Path
import tempfile
import uuid

from deepseek_harness import DeepSeekHarness

root = Path(__file__).resolve().parents[4]
artifacts = Path(__file__).resolve().parent
evidence_dir = artifacts.parent / 'evidence'
bridge_fixture = '../../../../packages/llm/llm/tests/fixtures/web-bridge.ts'
worker = artifacts / 'web-validation-worker.ts'
wrapper = root / '.artifacts/cgw-cli.py'

TOOL_ROWS = [
    'tool-bash', 'tool-pwsh', 'tool-jobs', 'tool-fs', 'tool-fs-search', 'tool-skill',
    'tool-subagent-control', 'tool-subagent-list-agents', 'tool-subagent',
    'tool-subagent-fork', 'tool-workflow', 'tool-todo', 'tool-goal', 'tool-web',
    'tool-ralph', 'plan-mode',
]


def write_patch(path: Path, evidence_path: Path) -> Path:
    rows = [
        '- id: llm-deepseek', '  disabled: true',
        '- id: session-persistence-jsonl', '  config:',
        "    root: !!js dshHomePath('sessions')", '    compression: none',
    ]
    rows.extend(f'- id: {row}\n  disabled: true' for row in TOOL_ROWS)
    config = {
        'scenario': 'real',
        'command': ['python3', str(wrapper), '--probe', str(worker)],
        'model': 'gpt-5.6-sol', 'maxCalls': 1, 'expiryMinutes': 10,
        'evidencePath': str(evidence_path),
    }
    rows.extend([
        '- insert:',
        '    - id: web-validation-bridge',
        f"      name: '{bridge_fixture}'",
        f'      config: {json.dumps(config)}',
    ])
    path.write_text('\n'.join(rows) + '\n')
    return path


def session_headers(sessions_root: Path) -> list[dict]:
    headers = []
    for log in sorted(sessions_root.rglob('*.jsonl')):
        for line in log.read_text().splitlines():
            record = json.loads(line)
            if record.get('type') == 'request/header':
                headers.append(record['data']['header'])
    return headers


def worker_records(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


marker = f'DSHWEBBRIDGE{uuid.uuid4().hex[:12].upper()}'
prompt = f'Reply with exactly {marker}.'
result = {'scope': 'one real browser request through the DSH bridge admission; no retry'}

with tempfile.TemporaryDirectory(prefix='dsh-web-real-') as directory:
    scratch = Path(directory)
    evidence_path = evidence_dir / 'dsh-web-real.ndjson'
    evidence_path.write_text('')
    patch = write_patch(artifacts / 'bridge-runtime.cordis.yml', evidence_path)
    with DeepSeekHarness(
        dsh_bin=str(root / 'apps/cli/lib/bin.js'), dsh_home=str(scratch / 'home'),
        cwd=str(scratch), profile='sdk', patches=(str(patch),),
        provider='chatgpt_web_unofficial', model='gpt-5.6-sol',
        env={'DSH_TELEMETRY_DISABLED': '1', 'DSH_AGENTS_HOME': str(scratch / 'agents')},
    ) as harness:
        run = harness.run(prompt)
    ends = [event['data'] for event in run.events if event['type'] == 'turn/end']
    headers = session_headers(scratch / 'home' / 'sessions')
    records = worker_records(evidence_path)
    started = next((record for record in records if record.get('kind') == 'started'), None)
    status = next((record for record in records if record.get('kind') == 'status'), None)
    wire = next((record for record in records if record.get('kind') == 'wire'), None)
    usage_events = [record for record in records
                    if record.get('kind') == 'event' and record.get('type') == 'done' and record.get('usage')]
    exit_record = records[-1] if records else None
    result['real'] = {
        'prompt': prompt,
        'finishReason': run.finish_reason,
        'reply': run.final_response,
        'exactMarker': run.final_response == marker,
        'turnEnd': ends,
        'requestHeaders': [
            {'provider': header.get('config', {}).get('provider'),
             'model': header.get('config', {}).get('model'),
             'tools': [tool.get('name') for tool in header.get('tools', [])]}
            for header in headers
        ],
        'workerStarted': None if started is None else started.get('request'),
        'httpStatus': None if status is None else status.get('httpStatus'),
        'wireTypes': None if wire is None else wire.get('types'),
        'wireStatuses': None if wire is None else wire.get('statuses'),
        'usage': usage_events[0].get('usage') if usage_events else None,
        'workerExit': exit_record,
    }
    assert run.finish_reason == 'completed', result['real']
    assert run.final_response == marker, result['real']
    assert len(headers) == 1, result['real']
    assert headers[0]['config']['provider'] == 'chatgpt_web_unofficial', result['real']
    assert headers[0]['config']['model'] == 'gpt-5.6-sol', result['real']
    assert not headers[0].get('tools'), result['real']
    assert started is not None and started['request']['prompt'] == prompt, result['real']
    assert started['request']['userAgent'].startswith('deepseek-harness/'), result['real']
    assert status is not None and status['httpStatus'] == 200, result['real']
    assert wire is not None and 'response.completed' in (wire.get('types') or []), result['real']
    assert exit_record is not None and exit_record.get('kind') == 'exit' and exit_record.get('failure') is None \
        and exit_record.get('aborted') is False and exit_record.get('activeTurns') == 0, result['real']

target = evidence_dir / 'dsh-web-real-request.json'
target.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
