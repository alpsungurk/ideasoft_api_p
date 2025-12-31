-- Tabloları temizle (Geliştirme aşamasında olduğumuz için baştan oluşturuyoruz)
DROP TABLE IF EXISTS imported_products;
DROP TABLE IF EXISTS import_batches;

-- Proje/Batch Tablosu (Her gönderim işlemi bir proje olarak tutulur)
CREATE TABLE import_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL COMMENT 'Proje İsmi (örn: Casper)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'PROCESSING' COMMENT 'PROCESSING, COMPLETED',
    total_products INT DEFAULT 0,
    successful_products INT DEFAULT 0,
    failed_products INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ürünler Tablosu (Batch ID ile ilişkilendirilmiş)
CREATE TABLE imported_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT NOT NULL,
    
    /* Excelden Gelen Veriler */
    sku VARCHAR(100) NOT NULL,
    manufacturer_code VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    stock_amount INT DEFAULT 0,
    description TEXT,
    image_url TEXT,
    brand VARCHAR(100),
    
    /* Kategori ve Ideasoft Bilgileri */
    category_xml_name VARCHAR(255),
    selected_category_id INT,
    ideasoft_category_name VARCHAR(255),
    ideasoft_product_id INT,
    ideasoft_product_variant_id INT,
    
    /* Durum */
    status TINYINT DEFAULT 0,
    transfer_status CHAR(20) DEFAULT 'PENDING',
    transfer_error TEXT,
    last_transfer_date TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
    INDEX idx_sku (sku),
    INDEX idx_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
