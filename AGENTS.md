# Instructions for AI contributors

Read `UX_IMPROVEMENT_PLAN.md` and `DESIGN.md` before planning or implementing UI, customer-flow, or staff-workflow changes in this project.

- Build mobile first. Preserve the existing cream, navy, and burgundy restaurant identity.
- Use the prioritized backlog and acceptance criteria in `UX_IMPROVEMENT_PLAN.md` for relevant work. Verify each finding against the current code before acting; the review is a dated snapshot.
- An open backlog item is guidance, not authorization to implement unrelated changes. Complete the user's requested scope and preserve their existing work.
- Preserve public menu and price browsing. Require authentication for ordering. Keep permissions enforced by the server; hiding a control is not authorization.
- Preserve checkout duplicate-order recovery, role-limited transitions, version checks, rejection reasons, and customer-contact privacy.
- Keep demo payment and delivery descriptions accurate. Do not invent operational promises, restaurant details, ratings, or payment integrations.
- Use semantic tokens with explicit success, error, disabled, and secondary states. Respect reduced motion and keyboard access.
- Verify changes in proportion to risk. For behavior changes, run relevant existing tests and add regression coverage for meaningful failure paths. For UI changes, inspect mobile and desktop where browser access is available and report unverified checks.
- Update the plan's item status only after its acceptance criteria are verified. Record evidence and any remaining limitations; never mark work complete solely because code was written.
- Distinguish local completion from deployment. Do not claim Render or Supabase has been updated without verifying the requested deployment or database change.

