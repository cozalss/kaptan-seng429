/**
 * Fictional issuers only (KAPTAN-BRIEF §0): every name carries an obviously fictional prefix
 * (ÖRNEK, DEMO, TEMSİLİ, KURGU, MİSAL, FARAZİ) and every ticker starts with ORN/DMO/TMS/KRG/MSL/FRZ.
 * No real company, no real price. All marked "Temsili" in the UI.
 */
export interface Issuer {
  ticker: string;
  name: string;
  sector: string;
  group: string | null;
  freeFloat: number;
  adv20Try: number;
  price: number;
  inUniverse: boolean;
}

const RAW: ReadonlyArray<[string, string, string, string | null, number, number, number, boolean?]> = [
  ["ORNEK", "ÖRNEK ENERJİ A.Ş.", "Enerji", "Örnek Holding", 0.34, 20_000_000, 47.4],
  ["ORNCM", "ÖRNEK ÇİMENTO A.Ş.", "Çimento", "Örnek Holding", 0.29, 96_000_000, 112.3],
  ["ORNTX", "ÖRNEK TEKSTİL A.Ş.", "Tekstil", null, 0.41, 38_000_000, 18.72],
  ["ORNYZ", "ÖRNEK YAZILIM A.Ş.", "Teknoloji", null, 0.52, 71_000_000, 63.85],
  ["ORNGD", "ÖRNEK GIDA A.Ş.", "Gıda", "Örnek Holding", 0.37, 55_000_000, 29.06],
  ["DMOGD", "DEMO GIDA SANAYİ A.Ş.", "Gıda", null, 0.46, 44_000_000, 22.18],
  ["DMOEN", "DEMO ENERJİ ÜRETİM A.Ş.", "Enerji", "Demo Grup", 0.31, 128_000_000, 35.9],
  ["DMOIN", "DEMO İNŞAAT A.Ş.", "İnşaat", "Demo Grup", 0.27, 61_000_000, 14.44],
  ["DMOKM", "DEMO KİMYA A.Ş.", "Kimya", null, 0.39, 33_000_000, 51.2],
  ["DMOOT", "DEMO OTOMOTİV A.Ş.", "Otomotiv", "Demo Grup", 0.33, 187_000_000, 141.7],
  ["TMSLJ", "TEMSİLİ LOJİSTİK A.Ş.", "Ulaştırma", null, 0.24, 27_000_000, 9.86],
  ["TMSPZ", "TEMSİLİ PERAKENDE A.Ş.", "Perakende", null, 0.44, 92_000_000, 76.15],
  ["TMSSG", "TEMSİLİ SAĞLIK HİZMETLERİ A.Ş.", "Sağlık", null, 0.38, 49_000_000, 41.3],
  ["TMSMK", "TEMSİLİ MAKİNE A.Ş.", "Makine", "Temsili Sanayi", 0.3, 58_000_000, 88.4],
  ["TMSKG", "TEMSİLİ KAĞIT A.Ş.", "Kağıt", "Temsili Sanayi", 0.35, 21_000_000, 12.96],
  ["KRGMD", "KURGU MADENCİLİK A.Ş.", "Madencilik", null, 0.28, 66_000_000, 57.75],
  ["KRGTK", "KURGU TEKNOLOJİ A.Ş.", "Teknoloji", null, 0.49, 83_000_000, 104.2],
  ["KRGCL", "KURGU ÇELİK A.Ş.", "Metal", "Kurgu Holding", 0.32, 119_000_000, 33.48],
  ["KRGGY", "KURGU GAYRİMENKUL YO A.Ş.", "GYO", "Kurgu Holding", 0.42, 37_000_000, 7.92],
  ["KRGSG", "KURGU SİGORTA A.Ş.", "Sigorta", "Kurgu Holding", 0.26, 29_000_000, 26.6],
  ["MSLEL", "MİSAL ELEKTRONİK A.Ş.", "Elektronik", null, 0.47, 52_000_000, 69.1],
  ["MSLTR", "MİSAL TARIM A.Ş.", "Tarım", null, 0.36, 18_000_000, 15.38],
  ["MSLHV", "MİSAL HAVACILIK A.Ş.", "Ulaştırma", null, 0.3, 241_000_000, 205.5],
  ["MSLCM", "MİSAL CAM A.Ş.", "Cam", null, 0.34, 64_000_000, 46.84],
  ["MSLIL", "MİSAL İLAÇ A.Ş.", "Sağlık", null, 0.4, 41_000_000, 58.02],
  ["FRZBN", "FARAZİ BANKA A.Ş.", "Banka", null, 0.22, 402_000_000, 31.24],
  ["FRZEN", "FARAZİ ENERJİ DAĞITIM A.Ş.", "Enerji", null, 0.29, 76_000_000, 24.7],
  ["FRZTL", "FARAZİ TELEKOM A.Ş.", "Telekom", null, 0.21, 155_000_000, 52.36],
  ["FRZMB", "FARAZİ MOBİLYA A.Ş.", "Mobilya", null, 0.45, 12_000_000, 8.44, false],
  ["FRZTS", "FARAZİ TURİZM A.Ş.", "Turizm", null, 0.51, 9_000_000, 5.97, false],
];

export const ISSUERS: readonly Issuer[] = RAW.map(([ticker, name, sector, group, freeFloat, adv20Try, price, inUniverse]) => ({
  ticker,
  name,
  sector,
  group,
  freeFloat,
  adv20Try,
  price,
  inUniverse: inUniverse ?? true,
}));

const BY_TICKER = new Map(ISSUERS.map((i) => [i.ticker, i]));

export function issuer(ticker: string): Issuer {
  const found = BY_TICKER.get(ticker);
  if (!found) throw new Error(`Unknown fixture ticker ${ticker}`);
  return found;
}
