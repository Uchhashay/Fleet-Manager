import { 
  collection, 
  doc, 
  runTransaction, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { PaymentMode, BankAccount, BankTransaction } from '../types';
import { handleFirestoreError, OperationType } from './firebase-utils';

export interface RecordBankTransactionParams {
  date: string;           // YYYY-MM-DD
  type: 'in' | 'out';
  amount: number;
  description: string;
  category: string;
  account_id: string;
  payment_mode: PaymentMode;
  reference_number?: string;
  cheque_number?: string;
  cheque_date?: string;
  linked_id?: string;
  staff_id?: string;
  source_module: string;
  created_by: string;
}

/**
 * Records a bank transaction and updates the account balance atomically.
 */
export async function recordBankTransaction(
  params: RecordBankTransactionParams
): Promise<string> {
  const accountRef = doc(db, 'bank_accounts', params.account_id);
  const txRef = doc(collection(db, 'bank_transactions'));

  try {
    return await runTransaction(db, async (transaction) => {
      const accountDoc = await transaction.get(accountRef);
      if (!accountDoc.exists()) {
        throw new Error(`Bank account with ID ${params.account_id} not found.`);
      }

      const account = accountDoc.data() as BankAccount;
      const newBalance = params.type === 'in'
        ? account.current_balance + params.amount
        : account.current_balance - params.amount;

      // For non-overdraft accounts, warn but still allow (owner decision)
      // For overdraft accounts, allow up to overdraft_limit below zero
      if (params.type === 'out' && account.account_type !== 'Overdraft') {
        if (newBalance < 0) throw new Error(
          `Insufficient balance in ${account.account_name}. Available: ₹${account.current_balance}`
        );
      } else if (params.type === 'out' && account.account_type === 'Overdraft') {
        if (newBalance < -(account.overdraft_limit || 0)) throw new Error(
          `Overdraft limit of ₹${account.overdraft_limit} exceeded for ${account.account_name}`
        );
      }

      // Create the transaction record
      transaction.set(txRef, {
        ...params,
        reconciled: false,
        created_at: serverTimestamp()
      });

      // Update the account balance
      transaction.update(accountRef, { 
        current_balance: newBalance,
        updated_at: serverTimestamp()
      });

      return txRef.id;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'bank_transactions/new');
    throw error;
  }
}

/**
 * Deletes a bank transaction and reverses its impact on the account balance atomically.
 */
export async function reverseBankTransaction(
  bankTransactionId: string
): Promise<void> {
  const txRef = doc(db, 'bank_transactions', bankTransactionId);

  try {
    await runTransaction(db, async (transaction) => {
      const txDoc = await transaction.get(txRef);
      if (!txDoc.exists()) {
        throw new Error(`Bank transaction with ID ${bankTransactionId} not found.`);
      }

      const txData = txDoc.data() as BankTransaction;
      const accountRef = doc(db, 'bank_accounts', txData.account_id);
      const accountDoc = await transaction.get(accountRef);

      if (accountDoc.exists()) {
        const currentBalance = accountDoc.data().current_balance || 0;
        // Reverse the original transaction
        // If it was 'in' (+), we subtract (-)
        // If it was 'out' (-), we add (+)
        const reversedBalance = txData.type === 'in' 
          ? currentBalance - txData.amount 
          : currentBalance + txData.amount;

        transaction.update(accountRef, { 
          current_balance: reversedBalance,
          updated_at: serverTimestamp()
        });
      }

      // Delete the transaction record
      transaction.delete(txRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `bank_transactions/${bankTransactionId}`);
    throw error;
  }
}

/**
 * Fetches all active bank accounts ordered by name.
 */
export async function fetchActiveBankAccounts(): Promise<BankAccount[]> {
  const q = query(
    collection(db, 'bank_accounts'),
    where('is_active', '==', true),
    orderBy('account_name')
  );
  
  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as BankAccount));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bank_accounts');
    throw error;
  }
}
