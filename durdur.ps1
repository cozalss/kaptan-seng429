# KAPtan'ı durdurur. Veriler silinmez. Durdurduktan sonra bilgisayar yeniden açılsa da kendiliğinden başlamaz:
# .\baslat.ps1 ile yeniden başlatırsın. Durduğu sürece bildirim okunmaz.
. "$PSScriptRoot\backend\ops\kaptan-ortak.ps1"

Assert-DockerRunning
Assert-Installed

Say 'KAPtan duruyor...'
docker compose stop
if ($LASTEXITCODE -ne 0) { Fail 'Durdurulamadı. Yukarıdaki satırlara bak.' }
Say 'Durdu. Verilerin yerinde. Yeniden başlatmak için: .\baslat.ps1'
