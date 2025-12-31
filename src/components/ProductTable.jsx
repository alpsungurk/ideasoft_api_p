import { useState, useImperativeHandle, forwardRef } from 'react';
import './ProductTable.css';

// A single row in display mode
const DisplayRow = ({ product, onSelect, isSelected }) => (
    <tr className={isSelected ? 'row-selected' : ''}>
        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={isSelected} onChange={onSelect} /></td>
        <td><strong>{product.name || '-'}</strong></td>
        <td>{product.sku || <span className="missing-field">-</span>}</td>
        <td>{product.categoryName || <span className="missing-field">-</span>}</td>
        <td>{product.price ? `₺${Number(product.price).toFixed(2)}` : <span className="missing-field">-</span>}</td>
        <td>{product.stockAmount ?? <span className="missing-field">0</span>}</td>
        <td>
            <span className={`status-badge ${Number(product.status) === 1 ? 'status-active' : 'status-passive'}`}>
                {Number(product.status) === 1 ? 'Aktif' : 'Pasif'}
            </span>
        </td>
        <td>
            <div className="description-cell">
                {product.description ? (product.description.length > 50 ? product.description.substring(0, 50) + '...' : product.description) : '-'}
            </div>
        </td>
        <td className="image-cell">
            {product.image && (
                <img
                    src={product.image}
                    alt={product.name}
                    className="product-thumbnail"
                    onClick={() => onPreview(product.image)}
                    title="Resmi büyütmek için tıkla"
                    style={{ cursor: 'zoom-in' }}
                />
            )}
        </td>
    </tr>
);

// A single row in editing mode
const EditRow = ({ product, onSave, onCancel, onUpdate, categories, loadingCategories }) => (
    <tr className="editing-row">
        <td></td>
        <td><input type="text" value={product.name || ''} onChange={(e) => onUpdate('name', e.target.value)} className="table-input" /></td>
        <td><input type="text" value={product.sku || ''} onChange={(e) => onUpdate('sku', e.target.value)} className="table-input" /></td>
        <td>
            <select value={product.categoryId || ''} onChange={(e) => onUpdate('categoryId', e.target.value)} className="table-select" disabled={loadingCategories}>
                <option value="">{loadingCategories ? 'Yükleniyor...' : 'Kategori Seç'}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
        </td>
        <td><input type="number" value={product.price || 0} onChange={(e) => onUpdate('price', e.target.value)} className="table-input" /></td>
        <td><input type="number" value={product.stockAmount || 0} onChange={(e) => onUpdate('stockAmount', e.target.value)} className="table-input" /></td>
        <td>
            {product.status === 1 ? 'Aktif' : 'Pasif'}
        </td>
        <td><textarea value={product.description || ''} onChange={(e) => onUpdate('description', e.target.value)} className="table-input table-textarea" placeholder="Açıklama" /></td>
        <td><input type="text" value={product.image || ''} onChange={(e) => onUpdate('image', e.target.value)} className="table-input" placeholder="Resim URL" /></td>
    </tr>
);

const ProductTable = forwardRef(({ products, onProductUpdate, onProductDelete, selectedProducts, onSelectProduct, onSelectAll, categories, loadingCategories, editAll }, ref) => {
    const [editingIndex, setEditingIndex] = useState(null);
    const [editedProduct, setEditedProduct] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);

    useImperativeHandle(ref, () => ({
        saveCurrent: () => {
            if (editingIndex !== null && editedProduct) {
                onProductUpdate(editingIndex, editedProduct);
                setEditingIndex(null);
                setEditedProduct(null);
                return true;
            }
            return false;
        },
        startEdit: (index) => {
            setEditingIndex(index);
            setEditedProduct(products[index]);
        },
        cancelEdit: () => {
            setEditingIndex(null);
            setEditedProduct(null);
        }
    }));

    const handleUpdateField = (index, field, value) => {
        if (editAll) {
            const updated = { ...products[index], [field]: value };
            if (field === 'categoryId') {
                const cat = categories.find(c => c.id === parseInt(value));
                updated.categoryName = cat?.name || '';
                updated.categoryId = value ? parseInt(value) : null;
            }
            onProductUpdate(index, updated);
            return;
        }

        let processedValue = value;
        if (field === 'categoryId') {
            processedValue = value ? parseInt(value) : null;
            const category = categories.find(c => c.id === processedValue);
            setEditedProduct(p => ({ ...p, [field]: processedValue, categoryName: category?.name || '' }));
            return;
        }
        setEditedProduct(p => ({ ...p, [field]: processedValue }));
    };

    if (products.length === 0) {
        return <div className="no-products">Henüz ürün bulunmuyor.</div>;
    }

    return (
        <div className="table-wrapper">
            <table className="product-table">
                <thead>
                    <tr>
                        <th style={{ width: '50px', textAlign: 'center' }}>
                            <input
                                type="checkbox"
                                checked={selectedProducts.length === products.length && products.length > 0}
                                onChange={(e) => onSelectAll(e.target.checked)}
                            />
                        </th>
                        <th style={{ width: '350px' }}>Ürün Adı</th>
                        <th style={{ width: '180px' }}>SKU</th>
                        <th style={{ width: '250px' }}>Kategori</th>
                        <th style={{ width: '120px' }}>Fiyat</th>
                        <th style={{ width: '100px' }}>Stok</th>
                        <th style={{ width: '130px' }}>Durum</th>
                        <th style={{ width: '300px' }}>Açıklama</th>
                        <th style={{ width: '220px' }}>Resim</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((product, index) => (
                        (editAll || editingIndex === index)
                            ? <EditRow
                                key={index}
                                product={editAll ? product : editedProduct}
                                onUpdate={(field, value) => handleUpdateField(index, field, value)}
                                categories={categories}
                                loadingCategories={loadingCategories}
                            />
                            : <DisplayRow
                                key={index}
                                product={product}
                                onSelect={() => onSelectProduct(index)}
                                isSelected={selectedProducts.includes(index)}
                                onPreview={setPreviewImage}
                            />
                    ))}
                </tbody>
            </table>

            {/* Image Preview Modal */}
            {previewImage && (
                <div className="image-preview-overlay" onClick={() => setPreviewImage(null)}>
                    <div className="image-preview-content">
                        <img src={previewImage} alt="Önizleme" />
                        <button className="preview-close">✕</button>
                    </div>
                </div>
            )}
        </div>
    );
});

ProductTable.displayName = 'ProductTable';

export default ProductTable;

