#!/usr/bin/env bash
# Sunucudan KAPtan'ın konuştuğu adreslere erişilebiliyor mu? Kurulumdan ÖNCE bir kez çalıştır.
# Çıktı: her adres için OK ya da ENGELLİ. Kritik olanlar: KAP, İş Yatırım, en az bir LLM sağlayıcısı.
set -uo pipefail
fail_critical=0
check() {  # ad, kritik(1/0), url
  local name="$1" crit="$2" url="$3" code
  code="$(curl -s -o /dev/null -m 15 -A 'Mozilla/5.0' -w '%{http_code}' "$url" 2>/dev/null || true)"
  if [ -n "$code" ] && [ "$code" != 000 ] && [ "$code" -lt 500 ]; then
    printf 'OK       %-22s %s (HTTP %s)\n' "$name" "$url" "$code"
  else
    printf 'ENGELLİ  %-22s %s (HTTP %s)\n' "$name" "$url" "${code:-000}"
    [ "$crit" = 1 ] && fail_critical=1
  fi
}
check 'KAP'               1 https://www.kap.org.tr/tr
check 'KAP (api)'         1 https://www.kap.org.tr/tr/api/disclosures
check 'Is Yatirim'        1 https://www.isyatirim.com.tr/
check 'TCMB'              0 https://www.tcmb.gov.tr/
check 'Borsa Istanbul'    0 https://www.borsaistanbul.com/
check 'Yahoo Finance'     0 https://query1.finance.yahoo.com/v8/finance/chart/AAPL
check 'Gemini'            0 https://generativelanguage.googleapis.com/
check 'DeepSeek'          0 https://api.deepseek.com/
check 'Groq'              0 https://api.groq.com/
check 'ntfy'              0 https://ntfy.sh/
check 'GitHub'            1 https://github.com/cozalss/kaptan-seng429
check 'Docker Hub'        1 https://registry-1.docker.io/v2/
check 'Tailscale'         1 https://controlplane.tailscale.com/
echo
echo 'Not: HTTP 4xx de "ulaşılabiliyor" demektir (adres kapalı değil, yalnız bu uç noktaya kimlik/arama lazım).'
if [ "$fail_critical" = 1 ]; then
  echo 'SONUÇ: kritik bir adres ENGELLİ. KAPtan burada çalışmaz; kurulumdan önce REHBER.md "Ağ engeli" bölümüne bak.'
  exit 1
fi
echo 'SONUÇ: kritik adreslerin hepsine erişim var. En az bir LLM sağlayıcısı OK olmalı.'
