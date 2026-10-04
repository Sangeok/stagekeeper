param([Parameter(Mandatory=$true)][string]$BuildRoot)
$ErrorActionPreference = 'Stop'

# Operator build material only. Users receive the resulting runtime with the plugin.
# Backport the AppContainer pipe fix; do not change Node's module/symlink semantics.
$version = '22.23.3'
$sourceHash = '9436c81b284889303d39f5b8bd629bf19e790c665ccb94b4994aa87220d9799a'
$buildPath = [IO.Path]::GetFullPath($BuildRoot)
if (-not [IO.Path]::IsPathRooted($BuildRoot) -or $buildPath -eq [IO.Path]::GetPathRoot($buildPath)) { throw 'A dedicated absolute build directory is required' }
New-Item -ItemType Directory -Path $buildPath -Force | Out-Null
$archive = Join-Path $buildPath "node-v$version.tar.gz"
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/v$version/node-v$version.tar.gz" -OutFile $archive }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceHash) { throw 'Pinned Node source checksum differs' }
$source = Join-Path $buildPath "node-v$version"
if (-not (Test-Path -LiteralPath $source)) { & tar.exe -xf $archive -C $buildPath; if ($LASTEXITCODE -ne 0) { throw 'Node extraction failed' } }
$pipeFile = Join-Path $source 'deps/uv/src/win/pipe.c'
$old = @'
static void uv__unique_pipe_name(unsigned long long ptr, char* name, size_t size) {
  snprintf(name, size, "\\\\?\\pipe\\uv\\%llu-%lu", ptr, GetCurrentProcessId());
}
'@
$replacement = @'
/* Stagekeeper backport of libuv PR #5181 (AppContainer LOCAL pipe namespace).
 * https://github.com/libuv/libuv/pull/5181
 * This file retains its upstream MIT license above. */
static void uv__unique_pipe_name(unsigned long long ptr, char* name, size_t size) {
  HANDLE token;
  DWORD app_container = 0, returned;
  if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
    if (!GetTokenInformation(token, TokenIsAppContainer, &app_container,
                             sizeof(app_container), &returned))
      app_container = 0;
    CloseHandle(token);
  }
  snprintf(name, size, "\\\\?\\pipe\\%suv\\%llu-%lu",
           app_container ? "LOCAL\\" : "", ptr, GetCurrentProcessId());
}
'@
$text = [IO.File]::ReadAllText($pipeFile).Replace("`r`n", "`n")
$old = $old.Replace("`r`n", "`n")
$replacement = $replacement.Replace("`r`n", "`n")
if ($text.Contains($old)) {
  if ($text.IndexOf($old) -ne $text.LastIndexOf($old)) { throw 'Node patch anchor is ambiguous' }
  [IO.File]::WriteAllText($pipeFile, $text.Replace($old, $replacement), [Text.UTF8Encoding]::new($false))
} elseif (-not $text.Contains($replacement)) { throw 'Node patch source differs' }

Push-Location $source
try {
  & .\vcbuild.bat release x64 nosign notest
  if ($LASTEXITCODE -ne 0) { throw 'Node source build failed' }
} finally { Pop-Location }
$runtime = Join-Path $buildPath 'runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'Release/node.exe') -Destination (Join-Path $runtime 'node.exe')
Copy-Item -LiteralPath (Join-Path $source 'deps/npm') -Destination $runtime -Recurse -Force
Copy-Item -LiteralPath (Join-Path $source 'LICENSE') -Destination (Join-Path $runtime 'LICENSE')
$manifest = [ordered]@{
  format = 'stagekeeper-windows-node-v1'; version = $version; architecture = 'x64'
  source = "https://nodejs.org/dist/v$version/node-v$version.tar.gz"; sourceSha256 = $sourceHash
  pipeBackport = 'https://github.com/libuv/libuv/pull/5181'
  pipeSourceSha256 = (Get-FileHash -LiteralPath $pipeFile -Algorithm SHA256).Hash.ToLowerInvariant()
  executableSha256 = (Get-FileHash -LiteralPath (Join-Path $runtime 'node.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
}
[IO.File]::WriteAllText((Join-Path $runtime 'provenance.json'), ($manifest | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
& (Join-Path $runtime 'node.exe') -e 'const cp=require("node:child_process"); const r=cp.spawnSync(process.execPath,["-e","console.log(123)"],{encoding:"utf8"}); if(r.status!==0 || r.stdout.trim()!=="123") process.exit(1);'
if ($LASTEXITCODE -ne 0) { throw 'Built Node ordinary child-process smoke failed' }
Write-Output "Built pinned Windows runtime in $runtime"
