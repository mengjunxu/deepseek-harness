"""Project explicit intent routing through the Python SDK and the real sdk profile."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from deepseek_harness import DeepSeekHarness

ROOT = Path(__file__).resolve().parents[3]
CLI = ROOT / 'apps' / 'cli' / 'lib' / 'bin.js'
EXPECTED = ROOT / 'scripts' / 'snapshots' / 'python-sdk-single-exe' / 'intent-routing' / 'routes.json'


@pytest.mark.skipif(sys.platform == 'win32', reason='uses the POSIX shebang of the built dsh CLI')
@pytest.mark.skipif(not CLI.exists(), reason='requires the built dsh profile runtime')
@pytest.mark.parametrize('intent', ['chat', 'plan', 'review', 'execute', 'structured-output', 'request-accounting', 'request-preparation-failed', 'request-usage-measurement'])
def test_intent_routing_snapshot(tmp_path: Path, intent: str) -> None:
    accounting_case = intent in ('request-accounting', 'request-preparation-failed', 'request-usage-measurement')
    scenario_name = ('model-structured-output' if intent == 'structured-output' else
                     intent if accounting_case else f'intent-routing-{intent}')
    route_intent = 'chat' if intent == 'structured-output' or accounting_case else intent
    scenario = ROOT / 'snapshots' / 'sdk' / scenario_name
    recording = max(
        scenario.glob('session.v[0-9]*.jsonl'),
        key=lambda path: int(path.name.removeprefix('session.v').removesuffix('.jsonl')),
    )
    if accounting_case:
        recording = scenario / 'session.v3.jsonl'
    replay_patch = tmp_path / 'replay.json'
    replay_config = {'file': str(recording)}
    if intent == 'request-usage-measurement':
        replay_config['overrideFile'] = str(scenario / 'replay.override.json')
    if accounting_case:
        replay_config['providers'] = [{
            'id': 'intent-chat',
            'policy': {'usageSource': 'local', 'capabilities': {'tools': 'supported'}},
            'models': [{'id': 'chat-fixture', 'toolSupport': 'supported', 'contextWindow': 262144}],
        }]
    replay_patch.write_text(json.dumps([
        {'id': 'llm-deepseek', 'disabled': True},
        {'insert': [{
            'id': 'llm-replay',
            'name': str(ROOT / 'packages' / 'test-support' / 'llm-replay' / 'lib' / 'index.js'),
            'config': replay_config,
        }]},
    ]))
    patches = (str(scenario / 'cordis.yml'),)
    if accounting_case:
        patches += (str(scenario / 'cordis.snapshot.yml'),)
    patches += (str(replay_patch),)
    with DeepSeekHarness(
        dsh_bin=str(CLI),
        dsh_home=str(tmp_path / 'home'),
        cwd=str(tmp_path),
        profile='sdk',
        patches=patches,
        provider=f'intent-{route_intent}',
        model=f'{route_intent}-fixture',
        env={
            'DSH_TELEMETRY_DISABLED': '1',
            'DSH_SNAPSHOT': 'replay',
            'DSH_SNAPSHOT_FILE': str(recording),
            'DSH_AGENTS_HOME': str(tmp_path / 'agents'),
        },
    ) as harness:
        result = harness.run('Reply with exactly INTENT_OK.')
    assert result.finish_reason == 'completed', next(event['data']['reason'] for event in reversed(result.events) if event['type'] == 'turn/end')
    header = next(event for event in result.events if event['type'] == 'request/header')
    actual = {
        'config': header['data']['header']['config'],
        'final_response': result.final_response,
        'finish_reason': result.finish_reason,
    }
    if accounting_case:
        actual['accounting'] = [event['data'] for event in result.events if event['type'] == 'llm/request-accounting']
        assert len(actual['accounting']) == 1
    if intent == 'request-preparation-failed':
        actual['preparation'] = [event['data'] for event in result.events if event['type'] == 'llm/preparation-failed']
        assert len(actual['preparation']) == 1
    assert actual == json.loads(EXPECTED.read_text())[intent]
