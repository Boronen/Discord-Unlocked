$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$secretDirectory = Join-Path $taskRoot 'secrets'
if (!(Test-Path -LiteralPath $secretDirectory -PathType Container)) { throw 'Run security-init.mjs first.' }
$operatorIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$systemIdentity = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($operatorIdentity)
foreach ($identity in @($operatorIdentity, $systemIdentity)) {
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $secretDirectory -AclObject $acl
Write-Output 'Secret-directory access is restricted to this Windows account and SYSTEM. Verify existing child-file ACLs before publishing.'
