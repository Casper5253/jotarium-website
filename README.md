# jotarium.com

Static landing page for [Jotarium](https://jotarium.com), served by GitHub Pages. No build step: edit the HTML and CSS and push to `main`.

## Release day

1. Publish the three installers and `SHA256SUMS.txt` to the GitHub release.
2. Put the same files and sums in one folder, then run `node scripts/set-release.mjs 1.0.0 <folder>/SHA256SUMS.txt`.
3. The script checks each local hash, downloads every download URL it is about to link, and checks its HTTP status and SHA-256 against the sums. A failure stops the switch and writes nothing.
4. On success the script writes `index.html` and `version.json` together. Commit both in one change.
5. `node scripts/set-release.mjs --prerelease` returns the page to 27 November and leaves `version.json` alone.

`--skip-remote-check` exists for offline tests only. Never use it for a real switch.

## Tests

	node --test tests/set-release.test.mjs
