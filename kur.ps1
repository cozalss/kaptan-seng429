# KAPtan kurulumu. Bir kez çalıştır; sonra yeniden çalıştırmak güvenlidir (parolayı değiştirmek için de bu).
#   .\kur.ps1
# Parolanın yalnız özetini saklar, gizli anahtarları üretir, sağlayıcı anahtarlarını sorar ya da var olanları
# korur, hepsini .env dosyasına yazar (git'e girmez, yalnız senin Windows kullanıcın okuyabilir). Hiçbir gizli
# değeri ekrana yazmaz.
# -PasswordFromStdin: parolayı tek satır olarak standart girdiden okur ve hiçbir şey sormaz (otomatik deneme).
param([switch]$PasswordFromStdin)

. "$PSScriptRoot\backend\ops\kaptan-ortak.ps1"

$MinPasswordLength = 10
$MaxPasswordLength = 200
$ProviderKeys = @('GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY')
$GeneratedSecrets = @{ JWT_SECRET = 64; POSTGRES_PASSWORD = 40; KAPTAN_APP_PASSWORD = 40; REDIS_PASSWORD = 40 }
$OrderedNames = @(
    'JWT_SECRET', 'PASSPHRASE_HASH', 'POSTGRES_PASSWORD', 'KAPTAN_APP_PASSWORD', 'REDIS_PASSWORD',
    'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'KAPTAN_BACKUP_DIR'
)

function New-Secret([int]$Length) {
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $bytes = New-Object byte[] $Length
    $rng.GetBytes($bytes)
    $chars = foreach ($b in $bytes) { $alphabet[$b % $alphabet.Length] }
    return -join $chars
}

function Read-Hidden([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Test-Password([string]$Password) {
    if ($Password.Length -lt $MinPasswordLength) { Say "Parola en az $MinPasswordLength karakter olmalı."; return $false }
    if ($Password.Length -gt $MaxPasswordLength) { Say "Parola en fazla $MaxPasswordLength karakter olabilir."; return $false }
    if ($Password -eq 'kaptan2026') { Say 'Bu parola herkesçe biliniyor. Başka bir parola seç.'; return $false }
    return $true
}

function Read-NewPassword {
    while ($true) {
        $first = Read-Hidden "Yeni parolan (en az $MinPasswordLength karakter, yazarken görünmez)"
        if (-not (Test-Password $first)) { continue }
        if ($first -ceq (Read-Hidden 'Aynı parolayı bir daha yaz')) { return $first }
        Say 'İki parola aynı değil. Yeniden dene.'
    }
}

function Get-Password($Current) {
    if ($PasswordFromStdin) {
        $line = [Console]::In.ReadLine()
        if ([string]::IsNullOrEmpty($line)) {
            if ($Current['PASSPHRASE_HASH']) { return $null }
            Fail 'Parola gelmedi.'
        }
        if (-not (Test-Password $line)) { Fail 'Parola uygun değil.' }
        return $line
    }
    if ($Current['PASSPHRASE_HASH']) {
        $answer = Read-Host 'Parola zaten seçilmiş. Değiştirmek ister misin? (e/H)'
        if ($answer -notmatch '^[eE]') { return $null }
    }
    return Read-NewPassword
}

function Get-ImportedKeys($Current) {
    # Anahtarlar daha önce live.env ya da backend/.env içine yazılmış olabilir: sormadan kullan, gösterme.
    $keys = @{}
    foreach ($name in $ProviderKeys) { $keys[$name] = $Current[$name] }
    if ($env:COMPOSE_ENV_FILES) { return $keys }  # bir deneme kurulumu gerçek anahtarları almaz
    foreach ($file in @((Join-Path $RepoRoot 'live.env'), (Join-Path $RepoRoot 'backend\.env'))) {
        $found = Read-EnvFile $file
        foreach ($name in $ProviderKeys) {
            if (-not $keys[$name] -and $found[$name]) { $keys[$name] = $found[$name] }
        }
    }
    return $keys
}

function Read-ProviderKeys($Keys) {
    Say ''
    Say 'Sağlayıcı anahtarları. Enter: olduğu gibi kalsın. Yazdığın görünmez.'
    foreach ($name in $ProviderKeys) {
        $state = if ($Keys[$name]) { 'kayıtlı' } else { 'boş' }
        $typed = Read-Hidden "$name ($state)"
        if ($typed) { $Keys[$name] = $typed.Trim() }
    }
    return $Keys
}

function Get-BackupDir($Current) {
    $default = if ($Current['KAPTAN_BACKUP_DIR']) { $Current['KAPTAN_BACKUP_DIR'] } else { Join-Path $HOME 'KAPtan-Yedek' }
    $dir = $default
    if (-not $PasswordFromStdin) {
        Say ''
        Say 'Gece yedekleri bu klasöre yazılır. Docker silinse bile dosyalar burada kalır.'
        $typed = Read-Host "Yedek klasörü (Enter: $default)"
        if ($typed) { $dir = $typed.Trim('" ') }
    }
    if ($dir -match "'") { Fail "Yedek klasörünün adında ' olamaz: $dir" }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return ((Resolve-Path $dir).Path -replace '\\', '/')
}

function Get-PasswordHash([string]$Password, [string]$Image) {
    # Parola komut satırına değil standart girdiye gider. Özet imajın kendi kütüphanesiyle üretilir.
    # PowerShell 5.1 çift tırnakları yerel komutlara iletmez: Python kodunda yalnız tek tırnak.
    $code = 'import sys; from pwdlib import PasswordHash; ' +
        'print(PasswordHash.recommended().hash(sys.stdin.buffer.read().decode(''utf-8'').rstrip(''\r\n'')))'
    $hash = $Password | docker run --rm -i --network none --entrypoint python $Image -c $code
    if ($LASTEXITCODE -ne 0 -or "$hash" -notmatch '^\$argon2') { Fail 'Parola özeti üretilemedi.' }
    return "$hash".Trim()
}

function Write-EnvFile($Values) {
    $lines = New-Object System.Collections.ArrayList
    [void]$lines.Add('# KAPtan: kur.ps1 yazdı. Gizli değerler içerir; kimseyle paylaşma, git''e ekleme.')
    foreach ($name in $OrderedNames) { [void]$lines.Add("$name='$($Values[$name])'") }
    foreach ($name in ($Values.Keys | Sort-Object)) {
        if ($OrderedNames -notcontains $name) { [void]$lines.Add("$name='$($Values[$name])'") }
    }
    $temp = "$EnvPath.yeni"
    [IO.File]::WriteAllText($temp, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
    $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    icacls $temp /inheritance:r /grant:r "${me}:F" | Out-Null
    if ($LASTEXITCODE -ne 0) { Remove-Item $temp -Force; Fail '.env dosyasının izinleri ayarlanamadı.' }
    Move-Item -Force $temp $EnvPath
}

function Sync-DatabasePasswords($Values, [bool]$PasswordChanged) {
    # Var olan bir veritabanı eski parolalarını bilir: içeriden (parola gerekmeyen yerel soket) yenilerine geçir.
    Say 'Veritabanı hazırlanıyor...'
    docker compose up -d --wait postgres
    if ($LASTEXITCODE -ne 0) { Fail 'Veritabanı başlamadı. docker compose logs postgres ile bak.' }
    $owner = $Values['POSTGRES_PASSWORD']
    $app = $Values['KAPTAN_APP_PASSWORD']
    $sql = @"
ALTER ROLE kaptan_owner PASSWORD '$owner';
DO `$`$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kaptan_app') THEN ALTER ROLE kaptan_app PASSWORD '$app'; END IF;
END `$`$;
"@
    if ($PasswordChanged) {
        # Parola değiştiyse açık oturumlar da kapanır. Yeni kurulumda tablo henüz yoktur.
        $sql += @"

DO `$`$ BEGIN
  IF to_regclass('auth.refresh_tokens') IS NOT NULL THEN
    UPDATE auth.refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;
  END IF;
END `$`$;
"@
    }
    $sql | docker compose exec -T postgres psql -q -U kaptan_owner -d kaptan -v ON_ERROR_STOP=1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'Veritabanı parolaları güncellenemedi.' }
}

function Restart-IfRunning {
    $running = docker compose ps --status running -q api
    if ($running) {
        Say 'KAPtan çalışıyor: yeni ayarlarla yeniden başlatılıyor...'
        docker compose up -d
        if ($LASTEXITCODE -ne 0) { Fail 'Yeniden başlatılamadı.' }
    }
}

Assert-DockerRunning

$current = Read-EnvFile $EnvPath
$isFirstRun = -not $current['JWT_SECRET']
Say $(if ($isFirstRun) { 'KAPtan kurulumu başlıyor.' } else { 'Kurulum var. Gizli anahtarlar korunuyor; yalnız istediğini değiştir.' })

$password = Get-Password $current
$keys = Get-ImportedKeys $current
if (-not $PasswordFromStdin) { $keys = Read-ProviderKeys $keys }
$usable = @($ProviderKeys | Where-Object { $keys[$_] })
if ($usable.Count -eq 0) { Fail 'En az bir sağlayıcı anahtarı gerekli. Yeniden çalıştır ve anahtarı yapıştır.' }
if (-not $keys['GEMINI_API_KEY']) { Say 'Not: GEMINI_API_KEY yok; geçmiş bildirim hafızası çalışmaz.' }
$backupDir = Get-BackupDir $current

$values = @{}
foreach ($name in $current.Keys) { $values[$name] = $current[$name] }
foreach ($name in $GeneratedSecrets.Keys) {
    if (-not $values[$name]) { $values[$name] = New-Secret $GeneratedSecrets[$name] }
}
foreach ($name in $ProviderKeys) { $values[$name] = $keys[$name] }
$values['KAPTAN_BACKUP_DIR'] = $backupDir

$image = if ($values['KAPTAN_BACKEND_IMAGE']) { $values['KAPTAN_BACKEND_IMAGE'] } else { 'kaptan-backend:local' }
if ($password) {
    Say ''
    Say 'Uygulama derleniyor. İlk seferde 5-10 dakika sürer...'
    docker build -q -t $image (Join-Path $RepoRoot 'backend') | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'Uygulama derlenemedi.' }
    $values['PASSPHRASE_HASH'] = Get-PasswordHash $password $image
}
Write-EnvFile $values
Say '.env yazıldı (git''e girmez).'

Say 'Panel derleniyor...'
docker compose build
if ($LASTEXITCODE -ne 0) { Fail 'Derleme başarısız oldu.' }
Sync-DatabasePasswords $values ([bool]$password)
Restart-IfRunning

Say ''
Say 'Kurulum tamam.'
Say "Yedekler: $backupDir"
Say 'Başlatmak için: .\baslat.ps1'
