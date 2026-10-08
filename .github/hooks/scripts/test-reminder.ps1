# Test Reminder Hook - PreToolUse
# Before a commit via -F COMMIT_MESSAGE.md, checks for test files matching staged source files
# and reminds to run them. Advisory only — does NOT block the commit.
#
# Input format: { "toolName": "powershell", "toolArgs": "{\"command\":\"git commit -F COMMIT_MESSAGE.md\"}" }
# Output format: { "message": "💡 Test files exist for staged changes: ..." }

$ErrorActionPreference = 'SilentlyContinue'

# Read JSON input from stdin
$rawInput = [Console]::In.ReadToEnd()

try {
    $hookData = $rawInput | ConvertFrom-Json

    $toolName = $hookData.toolName
    $toolArgs = $null
    if ($hookData.toolArgs) {
        $toolArgs = $hookData.toolArgs | ConvertFrom-Json
    }

    # Extract command string from tool args
    $command = $null
    if ($toolArgs.command) { $command = $toolArgs.command }
    elseif ($toolArgs.input) { $command = $toolArgs.input }

    # Only trigger on terminal tools with git commit commands
    $terminalTools = @('bash', 'powershell', 'terminal', 'runTerminalCommand', 'runInTerminal', 'execute_runInTerminal', 'run_terminal_command')
    $isTerminalTool = $terminalTools -contains $toolName

    # Check if any command segment is actually 'git commit' (not git grep/log with "commit" in args)
    $isGitCommit = $false
    if ($isTerminalTool -and $command) {
        foreach ($seg in ($command -split '(?:&&|\|\||[;|])')) {
            if ($seg.Trim() -match '^\s*git\s+(-\S+\s+)*commit(\s|$)') {
                $isGitCommit = $true
                break
            }
        }
    }
    if (-not $isGitCommit) {
        exit 0
    }

    # Only run on commits via -F COMMIT_MESSAGE.md (the committing-code skill workflow)
    if (-not ($command -match '-F\s+COMMIT_MESSAGE\.md' -or $command -match '--file\s+COMMIT_MESSAGE\.md')) {
        exit 0
    }

    # Get staged files
    $stagedFiles = git diff --cached --name-only 2>$null
    if (-not $stagedFiles) {
        exit 0
    }

    $matchingTests = @()

    foreach ($file in $stagedFiles) {
        $fileName = [System.IO.Path]::GetFileNameWithoutExtension($file)
        $extension = [System.IO.Path]::GetExtension($file)

        # Skip test files themselves and non-source files
        if ($file -match '\.test\.' -or $file -match '\.spec\.' -or $file -match 'Tests\.cs$' -or $file -match '__tests__') {
            continue
        }

        # TypeScript/JavaScript: look for __tests__/name.test.ts(x) or name.test.ts(x)
        if ($extension -match '^\.(ts|tsx|js|jsx)$') {
            $testPatterns = @(
                "**/__tests__/$fileName.test$extension",
                "**/__tests__/$fileName.test.ts",
                "**/__tests__/$fileName.test.tsx",
                "**/$fileName.test$extension",
                "**/$fileName.spec$extension"
            )
            foreach ($pattern in $testPatterns) {
                $found = git ls-files $pattern 2>$null
                if ($found) {
                    $matchingTests += $found
                }
            }
        }

        # C#: look for matching *Tests.cs files
        if ($extension -eq '.cs') {
            $testPattern = "**/${fileName}Tests.cs"
            $found = git ls-files $testPattern 2>$null
            if ($found) {
                $matchingTests += $found
            }
        }
    }

    # Deduplicate
    $matchingTests = $matchingTests | Select-Object -Unique

    if ($matchingTests.Count -gt 0) {
        $testList = ($matchingTests | ForEach-Object { [System.IO.Path]::GetFileName($_) }) -join ', '
        $response = @{
            message = "💡 Test files exist for staged changes: $testList. Consider running tests before committing."
        }
        $response | ConvertTo-Json -Compress
        exit 0
    }
} catch {
    # On error, allow silently (non-blocking)
}

# No output = no reminder
