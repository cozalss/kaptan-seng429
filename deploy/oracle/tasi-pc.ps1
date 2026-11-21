# KAPtan'ı PC'den Oracle sunucusuna taşımanın PC tarafı. Windows PowerShell 5.1.
#   .\deploy\oracle\tasi-pc.ps1 -Sunucu kaptan-sunucu
# Yaptığı: taze bir yedek alır, en yeni yedeği + çapa dosyasını + .env'yi + bir kontrol dosyasını Tailscale
# üzerinden sunucudaki ~/kaptan-tasi klasörüne kopyalar. PC'deki KAPtan'ı KENDİLİĞİNDEN KAPATMAZ.
#   -Durdur   kopya bittikten sonra .\durdur.ps1'i de çalıştırır (yalnız sen istersen).
# Önce: PC ve sunucu aynı Tailscale hesabında, sunucuda "tailscale up --ssh" yapılmış olmalı.
param(
    [Parameter(Mandatory = $true)][string]$Sunucu,
    [string]$Kullanici = 'ubuntu',
    [switch]$Durdur
)

. "$PSScriptRoot\..\..\backend\ops\kaptan-ortak.ps1"

Assert-DockerRunning
Assert-Installed
if ($Sunucu -notmatch '^[A-Za-z0-9.-]+$' -or $Kullanici -notmatch '^[a-z_][a-z0-9_-]*$') { Fail 'Sunucu ya da kullanıcı adı geçersiz.' }
foreach ($tool in 'ssh', 'scp') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "$tool bulunamadı. Windows Ayarlar > Uygulamalar > İsteğe bağlı özellikler > OpenSSH İstemcisi'ni kur." }
}

$folder = (Read-EnvFile $EnvPath)['KAPTAN_BACKUP_DIR']
if (-not $folder -or -not (Test-Path -LiteralPath $folder)) { Fail 'Yedek klasörü bulunamadı. Önce .\kur.ps1 çalıştır.' }

Say 'Veritabanı ve yedek servisi hazırlanıyor...'
docker compose up -d --wait postgres backup
if ($LASTEXITCODE -ne 0) { Fail 'Veritabanı başlamadı.' }

Say 'Taze yedek alınıyor...'
docker compose exec -T backup sh /ops/backup-once.sh
if ($LASTEXITCODE -ne 0) { Fail 'Yedek alınamadı.' }

$dump = Get-ChildItem -LiteralPath $folder -Filter 'kaptan-*.dump' | Sort-Object Name | Select-Object -Last 1
if (-not $dump) { Fail "Klasörde yedek yok: $folder" }
Say "Taşınacak yedek: $($dump.Name)"

# Sunucuda karşılaştırılacak sayılar (kayıt değil, yalnız sayı ve tutar).
$ledgerSql = "SELECT count(*) || ' ' || coalesce(sum(cash_delta),0) FROM trading.book_ledger WHERE kind='start' AND book_no=(SELECT max(no) FROM trading.book_epochs)"
$start = (docker compose exec -T postgres psql -qtAX -U kaptan_owner -d kaptan -c $ledgerSql | Out-String).Trim()
$total = (docker compose exec -T postgres psql -qtAX -U kaptan_owner -d kaptan -c 'SELECT count(*) FROM trading.book_ledger' | Out-String).Trim()
$stage = Join-Path ([IO.Path]::GetTempPath()) ('kaptan-tasi-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $check = Join-Path $stage 'kontrol.txt'
    [IO.File]::WriteAllText($check, "baslangic=$start`ndefter=$total`n", (New-Object Text.UTF8Encoding $false))

    $target = "$Kullanici@$Sunucu"
    Say "Sunucuya bağlanılıyor ($target)..."
    ssh -o StrictHostKeyChecking=accept-new $target 'umask 077; mkdir -p ~/kaptan-tasi'
    if ($LASTEXITCODE -ne 0) { Fail 'Sunucuya bağlanılamadı. Tailscale açık mı, sunucuda "tailscale up --ssh" yapıldı mı?' }

    $files = @($dump.FullName, "$($dump.FullName).sha256", (Join-Path $folder 'audit-anchors.jsonl'), $check, $EnvPath) |
        Where-Object { Test-Path -LiteralPath $_ }
    foreach ($file in $files) {
        scp -q $file "${target}:kaptan-tasi/"
        if ($LASTEXITCODE -ne 0) { Fail "Kopyalanamadı: $(Split-Path -Leaf $file)" }
    }
    # .env gizli değer içerir: yalnız sahibi okusun.
    ssh $target 'chmod 600 ~/kaptan-tasi/.env; ls -l ~/kaptan-tasi'
}
finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}

Say ''
Say 'Kopyalandı. Sunucuda sırayla:'
Say '  bash ~/kaptan-seng429/deploy/oracle/kur-sunucu.sh --env-from ~/kaptan-tasi/.env'
Say '  bash ~/kaptan-seng429/deploy/oracle/geri-yukle-sunucu.sh'
Say ''
Say 'ÖNEMLİ: Bu yedekten sonra PC de yazılan veri sunucuya gelmez. Sorunsuz taşıma için sunucudaki'
Say 'geri-yukle-sunucu.sh "TAŞIMA BAŞARILI" diyene kadar bir şey yapma, sonra PC de .\durdur.ps1 çalıştır.'
Say 'İki KAPtan hiçbir zaman aynı anda çalışmamalı.'
if ($Durdur) {
    Say 'İstediğin için PC deki KAPtan durduruluyor...'
    & "$PSScriptRoot\..\..\durdur.ps1"
}
