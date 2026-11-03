# Yedekten dönüş.
#   .\geri-yukle.ps1 -Deneme            en son yedeği ayrı bir veritabanına açar, kayıtları doğrular, siler.
#                                       Canlı veriye dokunmaz. Yedeğin işe yaradığını görmek için.
#   .\geri-yukle.ps1                    aynısını yapar, doğrulanırsa o yedeğe geçer. Bugünkü veriyi silmez, eski
#                                       adıyla bir kenara koyar.
#   -Dosya kaptan-20261103T000000Z.dump  en son yerine bu yedek
param([switch]$Deneme, [string]$Dosya)

. "$PSScriptRoot\backend\ops\kaptan-ortak.ps1"

$AppServices = @('panel', 'api', 'scheduler', 'ingest_worker', 'agent_worker', 'warmup')

function Get-Dump([string]$Folder, [string]$Requested) {
    if ($Requested) {
        $name = Split-Path -Leaf $Requested
        if (-not (Test-Path -LiteralPath (Join-Path $Folder $name))) { Fail "Yedek bulunamadı: $name" }
        return $name
    }
    $latest = Get-ChildItem -LiteralPath $Folder -Filter 'kaptan-*.dump' | Sort-Object Name | Select-Object -Last 1
    if (-not $latest) { Fail "Bu klasörde yedek yok: $Folder" }
    return $latest.Name
}

function Invoke-Restore([string]$Dump) {
    Say "Yedek açılıyor: $Dump"
    docker compose exec -T backup sh /ops/restore-into.sh $Dump
    return ($LASTEXITCODE -eq 0)
}

function Test-RestoredLedger {
    # Uygulama rolüyle bağlanır: yedekle gelen yetkiler de sınanmış olur.
    Say 'Kayıtlar doğrulanıyor (zincir ve yedek klasöründeki çapa dosyası)...'
    docker compose run --rm --no-deps -T --entrypoint sh scheduler /ops/verify-restore.sh | ForEach-Object { Say $_ }
    return ($LASTEXITCODE -eq 0)
}

Assert-DockerRunning
Assert-Installed

$folder = (Read-EnvFile $EnvPath)['KAPTAN_BACKUP_DIR']
if (-not $folder) { Fail 'Yedek klasörü kayıtlı değil. Önce .\kur.ps1 çalıştır.' }
$dump = Get-Dump $folder $Dosya

docker compose up -d --wait postgres backup
if ($LASTEXITCODE -ne 0) { Fail 'Veritabanı başlamadı.' }

if (-not (Invoke-Restore $dump)) { docker compose exec -T backup sh /ops/restore-into.sh --drop; Fail 'Yedek açılamadı. Canlı veriye dokunulmadı.' }
if (-not (Test-RestoredLedger)) {
    docker compose exec -T backup sh /ops/restore-into.sh --drop
    Fail 'Bu yedeğin kayıtları doğrulanmadı. KULLANMA. Canlı veriye dokunulmadı. Daha eski bir yedeği -Dosya ile dene.'
}

if ($Deneme) {
    docker compose exec -T backup sh /ops/restore-into.sh --drop
    Say "Deneme başarılı: $dump açıldı, kayıtlar sağlam. Canlı veriye dokunulmadı."
    exit 0
}

Say 'KAPtan kısa süreliğine duruyor...'
docker compose stop @AppServices
if ($LASTEXITCODE -ne 0) { Fail 'Uygulama durdurulamadı. Canlı veriye dokunulmadı.' }
$old = 'kaptan_eski_' + (Get-Date).ToString('yyyyMMdd_HHmmss')
docker compose exec -T backup sh /ops/restore-into.sh --swap $old
if ($LASTEXITCODE -ne 0) { Fail 'Veritabanı değiştirilemedi. .\baslat.ps1 ile eski haliyle başlat.' }
Say "Geçildi. Bugünkü veri silinmedi, $old adıyla duruyor."
Say 'Şimdi .\baslat.ps1 ile başlat.'
