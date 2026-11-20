<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Feature branch lifecycle

- Before deciding whether feature work is ready to integrate, consult the project Master Tasklist and Roadmap to identify the feature, its tasks, the working milestone/version, and any later milestones/versions containing tasks for that feature.
- Treat the feature branch as an ongoing work branch. Commit and push local changes to it incrementally whenever useful to preserve progress, especially before switching branches or pushing changes from another branch.
- Merge the feature branch into `main` and push the updated `main` branch once every task for that feature in the working milestone/version is complete in the Master Tasklist.
- If the Master Tasklist or Roadmap shows tasks for the feature in later milestones/versions, keep the feature branch open after merging the completed working-milestone work. Do not delete it; continue using it for that feature's later work.
- Close or delete the feature branch only after no unfinished tasks remain for that feature across all milestones/versions, unless the user directs otherwise.
