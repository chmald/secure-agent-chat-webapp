# Commit Gate Hook - PreToolUse
# Blocks direct git commit commands and redirects to the committing-code skill workflow.
# Allows commits via -F COMMIT_MESSAGE.md (the skill's prescribed workflow).
#
# Input format (CLI/coding agent): { "toolName": "powershell", "toolArgs": "{\"command\":\"git commit -m 'msg'\"}" }
# Output format: { "permissionDecision": "deny", "permissionDecisionReason": "..." }

$ErrorActionPreference = 'SilentlyContinue'

# Read JSON input from stdin
$rawInput = [Console]::In.ReadToEnd()

try {
    $hookData = $rawInput | ConvertFrom-Json

    $toolName = $hookData.toolName
    # toolArgs is a JSON string in CLI format, parse it
    $toolArgs = $null
    if ($hookData.toolArgs) {
        $toolArgs = $hookData.toolArgs | ConvertFrom-Json
    }

    # Extract command string from tool args
    $command = $null
    if ($toolArgs.command) { $command = $toolArgs.command }
    elseif ($toolArgs.input) { $command = $toolArgs.input }

    # Only intercept terminal/command tools
    $terminalTools = @('bash', 'powershell', 'terminal', 'runTerminalCommand', 'runInTerminal', 'execute_runInTerminal', 'run_terminal_command')
    $isTerminalTool = $terminalTools -contains $toolName

    # Check if any command segment is actually 'git commit' (not git grep/log with "commit" in args)
    # Splits on shell operators, then checks that 'commit' is the git subcommand (first non-flag word)
    $isGitCommit = $false
    if ($isTerminalTool -and $command) {
        foreach ($seg in ($command -split '(?:&&|\|\||[;|])')) {
            if ($seg.Trim() -match '^\s*git\s+(-\S+\s+)*commit(\s|$)') {
                $isGitCommit = $true
                break
            }
        }
    }

    if ($isGitCommit) {
        # Allow commits that use -F COMMIT_MESSAGE.md (the skill's prescribed workflow)
        if ($command -match '-F\s+COMMIT_MESSAGE\.md' -or $command -match '--file\s+COMMIT_MESSAGE\.md') {
            exit 0
        }

        # Block direct commits and redirect to the committing-code skill workflow
        $response = @{
            permissionDecision = "deny"
            permissionDecisionReason = @"
Direct git commits are blocked by repository policy. Instead, follow the committing-code skill rules:
1. Run 'git diff --staged' to review all staged changes
2. Write a commit message to COMMIT_MESSAGE.md following the skill's conventional commit format
3. Execute 'git commit -F COMMIT_MESSAGE.md'
4. Delete COMMIT_MESSAGE.md after the commit succeeds
Do NOT attempt to commit directly again.
"@
        }

        $response | ConvertTo-Json -Compress
        exit 0
    }
} catch {
    # On error, allow the tool call to proceed (non-blocking)
}

# Allow all non-commit tool calls (no output = allow)
