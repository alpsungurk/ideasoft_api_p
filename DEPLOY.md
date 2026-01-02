# 🚀 Production Deployment Guide

Bu rehber, projeyi kendi web sunucunuzda (VPS, AWS EC2, DigitalOcean, vb.) çalıştırmak için adımları içerir.

## 📋 Gereksinimler

- Node.js 18+ 
- MySQL/MariaDB
- PM2 (process manager)
- Nginx (reverse proxy için, opsiyonel)

## 🔧 Kurulum Adımları

### 1. Sunucuya Bağlanın

```bash
ssh user@your-server-ip
```

### 2. Node.js Kurulumu

```bash
# Node.js 18+ kurulumu (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Versiyon kontrolü
node --version
npm --version
```

### 3. MySQL Kurulumu

```bash
sudo apt update
sudo apt install mysql-server
sudo mysql_secure_installation

# MySQL'e bağlanın ve veritabanı oluşturun
sudo mysql -u root -p
```

MySQL içinde:
```sql
CREATE DATABASE ideasoft_api_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ideasoft_user'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON ideasoft_api_db.* TO 'ideasoft_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. Projeyi Klonlayın

```bash
cd /var/www
sudo git clone https://github.com/alpsungurk/ideasoft_api_p.git
cd ideasoft_api_p
sudo chown -R $USER:$USER /var/www/ideasoft_api_p
```

### 5. Bağımlılıkları Kurun

```bash
npm install
```

### 6. Environment Variables (.env dosyası)

```bash
cp .env.example .env
nano .env
```

`.env` dosyasına şunları ekleyin:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=ideasoft_user
DB_PASSWORD=your_strong_password
DB_NAME=ideasoft_api_db

# Server
PORT=3001
NODE_ENV=production

# Google API (Opsiyonel - scraping için)
GOOGLE_API_KEY=your_google_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id

# Vite Frontend (Opsiyonel)
VITE_GOOGLE_API_KEY=your_google_api_key
VITE_GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id
```

### 7. Frontend Build

```bash
npm run build
```

### 8. PM2 Kurulumu ve Başlatma

```bash
# PM2'yi global olarak kurun
sudo npm install -g pm2

# Log klasörü oluşturun
mkdir -p logs

# PM2 ile başlatın
pm2 start ecosystem.config.js

# PM2'yi sistem başlangıcında otomatik başlatmak için
pm2 startup
pm2 save
```

PM2 komutları:
```bash
pm2 status          # Durumu kontrol et
pm2 logs            # Logları görüntüle
pm2 restart all     # Tüm uygulamaları yeniden başlat
pm2 stop all        # Tüm uygulamaları durdur
```

### 9. Nginx Kurulumu (Opsiyonel ama önerilir)

```bash
sudo apt install nginx

# Nginx config dosyasını kopyalayın
sudo cp nginx.conf.example /etc/nginx/sites-available/ideasoft-api

# Domain adınızı düzenleyin
sudo nano /etc/nginx/sites-available/ideasoft-api

# Symlink oluşturun
sudo ln -s /etc/nginx/sites-available/ideasoft-api /etc/nginx/sites-enabled/

# Nginx config'i test edin
sudo nginx -t

# Nginx'i yeniden başlatın
sudo systemctl restart nginx
```

### 10. Firewall Ayarları

```bash
# UFW firewall (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 11. SSL Sertifikası (Let's Encrypt - Opsiyonel)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 🔍 Kontrol ve Test

### Backend Kontrolü

```bash
# PM2 durumu
pm2 status

# Logları kontrol et
pm2 logs ideasoft-api

# API'yi test et
curl http://localhost:3001/api/health
```

### Frontend Kontrolü

Tarayıcıda `http://your-domain.com` veya `http://your-server-ip` adresine gidin.

## 🔄 Güncelleme

```bash
cd /var/www/ideasoft_api_p
git pull origin main
npm install
npm run build
pm2 restart all
```

## 📊 Monitoring

PM2 monitoring:
```bash
pm2 monit
```

## 🐛 Sorun Giderme

### Port zaten kullanılıyor
```bash
sudo lsof -i :3001
# Process'i bulup kill edin veya PORT'u değiştirin
```

### MySQL bağlantı hatası
- MySQL servisinin çalıştığından emin olun: `sudo systemctl status mysql`
- Firewall'da MySQL portunu açın (3306)
- `.env` dosyasındaki bilgileri kontrol edin

### Nginx 502 Bad Gateway
- Backend'in çalıştığından emin olun: `pm2 status`
- Nginx config'ini kontrol edin: `sudo nginx -t`
- Nginx error loglarını kontrol edin: `sudo tail -f /var/log/nginx/error.log`

## 📝 Notlar

- `server.js` tüm API endpoint'lerini içerir, Vercel serverless fonksiyon limiti yok
- Frontend build dosyaları `dist/` klasöründe
- PM2 uygulamayı otomatik olarak yeniden başlatır (crash durumunda)
- Nginx reverse proxy olarak çalışır ve SSL desteği sağlar

