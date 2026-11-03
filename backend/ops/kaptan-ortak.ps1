# kur.ps1, baslat.ps1, durdur.ps1 ve geri-yukle.ps1'in ortak parçaları. Windows PowerShell 5.1 ile çalışır.
# Kök klasörden "docker compose" komutlarının .env'yi bulması için konumu oraya alır.

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $RepoRoot
# Türkçe çıktı ve docker'a giden parola: varsayılan kod sayfaları Türkçe harfleri bozar.
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object Text.UTF8Encoding $false
$OutputEncoding = New-Object Text.UTF8Encoding $false

# COMPOSE_ENV_FILES yalnız denemede dolu olur; normalde kökteki .env kullanılır.
$EnvPath = if ($env:COMPOSE_ENV_FILES) { $env:COMPOSE_ENV_FILES } else { Join-Path $RepoRoot '.env' }

function Say([string]$Text) { [Console]::Out.WriteLine($Text) }

function Fail([string]$Text) {
    [Console]::Out.WriteLine("HATA: $Text")
    exit 1
}

function Read-EnvFile([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        $found = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$')
        if (-not $found.Success) { continue }
        $value = $found.Groups[2].Value.Trim()
        if ($value.Length -ge 2 -and $value[0] -eq $value[-1] -and ("'", '"' -contains $value[0])) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$found.Groups[1].Value] = $value
    }
    return $values
}

function Test-DockerRunning {
    & docker info --format '{{.ServerVersion}}' 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Assert-DockerRunning {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail 'Docker Desktop kurulu değil. https://www.docker.com/products/docker-desktop adresinden kur, sonra yeniden dene.'
    }
    if (Test-DockerRunning) { return }
    $app = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $app) {
        Say 'Docker Desktop açılıyor. Bu 1-2 dakika sürebilir...'
        Start-Process -FilePath $app
    }
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        if (Test-DockerRunning) { return }
    }
    Fail 'Docker Desktop çalışmıyor. Aç, alttaki balina simgesi yeşil olunca yeniden dene.'
}

function Assert-Installed {
    if (-not (Test-Path -LiteralPath $EnvPath)) { Fail 'KAPtan henüz kurulmamış. Önce .\kur.ps1 çalıştır.' }
}

function Get-PanelUrl {
    $port = (Read-EnvFile $EnvPath)['KAPTAN_PANEL_PORT']
    if (-not $port) { $port = '3100' }
    return "http://localhost:$port"
}

function Test-Url([string]$Url) {
    try {
        $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0
        return ($res.StatusCode -eq 200)
    } catch {
        return $false
    }
}
