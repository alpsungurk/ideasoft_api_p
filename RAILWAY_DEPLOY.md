# 🚂 Railway Deployment Guide

Railway, Vercel'e benzer kolay bir deployment platformudur. Ücretsiz tier'da 500 saat/ay kullanım hakkı var.

## 🚀 Hızlı Başlangıç

### 1. Railway Hesabı Oluştur

1. [Railway.app](https://railway.app) adresine gidin
2. "Start a New Project" butonuna tıklayın
3. GitHub hesabınızla giriş yapın

### 2. Projeyi Deploy Et

1. "New Project" > "Deploy from GitHub repo"
2. Repository'nizi seçin (`ideasoft_api_p`)
3. Railway otomatik olarak algılayacak

### 3. Environment Variables Ekle

Railway dashboard'da **Variables** sekmesine gidin ve şunları ekleyin:

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

### 4. Database Ekle (MySQL)

1. Railway dashboard'da **New** > **Database** > **MySQL**
2. Railway otomatik olarak MySQL instance oluşturur
3. Database connection bilgilerini alın
4. Environment variables'a ekleyin

### 5. Build Ayarları

Railway otomatik algılar, ama manuel ayarlamak isterseniz:

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm start
```

**Root Directory:**
```
.
```

### 6. Custom Domain (Opsiyonel)

1. **Settings** > **Networking**
2. "Generate Domain" ile Railway domain'i alın
3. Veya kendi domain'inizi ekleyin

## 📝 Notlar

- Railway otomatik olarak `server.js`'i çalıştırır
- Tüm API endpoint'leri çalışır (Vercel limiti yok!)
- Frontend build dosyaları `dist/` klasöründe
- Railway otomatik HTTPS sağlar

## 🔄 Güncelleme

GitHub'a push yaptığınızda Railway otomatik deploy eder!

## 💰 Fiyatlandırma

- **Hobby Plan**: $5/ay - 500 saat kullanım
- **Developer Plan**: $20/ay - Sınırsız kullanım
- İlk $5 kredi ücretsiz!

## 🐛 Sorun Giderme

### Build hatası
- Railway logs'u kontrol edin
- `package.json`'da `start` script'inin olduğundan emin olun

### Database bağlantı hatası
- Railway MySQL instance'ının çalıştığından emin olun
- Environment variables'ı kontrol edin

