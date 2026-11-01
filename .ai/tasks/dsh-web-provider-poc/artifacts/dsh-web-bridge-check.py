"""Drive the real built SDK profile through the bridge adapter: mock completion with
budget denial, then a rejected submission. Both runs use the isolated-home admission,
disable every local tool row, and assert the worker evidence file alongside the
session logs. No real browser request happens in this script."""
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


def write_patch(path: Path, scenario: str, evidence_path: Path) -> Path:
    rows = [
        '- id: llm-deepseek', '  disabled: true',
        '- id: session-persistence-jsonl', '  config:',
        "    root: !!js dshHomePath('sessions')", '    compression: none',
    ]
    rows.extend(f'- id: {row}\n  disabled: true' for row in TOOL_ROWS)
    config = {
        'scenario': scenario,
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
    # The patch lives beside the worker so the loader resolves the fixture through the
    # stable relative path; per-run scratch dirs stay disposable.
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
result = {'scope': 'keyless mock bridge through the real built DSH sdk profile and admission'}

with tempfile.TemporaryDirectory(prefix='dsh-web-bridge-a-') as directory:
    scratch = Path(directory)
    evidence_path = evidence_dir / 'bridge-mock-complete.ndjson'
    evidence_path.write_text('')
    patch = write_patch(artifacts / 'bridge-runtime.cordis.yml', 'mock-complete', evidence_path)
    with DeepSeekHarness(
        dsh_bin=str(root / 'apps/cli/lib/bin.js'), dsh_home=str(scratch / 'home'),
        cwd=str(scratch), profile='sdk', patches=(str(patch),),
        provider='chatgpt_web_unofficial', model='gpt-5.6-sol',
        env={'DSH_TELEMETRY_DISABLED': '1', 'DSH_AGENTS_HOME': str(scratch / 'agents')},
    ) as harness:
        first = harness.run(prompt)
        second = harness.run('This second model attempt must be denied by the consumed budget.')
    second_ends = [event['data'] for event in second.events if event['type'] == 'turn/end']
    headers = session_headers(scratch / 'home' / 'sessions')
    records = worker_records(evidence_path)
    started = next((record for record in records if record.get('kind') == 'started'), None)
    exit_record = records[-1] if records else None
    result['completion'] = {
        'prompt': prompt,
        'finishReason': first.finish_reason,
        'reply': first.final_response,
        'secondFinishReason': second.finish_reason,
        'secondTurnEnd': second_ends,
        'requestHeaders': [
            {'provider': header.get('config', {}).get('provider'),
             'model': header.get('config', {}).get('model'),
             'tools': [tool.get('name') for tool in header.get('tools', [])]}
            for header in headers
        ],
        'workerStarted': None if started is None else started.get('request'),
        'workerExit': exit_record,
    }
    assert first.finish_reason == 'completed', result['completion']
    assert first.final_response == prompt, result['completion']
    assert second.finish_reason == 'error' and not second.final_response, result['completion']
    assert 'VALIDATION_ADMISSION_DENIED' in json.dumps(second_ends), result['completion']
    assert len(headers) == 1, result['completion']
    assert headers[0]['config']['provider'] == 'chatgpt_web_unofficial', result['completion']
    assert headers[0]['config']['model'] == 'gpt-5.6-sol', result['completion']
    assert not headers[0].get('tools'), result['completion']
    assert started is not None and started['request']['prompt'] == prompt, result['completion']
    assert started['request']['userAgent'].startswith('deepseek-harness/'), result['completion']
    assert exit_record is not None and exit_record.get('kind') == 'exit' and exit_record.get('failure') is None \
        and exit_record.get('aborted') is False and exit_record.get('activeTurns') == 0, result['completion']

with tempfile.TemporaryDirectory(prefix='dsh-web-bridge-b-') as directory:
    scratch = Path(directory)
    evidence_path = evidence_dir / 'bridge-mock-rejected.ndjson'
    evidence_path.write_text('')
    patch = write_patch(artifacts / 'bridge-runtime.cordis.yml', 'mock-rejected', evidence_path)
    with DeepSeekHarness(
        dsh_bin=str(root / 'apps/cli/lib/bin.js'), dsh_home=str(scratch / 'home'),
        cwd=str(scratch), profile='sdk', patches=(str(patch),),
        provider='chatgpt_web_unofficial', model='gpt-5.6-sol',
        env={'DSH_TELEMETRY_DISABLED': '1', 'DSH_AGENTS_HOME': str(scratch / 'agents')},
    ) as harness:
        rejected = harness.run('This submission must be rejected by the mock bridge.')
    rejected_ends = [event['data'] for event in rejected.events if event['type'] == 'turn/end']
    records = worker_records(evidence_path)
    error_events = [record for record in records if record.get('kind') == 'event' and record.get('type') == 'error']
    exit_record = records[-1] if records else None
    result['rejected'] = {
        'finishReason': rejected.finish_reason,
        'turnEnd': rejected_ends,
        'workerErrorEvents': error_events,
        'workerExit': exit_record,
    }
    assert rejected.finish_reason == 'error' and not rejected.final_response, result['rejected']
    assert 'Mock bridge preflight rejection' in json.dumps(rejected_ends), result['rejected']
    assert 'invalid_request' in json.dumps(rejected_ends), result['rejected']
    assert len(error_events) == 1 and error_events[0].get('status') == 400, result['rejected']
    assert exit_record is not None and exit_record.get('kind') == 'exit' and exit_record.get('failure') is None \
        and exit_record.get('activeTurns') == 0, result['rejected']

target = evidence_dir / 'dsh-web-bridge-mock.json'
target.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
