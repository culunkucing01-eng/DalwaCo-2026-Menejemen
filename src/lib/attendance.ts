import { collection, addDoc, getDocs, query, where, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db } from './firebase';

const IMGBB_API_KEY = '9fe1da829c9b66b024435b37f98499f2';

export interface AttendanceRecord {
  id?: string;
  userName: string;
  store: string;
  photoUrl: string;
  storagePath: string; // kept for backward compatibility, now stores ImgBB delete URL
  lat: number;
  lng: number;
  timestamp: string;
}

const ATTENDANCE_COLLECTION = 'attendance';

/**
 * Upload selfie to ImgBB and save metadata to Firestore
 */
async function uploadToImgBB(dataUrl: string, fileName: string): Promise<string> {
  // Strip data URL prefix for ImgBB
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('Format gambar tidak valid');

  const formData = new FormData();
  formData.append('key', IMGBB_API_KEY);
  formData.append('image', base64);
  formData.append('name', fileName);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload foto gagal (${res.status})`);
  }

  const json = await res.json();
  if (!json.success || !json.data?.display_url) {
    throw new Error('ImgBB tidak mengembalikan URL gambar');
  }

  return json.data.display_url;
}

export async function uploadAttendancePhoto(
  dataUrl: string,
  userName: string,
  store: string,
  location: { lat: number; lng: number }
): Promise<AttendanceRecord> {
  const now = new Date();
  const fileName = `absensi_${userName.replace(/\s+/g, '_')}_${now.toISOString().replace(/[:.]/g, '-')}`;
  
  const photoUrl = await uploadToImgBB(dataUrl, fileName);

  const record: Omit<AttendanceRecord, 'id'> = {
    userName,
    store,
    photoUrl,
    storagePath: '', // No longer using Firebase Storage
    lat: location.lat,
    lng: location.lng,
    timestamp: now.toISOString(),
  };

  const docRef = await addDoc(collection(db, ATTENDANCE_COLLECTION), record);
  return { ...record, id: docRef.id };
}

/**
 * Get all attendance records older than specified days
 */
export async function getExpiredAttendanceRecords(olderThanDays: number = 30): Promise<AttendanceRecord[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('timestamp', '<', cutoffDate.toISOString()),
    orderBy('timestamp', 'asc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
}

/**
 * Delete attendance record from Firestore (ImgBB images are permanent on free tier)
 */
export async function deleteAttendanceRecord(record: AttendanceRecord): Promise<void> {
  if (record.id) {
    await deleteDoc(doc(db, ATTENDANCE_COLLECTION, record.id));
  }
}

/**
 * Delete multiple attendance records
 */
export async function deleteExpiredAttendanceRecords(records: AttendanceRecord[]): Promise<number> {
  let deleted = 0;
  for (const record of records) {
    await deleteAttendanceRecord(record);
    deleted++;
  }
  return deleted;
}

/**
 * Get all attendance records (for backup/view)
 */
export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
  const q = query(collection(db, ATTENDANCE_COLLECTION), orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
}