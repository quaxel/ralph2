# Bereket Market 3D

Prosedürel Three.js (r170) ile modellenmiş, içinde gezilebilen 3D süpermarket. Harici model/doku dosyası yok; her şey kodla üretiliyor.

## Çalıştırma
ES modülleri kullandığı için bir HTTP sunucusu gerekir:

```bash
cd Projects/Supermarket3D
python3 -m http.server 8080      # veya: npx serve .
# tarayıcıda http://localhost:8080
```

## Kontroller
| Mod | Tuş | Açıklama |
|---|---|---|
| İçeride Gez | `1` | W A S D / oklar yürü, fare bak, Shift koş, Esc çık. Dokunmatikte joystick + sürükle. |
| Kuşbakışı | `2` | Tavan gizlenir, mağaza planı yukarıdan döndürülebilir. |
| Dış Görünüm | `3` | Otopark ve cephe, yörünge kamerası. |
| Tur | `T` | Mağazanın tamamını dolaşan otomatik kamera turu. |

Otomatik kapılar yaklaşınca açılır, açık kasalarda bant akar, duvar/raf çarpışması vardır.

## Yapı
```
index.html            Uygulama (HUD, importmap)
viewer.html           Tek model görüntüleyici: viewer.html?model=shelving&fn=createGondola&view=iso
src/main.js           Renderer, ışık, modlar, çarpışma, tur
src/layout.js         Mağaza yerleşim planı (40 × 30 m)
src/env.js            Renderer / ortam ışığı yardımcıları
src/models/common.js  Ortak yardımcılar (seeded RNG, materyal/geometri önbelleği, etiket dokusu)
src/models/building.js       Bina, cephe, otopark, kapılar, asma tabelalar
src/models/shelving.js       Gondol raflar, reyon başları, duvar rafları, reyon tabelaları, ürünler
src/models/refrigeration.js  Camlı dolaplar, açık reyon dolapları, sandık dondurucular, şarküteri
src/models/checkout.js       Kasa bantları, self-servis kasa, müşteri hizmetleri
src/models/produce.js        Manav tezgâhları (17 ürün), fırın rafı, pastane vitrini
src/models/props.js          Alışveriş arabaları, sepetler, insanlar, ATM, palet, bitki vb.
tools/shot.cjs        Headless ekran görüntüsü / doğrulama aracı
MODEL_CONTRACT.md     Model sözleşmesi (birimler, yön, performans bütçesi)
```

Modeller paralel alt ajanlar tarafından `MODEL_CONTRACT.md` sözleşmesine göre üretildi; entegrasyon, yerleşim ve kontrol ana ajan tarafından yapıldı.

## Doğrulama
```bash
node tools/shot.cjs --model produce --views iso,front,top --out /tmp/shots
node tools/shot.cjs --page "index.html?shot=aisle" --out /tmp/shots
```
`?shot=` ön ayarları: `exterior, doll, dolltop, entrance, produce, aisle, checkout, cashier, deli, coolers, bakery`.
