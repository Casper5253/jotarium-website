# jotarium.com

Static landing page for [Jotarium](https://jotarium.com), served by GitHub Pages. No build step: edit the HTML and CSS and push to `main`.

## Release day

The download section comes from `scripts/set-release.mjs`. Put the installers and their `SHA256SUMS.txt` in one folder, then run:

	node scripts/set-release.mjs 1.0.0 ../release-assets/1.0.0-rc/SHA256SUMS.txt

The script reads each file size from disk, checks every installer against its SHA-256, and writes the version, sizes, checksums and GitHub release links into `index.html`. To go back to the 27 November state:

	node scripts/set-release.mjs --prerelease
