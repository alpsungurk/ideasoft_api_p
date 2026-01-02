# Supabase Edge Functions Deployment

Bu klasör, tüm database endpoint'lerini Supabase Edge Functions olarak içerir.

## Edge Functions Listesi

1. **db-batches** - Tüm projeleri getir (GET)
2. **db-batch-by-id** - Proje detaylarını getir (GET /:id)
3. **db-create-batch** - Yeni proje oluştur (POST)
4. **db-update-product** - Ürün bilgilerini güncelle (PATCH /:id)
5. **db-update-status** - Ideasoft transfer durumunu güncelle (POST)
6. **db-update-category** - Kategori seçimini güncelle (POST)
7. **db-update-batch-stats** - Batch istatistiklerini güncelle (POST)

## Deployment (Supabase Cloud)

### Önkoşullar

1. **Supabase CLI Kurulumu (Windows için en kolay yöntem: npx)**

Global kurulum yerine `npx` kullanarak CLI'yi çalıştırabilirsiniz (önerilen):

```powershell
# npx ile direkt kullanabilirsiniz, kurulum gerekmez
npx supabase@latest --version
```

**Alternatif kurulum yöntemleri:**
- **Scoop:** `scoop install supabase`
- **Chocolatey:** `choco install supabase`
- **GitHub Releases:** https://github.com/supabase/cli/releases

2. **Supabase Cloud'a Login**

```powershell
# Proje dizininde olduğunuzdan emin olun
cd C:\Users\Alp\Desktop\ideasoft\ideasoft_api_p

# Login olun (tarayıcı açılacak)
npx supabase@latest login
```

3. **Projeyi Link Edin**

Project ref'iniz: `ljxbtkpognfqkdffecje`

```powershell
# Projeyi link edin
npx supabase@latest link --project-ref ljxbtkpognfqkdffecje
```

**Not:** Link işlemi sırasında database password sorulabilir. Supabase Dashboard > Settings > Database'den alabilirsiniz.

### Function'ları Deploy Etme

**ÖNEMLİ:** 
- Komutları proje dizininde (`C:\Users\Alp\Desktop\ideasoft\ideasoft_api_p`) çalıştırın!
- `supabase/functions/` klasöründe tüm function'ların `index.ts` dosyaları olmalı

**Her function'ı ayrı ayrı deploy edin:**

```powershell
# Proje dizinine gidin
cd C:\Users\Alp\Desktop\ideasoft\ideasoft_api_p

# Tüm projeleri getir
npx supabase@latest functions deploy db-batches

# Proje detaylarını getir
npx supabase@latest functions deploy db-batch-by-id

# Yeni proje oluştur
npx supabase@latest functions deploy db-create-batch

# Ürün güncelle
npx supabase@latest functions deploy db-update-product

# Durum güncelle
npx supabase@latest functions deploy db-update-status

# Kategori güncelle
npx supabase@latest functions deploy db-update-category

# Batch istatistiklerini güncelle
npx supabase@latest functions deploy db-update-batch-stats
```

**Tüm function'ları tek seferde deploy etmek için (PowerShell script):**
```powershell
$functions = @(
    "db-batches",
    "db-batch-by-id",
    "db-create-batch",
    "db-update-product",
    "db-update-status",
    "db-update-category",
    "db-update-batch-stats"
)

foreach ($func in $functions) {
    Write-Host "Deploying $func..." -ForegroundColor Cyan
    npx supabase@latest functions deploy $func
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to deploy $func" -ForegroundColor Red
        break
    }
    Write-Host "✓ $func deployed successfully" -ForegroundColor Green
}
```

**Deploy sırasında hata alırsanız:**
- `supabase/functions/[function-name]/index.ts` dosyasının var olduğundan emin olun
- Proje dizininde olduğunuzu kontrol edin (`Get-Location`)
- `npx supabase@latest link --project-ref ljxbtkpognfqkdffecje` ile projeyi tekrar link edin

### Environment Variables (Supabase Cloud)

Supabase Dashboard > Project Settings > Edge Functions > Secrets'den şu environment variable'ları ekleyin:

1. **Supabase Dashboard'a gidin:**
   - https://supabase.com/dashboard/project/ljxbtkpognfqkdffecje
   - Settings > Edge Functions > Secrets

2. **Aşağıdaki secret'ları ekleyin:**

   - **Name:** `SUPABASE_URL`
     **Value:** `https://ljxbtkpognfqkdffecje.supabase.co`

   - **Name:** `SUPABASE_SERVICE_ROLE_KEY`
     **Value:** (Supabase Dashboard > Settings > API > service_role key - gizli tutulmalı!)

   - **Name:** `GOOGLE_API_KEY`
     **Value:** `AIzaSyC741D2YUSfBMZmY_yrurbxeK_LVNc2TlA`

   - **Name:** `GOOGLE_SEARCH_ENGINE_ID`
     **Value:** `b1c94fd7831204066A`

**Not:** Secret'lar eklendikten sonra function'ları yeniden deploy etmeniz gerekebilir.

**Alternatif: CLI ile secret ekleme:**
```powershell
# Secret ekleme
npx supabase@latest secrets set SUPABASE_URL=https://ljxbtkpognfqkdffecje.supabase.co
npx supabase@latest secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
npx supabase@latest secrets set GOOGLE_API_KEY=AIzaSyC741D2YUSfBMZmY_yrurbxeK_LVNc2TlA
npx supabase@latest secrets set GOOGLE_SEARCH_ENGINE_ID=b1c94fd7831204066A

# Secret'ları listeleme
npx supabase@latest secrets list
```

### Test Etme

Deploy edilen function'ları test etmek için:

```powershell
# Production'da test etme (PowerShell ile)
$supabaseUrl = "https://ljxbtkpognfqkdffecje.supabase.co"
$anonKey = "YOUR_ANON_KEY"

# GET isteği
Invoke-RestMethod -Uri "$supabaseUrl/functions/v1/db-batches" `
  -Method GET `
  -Headers @{
    "Authorization" = "Bearer $anonKey"
    "apikey" = $anonKey
  }

# POST isteği örneği
$body = @{
  products = @()
  projectName = "Test Project"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$supabaseUrl/functions/v1/db-create-batch" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer $anonKey"
    "apikey" = $anonKey
    "Content-Type" = "application/json"
  } `
  -Body $body
```

**Not:** `YOUR_ANON_KEY` yerine Supabase Dashboard'dan aldığınız anon key'i kullanın.

## Local Development

Local development için `server.js` kullanılmaya devam eder. Vite proxy ayarları local'de `/api/db/*` isteklerini `server.js`'e yönlendirir.

Production'da ise `databaseService.js` otomatik olarak Supabase Edge Functions URL'lerini kullanır.

## Notlar

- Tüm function'lar CORS headers içerir
- Error handling ve validation'lar server.js'deki ile aynıdır
- Service role key kullanılarak database'e direkt erişim sağlanır
- Frontend'de anon key kullanılır (güvenlik için)

