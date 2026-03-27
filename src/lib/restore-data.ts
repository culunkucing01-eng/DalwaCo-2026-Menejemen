import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Restore data from a backup JSON object into Firestore.
 * Each document is written using setDoc with its original ID (merge mode),
 * so existing documents with the same ID are updated, new ones are created.
 */
export const restoreFromBackup = async (
  data: Record<string, any[]>
): Promise<{ totalDocs: number; collections: string[] }> => {
  let totalDocs = 0;
  const collections: string[] = [];

  for (const [colName, docs] of Object.entries(data)) {
    if (!Array.isArray(docs) || docs.length === 0) continue;
    collections.push(colName);

    for (const docData of docs) {
      const { id, ...fields } = docData;
      if (!id) continue;
      try {
        await setDoc(doc(collection(db, colName), id), fields, { merge: true });
        totalDocs++;
      } catch (error) {
        console.error(`Restore error [${colName}/${id}]:`, error);
      }
    }
  }

  return { totalDocs, collections };
};
