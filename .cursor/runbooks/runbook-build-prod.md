# runbook-build-prod

## Goal
Merge the latest `dev` branch into `main` without shipping developer tooling, then create the production-ready build on `main` as defined by the root `README.md`.

## Inputs
- Repository root for Prism / LocalAI.
- Names of the development and release branches; default to `dev` and `main`.
- Intended release version, if the release should bump semver.
- Whether the operator wants only a local release commit/tag or also wants to push to `origin`.

## Preconditions
- The root `README.md` is the source of truth for the production release flow.
- `main` holds tagged, released versions only; active development happens on `dev`.
- A release is a merge of `dev` into `main` with a matching `CHANGELOG.md` entry and semver tag.
- The production build is the root `npm run build` script, which builds shared packages, config, API, and web.
- Developer-only tooling must not ship on `main`. Treat debug-tool surfaces, seed endpoints, and build-time debug flags as production blockers.

## Execution Steps
1. Inspect the current repository state.
   - Expected result: current branch, dirty files, and upstream status are known before changing branches.
2. Fetch remote branch tips.
   - Expected result: local `origin/dev` and `origin/main` are current.
3. Check branch divergence between `main` and `dev`.
   - Expected result: commits unique to each branch are visible.
4. Inspect any `main`-only commits before merging.
   - Expected result: production-only changes, especially tooling removal, are identified and preserved.
5. Check out `main`.
   - Expected result: working tree is on `main`.
6. Merge `dev` into `main`.
   - Expected result: merge completes, or conflicts are isolated to files that need release decisions.
7. Resolve conflicts in favor of production behavior.
   - Expected result: app feature changes from `dev` are kept, while developer tooling surfaces, seed endpoints, and debug flags are removed from `main`.
8. Search the merged tree for developer tooling leftovers.
   - Expected result: no production-blocking references remain, such as `NEXT_PUBLIC_DEV_TOOLS`, developer tools UI, dev seed routes, or bounded debug delete routes.
9. Update release metadata when this is a new release.
   - Expected result: package versions, lockfiles, `CHANGELOG.md`, and the root `README.md` current-release line match the intended semver.
10. Run the production build from the repository root.
    - Expected result: `npm run build` succeeds.
11. Run focused tests for changed behavior.
    - Expected result: API unit tests pass when API, memory, provider, routing, or data behavior changed.
12. Commit the merge/release on `main`.
    - Expected result: `main` has a release commit that includes the merge, production-tooling cleanup resolution, and release metadata.
13. Create the matching local semver tag.
    - Expected result: tag `v<version>` points at the release commit.
14. Push only when explicitly requested.
    - Expected result: local release state is ready; remote state is unchanged unless the operator approved pushing.

## Decision Points
- If the working tree is dirty: identify whether changes belong to the release. Commit, stash, or stop before switching branches; never discard unowned work.
- If `main` has commits not in `dev`: inspect them and preserve production-only release hardening during conflict resolution.
- If the merge reintroduces developer tooling: remove it before building.
- If the production build fails: fix the failure on `main`, then rerun the build.
- If tests fail: fix the failing behavior or report the blocker before tagging.
- If the release version is unclear: stop and ask for the intended semver before updating metadata.

## Error Handling
- Missing input: ask for the missing branch name, version, or push policy.
- Merge conflict: resolve only after understanding both sides; keep production hardening from `main` and feature work from `dev` where compatible.
- Tooling leak: remove the leak and rerun the search before proceeding.
- Build failure: inspect the first actionable compiler/runtime error, patch it, and rerun `npm run build`.
- Test failure: inspect the failing test names and assertions, patch the smallest relevant behavior, then rerun the focused suite.
- Unknown state: stop after reporting branch, status, and the safest next action.

## Output Contract
- Report the final branch and release commit hash.
- Report the local tag created, if any.
- Report whether remote was pushed.
- Include validation results for `npm run build` and focused tests.
- Call out any remaining warning that does not block the release.

## Completion Criteria
- `main` contains the latest desired `dev` work.
- Developer-only tooling is absent from production code paths.
- Root `npm run build` passes on `main`.
- Focused tests pass for changed functional surfaces.
- Release metadata and local tag match the intended semver.

## Handoff Notes
- Do not push by default; require an explicit push request.
- If the root `README.md` changes its branch model or production build command, update this runbook before the next release.
- For this repo, a Next.js workspace-root warning may appear during build because multiple lockfiles exist; treat it as non-blocking when the build exits successfully.

