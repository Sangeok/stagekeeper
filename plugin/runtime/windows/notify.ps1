param([Parameter(Mandatory=$true)][string]$Title, [Parameter(Mandatory=$true)][string]$Body)
# 상주 실행기의 Windows 알림(제안서 B-4). Windows PowerShell 5.1의 WinRT 토스트를 PowerShell의 AppUserModelID로 띄운다.
# 상주 프로세스의 일반 자식으로, 창을 숨겨 실행된다. 실패하면 1로 끝나고 실행기는 계속 돈다.
$ErrorActionPreference = 'Stop'
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  $escape = { param($text) [Security.SecurityElement]::Escape($text) }
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$(& $escape $Title)</text><text>$(& $escape $Body)</text></binding></visual></toast>")
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  $toast.Group = 'stagekeeper-runner'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
  exit 0
} catch {
  exit 1
}
