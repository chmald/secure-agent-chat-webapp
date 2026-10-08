#!/usr/bin/env pwsh
# Tests Copilot CLI compatibility with this repo's skills and MCP servers.
# Usage: ./deployment/scripts/test-cli-compatibility.ps1 [-Verbose] [-SkipMcp]

param(
    [switch]$SkipMcp,
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

# --- Helpers ---

function Write-TestHeader { param([string]$Name); Write-Host "`n[$Name]" -ForegroundColor Cyan }
function Write-Pass { param([string]$Msg); Write-Host "  PASS: $Msg" -ForegroundColor Green }
function Write-Fail { param([string]$Msg); Write-Host "  FAIL: $Msg" -ForegroundColor Red; $script:failures++ }
function Write-Info { param([string]$Msg); Write-Host "  INFO: $Msg" -ForegroundColor DarkGray }

function Invoke-CopilotPrompt {
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [switch]$AllowTools
    )
    $args_ = @("-p", $Prompt, "-s", "--no-auto-update")
    if ($AllowTools) { $args_ += "--allow-all-tools" }
    $output = & copilot @args_ 2>&1 | Out-String
    return $output.Trim()
}

# --- Pre-flight ---

$script:failures = 0

Write-Host "=== Copilot CLI Compatibility Test ===" -ForegroundColor White
Write-Host "Repo: foundry-agent-webapp" -ForegroundColor DarkGray
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray

# Check copilot is installed
if (-not (Get-Command copilot -EA SilentlyContinue)) {
    Write-Host "`n[FATAL] 'copilot' command not found. Install: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli" -ForegroundColor Red
    exit 1
}

# --- Test 1: Version ---

Write-TestHeader "1. CLI Version"
$version = copilot --version 2>&1 | Select-String "GitHub Copilot CLI" | ForEach-Object { $_.ToString().Trim() }
if ($version) {
    Write-Pass $version
} else {
    Write-Fail "Could not determine version"
}

# --- Test 2: Custom Instructions ---

Write-TestHeader "2. Custom Instructions"
$response = Invoke-CopilotPrompt "COMPATIBILITY TEST: Do you see custom instructions for this repo? Reply with ONLY the project name from the instructions, nothing else."
Write-Info "Response: $response"
if ($response -match "foundry-agent-webapp") {
    Write-Pass "Custom instructions loaded (.github/copilot-instructions.md)"
} else {
    Write-Fail "Custom instructions not detected in response"
}

# --- Test 3: Skills ---

Write-TestHeader "3. Skills"
# Dynamic skill discovery
$skillCount = (Get-ChildItem ".github/skills/*/SKILL.md" -ErrorAction SilentlyContinue).Count
$expectedSkills = (Get-ChildItem ".github/skills/*/SKILL.md" -ErrorAction SilentlyContinue) | ForEach-Object { $_.Directory.Name }
$response = Invoke-CopilotPrompt "COMPATIBILITY TEST: List all skill folder names from .github/skills/. Reply with ONLY the folder names, one per line, no numbering."
Write-Info "Response: $response"
$found = 0
foreach ($skill in $expectedSkills) {
    if ($response -match [regex]::Escape($skill)) {
        $found++
    } else {
        Write-Fail "Skill not found: $skill"
    }
}
if ($found -eq $skillCount) {
    Write-Pass "All $found/$skillCount skills visible"
} else {
    Write-Fail "Only $found/$skillCount skills visible"
}

# --- Test 4: MCP Servers ---

if (-not $SkipMcp) {
    Write-TestHeader "4. MCP Servers"
    $expectedServers = @("playwright", "microsoftdocs")
    $response = Invoke-CopilotPrompt -Prompt "COMPATIBILITY TEST: List ALL MCP server names you have access to. Reply with ONLY the server names, one per line, no descriptions." -AllowTools
    Write-Info "Response: $response"
    $found = 0
    foreach ($server in $expectedServers) {
        if ($response -match $server) {
            $found++
        } else {
            Write-Fail "MCP server not found: $server (run syncing-mcp-servers skill first)"
        }
    }
    if ($found -eq $expectedServers.Count) {
        Write-Pass "All $found/$($expectedServers.Count) repo MCP servers connected"
    } else {
        Write-Fail "Only $found/$($expectedServers.Count) repo MCP servers connected"
    }
} else {
    Write-TestHeader "4. MCP Servers (SKIPPED)"
    Write-Info "Use -SkipMcp:$false to include MCP tests"
}

# --- Summary ---

Write-Host "`n=== Results ===" -ForegroundColor White
if ($script:failures -eq 0) {
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "$($script:failures) FAILURE(S)" -ForegroundColor Red
    exit 1
}
