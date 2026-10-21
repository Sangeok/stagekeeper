param(
  [Parameter(Mandatory=$true)][ValidateSet('register','unregister')][string]$Action,
  [Parameter(Mandatory=$true)][string]$TaskName,
  [string]$Execute,
  [string]$Argument
)
# 상주 실행기의 로그온 자동 시작(제안서 B-4). 관리자 권한 없이 현재 사용자의 로그온 작업을 만든다(spike로 확인).
# 동작은 harness-background.mjs가 만든 `conhost.exe --headless …` 한 줄이다 — 창이 뜨지 않는다(spike 대조 측정).
# 결과는 마지막 줄의 JSON 하나다.
$ErrorActionPreference = 'Stop'
try {
  if ($Action -eq 'register') {
    if (-not $Execute -or -not $Argument) { throw 'Execute and Argument are required' }
    $user = "$env:USERDOMAIN\$env:USERNAME"
    $action = New-ScheduledTaskAction -Execute $Execute -Argument $Argument
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    # 상주 실행기는 오래 산다 — 시간 제한 없이, 두 번째 인스턴스는 띄우지 않는다.
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  } else {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
  }
  [Console]::WriteLine((@{ ok = $true } | ConvertTo-Json -Compress))
} catch {
  [Console]::WriteLine((@{ ok = $false; error = 'autostart-failed' } | ConvertTo-Json -Compress))
  exit 1
}
