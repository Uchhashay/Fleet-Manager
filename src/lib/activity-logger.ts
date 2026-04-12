import { db, auth } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ActivityLog, UserRole } from '../types';

export async function logActivity(
  userName: string,
  userRole: UserRole,
  actionType: ActivityLog['action_type'],
  module: string,
  details: string
) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, 'activity_logs'), {
      user_id: user.uid,
      user_name: userName,
      user_role: userRole,
      action_type: actionType,
      module: module,
      details: details,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}
