# YouTube MP3 İndirici

YouTube video ve playlist bağlantılarını mp3 olarak indiren, Vercel'e deploy edilebilen bir Next.js uygulaması.

## Özellikler

- Tek video veya playlist linki ile toplu ekleme
- İndirilecek/indirilen şarkılar tek bir listede canlı durum (Bekliyor / İndiriliyor / Tamamlandı / Hata) ile gösterilir
- Chrome/Edge'de **Klasör Seç** ile bilgisayarınızda seçtiğiniz klasöre doğrudan kayıt (File System Access API); desteklemeyen tarayıcılarda dosyalar varsayılan İndirilenler klasörüne iner
- Sunucu tarafında yt-dlp (standalone binary, Python gerektirmez) + ffmpeg-static ile mp3'e dönüştürme

## Nasıl çalışır (mimari notu)

Vercel'de sunucu tarafında kalıcı/kişisel bir disk klasörüne yazma imkanı yoktur (serverless fonksiyonlar durumsuzdur). Bu yüzden "klasöre indirme" tamamen **tarayıcı tarafında** çözülür:

1. `/api/info` — verilen URL için yt-dlp ile video/playlist bilgisini (başlık, süre, thumbnail) JSON olarak döner.
2. `/api/download?id=...` — ilgili videoyu yt-dlp ile indirir, ffmpeg-static ile mp3'e çevirir ve sonucu tarayıcıya **stream** olarak yollar (`/tmp` üzerinde geçici dosya, stream bitince otomatik silinir).
3. Tarayıcı, `showDirectoryPicker()` ile seçilen klasöre `pipeTo` kullanarak akışı doğrudan yazar; API desteklenmiyorsa normal dosya indirme (blob + `<a download>`) ile yedeklenir.

## Yerel geliştirme

```bash
npm install     # postinstall adımı yt-dlp binary'sini otomatik indirir (bin/ klasörüne)
npm run dev
```

`http://localhost:3000` adresini açın.

> yt-dlp binary indirme başarısız olursa: `npm run fetch:yt-dlp`

## Vercel'e deploy

1. Bu repoyu GitHub'a push edin, Vercel'de "Import Project" ile bağlayın (framework otomatik Next.js olarak algılanır).
2. Ekstra ortam değişkeni gerekmez.
3. **Önemli — plan limitleri:** Vercel Hobby planında fonksiyon süresi varsayılan 10 sn'dir; uzun şarkılar/playlistler için `app/api/download/route.ts` ve `app/api/info/route.ts` içindeki `maxDuration` değerini plan limitinize göre ayarlayın (Hobby'de en fazla 60 sn'ye çıkarılabilir, Pro planda daha yüksek).
4. Deploy sonrası ilk build'de `postinstall` scripti yt-dlp Linux binary'sini otomatik indirir; ekstra kurulum gerekmez.

## Sınırlamalar

- Klasör seçme özelliği (File System Access API) yalnızca Chromium tabanlı tarayıcılarda (Chrome, Edge) çalışır; Firefox/Safari'de dosyalar varsayılan indirilenler klasörüne düşer.
- Çok uzun videolar/playlistler, Vercel'in fonksiyon süre limitine takılabilir.
- Yalnızca üzerinde hak sahibi olduğunuz veya indirmeye izinli içerikler için kullanın; YouTube'un kullanım şartlarına ve telif haklarına uymak kullanıcının sorumluluğundadır.
