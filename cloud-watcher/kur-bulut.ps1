# KAPtan bulut takibini kurar: bilgisayar kapalıyken de Telegram'a duyuru ve sabah özeti gelsin.
#   .\cloud-watcher\kur-bulut.ps1
# Yapacağın tek şey: Cloudflare hesabı (yalnız e-posta, kart yok), bu betiği çalıştırmak ve tarayıcıda "Allow"a basmak.
# Betik tekrar çalıştırılabilir: ne varsa korur, eksik olanı tamamlar. Hiçbir gizli değer ekrana yazılmaz.
# Windows PowerShell 5.1 ile çalışır. Bu betik gerçek bir Cloudflare hesabında henüz denenmedi (README'ye bak).
param([switch]$DockerYenidenBaslatma)

. "$PSScriptRoot\..\backend\ops\kaptan-ortak.ps1"
$CloudDir = $PSScriptRoot
Set-Location $CloudDir
$ErrorActionPreference = 'Continue'

$WorkerName = 'kaptan-bulut'
$DbName = 'kaptan-bulut'
$TokenShape = '^\d{6,12}:[A-Za-z0-9_-]{30,60}$'

function New-RandomText([int]$Bytes) {
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $buffer = New-Object byte[] $Bytes
    $rng.GetBytes($buffer)
    return ([Convert]::ToBase64String($buffer)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Invoke-Wrangler {
    # Çıktıyı hem gösterir hem döndürür. Wrangler gizli değer yazmaz; yine de gizli değerler argümanla verilmez.
    $log = ''
    & npx.cmd wrangler @args 2>&1 | Tee-Object -Variable log | ForEach-Object { Say "$_" }
    $script:WranglerExit = $LASTEXITCODE
    return ($log | Out-String)
}

function Set-EnvValue([string]$Name, [string]$Value) {
    # .env'deki NAME='değer' satırını değiştirir ya da ekler (dosyanın kalan satırlarına dokunmaz).
    $lines = New-Object System.Collections.ArrayList
    if (Test-Path -LiteralPath $EnvPath) { foreach ($l in [IO.File]::ReadAllLines($EnvPath)) { [void]$lines.Add($l) } }
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*$Name=") { $lines[$i] = "$Name='$Value'"; $found = $true }
    }
    if (-not $found) { [void]$lines.Add("$Name='$Value'") }
    [IO.File]::WriteAllText($EnvPath, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
}

function Get-BotToken($Current) {
    if ($Current['ALERT_TELEGRAM_BOT_TOKEN']) { return $Current['ALERT_TELEGRAM_BOT_TOKEN'] }
    # Ayarlar'dan yapıştırılmış olabilir: KAPtan'ın veritabanından, yalnız bu bilgisayarda okunur.
    if ((Test-DockerRunning) -and $Current['KAPTAN_APP_PASSWORD']) {
        $fromDb = & docker compose exec -T -e "PGPASSWORD=$($Current['KAPTAN_APP_PASSWORD'])" postgres `
            psql -U kaptan_app -d kaptan -tA -c 'SELECT token FROM ops.telegram WHERE id = 1' 2>$null
        $fromDb = ("$fromDb").Trim()
        if ($fromDb -match $TokenShape) { return $fromDb }
    }
    Say 'Bot kodunu bulamadım. @BotFather''ın verdiği kodu yapıştır (yazdığın görünmez).'
    $secure = Read-Host -Prompt 'Telegram bot kodu' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Say 'KAPtan bulut takibi kuruluyor. Birkaç dakika sürer.'
Assert-Installed
$current = Read-EnvFile $EnvPath

# 1) Node.js ve wrangler
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'Node.js kurulu değil. https://nodejs.org adresinden "LTS" sürümünü kur, sonra bu betiği yeniden çalıştır.'
}
if (-not (Test-Path -LiteralPath (Join-Path $CloudDir 'node_modules\.bin\wrangler.cmd'))) {
    Say 'Gerekli paketler indiriliyor...'
    & npm.cmd install --no-audit --no-fund 2>&1 | ForEach-Object { Say "$_" }
    if ($LASTEXITCODE -ne 0) { Fail 'Paketler indirilemedi. İnternet bağlantını kontrol edip yeniden dene.' }
}

# 2) Cloudflare girişi: tarayıcı açılır, bir kez "Allow"a basarsın
$who = (& npx.cmd wrangler whoami 2>&1 | Out-String)
if ($who -match 'not authenticated' -or $who -notmatch '@') {
    Say ''
    Say 'Şimdi tarayıcı açılacak. Cloudflare hesabınla giriş yap ve "Allow" (İzin ver) düğmesine bas.'
    & npx.cmd wrangler login 2>&1 | ForEach-Object { Say "$_" }
    $who = (& npx.cmd wrangler whoami 2>&1 | Out-String)
    if ($who -match 'not authenticated') { Fail 'Cloudflare girişi tamamlanmadı. Betiği yeniden çalıştırıp tarayıcıda Allow''a bas.' }
}
Say 'Cloudflare girişi tamam.'

# 3) Veritabanı (D1, ücretsiz): varsa aynısı kullanılır
$dbId = $null
$listText = (& npx.cmd wrangler d1 list --json 2>$null | Out-String)
try {
    foreach ($db in ($listText | ConvertFrom-Json)) { if ($db.name -eq $DbName) { $dbId = $db.uuid } }
} catch { $dbId = $null }
if (-not $dbId) {
    Say 'Veritabanı oluşturuluyor...'
    $null = 'n' | & npx.cmd wrangler d1 create $DbName 2>&1 | ForEach-Object { Say "$_" }
    $listText = (& npx.cmd wrangler d1 list --json 2>$null | Out-String)
    try { foreach ($db in ($listText | ConvertFrom-Json)) { if ($db.name -eq $DbName) { $dbId = $db.uuid } } } catch { $dbId = $null }
}
if (-not $dbId) { Fail 'Veritabanı oluşturulamadı ya da bulunamadı. Yukarıdaki satırlara bak.' }
$toml = Join-Path $CloudDir 'wrangler.toml'
$text = [IO.File]::ReadAllText($toml)
$text = [regex]::Replace($text, 'database_id\s*=\s*"[^"]*"', "database_id = `"$dbId`"")
[IO.File]::WriteAllText($toml, $text, (New-Object Text.UTF8Encoding $false))
$null = 'y' | & npx.cmd wrangler d1 migrations apply $DbName --remote 2>&1 | ForEach-Object { Say "$_" }
Say 'Veritabanı hazır.'

# 4) Yayına al (workers.dev adresi ilk seferde senden bir ad isteyebilir: kısa bir ad yaz)
$deployLog = Invoke-Wrangler deploy
if ($script:WranglerExit -ne 0) { Fail 'Yayına alınamadı. Yukarıdaki satırlara bak.' }
$match = [regex]::Match($deployLog, 'https://[A-Za-z0-9.-]+\.workers\.dev')
if (-not $match.Success) { Fail 'Worker adresi bulunamadı. Cloudflare panelinden adresi (…workers.dev) kopyalayıp CLOUD_WATCHER_URL olarak .env''ye yaz.' }
$workerUrl = $match.Value
Say 'Bulut programı yayında.'

# 5) Gizli değerler (Worker'a yazılır, ekrana yazılmaz)
$syncSecret = if ($current['CLOUD_SYNC_SECRET']) { $current['CLOUD_SYNC_SECRET'] } else { New-RandomText 32 }
$hookSecret = New-RandomText 32
$botToken = Get-BotToken $current
if ($botToken -notmatch $TokenShape) { Fail 'Bu bir bot kodu gibi görünmüyor.' }
$secrets = @{ CLOUD_SYNC_SECRET = $syncSecret; WEBHOOK_SECRET = $hookSecret; TELEGRAM_BOT_TOKEN = $botToken }
if ($current['GEMINI_API_KEY']) { $secrets['GEMINI_API_KEY'] = $current['GEMINI_API_KEY'] }
$tmp = [IO.Path]::GetTempFileName()
try {
    [IO.File]::WriteAllText($tmp, ($secrets | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
    $null = & npx.cmd wrangler secret bulk $tmp 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { Fail 'Gizli değerler Cloudflare''e yazılamadı.' }
} finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
Say 'Gizli değerler yazıldı.'

# 6) Telegram'ın bu adrese yazmasını sağla (webhook). Hata metni bot kodunu içerebilir: yalnız durum kodu yazılır.
$hookOk = $false
try {
    $body = @{ url = "$workerUrl/telegram"; secret_token = $hookSecret; allowed_updates = @('message', 'callback_query') } | ConvertTo-Json
    $reply = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
        -ContentType 'application/json' -Body $body -TimeoutSec 30
    $hookOk = [bool]$reply.ok
} catch {
    $code = ''
    try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = '' }
    Say "Telegram bağlantısı kurulamadı (kod: $code)."
}
if (-not $hookOk) { Fail 'Telegram bu adrese bağlanamadı. Bot kodunu kontrol edip yeniden dene.' }
Say 'Telegram bu programa bağlandı.'

# 7) KAP buluttan görünüyor mu? (Cloudflare adreslerini KAP engelliyor olabilir; bu önceden bilinemez)
$kap = 'unknown'
$reason = ''
for ($try = 1; $try -le 4; $try++) {
    try {
        $health = Invoke-RestMethod -Uri "$workerUrl/health" -Headers @{ Authorization = "Bearer $syncSecret" } -TimeoutSec 40
        $kap = $health.kap
        $reason = "$($health.reason)"
        break
    } catch {
        Start-Sleep -Seconds 6
    }
}

# 8) Bu bilgisayara yaz ve KAPtan'ı bu ayarla yeniden başlat
Set-EnvValue 'CLOUD_WATCHER_URL' $workerUrl
Set-EnvValue 'CLOUD_SYNC_SECRET' $syncSecret
Say '.env güncellendi (CLOUD_WATCHER_URL ve CLOUD_SYNC_SECRET).'
$restarted = $false
if (-not $DockerYenidenBaslatma -and (Test-DockerRunning)) {
    Set-Location $RepoRoot
    & docker compose up -d --no-deps api scheduler 2>&1 | ForEach-Object { Say "$_" }
    $restarted = ($LASTEXITCODE -eq 0)
}

Say ''
Say '--- Ne oldu ---'
Say "Bulut programın yayında: $workerUrl"
Say 'Telegram artık bu programa yazıyor; duyurular ve sabah özeti bilgisayar kapalıyken de telefonuna gelir.'
if ($restarted) { Say 'KAPtan yeni ayarla yeniden başlatıldı.' }
else { Say 'KAPtan açıkken ya da bir sonraki açılışında yeni ayarı alır (.\baslat.ps1).' }
if ($kap -eq 'ok') {
    Say 'KAP buluttan görünüyor: bilgisayar kapalıyken takip çalışacak.'
} elseif ($kap -eq 'blocked') {
    Say "DİKKAT: KAP, Cloudflare adreslerini engelliyor gibi görünüyor ($reason)."
    Say 'Bu durumda bilgisayar kapalıyken duyuru takibi ÇALIŞMAZ; yalnız bilgisayar açıkken ve sabah özeti için.'
    Say 'Birkaç saat sonra yeniden dene: .\cloud-watcher\kur-bulut.ps1'
} else {
    Say 'KAP''ın buluttan görünüp görünmediğini şimdi öğrenemedim. Birkaç dakika sonra Ayarlar > Telegram bölümüne bak.'
}
Say 'Telegram henüz bağlı değilse: KAPtan > Ayarlar > Telegram > "Bağla" ve çıkan bağlantıya telefonundan dokun.'
Say 'Bilgisayar kapalıyken ÇALIŞMAYANLAR: web sitesi ve alım/satım önerileri (bunlar bilgisayar açıkken hazırlanır).'
