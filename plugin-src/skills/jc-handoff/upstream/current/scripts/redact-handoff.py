#!/usr/bin/env python3
import re
import sys


text = sys.stdin.read()

patterns = [
    (
        re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/=-]{16,}"),
        r"\1[已脱敏]",
    ),
    (
        re.compile(r"\b(sk-[A-Za-z0-9_-]{16,})\b"),
        "[已脱敏]",
    ),
    (
        re.compile(r"\b(gh[pousr]_[A-Za-z0-9_]{20,})\b"),
        "[已脱敏]",
    ),
    (
        re.compile(
            r"(?i)\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|AUTH|CREDENTIAL)[A-Z0-9_]*\s*=\s*)([^\s'\"`]+)"
        ),
        r"\1[已脱敏]",
    ),
    (
        re.compile(r"([a-zA-Z][a-zA-Z0-9+.-]*://)([^/\s:@]+):([^@\s/]+)@"),
        r"\1[已脱敏]@",
    ),
]

for pattern, replacement in patterns:
    text = pattern.sub(replacement, text)

sys.stdout.write(text)
