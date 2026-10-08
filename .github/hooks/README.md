# Copilot Hooks

Hooks are scripts that run at lifecycle events during AI-assisted development. They intercept tool calls made by Copilot agents — letting you enforce policies, suggest best practices, or trigger reminders automatically.

## How It Works

Copilot supports two lifecycle events:

- **`preToolUse`** — Runs *before* a tool call executes. Can block the call (deny) or inject advisory messages.
- **`postToolUse`** — Runs *after* a tool call completes. Can inject follow-up reminders.

Hooks are defined in `.github/hooks/commit-gate.json` and reference scripts in `.github/hooks/scripts/`.

## Hooks in This Repo

| Hook | Event | Purpose | Blocks? |
|------|-------|---------|---------|
| [Commit Gate](scripts/commit-gate.ps1) | `preToolUse` | Enforces `committing-code` skill workflow for commits | Yes (deny) |
| [Test Reminder](scripts/test-reminder.ps1) | `preToolUse` | Suggests running tests before committing | No (advisory) |
| [Doc Sync](scripts/doc-sync.ps1) | `postToolUse` | Reminds to update ARCHITECTURE-FLOW.md after editing sensitive files | No (advisory) |

## JSON Contract

### Input (stdin)

Every hook receives a JSON object on stdin:

```json
{ "toolName": "powershell", "toolArgs": "{\"command\":\"git commit -m 'msg'\"}" }
```

- `toolName` — The tool being called (e.g., `powershell`, `edit`, `create`)
- `toolArgs` — A JSON *string* containing the tool's arguments (must be parsed separately)

### Output (stdout)

**To block a tool call** (preToolUse only):

```json
{ "permissionDecision": "deny", "permissionDecisionReason": "Explain why and what to do instead." }
```

**To show an advisory message** (preToolUse or postToolUse):

```json
{ "message": "💡 Helpful reminder or suggestion." }
```

**To allow silently** — produce no output and exit 0.

## Creating Your Own Hook

### 1. Write the script

Create a new `.ps1` file in `.github/hooks/scripts/`:

```
.github/hooks/scripts/my-hook.ps1
```

Use the template below as a starting point.

### 2. Register it in the config

Add an entry to `commit-gate.json` under the appropriate event:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "powershell": "./scripts/my-hook.ps1",
        "cwd": ".github/hooks",
        "timeoutSec": 10
      }
    ]
  }
}
```

### 3. Test it

Run the script manually by piping JSON to stdin:

```powershell
'{"toolName":"powershell","toolArgs":"{\"command\":\"git commit -m test\"}"}' | pwsh -File .github/hooks/scripts/my-hook.ps1
```

## Template

Copy this as a starting point for new hooks:

```powershell
# Hook Name - PreToolUse/PostToolUse
# Brief description of what this hook does
#
# Input: { "toolName": "...", "toolArgs": "..." }
# Output: { "permissionDecision": "deny", "permissionDecisionReason": "..." } to block
#         { "message": "..." } for advisory messages
#         (no output) to allow silently

$ErrorActionPreference = 'SilentlyContinue'
$rawInput = [Console]::In.ReadToEnd()

try {
    $hookData = $rawInput | ConvertFrom-Json
    $toolName = $hookData.toolName
    $toolArgs = $null
    if ($hookData.toolArgs) {
        $toolArgs = $hookData.toolArgs | ConvertFrom-Json
    }

    # --- Your logic here ---

    # To block (preToolUse only):
    # $response = @{
    #     permissionDecision = "deny"
    #     permissionDecisionReason = "Reason for blocking."
    # }
    # $response | ConvertTo-Json -Compress
    # exit 0

    # To advise:
    # $response = @{ message = "💡 Advisory message." }
    # $response | ConvertTo-Json -Compress
    # exit 0

    # To allow silently: do nothing (fall through)

} catch {
    # On error, allow silently (non-blocking)
}
```

## Tips

- **Keep hooks fast** — enforce a `timeoutSec` of 10 or less. Slow hooks degrade the agent experience.
- **Handle errors silently** — a failing hook should never block the agent. Wrap logic in `try/catch` and let errors fall through.
- **Prefer advisory over blocking** — use `message` to suggest, not `deny` to enforce, unless the policy is critical.
- **Parse `toolArgs` separately** — it arrives as a JSON string inside the outer JSON, so it needs a second `ConvertFrom-Json` call.
- **Check `toolName` early** — exit immediately for irrelevant tools to avoid unnecessary work.
- **Test manually** — pipe sample JSON to your script before committing to verify the output format.
