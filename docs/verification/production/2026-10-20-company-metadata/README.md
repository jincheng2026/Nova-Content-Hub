# Company metadata source correction

Scope: source configuration only, based on 0.3.29 source and the user supplied global packaging requirements. No version change, build, packaging, installation, app launch, library change, commit, or change to AGENTS.md was performed for this correction. The installed/frozen 0.3.29 application was not modified.

## Change and field sources

- `workbench/scripts/dist.mjs:installerConfig` now supplies top-level `copyright: '© 2026 杭州新岛橙灵智能科技有限责任公司'` and `extraMetadata.author: {name: '杭州新岛橙灵智能科技有限责任公司'}`. This is the single native/shared configuration source; `universalInstallerConfig` inherits both unchanged.
- Installed and locked electron-builder and app-builder-lib are 26.15.3. `AppInfo.companyName` reads `metadata.author.name`; `AppInfo.copyright` reads explicit `config.copyright`. Builder normalizes package metadata before merging `extraMetadata`, so replacing the old author string with another string would still leave `companyName` undefined. The object is required. `legacy-author-check.log` confirms the difference against the pinned AppInfo.
- Pinned Mac packager writes `appInfo.copyright` to `NSHumanReadableCopyright`; version stays derived from AppInfo and the existing release version. Windows packager writes `LegalCopyright` from `appInfo.copyright` and `CompanyName` from `appInfo.companyName`. This confirms source mapping, not produced binary resources.
- Existing application menu uses Electron `role: 'about'` on both platforms, without `setAboutPanelOptions`. The installed Electron 44.9.0 declarations state that setting About options overrides the values defined in the macOS `.plist`. Therefore no custom Mac About code was added. Windows About panel display has not been established by this check; PE version-resource mapping is the confirmed Windows scope.
- Name suffixes, existing `.icns`/`.ico` paths, app IDs, version source, artifact name and output paths are unchanged. Size and modification time remain operating-system observations, with no hardcoded substitutes.

Exact installed dependency source excerpts are preserved in `pinned-source.txt`.

## Red and green verification

1. Added the metadata/identity regression test first and ran `node --test --test-name-pattern='all installer channels and universal builds preserve company' workbench/test/distribution.test.mjs`. Exit 1: expected copyright line was missing (`undefined`). See `red.log`.
2. Applied only the shared copyright and author corrections.
3. Ran `node --test workbench/test/distribution.test.mjs workbench/test/distribution-integrity.test.mjs workbench/test/native-payload.test.mjs`. Exit 0: 23 passed, 0 failed, 0 skipped. See `green.log`.
4. New regression test checks local/testing/preview/production × darwin arm64/x64 and win32 arm64/x64, plus the actual Universal configuration function. Each of 17 configurations passes the pinned builder schema and real AppInfo checks for company, copyright, version, product name and existing icon paths. Production configuration validation does not bypass the existing production release gate.
5. `git diff --check` passed.

## Acceptance boundary

No full suite, new installer or final `.app` was produced. Finder name/icon/version/copyright/size/mtime, native macOS About appearance, Windows file properties and Windows About remain final frozen artifact/system acceptance work. These source tests do not establish production readiness or an update to the frozen installed 0.3.29 application.

## Primary review

The primary agent inspected the actual two-field source diff, pinned dependency excerpts, all 17 metadata configurations, and the updated project-wide requirements. Independently reran the same three distribution test files: 23 passed, 0 failed, 0 skipped (root-green.log). Final artifact and target-system acceptance remain pending; no installed-package claim follows from this source correction.
