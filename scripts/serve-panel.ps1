[CmdletBinding()]
param(
    [int]$Port = 8765,
    [string]$ProductsRoot
)

$ErrorActionPreference = 'Stop'
if (-not ('HubLocal.FileReparseTagReader' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace HubLocal {
    public static class FileReparseTagReader {
        [StructLayout(LayoutKind.Sequential)]
        private struct FileAttributeTagInfo {
            public uint FileAttributes;
            public uint ReparseTag;
        }

        [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(string path, uint desiredAccess, uint shareMode, IntPtr securityAttributes, uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int informationClass, out FileAttributeTagInfo information, uint bufferSize);

        [DllImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint pathLength, uint flags);

        public static bool IsCloudFilesReparsePoint(string path) {
            const uint fileReadAttributes = 0x00000080;
            const uint shareReadWriteDelete = 0x00000001 | 0x00000002 | 0x00000004;
            const uint openExisting = 3;
            const uint backupSemantics = 0x02000000;
            using (SafeFileHandle handle = CreateFile(path, fileReadAttributes, shareReadWriteDelete, IntPtr.Zero, openExisting, backupSemantics, IntPtr.Zero)) {
                if (handle == null || handle.IsInvalid) return false;
                FileAttributeTagInfo information;
                const int fileAttributeTagInfoClass = 9;
                if (!GetFileInformationByHandleEx(handle, fileAttributeTagInfoClass, out information, (uint)Marshal.SizeOf(typeof(FileAttributeTagInfo)))) return false;
                return (information.FileAttributes & 0x00000400u) != 0 && (information.ReparseTag & 0xFFFF001Fu) == 0x9000001Au;
            }
        }

        public static string GetFinalPath(string path) {
            const uint fileReadAttributes = 0x00000080;
            const uint shareReadWriteDelete = 0x00000001 | 0x00000002 | 0x00000004;
            const uint openExisting = 3;
            const uint backupSemantics = 0x02000000;
            const uint normalizedDosPath = 0;
            using (SafeFileHandle handle = CreateFile(path, fileReadAttributes, shareReadWriteDelete, IntPtr.Zero, openExisting, backupSemantics, IntPtr.Zero)) {
                if (handle == null || handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
                uint capacity = 512;
                while (true) {
                    StringBuilder buffer = new StringBuilder((int)capacity);
                    uint length = GetFinalPathNameByHandle(handle, buffer, capacity, normalizedDosPath);
                    if (length == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
                    if (length < capacity) {
                        string result = buffer.ToString();
                        if (result.StartsWith("\\\\?\\UNC\\", StringComparison.OrdinalIgnoreCase)) return "\\\\" + result.Substring(8);
                        if (result.StartsWith("\\\\?\\", StringComparison.OrdinalIgnoreCase)) return result.Substring(4);
                        return result;
                    }
                    capacity = length + 1;
                }
            }
        }
    }
}
'@
}
$securityModuleManifest = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
if (Test-Path -LiteralPath $securityModuleManifest -PathType Leaf) {
    Import-Module -Name $securityModuleManifest -ErrorAction Stop
} else {
    Import-Module -Name Microsoft.PowerShell.Security -ErrorAction Stop
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$siteDirectory = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$engineRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'presell-engine'))
$knowledgeExportScript = Join-Path $PSScriptRoot 'knowledge-export.ps1'
if (-not (Test-Path -LiteralPath $knowledgeExportScript -PathType Leaf)) { throw 'O exportador de conhecimento não foi encontrado.' }
. $knowledgeExportScript
$personalSkillsProfile = [Environment]::GetFolderPath('UserProfile')
if ([string]::IsNullOrWhiteSpace($personalSkillsProfile)) {
    $personalSkillsProfile = [Environment]::GetEnvironmentVariable('USERPROFILE')
}
if ([string]::IsNullOrWhiteSpace($personalSkillsProfile)) {
    throw 'O caminho do perfil do usuário não está disponível para a exportação de conhecimento.'
}
$personalSkillsRoot = Join-Path $personalSkillsProfile '.codex\skills'
$productsRootConfig = Join-Path $projectRoot 'data-local\products-root.txt'
if ([string]::IsNullOrWhiteSpace($ProductsRoot)) {
    if (Test-Path -LiteralPath $productsRootConfig -PathType Leaf) {
        $ProductsRoot = [IO.File]::ReadAllText($productsRootConfig).Trim()
        if ([string]::IsNullOrWhiteSpace($ProductsRoot)) {
            throw "A configuração $productsRootConfig está vazia. Informe o caminho da pasta local de produtos."
        }
    } elseif ($projectRoot -match '^(?<Profile>[A-Za-z]:\\Users\\[^\\]+)(?:\\|$)') {
        $trafficFolder = 'tr' + [char]0x00E1 + 'fego pago'
        $ProductsRoot = Join-Path $Matches.Profile (Join-Path 'OneDrive' (Join-Path $trafficFolder 'produtos'))
    }
}
$resolvedProductsRoot = if ([string]::IsNullOrWhiteSpace($ProductsRoot)) { $null } else { [IO.Path]::GetFullPath($ProductsRoot) }
$templateRoot = if ($resolvedProductsRoot) { Join-Path $resolvedProductsRoot 'template\presell-cookie-base' } else { $null }

function Get-StatusReason {
    param([int]$StatusCode)
    switch ($StatusCode) {
        200 { 'OK' }
        400 { 'Bad Request' }
        403 { 'Forbidden' }
        404 { 'Not Found' }
        405 { 'Method Not Allowed' }
        413 { 'Payload Too Large' }
        500 { 'Internal Server Error' }
        default { 'Error' }
    }
}

function Write-HttpResponse {
    param(
        [IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$ContentType,
        [byte[]]$Body,
        [string]$ExtraHeaders = ''
    )
    $reason = Get-StatusReason $StatusCode
    $extra = if ([string]::IsNullOrWhiteSpace($ExtraHeaders)) { '' } else { $ExtraHeaders.TrimEnd("`r", "`n") + "`r`n" }
    $header = "HTTP/1.1 $StatusCode $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store, no-cache, must-revalidate, max-age=0`r`nX-Content-Type-Options: nosniff`r`n$extra" + "Connection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
    $Stream.Flush()
}

function Write-JsonResponse {
    param([IO.Stream]$Stream, [int]$StatusCode, [object]$Payload)
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 30 -Compress))
    Write-HttpResponse $Stream $StatusCode 'application/json; charset=utf-8' $bytes
}

function Read-HttpRequest {
    param([IO.Stream]$Stream)
    $headerBuffer = New-Object IO.MemoryStream
    $previous3 = -1
    $previous2 = -1
    $previous1 = -1
    try {
        while ($headerBuffer.Length -lt 65536) {
            $current = $Stream.ReadByte()
            if ($current -lt 0) { throw 'Conexão encerrada antes do cabeçalho HTTP.' }
            $headerBuffer.WriteByte([byte]$current)
            if ($previous3 -eq 13 -and $previous2 -eq 10 -and $previous1 -eq 13 -and $current -eq 10) { break }
            $previous3 = $previous2
            $previous2 = $previous1
            $previous1 = $current
        }
        if ($headerBuffer.Length -ge 65536) { throw 'Cabeçalho HTTP muito grande.' }
        $headerText = [Text.Encoding]::ASCII.GetString($headerBuffer.ToArray())
    } finally {
        $headerBuffer.Dispose()
    }

    $lines = $headerText -split "`r`n"
    $requestLine = $lines[0] -split ' ', 3
    if ($requestLine.Count -ne 3) { throw 'Linha de requisição HTTP inválida.' }
    $headers = @{}
    foreach ($line in $lines[1..($lines.Count - 1)]) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $separator = $line.IndexOf(':')
        if ($separator -gt 0) { $headers[$line.Substring(0, $separator).Trim()] = $line.Substring($separator + 1).Trim() }
    }

    $contentLength = 0
    if ($headers.ContainsKey('Content-Length') -and -not [int]::TryParse($headers['Content-Length'], [ref]$contentLength)) {
        throw 'Content-Length inválido.'
    }
    if ($contentLength -lt 0 -or $contentLength -gt 200000) { throw 'O tamanho da ficha é inválido.' }
    $bodyBytes = New-Object byte[] $contentLength
    $offset = 0
    while ($offset -lt $contentLength) {
        $read = $Stream.Read($bodyBytes, $offset, $contentLength - $offset)
        if ($read -le 0) { throw 'Conexão encerrada antes do corpo HTTP.' }
        $offset += $read
    }
    return @{
        Method = $requestLine[0].ToUpperInvariant()
        Target = $requestLine[1]
        Body = [Text.Encoding]::UTF8.GetString($bodyBytes)
        Headers = $headers
    }
}

function Test-KnowledgeExportRequest {
    param([hashtable]$Headers)
    $expectedHost = "127.0.0.1:$Port"
    if ($Headers['Host'] -cne $expectedHost -or $Headers['X-Hub-Knowledge-Export'] -cne '1') { return $false }
    $origin = [string]$Headers['Origin']
    return [string]::IsNullOrWhiteSpace($origin) -or $origin -ceq "http://$expectedHost"
}

function Resolve-SafeDestination {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($resolvedProductsRoot)) {
        throw "A pasta de produtos não está configurada. Crie data-local\products-root.txt com o caminho da pasta local de produtos ou inicie serve-panel.ps1 com -ProductsRoot."
    }
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'O diretório de destino é obrigatório.' }
    $destination = [IO.Path]::GetFullPath($Value)
    $rootPrefix = $resolvedProductsRoot.TrimEnd('\') + '\'
    if (-not $destination.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'O destino deve ficar dentro da pasta local de produtos.' }
    $relative = $destination.Substring($rootPrefix.Length)
    if (($relative -split '[\\/]').Count -lt 2) { throw 'Informe uma pasta de página dentro de um produto.' }
    return $destination
}

function Get-CanonicalExistingPath {
    param([string]$Path)
    try { return [HubLocal.FileReparseTagReader]::GetFinalPath([IO.Path]::GetFullPath($Path)) }
    catch { throw "Não foi possível resolver o caminho físico '$Path': $($_.Exception.Message)" }
}

function Test-PathWithinDirectory {
    param([string]$Path, [string]$Directory)
    $normalizedPath = [IO.Path]::GetFullPath($Path)
    $normalizedDirectory = [IO.Path]::GetFullPath($Directory)
    if ([string]::Equals($normalizedPath.TrimEnd('\'), $normalizedDirectory.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { return $true }
    $prefix = $normalizedDirectory.TrimEnd('\') + '\'
    return $normalizedPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

function Find-ChromeExecutable {
    $candidates = [System.Collections.Generic.List[string]]::new()
    $command = Get-Command 'chrome.exe' -ErrorAction SilentlyContinue
    if ($command -and $command.Source) { $candidates.Add([string]$command.Source) }
    foreach ($root in @([Environment]::GetFolderPath('ProgramFiles'), [Environment]::GetFolderPath('ProgramFilesX86'), $env:LOCALAPPDATA)) {
        if ([string]::IsNullOrWhiteSpace([string]$root)) { continue }
        $candidates.Add((Join-Path $root 'Google\Chrome\Application\chrome.exe'))
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

function Open-PresellLocalPage {
    param([string]$Destination)
    $safeDestination = Resolve-SafeDestination $Destination
    $indexPath = Join-Path $safeDestination 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
        return @{ localFileUrl = ''; browserOpened = $false; browserOpenError = 'O arquivo index.html não foi encontrado no destino criado.' }
    }
    $indexItem = Get-Item -LiteralPath $indexPath -Force -ErrorAction Stop
    if (($indexItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        return @{ localFileUrl = ''; browserOpened = $false; browserOpenError = 'O arquivo index.html é um link do sistema de arquivos e não foi aberto.' }
    }
    $localFileUrl = ([Uri]::new([IO.Path]::GetFullPath($indexPath))).AbsoluteUri
    $chromePath = Find-ChromeExecutable
    if (-not $chromePath) {
        return @{ localFileUrl = $localFileUrl; browserOpened = $false; browserOpenError = 'O Google Chrome não foi localizado. Use o link local para abrir a página.' }
    }
    try {
        Start-Process -FilePath $chromePath -ArgumentList ('--new-window "{0}"' -f $localFileUrl) -WindowStyle Normal -ErrorAction Stop | Out-Null
        return @{ localFileUrl = $localFileUrl; browserOpened = $true; browserOpenError = '' }
    } catch {
        return @{ localFileUrl = $localFileUrl; browserOpened = $false; browserOpenError = 'O Chrome não abriu automaticamente. Use o link local para abrir a página.' }
    }
}

function Get-AssetStudioPageDirectory {
    param([string]$Body)
    if ([string]::IsNullOrWhiteSpace($resolvedProductsRoot)) {
        throw 'A pasta de produtos não está configurada no servidor local.'
    }
    $payload = $Body | ConvertFrom-Json
    $productName = ([string]$payload.productName).Trim()
    $rootName = ([string]$payload.rootName).Trim()
    if ([string]::IsNullOrWhiteSpace($productName) -or $productName -in @('.', '..') -or $productName -match '[<>:"/\\|?*\x00-\x1f]' -or $productName -match '[. ]$' -or $productName -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$') {
        throw 'O nome do produto não é válido para localizar a pasta da página.'
    }
    $configuredRootName = [IO.DirectoryInfo]::new($resolvedProductsRoot).Name
    if (-not [string]::Equals($rootName, $configuredRootName, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'A pasta raiz selecionada no Asset Studio não corresponde à pasta de produtos configurada no Hub.'
    }
    $destination = Resolve-SafeDestination (Join-Path (Join-Path $resolvedProductsRoot $productName) 'pag01')
    if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
        throw 'A pasta pag01 do produto ainda não existe na pasta local de produtos.'
    }
    return @{ directory = $destination; productName = $productName; pageFolder = 'pag01' }
}

function Get-ContentType {
    param([string]$Path)
    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { 'text/html; charset=utf-8' }
        '.js'   { 'text/javascript; charset=utf-8' }
        '.mjs'  { 'text/javascript; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.svg'  { 'image/svg+xml' }
        default { 'application/octet-stream' }
    }
}

$hostingerTokenPath = Join-Path $projectRoot 'data-local\hostinger-api-token.dpapi'
$hostingerMetadataPath = Join-Path $projectRoot 'data-local\hostinger-api-token-metadata.json'
$hostingerSitesCachePath = Join-Path $projectRoot 'data-local\hostinger-sites-cache.json'
$hostingerCreatedSubdomainsPath = Join-Path $projectRoot 'data-local\hostinger-created-subdomains.json'
$hostingerAbsentSubdomainsPath = Join-Path $projectRoot 'data-local\hostinger-absent-subdomains.json'
$script:hostingerLastRequestUtc = [DateTimeOffset]::MinValue

function Wait-HostingerRequestSlot {
    $now = [DateTimeOffset]::UtcNow
    if ($script:hostingerLastRequestUtc -ne [DateTimeOffset]::MinValue) {
        $waitMilliseconds = [int][Math]::Ceiling((1100 - ($now - $script:hostingerLastRequestUtc).TotalMilliseconds))
        if ($waitMilliseconds -gt 0) { Start-Sleep -Milliseconds $waitMilliseconds }
    }
    $script:hostingerLastRequestUtc = [DateTimeOffset]::UtcNow
}

function Save-HostingerSitesCache {
    param([object]$Result)
    $creationDateDiagnostics = $null
    if ($Result -is [System.Collections.IDictionary] -and $Result.Contains('creationDateDiagnostics')) {
        $creationDateDiagnostics = $Result['creationDateDiagnostics']
    } elseif ($null -ne $Result.PSObject.Properties['creationDateDiagnostics']) {
        $creationDateDiagnostics = $Result.PSObject.Properties['creationDateDiagnostics'].Value
    }
    if ($null -eq $creationDateDiagnostics -and (Test-Path -LiteralPath $hostingerSitesCachePath -PathType Leaf)) {
        try {
            $existingCache = [IO.File]::ReadAllText($hostingerSitesCachePath) | ConvertFrom-Json -ErrorAction Stop
            if ($null -ne $existingCache.PSObject.Properties['creationDateDiagnostics']) {
                $creationDateDiagnostics = $existingCache.PSObject.Properties['creationDateDiagnostics'].Value
            }
        } catch { }
    }
    $payload = @{ sites = @($Result.sites); checkedAtUtc = [string]$Result.checkedAtUtc; creationDateDiagnostics = $creationDateDiagnostics }
    $directory = Split-Path -Parent $hostingerSitesCachePath
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporaryPath = "$hostingerSitesCachePath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporaryPath, ($payload | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryPath -Destination $hostingerSitesCachePath -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
    return $payload
}

function Get-HostingerSitesCache {
    if (-not (Test-Path -LiteralPath $hostingerSitesCachePath -PathType Leaf)) { return @{ sites = @(); checkedAtUtc = '' } }
    try {
        $cache = [IO.File]::ReadAllText($hostingerSitesCachePath) | ConvertFrom-Json -ErrorAction Stop
        $creationDateDiagnostics = $null
        if ($null -ne $cache.PSObject.Properties['creationDateDiagnostics']) {
            $creationDateDiagnostics = $cache.PSObject.Properties['creationDateDiagnostics'].Value
        }
        return @{ sites = @(Merge-HostingerCreatedSubdomains -Sites @($cache.sites)); checkedAtUtc = [string]$cache.checkedAtUtc; creationDateDiagnostics = $creationDateDiagnostics }
    } catch {
        throw 'A lista local de sites Hostinger está ilegível. Clique em Atualizar sites para recriá-la.'
    }
}

function Get-HostingerCreatedSubdomains {
    if (-not (Test-Path -LiteralPath $hostingerCreatedSubdomainsPath -PathType Leaf)) { return @() }
    try {
        $saved = [IO.File]::ReadAllText($hostingerCreatedSubdomainsPath) | ConvertFrom-Json -ErrorAction Stop
        return @($saved.subdomains | Where-Object { $null -ne $_ })
    } catch {
        throw 'O cadastro local de subdomínios criados pelo Hub está ilegível.'
    }
}

function Get-HostingerAbsentSubdomains {
    if (-not (Test-Path -LiteralPath $hostingerAbsentSubdomainsPath -PathType Leaf)) { return @() }
    try {
        $saved = [IO.File]::ReadAllText($hostingerAbsentSubdomainsPath) | ConvertFrom-Json -ErrorAction Stop
        return @($saved.subdomains | Where-Object { $null -ne $_ })
    } catch {
        throw 'O registro local de subdomínios confirmados como ausentes está ilegível.'
    }
}

function Save-HostingerAbsentSubdomains {
    param([object[]]$Subdomains)
    $directory = Split-Path -Parent $hostingerAbsentSubdomainsPath
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporaryPath = "$hostingerAbsentSubdomainsPath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporaryPath, (@{ subdomains = @($Subdomains) } | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryPath -Destination $hostingerAbsentSubdomainsPath -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
}

function Add-HostingerAbsentSubdomain {
    param([string]$Domain, [string]$Username, [string]$ParentDomain)
    $remaining = @((Get-HostingerAbsentSubdomains) | Where-Object { -not ([string]$_.domain -ieq $Domain -and [string]$_.username -ceq $Username) })
    $remaining += [PSCustomObject]@{ domain = $Domain; username = $Username; parentDomain = $ParentDomain; confirmedAtUtc = [DateTimeOffset]::UtcNow.ToString('o') }
    Save-HostingerAbsentSubdomains -Subdomains $remaining
}

function Remove-HostingerAbsentSubdomain {
    param([string]$Domain, [string]$Username)
    $existing = @(Get-HostingerAbsentSubdomains)
    $remaining = @($existing | Where-Object { -not ([string]$_.domain -ieq $Domain -and [string]$_.username -ceq $Username) })
    if ($remaining.Count -eq $existing.Count) { return }
    Save-HostingerAbsentSubdomains -Subdomains $remaining
}

function Clear-HostingerAbsentSubdomains {
    param([object[]]$Subdomains)
    $existing = @(Get-HostingerAbsentSubdomains)
    if ($existing.Count -eq 0) { return }
    $confirmedPresent = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($subdomain in $Subdomains) {
        if ($null -eq $subdomain) { continue }
        $confirmedPresent.Add("$([string]$subdomain.username)|$([string]$subdomain.domain)") | Out-Null
    }
    $remaining = @($existing | Where-Object { -not $confirmedPresent.Contains("$([string]$_.username)|$([string]$_.domain)") })
    if ($remaining.Count -ne $existing.Count) { Save-HostingerAbsentSubdomains -Subdomains $remaining }
}

function Save-HostingerCreatedSubdomain {
    param([object]$Site)
    $existing = @(Get-HostingerCreatedSubdomains)
    $subdomains = [System.Collections.Generic.List[object]]::new()
    foreach ($item in $existing) {
        if ([string]$item.domain -ieq [string]$Site.domain -and [string]$item.username -ceq [string]$Site.username) { continue }
        $subdomains.Add($item)
    }
    $subdomains.Add($Site)
    $payload = @{ subdomains = @($subdomains.ToArray()) }
    $directory = Split-Path -Parent $hostingerCreatedSubdomainsPath
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporaryPath = "$hostingerCreatedSubdomainsPath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporaryPath, ($payload | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryPath -Destination $hostingerCreatedSubdomainsPath -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
}

function Merge-HostingerCreatedSubdomains {
    param([object[]]$Sites)
    $merged = [System.Collections.Generic.List[object]]::new()
    $createdSubdomains = @(Get-HostingerCreatedSubdomains)
    $absentSubdomains = @(Get-HostingerAbsentSubdomains)
    foreach ($site in $Sites) {
        if ($null -eq $site) { continue }
        if (@($absentSubdomains | Where-Object { [string]$_.domain -ieq [string]$site.domain -and [string]$_.username -ceq [string]$site.username }).Count -gt 0) { continue }
        $createdMatch = @($createdSubdomains | Where-Object { [string]$_.domain -ieq [string]$site.domain -and [string]$_.username -ceq [string]$site.username } | Select-Object -First 1)
        if ($createdMatch.Count -gt 0) {
            $parentIsAvailable = @($Sites | Where-Object { [string]$_.domain -ieq [string]$createdMatch[0].parentDomain -and [string]$_.username -ceq [string]$createdMatch[0].username }).Count -gt 0
            if ($parentIsAvailable) {
                $siteRecord = [ordered]@{}
                foreach ($property in $site.PSObject.Properties) { $siteRecord[$property.Name] = $property.Value }
                if ([string]::IsNullOrWhiteSpace([string]$siteRecord['parentDomain'])) { $siteRecord['parentDomain'] = [string]$createdMatch[0].parentDomain }
                if ([string]::IsNullOrWhiteSpace([string]$siteRecord['rootDirectory'])) { $siteRecord['rootDirectory'] = [string]$createdMatch[0].rootDirectory }
                if ([string]::IsNullOrWhiteSpace([string]$siteRecord['createdAt'])) { $siteRecord['createdAt'] = [string]$createdMatch[0].createdAt }
                $merged.Add([PSCustomObject]$siteRecord)
                continue
            }
        }
        $merged.Add($site)
    }
    foreach ($created in $createdSubdomains) {
        if (@($absentSubdomains | Where-Object { [string]$_.domain -ieq [string]$created.domain -and [string]$_.username -ceq [string]$created.username }).Count -gt 0) { continue }
        $parentIsAvailable = @($Sites | Where-Object { [string]$_.domain -ieq [string]$created.parentDomain -and [string]$_.username -ceq [string]$created.username }).Count -gt 0
        if (-not $parentIsAvailable) { continue }
        if (@($merged | Where-Object { [string]$_.domain -ieq [string]$created.domain -and [string]$_.username -ceq [string]$created.username }).Count -gt 0) { continue }
        $merged.Add($created)
    }
    return @($merged.ToArray())
}

function New-HostingerTokenMetadata {
    param([string]$Term, [string]$RegisteredAtUtc)
    $validTerms = @('1_month', '3_months', '6_months', '1_year', 'never')
    if ($Term -notin $validTerms) { throw 'Escolha um prazo de expiração válido para o token.' }
    try { $registeredAt = [DateTimeOffset]::Parse($RegisteredAtUtc).ToUniversalTime() }
    catch { throw 'A data de cadastro do lembrete de expiração está inválida.' }
    $expiresAt = switch ($Term) {
        '1_month' { $registeredAt.AddMonths(1) }
        '3_months' { $registeredAt.AddMonths(3) }
        '6_months' { $registeredAt.AddMonths(6) }
        '1_year' { $registeredAt.AddYears(1) }
        default { $null }
    }
    return [PSCustomObject]@{
        expirationTerm = $Term
        registeredAtUtc = $registeredAt.ToString('o')
        expiresAtUtc = if ($null -eq $expiresAt) { $null } else { $expiresAt.ToString('o') }
    }
}

function Save-HostingerTokenMetadata {
    param([string]$Term, [string]$RegisteredAtUtc)
    $metadata = New-HostingerTokenMetadata -Term $Term -RegisteredAtUtc $RegisteredAtUtc
    $directory = Split-Path -Parent $hostingerMetadataPath
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporaryPath = "$hostingerMetadataPath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporaryPath, ($metadata | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryPath -Destination $hostingerMetadataPath -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
    return $metadata
}

function Get-HostingerTokenMetadata {
    if (-not (Test-Path -LiteralPath $hostingerMetadataPath -PathType Leaf)) { return $null }
    try {
        $saved = [IO.File]::ReadAllText($hostingerMetadataPath) | ConvertFrom-Json -ErrorAction Stop
        return New-HostingerTokenMetadata -Term ([string]$saved.expirationTerm) -RegisteredAtUtc ([string]$saved.registeredAtUtc)
    } catch {
        throw 'O lembrete local de expiração do token está ilegível. Troque o token novamente para recriá-lo.'
    }
}

function Set-HostingerTokenExpiration {
    param([string]$Body)
    if (-not (Test-Path -LiteralPath $hostingerTokenPath -PathType Leaf)) { throw 'Conecte um token Hostinger antes de definir o lembrete.' }
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'O prazo de expiração não pôde ser lido.' }
    $term = [string]$payload.expirationTerm
    $metadata = Get-HostingerTokenMetadata
    if ($null -eq $metadata) { $metadata = New-HostingerTokenMetadata -Term '1_month' -RegisteredAtUtc ([DateTimeOffset]::UtcNow.ToString('o')) }
    return Save-HostingerTokenMetadata -Term $term -RegisteredAtUtc $metadata.registeredAtUtc
}

function Test-HostingerLocalRequest {
    param([hashtable]$Headers)
    $expectedHost = "127.0.0.1:$Port"
    if ($Headers['Host'] -cne $expectedHost) { return $false }
    $origin = [string]$Headers['Origin']
    return [string]::IsNullOrWhiteSpace($origin) -or $origin -ceq "http://$expectedHost"
}

function Test-HubLocalRequest {
    param([hashtable]$Headers)
    $expectedHost = "127.0.0.1:$Port"
    if ($Headers['Host'] -cne $expectedHost) { return $false }
    $origin = [string]$Headers['Origin']
    return [string]::IsNullOrWhiteSpace($origin) -or $origin -ceq "http://$expectedHost"
}

function Save-HostingerToken {
    param([string]$Token)
    $secureToken = ConvertTo-SecureString -String $Token -AsPlainText -Force
    $protectedToken = ConvertFrom-SecureString -SecureString $secureToken
    $tokenDirectory = Split-Path -Parent $hostingerTokenPath
    [IO.Directory]::CreateDirectory($tokenDirectory) | Out-Null
    [IO.File]::WriteAllText($hostingerTokenPath, $protectedToken, [Text.UTF8Encoding]::new($false))
}

function Get-HostingerToken {
    if (-not (Test-Path -LiteralPath $hostingerTokenPath -PathType Leaf)) { return '' }
    $protectedToken = [IO.File]::ReadAllText($hostingerTokenPath).Trim()
    if ([string]::IsNullOrWhiteSpace($protectedToken)) { throw 'A credencial Hostinger local está vazia. Conecte novamente.' }
    $secureToken = ConvertTo-SecureString -String $protectedToken -ErrorAction Stop
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Get-HostingerWebsites {
    param([string]$Token)
    if ([string]::IsNullOrWhiteSpace($Token)) { throw 'Conecte a API Hostinger antes de consultar os sites.' }
    $headers = @{ Authorization = "Bearer $Token"; Accept = 'application/json' }
    $items = [System.Collections.Generic.List[object]]::new()
    $page = 1
    $perPage = 100
    $total = $null
    do {
        $uri = "https://developers.hostinger.com/api/hosting/v1/websites?page=$page`&per_page=$perPage"
        try {
            Wait-HostingerRequestSlot
            $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -TimeoutSec 30
        } catch {
            $statusCode = 0
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
            if ($statusCode -in @(401, 403)) { throw 'A Hostinger recusou o token ou ele não tem acesso a esta API. Confira o token no hPanel.' }
            if ($statusCode -eq 429) { throw 'A Hostinger limitou as consultas temporariamente. Aguarde um pouco e tente novamente.' }
            if ($statusCode -ge 500) { throw 'A API da Hostinger está instável. Tente novamente mais tarde.' }
            throw 'A consulta à Hostinger falhou. Confira a conexão e tente novamente.'
        }
        $pageItems = @()
        if ($response -is [Array]) { $pageItems = @($response) }
        elseif ($null -ne $response.PSObject.Properties['data']) { $pageItems = @($response.data) }
        elseif ($null -ne $response.PSObject.Properties['items']) { $pageItems = @($response.items) }
        elseif ($null -ne $response.PSObject.Properties['websites']) { $pageItems = @($response.websites) }
        foreach ($pageItem in $pageItems) { if ($null -ne $pageItem) { $items.Add($pageItem) } }
        if ($null -ne $response -and $null -ne $response.PSObject.Properties['meta']) {
            $meta = $response.meta
            if ($null -ne $meta -and $null -ne $meta.PSObject.Properties['total']) {
                $parsedTotal = 0
                if ([int]::TryParse([string]$meta.total, [ref]$parsedTotal)) { $total = $parsedTotal }
            }
        }
        if ($pageItems.Count -eq 0) { break }
        $page++
        if ($page -gt 51 -and ($null -eq $total -or (($page - 1) * $perPage) -lt $total)) {
            throw 'A lista ultrapassou o limite seguro de paginação deste MVP. Reduza o escopo da conta Hostinger e tente novamente.'
        }
    } while (($null -ne $total -and (($page - 1) * $perPage) -lt $total) -or ($null -eq $total -and $pageItems.Count -ge $perPage))
    $sites = [System.Collections.Generic.List[object]]::new()
    $creationDateDiagnostics = @{ websiteCount = 0; fieldCount = 0; normalizedCount = 0 }
    foreach ($item in $items) {
        if ($null -eq $item) { continue }
        $domain = [string]$item.domain
        if ($domain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { continue }
        $creationDateDiagnostics.websiteCount++
        $username = [string]$item.username
        if ([string]::IsNullOrWhiteSpace($username)) { $username = [string]$item.account_username }
        $status = [string]$item.status
        if ([string]::IsNullOrWhiteSpace($status) -and $null -ne $item.PSObject.Properties['is_enabled']) {
            $status = if ([bool]$item.is_enabled) { 'Habilitado' } else { 'Desabilitado' }
        }
        $websiteType = [string]$item.website_type
        $createdAtValue = $null
        $createdAtProperty = $item.PSObject.Properties | Where-Object { $_.Name -ieq 'created_at' -or $_.Name -ieq 'createdAt' } | Select-Object -First 1
        if ($null -ne $createdAtProperty) { $createdAtValue = $createdAtProperty.Value }
        $createdAt = ''
        if ($null -ne $createdAtValue -and -not [string]::IsNullOrWhiteSpace([string]$createdAtValue)) {
            $creationDateDiagnostics.fieldCount++
            if ($createdAtValue -is [DateTimeOffset]) { $createdAt = $createdAtValue.ToUniversalTime().ToString('o') }
            elseif ($createdAtValue -is [DateTime]) { $createdAt = $createdAtValue.ToUniversalTime().ToString('o') }
            else { $createdAt = [string]$createdAtValue }
            $parsedCreatedAt = [DateTimeOffset]::MinValue
            if ([DateTimeOffset]::TryParse($createdAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$parsedCreatedAt)) {
                $createdAt = $parsedCreatedAt.ToUniversalTime().ToString('o')
                $creationDateDiagnostics.normalizedCount++
            }
        }
        if ($username.Length -gt 80) { $username = $username.Substring(0, 80) }
        if ($status.Length -gt 40) { $status = $status.Substring(0, 40) }
        if ($websiteType.Length -gt 40) { $websiteType = $websiteType.Substring(0, 40) }
        if ($createdAt.Length -gt 50) { $createdAt = $createdAt.Substring(0, 50) }
        $sites.Add([PSCustomObject]@{ domain = $domain.ToLowerInvariant(); username = $username; status = $status; websiteType = $websiteType; createdAt = $createdAt })
    }
    $mergedSites = @(Merge-HostingerCreatedSubdomains -Sites @($sites.ToArray()))
    return @{ sites = $mergedSites; checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o'); creationDateDiagnostics = $creationDateDiagnostics }
}

function Get-HostingerDomainPortfolio {
    param([string]$Token)
    if ([string]::IsNullOrWhiteSpace($Token)) { throw 'Conecte a API Hostinger antes de consultar o portfólio de domínios.' }
    $headers = @{ Authorization = "Bearer $Token"; Accept = 'application/json' }
    $items = [System.Collections.Generic.List[object]]::new()
    $page = 1
    $perPage = 100
    $total = $null
    do {
        $uri = "https://developers.hostinger.com/api/domains/v1/portfolio?page=$page`&per_page=$perPage"
        try {
            Wait-HostingerRequestSlot
            $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -TimeoutSec 30
        } catch {
            $statusCode = 0
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
            if ($statusCode -in @(401, 403)) { throw 'A Hostinger recusou o token ou ele não tem acesso à API de domínios. Confira as permissões do token no hPanel.' }
            if ($statusCode -eq 429) { throw 'A Hostinger limitou as consultas temporariamente. Aguarde um pouco e tente novamente.' }
            if ($statusCode -ge 500) { throw 'A API de domínios da Hostinger está instável. Tente novamente mais tarde.' }
            throw 'Não foi possível consultar o portfólio de domínios da Hostinger.'
        }
        $pageItems = @()
        if ($response -is [Array]) { $pageItems = @($response) }
        elseif ($null -ne $response.PSObject.Properties['data']) { $pageItems = @($response.data) }
        elseif ($null -ne $response.PSObject.Properties['items']) { $pageItems = @($response.items) }
        elseif ($null -ne $response.PSObject.Properties['domains']) { $pageItems = @($response.domains) }
        foreach ($item in $pageItems) { if ($null -ne $item) { $items.Add($item) } }
        if ($null -ne $response -and $null -ne $response.PSObject.Properties['meta']) {
            $parsedTotal = 0
            if ([int]::TryParse([string]$response.meta.total, [ref]$parsedTotal)) { $total = $parsedTotal }
        }
        if ($pageItems.Count -eq 0) { break }
        $page++
        if ($page -gt 51 -and ($null -eq $total -or (($page - 1) * $perPage) -lt $total)) {
            throw 'O portfólio ultrapassou o limite seguro de paginação deste MVP.'
        }
    } while (($null -ne $total -and (($page - 1) * $perPage) -lt $total) -or ($null -eq $total -and $pageItems.Count -ge $perPage))
    $domains = [System.Collections.Generic.List[object]]::new()
    $seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($item in $items) {
        $domain = [string]$item.domain
        if ($domain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$') { continue }
        $domain = $domain.ToLowerInvariant()
        if (-not $seen.Add($domain)) { continue }
        $status = [string]$item.status
        $createdAtValue = $null
        if ($null -ne $item.PSObject.Properties['createdAt']) { $createdAtValue = $item.createdAt }
        elseif ($null -ne $item.PSObject.Properties['created_at']) { $createdAtValue = $item.created_at }
        if ($createdAtValue -is [DateTimeOffset]) { $createdAt = $createdAtValue.ToUniversalTime().ToString('o') }
        elseif ($createdAtValue -is [DateTime]) { $createdAt = $createdAtValue.ToUniversalTime().ToString('o') }
        else { $createdAt = [string]$createdAtValue }
        if ($status.Length -gt 40) { $status = $status.Substring(0, 40) }
        if ($createdAt.Length -gt 40) { $createdAt = $createdAt.Substring(0, 40) }
        $domains.Add([PSCustomObject]@{ domain = $domain; status = $status; createdAt = $createdAt })
    }
    return @{ domains = @($domains.ToArray()); checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o') }
}

function New-HostingerSubdomain {
    param([string]$Body)
    if (-not (Test-Path -LiteralPath $hostingerTokenPath -PathType Leaf)) { throw 'Conecte a API Hostinger antes de criar um subdomínio.' }
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Os dados do subdomínio não puderam ser lidos.' }
    if ($payload.confirmed -ne $true) { throw 'Confirme a criação do subdomínio antes de continuar.' }

    $parentDomain = ([string]$payload.parentDomain).Trim().ToLowerInvariant()
    $username = ([string]$payload.username).Trim()
    $prefix = ([string]$payload.prefix).Trim().ToLowerInvariant()
    $directory = ([string]$payload.directory).Trim().Trim('/')
    if ($parentDomain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { throw 'Selecione um domínio principal Hostinger válido.' }
    if ($username -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'Selecione uma conta Hostinger válida.' }
    if ($prefix -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') { throw 'Informe um prefixo DNS válido, como “teste”, sem pontos ou espaços.' }
    $domain = "$prefix.$parentDomain"
    if ($domain.Length -gt 253) { throw 'O endereço completo do subdomínio ultrapassa o limite de DNS.' }
    if (-not $directory) { throw 'Informe a pasta que será usada como raiz do subdomínio.' }
    if ($directory -match '[\\:?*"<>|#%\x00-\x1f]' -or $directory -match '(^|/)\.\.?(/|$)' -or @($directory -split '/' | Where-Object { $_ -notmatch '^[\p{L}\p{N}._ -]+$' -or $_ -in @('.', '..') }).Count -gt 0) {
        throw 'Use um caminho relativo seguro, com nomes simples de pasta separados por /.'
    }
    $cache = Get-HostingerSitesCache
    $parent = @($cache.sites | Where-Object { [string]$_.domain -ieq $parentDomain -and [string]$_.username -ceq $username -and [string]$_.websiteType -ne 'subdomain' } | Select-Object -First 1)
    if ($parent.Count -eq 0) { throw 'O site principal não está na lista salva. Atualize os sites e tente novamente.' }
    if ([string]$parent[0].status -match '^(?i:disabled|desabilitado|inativo)$') { throw 'O site principal está desabilitado na Hostinger.' }
    if (@($cache.sites | Where-Object { [string]$_.domain -ieq $domain -and [string]$_.username -ceq $username }).Count -gt 0) { throw 'Esse subdomínio já aparece na lista deste site.' }

    $token = Get-HostingerToken
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Conecte a API Hostinger antes de criar um subdomínio.' }
    $inventoryCheck = Get-HostingerSubdomainInventoryMatch -ParentDomain $parentDomain -Username $username -Domain $domain -Token $token -Attempts 1
    if ($null -ne $inventoryCheck.subdomain) {
        return (New-HostingerConfirmedSubdomainResult -Subdomain $inventoryCheck.subdomain -CachedSites @($cache.sites) -CheckedAtUtc ([string]$cache.checkedAtUtc) -FallbackDirectory $directory)
    }
    $encodedUsername = [Uri]::EscapeDataString($username)
    $encodedParent = [Uri]::EscapeDataString($parentDomain)
    $uri = "https://developers.hostinger.com/api/hosting/v1/accounts/$encodedUsername/websites/$encodedParent/subdomains"
    $headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
    $requestBody = @{ subdomain = $prefix; directory = $directory; is_using_public_directory = $false } | ConvertTo-Json -Compress
    try {
        Wait-HostingerRequestSlot
        Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -ContentType 'application/json' -Body $requestBody -TimeoutSec 30 | Out-Null
    } catch {
        $failureContext = Get-HostingerFailureContext -ErrorRecord $_
        $statusCode = [int]$failureContext.statusCode
        $apiDetail = if ([string]::IsNullOrWhiteSpace([string]$failureContext.apiError)) { '' } else { " Detalhe da Hostinger: $($failureContext.apiError)." }
        $correlationDetail = if ([string]::IsNullOrWhiteSpace([string]$failureContext.correlationId)) { '' } else { " Referência Hostinger (correlation_id): $($failureContext.correlationId)." }
        if ($statusCode -in @(401, 403)) { throw 'A Hostinger recusou a criação. Confira se o token permite gerenciar domínios e subdomínios.' }
        if ($statusCode -eq 404) { throw "A Hostinger não encontrou o site ou domínio principal '$parentDomain'.$apiDetail$correlationDetail" }
        if ($statusCode -eq 409) {
            $inventoryCheck = Get-HostingerSubdomainInventoryMatch -ParentDomain $parentDomain -Username $username -Domain $domain -Token $token -Attempts 3
            if ($null -ne $inventoryCheck.subdomain) {
                return (New-HostingerConfirmedSubdomainResult -Subdomain $inventoryCheck.subdomain -CachedSites @($cache.sites) -CheckedAtUtc ([string]$cache.checkedAtUtc) -FallbackDirectory $directory)
            }
            throw "A Hostinger informou que '$domain' já existe, mas a consulta específica ainda não o confirmou. Atualize a lista de subdomínios antes de tentar novamente."
        }
        if ($statusCode -eq 422) {
            if ([string]$failureContext.apiError -match '(?i)(already exists|already registered|duplicate|subdomain.{0,30}exist|já existe)') {
                $inventoryCheck = Get-HostingerSubdomainInventoryMatch -ParentDomain $parentDomain -Username $username -Domain $domain -Token $token -Attempts 3
                if ($null -ne $inventoryCheck.subdomain) {
                    return (New-HostingerConfirmedSubdomainResult -Subdomain $inventoryCheck.subdomain -CachedSites @($cache.sites) -CheckedAtUtc ([string]$cache.checkedAtUtc) -FallbackDirectory $directory)
                }
            }
            if (-not [string]::IsNullOrWhiteSpace([string]$failureContext.apiError)) {
                throw "A Hostinger recusou a criação de '$domain' (HTTP 422).$apiDetail$correlationDetail Corrija o campo indicado na resposta; nenhum arquivo foi enviado."
            }
            throw "A Hostinger recusou a criação de '$domain' (HTTP 422), mas não informou qual campo falhou. Prefixo enviado: '$prefix'; pasta relativa enviada: '$directory'.$correlationDetail Confira se o prefixo é aceito, se a pasta é relativa à raiz do site e se o plano permite novos subdomínios. Nenhum arquivo foi enviado."
        }
        if ($statusCode -eq 429) { throw 'A Hostinger limitou as solicitações. Aguarde um pouco e tente novamente.' }
        if ($statusCode -eq 0 -or $statusCode -ge 500) {
            $inventoryCheck = Get-HostingerSubdomainInventoryMatch -ParentDomain $parentDomain -Username $username -Domain $domain -Token $token -Attempts 3
            if ($null -ne $inventoryCheck.subdomain) {
                return (New-HostingerConfirmedSubdomainResult -Subdomain $inventoryCheck.subdomain -CachedSites @($cache.sites) -CheckedAtUtc ([string]$cache.checkedAtUtc) -FallbackDirectory $directory)
            }
            try {
                $verification = Get-HostingerWebsites -Token $token
                $confirmedSite = @($verification.sites | Where-Object { [string]$_.domain -ieq $domain -and [string]$_.username -ceq $username } | Select-Object -First 1)
                if ($confirmedSite.Count -gt 0) {
                    return (New-HostingerConfirmedSubdomainResult -Subdomain ([PSCustomObject]@{ domain = $domain; parentDomain = $parentDomain; username = $username; prefix = $prefix; rootDirectory = $directory }) -CachedSites @($verification.sites) -CheckedAtUtc ([string]$verification.checkedAtUtc) -FallbackDirectory $directory)
                }
            } catch { }
            $httpDetail = if ($statusCode -gt 0) { " HTTP $statusCode." } else { '' }
            throw "A API da Hostinger respondeu com erro e não foi possível confirmar a criação de '$domain' no inventário de subdomínios ou na lista de sites.$httpDetail$apiDetail$correlationDetail Atualize o inventário antes de tentar novamente."
        }
        throw 'Não foi possível criar o subdomínio na Hostinger. Confira a conexão e os dados do site.'
    }

    $site = [PSCustomObject]@{ domain = $domain; username = $username; status = 'Habilitado'; websiteType = 'subdomain'; parentDomain = $parentDomain; rootDirectory = $directory; createdAt = [DateTimeOffset]::UtcNow.ToString('o') }
    Remove-HostingerAbsentSubdomain -Domain $domain -Username $username
    Save-HostingerCreatedSubdomain -Site $site
    $updatedSites = @(Merge-HostingerCreatedSubdomains -Sites @($cache.sites))
    $result = Save-HostingerSitesCache -Result @{ sites = $updatedSites; checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o') }
    return @{ site = $site; sites = @($result.sites); checkedAtUtc = [string]$result.checkedAtUtc }
}

function Get-HostingerSubdomainsFromApi {
    param([string]$ParentDomain, [string]$Username, [string]$Token)
    if ([string]::IsNullOrWhiteSpace($Token)) { throw 'Conecte a API Hostinger antes de consultar os subdomínios.' }
    $encodedUsername = [Uri]::EscapeDataString($Username)
    $encodedParent = [Uri]::EscapeDataString($ParentDomain)
    $uri = "https://developers.hostinger.com/api/hosting/v1/accounts/$encodedUsername/websites/$encodedParent/subdomains"
    $headers = @{ Authorization = "Bearer $Token"; Accept = 'application/json' }
    try {
        Wait-HostingerRequestSlot
        $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -TimeoutSec 30
    } catch {
        $failureContext = Get-HostingerFailureContext -ErrorRecord $_
        $statusCode = [int]$failureContext.statusCode
        $detail = if ([string]::IsNullOrWhiteSpace([string]$failureContext.apiError)) { '' } else { " Detalhe da Hostinger: $($failureContext.apiError)." }
        if ($statusCode -in @(401, 403)) { throw 'A Hostinger recusou a consulta. Confira se o token permite listar subdomínios.' }
        if ($statusCode -eq 404) { throw "A Hostinger não encontrou o site principal '$ParentDomain'.$detail" }
        if ($statusCode -eq 429) { throw 'A Hostinger limitou as consultas. Aguarde um pouco e atualize a lista novamente.' }
        if ($statusCode -ge 500) { throw 'A API da Hostinger está instável ao listar os subdomínios. Tente novamente mais tarde.' }
        throw "Não foi possível listar os subdomínios de '$ParentDomain' (HTTP $statusCode).$detail"
    }

    $items = @()
    if ($response -is [Array]) { $items = @($response) }
    elseif ($null -ne $response -and $null -ne $response.PSObject.Properties['data']) { $items = @($response.data) }
    elseif ($null -ne $response -and $null -ne $response.PSObject.Properties['items']) { $items = @($response.items) }
    elseif ($null -ne $response -and $null -ne $response.PSObject.Properties['subdomains']) { $items = @($response.subdomains) }

    $subdomains = [System.Collections.Generic.List[object]]::new()
    foreach ($item in $items) {
        if ($null -eq $item) { continue }
        $itemParent = ([string]$item.parent_domain).Trim().ToLowerInvariant()
        if (-not $itemParent) { $itemParent = $ParentDomain }
        if ($itemParent -ine $ParentDomain) { continue }
        $domain = ([string]$item.domain).Trim().ToLowerInvariant()
        $prefix = ([string]$item.subdomain).Trim().ToLowerInvariant()
        $fullPrefixPattern = '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.' + [regex]::Escape($ParentDomain) + '$'
        if ($prefix -match $fullPrefixPattern) {
            $domain = $prefix
            $prefix = $prefix.Substring(0, $prefix.Length - $ParentDomain.Length - 1)
        }
        if (-not $prefix -and $domain.EndsWith(".$ParentDomain", [StringComparison]::OrdinalIgnoreCase)) {
            $prefix = $domain.Substring(0, $domain.Length - $ParentDomain.Length - 1)
        }
        if ($prefix -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') { continue }
        $expectedDomain = "$prefix.$ParentDomain"
        if (-not $domain) { $domain = $expectedDomain }
        if ($domain -ine $expectedDomain) { continue }
        $itemUsername = [string]$item.username
        if ([string]::IsNullOrWhiteSpace($itemUsername)) { $itemUsername = $Username }
        if ($itemUsername -cne $Username) { continue }
        $rootDirectory = ([string]$item.root_directory -replace '[\x00-\x1f]', '').Trim()
        if ($rootDirectory.Length -gt 500) { $rootDirectory = $rootDirectory.Substring(0, 500) }
        $subdomains.Add([PSCustomObject]@{
            domain = $domain
            parentDomain = $ParentDomain
            username = $Username
            prefix = $prefix
            rootDirectory = $rootDirectory
        })
        if ($subdomains.Count -gt 500) { throw "A lista de subdomínios de '$ParentDomain' ultrapassou o limite seguro de 500 itens." }
    }
    return @($subdomains.ToArray())
}

function Get-HostingerSubdomainInventoryMatch {
    param([string]$ParentDomain, [string]$Username, [string]$Domain, [string]$Token, [int]$Attempts = 1)
    $attemptLimit = [Math]::Max(1, [Math]::Min(3, $Attempts))
    for ($attempt = 1; $attempt -le $attemptLimit; $attempt++) {
        try {
            $matches = @(Get-HostingerSubdomainsFromApi -ParentDomain $ParentDomain -Username $Username -Token $Token | Where-Object { [string]$_.domain -ieq $Domain -and [string]$_.username -ceq $Username })
            if ($matches.Count -gt 0) {
                return @{ subdomain = $matches[0]; checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o'); error = '' }
            }
        } catch {
            if ($attempt -eq $attemptLimit) {
                return @{ subdomain = $null; checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o'); error = [string]$_.Exception.Message }
            }
        }
    }
    return @{ subdomain = $null; checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o'); error = '' }
}

function New-HostingerConfirmedSubdomainResult {
    param([object]$Subdomain, [object[]]$CachedSites, [string]$CheckedAtUtc, [string]$FallbackDirectory)
    $domain = ([string]$Subdomain.domain).Trim().ToLowerInvariant()
    $username = ([string]$Subdomain.username).Trim()
    $parentDomain = ([string]$Subdomain.parentDomain).Trim().ToLowerInvariant()
    $confirmed = @($CachedSites | Where-Object { [string]$_.domain -ieq $domain -and [string]$_.username -ceq $username } | Select-Object -First 1)
    $siteRecord = [ordered]@{}
    if ($confirmed.Count -gt 0) {
        foreach ($property in $confirmed[0].PSObject.Properties) { $siteRecord[$property.Name] = $property.Value }
    }
    $rootDirectory = ([string]$Subdomain.rootDirectory).Trim()
    if ([string]::IsNullOrWhiteSpace($rootDirectory)) { $rootDirectory = $FallbackDirectory }
    $siteRecord['domain'] = $domain
    $siteRecord['username'] = $username
    $siteRecord['websiteType'] = 'subdomain'
    $siteRecord['parentDomain'] = $parentDomain
    $siteRecord['rootDirectory'] = $rootDirectory
    if ([string]::IsNullOrWhiteSpace([string]$siteRecord['status'])) { $siteRecord['status'] = 'Não informado' }
    if ($null -eq $siteRecord['createdAt']) { $siteRecord['createdAt'] = '' }
    $subdomainCheckedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    $siteRecord['subdomainCheckedAtUtc'] = $subdomainCheckedAtUtc
    $site = [PSCustomObject]$siteRecord

    $sites = [System.Collections.Generic.List[object]]::new()
    foreach ($cachedSite in $CachedSites) {
        if ($null -eq $cachedSite) { continue }
        if ([string]$cachedSite.domain -ieq $domain -and [string]$cachedSite.username -ceq $username) { continue }
        $sites.Add($cachedSite)
    }
    $sites.Add($site)
    $savedCache = Save-HostingerSitesCache -Result @{ sites = @($sites.ToArray()); checkedAtUtc = $CheckedAtUtc }
    return @{
        site = $site
        sites = @($savedCache.sites)
        checkedAtUtc = $CheckedAtUtc
        confirmedExisting = $true
        confirmationSource = 'subdomain_inventory'
        subdomainCheckedAtUtc = $subdomainCheckedAtUtc
    }
}

function Get-HostingerSubdomains {
    param([string]$Body)
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Os domínios para consultar não puderam ser lidos.' }
    $parents = @($payload.parents | Where-Object { $null -ne $_ })
    if ($parents.Count -lt 1 -or $parents.Count -gt 50) { throw 'Selecione entre 1 e 50 sites principais para listar subdomínios.' }
    $cache = Get-HostingerSitesCache
    $token = Get-HostingerToken
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Conecte a API Hostinger antes de consultar os subdomínios.' }
    $seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $subdomains = [System.Collections.Generic.List[object]]::new()
    foreach ($parent in $parents) {
        $parentDomain = ([string]$parent.parentDomain).Trim().ToLowerInvariant()
        $username = ([string]$parent.username).Trim()
        if ($parentDomain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { throw 'A lista contém um site principal inválido.' }
        if ($username -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'A lista contém uma conta Hostinger inválida.' }
        $site = @($cache.sites | Where-Object { [string]$_.domain -ieq $parentDomain -and [string]$_.username -ceq $username -and [string]$_.websiteType -ne 'subdomain' } | Select-Object -First 1)
        if ($site.Count -eq 0) { throw "O site principal '$parentDomain' não está na lista local da Hostinger. Atualize os sites e tente novamente." }
        $key = "$username|$parentDomain"
        if (-not $seen.Add($key)) { continue }
        foreach ($subdomain in @(Get-HostingerSubdomainsFromApi -ParentDomain $parentDomain -Username $username -Token $token)) { $subdomains.Add($subdomain) }
    }
    Clear-HostingerAbsentSubdomains -Subdomains @($subdomains.ToArray())
    return @{ subdomains = @($subdomains.ToArray()); checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o') }
}

function Remove-HostingerCreatedSubdomain {
    param([string]$Domain, [string]$Username)
    if (-not (Test-Path -LiteralPath $hostingerCreatedSubdomainsPath -PathType Leaf)) { return }
    $existing = @(Get-HostingerCreatedSubdomains)
    $remaining = @($existing | Where-Object { -not ([string]$_.domain -ieq $Domain -and [string]$_.username -ceq $Username) })
    if ($remaining.Count -eq $existing.Count) { return }
    $payload = @{ subdomains = $remaining }
    $directory = Split-Path -Parent $hostingerCreatedSubdomainsPath
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporaryPath = "$hostingerCreatedSubdomainsPath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporaryPath, ($payload | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryPath -Destination $hostingerCreatedSubdomainsPath -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
}

function Update-HostingerLocalInventoryAfterSubdomainAbsence {
    param([string]$Domain, [string]$Username, [string]$ParentDomain)
    Add-HostingerAbsentSubdomain -Domain $Domain -Username $Username -ParentDomain $ParentDomain
    Remove-HostingerCreatedSubdomain -Domain $Domain -Username $Username
    $latestCache = Get-HostingerSitesCache
    $remainingSites = @($latestCache.sites | Where-Object { -not ([string]$_.domain -ieq $Domain -and [string]$_.username -ceq $Username) })
    $savedCache = Save-HostingerSitesCache -Result @{ sites = $remainingSites; checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o') }
    return [string]$savedCache.checkedAtUtc
}

function Get-HostingerSubdomainDeletionVerification {
    param([string]$Body)
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Os dados do subdomínio não puderam ser lidos.' }
    $parentDomain = ([string]$payload.parentDomain).Trim().ToLowerInvariant()
    $username = ([string]$payload.username).Trim()
    $prefix = ([string]$payload.prefix).Trim().ToLowerInvariant()
    if ($parentDomain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { throw 'Selecione um domínio principal Hostinger válido.' }
    if ($username -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'Selecione uma conta Hostinger válida.' }
    if ($prefix -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') { throw 'O subdomínio selecionado não tem um prefixo válido.' }
    $domain = "$prefix.$parentDomain"
    if ($domain -ieq 'track.travenzo.shop') { throw "O subdomínio '$domain' hospeda dados do servidor da aplicação do Hub e não pode ser reconciliado por esta ação." }
    $cache = Get-HostingerSitesCache
    if (@($cache.sites | Where-Object { [string]$_.domain -ieq $parentDomain -and [string]$_.username -ceq $username -and [string]$_.websiteType -ne 'subdomain' }).Count -eq 0) {
        throw "O site principal '$parentDomain' não está na lista local da Hostinger. Atualize os sites antes de verificar."
    }
    $token = Get-HostingerToken
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Conecte a API Hostinger antes de verificar a exclusão.' }
    $current = @(Get-HostingerSubdomainsFromApi -ParentDomain $parentDomain -Username $username -Token $token)
    Clear-HostingerAbsentSubdomains -Subdomains $current
    $exists = @($current | Where-Object { [string]$_.domain -ieq $domain -and [string]$_.username -ceq $username }).Count -gt 0
    $checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    if ($exists) {
        return @{ exists = $true; domain = $domain; parentDomain = $parentDomain; username = $username; checkedAtUtc = $checkedAtUtc }
    }
    $checkedAtUtc = Update-HostingerLocalInventoryAfterSubdomainAbsence -Domain $domain -Username $username -ParentDomain $parentDomain
    return @{ exists = $false; reconciled = $true; domain = $domain; parentDomain = $parentDomain; username = $username; checkedAtUtc = $checkedAtUtc }
}

function Remove-HostingerSubdomain {
    param([string]$Body)
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Os dados do subdomínio não puderam ser lidos.' }
    if ($payload.confirmed -ne $true) { throw 'Confirme a exclusão do subdomínio antes de continuar.' }
    $parentDomain = ([string]$payload.parentDomain).Trim().ToLowerInvariant()
    $username = ([string]$payload.username).Trim()
    $prefix = ([string]$payload.prefix).Trim().ToLowerInvariant()
    if ($parentDomain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { throw 'Selecione um domínio principal Hostinger válido.' }
    if ($username -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'Selecione uma conta Hostinger válida.' }
    if ($prefix -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') { throw 'O subdomínio selecionado não tem um prefixo válido.' }
    $domain = "$prefix.$parentDomain"
    if ($domain -ieq 'track.travenzo.shop') { throw "O subdomínio '$domain' hospeda dados do servidor da aplicação do Hub e está protegido contra exclusão." }
    $cache = Get-HostingerSitesCache
    if (@($cache.sites | Where-Object { [string]$_.domain -ieq $parentDomain -and [string]$_.username -ceq $username -and [string]$_.websiteType -ne 'subdomain' }).Count -eq 0) {
        throw "O site principal '$parentDomain' não está na lista local da Hostinger. Atualize os sites antes de excluir."
    }
    $token = Get-HostingerToken
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Conecte a API Hostinger antes de excluir um subdomínio.' }
    $current = @(Get-HostingerSubdomainsFromApi -ParentDomain $parentDomain -Username $username -Token $token)
    Clear-HostingerAbsentSubdomains -Subdomains $current
    if (@($current | Where-Object { [string]$_.domain -ieq $domain -and [string]$_.username -ceq $username }).Count -eq 0) {
        $checkedAtUtc = Update-HostingerLocalInventoryAfterSubdomainAbsence -Domain $domain -Username $username -ParentDomain $parentDomain
        return @{ deleted = $false; alreadyAbsent = $true; domain = $domain; parentDomain = $parentDomain; username = $username; checkedAtUtc = $checkedAtUtc }
    }
    $encodedUsername = [Uri]::EscapeDataString($username)
    $encodedParent = [Uri]::EscapeDataString($parentDomain)
    $encodedPrefix = [Uri]::EscapeDataString($prefix)
    $uri = "https://developers.hostinger.com/api/hosting/v1/accounts/$encodedUsername/websites/$encodedParent/subdomains/$encodedPrefix"
    $headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
    try {
        Wait-HostingerRequestSlot
        Invoke-RestMethod -Uri $uri -Method Delete -Headers $headers -TimeoutSec 30 | Out-Null
    } catch {
        $failureContext = Get-HostingerFailureContext -ErrorRecord $_
        $statusCode = [int]$failureContext.statusCode
        $detail = if ([string]::IsNullOrWhiteSpace([string]$failureContext.apiError)) { '' } else { " Detalhe da Hostinger: $($failureContext.apiError)." }
        $correlation = if ([string]::IsNullOrWhiteSpace([string]$failureContext.correlationId)) { '' } else { " Referência Hostinger: $($failureContext.correlationId)." }
        if ($statusCode -in @(401, 403)) { throw 'A Hostinger recusou a exclusão. Confira se o token permite gerenciar subdomínios.' }
        if ($statusCode -eq 404) { throw "A Hostinger não encontrou '$domain' para excluir.$detail" }
        if ($statusCode -eq 429) { throw 'A Hostinger limitou as solicitações. Aguarde e atualize a análise antes de tentar excluir novamente.' }
        throw "A Hostinger não confirmou a exclusão de '$domain' (HTTP $statusCode).$detail$correlation"
    }
    $cacheWarning = ''
    try {
        Update-HostingerLocalInventoryAfterSubdomainAbsence -Domain $domain -Username $username -ParentDomain $parentDomain | Out-Null
    } catch {
        $cacheWarning = 'A Hostinger confirmou a exclusão, mas o cache local não foi atualizado. Atualize os sites Hostinger antes de continuar.'
    }
    return @{ deleted = $true; domain = $domain; parentDomain = $parentDomain; cacheWarning = $cacheWarning; checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o') }
}

function Get-HostingerFailureContext {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)
    $exception = $ErrorRecord.Exception
    $response = $null
    $webException = $null
    $deepestException = $exception
    for ($depth = 0; $null -ne $exception -and $depth -lt 8; $depth++) {
        if ($null -eq $webException -and $exception -is [Net.WebException]) { $webException = $exception }
        $responseProperty = $exception.PSObject.Properties['Response']
        if ($null -eq $response -and $null -ne $responseProperty -and $null -ne $responseProperty.Value) { $response = $responseProperty.Value }
        $deepestException = $exception
        $innerProperty = $exception.PSObject.Properties['InnerException']
        if ($null -eq $innerProperty -or $null -eq $innerProperty.Value) { break }
        $exception = $innerProperty.Value
    }

    $statusCode = 0
    if ($null -ne $response) {
        $statusProperty = $response.PSObject.Properties['StatusCode']
        if ($null -ne $statusProperty) { try { $statusCode = [int]$statusProperty.Value } catch { } }
    }
    $transportStatus = if ($null -ne $webException) { [string]$webException.Status } elseif ($null -ne $deepestException) { $deepestException.GetType().Name } else { '' }

    $responseBody = ''
    $errorDetailsProperty = $ErrorRecord.PSObject.Properties['ErrorDetails']
    if ($null -ne $errorDetailsProperty -and $null -ne $errorDetailsProperty.Value) {
        $messageProperty = $errorDetailsProperty.Value.PSObject.Properties['Message']
        if ($null -ne $messageProperty) { $responseBody = [string]$messageProperty.Value }
    }
    if ($responseBody.Length -gt 8192) { $responseBody = $responseBody.Substring(0, 8192) }
    if ([string]::IsNullOrWhiteSpace($responseBody) -and $null -ne $response) {
        try {
            $contentProperty = $response.PSObject.Properties['Content']
            if ($null -ne $contentProperty -and $null -ne $contentProperty.Value) {
                $contentTask = $contentProperty.Value.ReadAsStringAsync()
                $responseBody = [string]$contentTask.GetAwaiter().GetResult()
            }
        } catch { }
    }
    if ($responseBody.Length -gt 8192) { $responseBody = $responseBody.Substring(0, 8192) }
    if ([string]::IsNullOrWhiteSpace($responseBody) -and $response -is [Net.WebResponse]) {
        try {
            $stream = $response.GetResponseStream()
            if ($null -ne $stream) {
                $buffer = New-Object byte[] 8192
                $read = $stream.Read($buffer, 0, $buffer.Length)
                if ($read -gt 0) { $responseBody = [Text.Encoding]::UTF8.GetString($buffer, 0, $read) }
            }
        } catch { }
    }

    $apiError = ''
    $correlationId = ''
    if (-not [string]::IsNullOrWhiteSpace($responseBody)) {
        try {
            $errorPayload = $responseBody | ConvertFrom-Json -ErrorAction Stop
            $apiErrorProperty = $errorPayload.PSObject.Properties['error']
            if ($null -ne $apiErrorProperty -and $apiErrorProperty.Value -is [string]) { $apiError = [string]$apiErrorProperty.Value }
            $correlationProperty = $errorPayload.PSObject.Properties['correlation_id']
            if ($null -eq $correlationProperty) { $correlationProperty = $errorPayload.PSObject.Properties['correlationId'] }
            if ($null -ne $correlationProperty -and $correlationProperty.Value -is [string]) { $correlationId = [string]$correlationProperty.Value }
            if ([string]::IsNullOrWhiteSpace($apiError)) {
                foreach ($propertyName in @('message', 'detail')) {
                    $detailProperty = $errorPayload.PSObject.Properties[$propertyName]
                    if ($null -ne $detailProperty -and $detailProperty.Value -is [string]) { $apiError = [string]$detailProperty.Value; break }
                }
            }
            $validationProperty = $errorPayload.PSObject.Properties['errors']
            if ($null -ne $validationProperty -and $null -ne $validationProperty.Value) {
                $validationParts = [System.Collections.Generic.List[string]]::new()
                $validationErrors = $validationProperty.Value
                if ($validationErrors -is [System.Collections.IEnumerable] -and $validationErrors -isnot [string] -and $validationErrors -isnot [System.Collections.IDictionary]) {
                    $validationFields = @([PSCustomObject]@{ Name = ''; Value = $validationErrors })
                } elseif ($validationErrors -is [System.Collections.IDictionary]) {
                    $validationFields = @($validationErrors.GetEnumerator() | ForEach-Object { [PSCustomObject]@{ Name = [string]$_.Key; Value = $_.Value } })
                } else {
                    $validationFields = @($validationErrors.PSObject.Properties | ForEach-Object { [PSCustomObject]@{ Name = [string]$_.Name; Value = $_.Value } })
                }
                foreach ($field in $validationFields) {
                    if ($validationParts.Count -ge 8) { break }
                    $fieldName = ([string]$field.Name -replace '[^A-Za-z0-9_. -]', '').Trim()
                    $fieldMessages = [System.Collections.Generic.List[string]]::new()
                    $fieldValue = $field.Value
                    if ($fieldValue -is [string]) { $fieldMessages.Add([string]$fieldValue) }
                    elseif ($fieldValue -is [System.Collections.IEnumerable] -and $fieldValue -isnot [System.Collections.IDictionary]) {
                        foreach ($entry in $fieldValue) {
                            if ($entry -is [string]) { $fieldMessages.Add([string]$entry) }
                            elseif ($null -ne $entry) {
                                foreach ($entryPropertyName in @('message', 'detail', 'error')) {
                                    $entryProperty = $entry.PSObject.Properties[$entryPropertyName]
                                    if ($null -ne $entryProperty -and $entryProperty.Value -is [string]) { $fieldMessages.Add([string]$entryProperty.Value); break }
                                }
                            }
                            if ($fieldMessages.Count -ge 3) { break }
                        }
                    } elseif ($null -ne $fieldValue) {
                        foreach ($entryPropertyName in @('message', 'detail', 'error')) {
                            $entryProperty = $fieldValue.PSObject.Properties[$entryPropertyName]
                            if ($null -ne $entryProperty -and $entryProperty.Value -is [string]) { $fieldMessages.Add([string]$entryProperty.Value); break }
                        }
                    }
                    if ($fieldMessages.Count -gt 0) {
                        $fieldLabel = if ([string]::IsNullOrWhiteSpace($fieldName)) { 'validação' } else { $fieldName }
                        $validationParts.Add("${fieldLabel}: $($fieldMessages -join ', ')")
                    }
                }
                if ($validationParts.Count -gt 0) {
                    $validationSummary = $validationParts -join '; '
                    $apiError = if ([string]::IsNullOrWhiteSpace($apiError)) { "Validação: $validationSummary" } else { "$apiError Validação: $validationSummary" }
                }
            }
        } catch { }
    }
    if ([string]::IsNullOrWhiteSpace($correlationId) -and $null -ne $response) {
        $candidateHeaders = @('x-correlation-id', 'correlation-id', 'x-request-id', 'request-id', 'x-requestid', 'x-amzn-requestid')
        foreach ($headerName in $candidateHeaders) {
            $headerValue = ''
            try {
                if ($response -is [Net.WebResponse]) {
                    $headerValue = [string]$response.Headers.Get($headerName)
                } else {
                    $responseHeadersProperty = $response.PSObject.Properties['Headers']
                    if ($null -ne $responseHeadersProperty -and $null -ne $responseHeadersProperty.Value) {
                        $headerValues = $responseHeadersProperty.Value.GetValues($headerName)
                        if ($null -ne $headerValues -and $headerValues.Count -gt 0) { $headerValue = [string]$headerValues[0] }
                    }
                    if ([string]::IsNullOrWhiteSpace($headerValue)) {
                        $contentProperty = $response.PSObject.Properties['Content']
                        $contentHeadersProperty = if ($null -ne $contentProperty -and $null -ne $contentProperty.Value) { $contentProperty.Value.PSObject.Properties['Headers'] } else { $null }
                        if ($null -ne $contentHeadersProperty -and $null -ne $contentHeadersProperty.Value) {
                            $headerValues = $contentHeadersProperty.Value.GetValues($headerName)
                            if ($null -ne $headerValues -and $headerValues.Count -gt 0) { $headerValue = [string]$headerValues[0] }
                        }
                    }
                }
            } catch { }
            if (-not [string]::IsNullOrWhiteSpace($headerValue)) { $correlationId = $headerValue; break }
        }
    }
    $apiError = ($apiError -replace '[\x00-\x1F\x7F]+', ' ' -replace '(?i)\bBearer\s+\S+', 'Bearer [oculto]' -replace '(?i)\b(auth_key|rest_auth_key|token)\s*[:=]\s*\S+', '$1=[oculto]').Trim()
    if ($apiError.Length -gt 480) { $apiError = $apiError.Substring(0, 480).TrimEnd() + '…' }
    $correlationId = ($correlationId -replace '[^A-Za-z0-9._:-]', '').Trim()
    if ($correlationId.Length -gt 120) { $correlationId = $correlationId.Substring(0, 120) }
    if ($null -ne $response) { try { $response.Close() } catch { } }
    return [PSCustomObject]@{ statusCode = $statusCode; transportStatus = $transportStatus; apiError = $apiError; correlationId = $correlationId }
}

function ConvertTo-HostingerRootRelativePath {
    param([string]$Path, [string]$Directory)
    $normalizedPath = ([string]$Path).Replace('\', '/').Trim('/')
    $normalizedDirectory = ([string]$Directory).Replace('\', '/').Trim('/')
    if ($normalizedPath -ieq 'public_html') { $normalizedPath = '' }
    elseif ($normalizedPath.StartsWith('public_html/', [StringComparison]::OrdinalIgnoreCase)) { $normalizedPath = $normalizedPath.Substring('public_html/'.Length) }
    if (-not $normalizedPath -or -not $normalizedDirectory) { return $normalizedPath }
    $directoryPrefix = "$normalizedDirectory/"
    if ($normalizedPath -ne $normalizedDirectory -and -not $normalizedPath.StartsWith($directoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        return "$normalizedDirectory/$normalizedPath"
    }
    return $normalizedPath
}

function ConvertTo-HostingerRemoteEntryMap {
    param([object[]]$Items, [string]$Directory)
    $entries = [System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
    foreach ($item in $Items) {
        if ($null -eq $item) { continue }
        $path = ConvertTo-HostingerRootRelativePath -Path ([string]$item.path) -Directory $Directory
        if (-not $path) { continue }
        $kind = ([string]$item.type).ToLowerInvariant()
        if ($kind -eq 'dir') { $kind = 'directory' }
        elseif ($kind -eq 'link') { $kind = 'symlink' }
        $sizeBytes = $null
        if ($kind -eq 'file') { $sizeBytes = [int64]$item.size_bytes }
        $entries[$path] = [PSCustomObject]@{ path = $path; type = $kind; sizeBytes = $sizeBytes }
    }
    foreach ($path in @($entries.Keys)) {
        $parent = $path
        while ($parent.Contains('/')) {
            $parent = $parent.Substring(0, $parent.LastIndexOf('/'))
            if ($parent -and -not $entries.ContainsKey($parent)) {
                $entries[$parent] = [PSCustomObject]@{ path = $parent; type = 'directory'; sizeBytes = $null }
            }
        }
    }
    return ,$entries
}

function Get-HostingerPublishPathCollision {
    param([string]$Path, [object]$RemoteEntries, [switch]$ExpectedDirectory)
    if (-not $RemoteEntries -or -not $RemoteEntries.ContainsKey($Path)) { return $null }
    $entry = $RemoteEntries[$Path]
    $type = [string]$entry.type
    if ($ExpectedDirectory) {
        if ($type -eq 'directory') { return $null }
        $kind = switch ($type) {
            'file' { 'file-blocks-directory' }
            'symlink' { 'symlink-blocks-directory' }
            default { 'other-blocks-directory' }
        }
    } else {
        $kind = switch ($type) {
            'file' { 'file' }
            'directory' { 'directory' }
            'symlink' { 'symlink' }
            default { 'other' }
        }
    }
    return [PSCustomObject]@{ path = $Path; kind = $kind; sizeBytes = $entry.sizeBytes }
}

function Get-HostingerRemoteFiles {
    param([string]$Token, [string]$Username, [string]$Domain, [string]$Directory)
    $usernamePart = [Uri]::EscapeDataString($Username)
    $domainPart = [Uri]::EscapeDataString($Domain)
    $baseUri = "https://developers.hostinger.com/api/hosting/v1/accounts/$usernamePart/domains/$domainPart/files"
    $allItems = [System.Collections.Generic.List[object]]::new()
    $offset = 0
    $total = $null
    do {
        $query = "max_depth=10`&max_items=1000`&offset=$offset"
        if (-not [string]::IsNullOrWhiteSpace($Directory)) { $query += "`&directory=$([Uri]::EscapeDataString($Directory))" }
        try {
            Wait-HostingerRequestSlot
            $response = Invoke-RestMethod -Uri "$baseUri`?$query" -Method Get -Headers @{ Authorization = "Bearer $Token"; Accept = 'application/json' } -TimeoutSec 30
        } catch {
            $failureContext = Get-HostingerFailureContext -ErrorRecord $_
            $statusCode = [int]$failureContext.statusCode
            $apiDetail = if ([string]::IsNullOrWhiteSpace([string]$failureContext.apiError)) { '' } else { " Detalhe informado pela Hostinger: $($failureContext.apiError)." }
            $correlationDetail = if ([string]::IsNullOrWhiteSpace([string]$failureContext.correlationId)) { '' } else { " Referência Hostinger (correlation_id): $($failureContext.correlationId)." }
            if ($statusCode -in @(401, 403)) { throw 'O token Hostinger não tem acesso de leitura aos arquivos deste site.' }
            if ($statusCode -eq 404 -or $statusCode -eq 422) { throw "A pasta remota '$Directory' não foi encontrada ou não está acessível. Confira o destino no hPanel." }
            if ($statusCode -eq 429) { throw 'A Hostinger limitou a consulta de arquivos. Aguarde um pouco e tente novamente.' }
            if ($statusCode -gt 0) {
                $failureTimeDetail = if ($statusCode -eq 500) { " Horário local da consulta: $([DateTimeOffset]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz', [Globalization.CultureInfo]::InvariantCulture))." } else { '' }
                throw "Não foi possível conferir os arquivos existentes no destino Hostinger (HTTP $statusCode).$apiDetail$correlationDetail$failureTimeDetail Nenhum arquivo foi enviado."
            }
            $transportStatus = [string]$failureContext.transportStatus
            if ([string]::IsNullOrWhiteSpace($transportStatus)) { $transportStatus = 'sem resposta de rede' }
            throw "Não foi possível conferir os arquivos existentes no destino Hostinger (falha de comunicação sem resposta HTTP: $transportStatus). Nenhum arquivo foi enviado."
        }
        foreach ($item in @($response.items)) { if ($null -ne $item) { $allItems.Add($item) } }
        $parsedTotal = 0
        if ($null -ne $response.PSObject.Properties['total_items'] -and [int]::TryParse([string]$response.total_items, [ref]$parsedTotal)) { $total = $parsedTotal }
        $pageCount = @($response.items).Count
        if ($pageCount -eq 0) { break }
        $offset += $pageCount
        if ($offset -ge 10000 -and $null -ne $total -and $offset -lt $total) { throw 'A pasta remota tem mais de 10.000 entradas. Escolha uma pasta de destino mais específica.' }
    } while ($null -ne $total -and $offset -lt $total)
    return @($allItems.ToArray())
}

function Get-HostingerPublishInventoryVerification {
    param([string]$Body)
    if (-not (Test-Path -LiteralPath $hostingerTokenPath -PathType Leaf)) { throw 'Conecte a API Hostinger antes de verificar os arquivos.' }
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Os dados da verificação dos arquivos não puderam ser lidos.' }

    $domain = ([string]$payload.domain).Trim().ToLowerInvariant()
    $storageDomain = ([string]$payload.storageDomain).Trim().ToLowerInvariant()
    $username = ([string]$payload.username).Trim()
    $targetDirectory = ([string]$payload.targetDirectory).Trim().Trim('/')
    $expectedFiles = @($payload.expectedFiles)
    if ($domain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { throw 'O endereço público da Pre-Sell não é válido para verificar os arquivos.' }
    if ($storageDomain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { throw 'Selecione um site principal Hostinger válido para verificar os arquivos.' }
    if ($username -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'Selecione uma conta Hostinger válida para verificar os arquivos.' }
    if ($targetDirectory -match '[\\:?*"<>|#%\x00-\x1f]' -or $targetDirectory -match '(^|/)\.\.?(/|$)') { throw 'A pasta remota não é um caminho relativo seguro.' }
    if ($targetDirectory -and @($targetDirectory -split '/' | Where-Object { $_ -notmatch '^[\p{L}\p{N}._ -]+$' -or $_ -in @('.', '..') }).Count -gt 0) { throw 'A pasta remota contém um nome inválido.' }
    if ($expectedFiles.Count -lt 1 -or $expectedFiles.Count -gt 200) { throw 'A prévia salva não contém uma quantidade válida de arquivos para conferir.' }

    $cache = Get-HostingerSitesCache
    if (@($cache.sites | Where-Object { [string]$_.domain -ieq $storageDomain -and [string]$_.username -ceq $username -and [string]$_.websiteType -ne 'subdomain' }).Count -eq 0) {
        throw "O site principal '$storageDomain' não está na lista local da Hostinger. Atualize os sites antes de verificar."
    }

    $remoteItems = @(Get-HostingerRemoteFiles -Token (Get-HostingerToken) -Username $username -Domain $storageDomain -Directory $targetDirectory)
    $remoteEntries = ConvertTo-HostingerRemoteEntryMap -Items $remoteItems -Directory $targetDirectory
    $returnedEntries = @($remoteItems | Select-Object -First 10 | ForEach-Object { [PSCustomObject]@{ path = [string]$_.path; type = [string]$_.type } })

    $results = [System.Collections.Generic.List[object]]::new()
    $expectedPaths = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $presentCount = 0
    $sizeMatchCount = 0
    $sizeMismatchCount = 0
    $missingCount = 0
    $pathTypeConflictCount = 0
    foreach ($file in $expectedFiles) {
        $remotePath = ([string]$file.remotePath).Replace('\', '/').Trim('/')
        $relativePath = ([string]$file.relativePath).Replace('\', '/').Trim('/')
        if (-not $remotePath) {
            if (-not $relativePath) { throw 'Um arquivo esperado não tem caminho relativo.' }
            $remotePath = if ($targetDirectory) { "$targetDirectory/$relativePath" } else { $relativePath }
        }
        if ($targetDirectory) {
            $requiredPrefix = "$targetDirectory/"
            if (-not $remotePath.StartsWith($requiredPrefix, [StringComparison]::Ordinal)) { throw 'Um caminho esperado está fora da pasta remota deste destino.' }
            $pathWithinTarget = $remotePath.Substring($requiredPrefix.Length)
        } else { $pathWithinTarget = $remotePath }
        if (-not $pathWithinTarget -or $pathWithinTarget -match '(^|/)\.\.?(/|$)' -or $pathWithinTarget -match '[\\:?*"<>|#%\x00-\x1f]') { throw 'Um caminho de arquivo esperado não é seguro para comparar.' }
        if (-not $expectedPaths.Add($remotePath)) { throw 'A prévia salva contém caminhos duplicados e não pode ser comparada.' }
        [int64]$expectedSize = 0
        if (-not [int64]::TryParse([string]$file.sizeBytes, [ref]$expectedSize) -or $expectedSize -lt 0) { throw 'Um tamanho esperado não é válido.' }
        if ($remoteEntries.ContainsKey($remotePath) -and [string]$remoteEntries[$remotePath].type -eq 'file') {
            $presentCount++
            $remoteSize = [int64]$remoteEntries[$remotePath].sizeBytes
            if ($remoteSize -eq $expectedSize) {
                $sizeMatchCount++
                $status = 'size-match'
            } else {
                $sizeMismatchCount++
                $status = 'size-mismatch'
            }
            $results.Add([PSCustomObject]@{ path = $remotePath; expectedSizeBytes = $expectedSize; remoteSizeBytes = $remoteSize; status = $status })
        } elseif ($remoteEntries.ContainsKey($remotePath)) {
            $pathTypeConflictCount++
            $results.Add([PSCustomObject]@{ path = $remotePath; expectedSizeBytes = $expectedSize; remoteSizeBytes = $null; remoteType = [string]$remoteEntries[$remotePath].type; status = 'path-type-conflict' })
        } else {
            $missingCount++
            $results.Add([PSCustomObject]@{ path = $remotePath; expectedSizeBytes = $expectedSize; remoteSizeBytes = $null; status = 'missing' })
        }
    }

    return @{
        available = $true
        domain = $domain
        storageDomain = $storageDomain
        targetDirectory = $targetDirectory
        queryDomain = $storageDomain
        queryDirectory = $targetDirectory
        returnedEntryCount = $remoteItems.Count
        returnedEntries = $returnedEntries
        expectedCount = $expectedFiles.Count
        presentCount = $presentCount
        sizeMatchCount = $sizeMatchCount
        sizeMismatchCount = $sizeMismatchCount
        missingCount = $missingCount
        pathTypeConflictCount = $pathTypeConflictCount
        allPathsPresent = $presentCount -eq $expectedFiles.Count
        allSizesMatch = $sizeMatchCount -eq $expectedFiles.Count
        contentVerified = $false
        checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        files = @($results.ToArray())
    }
}

function Get-HostingerFlattenedTextBytes {
    param([string]$Path, [object[]]$AssetMappings)
    $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
    if ($extension -notin @('.html','.htm','.css','.js','.mjs','.json','.svg','.xml','.webmanifest','.txt')) { return $null }

    $rawBytes = [IO.File]::ReadAllBytes($Path)
    $prefixLength = 0
    $encoding = [Text.UTF8Encoding]::new($false, $true)
    if ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
        $prefixLength = 3
    } elseif ($rawBytes.Length -ge 2 -and $rawBytes[0] -eq 0xFF -and $rawBytes[1] -eq 0xFE) {
        $prefixLength = 2
        $encoding = [Text.UnicodeEncoding]::new($false, $false, $true)
    } elseif ($rawBytes.Length -ge 2 -and $rawBytes[0] -eq 0xFE -and $rawBytes[1] -eq 0xFF) {
        $prefixLength = 2
        $encoding = [Text.UnicodeEncoding]::new($true, $false, $true)
    }

    try { $text = $encoding.GetString($rawBytes, $prefixLength, $rawBytes.Length - $prefixLength) }
    catch { throw 'Um arquivo de texto da Pre-Sell não está em UTF-8/UTF-16 e não pode ter seus caminhos de assets ajustados.' }
    $rewritten = $text
    foreach ($mapping in $AssetMappings) {
        $assetPath = [Regex]::Escape([string]$mapping.sourcePath)
        $pattern = "(?<![A-Za-z0-9._:/-])((?:\.\.?/|/)*)assets/$assetPath(?![A-Za-z0-9_.-])"
        $replacementName = ([string]$mapping.targetPath).Replace('$', '$$')
        # Use ${1} so filenames beginning with digits (01.png, 03.png) cannot
        # be parsed as part of the capture-group number, e.g. $103.png.
        $rewritten = [Regex]::Replace($rewritten, $pattern, ('${1}' + $replacementName), [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    if ($rewritten -ceq $text) { return $null }

    $contentBytes = $encoding.GetBytes($rewritten)
    $outputBytes = New-Object byte[] ($prefixLength + $contentBytes.Length)
    if ($prefixLength -gt 0) { [Array]::Copy($rawBytes, 0, $outputBytes, 0, $prefixLength) }
    [Array]::Copy($contentBytes, 0, $outputBytes, $prefixLength, $contentBytes.Length)
    return ,$outputBytes
}
function Get-HostingerPublishPlan {
    param([string]$Body)
    if (-not (Test-Path -LiteralPath $hostingerTokenPath -PathType Leaf)) { throw 'Conecte a API Hostinger antes de preparar a publicação.' }
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Os dados da publicação não puderam ser lidos.' }

    $domain = ([string]$payload.domain).Trim().ToLowerInvariant()
    $storageDomain = ([string]$payload.storageDomain).Trim().ToLowerInvariant()
    $username = ([string]$payload.username).Trim()
    if (-not $storageDomain) { $storageDomain = $domain }
    if ($domain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { throw 'Selecione um domínio Hostinger válido.' }
    if ($storageDomain -notmatch '^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') { throw 'Selecione um domínio principal Hostinger válido para os arquivos.' }
    if ($username -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'Selecione uma conta Hostinger válida.' }
    $cache = Get-HostingerSitesCache
    $site = @($cache.sites | Where-Object { [string]$_.domain -ieq $domain -and [string]$_.username -ceq $username } | Select-Object -First 1)
    if ($site.Count -eq 0) {
        $parentSite = @($cache.sites | Where-Object { [string]$_.domain -ieq $storageDomain -and [string]$_.username -ceq $username -and [string]$_.websiteType -ne 'subdomain' } | Select-Object -First 1)
        if ($storageDomain -ne $domain -and $parentSite.Count -gt 0) {
            throw "O subdomínio '$domain' não consta no cache local de sites usado para preparar a prévia. Isso não confirma que ele foi apagado: a lista geral de sites e o inventário específico de subdomínios são consultas separadas. Atualizar sites não atualiza essa lista específica. Reanalise para o Hub conferir e sincronizar um subdomínio confirmado; se persistir, atualize os subdomínios do site principal '$storageDomain' em Integrações → Hostinger. Nenhum arquivo foi analisado ou enviado."
        }
        throw "O site '$domain' não consta na lista local salva da Hostinger. Atualize os sites e gere a prévia novamente. Nenhum arquivo foi analisado ou enviado."
    }
    if ([string]$site[0].status -match '^(?i:disabled|desabilitado|inativo)$') { throw 'O site selecionado está desabilitado na Hostinger.' }
    if ($storageDomain -ne $domain) {
        $storageSuffix = ".$storageDomain"
        if (-not $domain.EndsWith($storageSuffix, [StringComparison]::OrdinalIgnoreCase) -or $domain.Substring(0, $domain.Length - $storageSuffix.Length).Contains('.')) { throw 'O endereço público precisa ser um subdomínio direto do site principal selecionado.' }
        $storageSite = @($cache.sites | Where-Object { [string]$_.domain -ieq $storageDomain -and [string]$_.username -ceq $username -and [string]$_.websiteType -ne 'subdomain' } | Select-Object -First 1)
        if ($storageSite.Count -eq 0) { throw 'O site principal não está na lista salva. Atualize os sites e gere a prévia novamente.' }
    }

    $sourceDirectory = Resolve-SafeDestination ([string]$payload.sourceDirectory)
    if (-not (Test-Path -LiteralPath $sourceDirectory -PathType Container)) { throw 'A pasta local da Pre-Sell não existe.' }
    $sourceItem = Get-Item -LiteralPath $sourceDirectory -Force -ErrorAction Stop
    if (($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -and -not [HubLocal.FileReparseTagReader]::IsCloudFilesReparsePoint($sourceDirectory)) { throw 'A pasta de origem é um link do sistema de arquivos e não pode ser publicada.' }

    $targetDirectory = ([string]$payload.targetDirectory).Trim().Trim('/')
    if ($targetDirectory -eq '.') { $targetDirectory = '' }
    if ($targetDirectory -match '[\\:?*"<>|#%\x00-\x1f]' -or $targetDirectory -match '(^|/)\.\.?(/|$)') { throw 'A pasta remota deve ser um caminho relativo seguro dentro da raiz pública do site.' }
    if ($targetDirectory -and @($targetDirectory -split '/' | Where-Object { $_ -notmatch '^[\p{L}\p{N}._ -]+$' -or $_ -in @('.', '..') }).Count -gt 0) { throw 'Use somente nomes simples de pasta, separados por /, sem caracteres especiais.' }
    if ($storageDomain -ne $domain -and -not $targetDirectory) { throw 'Informe a pasta do subdomínio dentro do site principal antes de analisar a publicação.' }

    $allEntries = @(Get-ChildItem -LiteralPath $sourceDirectory -Force -Recurse -ErrorAction Stop)
    $reparseEntries = @($allEntries | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -and -not [HubLocal.FileReparseTagReader]::IsCloudFilesReparsePoint($_.FullName) })
    if ($reparseEntries.Count -gt 0) { throw 'A pasta contém links do sistema de arquivos. Remova-os da cópia antes de publicar.' }
    $files = @($allEntries | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName)
    if ($files.Count -eq 0) { throw 'A pasta de origem não contém arquivos para publicar.' }
    if ($files.Count -gt 200) { throw 'O limite deste MVP é 200 arquivos por publicação.' }
    $allowedExtensions = @('.html','.htm','.css','.js','.mjs','.json','.png','.jpg','.jpeg','.webp','.avif','.gif','.svg','.ico','.woff','.woff2','.ttf','.otf','.txt','.xml','.webmanifest','.pdf')
    $unsupported = @($files | Where-Object { $_.Name.StartsWith('.') -or $_.Extension.ToLowerInvariant() -notin $allowedExtensions })
    if ($unsupported.Count -gt 0) {
        $names = @($unsupported | Select-Object -First 5 | ForEach-Object { $_.Name }) -join ', '
        throw "O Hub só envia arquivos estáticos permitidos. Revise estes arquivos: $names."
    }

    $sourceEntries = [System.Collections.Generic.List[object]]::new()
    $deployPaths = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $sourcePrefix = $sourceDirectory.TrimEnd('\') + '\'
    foreach ($file in $files) {
        $sourcePath = $file.FullName.Substring($sourcePrefix.Length).Replace('\', '/')
        $segments = @($sourcePath -split '/')
        if ($segments.Count -eq 0 -or @($segments | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_ -in @('.', '..') -or $_ -match '[\\:?*"<>|#%\x00-\x1f]' }).Count -gt 0) { throw 'Um nome de arquivo não pode ser convertido em um caminho público seguro.' }
        $relativePath = $sourcePath
        if ($sourcePath -match '^(?i:assets)/(.+)$') {
            if ($Matches[1].Contains('/')) { throw 'Deixe os arquivos diretamente dentro da pasta assets; subpastas de assets não podem ser publicadas achatadas.' }
            $relativePath = $Matches[1]
        }
        if (-not $deployPaths.Add($relativePath)) { throw 'Dois arquivos da origem teriam o mesmo nome ao enviar os assets para a raiz. Renomeie o arquivo duplicado.' }
        $sourceEntries.Add([PSCustomObject]@{ file = $file; sourcePath = $sourcePath; relativePath = $relativePath })
    }
    $assetMappings = @($sourceEntries.ToArray() | Where-Object { $_.sourcePath -match '^(?i:assets)/' } | ForEach-Object {
        [PSCustomObject]@{ sourcePath = $_.sourcePath.Substring(7).Replace('\', '/'); targetPath = $_.relativePath }
    } | Sort-Object { $_.sourcePath.Length } -Descending)

    $localFiles = [System.Collections.Generic.List[object]]::new()
    $publicFiles = [System.Collections.Generic.List[object]]::new()
    $fingerprintText = [Text.StringBuilder]::new()
    [int64]$totalBytes = 0
    foreach ($entry in $sourceEntries) {
        $file = $entry.file
        $sourcePath = $entry.sourcePath
        $relativePath = $entry.relativePath
        $remotePath = if ($targetDirectory) { "$targetDirectory/$relativePath" } else { $relativePath }
        $contentBytes = if ($assetMappings.Count -gt 0) { Get-HostingerFlattenedTextBytes -Path $file.FullName -AssetMappings $assetMappings } else { $null }
        [int64]$length = if ($null -ne $contentBytes) { $contentBytes.LongLength } else { $file.Length }
        $totalBytes += $length
        if ($totalBytes -gt 262144000) { throw 'O limite deste MVP é 250 MB por publicação.' }
        $contentDigest = ''
        if ($null -ne $contentBytes) {
            $contentHasher = [Security.Cryptography.SHA256]::Create()
            try { $contentDigest = ([BitConverter]::ToString($contentHasher.ComputeHash($contentBytes))).Replace('-', '').ToLowerInvariant() }
            finally { $contentHasher.Dispose() }
        }
        $null = $fingerprintText.Append($sourcePath).Append('|').Append($relativePath).Append('|').Append($length).Append('|').Append($file.LastWriteTimeUtc.Ticks).Append('|').Append($contentDigest).Append([char]10)
        $localFiles.Add([PSCustomObject]@{ localPath = $file.FullName; sourcePath = $sourcePath; relativePath = $relativePath; remotePath = $remotePath; sizeBytes = $length; contentBytes = $contentBytes })
        $publicFiles.Add([PSCustomObject]@{ relativePath = $relativePath; remotePath = $remotePath; sizeBytes = $length })
    }
    $remoteItems = @(Get-HostingerRemoteFiles -Token (Get-HostingerToken) -Username $username -Domain $storageDomain -Directory $targetDirectory)
    $remoteEntries = ConvertTo-HostingerRemoteEntryMap -Items $remoteItems -Directory $targetDirectory

    $conflicts = [System.Collections.Generic.List[object]]::new()
    $conflictKeys = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $missingDirectories = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $linkedDirectories = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in $localFiles) {
        $fileCollision = Get-HostingerPublishPathCollision -Path $file.remotePath -RemoteEntries $remoteEntries
        if ($null -ne $fileCollision) {
            $conflictKey = "$($fileCollision.kind)|$($fileCollision.path)"
            if ($conflictKeys.Add($conflictKey)) { $conflicts.Add($fileCollision) }
            $null = $fingerprintText.Append('remote-conflict|').Append($fileCollision.path).Append('|').Append($fileCollision.kind).Append('|').Append($fileCollision.sizeBytes).Append([char]10)
        }
        $relativeParts = @($file.relativePath -split '/')
        $parentParts = if ($relativeParts.Count -gt 1) { @($relativeParts[0..($relativeParts.Count - 2)]) } else { @() }
        $current = $targetDirectory
        foreach ($part in $parentParts) {
            $current = if ($current) { "$current/$part" } else { $part }
            $directoryCollision = Get-HostingerPublishPathCollision -Path $current -RemoteEntries $remoteEntries -ExpectedDirectory
            if ($null -ne $directoryCollision) {
                $conflictKey = "$($directoryCollision.kind)|$($directoryCollision.path)"
                if ($conflictKeys.Add($conflictKey)) { $conflicts.Add($directoryCollision) }
                if ($directoryCollision.kind -eq 'symlink-blocks-directory') { $null = $linkedDirectories.Add($current) }
                $null = $fingerprintText.Append('remote-conflict|').Append($directoryCollision.path).Append('|').Append($directoryCollision.kind).Append([char]10)
            } elseif (-not $remoteEntries.ContainsKey($current)) { $null = $missingDirectories.Add($current) }
        }
    }
    $ready = $missingDirectories.Count -eq 0 -and $linkedDirectories.Count -eq 0 -and $conflicts.Count -eq 0
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($fingerprintText.ToString())))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    return @{
        ready = $ready
        canOverwrite = $false
        domain = $domain
        storageDomain = $storageDomain
        username = $username
        sourceDirectory = $sourceDirectory
        targetDirectory = $targetDirectory
        files = @($publicFiles.ToArray())
        localFiles = @($localFiles.ToArray())
        fileCount = $files.Count
        totalBytes = $totalBytes
        fingerprint = $fingerprint
        conflicts = @($conflicts.ToArray())
        missingDirectories = @($missingDirectories | Sort-Object)
        linkedDirectories = @($linkedDirectories | Sort-Object)
        checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    }
}

function Invoke-HostingerTusRequest {
    param([ValidateSet('POST','PATCH')][string]$Method, [string]$UploadUri, [string]$AuthKey, [string]$RestAuthKey, [int64]$FileSize, [string]$FilePath, [string]$RemotePath, [byte[]]$FileBytes = $null)
    $request = [Net.HttpWebRequest]::Create($UploadUri)
    $request.Method = $Method
    $request.AllowAutoRedirect = $false
    $request.Timeout = 300000
    $request.ReadWriteTimeout = 300000
    $request.Headers.Add('Tus-Resumable', '1.0.0')
    $request.Headers.Add('X-Auth', $AuthKey)
    $request.Headers.Add('X-Auth-Rest', $RestAuthKey)
    if ($Method -eq 'POST') {
        $request.Headers.Add('Upload-Length', [string]$FileSize)
        $request.Headers.Add('Upload-Offset', '0')
        $request.ContentLength = 0
    } else {
        $request.Headers.Add('Upload-Offset', '0')
        $request.ContentType = 'application/offset+octet-stream'
        $request.ContentLength = $FileSize
        if ($null -ne $FileBytes) {
            if ([int64]$FileBytes.LongLength -ne $FileSize) { throw 'O conteúdo preparado para envio não corresponde ao tamanho confirmado na prévia.' }
            $requestStream = $request.GetRequestStream()
            try { $requestStream.Write($FileBytes, 0, $FileBytes.Length) }
            finally { $requestStream.Dispose() }
        } else {
            $sourceStream = [IO.File]::OpenRead($FilePath)
            try {
                $requestStream = $request.GetRequestStream()
                try {
                    $buffer = New-Object byte[] (1024 * 1024)
                    while (($read = $sourceStream.Read($buffer, 0, $buffer.Length)) -gt 0) { $requestStream.Write($buffer, 0, $read) }
                } finally { $requestStream.Dispose() }
            } finally { $sourceStream.Dispose() }
        }
    }
    try { $response = [Net.HttpWebResponse]$request.GetResponse() }
    catch {
        $failureContext = Get-HostingerFailureContext -ErrorRecord $_
        $code = [int]$failureContext.statusCode
        $apiDetail = if ([string]::IsNullOrWhiteSpace([string]$failureContext.apiError)) { '' } else { " Detalhe informado pela Hostinger: $($failureContext.apiError)." }
        if ($code -eq 409) { throw "A Hostinger recusou iniciar o arquivo '$RemotePath' com HTTP 409 (conflito). Essa resposta, sozinha, não identifica se o caminho está ocupado por um arquivo, pasta ou outro item.$apiDetail Nenhum arquivo existente foi substituído; confira novamente o inventário no Hub antes de remover algo ou repetir o envio." }
        if ($code -in @(401,403)) { throw "A Hostinger recusou a autorização temporária de upload (HTTP $code). Nenhum arquivo existente foi substituído." }
        if ($code -eq 429) { throw 'A Hostinger limitou o envio temporariamente (HTTP 429). Aguarde e gere uma nova prévia.' }
        $step = if ($Method -eq 'POST') { 'iniciar o envio' } else { 'enviar o conteúdo do arquivo' }
        if ($code -gt 0) { throw "A Hostinger não confirmou a etapa de $step do arquivo '$RemotePath' (HTTP $code).$apiDetail O lote foi interrompido sem apagar os arquivos já enviados." }
        $transportStatus = [string]$failureContext.transportStatus
        if ([string]::IsNullOrWhiteSpace($transportStatus)) { $transportStatus = 'sem resposta de rede' }
        throw "Não foi possível concluir a etapa de $step do arquivo '$RemotePath' com a Hostinger (falha de comunicação sem resposta HTTP: $transportStatus). O lote foi interrompido sem apagar os arquivos já enviados."
    }
    try {
        if ($Method -eq 'POST' -and [int]$response.StatusCode -ne 201) { throw 'A Hostinger não iniciou o envio deste arquivo.' }
        if ($Method -eq 'PATCH') {
            if ([int]$response.StatusCode -ne 204) { throw 'A Hostinger não confirmou o envio deste arquivo.' }
            $offset = 0L
            if (-not [int64]::TryParse([string]$response.Headers['Upload-Offset'], [ref]$offset) -or $offset -ne $FileSize) { throw 'A confirmação de bytes enviados não corresponde ao tamanho do arquivo.' }
        }
    } finally { $response.Dispose() }
}

function Publish-HostingerFiles {
    param([string]$Body)
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'A confirmação de publicação não pôde ser lida.' }
    if ($payload.confirmed -ne $true) { throw 'Confirme a publicação na tela do Hub antes de enviar arquivos.' }
    $plan = Get-HostingerPublishPlan -Body $Body
    if ($plan.conflicts.Count -gt 0) {
        $existingPaths = @($plan.conflicts | Select-Object -First 5 | ForEach-Object { [string]$_.path }) -join ', '
        throw "O destino já contém arquivo(s) desta Pre-Sell: $existingPaths. O Hub bloqueou a sobrescrita. Remova manualmente somente esses arquivos no HPanel e gere uma nova prévia."
    }
    if ([string]$payload.fingerprint -cne [string]$plan.fingerprint) { throw 'Os arquivos locais mudaram desde a prévia. Gere uma nova prévia antes de publicar.' }
    if (-not $plan.ready) { throw 'O destino mudou ou contém conflitos. Gere uma nova prévia e resolva os avisos antes de publicar.' }

    $results = [System.Collections.Generic.List[object]]::new()
    $failure = ''
    $token = Get-HostingerToken
    foreach ($file in $plan.localFiles) {
        try {
            $credentialsBody = @{ username = $plan.username; domain = $plan.storageDomain } | ConvertTo-Json -Compress
            Wait-HostingerRequestSlot
            $credentials = Invoke-RestMethod -Uri 'https://developers.hostinger.com/api/hosting/v1/files/upload-urls' -Method Post -Headers @{ Authorization = "Bearer $token"; Accept = 'application/json' } -ContentType 'application/json' -Body $credentialsBody -TimeoutSec 30
            $uploadBase = [Uri]([string]$credentials.url)
            if ($uploadBase.Scheme -cne 'https' -or ($uploadBase.DnsSafeHost -notlike '*.hstgr.io' -and $uploadBase.DnsSafeHost -notlike '*.hostinger.com') -or -not [string]::IsNullOrWhiteSpace($uploadBase.UserInfo)) { throw 'A Hostinger retornou um endereço de upload não reconhecido; o Hub interrompeu o envio.' }
            $encodedPath = (@($file.remotePath -split '/' | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/')
            $uploadUri = $uploadBase.AbsoluteUri.TrimEnd('/') + '/' + $encodedPath + '?override=false'
            $authKey = [string]$credentials.auth_key
            $restAuthKey = [string]$credentials.rest_auth_key
            if ([string]::IsNullOrWhiteSpace($authKey) -or [string]::IsNullOrWhiteSpace($restAuthKey)) { throw 'A Hostinger não forneceu credenciais temporárias completas para o upload.' }
            Wait-HostingerRequestSlot
            Invoke-HostingerTusRequest -Method POST -UploadUri $uploadUri -AuthKey $authKey -RestAuthKey $restAuthKey -FileSize $file.sizeBytes -FilePath $file.localPath -RemotePath $file.remotePath -FileBytes $file.contentBytes
            Wait-HostingerRequestSlot
            Invoke-HostingerTusRequest -Method PATCH -UploadUri $uploadUri -AuthKey $authKey -RestAuthKey $restAuthKey -FileSize $file.sizeBytes -FilePath $file.localPath -RemotePath $file.remotePath -FileBytes $file.contentBytes
            $results.Add([PSCustomObject]@{ path = $file.remotePath; sizeBytes = $file.sizeBytes; uploaded = $true; overwritten = $false })
        } catch {
            $failure = $_.Exception.Message
            $results.Add([PSCustomObject]@{ path = $file.remotePath; sizeBytes = $file.sizeBytes; uploaded = $false; error = $failure })
            break
        }
    }
    $uploadedCount = @($results.ToArray() | Where-Object { $_.uploaded }).Count
    return @{
        complete = $uploadedCount -eq $plan.fileCount
        uploadedCount = $uploadedCount
        overwrittenCount = @($results.ToArray() | Where-Object { $_.uploaded -and $_.overwritten }).Count
        totalCount = $plan.fileCount
        domain = $plan.domain
        storageDomain = $plan.storageDomain
        targetDirectory = $plan.targetDirectory
        results = @($results.ToArray())
        error = $failure
        completedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    }
}

function Connect-Hostinger {
    param([string]$Body)
    if ([string]::IsNullOrWhiteSpace($Body)) { throw 'Cole o token da API Hostinger para continuar.' }
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'O token da API Hostinger não pôde ser lido.' }
    $token = ([string]$payload.token).Trim()
    if ($token.Length -lt 20 -or $token.Length -gt 4096) { throw 'O token informado tem um tamanho inválido.' }
    $term = [string]$payload.expirationTerm
    if ($term -notin @('1_month', '3_months', '6_months', '1_year', 'never')) { throw 'Escolha um prazo de expiração válido para o token.' }
    $sameToken = $false
    $existingMetadata = $null
    if (Test-Path -LiteralPath $hostingerTokenPath -PathType Leaf) {
        try { $sameToken = (Get-HostingerToken) -ceq $token } catch { $sameToken = $false }
        if ($sameToken) { $existingMetadata = Get-HostingerTokenMetadata }
    }
    $result = Get-HostingerWebsites -Token $token
    Save-HostingerToken -Token $token
    Save-HostingerSitesCache -Result $result | Out-Null
    $registeredAt = if ($sameToken -and $null -ne $existingMetadata) { $existingMetadata.registeredAtUtc } else { [DateTimeOffset]::UtcNow.ToString('o') }
    $metadata = Save-HostingerTokenMetadata -Term $term -RegisteredAtUtc $registeredAt
    return @{ sites = $result.sites; checkedAtUtc = $result.checkedAtUtc; expiration = $metadata }
}

function Invoke-PresellApi {
    param([string]$Body, [bool]$Produce, [bool]$Preflight = $false)
    if ([string]::IsNullOrWhiteSpace($Body)) { throw 'Envie uma ficha JSON válida.' }
    $payload = $Body | ConvertFrom-Json
    if ($null -eq $payload.ficha) { throw 'Envie uma ficha JSON válida.' }
    $rawDestination = if ($payload.destination) { [string]$payload.destination } else { [string]$payload.ficha.destination }
    $destination = Resolve-SafeDestination $rawDestination
    if (($Produce -or $Preflight) -and -not (Test-Path -LiteralPath $templateRoot -PathType Container)) {
        throw "O modelo de Pre-Sell não foi encontrado em $templateRoot. Confira se ProductsRoot aponta para a pasta correta de produtos."
    }
    $fichaJson = $payload.ficha | ConvertTo-Json -Depth 30 -Compress
    $assetFolder = if ($payload.ficha.assetFolder) { [string]$payload.ficha.assetFolder } else { 'assets' }
    $workflow = Join-Path $engineRoot 'tools\Invoke-PresellWorkflow.ps1'
    $temporaryFicha = Join-Path ([IO.Path]::GetTempPath()) ("presell-ficha-{0}.json" -f [Guid]::NewGuid().ToString('N'))
    try {
        [IO.File]::WriteAllText($temporaryFicha, $fichaJson, [Text.UTF8Encoding]::new($false))
        if ($Preflight) {
            $producer = Join-Path $engineRoot 'tools\New-PresellFromFicha.ps1'
            $null = & $producer -Destination $destination -FichaPath $temporaryFicha -TemplateRoot $templateRoot -ValidateOnly
            return @{ ready = $true }
        }
        if ($Produce) {
            $producer = Join-Path $engineRoot 'tools\New-PresellFromFicha.ps1'
            $null = & $producer -Destination $destination -FichaPath $temporaryFicha -TemplateRoot $templateRoot
        }
        $reportText = (& $workflow -Destination $destination -Mode Validate -FichaPath $temporaryFicha -AssetFolder $assetFolder -Json | Out-String).Trim()
        $report = $reportText | ConvertFrom-Json
        $result = @{ report = $report }
        if ($Produce) {
            $browser = Open-PresellLocalPage -Destination $destination
            $result.destination = $destination
            $result.localFileUrl = $browser.localFileUrl
            $result.browserOpened = $browser.browserOpened
            $result.browserOpenError = $browser.browserOpenError
        }
        return $result
    } finally {
        if (Test-Path -LiteralPath $temporaryFicha -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryFicha -Force
        }
    }
}

function Invoke-PresellOverwriteApi {
    param([string]$Body, [bool]$Produce)
    if ([string]::IsNullOrWhiteSpace($Body)) { throw 'Envie uma ficha JSON válida.' }
    try { $payload = $Body | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'Envie uma ficha JSON válida.' }
    if ($null -eq $payload.ficha) { throw 'Envie uma ficha JSON válida.' }
    if ($Produce -and $payload.confirmed -ne $true) { throw 'Confirme a substituição dos arquivos da Pre-Sell antes de continuar.' }
    $requestedDestination = Resolve-SafeDestination ([string]$payload.destination)
    if (-not (Test-Path -LiteralPath $requestedDestination -PathType Container)) { throw 'O destino precisa ser uma pasta existente para sobrescrever as páginas.' }
    $destination = Get-CanonicalExistingPath $requestedDestination
    $canonicalProductsRoot = Get-CanonicalExistingPath $resolvedProductsRoot
    $canonicalProductRoot = Get-CanonicalExistingPath (Split-Path -Parent $requestedDestination)
    if (-not (Test-PathWithinDirectory -Path $canonicalProductRoot -Directory $canonicalProductsRoot)) { throw 'A pasta real do produto está fora da pasta local de produtos.' }
    if (-not (Test-PathWithinDirectory -Path $destination -Directory $canonicalProductRoot)) { throw 'O destino real da Pre-Sell aponta para fora da pasta deste produto; a gravação foi bloqueada.' }
    if (-not [string]::Equals((Split-Path -Leaf $destination), (Split-Path -Leaf $requestedDestination), [StringComparison]::OrdinalIgnoreCase)) { throw "O link do destino aponta para outra pasta ('$destination'); a gravação foi bloqueada para preservar a separação das páginas." }
    $destinationRedirected = -not [string]::Equals($requestedDestination.TrimEnd('\'), $destination.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
    $destinationLinkTarget = if ($destinationRedirected) { $destination } else { '' }
    if ($Produce) {
        $confirmedDestination = $payload.confirmedDestination
        if ($null -eq $confirmedDestination) { throw 'A confirmação do caminho físico está ausente. Valide novamente antes de sobrescrever.' }
        if (-not [string]::Equals([IO.Path]::GetFullPath([string]$confirmedDestination.requestedDestination), [IO.Path]::GetFullPath($requestedDestination), [StringComparison]::OrdinalIgnoreCase)) { throw 'O caminho solicitado mudou após a confirmação. Valide novamente; nada foi sobrescrito.' }
        if (-not [string]::Equals([IO.Path]::GetFullPath([string]$confirmedDestination.resolvedDestination), [IO.Path]::GetFullPath($destination), [StringComparison]::OrdinalIgnoreCase)) { throw 'O destino físico mudou após a confirmação. Valide novamente; nada foi sobrescrito.' }
        if (-not [bool]$confirmedDestination.exists) { throw 'O estado do destino mudou após a confirmação. Valide novamente; nada foi sobrescrito.' }
    }
    if (-not (Test-Path -LiteralPath $templateRoot -PathType Container)) { throw 'O modelo de Pre-Sell não está disponível no servidor local.' }
    $assetFolder = if ([string]::IsNullOrWhiteSpace([string]$payload.ficha.assetFolder)) { 'assets' } else { [string]$payload.ficha.assetFolder }
    if ($assetFolder -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') { throw 'Nome da pasta de assets inválido.' }
    $assetSource = Join-Path $destination $assetFolder
    if (-not (Test-Path -LiteralPath $assetSource -PathType Container)) { throw "A pasta de assets '$assetFolder' não existe no destino. A sobrescrita não alterou arquivos." }
    $assetItem = Get-Item -LiteralPath $assetSource -Force -ErrorAction Stop
    if (($assetItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -and -not [HubLocal.FileReparseTagReader]::IsCloudFilesReparsePoint($assetSource)) { throw 'A pasta de assets é um link do sistema de arquivos e não pode ser usada nesta operação.' }
    $pageFiles = @('index.html','styles.css','scripts.js')
    foreach ($name in $pageFiles) {
        $existingPath = Join-Path $destination $name
        if (-not (Test-Path -LiteralPath $existingPath)) { continue }
        $existingItem = Get-Item -LiteralPath $existingPath -Force -ErrorAction Stop
        if ($existingItem.PSIsContainer -or (($existingItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -and -not [HubLocal.FileReparseTagReader]::IsCloudFilesReparsePoint($existingPath))) { throw "O caminho de página '$name' não é um arquivo normal. A sobrescrita foi bloqueada." }
    }
    $stageRoot = Join-Path (Split-Path -Parent $destination) ('.hub-presell-overwrite-' + [Guid]::NewGuid().ToString('N'))
    $stagePage = Join-Path $stageRoot 'page'
    $temporaryFicha = Join-Path ([IO.Path]::GetTempPath()) ("presell-overwrite-ficha-{0}.json" -f [Guid]::NewGuid().ToString('N'))
    $preserveStageRoot = $false
    try {
        [IO.Directory]::CreateDirectory($stagePage) | Out-Null
        Copy-Item -LiteralPath $assetSource -Destination (Join-Path $stagePage $assetFolder) -Recurse -ErrorAction Stop | Out-Null
        $fichaJson = $payload.ficha | ConvertTo-Json -Depth 30 -Compress
        [IO.File]::WriteAllText($temporaryFicha, $fichaJson, [Text.UTF8Encoding]::new($false))
        $producer = Join-Path $engineRoot 'tools\New-PresellFromFicha.ps1'
        $workflow = Join-Path $engineRoot 'tools\Invoke-PresellWorkflow.ps1'
        $null = & $producer -Destination $stagePage -FichaPath $temporaryFicha -TemplateRoot $templateRoot
        $reportText = (& $workflow -Destination $stagePage -Mode Validate -FichaPath $temporaryFicha -AssetFolder $assetFolder -Json | Out-String).Trim()
        $report = $reportText | ConvertFrom-Json
        if ([string]$report.overall -eq 'BLOCKED') { throw 'A nova página não passou pela validação final; os arquivos existentes foram preservados.' }
        if (-not $Produce) { return @{ ready = $true; report = $report; destination = $destination; requestedDestination = $requestedDestination; destinationLinkTarget = $destinationLinkTarget; destinationRedirected = $destinationRedirected; exists = $true; files = $pageFiles } }

        $backupRoot = Join-Path $stageRoot 'backup'
        [IO.Directory]::CreateDirectory($backupRoot) | Out-Null
        $commitRecords = [System.Collections.Generic.List[object]]::new()
        try {
            foreach ($name in $pageFiles) {
                $sourcePath = Join-Path $stagePage $name
                $destinationPath = Join-Path $destination $name
                $backupPath = Join-Path $backupRoot $name
                $hadOriginal = Test-Path -LiteralPath $destinationPath -PathType Leaf
                $record = [PSCustomObject]@{ destinationPath = $destinationPath; backupPath = $backupPath; hadOriginal = $hadOriginal }
                $commitRecords.Add($record)
                if ($hadOriginal) { Copy-Item -LiteralPath $destinationPath -Destination $backupPath -Force -ErrorAction Stop }
                Move-Item -LiteralPath $sourcePath -Destination $destinationPath -Force -ErrorAction Stop
            }
        } catch {
            $commitError = $_.Exception.Message
            $rollbackErrors = [System.Collections.Generic.List[string]]::new()
            for ($index = $commitRecords.Count - 1; $index -ge 0; $index--) {
                $record = $commitRecords[$index]
                try {
                    if ($record.hadOriginal -and (Test-Path -LiteralPath $record.backupPath -PathType Leaf)) {
                        Copy-Item -LiteralPath $record.backupPath -Destination $record.destinationPath -Force -ErrorAction Stop
                    } elseif (-not $record.hadOriginal -and (Test-Path -LiteralPath $record.destinationPath -PathType Leaf)) {
                        Remove-Item -LiteralPath $record.destinationPath -Force -ErrorAction Stop
                    }
                } catch { $rollbackErrors.Add("$([IO.Path]::GetFileName($record.destinationPath)): $($_.Exception.Message)") }
            }
            if ($rollbackErrors.Count -gt 0) {
                $preserveStageRoot = $true
                throw "A substituição falhou e a restauração automática ficou incompleta. As cópias de segurança temporárias foram preservadas em '$backupRoot'. Erro: $commitError. Restauração: $($rollbackErrors -join '; ')"
            }
            throw "A substituição falhou; os arquivos originais foram restaurados. Erro: $commitError"
        }
        $report.destination = $destination
        $browser = Open-PresellLocalPage -Destination $destination
        return @{ report = $report; destination = $destination; overwrittenFiles = $pageFiles; localFileUrl = $browser.localFileUrl; browserOpened = $browser.browserOpened; browserOpenError = $browser.browserOpenError }
    } finally {
        if (Test-Path -LiteralPath $temporaryFicha -PathType Leaf) { Remove-Item -LiteralPath $temporaryFicha -Force -ErrorAction SilentlyContinue }
        if (-not $preserveStageRoot -and (Test-Path -LiteralPath $stageRoot -PathType Container)) { Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Get-PresellBatchPlan {
    param([string]$Body, [bool]$OverwriteExisting = $false, [bool]$RequireConfirmedDestinations = $false)
    if ([string]::IsNullOrWhiteSpace($Body)) { throw 'Envie os dados do lote de Pre-Sells.' }
    $payload = $Body | ConvertFrom-Json
    $targets = @($payload.targets)
    if ($targets.Count -lt 1 -or $targets.Count -gt 50) { throw 'O lote deve conter entre 1 e 50 contas.' }
    $source = Resolve-SafeDestination ([string]$payload.sourceDirectory)
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw 'A pasta de origem dos assets não foi encontrada.' }
    $assetFolder = if ([string]::IsNullOrWhiteSpace([string]$payload.assetFolder)) { 'assets' } else { [string]$payload.assetFolder }
    if ($assetFolder -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') { throw 'Nome da pasta de assets inválido.' }
    $assetSource = Join-Path $source $assetFolder
    if (-not (Test-Path -LiteralPath $assetSource -PathType Container)) { throw "A pasta de assets '$assetFolder' não existe na origem informada." }
    foreach ($asset in @('01.png','02.png','03.png')) {
        if (-not (Test-Path -LiteralPath (Join-Path $assetSource $asset) -PathType Leaf)) { throw "Asset obrigatório ausente na origem: $assetFolder/$asset" }
    }
    $parent = Split-Path -Parent $source
    $plans = [System.Collections.Generic.List[object]]::new()
    $destinations = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $resolvedDestinations = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $trackingHosts = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $canonicalProductsRoot = Get-CanonicalExistingPath $resolvedProductsRoot
    $canonicalProductRoot = Get-CanonicalExistingPath $parent
    $canonicalSource = Get-CanonicalExistingPath $source
    if (-not (Test-PathWithinDirectory -Path $canonicalProductRoot -Directory $canonicalProductsRoot)) { throw 'A pasta real do produto está fora da pasta local de produtos.' }
    if (-not (Test-PathWithinDirectory -Path $canonicalSource -Directory $canonicalProductRoot)) { throw 'A pasta de origem dos assets não pertence à pasta real deste produto.' }
    $hostPattern = '^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
    for ($index = 0; $index -lt $targets.Count; $index++) {
        $target = $targets[$index]
        $pageNumber = $index + 1
        if ([int]$target.pageNumber -ne $pageNumber) { throw 'A numeração das páginas precisa começar em 01 e seguir sem lacunas.' }
        $domain = ([string]$target.hpanelDomain).Trim().ToLowerInvariant()
        if ($domain -cnotmatch $hostPattern) { throw 'O domínio HPanel de uma conta está inválido.' }
        $folderName = 'pag{0:D2} {1}' -f $pageNumber, $domain
        $requestedDestination = [IO.Path]::GetFullPath((Join-Path $parent $folderName))
        $expectedDestination = [IO.Path]::GetFullPath((Join-Path $canonicalProductRoot $folderName))
        $requested = Resolve-SafeDestination ([string]$target.destination)
        if (-not [string]::Equals($requested, $requestedDestination, [StringComparison]::OrdinalIgnoreCase)) { throw "O destino da página $pageNumber não segue o padrão 'pagNN domínio'." }
        if (-not $destinations.Add($expectedDestination)) { throw 'Há destinos duplicados neste lote.' }
        $destinationExists = Test-Path -LiteralPath $expectedDestination
        if (-not $destinationExists) { $destinationExists = $null -ne (Get-Item -LiteralPath $expectedDestination -Force -ErrorAction SilentlyContinue) }
        $destination = $expectedDestination
        $destinationRedirected = -not [string]::Equals($requestedDestination.TrimEnd('\'), $expectedDestination.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
        $destinationLinkTarget = ''
        if ($destinationRedirected) { $destinationLinkTarget = $expectedDestination }
        if ($destinationExists) {
            if (-not (Test-Path -LiteralPath $expectedDestination -PathType Container)) { throw "O destino existente não é uma pasta: $expectedDestination" }
            $destinationItem = Get-Item -LiteralPath $expectedDestination -Force -ErrorAction Stop
            $destination = Get-CanonicalExistingPath $expectedDestination
            $destinationRedirected = -not [string]::Equals($requestedDestination.TrimEnd('\'), $destination.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
            if (-not (Test-PathWithinDirectory -Path $destination -Directory $canonicalProductRoot)) { throw "O destino real da página $pageNumber aponta para fora da pasta deste produto; a gravação foi bloqueada." }
            if (-not [string]::Equals((Split-Path -Leaf $destination), $folderName, [StringComparison]::OrdinalIgnoreCase)) { throw "O link do destino da página $pageNumber aponta para outra pasta ('$destination'). O Hub exige a pasta física '$folderName' para preservar a separação das páginas." }
            if ([string]::Equals($destination.TrimEnd('\'), $canonicalSource.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) -or (Test-PathWithinDirectory -Path $destination -Directory $canonicalSource) -or (Test-PathWithinDirectory -Path $canonicalSource -Directory $destination)) { throw "O destino real da página $pageNumber coincide com a origem ou a contém; a página de origem foi preservada." }
            if (-not $resolvedDestinations.Add($destination)) { throw 'Dois destinos do lote apontam para a mesma pasta física.' }
            if ($destinationRedirected) { $destinationLinkTarget = $destination }
            if ($OverwriteExisting) {
                $existingAssetSource = Join-Path $destination $assetFolder
                if (-not (Test-Path -LiteralPath $existingAssetSource -PathType Container)) { throw "A pasta de assets não existe no destino existente: $destination" }
                $existingAssetItem = Get-Item -LiteralPath $existingAssetSource -Force -ErrorAction Stop
                if (($existingAssetItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -and -not [HubLocal.FileReparseTagReader]::IsCloudFilesReparsePoint($existingAssetSource)) { throw "A pasta de assets contém um link do sistema de arquivos: $destination" }
                foreach ($pageFile in @('index.html','styles.css','scripts.js')) {
                    $existingPagePath = Join-Path $destination $pageFile
                    if (-not (Test-Path -LiteralPath $existingPagePath)) { continue }
                    $existingPageItem = Get-Item -LiteralPath $existingPagePath -Force -ErrorAction Stop
                    if ($existingPageItem.PSIsContainer -or (($existingPageItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -and -not [HubLocal.FileReparseTagReader]::IsCloudFilesReparsePoint($existingPagePath))) { throw "O caminho '$pageFile' não é um arquivo normal e não pode ser substituído." }
                }
                $assetSourceForTarget = $existingAssetSource
            } else {
                $assetSourceForTarget = $assetSource
            }
        } else {
            $destination = $expectedDestination
            if (Test-Path -LiteralPath $destination) { throw "O destino físico foi criado durante a validação e será preservado: $destination" }
            if (-not $resolvedDestinations.Add($destination)) { throw 'Dois destinos do lote apontam para a mesma pasta física.' }
            $assetSourceForTarget = $assetSource
        }
        if ($RequireConfirmedDestinations -and $OverwriteExisting) {
            $confirmed = @($payload.confirmedDestinations | Where-Object { [int]$_.pageNumber -eq $pageNumber }) | Select-Object -First 1
            if ($null -eq $confirmed) { throw 'A confirmação do caminho físico está ausente. Valide novamente o lote antes de sobrescrever.' }
            if ([bool]$confirmed.exists -ne [bool]$destinationExists) { throw "O estado do destino da página $pageNumber mudou após a confirmação. Valide novamente; nada foi sobrescrito." }
            if (-not [string]::Equals([IO.Path]::GetFullPath([string]$confirmed.resolvedDestination), [IO.Path]::GetFullPath($destination), [StringComparison]::OrdinalIgnoreCase)) { throw "O destino físico da página $pageNumber mudou após a confirmação. Valide novamente; nada foi sobrescrito." }
            if (-not [string]::Equals([IO.Path]::GetFullPath([string]$confirmed.requestedDestination), [IO.Path]::GetFullPath($requestedDestination), [StringComparison]::OrdinalIgnoreCase)) { throw "O caminho solicitado para a página $pageNumber mudou após a confirmação. Valide novamente; nada foi sobrescrito." }
        }
        if ($null -eq $target.ficha) { throw "A ficha da página $pageNumber está ausente." }
        if ([string]$target.ficha.destination -ne [string]$target.destination) { throw "O destino da ficha $pageNumber diverge da pasta solicitada." }
        if ([string]$target.ficha.assetFolder -ne $assetFolder) { throw "A pasta de assets da ficha $pageNumber diverge da origem." }
        $tracking = $target.ficha.tracking
        if ($null -eq $tracking -or -not [bool]$tracking.enabled) { throw 'Cada página do lote precisa ter uma Track ativa.' }
        $trackHostname = ([string]$tracking.hostname).Trim().ToLowerInvariant()
        if ($trackHostname -cnotmatch $hostPattern) { throw "O domínio público da Track da página $pageNumber é inválido." }
        if (-not $trackingHosts.Add($trackHostname)) { throw 'Cada página do lote precisa usar um domínio público exclusivo.' }
        $publicUri = $null
        if ([string]::IsNullOrWhiteSpace([string]$target.publicUrl) -or -not [Uri]::TryCreate([string]$target.publicUrl, [UriKind]::Absolute, [ref]$publicUri) -or $publicUri.Scheme -cne 'https' -or $publicUri.UserInfo -or $publicUri.Query -or $publicUri.Fragment -or $publicUri.AbsolutePath -ne '/' -or $publicUri.Host -cne $trackHostname) {
            throw "O domínio público informado para a página $pageNumber precisa ser HTTPS e corresponder à Track." 
        }
        $fichaJson = $target.ficha | ConvertTo-Json -Depth 30 -Compress
        $plans.Add([PSCustomObject]@{
            pageNumber = $pageNumber
            hpanelDomain = $domain
            destination = $destination
            requestedDestination = $requestedDestination
            destinationLinkTarget = $destinationLinkTarget
            destinationRedirected = $destinationRedirected
            publicUrl = [string]$target.publicUrl
            assetSource = $assetSourceForTarget
            overwrite = $destinationExists
            trackingHostname = $trackHostname
            trackingProductKey = [string]$tracking.productKey
            fichaJson = $fichaJson
        })
    }
    return $plans.ToArray()
}

function Invoke-PresellBatchValidation {
    param([object[]]$Plans, [string]$AssetFolder, [bool]$Produce, [bool]$OverwriteExisting = $false)
    if (-not $Plans -or $Plans.Count -lt 1) { throw 'O lote de Pre-Sells está vazio.' }
    $parent = Split-Path -Parent ([string]$Plans[0].destination)
    $stageRoot = Join-Path $parent ('.hub-presell-batch-' + [Guid]::NewGuid().ToString('N'))
    $producer = Join-Path $engineRoot 'tools\New-PresellFromFicha.ps1'
    $workflow = Join-Path $engineRoot 'tools\Invoke-PresellWorkflow.ps1'
    $items = [System.Collections.Generic.List[object]]::new()
    $commitErrors = [System.Collections.Generic.List[string]]::new()
    $created = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $preserveStageRoot = $false
    [IO.Directory]::CreateDirectory($stageRoot) | Out-Null
    try {
        for ($index = 0; $index -lt $Plans.Count; $index++) {
            $plan = $Plans[$index]
            $stageDirectory = Join-Path $stageRoot ('page-{0:D2}' -f $plan.pageNumber)
            [IO.Directory]::CreateDirectory($stageDirectory) | Out-Null
            $temporaryFicha = Join-Path ([IO.Path]::GetTempPath()) ('presell-batch-ficha-{0}.json' -f [Guid]::NewGuid().ToString('N'))
            try {
                [IO.File]::WriteAllText($temporaryFicha, [string]$plan.fichaJson, [Text.UTF8Encoding]::new($false))
                Copy-Item -LiteralPath $plan.assetSource -Destination (Join-Path $stageDirectory $AssetFolder) -Recurse -ErrorAction Stop | Out-Null
                if ($Produce) {
                    $null = & $producer -Destination $stageDirectory -FichaPath $temporaryFicha -TemplateRoot $templateRoot
                    $reportText = (& $workflow -Destination $stageDirectory -Mode Validate -FichaPath $temporaryFicha -AssetFolder $AssetFolder -Json | Out-String).Trim()
                    $report = $reportText | ConvertFrom-Json
                    if ($report.PSObject.Properties['destination']) { $report.destination = [string]$plan.destination }
                    $status = [string]$report.overall
                    $trackingConfigured = $false
                    if ($status -ne 'BLOCKED') {
                        $indexPath = Join-Path $stageDirectory 'index.html'
                        if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) { throw "A página $($plan.pageNumber) não gerou index.html." }
                        $trackingRulesPath = Join-Path $engineRoot 'config\presell-rules.json'
                        $trackingRules = [IO.File]::ReadAllText($trackingRulesPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
                        $expectedTag = '<script src="{0}" data-endpoint="{1}" data-product-key="{2}" data-presell-host="{3}" async></script>' -f [string]$trackingRules.tracking.scriptUrl, [string]$trackingRules.tracking.collectorUrl, [string]$plan.trackingProductKey, [string]$plan.trackingHostname
                        $indexHtml = [IO.File]::ReadAllText($indexPath, [Text.Encoding]::UTF8)
                        $tagCount = [regex]::Matches($indexHtml, [regex]::Escape($expectedTag)).Count
                        if ($tagCount -ne 1) { throw "A configuração automática do tracking não foi confirmada na página $($plan.pageNumber)." }
                        $trackingConfigured = $true
                    }
                    $items.Add([PSCustomObject]@{pageNumber=$plan.pageNumber;hpanelDomain=$plan.hpanelDomain;destination=$plan.destination;publicUrl=$plan.publicUrl;created=$false;overwritten=$false;trackingConfigured=$trackingConfigured;report=$report})
                    if ($status -eq 'BLOCKED') { $commitErrors.Add("A validação final bloqueou a página $($plan.pageNumber) ($($plan.hpanelDomain)).") }
                } else {
                    $producerOutput = (& $producer -Destination $stageDirectory -FichaPath $temporaryFicha -TemplateRoot $templateRoot -ValidateOnly | Out-String).Trim()
                    $validation = $producerOutput | ConvertFrom-Json
                    if ($validation.ready -ne $true) { throw "A prévia local da página $($plan.pageNumber) não passou." }
                    $items.Add([PSCustomObject]@{pageNumber=$plan.pageNumber;hpanelDomain=$plan.hpanelDomain;destination=$plan.destination;requestedDestination=$plan.requestedDestination;destinationLinkTarget=$plan.destinationLinkTarget;destinationRedirected=$plan.destinationRedirected;exists=$plan.overwrite;created=$false;ready=$true})
                }
            } catch {
                if ($Produce) {
                    $items.Add([PSCustomObject]@{pageNumber=$plan.pageNumber;hpanelDomain=$plan.hpanelDomain;destination=$plan.destination;publicUrl=$plan.publicUrl;created=$false;overwritten=$false;error=$_.Exception.Message;report=$null})
                    $commitErrors.Add("Página $($plan.pageNumber) ($($plan.hpanelDomain)): $($_.Exception.Message)")
                } else { throw }
            } finally {
                if (Test-Path -LiteralPath $temporaryFicha -PathType Leaf) { Remove-Item -LiteralPath $temporaryFicha -Force }
            }
        }
        if (-not $Produce) { return @{ready=$true;targets=@($items.ToArray())} }
        if ($commitErrors.Count -gt 0) { return @{overall='BLOCKED';error=($commitErrors -join ' ');targets=@($items.ToArray());created=@()} }
        foreach ($plan in $Plans) {
            if (-not [bool]$plan.overwrite -and (Test-Path -LiteralPath $plan.destination)) { return @{overall='BLOCKED';error="O destino foi criado durante a operação e será preservado: $($plan.destination)";targets=@($items.ToArray());created=@()} }
        }
        $commitRecords = [System.Collections.Generic.List[object]]::new()
        $commitFailure = ''
        for ($index = 0; $index -lt $Plans.Count; $index++) {
            $plan = $Plans[$index]
            $stageDirectory = Join-Path $stageRoot ('page-{0:D2}' -f $plan.pageNumber)
            try {
                $item = $items[$index]
                if ([bool]$plan.overwrite) {
                    $backupDirectory = Join-Path (Join-Path $stageRoot 'backup') ('page-{0:D2}' -f $plan.pageNumber)
                    [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
                    foreach ($name in @('index.html','styles.css','scripts.js')) {
                        $sourcePath = Join-Path $stageDirectory $name
                        $destinationPath = Join-Path ([string]$plan.destination) $name
                        $backupPath = Join-Path $backupDirectory $name
                        $hadOriginal = Test-Path -LiteralPath $destinationPath -PathType Leaf
                        $commitRecords.Add([PSCustomObject]@{kind='page-file';destinationPath=$destinationPath;backupPath=$backupPath;hadOriginal=$hadOriginal})
                        if ($hadOriginal) { Copy-Item -LiteralPath $destinationPath -Destination $backupPath -Force -ErrorAction Stop }
                        Move-Item -LiteralPath $sourcePath -Destination $destinationPath -Force -ErrorAction Stop
                    }
                    $item.created = $true
                    $item.overwritten = $true
                } else {
                    $commitRecords.Add([PSCustomObject]@{kind='new-directory';destinationPath=[string]$plan.destination;backupPath='';hadOriginal=$false})
                    [IO.Directory]::Move($stageDirectory, [string]$plan.destination)
                    $null = $created.Add([string]$plan.destination)
                    $item.created = $true
                }
            } catch {
                $commitFailure = "A página $($plan.pageNumber) não pôde ser gravada no destino: $($_.Exception.Message)"
                break
            }
        }
        if ($commitFailure) {
            $rollbackErrors = [System.Collections.Generic.List[string]]::new()
            for ($recordIndex = $commitRecords.Count - 1; $recordIndex -ge 0; $recordIndex--) {
                $record = $commitRecords[$recordIndex]
                try {
                    if ($record.kind -eq 'new-directory') {
                        if (Test-Path -LiteralPath $record.destinationPath -PathType Container) { Remove-Item -LiteralPath $record.destinationPath -Recurse -Force -ErrorAction Stop }
                    } elseif ($record.hadOriginal -and (Test-Path -LiteralPath $record.backupPath -PathType Leaf)) {
                        Copy-Item -LiteralPath $record.backupPath -Destination $record.destinationPath -Force -ErrorAction Stop
                    } elseif (-not $record.hadOriginal -and (Test-Path -LiteralPath $record.destinationPath -PathType Leaf)) {
                        Remove-Item -LiteralPath $record.destinationPath -Force -ErrorAction Stop
                    }
                } catch { $rollbackErrors.Add("$([IO.Path]::GetFileName($record.destinationPath)): $($_.Exception.Message)") }
            }
            if ($rollbackErrors.Count -gt 0) {
                $preserveStageRoot = $true
                return @{overall='BLOCKED';error="$commitFailure A restauração automática ficou incompleta; os backups temporários foram preservados em '$stageRoot'. $($rollbackErrors -join '; ')";targets=@($items.ToArray());created=@()}
            }
            foreach ($item in $items) { $item.created = $false; $item.overwritten = $false }
            return @{overall='BLOCKED';error="$commitFailure Os arquivos originais foram restaurados.";targets=@($items.ToArray());created=@()}
        }
        $outcome = 'PASS'
        return @{overall=$outcome;error=($commitErrors -join ' ');targets=@($items.ToArray());created=@($created | ForEach-Object { $_ })}
    } finally {
        if (-not $preserveStageRoot -and (Test-Path -LiteralPath $stageRoot -PathType Container)) { Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Invoke-PresellBatchApi {
    param([string]$Body, [bool]$Produce, [bool]$OverwriteExisting = $false)
    $plans = @(Get-PresellBatchPlan -Body $Body -OverwriteExisting:$OverwriteExisting -RequireConfirmedDestinations:($Produce -and $OverwriteExisting))
    if (-not $OverwriteExisting) {
        $targetStates = @($plans | ForEach-Object { [PSCustomObject]@{ pageNumber=$_.pageNumber; hpanelDomain=$_.hpanelDomain; destination=$_.destination; exists=[bool]$_.overwrite } })
        $existingTargets = @($targetStates | Where-Object { $_.exists })
        if ($existingTargets.Count -gt 0) {
            $paths = @($existingTargets | ForEach-Object { [string]$_.destination }) -join '; '
            return @{ ready=$false; error="O destino já existe e não será sobrescrito automaticamente: $paths"; targetStates=$targetStates; existingTargets=$existingTargets }
        }
    }
    if (-not (Test-Path -LiteralPath $templateRoot -PathType Container)) { throw "O modelo de Pre-Sell não foi encontrado em $templateRoot. Confira se ProductsRoot aponta para a pasta correta de produtos." }
    $payload = $Body | ConvertFrom-Json
    $assetFolder = if ([string]::IsNullOrWhiteSpace([string]$payload.assetFolder)) { 'assets' } else { [string]$payload.assetFolder }
    $validation = Invoke-PresellBatchValidation -Plans $plans -AssetFolder $assetFolder -Produce $Produce -OverwriteExisting:$OverwriteExisting
    if (-not $Produce) { return $validation }
    foreach ($target in @($validation.targets)) {
        if ($target.created -ne $true) { continue }
        $browser = Open-PresellLocalPage -Destination ([string]$target.destination)
        $target | Add-Member -NotePropertyName localFileUrl -NotePropertyValue $browser.localFileUrl -Force
        $target | Add-Member -NotePropertyName browserOpened -NotePropertyValue $browser.browserOpened -Force
        $target | Add-Member -NotePropertyName browserOpenError -NotePropertyValue $browser.browserOpenError -Force
    }
    return $validation
}

if (-not (Test-Path -LiteralPath (Join-Path $siteDirectory 'index.html') -PathType Leaf)) { throw 'O painel não foi encontrado na pasta dist.' }
foreach ($required in @('tools\New-PresellFromFicha.ps1','tools\Invoke-PresellWorkflow.ps1','tools\Test-PresellStructure.ps1','tools\Test-PresellAgainstFicha.ps1','modules\Presell.Validation.Common.psm1','config\presell-rules.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $engineRoot $required) -PathType Leaf)) { throw "Componente de pre-sell ausente: $required" }
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$serverInstanceId = [guid]::NewGuid().ToString('N')
$listener.Start()
try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 15000
            $client.SendTimeout = 15000
            $stream = $client.GetStream()
            $request = Read-HttpRequest $stream
            $path = [Uri]::UnescapeDataString(($request.Target -split '\?', 2)[0])
            if ($path -in @('/api/hostinger/publish','/api/hostinger/publish/verify','/api/presell/overwrite','/api/presell/batch-overwrite')) { $client.SendTimeout = 600000 }
            if ($request.Method -eq 'GET' -and $path -eq '/api/presell/health') {
                Write-JsonResponse $stream 200 @{ presellApi = 'v2'; runtime = 'powershell'; engine = 'embedded'; instanceId = $serverInstanceId }
                continue
            }
            if ($path -eq '/api/server/restart') {
                if (-not (Test-HubLocalRequest $request.Headers)) {
                    Write-JsonResponse $stream 403 @{ error = 'O reinício só pode ser solicitado pela origem local do Hub.' }
                    continue
                }
                if ($request.Method -ne 'POST') {
                    Write-JsonResponse $stream 405 @{ error = 'Método não permitido.' }
                    continue
                }
                $restartRequested = $false
                try {
                    $restartScript = Join-Path $PSScriptRoot 'restart-panel.ps1'
                    if (-not (Test-Path -LiteralPath $restartScript -PathType Leaf)) { throw 'O utilitário local de reinício não foi encontrado.' }
                    $serverStartTicks = (Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks
                    $restartArguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ServerProcessId {1} -ServerProcessStartUtcTicks {2} -Port {3}' -f $restartScript.Replace('"','\"'), $PID, $serverStartTicks, $Port
                    if (-not [string]::IsNullOrWhiteSpace($resolvedProductsRoot)) {
                        $restartArguments += ' -ProductsRoot "{0}"' -f $resolvedProductsRoot.Replace('"','\"')
                    }
                    Start-Process -FilePath 'powershell.exe' -ArgumentList $restartArguments -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
                    Write-JsonResponse $stream 200 @{ restarting = $true; instanceId = $serverInstanceId }
                    $restartRequested = $true
                } catch {
                    Write-JsonResponse $stream 500 @{ error = $_.Exception.Message }
                }
                if ($restartRequested) { break }
                continue
            }
            if ($request.Method -eq 'POST' -and $path -eq '/api/asset-studio/page-directory') {
                try {
                    Write-JsonResponse $stream 200 (Get-AssetStudioPageDirectory $request.Body)
                } catch {
                    Write-JsonResponse $stream 400 @{ error = $_.Exception.Message }
                }
                continue
            }
            if ($path -in @('/api/hostinger/status','/api/hostinger/connect','/api/hostinger/expiration','/api/hostinger/sites-cache','/api/hostinger/websites','/api/hostinger/domain-portfolio','/api/hostinger/subdomains','/api/hostinger/subdomains/list','/api/hostinger/subdomains/delete','/api/hostinger/subdomains/verify-deletion','/api/hostinger/publish/preflight','/api/hostinger/publish/verify','/api/hostinger/publish','/api/hostinger/connection')) {
                if (-not (Test-HostingerLocalRequest $request.Headers)) {
                    Write-JsonResponse $stream 403 @{ error = 'A requisição à integração Hostinger não veio da origem local do Hub.' }
                    continue
                }
                try {
                    if ($request.Method -eq 'GET' -and $path -eq '/api/hostinger/status') {
                        $configured = Test-Path -LiteralPath $hostingerTokenPath -PathType Leaf
                        $metadata = $null
                        if ($configured) {
                            $metadata = Get-HostingerTokenMetadata
                            if ($null -eq $metadata) {
                                # The existing token was created with a one-month term per the user; anchor its reminder now.
                                $metadata = Save-HostingerTokenMetadata -Term '1_month' -RegisteredAtUtc ([DateTimeOffset]::UtcNow.ToString('o'))
                            }
                        }
                        Write-JsonResponse $stream 200 @{ configured = $configured; expiration = $metadata }
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/connect') {
                        Write-JsonResponse $stream 200 (Connect-Hostinger $request.Body)
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/expiration') {
                        Write-JsonResponse $stream 200 @{ expiration = (Set-HostingerTokenExpiration $request.Body) }
                    } elseif ($request.Method -eq 'GET' -and $path -eq '/api/hostinger/sites-cache') {
                        Write-JsonResponse $stream 200 (Get-HostingerSitesCache)
                    } elseif ($request.Method -eq 'GET' -and $path -eq '/api/hostinger/websites') {
                        $result = Get-HostingerWebsites (Get-HostingerToken)
                        Save-HostingerSitesCache -Result $result | Out-Null
                        Write-JsonResponse $stream 200 $result
                    } elseif ($request.Method -eq 'GET' -and $path -eq '/api/hostinger/domain-portfolio') {
                        Write-JsonResponse $stream 200 (Get-HostingerDomainPortfolio (Get-HostingerToken))
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/subdomains') {
                        Write-JsonResponse $stream 200 (New-HostingerSubdomain -Body $request.Body)
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/subdomains/list') {
                        Write-JsonResponse $stream 200 (Get-HostingerSubdomains -Body $request.Body)
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/subdomains/delete') {
                        Write-JsonResponse $stream 200 (Remove-HostingerSubdomain -Body $request.Body)
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/subdomains/verify-deletion') {
                        Write-JsonResponse $stream 200 (Get-HostingerSubdomainDeletionVerification -Body $request.Body)
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/publish/preflight') {
                        $plan = Get-HostingerPublishPlan -Body $request.Body
                        Write-JsonResponse $stream 200 @{
                            ready = $plan.ready
                            canOverwrite = $false
                            domain = $plan.domain
                            targetDirectory = $plan.targetDirectory
                            files = $plan.files
                            fileCount = $plan.fileCount
                            totalBytes = $plan.totalBytes
                            fingerprint = $plan.fingerprint
                            conflicts = $plan.conflicts
                            missingDirectories = $plan.missingDirectories
                            linkedDirectories = $plan.linkedDirectories
                            checkedAtUtc = $plan.checkedAtUtc
                        }
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/publish/verify') {
                        Write-JsonResponse $stream 200 (Get-HostingerPublishInventoryVerification -Body $request.Body)
                    } elseif ($request.Method -eq 'POST' -and $path -eq '/api/hostinger/publish') {
                        Write-JsonResponse $stream 200 (Publish-HostingerFiles -Body $request.Body)
                    } elseif ($request.Method -eq 'DELETE' -and $path -eq '/api/hostinger/connection') {
                        if (Test-Path -LiteralPath $hostingerTokenPath -PathType Leaf) { Remove-Item -LiteralPath $hostingerTokenPath -Force }
                        if (Test-Path -LiteralPath $hostingerMetadataPath -PathType Leaf) { Remove-Item -LiteralPath $hostingerMetadataPath -Force }
                        if (Test-Path -LiteralPath $hostingerSitesCachePath -PathType Leaf) { Remove-Item -LiteralPath $hostingerSitesCachePath -Force }
                        Write-JsonResponse $stream 200 @{ disconnected = $true }
                    } else {
                        Write-JsonResponse $stream 405 @{ error = 'Método não permitido para a integração Hostinger.' }
                    }
                } catch {
                    Write-JsonResponse $stream 400 @{ error = $_.Exception.Message }
                }
                continue
            }
            if ($path -in @('/api/knowledge/manifest', '/api/knowledge/export.zip')) {
                if ($request.Method -ne 'GET') {
                    Write-JsonResponse $stream 405 @{ error = 'Método não permitido.' }
                    continue
                }
                if (-not (Test-KnowledgeExportRequest $request.Headers)) {
                    Write-JsonResponse $stream 403 @{ error = 'Exportação local não autorizada para esta requisição.' }
                    continue
                }
                if ($path -eq '/api/knowledge/manifest') {
                    $manifest = Get-KnowledgeExportManifest -ProjectRoot $projectRoot -PersonalSkillsRoot $personalSkillsRoot
                    Write-JsonResponse $stream 200 $manifest
                    continue
                }
                try {
                    $zipBytes = New-KnowledgeExportZip -ProjectRoot $projectRoot -PersonalSkillsRoot $personalSkillsRoot
                    $filename = 'hub-conhecimento-' + [DateTime]::Now.ToString('yyyy-MM-dd') + '.zip'
                    Write-HttpResponse $stream 200 'application/zip' $zipBytes ("Content-Disposition: attachment; filename=`"$filename`"`r`n")
                } catch {
                    Write-JsonResponse $stream 400 @{ error = 'Não foi possível gerar o pacote. Confira a disponibilidade das fontes e tente novamente.' }
                }
                continue
            }
            if ($request.Method -eq 'POST' -and $path -in @('/api/presell/validate','/api/presell/produce','/api/presell/preflight','/api/presell/overwrite-preflight','/api/presell/overwrite','/api/presell/batch-preflight','/api/presell/batch-produce','/api/presell/batch-overwrite-preflight','/api/presell/batch-overwrite')) {
                if (-not (Test-HubLocalRequest $request.Headers)) {
                    Write-JsonResponse $stream 403 @{ error = 'A criação de Pre-Sell só pode ser solicitada pela origem local do Hub.' }
                    continue
                }
                if ($path -in @('/api/presell/batch-preflight','/api/presell/batch-produce','/api/presell/batch-overwrite-preflight','/api/presell/batch-overwrite')) {
                    $batchProduceRequest = $path -in @('/api/presell/batch-produce','/api/presell/batch-overwrite')
                    $batchOverwriteRequest = $path -in @('/api/presell/batch-overwrite-preflight','/api/presell/batch-overwrite')
                    if ($path -eq '/api/presell/batch-overwrite') {
                        $batchPayload = $request.Body | ConvertFrom-Json
                        if ($batchPayload.confirmed -ne $true) { throw 'Confirme a substituição das páginas do lote antes de continuar.' }
                    }
                    Write-JsonResponse $stream 200 (Invoke-PresellBatchApi -Body $request.Body -Produce:$batchProduceRequest -OverwriteExisting:$batchOverwriteRequest)
                    continue
                }
                if ($path -in @('/api/presell/overwrite-preflight','/api/presell/overwrite')) {
                    $overwriteProduceRequest = $path -eq '/api/presell/overwrite'
                    Write-JsonResponse $stream 200 (Invoke-PresellOverwriteApi -Body $request.Body -Produce:$overwriteProduceRequest)
                    continue
                }
                $produceRequest = $path -eq '/api/presell/produce'
                $preflightRequest = $path -eq '/api/presell/preflight'
                Write-JsonResponse $stream 200 (Invoke-PresellApi $request.Body $produceRequest $preflightRequest)
                continue
            }
            if ($request.Method -ne 'GET') {
                Write-JsonResponse $stream 405 @{ error = 'Método não permitido.' }
                continue
            }
            $relative = [Uri]::UnescapeDataString($path.TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar)
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
            $candidate = [IO.Path]::GetFullPath((Join-Path $siteDirectory $relative))
            if ([IO.Path]::GetExtension($candidate).ToLowerInvariant() -in @('.json', '.jsonl', '.csv', '.tsv', '.xls', '.xlsx', '.db', '.sqlite', '.sqlite3', '.bak')) {
                Write-JsonResponse $stream 404 @{ error = 'Dados privados não fazem parte do pacote compartilhável.' }
                continue
            }
            $sitePrefix = $siteDirectory.TrimEnd('\') + '\'
            if (Test-Path -LiteralPath $candidate -PathType Container) { $candidate = Join-Path $candidate 'index.html' }
            if (-not $candidate.StartsWith($sitePrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                Write-JsonResponse $stream 404 @{ error = 'Arquivo não encontrado.' }
                continue
            }
            $bytes = [IO.File]::ReadAllBytes($candidate)
            Write-HttpResponse $stream 200 (Get-ContentType $candidate) $bytes
        } catch {
            try {
                if ($null -ne $stream -and $stream.CanWrite) { Write-JsonResponse $stream 400 @{ error = $_.Exception.Message } }
            } catch { }
        } finally {
            if ($null -ne $stream) { $stream.Dispose() }
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
