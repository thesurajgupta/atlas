import type { FraudTypology } from '@/lib/api';

import type { ComplaintType } from './types';

/**
 * NCRP's categories, mapped onto the typology vocabulary the API accepts.
 *
 * The two taxonomies are not the same shape and should not be forced to be.
 * NCRP's top-level "Online Financial Fraud" is a *category heading* covering
 * several ATLAS typologies, so it lands on `OTHER` rather than being nudged
 * into whichever specific one looks closest — a wrong specific label on a
 * complaint is worse than an honest generic one, because everything downstream
 * treats a typology as a stated fact about the offence.
 *
 * The portal keeps showing the citizen the category they picked. Only the value
 * sent to the API is translated, and the complaint reference is what ties the
 * two records together.
 */
const BY_COMPLAINT_TYPE: Record<ComplaintType, FraudTypology> = {
  'Online Financial Fraud': 'OTHER',
  'Digital Arrest / Impersonation of Authority': 'DIGITAL_ARREST',
  'Investment / Trading Scam': 'INVESTMENT_SCAM',
  'UPI Collect Request Fraud': 'UPI_COLLECT_FRAUD',
  'Customer Care Number Fraud': 'CUSTOMER_CARE_IMPERSONATION',
  'Loan App Harassment': 'LOAN_APP_EXTORTION',
  'Job / Task-based Fraud': 'JOB_TASK_FRAUD',
  'Other Cyber Crime': 'OTHER',
};

export function apiTypologyFor(complaintType: ComplaintType): FraudTypology {
  return BY_COMPLAINT_TYPE[complaintType];
}
