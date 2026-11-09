# Static deployment

The public demo is [the existing EKG Lab site](https://ekg-first-principles-lab.zhuou557737.chatgpt.site). Creating this source release does not change that deployment, its URL, or its audience. No GitHub Pages deployment is configured.

## Deployable directory

1. Install the locked development tools with `npm ci`.
2. Restore the pinned runtime bundle with `npm run setup:assets` (or its `--archive` option).
3. Run `npm test` and `npm run assets:verify`.
4. Publish the **contents of `dist/`** to a static HTTP(S) host.

There is no production compilation command, server-side code, database, environment variable, or secret required by this app. Do not publish the project root: research scripts, release metadata, and developer files do not belong in the website document root.

## Hosting requirements

Serve HTML as `text/html`, JavaScript modules as JavaScript, CSS as `text/css`, JSON as `application/json`, GLB as `model/gltf-binary`, and binary `.u8` / `.f32` files as binary data. Serve `.woff2`, PNG/JPEG, and SVG with their ordinary MIME types. Keep case-sensitive filenames and relative paths unchanged.

The app loads local models and data from the same origin. Release archives are downloaded during setup and extracted into those paths; the browser does not stream from GitHub release URLs. Current runtime loaders fetch complete JSON/GLB/binary resources. No range-dependent media player, external decoder download, service worker, or WebAssembly loader is required by the released application. Standard HTTP compression for text is useful, but do not serve a ZIP file in place of a JSON or binary response.

Navigation uses URL fragments. A normal static file server can serve the app without an application routing fallback. Module 1 has a nested `cardiac-voltage/index.html` document and must retain that relative directory. Use the root or a directory URL ending in `/`; the directory form makes relative imports resolve consistently.

Static assets can be cached, but releases reuse filenames. Use a versioned deploy directory or invalidate cached HTML and changed assets together. Do not cache HTML error pages as model files. Check response status and content type when troubleshooting loading failures.

## Deployment verification

Open the deployed directory URL, navigate across modules, exercise the optical and fitted views, and check for missing requests and console errors. Verify at least one GLB, one binary optical movie, a clinical recording, and a fitted case against the manifest bytes. Inspect desktop and narrow layouts. A successful static upload alone does not demonstrate that large assets arrived.

GitHub's source repository and the existing hosted demo are separate systems. Publishing a Git commit or a release here does not redeploy the demo. Follow [maintenance](MAINTENANCE.md) to synchronize intentionally.
