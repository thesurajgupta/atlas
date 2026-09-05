ATLAS Synthetic Dataset
========================
Purpose: synthetic, non-production data for the ATLAS cybercrime predictive intelligence demo.

Seed: 26184
Records:
- complaints: 10,000
- transactions: 50,000
- entities: 12,000
- endpoints: 1,500
- predictions: 50,000
- alerts: 10,000
- interventions_feedback: 10,000
- jurisdictions: 37
- grouping_proposals: 500

Important:
- No real PII or financial credentials are included.
- ground_truth_hidden.csv is the evaluation-only truth table and MUST NOT be supplied to the prediction feature pipeline before prediction time.
- IDs are synthetic and internally linked.
- This dataset is intended for demonstration/testing and does not represent real-world prevalence.
