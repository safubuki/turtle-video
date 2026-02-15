# Developer Guide (Generic Video Analysis)

This guide explains how to set up a local, developer-only environment for generic video analysis.

## 1. Design

- Create a virtual environment at `.venv-media-analysis` in this workspace.
- Install analysis dependencies only inside that virtual environment.
- Generated artifacts are ignored by Git and are not part of normal commits.
- End users do not need this setup.

## 2. Added Files

- `scripts/dev/setup-media-analysis-env.ps1`: create venv and install dependencies
- `scripts/dev/run-media-analysis.ps1`: run analysis script inside venv
- `scripts/dev/analyze-video.py`: generic video analysis logic
- `scripts/dev/analyze-end-blackout.py`: backward-compatible wrapper (legacy name)
- `scripts/dev/requirements-media-analysis.txt`: Python dependencies for analysis

## 3. Initial Setup

Run from project root:

```powershell
npm run dev:media:setup
```

Optional pip upgrade:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\setup-media-analysis-env.ps1 -UpgradePip
```

## 4. Run Analysis

Example:

```powershell
npm run dev:media:analyze -- -InputPath "C:\Users\kamep\Downloads\VID_20260215_070608.mp4"
```

Save JSON report:

```powershell
npm run dev:media:analyze -- -InputPath "C:\Users\kamep\Downloads\VID_20260215_070608.mp4" -OutputPath ".media-analysis-output\latest.json"
```

Main options:

- `-Mode` (`summary` | `black-segments` | `freeze-segments` | `tail-black` | `full-black`, default: `summary`)
- `-Scope` (`full` | `tail`, default: `full`)
- `-TailSeconds` (default: `2.0`)
- `-BlackThreshold` (default: `8.0`)
- `-FreezeThreshold` (default: `0.8`)
- `-MinSegmentFrames` (default: `3`)
- `-OutputPath` (optional)

Example (black segments in tail):

```powershell
npm run dev:media:analyze -- -InputPath "C:\path\capture.mp4" -Mode black-segments -Scope tail -TailSeconds 2
```

Example (freeze segments in full video):

```powershell
npm run dev:media:analyze -- -InputPath "C:\path\capture.mp4" -Mode freeze-segments -Scope full -FreezeThreshold 0.8 -MinSegmentFrames 3
```

Example (video summary):

```powershell
npm run dev:media:analyze -- -InputPath "C:\path\capture.mp4" -Mode summary
```

## 5. How to Read Output

Key fields (examples):

- `mode`: executed analysis mode
- `duration_sec_estimate`: estimated video duration
- `segments`: detected segment list (for segment modes)
- `luma_stats` / `motion_stats`: basic metric statistics (summary mode)

## 6. Cleanup

```powershell
Remove-Item -Recurse -Force .\.venv-media-analysis
Remove-Item -Recurse -Force .\.media-analysis-output -ErrorAction SilentlyContinue
```

## 7. Notes

- This is a developer-only workflow.
- Network access is required to install Python dependencies.
- If setup fails due to a broken venv, delete `.venv-media-analysis` and rerun setup.
- The setup script prefers `py -3` on Windows to avoid MSYS Python venv issues.

## 8. GitHub Issue Workflow

For repository issue templates and CLI issue creation, see:

- `Docs/github_issue_workflow.md`
