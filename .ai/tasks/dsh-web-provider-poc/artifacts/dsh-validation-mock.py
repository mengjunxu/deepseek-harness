"""Exercise one approval and budget exhaustion over the real built SDK profile."""
import json
from pathlib import Path
import tempfile
from deepseek_harness import DeepSeekHarness

root = Path(__file__).resolve().parents[4]
with tempfile.TemporaryDirectory(prefix='dsh-validation-sdk-') as directory:
    scratch = Path(directory)
    with DeepSeekHarness(
        dsh_bin=str(root / 'apps/cli/lib/bin.js'), dsh_home=str(scratch / 'home'),
        cwd=str(scratch), profile='sdk',
        patches=(str(root / 'snapshots/sdk/web-validation-admission/cordis.yml'),),
        provider='web-validation', model='fixture',
        env={'DSH_TELEMETRY_DISABLED': '1', 'DSH_AGENTS_HOME': str(scratch / 'agents')},
    ) as harness:
        first = harness.run('Reply with exactly VALIDATION_OK.')
        second = harness.run('This second model attempt must be denied by the shared budget.')
    ends = [event['data'] for event in second.events if event['type'] == 'turn/end']
    result = {
        'scope': 'keyless Mock adapter; real built DSH profile and Python SDK',
        'first': {'finishReason': first.finish_reason, 'reply': first.final_response},
        'second': {'finishReason': second.finish_reason, 'reply': second.final_response, 'turnEnd': ends},
    }
    target = root / '.ai/tasks/dsh-web-provider-poc/evidence/dsh-validation-mock.json'
    target.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    assert first.finish_reason == 'completed' and first.final_response == 'VALIDATION_OK'
    assert not second.final_response and 'VALIDATION_ADMISSION_DENIED' in json.dumps(ends)
