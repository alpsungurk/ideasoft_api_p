# 🎨 Render Deployment Guide

Render, Vercel'e benzer bir platformdur. Ücretsiz tier'da sınırlı kullanım var ama çok stabil.

## 🚀 Hızlı Başlangıç

### 1. Render Hesabı Oluştur

1. [Render.com](https://render.com) adresine gidin
2. "Get Started for Free" butonuna tıklayın
3. GitHub hesabınızla giriş yapın

### 2. Web Service Oluştur

**Yöntem 1: Blueprint ile (Önerilen)**
1. Dashboard'da **New** > **Blueprint**
2. GitHub repository URL'nizi yapıştırın: `https://github.com/alpsungurk/ideasoft_api_p`
3. Render otomatik olarak `render.yaml` dosyasını algılayacak
4. **Apply** butonuna tıklayın

**Yöntem 2: Manuel**
1. Dashboard'da **New** > **Web Service**
2. GitHub repository'nizi bağlayın
3. Repository'yi seçin (`ideasoft_api_p`)

### 3. Build Ayarları (Manuel ise)

**Name:** `ideasoft-api` (veya istediğiniz isim)

**Environment:** `Node`

**Region:** `Frankfurt` (veya size yakın)

**Branch:** `main`

**Root Directory:** `.` (boş bırakın)

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm start
```

**Plan:** Free (veya istediğiniz plan)

**Health Check Path:** `/api/health`

### 4. MySQL Database Kurulumu (Natro)

Natro'da MySQL kullanıyorsanız, Render'dan Natro MySQL'e bağlanmanız gerekiyor:

#### Natro MySQL Ayarları

1. **Natro Panel'e giriş yapın**
   - [Natro.com](https://www.natro.com) → Panel girişi

2. **MySQL Database Bilgilerini Alın**
   - Plesk veya cPanel'den MySQL database bilgilerinizi alın
   - Host: Genellikle `localhost` veya `mysql.natro.com` veya IP adresi
   - Port: `3306`
   - Database Name: Veritabanı adı
   - Username: Kullanıcı adı
   - Password: Şifre

3. **Natro'da Remote MySQL Erişimi Açın**
   - Plesk: **Databases** > **Remote MySQL** > Render'ın IP adresini ekleyin
   - cPanel: **Remote MySQL** > Render'ın IP adresini ekleyin
   - **ÖNEMLİ:** Render'ın IP adresini öğrenmek için Render dashboard'da **Events** sekmesine bakın veya support'a sorun
   - Veya **"Herhangi bir ana bilgisayardan"** seçeneğini aktif edin (güvenlik için önerilmez ama test için kullanılabilir)

4. **Render'da Environment Variables Ekle**

Render dashboard'da **Environment** sekmesine gidin ve şunları ekleyin:

```env
DB_HOST=mysql.natro.com
# veya
DB_HOST=your-natro-mysql-host
# veya IP adresi
DB_HOST=123.456.789.0

DB_PORT=3306
DB_USER=your_natro_db_user
DB_PASSWORD=your_natro_db_password
DB_NAME=your_database_name
```

**Not:** Natro'da host genellikle:
- `localhost` (sadece aynı sunucudan)
- `mysql.natro.com` 
- Veya özel bir host adı
- Veya IP adresi

Eğer `localhost` çalışmazsa, Natro destek ekibinden doğru host adresini öğrenin.

#### Alternatif: PlanetScale (Eğer Natro bağlantısı çalışmazsa)

Eğer Natro'dan Render'a bağlantı kurmakta sorun yaşarsanız:

1. [PlanetScale.com](https://planetscale.com) → Ücretsiz hesap
2. Yeni database oluşturun
3. Connection bilgilerini Render'a ekleyin

### 5. Environment Variables Ekle

Render dashboard'da **Environment** sekmesine gidin ve şunları ekleyin:

```env
NODE_ENV=production
PORT=3001
DB_HOST=your_mysql_host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=ideasoft_api_db
GOOGLE_API_KEY=your_key (opsiyonel)
GOOGLE_SEARCH_ENGINE_ID=your_id (opsiyonel)
```

**Önemli:** `PORT` değişkenini Render otomatik olarak ayarlar, ama manuel de ekleyebilirsiniz.

### 6. Custom Domain (Opsiyonel)

1. **Settings** > **Custom Domains**
2. Domain'inizi ekleyin
3. DNS ayarlarını yapın (CNAME kaydı)

### 7. Deploy

Render otomatik olarak deploy edecek. İlk deploy 5-10 dakika sürebilir.

## 📝 Notlar

- ✅ Render otomatik HTTPS sağlar
- ⚠️ Free tier'da uyku modu var (15 dakika kullanılmazsa uyur)
- ✅ Tüm API endpoint'leri çalışır (Vercel limiti yok!)
- ✅ Frontend build dosyaları `dist/` klasöründe
- ✅ GitHub'a push yaptığınızda otomatik deploy eder
- ✅ `server.js` tüm endpoint'leri içerir

## 🔄 Güncelleme

GitHub'a push yaptığınızda Render otomatik deploy eder!

```bash
git add .
git commit -m "Update"
git push
```

## 💰 Fiyatlandırma

- **Free Plan**: 
  - Sınırlı kaynak
  - Uyku modu var (15 dakika kullanılmazsa)
  - İlk istek 30-60 saniye sürebilir
  
- **Starter Plan**: $7/ay
  - Uyku modu yok
  - Daha hızlı
  
- **Standard Plan**: $25/ay
  - Daha fazla kaynak
  - Daha iyi performans

## 🐛 Sorun Giderme

### Build hatası
- Render logs'u kontrol edin: **Logs** sekmesi
- `package.json`'da `start` script'inin olduğundan emin olun
- Node.js versiyonunu kontrol edin (18+ gerekli)

### Database bağlantı hatası
- MySQL servisinin çalıştığından emin olun
- Environment variables'ı kontrol edin
- Firewall ayarlarını kontrol edin (PlanetScale'de otomatik açık)

### Uyku modu (Free tier)
- İlk istek 30-60 saniye sürebilir
- Starter plan ($7/ay) ile uyku modu yok
- Health check endpoint'i ekleyin (`/api/health`)

### Port hatası
- Render otomatik olarak PORT environment variable'ını ayarlar
- `server.js` zaten `process.env.PORT` kullanıyor

## 🎯 Natro MySQL Bağlantı Ayarları

### Plesk Panel'de:

1. **Databases** > **Remote MySQL**
2. **Add Access Host** → Render'ın IP adresini ekleyin
3. Veya **"Allow access from any host"** seçeneğini aktif edin (test için)

### cPanel'de:

1. **Remote MySQL** bölümüne gidin
2. Render'ın IP adresini ekleyin
3. Veya **"%"** ekleyerek tüm IP'lerden erişime izin verin (test için)

### Render IP Adresini Öğrenme:

- Render dashboard'da **Events** sekmesine bakın
- Veya support'a sorun
- Veya geçici olarak **"%"** kullanın (tüm IP'lerden erişim)

### Database Şeması:

Render deploy olduktan sonra, ilk API isteğinde `server.js` otomatik olarak tabloları oluşturacak:
- `import_batches`
- `imported_products`

Manuel oluşturmak isterseniz, `database_schema.sql` dosyasını kullanabilirsiniz.

## ✅ Deployment Kontrolü

Deploy olduktan sonra:

```bash
# Health check
curl https://your-app.onrender.com/api/health

# API test
curl https://your-app.onrender.com/api/db/batches
```

Başarılı deployment için tüm endpoint'ler çalışmalı!

