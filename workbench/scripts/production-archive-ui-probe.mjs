process.env.NOVA_PROBE_ARCHIVE = '1';
process.env.UI_EVIDENCE_DIR ||= 'docs/verification/production/2026-10-27-workspace-contract/archive-ui';
await import('./workspace-contract-probe.mjs');
