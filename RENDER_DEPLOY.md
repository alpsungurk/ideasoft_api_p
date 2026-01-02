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

### 4. MySQL Database Kurulumu

Render'da MySQL yok, bu yüzden harici bir servis kullanmanız gerekiyor:

#### Seçenek 1: PlanetScale (Önerilen - Ücretsiz)

1. [PlanetScale.com](https://planetscale.com) adresine gidin
2. Ücretsiz hesap oluşturun
3. Yeni database oluşturun
4. Connection bilgilerini alın
5. Render'da Environment Variables'a ekleyin:

```env
DB_HOST=your-planetscale-host.psdb.cloud
DB_PORT=3306
DB_USER=your-username
DB_PASSWORD=your-password
DB_NAME=your-database-name
```

#### Seçenek 2: AWS RDS
- MySQL instance oluşturun
- Connection bilgilerini Render'a ekleyin

#### Seçenek 3: DigitalOcean Managed Database
- MySQL database oluşturun
- Connection bilgilerini Render'a ekleyin

#### Seçenek 4: Başka MySQL Hosting
- Herhangi bir MySQL hosting servisi kullanabilirsiniz

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

## 🎯 PlanetScale Kurulumu (Önerilen)

1. [PlanetScale.com](https://planetscale.com) → Sign up
2. **New database** → İsim verin
3. **Connect** → Connection bilgilerini alın
4. Render'a environment variables olarak ekleyin
5. Database şeması otomatik oluşturulacak (`server.js` içinde)

## ✅ Deployment Kontrolü

Deploy olduktan sonra:

```bash
# Health check
curl https://your-app.onrender.com/api/health

# API test
curl https://your-app.onrender.com/api/db/batches
```

Başarılı deployment için tüm endpoint'ler çalışmalı!

