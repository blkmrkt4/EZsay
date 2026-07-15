---
name: verify
description: How to build, launch, and drive EzSay locally to verify changes end-to-end in the /w workspace.
---

# Verifying EzSay changes

## Build / launch

- `npx tsc --noEmit` and `npm run build` for static checks (strict TS).
- `npm run dev` → http://localhost:3000 (ready in <1s). Uses `.env.local`.
- **The local dev server shares the PRODUCTION Supabase database** (single project for dev+prod). Anything you resolve, dismiss, or edit mutates real rows. Use a designated test document (e.g. "Intelligence Essay Calum 1"), never a user's real essay.
- A dev session is already authenticated in the browser; `DEV_BYPASS_AUTH=false` in `.env.local` and login still works via the existing session cookie.

## Driving the /w workspace (Claude in Chrome)

- Navigate to `http://localhost:3000/w`, click a document in the Library panel to load it.
- **Opening a doc with open flags that lack options auto-starts the suggestion generation loop (real OpenRouter spend).** Keep the doc open only as long as needed.
- **Scans cost LLM tokens** except Writing Quality + AI Artifacts, which are computed without LLM calls. For a free `hasScanned` state: Scan → uncheck AI Detection, Plagiarism, Citations, Tone, Spelling, Grammar → keep Writing Quality + AI Artifacts → Run Scan (returns in seconds). NOTE: a re-scan replaces prior AI-detection flags.
- Plagiarism items don't need a scan — existing open `plagiarism_results` rows enter the edit queue whenever the doc loads (check with `fetch('/api/plagiarism?documentId=…')` via javascript_tool).
- Queue navigation: the on-screen ‹ › buttons work; **MCP-synthesized keydown events (s / digits / arrows) do NOT reach the window keydown listener** — don't conclude the keyboard shortcuts are broken from MCP, and don't rely on them for driving.
- The Choices panel is clipped at typical window widths — its buttons sit at x≈1210-1240; the first choice is at y≈116, subsequent ones +24px.
- Useful JS probes (javascript_tool): `fetch('/api/documents/<id>').then(r=>r.json())` → `data.sections[].currentText` to confirm document mutations without trusting the UI.

## Flows worth driving after queue/editor changes

1. Skip/resolve an item → position number should stay the same while the total drops by one (items slide left; no double-advance).
2. Plagiarism → Add Citation → green "✓ Citation added" + Continue holds the item; Continue lands on the next item; citation text visible in the doc panel section.
3. Artifact batch → set types to Remove → Process Choices → PROCESSED history + re-detected count drops; completion screen shows green "All AI artifacts cleaned" when 0 remain.
4. Writing Quality advisory → Edit → per-sentence textareas → Save → green "N sentence(s) updated", examples recompute, verify new sentence via the JS probe.
