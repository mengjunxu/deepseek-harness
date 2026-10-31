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
@pytest.mark.parametrize('intent', ['chat', 'plan', 'review', 'execute'])
def test_intent_routing_snapshot(tmp_path: Path, intent: str) -> None:
    scenario = ROOT / 'snapshots' / 'sdk' / f'intent-routing-{intent}'
    recording = max(
        scenario.glob('session.v[0-9]*.jsonl'),
        key=lambda path: int(path.name.removeprefix('session.v').removesuffix('.jsonl')),
    )
    replay_patch = tmp_path / 'replay.json'
    replay_patch.write_text(json.dumps([
        {'id': 'llm-deepseek', 'disabled': True},
        {'insert': [{
            'id': 'llm-replay',
            'name': str(ROOT / 'packages' / 'test-support' / 'llm-replay' / 'lib' / 'index.js'),
            'config': {'file': str(recording)},
        }]},
    ]))
    with DeepSeekHarness(
        dsh_bin=str(CLI),
        dsh_home=str(tmp_path / 'home'),
        cwd=str(tmp_path),
        profile='sdk',
        patches=(str(scenario / 'cordis.yml'), str(replay_patch)),
        provider=f'intent-{intent}',
        model=f'{intent}-fixture',
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
    assert actual == json.loads(EXPECTED.read_text())[intent]
