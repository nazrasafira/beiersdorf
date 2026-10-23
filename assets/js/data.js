/*
 * Data layer. Every page reads and writes data only through the functions exported at the bottom (window.Data).
 * Two backends, picked by window.APP_CONFIG (assets/js/config.js):
 * - demo (default): data is generated once with a fixed seed and kept in localStorage.
 * - sheets: Data.ready() loads the logged-in user's data from the Google Apps Script web app ("bootstrap", same shape);
 *   writes update the local copy at once and are sent to the server through a retrying queue
 *   (the "outbox", kept in localStorage so nothing is lost offline). Pages wait for Data.ready().
 */
(function () {
  'use strict';

  const CONFIG = Object.assign({ backend: 'demo', url: '' }, window.APP_CONFIG || {});
  const LIVE = CONFIG.backend === 'sheets';
  const STORE_KEY = 'lspg-data-v1';
  const USER_KEY = 'lspg-user';
  // Demo: the phone's date, data kept from the start of last month. Live: set from the server (today, and the first day of data sent to the page).
  let DATA_START = '';
  let TODAY = '';

  /* ---------- Date helpers (dates are 'YYYY-MM-DD' strings) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return toStr(d); };
  const addMonths = (mk, n) => { const d = parse(mk + '-01'); d.setMonth(d.getMonth() + n); return toStr(d).slice(0, 7); };
  const dow = s => parse(s).getDay(); // 0 = Sunday
  const weekStart = s => addDays(s, -((dow(s) + 6) % 7)); // Monday
  const weekEnd = s => addDays(weekStart(s), 6);
  const monthKey = s => s.slice(0, 7);
  const monthStart = s => s.slice(0, 7) + '-01';
  const monthEnd = s => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return toStr(d); };
  const eachDay = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

  {
    const now = new Date();
    TODAY = toStr(now);
    DATA_START = toStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  }

  function range(period, date) {
    if (period === 'day') return [date, date];
    if (period === 'week') return [weekStart(date), weekEnd(date)];
    return [monthStart(date), monthEnd(date)];
  }

  /* ---------- Seed data ---------- */
  // Product catalog: KODE SKU, Nama SKU di HO, Subbrand, price (Rp), barcode.
  // From the client's file "SOH OFFTAKE YCA & LSI PJR AGUST'26 FILE BARU 199 SKU" (199 SKUs), in that order.
  const PRODUCTS = [
    ['A1', 'NCRM CREME TIN 60ML', 'NIVEA ALL PURPOSE CREAMS', 22470, '8850029801025'],
    ['A2', 'NCRM CREME TIN 30ML', 'NIVEA ALL PURPOSE CREAMS', 9444, '40058153'],
    ['A7', 'NSFT SOFT 50ML', 'NIVEA ALL PURPOSE CREAMS', 14800, '8999777890544'],
    ['A8', 'NSFT SOFT 100ML', 'NIVEA ALL PURPOSE CREAMS', 24000, '8999777890551'],
    ['B1', 'NBO ANTI AGE SERUM 180ML', 'NIVEA BODY', 44000, '8999777007058'],
    ['B2', 'NBO REPAIR & PROTECT LOTION 100ML', 'NIVEA BODY', 17000, '8999777000165'],
    ['B3', 'NBO REPAIR & PROTECT LOTION 200ML', 'NIVEA BODY', 27000, '8999777000318'],
    ['B4', 'NBO REPAIR & PROTECT LOTION 400ML', 'NIVEA BODY', 56000, '4005808668069'],
    ['B5', 'NBO CARE & PROTECT SERUM 180ML', 'NIVEA BODY', 25225, '4005808713257'],
    ['B6', 'NBO CARE & PROTECT SERUM 70ML', 'NIVEA BODY', 12364, '4005808713226'],
    ['B8', 'NBO INSTANT GLOW LOTION 200ML', 'NIVEA BODY', 27000, '8999777008543'],
    ['B10', 'NBO INSTANT GLOW SERUM 180ML', 'NIVEA BODY', 25225, '8999777006990'],
    ['B12', 'NBO NIGHT NOURISH LOTION 200ML', 'NIVEA BODY', 33500, '8999777000110'],
    ['B13', 'NBO NIGHT NOURISH SERUM 180ML', 'NIVEA BODY', 25225, '8999777005320'],
    ['B14', 'NBO RADIANT & SMOOTH CREAM 100ML', 'NIVEA BODY', 29000, '8999777818586'],
    ['B16', 'NBO RADIANT & SMOOTH CREAM 50ML', 'NIVEA BODY', 15750, '8999777818579'],
    ['B17', 'NBO RADIANT & SMOOTH LOTION 100ML', 'NIVEA BODY', 17000, '8999777000042'],
    ['B18', 'NBO RADIANT & SMOOTH LOTION 200ML', 'NIVEA BODY', 27000, '8999777000059'],
    ['B19', 'NBO RADIANT & SMOOTH LOTION 400ML', 'NIVEA BODY', 53350, '8999777000271'],
    ['B20', 'NBO INTENSIVE MOISTURE LOTION 100ML', 'NIVEA BODY', 17000, '8999777000004'],
    ['B21', 'NBO INTENSIVE MOISTURE LOTION 200ML', 'NIVEA BODY', 20203, '8999777000011'],
    ['B22', 'NBO INTENSIVE MOISTURE LOTION 400ML', 'NIVEA BODY', 60000, '4005808232512'],
    ['B23', 'NBO INTENSIVE MOISTURE SERUM 180ML', 'NIVEA BODY', 29144, '8999777000448'],
    ['B24', 'NBO FIRM & SMOOTH LOTION 100ML', 'NIVEA BODY', 10100, '8999777009625'],
    ['B25', 'NBO FIRM & SMOOTH LOTION 200ML', 'NIVEA BODY', 25170, '8999777009564'],
    ['B26', 'NBO FIRM & SMOOTH LOTION 400ML', 'NIVEA BODY', 35910, '8999777009649'],
    ['B27', 'NBO DAILY PROTECTION SUN LOTION 100ML', 'NIVEA BODY', 35175, '8999777005351'],
    ['B35', 'NBO WHITENING COOLING HIJAB SERUM 180ML', 'NIVEA BODY', 28500, '8999777015725'],
    ['B36', 'NBO RADIANT & SMOOTH SERUM 180ML', 'NIVEA BODY', 25225, '8999777009588'],
    ['B37', 'NBO EXTRA BRIGHT 10 SUPER VITAMINS & SKIN FOODS SERUM 180ML', 'NIVEA BODY', 34800, '8999777017859'],
    ['B38', 'NBO EXTRA BRIGHT MIRACLE SWEET SERUM 180ML', 'NIVEA BODY', 41000, '8850029040516'],
    ['B39', 'NBO EXTRA BRIGHT VELVET ROMANCE SERUM 180ML', 'NIVEA BODY', 41000, '8850029040530'],
    ['B40', 'NBO EXTRA BRIGHT REPAIR & PROTECT LOTION 525ML', 'NIVEA BODY', 140000, '8999777018863'],
    ['B41', 'NBO EXTRA BRIGHT REPAIR & PROTECT SERUM 320ML', 'NIVEA BODY', 125000, '8999777018832'],
    ['B42', 'NBO EXTRA BRIGHT C & E VITAMIN LOTION 320ML', 'NIVEA BODY', 60538, '8999777018719'],
    ['B43', 'NBO EXTRA BRIGHT C & E VITAMIN LOTION 180ML', 'NIVEA BODY', 29144, '8999777001292'],
    ['B44', 'NBO SUPER 10 YOUTH PROTECT BODY SERUM 180ML', 'NIVEA BODY', 46500, '8850029040646'],
    ['B45', 'NBO SUPER 10 YOUTH PROTECT BODY SERUM 320ML', 'NIVEA BODY', 72072, '8850029040639'],
    ['B46', 'NBO C&AHA VITAMIN BODY SERUM 170ML', 'NIVEA BODY', 29144, '8999777023508'],
    ['B47', 'NBO SUPER C+ VITAMIN BODY SERUM 70ML', 'NIVEA BODY', 25852, '8999777023539'],
    ['B48', 'NBO SUPER C+ VITAMIN BODY SERUM 170ML', 'NIVEA BODY', 58363, '8999777023560'],
    ['C26', 'NSUN TRIPLE PROTECT ACNE OIL CONTROL SPF50+ PA+++ 40ML', 'NIVEA SUN', 75000, '8999777002527'],
    ['C7', 'NSUN KIDS ULTRA SENSISTIVE SPF50+ SPRAY 200ML', 'NIVEA SUN', 232146, '8999777015398'],
    ['C10', 'NSUN TANNING OIL LOTION 200ML', 'NIVEA SUN', 65500, '4005900114082'],
    ['C11', 'NSUN PROTECT & BRONZE SPF20 LOTION 200ML', 'NIVEA SUN', 188633, '4005808432394'],
    ['C12', 'NSUN PROTECT & MOISTURE SPF30 LOTION 100ML', 'NIVEA SUN', 110000, '8999777857837'],
    ['C13', 'NSUN PROTECT & MOISTURE SPF50 LOTION 100ML', 'NIVEA SUN', 152300, '8999777857844'],
    ['C14', 'NSUN PROTECT & MOISTURE SPF50+ LOTION 200ML', 'NIVEA SUN', 244745, '4005808430208'],
    ['C16', 'NSUN MOISTURISING AFTER SUN SPRAY 200ML', 'NIVEA SUN', 177135, '4005808804344'],
    ['C18', 'NSUN PROTECT & REFRESH SPF50 AEROSOL 200ML', 'NIVEA SUN', 193330, '4005808260706'],
    ['C27', 'NSUN BODY SUN SERUM TRIPLE PROTECT EXTRA RADIANCE & SMOOTH SPF50 PA+++ 180ML', 'NIVEA SUN', 93240, '8999777017880'],
    ['C22', 'NSUN PROTECT & WHITE INSTANT AURA SPF50+ PA+++ FACE SERUM 30ML', 'NIVEA SUN', 53560, '8999777015268'],
    ['C23', 'NSUN PROTECT & WHITE OIL CONTROL SPF50+ PA+++ FACE SERUM 30ML', 'NIVEA SUN', 53560, '8999777014230'],
    ['C24', 'NSUN EXTRA PROTECT C & E VITAMIN SUN CARE SPF50 PA+++ 30ML', 'NIVEA SUN', 53560, '8999777000837'],
    ['C25', 'NSUN TRIPLE PROTECT HOKKAIDO ROSE SPF50+ PA+++ FACE SERUM 40ML', 'NIVEA SUN', 75000, '8999777017644'],
    ['C28', 'NSUN TRIPLE PROTECT ANTI WRINKLE SPF50+ PA+++ 40ML', 'NIVEA SUN', 80625, '8999777003241'],
    ['C29', 'NSUN EXTRA PROTECT AURA SUN FACE SERUM SPF50+ PA+++ 7ML', 'NIVEA SUN', 12924, '42397793'],
    ['C30', 'NSUN EXTRA PROTECT OIL CONTROL SUN FACE SERUM SPF50+ PA+++ 7ML', 'NIVEA SUN', 12924, '42417507'],
    ['C31', 'NSUN PROTECT & MOISTURE SPF30 LOTION 75ML', 'NIVEA SUN', 70271, '8999777001513'],
    ['C32', 'NSUN PROTECT & MOISTURE SPF50 LOTION 75ML', 'NIVEA SUN', 100487, '8999777001575'],
    ['C33', 'NSUN PROTECT & LIGHT FEEL SPF 50+ LOTION 90ML', 'NIVEA SUN', 89081, '4005808984763'],
    ['D1', 'NM ACNE OIL CLEAR ACNE DEFENSE FACIAL FOAM 50ML', 'NIVEA MEN FACE CARE', 20900, '8999777888374'],
    ['D2', 'NM ACNE DEFENSE + PURIFY SCRUB 100ML', 'NIVEA MEN FACE CARE', 29920, '8999777813499'],
    ['D3', 'NM ACNE OIL CLEAR ACNE DEFENSE FACIAL FOAM 100ML', 'NIVEA MEN FACE CARE', 30600, '8999777888381'],
    ['D4', 'NM EXTRA WHITE DARK SPOT MINIMIZER FACIAL FOAM 100ML', 'NIVEA MEN FACE CARE', 30600, '8999777888367'],
    ['D5', 'NM EXTRA WHITE DARK SPOT MINIMIZER FACIAL FOAM 50ML', 'NIVEA MEN FACE CARE', 20900, '8999777888350'],
    ['D6', 'NM CREME TIN 30ML', 'NIVEA MEN FACE CARE', 25000, '40061191'],
    ['D7', 'NM CREME TIN 75ML', 'NIVEA MEN FACE CARE', 50000, '8999777012373'],
    ['D10', 'NM WHITE OIL CLEAR ANTI SHINE + PURIFY COOLING FACIAL FOAM 50ML', 'NIVEA MEN FACE CARE', 25500, '8999777002602'],
    ['D11', 'NM WHITE OIL CLEAR ANTI SHINE + PURIFY COOLING FACIAL FOAM 100ML', 'NIVEA MEN FACE CARE', 31200, '4005808694822'],
    ['D12', 'NM WHITE OIL CLEAR ANTI SHINE FACIAL FOAM 100ML', 'NIVEA MEN FACE CARE', 30600, '8999777000189'],
    ['D13', 'NM WHITE OIL CLEAR ANTI SHINE FACIAL FOAM 50ML', 'NIVEA MEN FACE CARE', 20900, '8999777000172'],
    ['D14', 'NM WHITE OIL CLEAR PORE MINIMIZING SCRUB 100ML', 'NIVEA MEN FACE CARE', 30600, '8999777002954'],
    ['D15', 'NM EXTRA WHITE ANTI-DARK SPOT SERUM 15ML', 'NIVEA MEN FACE CARE', 28900, '8999777015350'],
    ['D16', 'NM DEEP ACNE ATTACK SCRUB MUD FACIAL FOAM 100ML', 'NIVEA MEN FACE CARE', 30600, '8999777017293'],
    ['D17', 'NM EXTRA BRIGHT C&HYA VITAMIN SCRUB 100ML', 'NIVEA MEN FACE CARE', 31200, '8999777004316'],
    ['D18', 'NM EXTRA BRIGHT MUD FOAM 100ML', 'NIVEA MEN FACE CARE', 31200, '8999777001711'],
    ['E1', 'NFC EYE MAKE UP REMOVER DOUBLE EFFECT 125ML', 'NIVEA FEMALE FACE CARE', 61690, '4005900102300'],
    ['E3', 'NFC MICELLAIR BLACK XPERT 125ML', 'NIVEA FEMALE FACE CARE', 33870, '8999777012083'],
    ['E4', 'NFC MICELLAIR HYDRATION 125ML', 'NIVEA FEMALE FACE CARE', 25730, '8999777014711'],
    ['E5', 'NFC MICELLAIR PEARL WHITE 125ML', 'NIVEA FEMALE FACE CARE', 29025, '8999777011826'],
    ['E6', 'NFC MICELLAIR PEARL WHITE 200ML', 'NIVEA FEMALE FACE CARE', 45070, '8999777010522'],
    ['E19', 'NFC MICELLAIR PEARL BRIGHT 400ML', 'NIVEA FEMALE FACE CARE', 75000, '8999777017910'],
    ['E13', 'NFC HOKKAIDO ROSE WHIP FACIAL FOAM 100ML', 'NIVEA FEMALE FACE CARE', 49500, '4005900691255'],
    ['E14', 'NFC HOKKAIDO ROSE OIL-INFUSED MICELLAR WATER 125ML', 'NIVEA FEMALE FACE CARE', 45830, '8850029031781'],
    ['E16', 'NFC SPARKLING BRIGHT FACIAL FOAM 100ML', 'NIVEA FEMALE FACE CARE', 27300, '8999777867249'],
    ['E17', 'NFC SPARKLING BRIGHT FACIAL FOAM 50ML', 'NIVEA FEMALE FACE CARE', 15330, '8999777003968'],
    ['E18', 'NFC MICELLAIR OIL & ACNE CARE 125ML', 'NIVEA FEMALE FACE CARE', 29025, '8999777017507'],
    ['E20', 'NFC MICELLAIR OIL & ACNE CARE 400ML', 'NIVEA FEMALE FACE CARE', 75000, '8999777017941'],
    ['E21', 'NFC MICELLAR WATER DERMA ACNE CARE 125ML', 'NIVEA FEMALE FACE CARE', 29025, '8999777022945'],
    ['E22', 'NFC MICELLAR WATER DERMA ACNE CARE 400ML', 'NIVEA FEMALE FACE CARE', 75000, '8999777023003'],
    ['E23', 'NFC MICELLAR WATER SOOTHING 125ML', 'NIVEA FEMALE FACE CARE', 29025, '8999777023034'],
    ['E24', 'NFC MICELLAR WATER SOOTHING 400ML', 'NIVEA FEMALE FACE CARE', 75000, '8999777022976'],
    ['G2', 'NLC LIP BALM ORIGINAL ESSENTIAL', 'NIVEA LIP CARE', 27427, '8999777850616'],
    ['G6', 'NLC LIP BALM STRAWBERRY SHINE', 'NIVEA LIP CARE', 27427, '8999777850838'],
    ['G7', 'NLC LIP BALM OVERNIGHT CARE LIP BALM', 'NIVEA LIP CARE', 34000, '8850029039749'],
    ['G8', 'NLC LIP CARING COLOR CORAL', 'NIVEA LIP CARE', 29655, '8850029041957'],
    ['G9', 'NLC LIP CARING COLOR ROSE', 'NIVEA LIP CARE', 29655, '8850029041940'],
    ['H1', 'HP ROLL KAIN 1.25CM X 5M', 'Hansaplast WOUND PLASTER', 12828, '8999777012267'],
    ['H2', 'HP ROLL KAIN 1.25CM X 1M', 'Hansaplast WOUND PLASTER', 4549, '8999777019891'],
    ['H3', 'HP ANTISEPTIK PEMBERSIH LUKA SPRAY 40ML', 'Hansaplast WOUND PLASTER', 24673, '8999777010768'],
    ['H40', 'HP ANTISEPTIK PEMBERSIH LUKA 20ML', 'Hansaplast WOUND PLASTER', 13112, '42428954'],
    ['H34', 'HP SALEP LUKA 3.5G', 'Hansaplast WOUND PLASTER', 14545, '8999777015510'],
    ['H4', 'HP SALEP LUKA 20G', 'Hansaplast WOUND PLASTER', 37500, '8999777010782'],
    ['H49', 'HP Salep Luka 50g', 'Hansaplast WOUND PLASTER', 75000, '8999777018924'],
    ['H48', 'HANSAPLAST PLESTER BEKAS LUKA 21 LEMBAR', 'Hansaplast WOUND PLASTER', 284552, '8999777017675'],
    ['H52', 'Hansaplast 123 Siap Rawat Luka + Mainan Anak', 'Hansaplast WOUND PLASTER', 34234, '8999777024253'],
    ['H53', 'Hansaplast 123 Siap Rawat Luka + Mangkok', 'Hansaplast WOUND PLASTER', 61950, '8999777024260'],
    ['H5', 'HP AQUA PROTECT 6S', 'Hansaplast WOUND PLASTER', 12531, '8999777007690'],
    ['H44', 'HP AQUA PROTECT KIDS 20S', 'Hansaplast WOUND PLASTER', 28469, '8999777022631'],
    ['H45', 'HANSAPLAST AQUA PROTECT STERIL XL 6 X 7CM 5PCS', 'Hansaplast WOUND PLASTER', 37297, '8999777018436'],
    ['H46', 'HANSAPLAST AQUA PROTECT STERIL XXL 8 X 10CM 5PCS', 'Hansaplast WOUND PLASTER', 51892, '8999777018450'],
    ['H6', 'HP KAIN ELASTIS MIX 20S', 'Hansaplast WOUND PLASTER', 11018, '8999777016142'],
    ['H7', 'HANSAPLAST KAIN ELASTIS 100 LEMBAR', 'Hansaplast WOUND PLASTER', 27999, '8999777026370'],
    ['H8', 'HP KAIN ELASTIS MIX 10S', 'Hansaplast WOUND PLASTER', 5755, '8999777761097'],
    ['H9', 'HP 2638 KAIN ELASTIS JUMBO 50S', 'Hansaplast WOUND PLASTER', 27999, '8999777015596'],
    ['H10', 'HP KAIN ELASTIS FINGER STRIPS 6S', 'Hansaplast WOUND PLASTER', 11668, '8999777016203'],
    ['H12', 'HP MICKEY 10S', 'Hansaplast WOUND PLASTER', 10713, '4005800034473'],
    ['H13', 'HP FROZEN 10S', 'Hansaplast WOUND PLASTER', 10713, '8999777009014'],
    ['H14', 'HP DISNEY MARVEL AVENGERS 10S', 'Hansaplast WOUND PLASTER', 10713, '8999777016173'],
    ['H15', 'HP JUNIOR FUN 10S', 'Hansaplast WOUND PLASTER', 6358, '8999777016425'],
    ['H16', 'HP SENSITIVE 6S', 'Hansaplast WOUND PLASTER', 7141, '8999777013165'],
    ['H17', 'HP TRANSPARENT 10S', 'Hansaplast WOUND PLASTER', 9269, '8999777012151'],
    ['H20', 'HP KOYO HANGAT RENCENG', 'Hansaplast PAIN', 29272, '8999777001186'],
    ['H21', 'HP KOYO PANAS RENCENG', 'Hansaplast PAIN', 29272, '8999777000776'],
    ['H22', 'HP FOOT PLASTER 6S', 'Hansaplast FOOT', 9384, '8999777008895'],
    ['H23', 'HP KOYO PANAS RESEALABLE 10S', 'Hansaplast PAIN', 7720, '8999777090579'],
    ['H24', 'HP KOYO HANGAT RESEALABLE 10S', 'Hansaplast PAIN', 7720, '8999777765392'],
    ['H41', 'HP JUNIOR FUN 100S', 'Hansaplast WOUND PLASTER', 27999, '8999777017804'],
    ['H28', 'HP KASA ROL ELASTIS 4M X 6CM', 'Hansaplast WOUND PLASTER', 6694, '8999777015015'],
    ['H30', 'HP KASA STERIL 7.5 X 7.5CM 2PCS', 'Hansaplast WOUND PLASTER', 2547, '8999777016043'],
    ['H47', 'HANSAPLAST SENSITIVE STERIL XL 6 X 7CM 5PCS', 'Hansaplast WOUND PLASTER', 33153, '8999777018511'],
    ['H50', 'HP Sensitive Steril XXL 8 x 10cm 5pcs', 'Hansaplast WOUND PLASTER', 43243, '8999777018535'],
    ['H36', 'HP ROLL KAIN 1.25CM X 4.5M', 'Hansaplast WOUND PLASTER', 12193, '8999777016845'],
    ['H39', 'HP ROL KERTAS 2.5CM X 5M', 'Hansaplast WOUND PLASTER', 18182, '8999777017767'],
    ['H38', 'HP KAIN ELASTIS TOPLES 40X10S', 'Hansaplast WOUND PLASTER', 127802, '8999777012526'],
    ['H42', 'HP SECOND SKIN PROTECTION REGULAR 6S', 'Hansaplast WOUND PLASTER', 54054, '4006000135175'],
    ['H43', 'HP SECOND SKIN PROTECTION XL 3S', 'Hansaplast WOUND PLASTER', 54054, '8999777001353'],
    ['H51', 'HP Soft Compress Steril 7.5 x 7.5cm 10pcs', 'Hansaplast WOUND PLASTER', 18018, '8999777000738'],
    ['I1', 'NDEO ROLL ON DRY COMFORT 25ML', 'NIVEA DEO', 11100, '8999777004255'],
    ['I2', 'NDEO ROLL ON DRY COMFORT 50ML', 'NIVEA DEO', 18500, '8999777004194'],
    ['I4', 'NDEO ROLL ON EXTRA WHITENING 25ML', 'NIVEA DEO', 11100, '8999777004224'],
    ['I5', 'NDEO ROLL ON EXTRA WHITENING 50ML', 'NIVEA DEO', 19000, '8999777004163'],
    ['I6', 'NDEO SPRAY EXTRA BRIGHTENING 150ML', 'NIVEA DEO', 47500, '8999777004828'],
    ['I60', 'NDEO LOTION EXTRA BRIGHTENING 9ML', 'NIVEA DEO', 1350, '8999777018160'],
    ['I7', 'NDEO ROLL ON BLACK & WHITE FEMALE 25ML', 'NIVEA DEO', 11100, '8999777004293'],
    ['I8', 'NDEO ROLL ON BLACK & WHITE FEMALE 50ML', 'NIVEA DEO', 18500, '8999777004354'],
    ['I9', 'NDEO SPRAY BLACK & WHITE FEMALE 150ML', 'NIVEA DEO', 47500, '8999777004880'],
    ['I69', 'NDEO ROLL ON BLACK & WHITE AUTHENTIC FEMALE 50ML', 'NIVEA DEO', 18500, '8999777023645'],
    ['I70', 'NDEO SPRAY BLACK & WHITE AUTHENTIC FEMALE 150ML', 'NIVEA DEO', 47500, '8850029045191'],
    ['I10', 'NDEO ROLL ON HAPPY SHAVE 50ML', 'NIVEA DEO', 19000, '8999777007430'],
    ['I11', 'NDEO ROLL ON HAPPY SHAVE 25ML', 'NIVEA DEO', 11100, '8999777007478'],
    ['I12', 'NDEO SPRAY HAPPY SHAVE 150ML', 'NIVEA DEO', 44920, '8999777007553'],
    ['I13', 'NDEO ROLL ON PEARL & BEAUTY 25ML', 'NIVEA DEO', 11100, '8999777011000'],
    ['I14', 'NDEO ROLL ON PEARL & BEAUTY 50ML', 'NIVEA DEO', 19000, '8999777010973'],
    ['I15', 'NDEO SPRAY PEARL & BEAUTY 150ML', 'NIVEA DEO', 47500, '8999777011031'],
    ['I17', 'NDEO ROLL ON RADIANT & SMOOTH 50ML', 'NIVEA DEO', 18500, '8999777011383'],
    ['I18', 'NDEO SPRAY RADIANT & SMOOTH 150ML', 'NIVEA DEO', 41400, '8999777011406'],
    ['I19', 'NDEO ROLL ON BLACK & WHITE FEMALE FRESH 25ML', 'NIVEA DEO', 7665, '8999777006228'],
    ['I20', 'NDEO ROLL ON BLACK & WHITE FEMALE FRESH 50ML', 'NIVEA DEO', 18500, '8999777006259'],
    ['I21', 'NDEO SPRAY BLACK & WHITE FEMALE FRESH 150ML', 'NIVEA DEO', 27991, '8999777006334'],
    ['I22', 'NDEO ROLL ON SILK TOUCH 25ML', 'NIVEA DEO', 11100, '8999777009267'],
    ['I23', 'NDEO ROLL ON SILK TOUCH 50ML', 'NIVEA DEO', 19000, '8999777009281'],
    ['I24', 'NDEO ROLL ON WHITENING ANTI BACTERIAL 50ML', 'NIVEA DEO', 19350, '8999777014209'],
    ['I25', 'NDEO ROLL ON COOL KICK COOL BLUE 25ML', 'NIVEA DEO', 11100, '8999777004514'],
    ['I26', 'NDEO ROLL ON COOL KICK COOL BLUE 50ML', 'NIVEA DEO', 17300, '8999777004484'],
    ['I28', 'NDEO SPRAY COOL KICK COOL BLUE 150ML', 'NIVEA DEO', 44000, '8999777004910'],
    ['I52', 'NDEO ROLL ON COOL KICK FREEZY GREEN 50ML', 'NIVEA DEO', 17300, '8999777016784'],
    ['I58', 'NDEO LOTION COOL KICK COOL BLUE 9ML', 'NIVEA DEO', 1350, '8999777018351'],
    ['I29', 'NDEO ROLL ON BLACK & WHITE MALE 25ML', 'NIVEA DEO', 11100, '8999777004583'],
    ['I30', 'NDEO ROLL ON BLACK & WHITE MALE 50ML', 'NIVEA DEO', 17300, '8999777004552'],
    ['I32', 'NDEO SPRAY BLACK & WHITE MALE 150ML', 'NIVEA DEO', 44000, '4005808073870'],
    ['I71', 'NDEO ROLL ON BLACK & WHITE EPIC NIGHT MALE 50ML', 'NIVEA DEO', 17300, '8999777023669'],
    ['I72', 'NDEO SPRAY BLACK & WHITE EPIC NIGHT MALE 150ML', 'NIVEA DEO', 44000, '8850029045214'],
    ['I33', 'NDEO ROLL ON SILVER PROTECT 25ML', 'NIVEA DEO', 9850, '8999777004644'],
    ['I34', 'NDEO ROLL ON SILVER PROTECT 50ML', 'NIVEA DEO', 17300, '8999777004613'],
    ['I57', 'NDEO SPRAY SILVER PROTECT 150ML', 'NIVEA DEO', 27991, '8999777004941'],
    ['I36', 'NDEO ROLL ON FRESH ACTIVE 50ML', 'NIVEA DEO', 17300, '8999777007355'],
    ['I39', 'NDEO ROLL ON BLACK & WHITE MALE FRESH 50ML', 'NIVEA DEO', 17300, '8999777010881'],
    ['I40', 'NDEO SPRAY BLACK & WHITE MALE FRESH 150ML', 'NIVEA DEO', 44000, '4005900371713'],
    ['I41', 'NDEO ROLL ON DEEP 25ML', 'NIVEA DEO', 11100, '8999777010591'],
    ['I42', 'NDEO ROLL ON DEEP 50ML', 'NIVEA DEO', 17300, '8999777010638'],
    ['I43', 'NDEO ROLL ON DEEP ESPRESSO 50ML', 'NIVEA DEO', 17300, '8999777014315'],
    ['I45', 'NDEO SPRAY DEEP 150ML', 'NIVEA DEO', 44000, '8850029025315'],
    ['I47', 'NDEO ROLL ON DRY IMPACT 50ML', 'NIVEA DEO', 17300, '8999777007270'],
    ['I48', 'NDEO ROLL ON WHITENING HIJAB FRESH 25ML', 'NIVEA DEO', 11100, '42397625'],
    ['I49', 'NDEO ROLL ON WHITENING HIJAB FRESH 50ML', 'NIVEA DEO', 19350, '8999777015893'],
    ['I50', 'NDEO SPRAY BRIGHTENING HIJAB FRESH 150ML', 'NIVEA DEO', 47500, '8999777015923'],
    ['I59', 'NDEO LOTION BRIGHTENING HIJAB FRESH 9ML', 'NIVEA DEO', 1350, '8999777018191'],
    ['I53', 'NDEO ROLL ON BRIGHTENING HIJAB SOFT 50ML', 'NIVEA DEO', 19350, '8999777017620'],
    ['I54', 'NDEO ROLL ON BRIGHTENING HIJAB COOL 50ML', 'NIVEA DEO', 19350, '8999777017873'],
    ['I61', 'NDEO SPRAY EXTRA BRIGHT VELVET ROMANCE 150ML', 'NIVEA DEO', 53400, '8850029040196'],
    ['I62', 'NDEO SPRAY EXTRA BRIGHT FRESH LAVIER 150ML', 'NIVEA DEO', 53400, '8850029040172'],
    ['I63', 'NDEO SPRAY EXTRA BRIGHT MIRACLE SWEET 150ML', 'NIVEA DEO', 53400, '8850029040189'],
    ['I64', 'NDEO DERMA CONTROL DEFEND ANTI-PERSPIRANT MALE 50ML', 'NIVEA DEO', 18000, '8999777003159'],
    ['I65', 'NDEO DERMA CONTROL DEFEND ANTI-PERSPIRANT FEMALE 50ML', 'NIVEA DEO', 19350, '8999777002749'],
    ['I66', 'NDEO SPRAY DERMA CONTROL DEFEND ANTI-PERSPIRANT MALE 150ML', 'NIVEA DEO', 46500, '8999777003395'],
    ['I67', 'NDEO DERMA CONTROL BRIGHT REPAIR ANTI-PERSPIRANT 50ML', 'NIVEA DEO', 19350, '8999777002763'],
    ['I68', 'NDEO DERMA CONTROL RESTORE ANTI-PERSPIRANT 50ML', 'NIVEA DEO', 19350, '8999777002787'],
  ].map(([sku, name, brand, price, barcode]) => ({ id: 'p-' + sku.toLowerCase(), sku, name, brand, price, barcode }));

  // The NMA stores (id, name, chain, city); city left empty where the client's list doesn't say
  const STORES = [
    ['st1', 'Yogya Cimanggu', 'Yogya', 'Bogor'],
    ['st2', 'LSI Pajajaran', 'LSI', 'Bogor'],
    ['st3', 'AEON Sentul City', 'AEON', ''],
    ['st4', 'Yogya Sukabumi', 'Yogya', 'Sukabumi'],
    ['st5', 'Indogrosir Sukabumi', 'Indogrosir', 'Sukabumi'],
    ['st6', 'Yogya Junction Bogor', 'Yogya', 'Bogor'],
    ['st7', 'Toko Ailin', '', ''],
    ['st8', 'AEON Mall Kota Wisata', 'AEON', ''],
    ['st9', 'Indogrosir Ciputat', 'Indogrosir', ''],
    ['st10', 'LSI Metland', 'LSI', ''],
    ['st11', 'Indogrosir Cibinong', 'Indogrosir', ''],
    ['st12', 'LSI Cikaret', 'LSI', ''],
    ['st13', 'Beauty Lovers', '', ''],
    ['st14', 'Yogya Cianjur', 'Yogya', 'Cianjur'],
    ['st15', 'Guardian Citimall', 'Guardian', ''],
    ['st16', 'Yogya Ciranjang', 'Yogya', ''],
  ].map(([id, name, chain, city]) => ({ id, name, chain, city, address: '' }));

  const defaultSettings = () => ({
    workingDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
    holidays: [
      { date: '2026-12-25', name: 'Hari Raya Natal', working: true },
      { date: '2027-01-01', name: 'Tahun Baru 2027', working: false },
    ],
    editDays: 2,
    reminder: '20:00',
  });

  // Starting data: the Admin account, one area, the product catalog and the stores.
  // Supervisors, Team Leaders, teams and SPGs are added in the app.
  function seed() {
    const stamp = { createdBy: 'u-admin', updatedBy: 'u-admin', updatedAt: '2026-10-16' };
    state = {
      version: 8,
      products: PRODUCTS.map(p => ({ ...p, active: true, image: 'assets/products/placeholder.svg', ...stamp })),
      stores: STORES.map(st => ({ ...st, areaId: 'a1', active: true, ...stamp })),
      activity: [],
      areas: [{ id: 'a1', name: 'Bogor' }],
      teams: [],
      users: [{ id: 'u-admin', username: 'admin', password: 'admin123', name: 'Admin', role: 'admin', phone: '081100000001', photo: 'assets/avatars/admin.svg', active: true }],
      storeTargets: {}, reports: {}, settings: {}, shifts: {},
    };
    memo = {};
    return state;
  }

  // Store the shift was at, at a given time (last visit that started at or before it)
  function visitAt(shift, time) {
    let id = shift.storeId;
    (shift.visits || []).forEach(v => { if (!time || v.from <= time) id = v.storeId; });
    return id;
  }

  function buildReport(userId, date, items, noSales, notes, by, prev) {
    const clean = noSales ? [] : items.filter(i => i.qty > 0).map(i => ({ productId: i.productId, qty: +i.qty, price: +i.price }));
    return {
      userId, date, items: clean, noSales: !!noSales, notes: notes || '',
      total: clean.reduce((a, i) => a + i.qty * i.price, 0),
      createdAt: prev ? prev.createdAt : date, updatedAt: TODAY, updatedBy: by,
      unlocked: prev ? !!prev.unlocked : false,
    };
  }

  // Ids made on the phone. Live: a UUID, which the server uses to ignore a sale sent twice.
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }

  /* ---------- Storage ---------- */
  let state = null;
  let memo = {};

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable: keep in memory */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  // Demo: all data in localStorage. Live: the page's copy of the server data (cache for the next page)
  function persist() { if (LIVE) saveCache(state); else lsSet(STORE_KEY, JSON.stringify(state)); }


  /* ---------- Session (hardcoded accounts) ---------- */
  // Phone numbers in any common format (0812…, 62812…, +62 812-…) compare as 0812…
  function normalizePhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('62')) d = '0' + d.slice(2);
    else if (d.startsWith('8')) d = '0' + d;
    return d;
  }
  function login(phone, password) {
    const n = normalizePhone(phone);
    const u = n && state.users.find(x => normalizePhone(x.phone) === n && x.password === password && x.active);
    if (!u) return null;
    lsSet(USER_KEY, u.id);
    return u;
  }
  function logout() { lsDel(USER_KEY); }
  function currentUser() { const id = lsGet(USER_KEY); return id ? user(id) || null : null; }

  /* ---------- Lookups ---------- */
  const user = id => state.users.find(u => u.id === id);
  const team = id => state.teams.find(t => t.id === id);
  const teams = () => state.teams.slice();
  const allUsers = () => state.users.slice();
  // photo: a data URL (uploaded) or a path relative to the site root
  function setUserPhoto(userId, photo) { const u = user(userId); if (u) { u.photo = photo; persist(); } }
  const area = id => state.areas.find(a => a.id === id);
  const spgsOf = (teamId, includeInactive) => state.users.filter(u => u.role === 'spg' && u.teamId === teamId && (includeInactive || u.active));
  const products = includeInactive => state.products.filter(p => includeInactive || p.active);
  const product = id => state.products.find(p => p.id === id);

  function canView(viewer, owner) {
    if (!viewer || !owner) return false;
    if (viewer.role === 'spg') return viewer.id === owner.id;
    if (viewer.role === 'leader') return owner.teamId === viewer.teamId;
    return viewer.role === 'supervisor';
  }

  /* ---------- Working days ---------- */
  function isWorkingDay(teamId, d) {
    const st = state.settings[teamId];
    const h = st.holidays.find(x => x.date === d);
    if (h) return !!h.working;
    return st.workingDays.includes(dow(d));
  }
  const workingDays = (teamId, from, to) => eachDay(from, to).filter(d => isWorkingDay(teamId, d));
  function workingDaysInMonth(teamId, mk) {
    const key = teamId + '|' + mk;
    if (!(key in memo)) memo[key] = workingDays(teamId, mk + '-01', monthEnd(mk + '-01')).length;
    return memo[key];
  }

  /* Each SPG may have their own schedule (days of the week + hours, set by the Team Leader in Tim);
     without one they follow the team's working days. Team holidays apply to everyone. */
  const spgDays = u => (u && u.workDays && u.workDays.length ? u.workDays : state.settings[u.teamId].workingDays);
  function isWorkingDayFor(userId, d) {
    const u = user(userId);
    const h = state.settings[u.teamId].holidays.find(x => x.date === d);
    if (h) return !!h.working;
    return spgDays(u).includes(dow(d));
  }
  const workingDaysFor = (userId, from, to) => eachDay(from, to).filter(d => isWorkingDayFor(userId, d));
  function workingDaysInMonthFor(userId, mk) {
    const key = 'u|' + userId + '|' + mk;
    if (!(key in memo)) memo[key] = workingDaysFor(userId, mk + '-01', monthEnd(mk + '-01')).length;
    return memo[key];
  }
  // "Sen–Sab · 10:00–19:00", or the team's days when the SPG has no schedule of their own
  const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  function scheduleLabel(userId) {
    const u = user(userId), days = spgDays(u).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    // Consecutive days (Mon first) shown as a range
    const idx = days.map(d => (d + 6) % 7), runs = [];
    idx.forEach(i => { const r = runs[runs.length - 1]; if (r && r[1] === i - 1) r[1] = i; else runs.push([i, i]); });
    const name = i => DAY_SHORT[(i + 1) % 7];
    const text = runs.map(([a, b]) => (a === b ? name(a) : b === a + 1 ? name(a) + ', ' + name(b) : name(a) + '–' + name(b))).join(', ');
    return text + (u.workStart && u.workEnd ? ` · ${u.workStart}–${u.workEnd}` : '');
  }
  const hasOwnSchedule = userId => { const u = user(userId); return !!(u && u.workDays && u.workDays.length); };
  function setSchedule(userId, sch) {
    const u = user(userId);
    if (!u) return;
    if (sch.useTeam) Object.assign(u, { workDays: null, workStart: '', workEnd: '' });
    else Object.assign(u, { workDays: sch.days.slice(), workStart: sch.start || '', workEnd: sch.end || '' });
    memo = {};
    persist();
  }

  /* ---------- Targets: set per store and month; the SPG holding a store that month gets its target ---------- */
  // state.storeTargets["storeId|month"] = { userId, monthly, weekly, daily, setBy, setAt }; live mode may also send
  // { taken: true } for a store held by an SPG of another team.
  const storeTarget = (storeId, mk) => (state.storeTargets || {})[storeId + '|' + mk] || null;
  // Stores an SPG holds in a month, with their targets
  function heldStores(userId, mk) {
    const key = 'held|' + mk;
    if (!memo[key]) {
      const map = {};
      Object.keys(state.storeTargets || {}).forEach(k => {
        const [storeId, m] = k.split('|'), t = state.storeTargets[k];
        if (m === mk && t.userId) (map[t.userId] = map[t.userId] || []).push({ storeId, ...t });
      });
      memo[key] = map;
    }
    return memo[key][userId] || [];
  }
  // An SPG's month target: the sum of the stores they hold (null when they hold none)
  function targetRow(userId, mk) {
    const list = heldStores(userId, mk);
    return list.length ? { monthly: list.reduce((a, t) => a + (t.monthly || 0), 0), stores: list } : null;
  }
  // One store's share of a day: its daily override, or its monthly target spread over the SPG's working days
  function storeDay(t, userId, date) {
    if (!isWorkingDayFor(userId, date)) return 0;
    if (t.daily) return t.daily;
    const wd = workingDaysInMonthFor(userId, monthKey(date));
    return wd ? (t.monthly || 0) / wd : 0;
  }
  function dailyTarget(userId, date) {
    return heldStores(userId, monthKey(date)).reduce((a, t) => a + storeDay(t, userId, date), 0);
  }
  // Stores with a weekly override count it; the others add up their days of the week
  function weekTarget(userId, date) {
    const fixed = heldStores(userId, monthKey(date)).filter(t => t.weekly);
    const skip = fixed.map(t => t.storeId);
    return fixed.reduce((a, t) => a + t.weekly, 0) + eachDay(weekStart(date), weekEnd(date)).reduce((a, d) =>
      a + heldStores(userId, monthKey(d)).filter(t => !skip.includes(t.storeId)).reduce((b, t) => b + storeDay(t, userId, d), 0), 0);
  }
  function periodTarget(userId, period, date) {
    if (period === 'day') return dailyTarget(userId, date);
    if (period === 'week') return weekTarget(userId, date);
    const t = targetRow(userId, monthKey(date));
    return t ? t.monthly : 0;
  }
  // A store's target for one day (0 when no SPG holds it that month, or with userIds: none of them)
  function storeDailyTarget(storeId, date, userIds) {
    const t = storeTarget(storeId, monthKey(date)), u = t && t.userId && user(t.userId);
    return u && (!userIds || userIds.includes(u.id)) ? storeDay(t, u.id, date) : 0;
  }
  // Preview of derived targets for the target page (with userId: that SPG's schedule, else the team's days)
  function targetPreview(teamId, mk, monthly, userId) {
    const u = userId && user(userId);
    const wd = u ? workingDaysInMonthFor(u.id, mk) : workingDaysInMonth(teamId, mk);
    const daily = wd ? monthly / wd : 0;
    return { workDays: wd, daily, weekly: daily * (u ? spgDays(u) : state.settings[teamId].workingDays).length };
  }
  // rows: { storeId, mk, userId (null = no SPG), monthly, weekly, daily }
  function saveTargets(rows, by) {
    if (!state.storeTargets) state.storeTargets = {};
    rows.forEach(r => {
      if (!r.storeId) return; // per-SPG targets of the old version, left in an offline queue
      const key = r.storeId + '|' + r.mk;
      if (!r.userId) state.storeTargets[key] = { userId: null, released: true }; // released: free, also for the months after
      else state.storeTargets[key] = { userId: r.userId, monthly: r.monthly || 0, weekly: r.weekly || null, daily: r.daily || null, setBy: by, setAt: TODAY };
    });
    memo = {};
    persist();
  }

  /* ---------- Reports ---------- */
  const getReport = (userId, date) => state.reports[userId + '|' + date] || null;

  /* ---------- Shifts & per-sale transactions ---------- */
  const nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const getShift = (userId, date) => (state.shifts || {})[userId + '|' + date] || null;
  function startShift(userId, storeId, time) {
    state.shifts = state.shifts || {};
    const key = userId + '|' + TODAY;
    if (!state.shifts[key]) {
      const t = time || nowTime();
      state.shifts[key] = { start: t, end: null, storeId, visits: [{ storeId, from: t }] };
      delete memo.lastStore;
    }
    persist();
    return state.shifts[key];
  }
  // Move the open shift to another store; new sales get that store
  function switchStore(userId, storeId, time) {
    const sh = getShift(userId, TODAY);
    if (!sh || sh.end || sh.storeId === storeId) return sh;
    sh.storeId = storeId;
    (sh.visits = sh.visits || []).push({ storeId, from: time || nowTime() });
    delete memo.lastStore;
    persist();
    return sh;
  }
  // Store of a user's most recent shift (or their usual store)
  function lastStoreId(userId) {
    if (!memo.lastStore) {
      const m = {};
      Object.keys(state.shifts || {}).sort().forEach(k => { const [uid] = k.split('|'); const sh = state.shifts[k]; if (sh.storeId) m[uid] = sh.storeId; });
      memo.lastStore = m;
    }
    const u = user(userId);
    return memo.lastStore[userId] || (u && u.homeStoreId) || null;
  }
  // The stores an SPG holds this month ("toko target"); without any, the store they last worked at
  const storeLabel = u => {
    if (!u) return '';
    const held = heldStores(u.id, monthKey(TODAY)).map(t => (store(t.storeId) || {}).name).filter(Boolean);
    if (held.length) return held.join(', ');
    const st = store(lastStoreId(u.id));
    return st ? 'terakhir di ' + st.name : '';
  };
  // Store for a sale on a given date/time
  function storeFor(userId, date, time) {
    const sh = getShift(userId, date);
    return sh ? visitAt(sh, time) : lastStoreId(userId);
  }
  // photos: pictures of the SPG's handwritten sales notes, required when ending a shift
  function endShift(userId, by, photos, time) {
    const sh = getShift(userId, TODAY);
    if (!sh || sh.end) return sh;
    sh.end = time || nowTime();
    sh.photos = (photos || []).slice();
    // A shift with no sales still counts as a report: "no sales"
    if (!getReport(userId, TODAY)) state.reports[userId + '|' + TODAY] = { ...emptyReport(userId, TODAY, by), noSales: true };
    persist();
    return sh;
  }
  // Transactions of a report; older/other-team reports only have daily totals per product (no time)
  const getTransactions = r => !r ? [] : r.transactions || r.items.map((i, n) => ({ id: 'i' + n, time: '', storeId: storeFor(r.userId, r.date, ''), ...i }));

  function emptyReport(userId, date, by) {
    return { userId, date, transactions: [], items: [], total: 0, noSales: false, notes: '', createdAt: TODAY, updatedAt: TODAY, updatedBy: by, unlocked: false };
  }
  function rebuild(r) {
    const map = {};
    r.transactions.forEach(t => {
      const k = t.productId + '|' + t.price;
      (map[k] = map[k] || { productId: t.productId, qty: 0, price: t.price }).qty += t.qty;
    });
    r.items = Object.values(map);
    r.total = r.transactions.reduce((a, t) => a + t.qty * t.price, 0);
  }
  function addSale(userId, date, sale, by) {
    const key = userId + '|' + date;
    let r = state.reports[key];
    if (!r) r = state.reports[key] = emptyReport(userId, date, by);
    if (!r.transactions) r.transactions = getTransactions(r);
    const time = sale.time != null ? sale.time : date === TODAY ? nowTime() : ''; // '' = added afterwards for a past day
    const tx = {
      id: sale.id || newId(),
      time,
      storeId: sale.storeId || storeFor(userId, date, time),
      productId: sale.productId, qty: Math.max(1, Math.floor(+sale.qty || 1)), price: Math.max(0, Math.round(+sale.price || 0)), by,
    };
    r.transactions.push(tx);
    r.noSales = false;
    r.updatedAt = TODAY; r.updatedBy = by;
    rebuild(r);
    persist();
    return tx;
  }
  function removeSale(userId, date, txId, by) {
    const key = userId + '|' + date;
    const r = state.reports[key];
    if (!r) return;
    r.transactions = getTransactions(r).filter(t => t.id !== txId);
    r.updatedAt = TODAY; r.updatedBy = by;
    rebuild(r);
    const sh = getShift(userId, date);
    if (!r.transactions.length) {
      if (sh && sh.end) r.noSales = true; else delete state.reports[key];
    }
    persist();
  }

  function saveReport(r, by) {
    const prev = getReport(r.userId, r.date);
    state.reports[r.userId + '|' + r.date] = buildReport(r.userId, r.date, r.items, r.noSales, r.notes, by, prev);
    persist();
  }
  function setUnlocked(userId, date, value) {
    const r = getReport(userId, date);
    if (!r) return;
    r.unlocked = !!value;
    persist();
  }
  // Locked for the SPG: older than the team's edit window and not unlocked by a leader
  function isLocked(userId, date) {
    const u = user(userId);
    const r = getReport(userId, date);
    if (r && r.unlocked) return false;
    return date < addDays(TODAY, -state.settings[u.teamId].editDays);
  }
  function canEdit(viewer, ownerId, date) {
    const owner = user(ownerId);
    if (date > TODAY || !canView(viewer, owner)) return false;
    if (viewer.role === 'spg') return !isLocked(ownerId, date);
    return true;
  }
  function listReports({ userIds, from, to }) {
    const out = [];
    userIds.forEach(id => eachDay(from, to).forEach(d => { const r = getReport(id, d); if (r) out.push(r); }));
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : user(a.userId).name.localeCompare(user(b.userId).name)));
  }

  /* ---------- Progress, levels, ranking ---------- */
  const actualSum = (userId, from, to) => eachDay(from, to).reduce((a, d) => { const r = getReport(userId, d); return a + (r ? r.total : 0); }, 0);

  function progress(userId, period, date) {
    date = date || TODAY;
    const [from, to] = range(period, date);
    const actual = actualSum(userId, from, date < to ? date : to);
    const target = periodTarget(userId, period, date);
    const pct = target > 0 ? actual / target * 100 : 0;
    const remaining = Math.max(0, target - actual);
    let restDays = workingDaysFor(userId, addDays(date, 1), to).length;
    if (!getReport(userId, date) && isWorkingDayFor(userId, date)) restDays += 1;
    return { period, from, to, actual, target, pct, remaining, restDays, perDay: restDays ? remaining / restDays : remaining };
  }

  const LEVELS = [
    // color = ring/progress color, iconColor = medal color
    { min: 120, name: 'Berlian', label: 'Level Berlian', icon: 'gem', color: '#1E8E5A', iconColor: '#1E8E5A' },
    { min: 100, name: 'Emas', label: 'Level Emas', icon: 'award', color: '#C9A227', iconColor: '#B8901A' },
    { min: 80, name: 'Perak', label: 'Level Perak', icon: 'award', color: '#00136F', iconColor: '#7A8699' },
    { min: 50, name: 'Perunggu', label: 'Level Perunggu', icon: 'award', color: '#B26B00', iconColor: '#A0612A' },
    { min: 0, name: 'Pemula', label: 'Level Pemula', icon: 'target', color: '#C8323C', iconColor: '#C8323C' },
  ];
  const level = pct => LEVELS.find(l => pct >= l.min);
  const nextLevel = pct => LEVELS.slice().reverse().find(l => l.min > pct) || null;

  // withInactive: also deactivated SPGs who sold or held a store in the period (their sales still count for the team)
  function leaderboard(teamId, period, date, withInactive) {
    date = date || TODAY;
    return spgsOf(teamId, !!withInactive)
      .map(u => { const p = progress(u.id, period, date); return { user: u, ...p, level: level(p.pct) }; })
      .filter(r => r.user.active || r.actual > 0 || r.target > 0)
      .sort((a, b) => b.pct - a.pct || b.actual - a.actual)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // Working days in a row with sales >= daily target. Today only counts once it's reached.
  function streak(userId, date) {
    date = date || TODAY;
    let d = date;
    const r0 = getReport(userId, d);
    if (!(r0 && dailyTarget(userId, d) > 0 && r0.total >= dailyTarget(userId, d))) d = addDays(d, -1);
    let n = 0;
    for (; d >= DATA_START; d = addDays(d, -1)) {
      if (!isWorkingDayFor(userId, d)) continue;
      const r = getReport(userId, d), t = dailyTarget(userId, d);
      if (!r || !t || r.total < t) break;
      n++;
    }
    return n;
  }

  function productTotals(userIds, from, to) {
    const map = {};
    listReports({ userIds, from, to }).forEach(r => r.items.forEach(i => {
      const m = map[i.productId] || (map[i.productId] = { product: product(i.productId), qty: 0, amount: 0 });
      m.qty += i.qty; m.amount += i.qty * i.price;
    }));
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }

  // Daily totals for a group of SPGs: one point per working day (actual sales vs. summed daily target)
  // With storeId: only sales made at that store, against that store's target
  function dailySeries(userIds, teamIds, from, to, storeId) {
    const amount = r => !r ? 0 : !storeId ? r.total
      : getTransactions(r).filter(t => t.storeId === storeId).reduce((a, t) => a + t.qty * t.price, 0);
    return eachDay(from, to)
      .filter(d => (userIds.length ? userIds.some(id => isWorkingDayFor(id, d)) : teamIds.some(t => isWorkingDay(t, d))))
      .map(d => ({
        date: d,
        actual: userIds.reduce((a, id) => a + amount(getReport(id, d)), 0),
        target: storeId ? storeDailyTarget(storeId, d, userIds) : userIds.reduce((a, id) => a + dailyTarget(id, d), 0),
      }));
  }
  // Chart window per period: last 14 days for "today", otherwise the period itself (up to today)
  function chartRange(period, date) {
    if (period === 'day') return [addDays(date, -13), date];
    const [from, to] = range(period, date);
    return [from, to < date ? to : date];
  }

  function teamSummary(teamId, period, date) {
    date = date || TODAY;
    const lb = leaderboard(teamId, period, date, true);
    const [from, to] = range(period, date);
    const actual = lb.reduce((a, r) => a + r.actual, 0);
    const target = lb.reduce((a, r) => a + r.target, 0);
    let expected = null;
    if (period !== 'day') {
      const all = workingDays(teamId, from, to).length;
      expected = all ? workingDays(teamId, from, date).length / all * 100 : null;
    }
    // Today: only SPGs whose own schedule has today as a working day are expected to start a shift
    const due = lb.filter(r => r.user.active && isWorkingDayFor(r.user.id, date));
    const working = due.length > 0;
    const missing = due.filter(r => !getShift(r.user.id, date) && !getReport(r.user.id, date)).map(r => r.user);
    return {
      team: team(teamId), lb, from, to, actual, target, pct: target ? actual / target * 100 : 0, expected, working,
      missing, reported: due.length - missing.length, due: due.length, size: lb.length,
      products: productTotals(lb.map(r => r.user.id), from, date < to ? date : to),
    };
  }

  function areaSummary(areaId, period, date) {
    const list = state.teams.filter(t => t.areaId === areaId).map(t => teamSummary(t.id, period, date));
    const actual = list.reduce((a, t) => a + t.actual, 0);
    const target = list.reduce((a, t) => a + t.target, 0);
    const topSpgs = list.flatMap(t => t.lb).sort((a, b) => b.pct - a.pct || b.actual - a.actual);
    return {
      area: area(areaId), teams: list.sort((a, b) => b.pct - a.pct), actual, target,
      pct: target ? actual / target * 100 : 0, expected: list[0] ? list[0].expected : null,
      reported: list.reduce((a, t) => a + t.reported, 0), due: list.reduce((a, t) => a + t.due, 0), size: list.reduce((a, t) => a + t.size, 0), topSpgs,
    };
  }

  /* ---------- Team, settings, products ---------- */
  /* ---------- People, products, stores (with permissions + activity log) ---------- */
  const DEFAULT_PW = { spg: 'spg123', leader: 'leader123', supervisor: 'super123', admin: 'admin123' };
  function log(by, action, kind, id, name) {
    (state.activity = state.activity || []).unshift({ at: TODAY + ' ' + nowTime(), by, action, kind, id, name });
    state.activity.length = Math.min(state.activity.length, 500);
  }
  // Who may manage which accounts: Admin → Supervisors & Team Leaders; Leader → own team's SPGs; Supervisor → SPGs in area
  function canManageUser(viewer, target) {
    if (!viewer || !target) return false;
    if (viewer.role === 'admin') return target.role === 'leader' || target.role === 'supervisor';
    if (target.role !== 'spg') return false;
    if (viewer.role === 'leader') return target.teamId === viewer.teamId;
    if (viewer.role === 'supervisor') { const t = team(target.teamId); return !!t && t.areaId === viewer.areaId; }
    return false;
  }
  function addUser(data, by) {
    const viewer = user(by);
    const role = data.role;
    const phone = normalizePhone(data.phone);
    const name = String(data.name || '').trim();
    if (!name || !phone) return 'Nama dan nomor HP wajib diisi.';
    if (!/^08\d{8,11}$/.test(phone)) return 'Nomor HP tidak valid (contoh: 0812 3456 7890).';
    if (state.users.some(u => normalizePhone(u.phone) === phone)) return 'Nomor HP sudah terdaftar.';
    const u = { id: 'u' + Date.now().toString(36), username: '', password: DEFAULT_PW[role], name, role, phone, active: true, photo: '', since: TODAY };
    if (role === 'spg') {
      const t = team(data.teamId);
      if (!t) return 'Pilih tim.';
      u.teamId = t.id;
    } else if (role === 'leader') {
      if (data.newTeam) {
        const tid = 't' + Date.now().toString(36);
        state.teams.push({ id: tid, name: String(data.newTeam).trim(), areaId: data.areaId || 'a1', leaderId: u.id });
        state.settings[tid] = defaultSettings();
        u.teamId = tid;
      } else {
        const t = team(data.teamId);
        if (!t) return 'Pilih tim atau buat tim baru.';
        u.teamId = t.id;
        if (!t.leaderId || !(user(t.leaderId) || {}).active) t.leaderId = u.id;
      }
    } else if (role === 'supervisor') {
      u.areaId = data.areaId || 'a1';
    } else return 'Peran tidak dikenal.';
    if (!canManageUser(viewer, u)) return 'Kamu tidak punya akses untuk menambah pengguna ini.';
    state.users.push(u);
    log(by, 'tambah', 'pengguna', u.id, u.name);
    persist();
    return null;
  }
  const addSpg = (data, by) => addUser({ ...data, role: 'spg' }, by);
  // Fix a typo in a name or phone number (the phone number is the login)
  function updateUser(userId, data, by) {
    const u = user(userId);
    if (!u || !canManageUser(user(by), u)) return 'Kamu tidak punya akses.';
    const name = String(data.name || '').trim(), phone = normalizePhone(data.phone);
    if (!name || !phone) return 'Nama dan nomor HP wajib diisi.';
    if (!/^08\d{8,11}$/.test(phone)) return 'Nomor HP tidak valid (contoh: 0812 3456 7890).';
    if (state.users.some(x => x.id !== u.id && normalizePhone(x.phone) === phone)) return 'Nomor HP sudah terdaftar.';
    Object.assign(u, { name, phone });
    log(by, 'ubah', 'pengguna', u.id, u.name);
    persist();
    return null;
  }
  function resetPassword(userId, by) {
    const u = user(userId);
    if (!u || !canManageUser(user(by), u)) return null;
    u.password = DEFAULT_PW[u.role];
    log(by, 'reset password', 'pengguna', u.id, u.name);
    persist();
    return u.password;
  }

  // Products and stores are shared lists. Add: Admin, Supervisor, Team Leader.
  // Edit/deactivate: the same roles, any item.
  const canAddCatalog = viewer => !!viewer && ['admin', 'supervisor', 'leader'].includes(viewer.role);
  const canEditCatalog = (viewer, item) => !!item && canAddCatalog(viewer);
  function saveCatalogItem(list, kind, prefix, item, by) {
    const viewer = user(by);
    if (item.id) {
      const cur = list.find(x => x.id === item.id);
      if (!canEditCatalog(viewer, cur)) return 'Kamu tidak punya akses untuk mengubah ' + kind + '.';
      Object.assign(cur, item, { updatedBy: by, updatedAt: TODAY });
      log(by, 'ubah', kind, cur.id, cur.name);
    } else {
      if (!canAddCatalog(viewer)) return 'Kamu tidak punya akses untuk menambah ' + kind + '.';
      const created = { ...item, id: prefix + Date.now().toString(36), createdBy: by, updatedBy: by, updatedAt: TODAY };
      list.push(created);
      log(by, 'tambah', kind, created.id, created.name);
    }
    persist();
    return null;
  }
  const saveProduct = (p, by) => saveCatalogItem(state.products, 'produk', 'p', p, by);
  const saveStore = (st, by) => saveCatalogItem(state.stores, 'toko', 'st', st, by);
  const stores = includeInactive => (state.stores || []).filter(x => includeInactive || x.active);
  const store = id => (state.stores || []).find(x => x.id === id);
  const activity = () => (state.activity || []).slice();

  // Sales per store for a group of SPGs (for dashboards)
  function storeTotals(userIds, from, to) {
    const map = {};
    listReports({ userIds, from, to }).forEach(r => getTransactions(r).forEach(t => {
      const m = map[t.storeId] || (map[t.storeId] = { store: store(t.storeId), amount: 0, tx: 0, spgs: new Set() });
      m.amount += t.qty * t.price; m.tx++; m.spgs.add(r.userId);
    }));
    return Object.values(map).filter(m => m.store).map(m => ({ ...m, spgs: m.spgs.size })).sort((a, b) => b.amount - a.amount);
  }

  function setActive(userId, value) { const u = user(userId); if (u) { u.active = !!value; persist(); } }
  const getSettings = teamId => JSON.parse(JSON.stringify(state.settings[teamId]));
  function saveSettings(teamId, s) { state.settings[teamId] = s; memo = {}; persist(); }

  /* ---------- Live backend (Google Sheets + Apps Script, see apps-script/) ---------- */
  const CACHE_KEY = 'lspg-live-cache';   // last data from the server: pages open at once, also offline
  const OUTBOX_KEY = 'lspg-outbox';      // writes not yet confirmed by the server
  const TOKEN_KEY = 'lspg-token';        // login token (localStorage with "Ingat saya", else this tab only)
  const CACHE_FRESH_MS = 5 * 60 * 1000;  // younger cache: show it at once and refresh in the background
  let lastError = '';
  let writes = 0;                        // local writes since the page opened (see refreshCache)
  const emptyState = () => ({ me: null, areas: [], teams: [], users: [], products: [], stores: [], storeTargets: {}, reports: {}, settings: {}, shifts: {}, activity: [] });
  const notify = msg => { if (window.App && App.toast) App.toast(msg); };
  const siteRoot = () => (document.body && document.body.dataset.root) || '';
  // Page addresses as written in the pages ('spg/laporan.html'); a server with clean URLs can set cleanUrls
  const page = p => (CONFIG.cleanUrls ? p.replace(/(^|\/)index\.html/, '$1').replace(/\.html(?=$|[?#])/, '') : p);

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  const remembered = () => { try { return !!localStorage.getItem(TOKEN_KEY); } catch (e) { return false; } };
  function setToken(token, remember) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch (e) { /* storage blocked */ }
  }

  /**
   * One call to the Apps Script web app; resolves { ok, status, data }. status 0 = no connection.
   * text/plain avoids the CORS preflight Apps Script can't answer; the real status is in the reply body.
   */
  async function call(action, params) {
    let res;
    try {
      res = await fetch(CONFIG.url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action, token: getToken() }, params || {})),
      });
    } catch (e) {
      return { ok: false, status: 0, data: { message: 'Tidak ada koneksi internet.' } };
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* Google error page instead of JSON */ }
    if (!body) return { ok: false, status: 502, data: { message: 'Server sedang bermasalah, coba lagi.' } };
    return body.ok ? { ok: true, status: 200, data: body.data } : { ok: false, status: body.status || 500, data: { message: body.error } };
  }

  function saveCache(s) {
    lsSet(CACHE_KEY, JSON.stringify(Object.assign({}, s, { _at: s._at || Date.now() })));
  }
  function readCache() {
    try { return JSON.parse(lsGet(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }
  // Fresh data for the next page; skipped if this page wrote something meanwhile (the reply could predate it)
  function refreshCache() {
    const before = writes;
    return call('bootstrap').then(res => {
      if (res.ok && writes === before) saveCache(Object.assign(res.data, { _at: Date.now() }));
      if (res.status === 401) signedOut();
      return res;
    });
  }
  function signedOut() {
    setToken('');
    lsDel(CACHE_KEY);
    location.href = siteRoot() + page('index.html');
  }

  /* Outbox: queued writes are already applied to the page; they are sent in order, retried when offline. */
  const outbox = () => { try { return JSON.parse(lsGet(OUTBOX_KEY) || '[]'); } catch (e) { return []; } };
  const saveOutbox = list => lsSet(OUTBOX_KEY, JSON.stringify(list));
  function enqueue(op, args, action, params) {
    writes++;
    const list = outbox();
    list.push({ id: newId(), me: state.me, op, args, action, params });
    saveOutbox(list);
    flush();
  }
  let flushing = null, retryTimer = null, retryDelay = 2000;
  function flush() {
    if (!flushing) flushing = sendQueued().finally(() => { flushing = null; });
    return flushing;
  }
  async function sendQueued() {
    for (;;) {
      const item = outbox()[0];
      if (!item) { retryDelay = 2000; return; }
      // Left on this phone by someone else who has logged out since: never send it as the current user
      if (item.me !== state.me) { saveOutbox(outbox().filter(x => x.id !== item.id)); continue; }
      const res = await call(item.action, item.params);
      if (res.status === 0 || res.status >= 500 || res.status === 429) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(flush, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
        return;
      }
      if (res.status === 401) { signedOut(); return; } // kept until they log in again
      saveOutbox(outbox().filter(x => x.id !== item.id));
      if (!res.ok) {
        // Refused (e.g. invalid qty): the page already shows the change, so take the server's data again and reload
        notify('Tidak tersimpan: ' + res.data.message);
        const fresh = await call('bootstrap');
        if (fresh.ok) { saveCache(Object.assign(fresh.data, { _at: Date.now() })); setTimeout(() => location.reload(), 1800); }
        return;
      }
    }
  }
  if (LIVE) window.addEventListener('online', () => flush());

  // Re-applies queued writes on top of server data (they may not have reached the server yet)
  const REPLAY = {
    startShift: (u, st, t) => startShift(u, st, t),
    switchStore: (u, st, t) => switchStore(u, st, t),
    endShift: (u, by, photos, t) => endShift(u, by, photos, t),
    addSale: (u, d, sale, by) => { if (!getTransactions(getReport(u, d)).some(t => t.id === sale.id)) addSale(u, d, sale, by); },
    removeSale: (u, d, id, by) => removeSale(u, d, id, by),
    setUnlocked: (u, d, v) => setUnlocked(u, d, v),
    saveTargets: (rows, by) => saveTargets(rows, by),
    saveSettings: (teamId, st) => saveSettings(teamId, st),
    setActive: (u, v) => setActive(u, v),
    setUserPhoto: (u, photo) => setUserPhoto(u, photo),
    setSchedule: (u, sch) => setSchedule(u, sch),
  };
  function useServerState(s) {
    state = Object.assign(emptyState(), s);
    memo = {};
    TODAY = s.today || TODAY;
    DATA_START = s.from || DATA_START;
    outbox().filter(x => x.me === s.me).forEach(x => { try { REPLAY[x.op](...x.args); } catch (e) { /* skip */ } });
  }
  let loading = null;
  async function loadLive() {
    if (!getToken()) { state = emptyState(); return; }
    const cached = readCache();
    // Recent data on this phone: show it now, fetch newer data for the next page in the background
    if (cached && Date.now() - (cached._at || 0) < CACHE_FRESH_MS) {
      useServerState(cached);
      refreshCache();
      flush();
      return;
    }
    const res = await refreshCache();
    if (res.ok) {
      useServerState(res.data);
      flush();
      return;
    }
    if (res.status === 0 && cached) {
      useServerState(cached); // offline: the last data seen on this phone
      setTimeout(() => notify('Offline. Data tersimpan di HP dan dikirim saat online.'), 300);
      return;
    }
    state = emptyState();
  }
  // Pages start with Data.ready(() => { ... }): immediately in the demo, after loading in live mode
  function ready(cb) {
    if (!LIVE) { cb(); return; }
    if (!loading) loading = loadLive();
    loading.then(cb);
  }

  const upsert = (list, item) => { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); };
  // Awaited writes: change the page's data, keep the cache in step
  const changed = () => { writes++; memo = {}; persist(); };
  const LIVE_API = {
    async login(phone, password, remember) {
      lastError = '';
      const res = await call('login', { phone: normalizePhone(phone), password });
      if (!res.ok) { lastError = res.data.message; return null; }
      setToken(res.data.token, !!remember);
      saveCache(Object.assign(res.data.state, { _at: Date.now() }));
      useServerState(res.data.state);
      return user(state.me) || null;
    },
    async logout() {
      await Promise.race([flush(), new Promise(r => setTimeout(r, 3000))]); // try to send what is still queued
      setToken('');
      lsDel(CACHE_KEY);
      state = emptyState();
    },
    currentUser: () => (state && state.me ? user(state.me) || null : null),
    async changePassword(current, password, confirmation) {
      const res = await call('password.change', { current, password, confirmation });
      if (!res.ok) return res.data.message;
      setToken(res.data.token, remembered()); // the old token stops working
      state.mustChangePassword = false;
      changed();
      return null;
    },

    // Queued writes
    startShift(userId, storeId) {
      const t = nowTime(), sh = startShift(userId, storeId, t);
      enqueue('startShift', [userId, storeId, t], 'shift.start', { storeId, time: t });
      return sh;
    },
    switchStore(userId, storeId) {
      const t = nowTime(), sh = switchStore(userId, storeId, t);
      enqueue('switchStore', [userId, storeId, t], 'shift.switchStore', { storeId, time: t });
      return sh;
    },
    endShift(userId, by, photos) {
      const t = nowTime(), sh = endShift(userId, by, photos, t);
      enqueue('endShift', [userId, by, photos, t], 'shift.end', { time: t, photos });
      return sh;
    },
    addSale(userId, date, sale, by) {
      const tx = addSale(userId, date, sale, by);
      const saved = { id: tx.id, time: tx.time, storeId: tx.storeId, productId: tx.productId, qty: tx.qty, price: tx.price };
      enqueue('addSale', [userId, date, saved, by], 'sale.add',
        { clientId: tx.id, userId, date, productId: tx.productId, qty: tx.qty, price: tx.price, storeId: tx.storeId, time: tx.time || null });
      return tx;
    },
    removeSale(userId, date, txId, by) {
      removeSale(userId, date, txId, by);
      enqueue('removeSale', [userId, date, txId, by], 'sale.remove', { clientId: txId });
    },
    setUnlocked(userId, date, value) {
      setUnlocked(userId, date, value);
      enqueue('setUnlocked', [userId, date, !!value], 'report.unlock', { userId, date, unlocked: !!value });
    },
    saveTargets(rows, by) {
      saveTargets(rows, by);
      const n = v => (v ? Math.round(v) : null);
      enqueue('saveTargets', [rows, by], 'targets.save', {
        rows: rows.map(r => ({ storeId: r.storeId, mk: r.mk, userId: r.userId || null, monthly: n(r.monthly) || 0, weekly: n(r.weekly), daily: n(r.daily) })),
      });
    },
    saveSettings(teamId, st) {
      saveSettings(teamId, st);
      enqueue('saveSettings', [teamId, st], 'settings.save', {
        teamId, workingDays: st.workingDays, editDays: st.editDays, reminder: st.reminder,
        holidays: st.holidays.map(h => ({ date: h.date, name: h.name, working: !!h.working })),
      });
    },
    setActive(userId, value) {
      setActive(userId, value);
      enqueue('setActive', [userId, !!value], 'user.setActive', { userId, active: !!value });
    },
    // sch: { days: [0–6], start: 'HH:MM', end: 'HH:MM' } or { useTeam: true }
    setSchedule(userId, sch) {
      setSchedule(userId, sch);
      enqueue('setSchedule', [userId, sch], 'user.schedule', Object.assign({ userId }, sch));
    },
    setUserPhoto(userId, photo) {
      setUserPhoto(userId, photo);
      enqueue('setUserPhoto', [userId, photo], 'user.photo', { userId, photo });
    },

    // Writes that wait for the server (they return an error message, or null when saved)
    async addUser(data) {
      const res = await call('user.add', {
        role: data.role, name: data.name, phone: data.phone, teamId: data.teamId || null, newTeam: data.newTeam || null, areaId: data.areaId || null,
      });
      if (!res.ok) return res.data.message;
      const { user: u, team: t, settings: st } = res.data;
      state.users.push(u);
      if (t) upsert(state.teams, t);
      if (t && st) state.settings[t.id] = st;
      changed();
      return null;
    },
    async updateUser(userId, data) {
      const res = await call('user.update', { userId, name: data.name, phone: data.phone });
      if (!res.ok) return res.data.message;
      upsert(state.users, res.data.user);
      changed();
      return null;
    },
    async resetPassword(userId) {
      const res = await call('user.resetPassword', { userId });
      if (!res.ok) { notify(res.data.message); return null; }
      return res.data.password;
    },
    async saveProduct(p) {
      const res = await call('product.save', { id: p.id || null, name: p.name, sku: p.sku || '', brand: p.brand || '', barcode: p.barcode || '', price: p.price, active: p.active !== false, image: p.image || null });
      if (!res.ok) return res.data.message;
      upsert(state.products, res.data.product);
      changed();
      return null;
    },
    // Daily recap numbers for the Excel export (apps-script/Export.gs): { teams, days, offDays, rows } or { error }
    async dailyRecap({ from, to, teamId }) {
      const res = await call('report.dailyRecap', { from, to, teamId: teamId || null });
      return res.ok ? res.data : { error: res.data.message };
    },
    async saveStore(st) {
      const res = await call('store.save', { id: st.id || null, name: st.name, chain: st.chain || '', city: st.city, address: st.address || '', active: st.active !== false, image: st.image || null });
      if (!res.ok) return res.data.message;
      upsert(state.stores, res.data.store);
      changed();
      return null;
    },
    reset() { /* demo only */ },
  };
  LIVE_API.addSpg = data => LIVE_API.addUser({ ...data, role: 'spg' });

  function reset() { lsDel(STORE_KEY); lsDel(USER_KEY); }
  // Full demo data (used by tools/export-demo-data.js for the Apps Script importDemoData())
  const exportState = () => JSON.parse(JSON.stringify(state));

  // Load saved demo data, or generate it on first visit (runs last so all helpers above are defined)
  (function load() {
    if (LIVE) { state = emptyState(); return; }
    const raw = lsGet(STORE_KEY);
    if (raw) {
      try { const s = JSON.parse(raw); if (s && s.version === 8) { state = s; return; } } catch (e) { /* reseed */ }
    }
    seed();
    persist();
  })();

  const areas = () => state.areas.slice();

  window.Data = Object.assign({
    get TODAY() { return TODAY; },
    get DATA_START() { return DATA_START; },
    LIVE, CONFIG, LEVELS, ready, page,
    lastError: () => lastError,
    mustChangePassword: () => !!(state && state.mustChangePassword),
    pendingCount: () => (LIVE ? outbox().length : 0),
    changePassword: async () => null,
    parse, addDays, addMonths, monthKey, monthStart, monthEnd, weekStart, weekEnd, eachDay, range,
    login, logout, currentUser,
    user, team, teams, area, spgsOf, products, product, canView,
    isWorkingDay, workingDays, workingDaysInMonth,
    targetRow, dailyTarget, periodTarget, targetPreview, saveTargets, storeTarget, heldStores, storeDailyTarget,
    getReport, saveReport, setUnlocked, isLocked, canEdit, listReports,
    progress, level, nextLevel, leaderboard, streak, teamSummary, areaSummary, dailySeries, chartRange,
    addSpg, setActive, setSchedule, scheduleLabel, hasOwnSchedule, isWorkingDayFor, workingDaysInMonthFor, getSettings, saveSettings, saveProduct, reset,
    getShift, startShift, endShift, switchStore, lastStoreId, storeLabel, storeFor, getTransactions, addSale, removeSale,
    addUser, updateUser, resetPassword, canManageUser, canAddCatalog, canEditCatalog, saveStore, stores, store, activity, storeTotals,
    allUsers, setUserPhoto, normalizePhone, exportState, areas,
    dailyRecap: async () => ({ error: 'Rekap harian hanya bisa saat aplikasi terhubung ke Google Sheets.' }),
  }, LIVE ? LIVE_API : {});
})();
