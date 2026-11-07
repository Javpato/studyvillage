# Workspace cleanup

- After changes, remove obsolete generated builds, superseded release packages, stale bundled assets, and temporary test output created during the task.
- Keep the current working build. Do not accumulate old release versions in `deliverables/`.
- Preserve source code, reference materials, dependencies, and user data. Do not treat them as disposable build output.

# Verification checkpoints

- Commit each stable change separately.
- Push a testable candidate to the existing branch before lengthy verification so the owner can test it in GitHub while local checks continue.
- Before long checks or a usage-limit interruption, save the candidate commit, workflow links, completed checks and remaining work in `docs/VERIFICATION.md` so the next session can resume.
- Distinguish a pushed candidate from a verified and published release.
