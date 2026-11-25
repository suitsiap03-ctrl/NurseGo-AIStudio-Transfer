/**
 * Comprehensive Postoperative Home Care Educational Guides
 * Covers the 7 core surgery types specified in NurseGo master specification.
 */

import { PostOpEducation } from '../types/database';

export const SURGERY_EDUCATION_DATA: PostOpEducation[] = [
  {
    id: '1',
    surgery_name: 'Apendektomi (Operasi Usus Buntu)',
    surgery_slug: 'apendektomi',
    short_summary: 'Panduan perawatan di rumah pasca pengangkatan usus buntu melalui bedah terbuka atau laparoskopi.',
    wound_care: [
      'Pertahankan balutan luka tetap bersih, kering, dan terpasang rapi.',
      'Hindari menyentuh atau menggaruk luka sayatan operasi dengan tangan yang tidak dicuci.',
      'Jika menggunakan plester anti-air, periksa secara berkala tidak ada cairan yang tertahan di balik plester.',
      'Ganti perban sesuai jadwal yang diinstruksikan oleh perawat atau dokter bedah dengan teknik steril.'
    ],
    activity_mobilization: [
      'Lakukan mobilisasi jalan santai secara bertahap sejak hari pertama di rumah untuk mencegah konstipasi dan perlengketan usus.',
      'Hindari mengangkat benda berat (> 5 kg) selama minimal 2 hingga 4 minggu.',
      'Hindari aktivitas olahraga berat, berlari, atau bersepeda hingga mendapat izin dari dokter penanggung jawab.',
      'Istirahat berbaring cukup (minimal 7-8 jam per hari).'
    ],
    hygiene: [
      'Mandi dengan washlap pada 48 jam pertama untuk mencegah luka basah.',
      'Setelah diizinkan mandi, hindari menggosok langsung area luka operasi.',
      'Keringkan area luka dengan kassa steril atau handuk bersih sekali pakai dengan menepuk lembut (jangan digosok).'
    ],
    nutrition: [
      'Konsumsi makanan tinggi protein (telur rebus, ikan gabus, dada ayam, tempe) guna mempercepat penyembuhan jaringan.',
      'Tingkatkan asupan serat dari sayuran dan buah segar untuk mencegah sembelit dan mengejan.',
      'Minum air putih minimal 2 liter (8-10 gelas) sehari.',
      'Hindari makanan berlemak tinggi, terlalu pedas, atau mengandung gas berlebih pada minggu pertama.'
    ],
    medications: [
      'Minum antibiotik oral secara teratur sampai habis sesuai dosis resep dokter meskipun sudah merasa sembuh.',
      'Konsumsi analgetik pereda nyeri sesuai anjuran jika merasakan nyeri di area insisi.',
      'Hindari mengonsumsi obat herbal atau obat bebas tanpa sepengetahuan perawat/dokter.'
    ],
    danger_signs: [
      'Demam dengan suhu tubuh >= 38.0°C disertai menggigil.',
      'Nyeri perut hebat mendadak atau perut kembung tegang seperti papan.',
      'Mual dan muntah terus-menerus sehingga tidak bisa makan atau minum.',
      'Luka sayatan merembes darah merah segar atau cairan keruh/nanah (pus).',
      'Tidak bisa buang angin (flatus) atau tidak bisa buang air besar lebih dari 3 hari.'
    ],
    follow_up: [
      'Jadwal kontrol pertama dilakukan pada 7-10 hari pascaoperasi untuk evaluasi luka dan pelepasan jahitan jika diperlukan.',
      'Bawa catatan pemantauan harian tanda vital dan keluhan saat kontrol ke poliklinik bedah.'
    ]
  },
  {
    id: '2',
    surgery_name: 'Sectio Caesarea (SC / Operasi Sesar)',
    surgery_slug: 'sectio-caesarea',
    short_summary: 'Panduan pemulihan pascapersalinan sesar, perawatan luka insisi abdomen bawah, dan dukungan laktasi.',
    wound_care: [
      'Jaga area luka sayatan di perut bagian bawah tetap kering, sejuk, dan tidak tertekan.',
      'Gunakan pakaian dalam dan celana longgar berbahan katun lembut yang tidak menekan garis jahitan operasi.',
      'Hindari mengoleskan bedak, minyak, atau ramuan tradisional pada area luka operasi.',
      'Bila balutan rembes atau lepas, segera hubungi perawat penanggung jawab.'
    ],
    activity_mobilization: [
      'Mobilisasi aktif dengan jalan kaki santai di rumah untuk melancarkan sirkulasi darah dan mencegah trombosis vena dalam (DVT).',
      'Hindari mengangkat barang yang lebih berat dari bayi Anda selama minimal 4-6 minggu.',
      'Hindari gerakan membungkuk tiba-tiba atau naik-turun tangga secara berlebihan.',
      'Gunakan bantal penyangga pada perut saat batuk, bersin, atau menyusui bayi.'
    ],
    hygiene: [
      'Ganti pembalut nifas secara teratur setiap 3-4 jam atau setiap kali terasa penuh.',
      'Bersihkan organ intim dari arah depan ke belakang dengan air bersih yang mengalir, lalu keringkan lembut.',
      'Mandi air hangat tanpa membasahi langsung luka sayatan jika belum memakai balutan anti-air.'
    ],
    nutrition: [
      'Konsumsi menu Tinggi Kalori Tinggi Protein (TKTP) untuk mempercepat perbaikan dinding rahim dan menunjang produksi ASI.',
      'Konsumsi zat besi dan vitamin C untuk mencegah anemia pascamelahirkan.',
      'Minum cairan 2.5 hingga 3 liter setiap hari untuk mendukung kecukupan volume ASI.',
      'Konsumsi sayur berdaun hijau (katuk, bayam) dan buah-buahan berserat.'
    ],
    medications: [
      'Konsumsi obat pereda nyeri teratur agar tetap nyaman menyusui dan merawat buah hati.',
      'Lanjutkan konsumsi suplemen kalsium dan penambah darah sesuai anjuran bidan/dokter kandungan.',
      'Hindari obat-obatan yang dapat masuk ke ASI tanpa konsultasi dengan tenaga medis.'
    ],
    danger_signs: [
      'Perdarahan nifas (lokia) sangat banyak hingga membasahi 2 pembalut penuh dalam waktu 1 jam.',
      'Cairan nifas mengeluarkan bau busuk atau menyengat abnormal.',
      'Luka insisi terbuka, bengkak kemerahan parah, atau keluar nanah.',
      'Demam tinggi > 38.0°C dengan menggigil.',
      'Nyeri dada, sesak napas mendadak, atau salah satu betis terasa bengkak, merah, panas, dan sangat nyeri saat ditarik.'
    ],
    follow_up: [
      'Pemeriksaan nifas dan evaluasi luka operasi dilakukan pada hari ke-7 pascaoperasi.',
      'Kontrol nifas lanjutan pada minggu ke-4 sampai ke-6 untuk konseling KB pascapersalinan.'
    ]
  },
  {
    id: '3',
    surgery_name: 'Herniorafi (Operasi Hernia)',
    surgery_slug: 'herniorafi',
    short_summary: 'Panduan pencegahan kekambuhan hernia, perawatan insisi lipat paha (inguinal), dan pengelolaan tekanan intra-abdomen.',
    wound_care: [
      'Jaga luka di area lipat paha tetap bersih dan kering.',
      'Kompres es kering (es dibungkus handuk bersih) pada area bengkak ringan di selangkangan selama 15 menit jika dianjurkan oleh perawat.',
      'Kenakan celana dalam yang menyangga dengan baik (supportive underwear) untuk kenyamanan area skrotum/selangkangan.'
    ],
    activity_mobilization: [
      'PENTING: Jangan mengangkat barang beban > 4 kg selama 4 sampai 6 minggu pascaoperasi.',
      'Hindari mengejan keras saat buang air besar, serta tahan area luka dengan telapak tangan bila bersin atau batuk.',
      'Lakukan jalan santai setiap hari, namun hindari olahraga kompetitif atau angkat beban berat.',
      'Kembali bekerja di kantor biasanya dapat dilakukan setelah 1-2 minggu sesuai toleransi.'
    ],
    hygiene: [
      'Mandi washlap atau gunakan penutup kedap air bila mandi guyur sampai jahitan dievaluasi.',
      'Keringkan area lipatan paha secara menyeluruh agar tidak lembap yang berisiko menumbuhkan jamur atau bakteri.'
    ],
    nutrition: [
      'Terapkan pola makan tinggi serat (oatmeal, pepaya, pir, brokoli) guna menjaga feses tetap lunak tanpa mengejan.',
      'Minum minimal 8-10 gelas air per hari untuk membantu pergerakan usus.',
      'Hindari makanan yang menimbulkan kembung berlebih (soda, kol, kubis).'
    ],
    medications: [
      'Konsumsi analgetik yang diresepkan bila terasa ngilu atau nyeri di selangkangan.',
      'Jika mengalami kecenderungan sembelit, konsumsi obat pencahar lunak (stool softener) sesuai resep.'
    ],
    danger_signs: [
      'Muncul benjolan kembali di lokasi operasi atau area lipat paha.',
      'Pembengkakan hebat dan nyeri luar biasa pada buah zakar/skrotum.',
      'Tidak bisa buang air kecil (retensi urin akut) lebih dari 6-8 jam.',
      'Demam tinggi dan keluar cairan berbau dari luka sayatan.'
    ],
    follow_up: [
      'Kontrol ke dokter spesialis bedah pada 7-14 hari pascaoperasi untuk pemeriksaan kekuatan dinding abdomen dan luka operasi.'
    ]
  },
  {
    id: '4',
    surgery_name: 'Total Knee Replacement (TKR / Penggantian Sendi Lutut)',
    surgery_slug: 'tkr',
    short_summary: 'Panduan rehabilitasi mandiri, latihan rentang gerak, dan pencegahan tromboemboli pascaoperasi lutut.',
    wound_care: [
      'Jaga balutan luka lutut tetap kering dan steril.',
      'Periksa apakah ada rembesan cairan atau pembengkakan yang meluas ke area betis dan paha.',
      'Jangan mengoleskan salep atau minyak gosok di sekitar insisi sendi lutut.'
    ],
    activity_mobilization: [
      'Lakukan latihan penguatan otot paha depan (quadriceps isometric exercises) dan pompa pergelangan kaki (ankle pumps) secara teratur tiap 1-2 jam saat terjaga.',
      'Gunakan alat bantu jalan (walker atau tongkat/kruk) dengan postur tegak dan stabil sesuai arahan fisioterapi.',
      'Hindari menekuk lutut lebih dari 90 derajat secara mendadak pada minggu-minggu awal.',
      'Jangan meletakkan bantal persis di bawah lipatan belakang lutut saat berbaring karena dapat menyebabkan kontraktur sendi; letakkan bantal di bawah pergelangan kaki/tumit.'
    ],
    hygiene: [
      'Jangan merendam lutut di dalam bak mandi (bathtub) atau kolam renang sebelum luka sembuh total (minimal 4-6 minggu).',
      'Gunakan kursi mandi (shower chair) dan keset anti-licin di kamar mandi untuk mencegah risiko jatuh terpeleset.'
    ],
    nutrition: [
      'Konsumsi makanan kaya kalsium (susu, keju, brokoli), vitamin D, dan protein tinggi.',
      'Jaga berat badan ideal untuk mengurangi beban tumpuan mekanik pada sendi implan lutut baru.',
      'Hindari konsumsi alkohol dan rokok yang memperlambat penyerapan tulang.'
    ],
    medications: [
      'Sangat penting: Konsumsi obat pengencer darah (antikoagulan) sesuai petunjuk dokter untuk mencegah bekuan darah di pembuluh darah kaki (DVT).',
      'Minum obat antinyeri 30-45 menit sebelum sesi latihan mandiri/fisioterapi di rumah agar latihan berjalan optimal.'
    ],
    danger_signs: [
      'Betis atau paha terasa sangat nyeri, bengkak, hangat, dan memerah (gejala kecurigaan DVT).',
      'Sesak napas mendadak atau nyeri dada tajam saat bernapas (waspada emboli paru).',
      'Luka lutut mengeluarkan cairan keruh berbau atau darah yang merembes banyak.',
      'Sendi lutut terkunci atau tidak dapat digerakkan sama sekali disertai nyeri tajam tak tertahankan.'
    ],
    follow_up: [
      'Kunjungan kontrol ke spesialis ortopedi pada minggu ke-2 pascaoperasi untuk evaluasi luka dan foto rontgen posisi prostesis lutut.',
      'Kontrol lanjutan fisioterapi terjadwal setiap 1-2 minggu.'
    ]
  },
  {
    id: '5',
    surgery_name: 'ORIF (Open Reduction Internal Fixation - Bedah Fiksasi Patah Tulang)',
    surgery_slug: 'orif',
    short_summary: 'Panduan perawatan anggota gerak dengan fiksasi pelat/sekrup tulang, elevasi ekstremitas, dan pemantauan neurovaskular.',
    wound_care: [
      'Pertahankan balutan perban elastis atau gips tetap bersih, kering, dan tidak basah.',
      'Jangan memasukkan benda runcing seperti lidi atau penggaris ke dalam gips jika merasa gatal karena dapat melukai kulit dan menimbulkan infeksi tersembunyi.',
      'Gunakan hair dryer dengan udara dingin dari kejauhan bila area sekitar gips terasa lembap.'
    ],
    activity_mobilization: [
      'Posisikan bagian tubuh yang dioperasi lebih tinggi daripada posisi jantung (elevasi) menggunakan bantal saat istirahat untuk memfasilitasi aliran balik vena dan mengurangi bengkak.',
      'Latih gerakan sendi di atas dan di bawah area patah tulang (misal: gerakkan jari-jari tangan/kaki secara aktif setiap jam).',
      'Patuhi status penumpuan berat badan (Non-Weight Bearing / Partial Weight Bearing) sesuai petunjuk dokter bedah ortopedi.',
      'Jangan memaksakan menumpu kaki/tangan sebelum instruksi medis diberikan.'
    ],
    hygiene: [
      'Bungkus rapat area balutan/gips dengan plastik pelindung kedap air saat mandi.',
      'Jika balutan basah karena air, segera hubungi fasilitas kesehatan untuk penggantian balutan.'
    ],
    nutrition: [
      'Tingkatkan konsumsi protein nabati dan hewani untuk matriks penyembuhan tulang.',
      'Pastikan asupan kalsium, fosfor, vitamin C, dan zinc cukup untuk mempercepat pembentukan kalus tulang.',
      'Konsumsi air putih yang cukup dan berjemur sinar matahari pagi 10-15 menit untuk sintesis vitamin D alami.'
    ],
    medications: [
      'Minum analgetik dan antiinflamasi sesuai instruksi dokter.',
      'Jika diresepkan antibiotik pasca-fiksasi, konsumsi sampai tuntas tepat waktu.'
    ],
    danger_signs: [
      'Tanda Sindrom Kompartemen: Nyeri hebat yang semakin meningkat dan tidak berkurang dengan obat pereda nyeri, rasa kesemutan/kebas parah pada jari, serta ujung jari tampak pucat atau kebiruan.',
      'Jari tangan/kaki terasa dingin dan tidak dapat digerakkan.',
      'Balutan terasa terlalu ketat dan menekan nadi.',
      'Keluar nanah atau bau menyengat dari balik gips/balutan luka operasi.'
    ],
    follow_up: [
      'Kontrol ke poli ortopedi pada hari ke-10 hingga ke-14 untuk pelepasan jahitan kulit luar.',
      'Pemeriksaan rontgen tulang berkala pada minggu ke-6 untuk mengevaluasi pembentukan tulang baru (kalus).'
    ]
  },
  {
    id: '6',
    surgery_name: 'Kolesistektomi (Operasi Pengangkatan Kantung Empedu)',
    surgery_slug: 'kolesistektomi',
    short_summary: 'Panduan pola makan rendah lemak, perawatan luka laparoskopi kecil, dan adaptasi sistem pencernaan di rumah.',
    wound_care: [
      'Periksa 3 atau 4 titik insisi kecil laparoskopi pada dinding perut.',
      'Jaga titik bekas operasi tetap kering dan bersih.',
      'Jika dipasang steri-strip (plester kecil tipis), biarkan lepas dengan sendirinya, jangan dicabut paksa.',
      'Hindari menggaruk bekas lubang trokar.'
    ],
    activity_mobilization: [
      'Berjalan kaki santai di rumah secara aktif sangat dianjurkan untuk membantu mengeluarkan sisa gas CO2 yang digunakan saat prosedur laparoskopi.',
      'Nyeri alih di bahu kanan adalah hal umum akibat iritasi diafragma oleh gas CO2 dan akan menghilang dalam 2-4 hari.',
      'Hindari mengangkat barang beban lebih dari 5 kg selama 2-3 minggu.',
      'Dapat beraktivitas normal ringan setelah 3-5 hari bila merasa bertenaga.'
    ],
    hygiene: [
      'Boleh mandi menggunakan air mengalir setelah 48 jam pascaoperasi dengan sabun ringan tanpa menggosok area perut.',
      'Tepuk-tepuk lembut hingga benar-benar kering dengan handuk bersih.'
    ],
    nutrition: [
      'SANGAT PENTING: Terapkan diet rendah lemak selama minimal 4-6 minggu pertama agar sistem pencernaan beradaptasi dengan aliran empedu kontinu.',
      'Hindari makanan bersantan kental, gorengan, daging berlemak tinggi, mentega, dan keju berlebih.',
      'Makan dengan porsi kecil tapi sering (5-6 kali sehari) untuk mempermudah pencernaan.',
      'Tingkatkan asupan cairan untuk menjaga hidrasi bila terdapat tinja yang lebih lunak.'
    ],
    medications: [
      'Konsumsi obat analgesik bila merasakan nyeri pada perut kanan atas atau nyeri bahu.',
      'Minum obat anti-mual bila diinstruksikan oleh perawat atau dokter.'
    ],
    danger_signs: [
      'Kulit tubuh atau bagian putih mata (sklera) tampak menguning (ikterus).',
      'Warna air kencing pekat seperti teh tua atau feses berwarna pucat seperti dempul.',
      'Demam tinggi > 38.0°C disertai menggigil.',
      'Nyeri perut hebat di kuadran kanan atas yang terus memburuk dan tidak mereda.',
      'Muntah berulang dan tidak dapat minum air.'
    ],
    follow_up: [
      'Kontrol ke dokter spesialis bedah digestif pada 7-10 hari pascaoperasi untuk evaluasi pencernaan dan luka operasi.'
    ]
  },
  {
    id: '7',
    surgery_name: 'Mastektomi (Operasi Pengangkatan Jaringan Payudara)',
    surgery_slug: 'mastektomi',
    short_summary: 'Panduan perawatan luka dada, pemeliharaan selang drainase vakum, dan latihan pencegahan limfedema.',
    wound_care: [
      'Rawat luka insisi dada dengan teknik bersih dan steril.',
      'Jika masih terpasang selang drain (Jackson-Pratt atau Redon drain), catat jumlah (cc) dan warna cairan drain setiap 24 jam.',
      'Kosongkan tabung drain secara aseptik, cuci tangan sebelum dan sesudah menyentuh drainase, dan pastikan vakum tabung selalu aktif (tabung mengempis).',
      'Sematkan tabung drain pada pakaian dengan peniti pengaman agar selang tidak tertarik atau menggantung.'
    ],
    activity_mobilization: [
      'Lakukan latihan mobilitas tangan dan bahu di sisi operasi secara perlahan (seperti memutar pergelangan tangan, membuka-menutup jari, dan latihan jari merayap di dinding).',
      'Hindari gerakan mengayunkan tangan secara kasar atau meregangkan lengan terlalu tinggi di atas kepala sebelum drain dicabut.',
      'Hindari mengangkat barang dengan tangan di sisi operasi.',
      'Gunakan bantal penyangga di bawah ketiak saat beristirahat untuk kenyamanan.'
    ],
    hygiene: [
      'Mandi washlap selama drainase masih terpasang untuk mencegah air masuk ke lubang insersi drain.',
      'Gunakan pakaian berkancing depan yang longgar dan mudah dibuka-tutup.'
    ],
    nutrition: [
      'Konsumsi gizi seimbang dengan porsi tinggi protein guna menunjang regenerasi jaringan dan pembentukan jaringan parut yang sehat.',
      'Perbanyak konsumsi makanan kaya antioksidan (buah beri, sayuran hijau, jeruk) untuk meningkatkan imunitas tubuh.',
      'Cukupi kebutuhan cairan harian.'
    ],
    medications: [
      'Konsumsi obat pereda nyeri secara terjadwal untuk memudahkan melakukan latihan mobilitas lengan.',
      'Konsumsi antibiotik pencegahan sesuai anjuran sampai habis.',
      'Jika mendapatkan terapi onkologi lanjutan, patuhi arahan dari tim medis onkologi.'
    ],
    danger_signs: [
      'Produksi cairan drain meningkat drastis secara tiba-tiba dan berwarna merah darah segar pekat.',
      'Lengan di sisi payudara yang dioperasi mengalami pembengkakan besar mendadak, terasa kencang, dan kemerahan (indikasi limfedema akut/trombosis).',
      'Luka insisi dada teraba sangat panas, merah meluas, dan keluar nanah.',
      'Sesak napas mendadak atau batuk berdarah.'
    ],
    follow_up: [
      'Kontrol ke poliklinik bedah onkologi dalam waktu 5-7 hari pascaoperasi untuk evaluasi produksi cairan drain dan pelepasan drain bila produksi < 30 cc/24 jam.',
      'Konsultasi lanjutan untuk hasil pemeriksaan patologi anatomi (PA) jaringan.'
    ]
  }
];
