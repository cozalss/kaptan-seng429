/**
 * Fictional issuers only (KAPTAN-BRIEF §0): every name carries an obviously fictional prefix
 * (ÖRNEK, DOĞU, TOROS, KORU, MİSAL, FARAZİ) and every ticker starts with ORN/DMO/TMS/KRG/MSL/FRZ.
 * No real company, no real price.
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
  ["DMOGD", "DOĞU GIDA SANAYİ A.Ş.", "Gıda", null, 0.46, 44_000_000, 22.18],
  ["DMOEN", "DOĞU ENERJİ ÜRETİM A.Ş.", "Enerji", "Doğu Grup", 0.31, 128_000_000, 35.9],
  ["DMOIN", "DOĞU İNŞAAT A.Ş.", "İnşaat", "Doğu Grup", 0.27, 61_000_000, 14.44],
  ["DMOKM", "DOĞU KİMYA A.Ş.", "Kimya", null, 0.39, 33_000_000, 51.2],
  ["DMOOT", "DOĞU OTOMOTİV A.Ş.", "Otomotiv", "Doğu Grup", 0.33, 187_000_000, 141.7],
  ["TMSLJ", "TOROS LOJİSTİK A.Ş.", "Ulaştırma", null, 0.24, 27_000_000, 9.86],
  ["TMSPZ", "TOROS PERAKENDE A.Ş.", "Perakende", null, 0.44, 92_000_000, 76.15],
  ["TMSSG", "TOROS SAĞLIK HİZMETLERİ A.Ş.", "Sağlık", null, 0.38, 49_000_000, 41.3],
  ["TMSMK", "TOROS MAKİNE A.Ş.", "Makine", "Toros Sanayi", 0.3, 58_000_000, 88.4],
  ["TMSKG", "TOROS KAĞIT A.Ş.", "Kağıt", "Toros Sanayi", 0.35, 21_000_000, 12.96],
  ["KRGMD", "KORU MADENCİLİK A.Ş.", "Madencilik", null, 0.28, 66_000_000, 57.75],
  ["KRGTK", "KORU TEKNOLOJİ A.Ş.", "Teknoloji", null, 0.49, 83_000_000, 104.2],
  ["KRGCL", "KORU ÇELİK A.Ş.", "Metal", "Koru Holding", 0.32, 119_000_000, 33.48],
  ["KRGGY", "KORU GAYRİMENKUL YO A.Ş.", "GYO", "Koru Holding", 0.42, 37_000_000, 7.92],
  ["KRGSG", "KORU SİGORTA A.Ş.", "Sigorta", "Koru Holding", 0.26, 29_000_000, 26.6],
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

/** The issuer behind a ticker, or null when the fixtures do not know it (never throws). */
export function findIssuer(ticker: string): Issuer | null {
  return BY_TICKER.get(ticker) ?? null;
}

export function issuer(ticker: string): Issuer {
  const found = BY_TICKER.get(ticker);
  if (!found) throw new Error(`Unknown fixture ticker ${ticker}`);
  return found;
}
