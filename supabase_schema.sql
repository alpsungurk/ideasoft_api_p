-- Supabase PostgreSQL Schema
-- Bu dosyayı Supabase SQL Editor'de çalıştırın

-- Proje/Batch Tablosu
CREATE TABLE IF NOT EXISTS import_batches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'PROCESSING',
    total_products INTEGER DEFAULT 0,
    successful_products INTEGER DEFAULT 0,
    failed_products INTEGER DEFAULT 0
);

-- Ürünler Tablosu
CREATE TABLE IF NOT EXISTS imported_products (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER NOT NULL,
    
    -- Excelden Gelen Veriler
    sku VARCHAR(100) NOT NULL,
    manufacturer_code VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    stock_amount INTEGER DEFAULT 0,
    description TEXT,
    image_url TEXT,
    brand VARCHAR(100),
    
    -- Kategori ve Ideasoft Bilgileri
    category_xml_name VARCHAR(255),
    selected_category_id INTEGER,
    ideasoft_category_name VARCHAR(255),
    ideasoft_product_id INTEGER,
    ideasoft_product_variant_id INTEGER,
    
    -- Durum
    status SMALLINT DEFAULT 0,
    transfer_status VARCHAR(20) DEFAULT 'PENDING',
    transfer_error TEXT,
    last_transfer_date TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
);

-- Indexler
CREATE INDEX IF NOT EXISTS idx_sku ON imported_products(sku);
CREATE INDEX IF NOT EXISTS idx_batch ON imported_products(batch_id);

-- updated_at için trigger (PostgreSQL'de ON UPDATE CURRENT_TIMESTAMP yok)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger'ı önce sil, sonra yeniden oluştur
DROP TRIGGER IF EXISTS update_imported_products_updated_at ON imported_products;
CREATE TRIGGER update_imported_products_updated_at BEFORE UPDATE ON imported_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

