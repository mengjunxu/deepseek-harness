"""Remove only built accounting measurement, check the SDK oracle, restore exact bytes."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys

root = Path.cwd()
evidence = root / '.ai/tasks/dsh-p1-usage-measurement/evidence'
target = root / 'packages/llm/token-meter/lib/types/request-records.js'
original = target.read_bytes()
patched, count = re.subn(rb'^[ \t]*\.\.\.usage\.measurement === undefined \? \{\} : \{ measurement: usage\.measurement \},\r?\n', b'', original, flags=re.M)
assert count == 1, count
env = dict(os.environ, PYTHONPATH=str(root / 'python/sdk/src'))
command = [sys.executable, '-m', 'pytest', 'python/sdk/tests/test_intent_routing_snapshot.py', '-vvv', '-k', 'request-usage-measurement']
try:
    target.write_bytes(patched)
    negative = subprocess.run(command, cwd=root, env=env, capture_output=True, text=True, timeout=120)
    output = negative.stdout + negative.stderr
    (evidence / 'negative-sdk.log').write_text(output)
    assert negative.returncode != 0 and 'AssertionError' in output and 'measurement' in output and 'estimated' in output, output
finally:
    target.write_bytes(original)
    assert target.read_bytes() == original
positive = subprocess.run(command, cwd=root, env=env, capture_output=True, text=True, timeout=120)
(evidence / 'restored-sdk.log').write_text(positive.stdout + positive.stderr)
assert positive.returncode == 0, positive.stdout + positive.stderr
(evidence / 'negative-control.json').write_text(json.dumps({'artifact': str(target.relative_to(root)), 'original_sha256': hashlib.sha256(original).hexdigest(), 'negative_exit': negative.returncode, 'restored_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'restored_exit': positive.returncode}, indent=2) + '\n')
print('PASS: missing accounting measurement fails real Python SDK comparison; exact artifact restored and positive case passes')
