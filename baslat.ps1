# KAPtan'ı başlatır, hazır olunca tarayıcıda açar.
#   .\baslat.ps1              her gün
#   .\baslat.ps1 -Guncelle    kod değiştiyse: önce yeniden derler
#   .\baslat.ps1 -TarayiciAcma   tarayıcı açılmasın
param([switch]$Guncelle, [switch]$TarayiciAcma)

. "$PSScriptRoot\backend\ops\kaptan-ortak.ps1"

$ReadyMinutes = 5

Assert-DockerRunning
Assert-Installed

Say 'KAPtan başlıyor...'
if ($Guncelle) { docker compose up -d --build --remove-orphans } else { docker compose up -d --remove-orphans }
if ($LASTEXITCODE -ne 0) {
    Fail 'Başlatılamadı. Yukarıdaki satırlara bak. Sık sorunlar: docs/ops/RUNBOOK.md'
}

$url = Get-PanelUrl
$deadline = (Get-Date).AddMinutes($ReadyMinutes)
$ready = $false
while ((Get-Date) -lt $deadline) {
    if ((Test-Url "$url/api/v1/health") -and (Test-Url "$url/login")) { $ready = $true; break }
    Start-Sleep -Seconds 3
}
if (-not $ready) {
    docker compose ps
    Fail "KAPtan $ReadyMinutes dakikada hazır olmadı. Yukarıdaki listede healthy yazmayan satıra bak."
}

Say "Hazır: $url"
Say 'Kapatmak için: .\durdur.ps1'
Say 'İlk kurulumda geçmiş veriler 15-25 dakika yüklenir. O sırada öneri çıkmaz; bu normal.'
if (-not $TarayiciAcma) { Start-Process "$url/login" }
