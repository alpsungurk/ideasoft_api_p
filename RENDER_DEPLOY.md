# 🎨 Render Deployment Guide

Render, Vercel'e benzer bir platformdur. Ücretsiz tier'da sınırlı kullanım var ama çok stabil.

## 🚀 Hızlı Başlangıç

### 1. Render Hesabı Oluştur

1. [Render.com](https://render.com) adresine gidin
2. "Get Started for Free" butonuna tıklayın
3. GitHub hesabınızla giriş yapın

### 2. Web Service Oluştur

1. Dashboard'da **New** > **Web Service**
2. GitHub repository'nizi bağlayın
3. Repository'yi seçin (`ideasoft_api_p`)

### 3. Build Ayarları

**Name:** `ideasoft-api` (veya istediğiniz isim)

**Environment:** `Node`

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm start
```

**Plan:** Free (veya istediğiniz plan)

### 4. Environment Variables Ekle

**Environment** sekmesinde şunları ekleyin:

```env
DB_HOST=your_mysql_host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=ideasoft_api_db
PORT=3001
NODE_ENV=production
GOOGLE_API_KEY=your_key (opsiyonel)
GOOGLE_SEARCH_ENGINE_ID=your_id (opsiyonel)
```

### 5. MySQL Database Ekle

1. **New** > **PostgreSQL** (veya MySQL için başka bir servis kullanın)
2. Veya harici MySQL servisi kullanın (PlanetScale, AWS RDS, vb.)
3. Connection string'i environment variable olarak ekleyin

**Not:** Render'da MySQL yok, PostgreSQL var. Eğer MySQL kullanmak istiyorsanız:
- PlanetScale (ücretsiz MySQL)
- AWS RDS
- DigitalOcean Managed Database
- Veya başka bir MySQL hosting

### 6. Custom Domain (Opsiyonel)

1. **Settings** > **Custom Domains**
2. Domain'inizi ekleyin
3. DNS ayarlarını yapın

## 📝 Notlar

- Render otomatik HTTPS sağlar
- Free tier'da uyku modu var (15 dakika kullanılmazsa)
- Tüm API endpoint'leri çalışır
- Frontend build dosyaları `dist/` klasöründe

## 🔄 Güncelleme

GitHub'a push yaptığınızda Render otomatik deploy eder!

## 💰 Fiyatlandırma

- **Free Plan**: Sınırlı, uyku modu var
- **Starter Plan**: $7/ay - Uyku modu yok
- **Standard Plan**: $25/ay - Daha fazla kaynak

## 🐛 Sorun Giderme

### Build hatası
- Render logs'u kontrol edin
- `package.json`'da `start` script'inin olduğundan emin olun

### Uyku modu (Free tier)
- İlk istek 30-60 saniye sürebilir
- Starter plan ile uyku modu yok

