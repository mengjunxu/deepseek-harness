"""Verify Web admission through the shipped SDK profile without sending a model request."""
import json
from pathlib import Path
import tempfile

from deepseek_harness import DeepSeekHarness

root = Path(__file__).resolve().parents[4]
output = root / '.ai/tasks/dsh-web-provider-poc/evidence/dsh-gated.json'
with tempfile.TemporaryDirectory(prefix='dsh-web-admission-') as directory:
    scratch = Path(directory)
    patch = scratch / 'web-gated.json'
    patch.write_text(json.dumps([
        {'id': 'llm-deepseek', 'disabled': True},
        {'id': 'llm-pi-ai', 'config': {'providers': {'web-poc': {
            'api': 'openai-responses', 'baseURL': 'http://127.0.0.1:9/v1',
            'models': [{'id': 'chatgpt-web/gpt-5.6-sol'}],
            'policy': {
                'usageSource': 'chatgpt_web_unofficial', 'availability': 'gated',
                'gateReason': 'Controlled DSH Web validation admission has not been granted',
                'capabilities': {'tools': 'unsupported'},
            },
        }}}},
    ]))
    with DeepSeekHarness(
        dsh_bin=str(root / 'apps/cli/lib/bin.js'), dsh_home=str(scratch / 'home'),
        cwd=str(scratch), profile='sdk', patches=(str(patch),),
        provider='web-poc', model='chatgpt-web/gpt-5.6-sol',
        env={'DSH_TELEMETRY_DISABLED': '1', 'DSH_AGENTS_HOME': str(scratch / 'agents')},
    ) as harness:
        result = harness.run('This synthetic gated probe must not reach a model.')
    endings = [event['data'] for event in result.events if event['type'] == 'turn/end']
    headers = [event['data'] for event in result.events if event['type'] == 'request/header']
    summary = {
        'evidenceClass': 'real DSH SDK profile admission rejection; no browser or model dispatch',
        'provider': 'web-poc', 'usageSource': 'chatgpt_web_unofficial',
        'model': 'chatgpt-web/gpt-5.6-sol', 'finishReason': result.finish_reason,
        'finalResponse': result.final_response, 'requestHeaders': headers, 'turnEnd': endings,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, ensure_ascii=False))
    assert not headers, 'Gated route must not admit request metadata'
    assert not result.final_response, 'Gated route must not produce a model response'
    assert 'PROVIDER_UNAVAILABLE' in json.dumps(endings), 'Expected policy admission rejection'
