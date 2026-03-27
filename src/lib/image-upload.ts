/**
 * Upload product image to ImgBB (free image hosting).
 * Compresses to max ~500KB, converts to base64, sends via REST API.
 */

const IMGBB_API_KEY = '9fe1da829c9b66b024435b37f98499f2';

async function compressImage(file: File, maxSizeKB = 500): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Scale down if too large
        const MAX_DIM = 1200;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas tidak tersedia'));
        ctx.drawImage(img, 0, 0, width, height);

        // Try decreasing quality until under maxSizeKB
        let quality = 0.8;
        let base64 = canvas.toDataURL('image/jpeg', quality);
        while (base64.length > maxSizeKB * 1370 && quality > 0.1) {
          quality -= 0.1;
          base64 = canvas.toDataURL('image/jpeg', quality);
        }

        // Strip data URL prefix for ImgBB
        const raw = base64.split(',')[1];
        resolve(raw);
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadProductImage(file: File, productSku: string): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar (JPG, PNG, WEBP)');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran file maksimal 10MB');
  }

  const base64Image = await compressImage(file);

  const formData = new FormData();
  formData.append('key', IMGBB_API_KEY);
  formData.append('image', base64Image);
  formData.append('name', `${productSku.toLowerCase()}_${Date.now()}`);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Upload gagal (${res.status}): ${errText}`);
  }

  const json = await res.json();

  if (!json.success || !json.data?.display_url) {
    throw new Error('ImgBB tidak mengembalikan URL gambar. Coba lagi.');
  }

  return json.data.display_url;
}
